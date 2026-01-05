use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use libp2p::gossipsub::{
    Behaviour as Gossipsub, Config as GossipsubConfig, Event as GossipsubEvent,
    IdentTopic as Topic, MessageAuthenticity,
};
use libp2p::kad::{
    store::MemoryStore, Behaviour as KadBehaviour, Event as KadEvent, GetRecordOk, QueryResult,
};
use libp2p::mdns::tokio::Behaviour as Mdns;
use libp2p::mdns::Event as MdnsEvent;
use libp2p::swarm::NetworkBehaviour;
use libp2p::{identity, PeerId};

use tokio::sync::RwLock;

use crate::state::PeersMap;

#[derive(NetworkBehaviour)]
#[behaviour(to_swarm = "MyBehaviourEvent")]
pub struct Behaviour {
    pub gossipsub: Gossipsub,
    pub mdns: Mdns,
    pub kad: KadBehaviour<MemoryStore>,
}

#[derive(Debug)]
pub enum MyBehaviourEvent {
    Gossipsub(GossipsubEvent),
    Mdns(MdnsEvent),
    Kademlia(KadEvent),
}

impl From<GossipsubEvent> for MyBehaviourEvent {
    fn from(e: GossipsubEvent) -> Self {
        MyBehaviourEvent::Gossipsub(e)
    }
}

impl From<MdnsEvent> for MyBehaviourEvent {
    fn from(e: MdnsEvent) -> Self {
        MyBehaviourEvent::Mdns(e)
    }
}

impl From<KadEvent> for MyBehaviourEvent {
    fn from(e: KadEvent) -> Self {
        MyBehaviourEvent::Kademlia(e)
    }
}

pub fn build_behaviour(keypair: &identity::Keypair, topic: Topic) -> Behaviour {
    let pid = PeerId::from(keypair.public());
    let gossipsub_config = GossipsubConfig::default();
    let mut gossipsub: Gossipsub = Gossipsub::new(
        MessageAuthenticity::Signed(keypair.clone()),
        gossipsub_config,
    )
    .expect("gossipsub");
    gossipsub.subscribe(&topic).ok();
    let mdns = Mdns::new(Default::default(), pid.clone()).expect("mdns");
    let store = MemoryStore::new(pid.clone());
    let kademlia = KadBehaviour::new(pid.clone(), store);
    Behaviour {
        gossipsub,
        mdns,
        kad: kademlia,
    }
}

/// Prepare heartbeat payload and DHT key bytes.
pub fn make_heartbeat_payload(local_peer_id: &PeerId) -> (Vec<u8>, Vec<u8>, u64) {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let hb = crate::state::Heartbeat {
        peer: local_peer_id.to_string(),
        ts,
    };
    let data = serde_json::to_vec(&hb).unwrap_or_default();
    let key_bytes = format!("peer:{}", local_peer_id).into_bytes();
    (data, key_bytes, ts)
}

/// Handle Kademlia events relevant to get_record and merge into the shared peers map.
pub async fn handle_kad_event(ev: KadEvent, peers: Arc<RwLock<PeersMap>>) {
    match ev {
        KadEvent::OutboundQueryProgressed { result, .. } => {
            match result {
                QueryResult::GetRecord(Ok(GetRecordOk::FoundRecord(peer_rec))) => {
                    let rec = peer_rec.record;
                    if let Ok(s) = String::from_utf8(rec.value.clone()) {
                        if let Ok(ts) = s.parse::<u64>() {
                            let key_bytes = rec.key.to_vec();
                            // key format is "peer:<peerid>"
                            if let Some(rest) = key_bytes.split(|b| *b == b':').nth(1) {
                                if let Ok(peer_str) = String::from_utf8(rest.to_vec()) {
                                    let peer_key = peer_str.clone();
                                    let mut p = peers.write().await;
                                    let entry = p.entry(peer_key.clone()).or_insert(0);
                                    if ts > *entry {
                                        *entry = ts;
                                        log::info!("kademlia: merged peer, peer={} ts={} peers_count={}", peer_key, ts, p.len());
                                    }
                                }
                            }
                        }
                    }
                }
                QueryResult::GetRecord(Ok(other)) => {
                    log::debug!("kademlia: get_record ok (no records or unexpected): {:?}", other);
                }
                QueryResult::GetRecord(Err(e)) => {
                    log::debug!("kademlia: get_record error: {:?}", e);
                }
                other => {
                    log::debug!("kademlia: outbound query progressed (other): {:?}", other);
                }
            }
        }
        other => {
            log::debug!("Kademlia event (other): {:?}", other);
        }
    }
}
