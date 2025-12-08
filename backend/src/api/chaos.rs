//! Chaos Engineering API endpoints
//!
//! Create, list, and delete chaos conditions on deployed topologies

use axum::{
    extract::{Path, State},
    Json,
};
use tracing::info;
use uuid::Uuid;

use crate::api::AppState;
use crate::chaos::{ChaosClient, ChaosCondition, ChaosStatus, CreateChaosRequest};
use crate::error::{AppError, AppResult};

/// Namespace for chaos resources
const CHAOS_NAMESPACE: &str = "networksim-sim";

/// List active chaos conditions for a topology
pub async fn list(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
) -> AppResult<Json<Vec<ChaosStatus>>> {
    info!("Listing chaos conditions for topology: {}", topology_id);

    // Verify topology exists
    let _ = state.db.get_topology(&topology_id).await?
        .ok_or_else(|| AppError::not_found(&format!("Topology {} not found", topology_id)))?;

    // Get chaos client
    let chaos_client = ChaosClient::new(CHAOS_NAMESPACE).await?;

    // List chaos resources
    let conditions = chaos_client.list_chaos(&topology_id).await?;

    Ok(Json(conditions))
}

/// Create a chaos condition
pub async fn create(
    State(state): State<AppState>,
    Json(req): Json<CreateChaosRequest>,
) -> AppResult<Json<ChaosCondition>> {
    info!(
        "Creating chaos condition for topology {} (type={:?}, source={}, target={:?})",
        req.topology_id, req.chaos_type, req.source_node_id, req.target_node_id
    );

    // Verify topology exists and is deployed
    let topology = state.db.get_topology(&req.topology_id).await?
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

    // Get chaos client
    let chaos_client = ChaosClient::new(CHAOS_NAMESPACE).await?;

    // Create the chaos resource
    let k8s_name = chaos_client
        .create_chaos(
            &req.topology_id,
            &condition_id,
            &req.source_node_id,
            req.target_node_id.as_deref(),
            &req.chaos_type,
            &req.direction,
            req.duration.as_deref(),
            &req.params,
        )
        .await?;

    // Build response
    let condition = ChaosCondition {
        id: condition_id.clone(),
        topology_id: req.topology_id.clone(),
        source_node_id: req.source_node_id.clone(),
        target_node_id: req.target_node_id,
        chaos_type: req.chaos_type,
        direction: req.direction,
        duration: req.duration,
        params: req.params,
        k8s_name,
        active: true,
        created_at: chrono::Utc::now(),
    };

    // Broadcast chaos applied event
    let _ = state.event_tx.send(crate::api::Event::ChaosApplied {
        id: condition_id,
        target: req.source_node_id,
    });

    Ok(Json(condition))
}

/// Delete a chaos condition
pub async fn delete(
    State(state): State<AppState>,
    Path((topology_id, condition_id)): Path<(String, String)>,
) -> AppResult<Json<serde_json::Value>> {
    info!(
        "Deleting chaos condition {} for topology {}",
        condition_id, topology_id
    );

    // Verify topology exists
    let _ = state.db.get_topology(&topology_id).await?
        .ok_or_else(|| AppError::not_found(&format!("Topology {} not found", topology_id)))?;

    // Get chaos client
    let chaos_client = ChaosClient::new(CHAOS_NAMESPACE).await?;

    // Delete the chaos resource
    chaos_client.delete_chaos(&topology_id, &condition_id).await?;

    // Broadcast chaos removed event
    let _ = state.event_tx.send(crate::api::Event::ChaosRemoved {
        id: condition_id.clone(),
    });

    Ok(Json(serde_json::json!({
        "deleted": condition_id,
        "topology_id": topology_id
    })))
}

/// Delete all chaos conditions for a topology
pub async fn delete_all(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    info!("Deleting all chaos conditions for topology {}", topology_id);

    // Verify topology exists
    let _ = state.db.get_topology(&topology_id).await?
        .ok_or_else(|| AppError::not_found(&format!("Topology {} not found", topology_id)))?;

    // Get chaos client
    let chaos_client = ChaosClient::new(CHAOS_NAMESPACE).await?;

    // Cleanup all chaos for topology
    chaos_client.cleanup_topology(&topology_id).await?;

    Ok(Json(serde_json::json!({
        "cleanup": "complete",
        "topology_id": topology_id
    })))
}
