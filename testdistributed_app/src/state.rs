use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Heartbeat {
    pub peer: String,
    pub ts: u64,
}

pub type PeersMap = HashMap<String, u64>; // peer id -> last_seen epoch seconds (LWW by timestamp)
