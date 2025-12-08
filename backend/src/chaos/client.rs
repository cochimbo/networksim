//! Chaos Mesh Kubernetes client
//!
//! Handles creating, listing, and deleting NetworkChaos CRDs

use kube::{
    api::{Api, DeleteParams, DynamicObject, ListParams, PostParams},
    discovery::ApiResource,
    Client,
};
use serde_json::Value;
use tracing::{error, info, warn};

use super::conditions::create_network_chaos;
use super::types::*;
use crate::error::{AppError, AppResult};

/// Chaos Mesh API client wrapper
#[derive(Clone)]
pub struct ChaosClient {
    client: Client,
    namespace: String,
}

impl ChaosClient {
    /// Create a new ChaosClient
    pub async fn new(namespace: &str) -> AppResult<Self> {
        let client = Client::try_default()
            .await
            .map_err(|e| AppError::internal(&format!("Failed to create K8s client: {}", e)))?;

        Ok(Self {
            client,
            namespace: namespace.to_string(),
        })
    }

    /// Create a NetworkChaos resource
    #[allow(clippy::too_many_arguments)]
    pub async fn create_chaos(
        &self,
        topology_id: &str,
        condition_id: &str,
        source_node_id: &str,
        target_node_id: Option<&str>,
        chaos_type: &ChaosType,
        direction: &ChaosDirection,
        duration: Option<&str>,
        params: &serde_json::Value,
    ) -> AppResult<String> {
        // Build the name for the chaos resource
        let short_topo = &topology_id[..8.min(topology_id.len())];
        let name = format!("ns-{}-{}", short_topo, condition_id);

        info!(
            "Creating NetworkChaos '{}' for topology {} (type={:?})",
            name, topology_id, chaos_type
        );

        // Create the NetworkChaos manifest
        let chaos_manifest = create_network_chaos(
            &name,
            &self.namespace,
            topology_id,
            source_node_id,
            target_node_id,
            chaos_type,
            direction,
            duration,
            params,
        );

        // Define the NetworkChaos API resource
        let ar = ApiResource {
            group: "chaos-mesh.org".to_string(),
            version: "v1alpha1".to_string(),
            api_version: "chaos-mesh.org/v1alpha1".to_string(),
            kind: "NetworkChaos".to_string(),
            plural: "networkchaos".to_string(),
        };

        let api: Api<DynamicObject> =
            Api::namespaced_with(self.client.clone(), &self.namespace, &ar);

        // Convert to DynamicObject
        let obj: DynamicObject = serde_json::from_value(chaos_manifest)
            .map_err(|e| AppError::internal(&format!("Failed to create chaos object: {}", e)))?;

        // Create the resource
        match api.create(&PostParams::default(), &obj).await {
            Ok(created) => {
                let created_name = created.metadata.name.unwrap_or_default();
                info!("Created NetworkChaos: {}", created_name);
                Ok(created_name)
            }
            Err(e) => {
                error!("Failed to create NetworkChaos: {}", e);
                Err(AppError::internal(&format!(
                    "Failed to create chaos: {}",
                    e
                )))
            }
        }
    }

    /// Delete a NetworkChaos resource by condition ID
    pub async fn delete_chaos(&self, topology_id: &str, condition_id: &str) -> AppResult<()> {
        let short_topo = &topology_id[..8.min(topology_id.len())];
        let name = format!("ns-{}-{}", short_topo, condition_id);

        info!("Deleting NetworkChaos '{}'", name);

        let ar = ApiResource {
            group: "chaos-mesh.org".to_string(),
            version: "v1alpha1".to_string(),
            api_version: "chaos-mesh.org/v1alpha1".to_string(),
            kind: "NetworkChaos".to_string(),
            plural: "networkchaos".to_string(),
        };

        let api: Api<DynamicObject> =
            Api::namespaced_with(self.client.clone(), &self.namespace, &ar);

        match api.delete(&name, &DeleteParams::default()).await {
            Ok(_) => {
                info!("Deleted NetworkChaos: {}", name);
                Ok(())
            }
            Err(kube::Error::Api(ae)) if ae.code == 404 => {
                warn!("NetworkChaos '{}' not found (already deleted?)", name);
                Ok(())
            }
            Err(e) => {
                error!("Failed to delete NetworkChaos: {}", e);
                Err(AppError::internal(&format!(
                    "Failed to delete chaos: {}",
                    e
                )))
            }
        }
    }

    /// List all NetworkChaos resources for a topology
    pub async fn list_chaos(&self, topology_id: &str) -> AppResult<Vec<ChaosStatus>> {
        info!("Listing NetworkChaos for topology {}", topology_id);

        let ar = ApiResource {
            group: "chaos-mesh.org".to_string(),
            version: "v1alpha1".to_string(),
            api_version: "chaos-mesh.org/v1alpha1".to_string(),
            kind: "NetworkChaos".to_string(),
            plural: "networkchaos".to_string(),
        };

        let api: Api<DynamicObject> =
            Api::namespaced_with(self.client.clone(), &self.namespace, &ar);

        let label_selector = format!("networksim.io/topology={}", topology_id);
        let lp = ListParams::default().labels(&label_selector);

        match api.list(&lp).await {
            Ok(list) => {
                let statuses: Vec<ChaosStatus> = list
                    .items
                    .into_iter()
                    .map(|obj| {
                        let name = obj.metadata.name.unwrap_or_default();
                        let data = obj.data;

                        // Extract condition from spec
                        let spec = data.get("spec").cloned().unwrap_or(Value::Null);
                        let status_obj = data.get("status").cloned().unwrap_or(Value::Null);

                        // Determine chaos type from action
                        let action = spec
                            .get("action")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown");

                        let chaos_type = match action {
                            "delay" => ChaosType::Delay,
                            "loss" => ChaosType::Loss,
                            "bandwidth" => ChaosType::Bandwidth,
                            "corrupt" => ChaosType::Corrupt,
                            "duplicate" => ChaosType::Duplicate,
                            "partition" => ChaosType::Partition,
                            _ => ChaosType::Delay, // fallback
                        };

                        // Check if it's running
                        let conditions = status_obj
                            .get("conditions")
                            .and_then(|c| c.as_array())
                            .cloned()
                            .unwrap_or_default();

                        let is_running = conditions.iter().any(|c| {
                            c.get("type").and_then(|t| t.as_str()) == Some("AllInjected")
                                && c.get("status").and_then(|s| s.as_str()) == Some("True")
                        });

                        let phase = if is_running { "Running" } else { "Pending" };

                        ChaosStatus {
                            name: name.clone(),
                            condition_id: name.split('-').next_back().unwrap_or(&name).to_string(),
                            chaos_type,
                            phase: phase.to_string(),
                            target_pods: extract_target_pods(&spec),
                            message: extract_message(&status_obj),
                        }
                    })
                    .collect();

                Ok(statuses)
            }
            Err(e) => {
                error!("Failed to list NetworkChaos: {}", e);
                Err(AppError::internal(&format!("Failed to list chaos: {}", e)))
            }
        }
    }

    /// Delete all chaos resources for a topology
    pub async fn cleanup_topology(&self, topology_id: &str) -> AppResult<()> {
        info!("Cleaning up all chaos for topology {}", topology_id);

        let statuses = self.list_chaos(topology_id).await?;

        for status in statuses {
            if let Err(e) = self.delete_chaos(topology_id, &status.condition_id).await {
                warn!("Failed to delete chaos {}: {}", status.name, e);
            }
        }

        Ok(())
    }
}

/// Extract target pod names from spec
fn extract_target_pods(spec: &Value) -> Vec<String> {
    let mut pods = Vec::new();

    if let Some(selector) = spec.get("selector") {
        if let Some(labels) = selector.get("labelSelectors") {
            if let Some(node) = labels.get("networksim.io/node").and_then(|v| v.as_str()) {
                pods.push(node.to_string());
            }
        }
    }

    if let Some(target) = spec.get("target") {
        if let Some(labels) = target.get("labelSelectors") {
            if let Some(node) = labels.get("networksim.io/node").and_then(|v| v.as_str()) {
                pods.push(node.to_string());
            }
        }
    }

    pods
}

/// Extract status message
fn extract_message(status: &Value) -> Option<String> {
    status
        .get("conditions")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.as_str())
        .map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_target_pods() {
        let spec = serde_json::json!({
            "selector": {
                "labelSelectors": {
                    "networksim.io/node": "source-node"
                }
            },
            "target": {
                "labelSelectors": {
                    "networksim.io/node": "target-node"
                }
            }
        });

        let pods = extract_target_pods(&spec);
        assert_eq!(pods, vec!["source-node", "target-node"]);
    }
}
