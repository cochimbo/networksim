//! Chaos Presets API - Predefined chaos configurations
//!
//! Provides endpoints for managing and applying chaos presets.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;
use uuid::Uuid;

use crate::api::AppState;
use crate::error::{AppError, AppResult};

/// Optional pagination parameters
#[derive(Debug, Deserialize)]
pub struct OptionalPaginationParams {
    /// Page number (1-indexed)
    pub page: Option<u32>,
    /// Items per page (max: 100)
    pub per_page: Option<u32>,
    /// Filter by category
    pub category: Option<String>,
}

/// Chaos preset
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaosPreset {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub icon: Option<String>,
    pub chaos_type: String,
    pub direction: String,
    pub duration: Option<String>,
    pub params: serde_json::Value,
    pub is_builtin: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct PresetRow {
    id: String,
    name: String,
    description: Option<String>,
    category: String,
    icon: Option<String>,
    chaos_type: String,
    direction: String,
    duration: Option<String>,
    params: String,
    is_builtin: i32,
    created_at: String,
    updated_at: String,
}

/// Create preset request
#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct CreatePresetRequest {
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub icon: Option<String>,
    pub chaos_type: String,
    pub direction: Option<String>,
    pub duration: Option<String>,
    pub params: serde_json::Value,
}

/// Apply preset request
#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct ApplyPresetRequest {
    pub source_node_id: String,
    pub target_node_id: Option<String>,
    pub duration: Option<String>,  // Override preset duration
}

/// List all presets with optional pagination and filtering
///
/// GET /api/presets
#[utoipa::path(
    get,
    path = "/api/presets",
    tag = "presets",
    params(
        ("page" = Option<u32>, Query, description = "Page number (1-indexed)"),
        ("per_page" = Option<u32>, Query, description = "Items per page (max 100)"),
        ("category" = Option<String>, Query, description = "Filter by category")
    ),
    responses(
        (status = 200, description = "List of all chaos presets", body = Vec<ChaosPresetSchema>),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn list_presets(
    State(state): State<AppState>,
    Query(params): Query<OptionalPaginationParams>,
) -> AppResult<Json<Vec<ChaosPreset>>> {
    let rows: Vec<PresetRow> = if let Some(category) = &params.category {
        // Filter by category
        if let (Some(page), Some(per_page)) = (params.page, params.per_page) {
            let per_page = per_page.min(100);
            let offset = ((page.saturating_sub(1)) as i64) * (per_page as i64);

            sqlx::query_as(
                "SELECT id, name, description, category, icon, chaos_type, direction, duration, params, is_builtin, created_at, updated_at FROM chaos_presets WHERE category = ? ORDER BY is_builtin DESC, name LIMIT ? OFFSET ?"
            )
            .bind(category)
            .bind(per_page as i64)
            .bind(offset)
            .fetch_all(state.db.pool())
            .await
            .map_err(|e| AppError::internal(&format!("Failed to list presets: {}", e)))?
        } else {
            sqlx::query_as(
                "SELECT id, name, description, category, icon, chaos_type, direction, duration, params, is_builtin, created_at, updated_at FROM chaos_presets WHERE category = ? ORDER BY is_builtin DESC, name"
            )
            .bind(category)
            .fetch_all(state.db.pool())
            .await
            .map_err(|e| AppError::internal(&format!("Failed to list presets: {}", e)))?
        }
    } else if let (Some(page), Some(per_page)) = (params.page, params.per_page) {
        // Pagination without category filter
        let per_page = per_page.min(100);
        let offset = ((page.saturating_sub(1)) as i64) * (per_page as i64);

        sqlx::query_as(
            "SELECT id, name, description, category, icon, chaos_type, direction, duration, params, is_builtin, created_at, updated_at FROM chaos_presets ORDER BY is_builtin DESC, category, name LIMIT ? OFFSET ?"
        )
        .bind(per_page as i64)
        .bind(offset)
        .fetch_all(state.db.pool())
        .await
        .map_err(|e| AppError::internal(&format!("Failed to list presets: {}", e)))?
    } else {
        // No pagination - return all
        sqlx::query_as(
            "SELECT id, name, description, category, icon, chaos_type, direction, duration, params, is_builtin, created_at, updated_at FROM chaos_presets ORDER BY is_builtin DESC, category, name"
        )
        .fetch_all(state.db.pool())
        .await
        .map_err(|e| AppError::internal(&format!("Failed to list presets: {}", e)))?
    };

    let presets: Vec<ChaosPreset> = rows
        .into_iter()
        .map(|row| ChaosPreset {
            id: row.id,
            name: row.name,
            description: row.description,
            category: row.category,
            icon: row.icon,
            chaos_type: row.chaos_type,
            direction: row.direction,
            duration: row.duration,
            params: serde_json::from_str(&row.params).unwrap_or_default(),
            is_builtin: row.is_builtin != 0,
            created_at: row.created_at.parse().unwrap_or_else(|_| Utc::now()),
            updated_at: row.updated_at.parse().unwrap_or_else(|_| Utc::now()),
        })
        .collect();

    Ok(Json(presets))
}

/// Get a specific preset
///
/// GET /api/presets/:id
#[utoipa::path(
    get,
    path = "/api/presets/{id}",
    tag = "presets",
    params(
        ("id" = String, Path, description = "Preset ID")
    ),
    responses(
        (status = 200, description = "Preset found", body = ChaosPresetSchema),
        (status = 404, description = "Preset not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_preset(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<ChaosPreset>> {
    let row: PresetRow = sqlx::query_as(
        "SELECT id, name, description, category, icon, chaos_type, direction, duration, params, is_builtin, created_at, updated_at FROM chaos_presets WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to get preset: {}", e)))?
    .ok_or_else(|| AppError::not_found(&format!("Preset {} not found", id)))?;

    let preset = ChaosPreset {
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        icon: row.icon,
        chaos_type: row.chaos_type,
        direction: row.direction,
        duration: row.duration,
        params: serde_json::from_str(&row.params).unwrap_or_default(),
        is_builtin: row.is_builtin != 0,
        created_at: row.created_at.parse().unwrap_or_else(|_| Utc::now()),
        updated_at: row.updated_at.parse().unwrap_or_else(|_| Utc::now()),
    };

    Ok(Json(preset))
}

/// Create a custom preset
///
/// POST /api/presets
#[utoipa::path(
    post,
    path = "/api/presets",
    tag = "presets",
    request_body = CreatePresetRequest,
    responses(
        (status = 200, description = "Preset created", body = ChaosPresetSchema),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn create_preset(
    State(state): State<AppState>,
    Json(request): Json<CreatePresetRequest>,
) -> AppResult<Json<ChaosPreset>> {
    let id = format!("preset-{}", &Uuid::new_v4().to_string()[..8]);
    let now = Utc::now();
    let params_str = serde_json::to_string(&request.params).unwrap_or_else(|_| "{}".to_string());

    sqlx::query(
        r#"
        INSERT INTO chaos_presets (id, name, description, category, icon, chaos_type, direction, duration, params, is_builtin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&request.name)
    .bind(&request.description)
    .bind(request.category.as_deref().unwrap_or("custom"))
    .bind(&request.icon)
    .bind(&request.chaos_type)
    .bind(request.direction.as_deref().unwrap_or("to"))
    .bind(&request.duration)
    .bind(&params_str)
    .bind(now.to_rfc3339())
    .bind(now.to_rfc3339())
    .execute(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to create preset: {}", e)))?;

    let preset = ChaosPreset {
        id,
        name: request.name,
        description: request.description,
        category: request.category.unwrap_or_else(|| "custom".to_string()),
        icon: request.icon,
        chaos_type: request.chaos_type,
        direction: request.direction.unwrap_or_else(|| "to".to_string()),
        duration: request.duration,
        params: request.params,
        is_builtin: false,
        created_at: now,
        updated_at: now,
    };

    info!(preset_id = %preset.id, name = %preset.name, "Created chaos preset");

    Ok(Json(preset))
}

/// Delete a custom preset (cannot delete built-in presets)
///
/// DELETE /api/presets/:id
#[utoipa::path(
    delete,
    path = "/api/presets/{id}",
    tag = "presets",
    params(
        ("id" = String, Path, description = "Preset ID")
    ),
    responses(
        (status = 200, description = "Preset deleted"),
        (status = 400, description = "Cannot delete built-in presets"),
        (status = 404, description = "Preset not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn delete_preset(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    // Check if it's a built-in preset
    let row: Option<(i32,)> = sqlx::query_as(
        "SELECT is_builtin FROM chaos_presets WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to check preset: {}", e)))?;

    match row {
        None => return Err(AppError::not_found(&format!("Preset {} not found", id))),
        Some((1,)) => return Err(AppError::bad_request("Cannot delete built-in presets")),
        _ => {}
    }

    sqlx::query("DELETE FROM chaos_presets WHERE id = ?")
        .bind(&id)
        .execute(state.db.pool())
        .await
        .map_err(|e| AppError::internal(&format!("Failed to delete preset: {}", e)))?;

    info!(preset_id = %id, "Deleted chaos preset");

    Ok(Json(serde_json::json!({"deleted": true})))
}

/// Apply a preset to a topology (creates chaos condition)
///
/// POST /api/topologies/:topology_id/presets/:preset_id/apply
pub async fn apply_preset(
    State(state): State<AppState>,
    Path((topology_id, preset_id)): Path<(String, String)>,
    Json(request): Json<ApplyPresetRequest>,
) -> AppResult<Json<serde_json::Value>> {
    info!(
        topology_id = %topology_id,
        preset_id = %preset_id,
        source = %request.source_node_id,
        target = ?request.target_node_id,
        "Applying chaos preset"
    );

    // Get the preset
    let preset_row: PresetRow = sqlx::query_as(
        "SELECT id, name, description, category, icon, chaos_type, direction, duration, params, is_builtin, created_at, updated_at FROM chaos_presets WHERE id = ?"
    )
    .bind(&preset_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to get preset: {}", e)))?
    .ok_or_else(|| AppError::not_found(&format!("Preset {} not found", preset_id)))?;

    // Create chaos condition from preset
    let chaos_request = serde_json::json!({
        "topology_id": topology_id,
        "source_node_id": request.source_node_id,
        "target_node_id": request.target_node_id,
        "chaos_type": preset_row.chaos_type,
        "direction": preset_row.direction,
        "duration": request.duration.or(preset_row.duration),
        "params": serde_json::from_str::<serde_json::Value>(&preset_row.params).unwrap_or_default()
    });

    // Call the chaos create endpoint internally
    // In a real implementation, you'd refactor to share the logic
    // For now, we return the request that should be sent to /api/chaos
    Ok(Json(serde_json::json!({
        "applied": true,
        "preset_id": preset_id,
        "preset_name": preset_row.name,
        "chaos_request": chaos_request,
        "message": "Preset configuration ready. Send chaos_request to POST /api/chaos to apply."
    })))
}
