//! Chaos Engineering API endpoints
//!
//! Create, list, start, stop and delete chaos conditions on deployed topologies

use axum::{
    extract::{Path, State},
    Json,
};
use tracing::{info, warn};
use uuid::Uuid;

use crate::api::AppState;
use crate::chaos::{
    ChaosClient, ChaosCondition, ChaosConditionStatus, CreateChaosRequest, UpdateChaosRequest,
};
use crate::error::{AppError, AppResult};

/// Namespace for chaos resources
const CHAOS_NAMESPACE: &str = "networksim-sim";

/// List all chaos conditions for a topology (from DB)
#[utoipa::path(
    get,
    path = "/api/topologies/{topology_id}/chaos",
    tag = "chaos",
    params(
        ("topology_id" = String, Path, description = "Topology ID")
    ),
    responses(
        (status = 200, description = "List of chaos conditions", body = Vec<ChaosCondition>),
        (status = 404, description = "Topology not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn list(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
) -> AppResult<Json<Vec<ChaosCondition>>> {
    info!("Listing chaos conditions for topology: {}", topology_id);

    // Verify topology exists
    let _ = state
        .db
        .get_topology(&topology_id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Topology {} not found", topology_id)))?;

    // Get conditions from DB
    let conditions = state.db.list_chaos_conditions(&topology_id).await?;

    Ok(Json(conditions))
}

/// Create a chaos condition (saves to DB but does NOT apply to K8s yet)
#[utoipa::path(
    post,
    path = "/api/chaos",
    tag = "chaos",
    request_body = CreateChaosRequest,
    responses(
        (status = 200, description = "Chaos condition created", body = ChaosCondition),
        (status = 404, description = "Topology or node not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn create(
    State(state): State<AppState>,
    Json(req): Json<CreateChaosRequest>,
) -> AppResult<Json<ChaosCondition>> {
    info!(
        "Creating chaos condition for topology {} (type={:?}, source={}, target={:?})",
        req.topology_id, req.chaos_type, req.source_node_id, req.target_node_id
    );

    // Verify topology exists
    let topology = state
        .db
        .get_topology(&req.topology_id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Topology {} not found", req.topology_id)))?;

    // Verify source node exists in topology
    let source_exists = topology.nodes.iter().any(|n| n.id == req.source_node_id);
    if !source_exists {
        return Err(AppError::not_found(&format!(
            "Source node {} not found in topology",
            req.source_node_id
        )));
    }

    // Verify target node if specified
    if let Some(ref target_id) = req.target_node_id {
        let target_exists = topology.nodes.iter().any(|n| n.id == *target_id);
        if !target_exists {
            return Err(AppError::not_found(&format!(
                "Target node {} not found in topology",
                target_id
            )));
        }
    }

    // Generate condition ID
    let condition_id = Uuid::new_v4().to_string()[..8].to_string();
    let now = chrono::Utc::now();

    // Build condition (pending status - not yet applied)
    let condition = ChaosCondition {
        id: condition_id.clone(),
        topology_id: req.topology_id.clone(),
        source_node_id: req.source_node_id.clone(),
        target_node_id: req.target_node_id,
        chaos_type: req.chaos_type,
        direction: req.direction,
        duration: req.duration,
        params: req.params,
        k8s_name: None,
        status: ChaosConditionStatus::Pending,
        started_at: None,
        created_at: now,
        updated_at: now,
    };

    // Save to database
    state.db.create_chaos_condition(&condition).await?;

    info!("Created chaos condition {} (pending)", condition_id);

    Ok(Json(condition))
}

/// Start (activate) a chaos condition - applies it to K8s
#[utoipa::path(
    post,
    path = "/api/topologies/{topology_id}/chaos/{condition_id}/start",
    tag = "chaos",
    params(
        ("topology_id" = String, Path, description = "Topology ID"),
        ("condition_id" = String, Path, description = "Chaos condition ID")
    ),
    responses(
        (status = 200, description = "Chaos condition started", body = ChaosCondition),
        (status = 404, description = "Condition not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn start(
    State(state): State<AppState>,
    Path((topology_id, condition_id)): Path<(String, String)>,
) -> AppResult<Json<ChaosCondition>> {
    info!(
        "Starting chaos condition {} for topology {}",
        condition_id, topology_id
    );

    // Get condition from DB
    let mut condition = state
        .db
        .get_chaos_condition(&condition_id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Condition {} not found", condition_id)))?;

    // Verify topology matches
    if condition.topology_id != topology_id {
        return Err(AppError::bad_request(
            "Condition does not belong to this topology",
        ));
    }

    // Check if already active
    if condition.status == ChaosConditionStatus::Active {
        return Ok(Json(condition)); // Already running
    }

    // Get chaos client
    let chaos_client = ChaosClient::new(CHAOS_NAMESPACE).await?;

    // Create the chaos resource in K8s
    let k8s_name = chaos_client
        .create_chaos(
            &condition.topology_id,
            &condition.id,
            &condition.source_node_id,
            condition.target_node_id.as_deref(),
            &condition.chaos_type,
            &condition.direction,
            condition.duration.as_deref(),
            &condition.params,
        )
        .await?;

    // Update DB
    state
        .db
        .update_chaos_condition_status(
            &condition.id,
            &ChaosConditionStatus::Active,
            Some(&k8s_name),
        )
        .await?;

    condition.status = ChaosConditionStatus::Active;
    condition.k8s_name = Some(k8s_name);

    // Broadcast event
    let _ = state.event_tx.send(crate::api::Event::ChaosApplied {
        id: condition_id,
        target: condition.source_node_id.clone(),
    });

    Ok(Json(condition))
}

/// Stop (pause) a chaos condition - removes from K8s but keeps in DB
#[utoipa::path(
    post,
    path = "/api/topologies/{topology_id}/chaos/{condition_id}/stop",
    tag = "chaos",
    params(
        ("topology_id" = String, Path, description = "Topology ID"),
        ("condition_id" = String, Path, description = "Chaos condition ID")
    ),
    responses(
        (status = 200, description = "Chaos condition stopped", body = ChaosCondition),
        (status = 404, description = "Condition not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn stop(
    State(state): State<AppState>,
    Path((topology_id, condition_id)): Path<(String, String)>,
) -> AppResult<Json<ChaosCondition>> {
    info!(
        "Stopping chaos condition {} for topology {}",
        condition_id, topology_id
    );

    // Get condition from DB
    let mut condition = state
        .db
        .get_chaos_condition(&condition_id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Condition {} not found", condition_id)))?;

    // Verify topology matches
    if condition.topology_id != topology_id {
        return Err(AppError::bad_request(
            "Condition does not belong to this topology",
        ));
    }

    // Check if already paused/pending
    if condition.status != ChaosConditionStatus::Active {
        return Ok(Json(condition)); // Not running
    }

    // Get chaos client
    let chaos_client = ChaosClient::new(CHAOS_NAMESPACE).await?;

    // Delete from K8s
    chaos_client
        .delete_chaos(&topology_id, &condition_id)
        .await?;

    // Update DB
    state
        .db
        .update_chaos_condition_status(&condition.id, &ChaosConditionStatus::Paused, None)
        .await?;

    condition.status = ChaosConditionStatus::Paused;
    condition.k8s_name = None;

    // Broadcast event
    let _ = state
        .event_tx
        .send(crate::api::Event::ChaosRemoved { id: condition_id });

    Ok(Json(condition))
}

/// Update a chaos condition (only editable fields)
pub async fn update(
    State(state): State<AppState>,
    Path((topology_id, condition_id)): Path<(String, String)>,
    Json(req): Json<UpdateChaosRequest>,
) -> AppResult<Json<ChaosCondition>> {
    info!(
        "Updating chaos condition {} for topology {}",
        condition_id, topology_id
    );

    // Get condition from DB
    let mut condition = state
        .db
        .get_chaos_condition(&condition_id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Condition {} not found", condition_id)))?;

    // Verify topology matches
    if condition.topology_id != topology_id {
        return Err(AppError::bad_request(
            "Condition does not belong to this topology",
        ));
    }

    // Update the condition fields
    condition.direction = req.direction;
    condition.duration = req.duration;
    condition.params = req.params;
    condition.updated_at = chrono::Utc::now();

    // If condition is active, we need to restart it with new parameters
    if condition.status == ChaosConditionStatus::Active {
        // Stop the current chaos
        let chaos_client = ChaosClient::new(CHAOS_NAMESPACE).await?;
        if let Err(e) = chaos_client.delete_chaos(&topology_id, &condition.id).await {
            warn!(
                "Failed to delete old chaos {} from K8s: {}",
                condition.id, e
            );
        }

        // Create new chaos with updated parameters
        let k8s_name = chaos_client
            .create_chaos(
                &condition.topology_id,
                &condition.id,
                &condition.source_node_id,
                condition.target_node_id.as_deref(),
                &condition.chaos_type,
                &condition.direction,
                condition.duration.as_deref(),
                &condition.params,
            )
            .await?;

        condition.k8s_name = Some(k8s_name);
    }

    // Update in DB
    state.db.update_chaos_condition(&condition).await?;

    // Broadcast event
    let _ = state.event_tx.send(crate::api::Event::ChaosUpdated {
        id: condition.id.clone(),
    });

    Ok(Json(condition))
}

/// Start all chaos conditions for a topology
pub async fn start_all(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    info!("Starting all chaos conditions for topology {}", topology_id);

    // Verify topology exists
    let _ = state
        .db
        .get_topology(&topology_id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Topology {} not found", topology_id)))?;

    // Get all conditions
    let conditions = state.db.list_chaos_conditions(&topology_id).await?;

    let chaos_client = ChaosClient::new(CHAOS_NAMESPACE).await?;
    let mut started = 0;
    let mut errors = Vec::new();

    for condition in conditions {
        if condition.status != ChaosConditionStatus::Active {
            match chaos_client
                .create_chaos(
                    &condition.topology_id,
                    &condition.id,
                    &condition.source_node_id,
                    condition.target_node_id.as_deref(),
                    &condition.chaos_type,
                    &condition.direction,
                    condition.duration.as_deref(),
                    &condition.params,
                )
                .await
            {
                Ok(k8s_name) => {
                    let _ = state
                        .db
                        .update_chaos_condition_status(
                            &condition.id,
                            &ChaosConditionStatus::Active,
                            Some(&k8s_name),
                        )
                        .await;

                    let _ = state.event_tx.send(crate::api::Event::ChaosApplied {
                        id: condition.id.clone(),
                        target: condition.source_node_id.clone(),
                    });

                    started += 1;
                }
                Err(e) => {
                    warn!("Failed to start condition {}: {}", condition.id, e);
                    errors.push(format!("{}: {}", condition.id, e));
                }
            }
        }
    }

    Ok(Json(serde_json::json!({
        "started": started,
        "errors": errors,
        "topology_id": topology_id
    })))
}

/// Stop all chaos conditions for a topology
pub async fn stop_all(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    info!("Stopping all chaos conditions for topology {}", topology_id);

    // Verify topology exists
    let _ = state
        .db
        .get_topology(&topology_id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Topology {} not found", topology_id)))?;

    // Get all active conditions
    let conditions = state.db.list_chaos_conditions(&topology_id).await?;

    let chaos_client = ChaosClient::new(CHAOS_NAMESPACE).await?;
    let mut stopped = 0;

    for condition in conditions {
        if condition.status == ChaosConditionStatus::Active {
            // Delete from K8s
            if let Err(e) = chaos_client.delete_chaos(&topology_id, &condition.id).await {
                warn!("Failed to delete chaos {} from K8s: {}", condition.id, e);
            }

            // Update DB
            let _ = state
                .db
                .update_chaos_condition_status(&condition.id, &ChaosConditionStatus::Paused, None)
                .await;

            let _ = state.event_tx.send(crate::api::Event::ChaosRemoved {
                id: condition.id.clone(),
            });

            stopped += 1;
        }
    }

    Ok(Json(serde_json::json!({
        "stopped": stopped,
        "topology_id": topology_id
    })))
}

/// Delete a chaos condition (removes from K8s and DB)
#[utoipa::path(
    delete,
    path = "/api/topologies/{topology_id}/chaos/{condition_id}",
    tag = "chaos",
    params(
        ("topology_id" = String, Path, description = "Topology ID"),
        ("condition_id" = String, Path, description = "Chaos condition ID")
    ),
    responses(
        (status = 200, description = "Chaos condition deleted"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn delete(
    State(state): State<AppState>,
    Path((topology_id, condition_id)): Path<(String, String)>,
) -> AppResult<Json<serde_json::Value>> {
    info!(
        "Deleting chaos condition {} for topology {}",
        condition_id, topology_id
    );

    // Get condition from DB
    let condition = state.db.get_chaos_condition(&condition_id).await?;

    if let Some(cond) = condition {
        // If active, remove from K8s first
        if cond.status == ChaosConditionStatus::Active {
            let chaos_client = ChaosClient::new(CHAOS_NAMESPACE).await?;
            let _ = chaos_client.delete_chaos(&topology_id, &condition_id).await;
        }

        // Delete from DB
        state.db.delete_chaos_condition(&condition_id).await?;

        // Broadcast event
        let _ = state.event_tx.send(crate::api::Event::ChaosRemoved {
            id: condition_id.clone(),
        });
    }

    Ok(Json(serde_json::json!({
        "deleted": condition_id,
        "topology_id": topology_id
    })))
}

/// Delete all chaos conditions for a topology (from K8s and DB)
#[utoipa::path(
    delete,
    path = "/api/topologies/{topology_id}/chaos",
    tag = "chaos",
    params(
        ("topology_id" = String, Path, description = "Topology ID")
    ),
    responses(
        (status = 200, description = "All chaos conditions deleted"),
        (status = 404, description = "Topology not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn delete_all(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    info!("Deleting all chaos conditions for topology {}", topology_id);

    // Verify topology exists
    let _ = state
        .db
        .get_topology(&topology_id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Topology {} not found", topology_id)))?;

    // Get all conditions to clean up K8s resources
    let conditions = state.db.list_chaos_conditions(&topology_id).await?;

    // Clean up K8s resources
    let chaos_client = ChaosClient::new(CHAOS_NAMESPACE).await?;
    for condition in &conditions {
        if condition.status == ChaosConditionStatus::Active {
            if let Err(e) = chaos_client.delete_chaos(&topology_id, &condition.id).await {
                warn!("Failed to delete chaos {} from K8s: {}", condition.id, e);
            }
        }
        // Broadcast event for each
        let _ = state.event_tx.send(crate::api::Event::ChaosRemoved {
            id: condition.id.clone(),
        });
    }

    // Delete all from DB
    let deleted = state.db.delete_all_chaos_conditions(&topology_id).await?;

    Ok(Json(serde_json::json!({
        "deleted": deleted,
        "topology_id": topology_id
    })))
}

/// Application affected by chaos condition
#[derive(Debug, serde::Serialize)]
pub struct AffectedApp {
    pub app_id: String,
    pub app_name: String,
    pub node_id: String,
    pub node_name: String,
    pub impact: String, // "direct" (source node) or "indirect" (target node)
}

/// Response for affected apps endpoint
#[derive(Debug, serde::Serialize)]
pub struct AffectedAppsResponse {
    pub condition_id: String,
    pub chaos_type: String,
    pub source_node_id: String,
    pub target_node_id: Option<String>,
    pub affected_apps: Vec<AffectedApp>,
    pub total_affected: usize,
}

/// Get applications affected by a chaos condition
///
/// GET /api/v1/chaos/:condition_id/affected-apps
#[utoipa::path(
    get,
    path = "/api/v1/chaos/{condition_id}/affected-apps",
    tag = "chaos",
    params(
        ("condition_id" = String, Path, description = "Chaos condition ID")
    ),
    responses(
        (status = 200, description = "List of affected applications"),
        (status = 404, description = "Condition not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn affected_apps(
    State(state): State<AppState>,
    Path(condition_id): Path<String>,
) -> AppResult<Json<AffectedAppsResponse>> {
    info!("Getting affected apps for chaos condition: {}", condition_id);

    // Get the chaos condition
    let condition = state
        .db
        .get_chaos_condition(&condition_id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Condition {} not found", condition_id)))?;

    // Get topology to resolve node names
    let topology = state
        .db
        .get_topology(&condition.topology_id)
        .await?
        .ok_or_else(|| AppError::not_found("Topology not found"))?;

    let node_names: std::collections::HashMap<String, String> = topology
        .nodes
        .iter()
        .map(|n| (n.id.clone(), n.name.clone()))
        .collect();

    // Get all applications for this topology
    let apps = state.db.list_applications(&condition.topology_id).await?;

    let mut affected_apps = Vec::new();

    // Check apps on source node (directly affected)
    for app in &apps {
        if app.node_selector.contains(&condition.source_node_id) {
            affected_apps.push(AffectedApp {
                app_id: app.id.to_string(),
                app_name: app.image_name.clone(),
                node_id: condition.source_node_id.clone(),
                node_name: node_names
                    .get(&condition.source_node_id)
                    .cloned()
                    .unwrap_or_default(),
                impact: "direct".to_string(),
            });
        }
    }

    // Check apps on target node (indirectly affected - receiving affected traffic)
    if let Some(ref target_id) = condition.target_node_id {
        for app in &apps {
            if app.node_selector.contains(target_id) {
                // Avoid duplicates if app is on both nodes
                let already_added = affected_apps
                    .iter()
                    .any(|a| a.app_id == app.id.to_string() && a.node_id == *target_id);
                if !already_added {
                    affected_apps.push(AffectedApp {
                        app_id: app.id.to_string(),
                        app_name: app.image_name.clone(),
                        node_id: target_id.clone(),
                        node_name: node_names.get(target_id).cloned().unwrap_or_default(),
                        impact: "indirect".to_string(),
                    });
                }
            }
        }
    }

    let total = affected_apps.len();

    Ok(Json(AffectedAppsResponse {
        condition_id: condition.id,
        chaos_type: format!("{:?}", condition.chaos_type).to_lowercase(),
        source_node_id: condition.source_node_id,
        target_node_id: condition.target_node_id,
        affected_apps,
        total_affected: total,
    }))
}
