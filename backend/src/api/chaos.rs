use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::api::AppState;
use crate::error::AppResult;

#[derive(Debug, Serialize, Deserialize)]
pub struct ChaosCondition {
    pub id: String,
    pub target_type: String,
    pub target_id: String,
    pub condition_type: String,
    pub params: serde_json::Value,
    pub active: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateChaosRequest {
    pub target_type: String,
    pub target_id: String,
    pub condition_type: String,
    pub params: serde_json::Value,
}

/// List active chaos conditions
pub async fn list(State(_state): State<AppState>) -> AppResult<Json<Vec<ChaosCondition>>> {
    // TODO: Implement in Phase 4
    Ok(Json(vec![]))
}

/// Create a chaos condition
pub async fn create(
    State(_state): State<AppState>,
    Json(req): Json<CreateChaosRequest>,
) -> AppResult<Json<ChaosCondition>> {
    // TODO: Implement Chaos Mesh integration in Phase 4
    tracing::info!("Create chaos: {:?}", req);

    Ok(Json(ChaosCondition {
        id: uuid::Uuid::new_v4().to_string(),
        target_type: req.target_type,
        target_id: req.target_id,
        condition_type: req.condition_type,
        params: req.params,
        active: true,
    }))
}

/// Delete a chaos condition
pub async fn delete(
    State(_state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    // TODO: Implement in Phase 4
    tracing::info!("Delete chaos: {}", id);

    Ok(Json(serde_json::json!({ "deleted": id })))
}
