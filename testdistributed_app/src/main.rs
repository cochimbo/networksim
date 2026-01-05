use std::env;
use std::error::Error;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use futures::prelude::*;
use libp2p::swarm::SwarmEvent;
use libp2p::{identity, PeerId, SwarmBuilder};
use std::collections::HashMap;

use tokio::sync::RwLock;
use tokio::time::interval;

use std::sync::Arc;

mod behaviour;
mod http;
mod state;

use crate::behaviour::{build_behaviour, handle_kad_event};
use crate::state::{Heartbeat, PeersMap};
use libp2p::gossipsub::IdentTopic as Topic;
use libp2p::kad::record::{Key, Record};
use libp2p::kad::Quorum;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    env_logger::init();

    let interval_seconds: u64 = env::var("INTERVAL_SECONDS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(10);
    let anti_entropy_seconds: u64 = env::var("ANTI_ENTROPY_SECONDS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(30);
    let _bootstrap = env::var("BOOTSTRAP_PEERS").unwrap_or_default(); // kept for future

    // identity
    let local_key = identity::Keypair::generate_ed25519();
    let local_peer_id = PeerId::from(local_key.public());
    log::info!("Local peer id: {}", local_peer_id);

    // behaviour/topic prepared for builder closure (configurable via TOPIC env)
    let topic_name = env::var("TOPIC").unwrap_or_else(|_| "testdistributed/peers".to_string());
    let topic = Topic::new(topic_name.clone());

    log::info!("Using gossipsub topic: {}", topic_name);

    // Build Swarm using SwarmBuilder (Tokio + TCP + Noise + Yamux + DNS)
    let mut swarm = SwarmBuilder::with_existing_identity(local_key.clone())
        .with_tokio()
        .with_tcp(
            libp2p::tcp::Config::default(),
            libp2p::noise::Config::new,
            libp2p::yamux::Config::default,
        )?
        .with_dns()?
        .with_behaviour(|keypair: &identity::Keypair| build_behaviour(keypair, topic.clone()))?
        .build();

    // Listen on port
    swarm.listen_on("/ip4/0.0.0.0/tcp/0".parse()?)?;

    // Shared peers map
    let peers: Arc<RwLock<PeersMap>> = Arc::new(RwLock::new(HashMap::new()));

    // Peer TTL used to consider peers as "lost" when not seen recently.
    let peer_ttl_seconds: u64 = env::var("PEER_TTL_SECONDS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(interval_seconds.saturating_mul(3));

    // Start HTTP server task for inspection
    let http_port: u16 = env::var("HTTP_PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(9090);
    http::spawn_http_server(peers.clone(), http_port);

    // Interval tick for heartbeat
    let mut ticker = interval(Duration::from_secs(interval_seconds));
    // Anti-entropy tick for pulling records from DHT
    let mut anti_ticker = interval(Duration::from_secs(anti_entropy_seconds));

    log::info!("Configured intervals: heartbeat={}s, anti-entropy={}s", interval_seconds, anti_entropy_seconds);

    loop {
        tokio::select! {
            event = swarm.select_next_some() => match event {
                SwarmEvent::Behaviour(ev) => {
                    match ev {
                        behaviour::MyBehaviourEvent::Gossipsub(gs_ev) => {
                            // handle incoming messages
                            if let libp2p::gossipsub::Event::Message { propagation_source: _, message_id: _, message } = gs_ev {
                                if let Ok(hb) = serde_json::from_slice::<Heartbeat>(&message.data) {
                                    let peer_id = hb.peer.clone();
                                    let mut p = peers.write().await;
                                    let prev = p.get(&peer_id).copied();
                                    let is_new = prev.is_none();
                                    let was_updated = prev.map(|prev_ts| hb.ts > prev_ts).unwrap_or(true);
                                    let entry = p.entry(peer_id.clone()).or_insert(0);
                                    if hb.ts > *entry { *entry = hb.ts; }
                                    if is_new {
                                        log::info!("gossipsub: discovered peer={} ts={} peers_count={}", peer_id, hb.ts, p.len());
                                    } else if was_updated {
                                        log::info!("gossipsub: updated peer={} ts={} peers_count={}", peer_id, hb.ts, p.len());
                                    } else {
                                        log::debug!("gossipsub: older heartbeat from {} (ts={} <= existing={})", peer_id, hb.ts, prev.unwrap_or(0));
                                    }
                                }
                            }
                        }
                        behaviour::MyBehaviourEvent::Mdns(mdns_ev) => {
                            if let libp2p::mdns::Event::Discovered(list) = mdns_ev {
                                for (peer, addr) in list {
                                    let peer_str = peer.to_string();
                                    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
                                    let mut p = peers.write().await;
                                    let is_new = !p.contains_key(&peer_str);
                                    p.insert(peer_str.clone(), ts);
                                    if is_new {
                                        log::info!("mDNS discovered peer: {} addr={} peers_count={}", peer_str, addr, p.len());
                                    } else {
                                        log::debug!("mDNS saw known peer: {} addr={}", peer_str, addr);
                                    }
                                    // Add discovered address to Kademlia so it can route/store records
                                    swarm.behaviour_mut().kad.add_address(&peer, addr.clone());
                                }
                            }
                        }
                        behaviour::MyBehaviourEvent::Kademlia(kad_ev) => {
                            // delegate Kademlia handling to behaviour module
                            handle_kad_event(kad_ev, peers.clone()).await;
                        }
                    }
                }
                SwarmEvent::NewListenAddr { address, .. } => {
                    log::info!("Listening on {}", address);
                }
                _ => {}
            },
            _ = ticker.tick() => {
                // Publish heartbeat
                let (data, key_bytes, ts) = behaviour::make_heartbeat_payload(swarm.local_peer_id());
                // publish and put record BEFORE awaiting on peers lock to avoid holding a mutable behaviour borrow across await
                let _ = swarm.behaviour_mut().gossipsub.publish(topic.clone(), data.clone());
                let record_key = Key::new(&key_bytes);
                let record = Record::new(record_key.clone(), ts.to_string().into_bytes());
                let _ = swarm.behaviour_mut().kad.put_record(record, Quorum::One);
                // locally update
                {
                    let mut p = peers.write().await;
                    p.insert(swarm.local_peer_id().to_string(), ts);
                    log::info!("heartbeat: published ts={} local_peer={} peers_count={}", ts, swarm.local_peer_id(), p.len());
                }
            }
                _ = anti_ticker.tick() => {
                    // Perform anti-entropy: query DHT for known peer records and merge
                    let keys: Vec<Key> = {
                        let p = peers.read().await;
                        p.keys().map(|peer| {
                            Key::new(&format!("peer:{}", peer).into_bytes())
                        }).collect()
                    };
                    for k in keys {
                        let _ = swarm.behaviour_mut().kad.get_record(k);
                    }
                    // Prune stale peers considered "lost"
                    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
                    let mut p = peers.write().await;
                    let before = p.len();
                    let to_remove: Vec<String> = p.iter()
                        .filter(|(_, &ts)| now.saturating_sub(ts) > peer_ttl_seconds)
                        .map(|(k, _)| k.clone())
                        .collect();
                    for k in to_remove.iter() {
                        if let Some(v) = p.remove(k) {
                            log::info!("peer lost: {} last_seen={} peers_count_after={}", k, v, p.len());
                        }
                    }
                    if p.len() != before {
                        log::info!("peers pruned: before={} after={}", before, p.len());
                    }
                }
        }
    }
}
