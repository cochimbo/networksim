use axum::{
    extract::{Path, State},
    Json,
};
use chrono::Utc;
use sqlx::FromRow;
use uuid::Uuid;

use crate::api::{AppState, Event};
use crate::error::{AppError, AppResult};
use crate::models::{CreateTopologyRequest, Topology, UpdateTopologyRequest};

#[derive(FromRow)]
struct TopologyRow {
    id: String,
    name: String,
    description: Option<String>,
    data: String,
    created_at: String,
    updated_at: String,
}

/// List all topologies
pub async fn list(State(state): State<AppState>) -> AppResult<Json<Vec<Topology>>> {
    let rows: Vec<TopologyRow> = sqlx::query_as(
        "SELECT id, name, description, data, created_at, updated_at FROM topologies ORDER BY updated_at DESC"
    )
    .fetch_all(state.db.pool())
    .await?;

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
pub async fn create(
    State(state): State<AppState>,
    Json(req): Json<CreateTopologyRequest>,
) -> AppResult<Json<Topology>> {
    let now = Utc::now();
    let id = Uuid::new_v4().to_string();

    let topology = Topology {
        id: id.clone(),
        name: req.name,
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
pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<Topology>> {
    let row: Option<TopologyRow> = sqlx::query_as(
        "SELECT id, name, description, data, created_at, updated_at FROM topologies WHERE id = ?"
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
        created_at: row.created_at.parse().map_err(|_| AppError::Internal("Invalid date".to_string()))?,
        updated_at: row.updated_at.parse().map_err(|_| AppError::Internal("Invalid date".to_string()))?,
    };

    Ok(Json(topology))
}

/// Update a topology
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
        "UPDATE topologies SET name = ?, description = ?, data = ?, updated_at = ? WHERE id = ?"
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
    let _ = state.event_tx.send(Event::TopologyDeleted { id: id.clone() });

    Ok(Json(serde_json::json!({ "deleted": id })))
}
