//! Deployment manager for topology deployments
//!
//! Handles the lifecycle of topology deployments in Kubernetes

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{info, instrument, warn};

use super::client::K8sClient;
use super::resources::{
    create_network_policy, create_pod_spec, create_service, get_connected_nodes,
};
use crate::models::{Node, Topology};

/// Status of a deployed node
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum NodeStatus {
    Pending,
    Running,
    Failed,
    Terminated,
    Unknown,
}

impl From<&str> for NodeStatus {
    fn from(phase: &str) -> Self {
        match phase {
            "Pending" => NodeStatus::Pending,
            "Running" => NodeStatus::Running,
            "Failed" => NodeStatus::Failed,
            "Succeeded" | "Terminated" => NodeStatus::Terminated,
            _ => NodeStatus::Unknown,
        }
    }
}

/// Status of a topology deployment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentStatus {
    pub topology_id: String,
    pub status: DeploymentState,
    pub nodes: HashMap<String, NodeStatusInfo>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub message: Option<String>,
}

/// High-level deployment state
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DeploymentState {
    Pending,
    Deploying,
    Running,
    PartiallyRunning,
    Failed,
    Stopping,
    Stopped,
}

/// Detailed status info for a node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeStatusInfo {
    pub node_id: String,
    // pub name: String, // Eliminado
    pub status: NodeStatus,
    pub pod_name: Option<String>,
    pub pod_ip: Option<String>,
    pub message: Option<String>,
}

/// Manages the deployment of topologies to Kubernetes
pub struct DeploymentManager {
    k8s: K8sClient,
}

impl DeploymentManager {
    /// Create a new deployment manager
    pub fn new(k8s: K8sClient) -> Self {
        Self { k8s }
    }

    /// Deploy a topology to Kubernetes
    #[instrument(skip(self, topology), fields(topology_id = %topology.id))]
    pub async fn deploy(&self, topology: &Topology) -> Result<DeploymentStatus> {
        info!("Starting deployment of topology");

        // Ensure namespace exists
        self.k8s.ensure_namespace().await?;

        // Convert links to tuple format for processing
        let links: Vec<(String, String, String)> = topology
            .links
            .iter()
            .map(|l| (l.id.clone(), l.source.clone(), l.target.clone()))
            .collect();

        let mut node_statuses = HashMap::new();

        // Deploy each node
        for node in &topology.nodes {
            match self.deploy_node(&topology.id, node, &links).await {
                Ok(status) => {
                    node_statuses.insert(node.id.clone(), status);
                }
                Err(e) => {
                    warn!(node_id = %node.id, error = %e, "Failed to deploy node");
                    node_statuses.insert(
                        node.id.clone(),
                        NodeStatusInfo {
                            node_id: node.id.clone(),
                            // name: node.name.clone(), // Eliminado
                            status: NodeStatus::Failed,
                            pod_name: None,
                            pod_ip: None,
                            message: Some(e.to_string()),
                        },
                    );
                }
            }
        }

        // Determine overall status
        let status = self.calculate_deployment_state(&node_statuses);
        let now = Utc::now();

        Ok(DeploymentStatus {
            topology_id: topology.id.clone(),
            status,
            nodes: node_statuses,
            created_at: now,
            updated_at: now,
            message: None,
        })
    }

    /// Deploy a single node
    #[instrument(skip(self, node, links), fields(node_id = %node.id))]
    async fn deploy_node(
        &self,
        topology_id: &str,
        node: &Node,
        links: &[(String, String, String)],
    ) -> Result<NodeStatusInfo> {
        // DNS-safe name: prefix with 'ns-' and use short topology id
        let short_id = &topology_id[..8.min(topology_id.len())];
        let pod_name = format!("ns-{}-{}", short_id, node.id).to_lowercase();

        // Create the pod
        let pod_spec = create_pod_spec(topology_id, node);
        let pod = self
            .k8s
            .create_pod(&pod_spec)
            .await
            .context("Failed to create pod")?;

        // Create a service for the node (ignore if already exists)
        let service_spec = create_service(topology_id, node);
        if let Err(e) = self.k8s.create_service(&service_spec).await {
            // Only log if it's not an "already exists" error
            if !e.to_string().contains("409") && !e.to_string().contains("AlreadyExists") {
                warn!(error = %e, "Failed to create service, continuing anyway");
            }
        }

        // Create network policy based on connected nodes (ignore if already exists)
        let connected = get_connected_nodes(&node.id, links);
        let netpol = create_network_policy(topology_id, node, &connected);
        if let Err(e) = self.k8s.create_network_policy(&netpol).await {
            if !e.to_string().contains("409") && !e.to_string().contains("AlreadyExists") {
                warn!(error = %e, "Failed to create network policy, continuing anyway");
            }
        }

        // Get initial status
        let phase = pod
            .status
            .as_ref()
            .and_then(|s| s.phase.as_ref())
            .map(String::as_str)
            .unwrap_or("Unknown");

        let pod_ip = pod.status.as_ref().and_then(|s| s.pod_ip.clone());

        Ok(NodeStatusInfo {
            node_id: node.id.clone(),
            // name: node.name.clone(), // Eliminado
            status: NodeStatus::from(phase),
            pod_name: Some(pod_name),
            pod_ip,
            message: None,
        })
    }

    /// Get the current status of a deployment
    #[instrument(skip(self))]
    pub async fn get_status(&self, topology_id: &str) -> Result<DeploymentStatus> {
        let label_selector = format!("networksim.io/topology={}", topology_id);
        let pods = self.k8s.list_pods(&label_selector).await?;

        let mut node_statuses = HashMap::new();

        for pod in pods {
            let node_id = pod
                .metadata
                .labels
                .as_ref()
                .and_then(|l| l.get("networksim.io/node"))
                .cloned()
                .unwrap_or_default();

            let _node_name = pod
                .metadata
                .annotations
                .as_ref()
                .and_then(|a| a.get("networksim.io/node-name"))
                .cloned()
                .unwrap_or_else(|| node_id.clone());

            let phase = pod
                .status
                .as_ref()
                .and_then(|s| s.phase.as_ref())
                .map(String::as_str)
                .unwrap_or("Unknown");

            let pod_ip = pod.status.as_ref().and_then(|s| s.pod_ip.clone());

            let pod_name = pod.metadata.name.clone();

            // Check for container status messages
            let message = pod
                .status
                .as_ref()
                .and_then(|s| s.container_statuses.as_ref())
                .and_then(|cs| cs.first())
                .and_then(|c| {
                    c.state
                        .as_ref()
                        .and_then(|s| s.waiting.as_ref())
                        .map(|w| w.reason.clone().unwrap_or_default())
                });

            node_statuses.insert(
                node_id.clone(),
                NodeStatusInfo {
                    node_id,
                    // name: node_name, // Eliminado
                    status: NodeStatus::from(phase),
                    pod_name,
                    pod_ip,
                    message,
                },
            );
        }

        let status = self.calculate_deployment_state(&node_statuses);
        let now = Utc::now();

        Ok(DeploymentStatus {
            topology_id: topology_id.to_string(),
            status,
            nodes: node_statuses,
            created_at: now, // Would be stored in DB
            updated_at: now,
            message: None,
        })
    }

    /// Destroy a deployment
    #[instrument(skip(self))]
    pub async fn destroy(&self, topology_id: &str) -> Result<()> {
        info!("Destroying deployment");
        self.k8s.cleanup_deployment(topology_id).await?;
        info!("Deployment destroyed successfully");
        Ok(())
    }

    /// Calculate overall deployment state from node statuses
    fn calculate_deployment_state(
        &self,
        nodes: &HashMap<String, NodeStatusInfo>,
    ) -> DeploymentState {
        if nodes.is_empty() {
            return DeploymentState::Stopped;
        }

        let running_count = nodes
            .values()
            .filter(|n| n.status == NodeStatus::Running)
            .count();
        let failed_count = nodes
            .values()
            .filter(|n| n.status == NodeStatus::Failed)
            .count();
        let pending_count = nodes
            .values()
            .filter(|n| n.status == NodeStatus::Pending)
            .count();

        if failed_count == nodes.len() {
            DeploymentState::Failed
        } else if running_count == nodes.len() {
            DeploymentState::Running
        } else if running_count > 0 {
            DeploymentState::PartiallyRunning
        } else if pending_count > 0 {
            DeploymentState::Deploying
        } else {
            DeploymentState::Pending
        }
    }
}
