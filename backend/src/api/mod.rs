pub mod health;
pub mod topologies;
pub mod deploy;
pub mod chaos;
pub mod ws;
pub mod metrics;

#[allow(unused_imports)]
use std::sync::Arc;
use tokio::sync::broadcast;
use crate::config::Config;
use crate::db::Database;

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub config: Config,
    pub event_tx: broadcast::Sender<Event>,
}

impl AppState {
    pub fn new(db: Database, config: Config) -> Self {
        let (event_tx, _) = broadcast::channel(100);
        Self { db, config, event_tx }
    }
}

/// Events broadcasted via WebSocket
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", content = "data")]
pub enum Event {
    #[serde(rename = "topology:created")]
    TopologyCreated { id: String },
    #[serde(rename = "topology:updated")]
    TopologyUpdated { id: String },
    #[serde(rename = "topology:deleted")]
    TopologyDeleted { id: String },
    #[serde(rename = "deployment:status")]
    DeploymentStatus { topology_id: String, status: String },
    #[serde(rename = "node:status")]
    NodeStatus { node_id: String, status: String },
    #[serde(rename = "chaos:applied")]
    ChaosApplied { id: String, target: String },
    #[serde(rename = "chaos:removed")]
    ChaosRemoved { id: String },
}
