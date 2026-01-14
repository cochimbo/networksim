pub mod applications;
pub mod chaos;
pub mod deploy;
pub mod diagnostic;
pub mod events;
pub mod health;
pub mod live_metrics;
pub mod metrics;
pub mod openapi;
pub mod presets;
pub mod registry;
pub mod reports;
pub mod response;
pub mod templates;
pub mod test_runner;
pub mod topologies;
pub mod ws;

use crate::config::Config;
use crate::db::Database;
use crate::helm::HelmClient;
use crate::k8s::K8sClient;
#[allow(unused_imports)]
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    #[allow(dead_code)]
    pub config: Config,
    pub event_tx: broadcast::Sender<Event>,
    pub k8s: Arc<RwLock<Option<K8sClient>>>,
    pub helm: Option<HelmClient>,
}

impl AppState {
    pub fn new(db: Database, config: Config) -> Self {
        let (event_tx, _) = broadcast::channel(100);
        Self {
            db,
            config,
            event_tx,
            k8s: Arc::new(RwLock::new(None)),
            helm: None,
        }
    }

    pub async fn set_k8s(&self, k8s: K8sClient) {
        let mut guard = self.k8s.write().await;
        *guard = Some(k8s);
    }

    pub fn with_helm(mut self, helm: HelmClient) -> Self {
        self.helm = Some(helm);
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
    #[serde(rename = "test:started")]
    TestStarted { id: String, test_type: String },
    #[serde(rename = "test:completed")]
    TestCompleted { id: String, status: String },
    #[serde(rename = "app:deployed")]
    AppDeployed { topology_id: String, app_id: String, image: String },
    #[serde(rename = "app:uninstalled")]
    AppUninstalled { topology_id: String, app_id: String },
    #[serde(rename = "app:status_changed")]
    AppStatusChanged { topology_id: String, app_id: String, status: String },
}
