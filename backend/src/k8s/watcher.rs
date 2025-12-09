//! Kubernetes Pod Watcher
//!
//! Watches pod events and broadcasts them via WebSocket

use futures::StreamExt;
use k8s_openapi::api::core::v1::Pod;
use kube::{
    api::Api,
    runtime::watcher::{self, Event as WatchEvent},
    Client,
};
use tokio::sync::broadcast;
use tracing::{error, info, warn};

use crate::api::Event;

/// Start watching pods in the networksim-sim namespace
pub async fn start_pod_watcher(event_tx: broadcast::Sender<Event>) {
    info!("Starting Kubernetes pod watcher");

    // Try to connect to Kubernetes
    let client = match Client::try_default().await {
        Ok(c) => c,
        Err(e) => {
            warn!(
                "Failed to create K8s client for watcher: {}. Watcher disabled.",
                e
            );
            return;
        }
    };

    let namespace = "networksim-sim";
    let pods: Api<Pod> = Api::namespaced(client, namespace);

    // Create watcher with label selector
    let watcher_config =
        watcher::Config::default().labels("app.kubernetes.io/managed-by=networksim");

    let mut pod_stream = watcher::watcher(pods, watcher_config).boxed();

    info!("Pod watcher started for namespace '{}'", namespace);

    while let Some(event) = pod_stream.next().await {
        match event {
            Ok(WatchEvent::Applied(pod)) => {
                handle_pod_event(&event_tx, &pod, "applied");
            }
            Ok(WatchEvent::Deleted(pod)) => {
                handle_pod_event(&event_tx, &pod, "deleted");
            }
            Ok(WatchEvent::Restarted(pods)) => {
                info!("Pod watcher restarted, {} pods found", pods.len());
                for pod in pods {
                    handle_pod_event(&event_tx, &pod, "synced");
                }
            }
            Err(e) => {
                error!("Pod watcher error: {}", e);
                // Don't break, try to continue watching
            }
        }
    }

    warn!("Pod watcher stream ended");
}

fn handle_pod_event(event_tx: &broadcast::Sender<Event>, pod: &Pod, event_type: &str) {
    let pod_name = pod.metadata.name.clone().unwrap_or_default();
    let labels = pod.metadata.labels.clone().unwrap_or_default();

    // Extract node ID from labels
    let node_id = labels
        .get("networksim.io/node")
        .cloned()
        .unwrap_or_else(|| pod_name.clone());

    // Get pod status
    let status = pod
        .status
        .as_ref()
        .and_then(|s| s.phase.clone())
        .unwrap_or_else(|| "Unknown".to_string());

    // Map to simplified status
    let simple_status = match status.as_str() {
        "Running" => "running",
        "Pending" => "pending",
        "Succeeded" => "completed",
        "Failed" => "failed",
        _ => "unknown",
    };

    info!(
        "Pod event: {} - {} (node: {}, status: {})",
        event_type, pod_name, node_id, simple_status
    );

    // Broadcast node status event
    let _ = event_tx.send(Event::NodeStatus {
        node_id,
        status: simple_status.to_string(),
    });
}

/// Start watching NetworkChaos resources
pub async fn start_chaos_watcher(event_tx: broadcast::Sender<Event>) {
    info!("Starting NetworkChaos watcher");

    let client = match Client::try_default().await {
        Ok(c) => c,
        Err(e) => {
            warn!(
                "Failed to create K8s client for chaos watcher: {}. Watcher disabled.",
                e
            );
            return;
        }
    };

    use kube::api::{Api, DynamicObject};
    use kube::discovery::ApiResource;

    let ar = ApiResource {
        group: "chaos-mesh.org".to_string(),
        version: "v1alpha1".to_string(),
        api_version: "chaos-mesh.org/v1alpha1".to_string(),
        kind: "NetworkChaos".to_string(),
        plural: "networkchaos".to_string(),
    };

    let chaos_api: Api<DynamicObject> = Api::namespaced_with(client, "networksim-sim", &ar);

    // Check if chaos-mesh CRD exists before starting watcher
    match chaos_api.list(&Default::default()).await {
        Ok(_) => {
            info!("Chaos-mesh detected, starting NetworkChaos watcher");
        }
        Err(e) => {
            warn!("Chaos-mesh not available ({}), NetworkChaos watcher disabled", e);
            return;
        }
    }

    let watcher_config =
        watcher::Config::default().labels("app.kubernetes.io/managed-by=networksim");

    let mut chaos_stream = watcher::watcher(chaos_api, watcher_config).boxed();

    info!("NetworkChaos watcher started");

    while let Some(event) = chaos_stream.next().await {
        match event {
            Ok(WatchEvent::Applied(chaos)) => {
                let name = chaos.metadata.name.clone().unwrap_or_default();
                let labels = chaos.metadata.labels.clone().unwrap_or_default();
                let topology_id = labels.get("networksim.io/topology").cloned();

                info!(
                    "NetworkChaos applied: {} (topology: {:?})",
                    name, topology_id
                );

                // Extract condition ID from name (ns-{topo}-{condition_id})
                let condition_id = name.split('-').next_back().unwrap_or(&name).to_string();

                let _ = event_tx.send(Event::ChaosApplied {
                    id: condition_id,
                    target: topology_id.unwrap_or_default(),
                });
            }
            Ok(WatchEvent::Deleted(chaos)) => {
                let name = chaos.metadata.name.clone().unwrap_or_default();
                info!("NetworkChaos deleted: {}", name);

                let condition_id = name.split('-').next_back().unwrap_or(&name).to_string();

                let _ = event_tx.send(Event::ChaosRemoved { id: condition_id });
            }
            Ok(WatchEvent::Restarted(items)) => {
                info!(
                    "NetworkChaos watcher restarted, {} items found",
                    items.len()
                );
            }
            Err(e) => {
                error!("NetworkChaos watcher error: {}", e);
            }
        }
    }

    warn!("NetworkChaos watcher stream ended");
}
