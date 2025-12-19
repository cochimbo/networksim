use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::Utc;
use serde::Deserialize;
use sqlx::FromRow;
use uuid::Uuid;

use crate::api::{AppState, Event};
use crate::error::{AppError, AppResult};
use crate::models::{CreateTopologyRequest, Topology, UpdateTopologyRequest};

/// Optional pagination parameters
#[derive(Debug, Deserialize)]
pub struct OptionalPaginationParams {
    /// Page number (1-indexed)
    pub page: Option<u32>,
    /// Items per page (max: 100)
    pub per_page: Option<u32>,
}

/// Paginated response for topologies
#[derive(Debug, serde::Serialize)]
pub struct PaginatedTopologies {
    pub items: Vec<Topology>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub per_page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_pages: Option<u32>,
}

#[derive(FromRow)]
struct TopologyRow {
    id: String,
    name: String,
    description: Option<String>,
    data: String,
    created_at: String,
    updated_at: String,
}

/// List all topologies with optional pagination
#[utoipa::path(
    get,
    path = "/api/topologies",
    tag = "topologies",
    params(
        ("page" = Option<u32>, Query, description = "Page number (1-indexed)"),
        ("per_page" = Option<u32>, Query, description = "Items per page (max 100)")
    ),
    responses(
        (status = 200, description = "List of all topologies", body = Vec<super::openapi::TopologySchema>),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<OptionalPaginationParams>,
) -> AppResult<Json<Vec<Topology>>> {
    let rows: Vec<TopologyRow> = if let (Some(page), Some(per_page)) = (params.page, params.per_page) {
        // Pagination requested
        let per_page = per_page.min(100);
        let offset = ((page.saturating_sub(1)) as i64) * (per_page as i64);

        sqlx::query_as(
            "SELECT id, name, description, data, created_at, updated_at FROM topologies ORDER BY updated_at DESC LIMIT ? OFFSET ?"
        )
        .bind(per_page as i64)
        .bind(offset)
        .fetch_all(state.db.pool())
        .await?
    } else {
        // No pagination - return all
        sqlx::query_as(
            "SELECT id, name, description, data, created_at, updated_at FROM topologies ORDER BY updated_at DESC"
        )
        .fetch_all(state.db.pool())
        .await?
    };

    let topologies: Vec<Topology> = rows
        .into_iter()
        .filter_map(|row| {
            let data: serde_json::Value = serde_json::from_str(&row.data).ok()?;
            Some(Topology {
                id: row.id,
                name: row.name,
                description: row.description,
                nodes: serde_json::from_value(data.get("nodes")?.clone()).ok()?,
                links: serde_json::from_value(data.get("links")?.clone()).ok()?,
                created_at: row.created_at.parse().ok()?,
                updated_at: row.updated_at.parse().ok()?,
            })
        })
        .collect();

    Ok(Json(topologies))
}

/// Create a new topology
#[utoipa::path(
    post,
    path = "/api/topologies",
    tag = "topologies",
    request_body = super::openapi::CreateTopologyRequest,
    responses(
        (status = 200, description = "Topology created successfully", body = super::openapi::TopologySchema),
        (status = 400, description = "Invalid topology data"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn create(
    State(state): State<AppState>,
    Json(req): Json<CreateTopologyRequest>,
) -> AppResult<Json<Topology>> {
    let now = Utc::now();
    let id = Uuid::new_v4().to_string();

    let topology = Topology {
        id: id.clone(),
        name: req.name.unwrap_or_default(),
        description: req.description,
        nodes: req.nodes,
        links: req.links,
        created_at: now,
        updated_at: now,
    };

    // Validate topology
    topology.validate().map_err(AppError::BadRequest)?;

    let data = serde_json::json!({
        "nodes": topology.nodes,
        "links": topology.links,
    });
    let data_str = data.to_string();
    let now_str = now.to_rfc3339();

    sqlx::query(
        "INSERT INTO topologies (id, name, description, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&topology.id)
    .bind(&topology.name)
    .bind(&topology.description)
    .bind(&data_str)
    .bind(&now_str)
    .bind(&now_str)
    .execute(state.db.pool())
    .await?;

    // Broadcast event
    let _ = state.event_tx.send(Event::TopologyCreated { id });

    Ok(Json(topology))
}

/// Get a topology by ID
#[utoipa::path(
    get,
    path = "/api/topologies/{id}",
    tag = "topologies",
    params(
        ("id" = String, Path, description = "Topology ID")
    ),
    responses(
        (status = 200, description = "Topology found", body = super::openapi::TopologySchema),
        (status = 404, description = "Topology not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<Topology>> {
    let row: Option<TopologyRow> = sqlx::query_as(
        "SELECT id, name, description, data, created_at, updated_at FROM topologies WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(state.db.pool())
    .await?;

    let row = row.ok_or_else(|| AppError::NotFound(format!("Topology not found: {}", id)))?;

    let data: serde_json::Value = serde_json::from_str(&row.data)?;

    let topology = Topology {
        id: row.id,
        name: row.name,
        description: row.description,
        nodes: serde_json::from_value(data.get("nodes").cloned().unwrap_or_default())?,
        links: serde_json::from_value(data.get("links").cloned().unwrap_or_default())?,
        created_at: row
            .created_at
            .parse()
            .map_err(|_| AppError::Internal("Invalid date".to_string()))?,
        updated_at: row
            .updated_at
            .parse()
            .map_err(|_| AppError::Internal("Invalid date".to_string()))?,
    };

    Ok(Json(topology))
}

/// Update a topology
#[utoipa::path(
    put,
    path = "/api/topologies/{id}",
    tag = "topologies",
    params(
        ("id" = String, Path, description = "Topology ID")
    ),
    request_body = super::openapi::UpdateTopologyRequest,
    responses(
        (status = 200, description = "Topology updated", body = super::openapi::TopologySchema),
        (status = 404, description = "Topology not found"),
        (status = 500, description = "Internal server error")
    )
)]
#[axum::debug_handler]
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateTopologyRequest>,
) -> AppResult<Json<Topology>> {
    // Get existing topology
    let existing = get(State(state.clone()), Path(id.clone())).await?.0;

    let now = Utc::now();
    let topology = Topology {
        id: id.clone(),
        name: req.name.unwrap_or(existing.name),
        description: req.description.or(existing.description),
        nodes: req.nodes.unwrap_or(existing.nodes),
        links: req.links.unwrap_or(existing.links),
        created_at: existing.created_at,
        updated_at: now,
    };

    // Validate topology
    topology.validate().map_err(AppError::BadRequest)?;

    let data = serde_json::json!({
        "nodes": topology.nodes,
        "links": topology.links,
    });
    let data_str = data.to_string();
    let now_str = now.to_rfc3339();

    sqlx::query(
        "UPDATE topologies SET name = ?, description = ?, data = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&topology.name)
    .bind(&topology.description)
    .bind(&data_str)
    .bind(&now_str)
    .bind(&id)
    .execute(state.db.pool())
    .await?;

    // Broadcast event
    let _ = state.event_tx.send(Event::TopologyUpdated { id });

    Ok(Json(topology))
}

/// Delete a topology
#[utoipa::path(
    delete,
    path = "/api/topologies/{id}",
    tag = "topologies",
    params(
        ("id" = String, Path, description = "Topology ID")
    ),
    responses(
        (status = 200, description = "Topology deleted"),
        (status = 404, description = "Topology not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM topologies WHERE id = ?")
        .bind(&id)
        .execute(state.db.pool())
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Topology not found: {}", id)));
    }

    // Broadcast event
    let _ = state
        .event_tx
        .send(Event::TopologyDeleted { id: id.clone() });

    Ok(Json(serde_json::json!({ "deleted": id })))
}
