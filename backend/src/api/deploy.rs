use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::api::AppState;
use crate::error::{AppError, AppResult};
use crate::k8s::{DeploymentManager, DeploymentStatus as K8sDeploymentStatus};

/// Response for deployment operations
#[derive(Debug, Serialize, Deserialize)]
pub struct DeploymentResponse {
    pub topology_id: String,
    pub status: String,
    pub message: Option<String>,
    pub nodes: Vec<NodeStatusResponse>,
}

/// Status of a single node in a deployment
#[derive(Debug, Serialize, Deserialize)]
pub struct NodeStatusResponse {
    pub id: String,
    pub name: String,
    pub status: String,
    pub pod_name: Option<String>,
    pub pod_ip: Option<String>,
    pub message: Option<String>,
}

impl From<K8sDeploymentStatus> for DeploymentResponse {
    fn from(status: K8sDeploymentStatus) -> Self {
        let nodes = status
            .nodes
            .into_values()
            .map(|n| NodeStatusResponse {
                id: n.node_id,
                name: n.name,
                status: format!("{:?}", n.status).to_lowercase(),
                pod_name: n.pod_name,
                pod_ip: n.pod_ip,
                message: n.message,
            })
            .collect();

        DeploymentResponse {
            topology_id: status.topology_id,
            status: format!("{:?}", status.status).to_lowercase(),
            message: status.message,
            nodes,
        }
    }
}

/// Deploy a topology to K3s
/// 
/// POST /api/topologies/:id/deploy
pub async fn deploy(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<DeploymentResponse>> {
    info!(topology_id = %id, "Deploying topology");

    // Check if K8s client is available
    let k8s = state.k8s.ok_or_else(|| {
        AppError::internal("Kubernetes client not configured")
    })?;

    // Get the topology from database
    let topology = state
        .db
        .get_topology(&id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Topology {} not found", id)))?;

    // Validate topology has nodes
    if topology.nodes.is_empty() {
        return Err(AppError::bad_request("Cannot deploy empty topology"));
    }

    // Create deployment manager and deploy
    let manager = DeploymentManager::new(k8s);
    let status = manager.deploy(&topology).await.map_err(|e| {
        warn!(error = %e, "Failed to deploy topology");
        AppError::internal(&format!("Deployment failed: {}", e))
    })?;

    // Broadcast deployment event
    let _ = state.event_tx.send(crate::api::Event::DeploymentStatus {
        topology_id: id.clone(),
        status: format!("{:?}", status.status).to_lowercase(),
    });

    info!(topology_id = %id, "Topology deployed successfully");
    Ok(Json(status.into()))
}

/// Destroy a deployment
/// 
/// DELETE /api/topologies/:id/deploy
pub async fn destroy(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    info!(topology_id = %id, "Destroying deployment");

    // Check if K8s client is available
    let k8s = state.k8s.ok_or_else(|| {
        AppError::internal("Kubernetes client not configured")
    })?;

    // Create deployment manager and destroy
    let manager = DeploymentManager::new(k8s);
    manager.destroy(&id).await.map_err(|e| {
        warn!(error = %e, "Failed to destroy deployment");
        AppError::internal(&format!("Destroy failed: {}", e))
    })?;

    // Broadcast event
    let _ = state.event_tx.send(crate::api::Event::DeploymentStatus {
        topology_id: id.clone(),
        status: "stopped".to_string(),
    });

    info!(topology_id = %id, "Deployment destroyed");
    Ok(Json(serde_json::json!({
        "destroyed": true,
        "topology_id": id
    })))
}

/// Get deployment status
/// 
/// GET /api/topologies/:id/status
pub async fn status(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<DeploymentResponse>> {
    info!(topology_id = %id, "Getting deployment status");

    // Check if K8s client is available
    let k8s = match &state.k8s {
        Some(k) => k.clone(),
        None => {
            // Return not deployed status if K8s is not configured
            return Ok(Json(DeploymentResponse {
                topology_id: id,
                status: "not_configured".to_string(),
                message: Some("Kubernetes client not configured".to_string()),
                nodes: vec![],
            }));
        }
    };

    // Check if topology exists
    let _topology = state
        .db
        .get_topology(&id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Topology {} not found", id)))?;

    // Get status from K8s
    let manager = DeploymentManager::new(k8s);
    let status = manager.get_status(&id).await.map_err(|e| {
        warn!(error = %e, "Failed to get deployment status");
        AppError::internal(&format!("Status check failed: {}", e))
    })?;

    Ok(Json(status.into()))
}

/// Get active deployment (if any)
/// 
/// GET /api/deployments/active
pub async fn get_active_deployment(
    State(state): State<AppState>,
) -> AppResult<Json<Option<DeploymentResponse>>> {
    info!("Getting active deployment");

    // Check if K8s client is available
    let k8s = match &state.k8s {
        Some(k) => k.clone(),
        None => {
            return Ok(Json(None));
        }
    };

    // List all pods in the simulation namespace to find active deployments
    let pods = k8s.list_pods("app.kubernetes.io/managed-by=networksim").await
        .map_err(|e| AppError::internal(&format!("Failed to list pods: {}", e)))?;
    
    if pods.is_empty() {
        return Ok(Json(None));
    }

    // Extract topology ID from the first pod's labels
    if let Some(pod) = pods.first() {
        if let Some(labels) = &pod.metadata.labels {
            if let Some(topology_id) = labels.get("networksim.io/topology") {
                let manager = DeploymentManager::new(k8s);
                let status = manager.get_status(topology_id).await
                    .map_err(|e| AppError::internal(&format!("Failed to get status: {}", e)))?;
                return Ok(Json(Some(status.into())));
            }
        }
    }

    Ok(Json(None))
}
