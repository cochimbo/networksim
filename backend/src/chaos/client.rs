//! Chaos Mesh Kubernetes client
//!
//! Handles creating, listing, and deleting Chaos Mesh CRDs (NetworkChaos, StressChaos, PodChaos, IOChaos, HTTPChaos)

use kube::{
    api::{Api, DeleteParams, DynamicObject, ListParams, PostParams},
    discovery::ApiResource,
    Client,
};
use serde_json::Value;
use tracing::{error, info, warn};

use super::conditions::create_chaos_manifest;
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

    /// Get the ApiResource for a specific CRD kind
    fn api_resource_for_kind(kind: &ChaosCrdKind) -> ApiResource {
        let (k, p) = match kind {
            ChaosCrdKind::NetworkChaos => ("NetworkChaos", "networkchaos"),
            ChaosCrdKind::StressChaos => ("StressChaos", "stresschaos"),
            ChaosCrdKind::PodChaos => ("PodChaos", "podchaos"),
            ChaosCrdKind::IOChaos => ("IOChaos", "iochaos"),
            ChaosCrdKind::HTTPChaos => ("HTTPChaos", "httpchaos"),
        };
        ApiResource {
            group: "chaos-mesh.org".to_string(),
            version: "v1alpha1".to_string(),
            api_version: "chaos-mesh.org/v1alpha1".to_string(),
            kind: k.to_string(),
            plural: p.to_string(),
        }
    }

    /// Create a chaos resource (supports all CRD types)
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
        let crd_kind = chaos_type.crd_kind();

        info!(
            "Creating {:?} '{}' for topology {} (type={:?})",
            crd_kind, name, topology_id, chaos_type
        );

        // Create the chaos manifest using the dispatcher
        let chaos_manifest = create_chaos_manifest(
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

        // Get the appropriate API resource for this CRD kind
        let ar = Self::api_resource_for_kind(&crd_kind);

        let api: Api<DynamicObject> =
            Api::namespaced_with(self.client.clone(), &self.namespace, &ar);

        // Convert to DynamicObject
        let obj: DynamicObject = serde_json::from_value(chaos_manifest)
            .map_err(|e| AppError::internal(&format!("Failed to create chaos object: {}", e)))?;

        // Create the resource
        match api.create(&PostParams::default(), &obj).await {
            Ok(created) => {
                let created_name = created.metadata.name.unwrap_or_default();
                info!("Created {:?}: {}", crd_kind, created_name);
                Ok(created_name)
            }
            Err(e) => {
                error!("Failed to create {:?}: {}", crd_kind, e);
                Err(AppError::internal(&format!(
                    "Failed to create chaos: {}",
                    e
                )))
            }
        }
    }

    /// Delete a chaos resource by condition ID and type
    pub async fn delete_chaos_typed(
        &self,
        topology_id: &str,
        condition_id: &str,
        chaos_type: &ChaosType,
    ) -> AppResult<()> {
        let short_topo = &topology_id[..8.min(topology_id.len())];
        let name = format!("ns-{}-{}", short_topo, condition_id);
        let crd_kind = chaos_type.crd_kind();

        info!("Deleting {:?} '{}'", crd_kind, name);

        let ar = Self::api_resource_for_kind(&crd_kind);
        let api: Api<DynamicObject> =
            Api::namespaced_with(self.client.clone(), &self.namespace, &ar);

        match api.delete(&name, &DeleteParams::default()).await {
            Ok(_) => {
                info!("Deleted {:?}: {}", crd_kind, name);
                Ok(())
            }
            Err(kube::Error::Api(ae)) if ae.code == 404 => {
                warn!("{:?} '{}' not found (already deleted?)", crd_kind, name);
                Ok(())
            }
            Err(e) => {
                error!("Failed to delete {:?}: {}", crd_kind, e);
                Err(AppError::internal(&format!(
                    "Failed to delete chaos: {}",
                    e
                )))
            }
        }
    }

    /// Delete a chaos resource by condition ID (tries all CRD types)
    pub async fn delete_chaos(&self, topology_id: &str, condition_id: &str) -> AppResult<()> {
        let short_topo = &topology_id[..8.min(topology_id.len())];
        let name = format!("ns-{}-{}", short_topo, condition_id);

        info!("Deleting chaos resource '{}'", name);

        // Try to delete from all CRD types (will succeed on the correct one)
        let crd_kinds = [
            ChaosCrdKind::NetworkChaos,
            ChaosCrdKind::StressChaos,
            ChaosCrdKind::PodChaos,
            ChaosCrdKind::IOChaos,
            ChaosCrdKind::HTTPChaos,
        ];

        let mut deleted = false;
        for crd_kind in &crd_kinds {
            let ar = Self::api_resource_for_kind(crd_kind);
            let api: Api<DynamicObject> =
                Api::namespaced_with(self.client.clone(), &self.namespace, &ar);

            match api.delete(&name, &DeleteParams::default()).await {
                Ok(_) => {
                    info!("Deleted {:?}: {}", crd_kind, name);
                    deleted = true;
                    break;
                }
                Err(kube::Error::Api(ae)) if ae.code == 404 => {
                    // Not found in this CRD type, try next
                    continue;
                }
                Err(e) => {
                    error!("Failed to delete from {:?}: {}", crd_kind, e);
                    // Continue trying other types
                }
            }
        }

        if deleted {
            Ok(())
        } else {
            warn!("Chaos resource '{}' not found in any CRD type", name);
            Ok(()) // Return OK even if not found (idempotent delete)
        }
    }

    /// List all chaos resources for a topology (from all CRD types)
    pub async fn list_chaos(&self, topology_id: &str) -> AppResult<Vec<ChaosStatus>> {
        info!("Listing all chaos resources for topology {}", topology_id);

        let crd_kinds = [
            ChaosCrdKind::NetworkChaos,
            ChaosCrdKind::StressChaos,
            ChaosCrdKind::PodChaos,
            ChaosCrdKind::IOChaos,
            ChaosCrdKind::HTTPChaos,
        ];

        let label_selector = format!("networksim.io/topology={}", topology_id);
        let lp = ListParams::default().labels(&label_selector);

        let mut all_statuses = Vec::new();

        for crd_kind in &crd_kinds {
            let ar = Self::api_resource_for_kind(crd_kind);
            let api: Api<DynamicObject> =
                Api::namespaced_with(self.client.clone(), &self.namespace, &ar);

            match api.list(&lp).await {
                Ok(list) => {
                    let statuses: Vec<ChaosStatus> = list
                        .items
                        .into_iter()
                        .map(|obj| parse_chaos_status(obj, crd_kind))
                        .collect();
                    all_statuses.extend(statuses);
                }
                Err(kube::Error::Api(ae)) if ae.code == 404 => {
                    // CRD not installed, skip
                    warn!("{:?} CRD not found, skipping", crd_kind);
                }
                Err(e) => {
                    warn!("Failed to list {:?}: {}", crd_kind, e);
                    // Continue with other CRD types
                }
            }
        }

        Ok(all_statuses)
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

/// Parse a DynamicObject into a ChaosStatus
fn parse_chaos_status(obj: DynamicObject, crd_kind: &ChaosCrdKind) -> ChaosStatus {
    let name = obj.metadata.name.unwrap_or_default();
    let data = obj.data;

    let spec = data.get("spec").cloned().unwrap_or(Value::Null);
    let status_obj = data.get("status").cloned().unwrap_or(Value::Null);

    // Determine chaos type based on CRD kind and action
    let chaos_type = match crd_kind {
        ChaosCrdKind::NetworkChaos => {
            let action = spec.get("action").and_then(|v| v.as_str()).unwrap_or("delay");
            match action {
                "delay" => ChaosType::Delay,
                "loss" => ChaosType::Loss,
                "bandwidth" => ChaosType::Bandwidth,
                "corrupt" => ChaosType::Corrupt,
                "duplicate" => ChaosType::Duplicate,
                "partition" => ChaosType::Partition,
                _ => ChaosType::Delay,
            }
        }
        ChaosCrdKind::StressChaos => ChaosType::StressCpu,
        ChaosCrdKind::PodChaos => ChaosType::PodKill,
        ChaosCrdKind::IOChaos => ChaosType::IoDelay,
        ChaosCrdKind::HTTPChaos => ChaosType::HttpAbort,
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
