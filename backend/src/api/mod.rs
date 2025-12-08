pub mod chaos;
pub mod deploy;
pub mod diagnostic;
pub mod health;
pub mod metrics;
pub mod topologies;
pub mod ws;

use crate::config::Config;
use crate::db::Database;
use crate::k8s::K8sClient;
#[allow(unused_imports)]
use std::sync::Arc;
use tokio::sync::broadcast;

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    #[allow(dead_code)]
    pub config: Config,
    pub event_tx: broadcast::Sender<Event>,
    pub k8s: Option<K8sClient>,
}

impl AppState {
    pub fn new(db: Database, config: Config) -> Self {
        let (event_tx, _) = broadcast::channel(100);
        Self {
            db,
            config,
            event_tx,
            k8s: None,
        }
    }

    pub fn with_k8s(mut self, k8s: K8sClient) -> Self {
        self.k8s = Some(k8s);
        self
    }
}

/// Events broadcasted via WebSocket
#[allow(dead_code)]
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
    #[serde(rename = "chaos:updated")]
    ChaosUpdated { id: String },
}
