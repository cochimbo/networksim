use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::api::AppState;
use crate::api::applications::deploy_application_to_node;
use crate::error::{AppError, AppResult};
use crate::k8s::{DeploymentManager, DeploymentState, DeploymentStatus as K8sDeploymentStatus};

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
            .map(|n| {
                NodeStatusResponse {
                    id: n.node_id,
                        name: String::new(), // Se rellenará en el handler
                    status: format!("{:?}", n.status).to_lowercase(),
                    pod_name: n.pod_name,
                    pod_ip: n.pod_ip,
                    message: n.message,
                }
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
#[utoipa::path(
    post,
    path = "/api/topologies/{id}/deploy",
    tag = "topologies",
    params(
        ("id" = String, Path, description = "Topology ID")
    ),
    responses(
        (status = 200, description = "Deployment started", body = super::openapi::DeploymentStatusSchema),
        (status = 400, description = "Cannot deploy empty topology"),
        (status = 404, description = "Topology not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn deploy(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<DeploymentResponse>> {
    info!(topology_id = %id, "Deploying topology");

    // Check if K8s client is available
    let k8s = state
        .k8s
        .as_ref()
        .ok_or_else(|| AppError::internal("Kubernetes client not configured"))?;

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

    // Update deploy_command_state to deploying (insert if not exists)
    sqlx::query(
        "INSERT OR REPLACE INTO deployments (id, topology_id, status, deploy_command_state, created_at, updated_at) VALUES (?, ?, 'pending', 'deploying', datetime('now'), datetime('now'))"
    )
    .bind(format!("deploy-{}", id))
    .bind(&id)
    .execute(state.db.pool())
    .await
    .map_err(|e| {
        warn!(error = %e, topology_id = %id, "Failed to insert/replace deployment state");
        AppError::internal("Failed to update deployment state")
    })?;

    // Create deployment manager and deploy
    let manager = DeploymentManager::new(k8s.clone());
    let status = manager.deploy(&topology).await.map_err(|e| {
        warn!(error = %e, "Failed to deploy topology");
        AppError::internal(&format!("Deployment failed: {}", e))
    })?;

    // Broadcast deployment event
    let _ = state.event_tx.send(crate::api::Event::DeploymentStatus {
        topology_id: id.clone(),
        status: format!("{:?}", status.status).to_lowercase(),
    });

    // If deployment was successful, activate any pending applications
    info!(topology_id = %id, deployment_status = ?status.status, "Checking deployment status for pending applications activation");
    if matches!(status.status, DeploymentState::Running | DeploymentState::PartiallyRunning) {
        info!(topology_id = %id, "Activating pending applications for deployed topology");
        if let Err(e) = activate_pending_applications(&state, &id).await {
            warn!(error = %e, topology_id = %id, "Failed to activate some pending applications");
        }
    } else {
        info!(topology_id = %id, status = ?status.status, "Skipping pending applications activation - topology not fully running");
    }

    info!(topology_id = %id, "Topology deployed successfully");
    // Convertir a respuesta y rellenar nombres
    let mut response = DeploymentResponse::from(status);
    for node in &mut response.nodes {
        node.name = topology.nodes.iter()
            .find(|n| n.id == node.id)
            .map(|n| n.name.clone())
            .unwrap_or_else(|| node.id.clone());
    }
    Ok(Json(response))
}

/// Destroy a deployment
///
/// DELETE /api/topologies/:id/deploy
#[utoipa::path(
    delete,
    path = "/api/topologies/{id}/deploy",
    tag = "topologies",
    params(
        ("id" = String, Path, description = "Topology ID")
    ),
    responses(
        (status = 200, description = "Deployment destroyed"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn destroy(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    info!(topology_id = %id, "Destroying deployment");

    // Mark all applications as Pending (don't delete them)
    let applications = state.db.list_applications(&id).await?;
    for app in applications {
        tracing::info!("Marking application {} as Pending before destroying topology", app.id);
        if let Err(e) = state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Pending, Some(&crate::k8s::resources::make_deployment_name(&app.id.simple().to_string(), app.node_selector.first().unwrap_or(&"".to_string())))).await {
            tracing::warn!("Failed to mark application {} as Pending: {}", app.id, e);
        }
    }

    // Check if K8s client is available
    let k8s = state
        .k8s
        .ok_or_else(|| AppError::internal("Kubernetes client not configured"))?;

    // Create deployment manager and destroy
    let manager = DeploymentManager::new(k8s);
    manager.destroy(&id).await.map_err(|e| {
        warn!(error = %e, "Failed to destroy deployment");
        AppError::internal(&format!("Destroy failed: {}", e))
    })?;

    // Update deploy_command_state to stopped
    if let Err(e) = sqlx::query(
        "INSERT OR REPLACE INTO deployments (id, topology_id, status, deploy_command_state, created_at, updated_at) VALUES (?, ?, 'stopped', 'stopped', datetime('now'), datetime('now'))"
    )
    .bind(format!("deploy-{}", id))
    .bind(&id)
    .execute(state.db.pool())
    .await {
        warn!(error = %e, topology_id = %id, "Failed to update deploy_command_state to stopped");
    }

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
#[utoipa::path(
    get,
    path = "/api/topologies/{id}/status",
    tag = "topologies",
    params(
        ("id" = String, Path, description = "Topology ID")
    ),
    responses(
        (status = 200, description = "Deployment status", body = super::openapi::DeploymentStatusSchema),
        (status = 404, description = "Topology not found"),
        (status = 500, description = "Internal server error")
    )
)]
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

    // Obtener el estado del comando de despliegue
    let deploy_command_state: String = sqlx::query_scalar(
        "SELECT deploy_command_state FROM deployments WHERE topology_id = ?"
    )
    .bind(&id)
    .fetch_one(state.db.pool())
    .await
    .unwrap_or_else(|_| "pending".to_string());

    // Solo activar aplicaciones si el comando está en 'deploying'
    if deploy_command_state == "deploying" && matches!(status.status, DeploymentState::Running | DeploymentState::PartiallyRunning) {
        // Check if there are pending applications for this topology
        let pending_apps = state.db.list_applications(&id).await?
            .into_iter()
            .filter(|app| matches!(app.status, crate::models::AppStatus::Pending))
            .collect::<Vec<_>>();
        if !pending_apps.is_empty() {
            info!(topology_id = %id, pending_count = pending_apps.len(), "Found pending applications for running topology, activating them");
            if let Err(e) = activate_pending_applications(&state, &id).await {
                warn!(error = %e, topology_id = %id, "Failed to activate pending applications during status check");
            }
        }
    }

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
    let pods = k8s
        .list_pods("app.kubernetes.io/managed-by=networksim")
        .await
        .map_err(|e| AppError::internal(&format!("Failed to list pods: {}", e)))?;

    if pods.is_empty() {
        return Ok(Json(None));
    }

    // Extract topology ID from the first pod's labels
    if let Some(pod) = pods.first() {
        if let Some(labels) = &pod.metadata.labels {
            if let Some(topology_id) = labels.get("networksim.io/topology") {
                let manager = DeploymentManager::new(k8s);
                let status = manager
                    .get_status(topology_id)
                    .await
                    .map_err(|e| AppError::internal(&format!("Failed to get status: {}", e)))?;
                return Ok(Json(Some(status.into())));
            }
        }
    }

    Ok(Json(None))
}

/// Activate pending applications when topology is deployed
async fn activate_pending_applications(
    state: &AppState,
    topology_id: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use crate::models::AppStatus;
    
    info!(topology_id = %topology_id, "Starting activation of pending applications");
    
    // Get all pending applications for this topology
    let pending_apps = state.db.list_applications(topology_id).await?;
    info!(topology_id = %topology_id, total_apps = pending_apps.len(), "Found applications in database");
    
    let pending_apps: Vec<_> = pending_apps.into_iter()
        .filter(|app| matches!(app.status, AppStatus::Pending))
        .collect();
    
    info!(topology_id = %topology_id, pending_count = pending_apps.len(), "Found pending applications to activate");
    
    if pending_apps.is_empty() {
        info!(topology_id = %topology_id, "No pending applications to activate");
        return Ok(());
    }
    
    info!(topology_id = %topology_id, pending_count = pending_apps.len(), "Activating pending applications");
    
    for app in pending_apps {
        info!(topology_id = %topology_id, app_id = %app.id, image_name = %app.image_name, "Activating pending application");
        
        // Update status to deploying
        state.db.update_application_status(&app.id.to_string(), &AppStatus::Deploying, Some(&app.release_name)).await?;
        
        // Deploy as sidecars to selected nodes
        let mut deployment_errors = Vec::new();
        
        for node_id in &app.node_selector {
            match deploy_application_to_node(state, topology_id, node_id, &app).await {
                Ok(_) => {
                    info!(topology_id = %topology_id, app_id = %app.id, node_id = %node_id, "Application deployed to node");
                }
                Err(e) => {
                    let error_msg = format!("Failed to deploy to node {}: {}", node_id, e);
                    warn!(topology_id = %topology_id, app_id = %app.id, node_id = %node_id, error = %error_msg);
                    deployment_errors.push(error_msg);
                }
            }
        }
        
        // Update final status
        if deployment_errors.is_empty() {
            state.db.update_application_status(&app.id.to_string(), &AppStatus::Deployed, Some(&app.release_name)).await?;
            info!(topology_id = %topology_id, app_id = %app.id, "Application activated successfully");
        } else {
            state.db.update_application_status(&app.id.to_string(), &AppStatus::Failed, Some(&app.release_name)).await?;
            warn!(topology_id = %topology_id, app_id = %app.id, errors = ?deployment_errors, "Application activation failed");
        }
    }
    
    Ok(())
}
