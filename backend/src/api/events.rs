//! Events API - Timeline and event management
//!
//! Provides endpoints for event tracking, filtering, and historical data.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;
use utoipa::ToSchema;

use crate::api::AppState;
use crate::error::{AppError, AppResult};

/// Event severity levels
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum EventSeverity {
    Info,
    Success,
    Warning,
    Error,
}

impl std::fmt::Display for EventSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventSeverity::Info => write!(f, "info"),
            EventSeverity::Success => write!(f, "success"),
            EventSeverity::Warning => write!(f, "warning"),
            EventSeverity::Error => write!(f, "error"),
        }
    }
}

/// Event source types
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum EventSourceType {
    Node,
    Link,
    Chaos,
    Deployment,
    Application,
    System,
    Test,
}

impl std::fmt::Display for EventSourceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventSourceType::Node => write!(f, "node"),
            EventSourceType::Link => write!(f, "link"),
            EventSourceType::Chaos => write!(f, "chaos"),
            EventSourceType::Deployment => write!(f, "deployment"),
            EventSourceType::Application => write!(f, "application"),
            EventSourceType::System => write!(f, "system"),
            EventSourceType::Test => write!(f, "test"),
        }
    }
}

/// System event
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Event {
    pub id: i64,
    pub topology_id: Option<String>,
    pub event_type: String,
    pub event_subtype: Option<String>,
    pub severity: String,
    pub title: String,
    pub description: Option<String>,
    #[schema(value_type = Option<Object>)]
    pub metadata: Option<serde_json::Value>,
    pub source_type: Option<String>,
    pub source_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct EventRow {
    id: i64,
    topology_id: Option<String>,
    event_type: String,
    event_subtype: Option<String>,
    severity: String,
    title: String,
    description: Option<String>,
    metadata: Option<String>,
    source_type: Option<String>,
    source_id: Option<String>,
    created_at: String,
}

/// Create event request
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateEventRequest {
    pub topology_id: Option<String>,
    pub event_type: String,
    pub event_subtype: Option<String>,
    pub severity: Option<String>,
    pub title: String,
    pub description: Option<String>,
    #[schema(value_type = Option<Object>)]
    pub metadata: Option<serde_json::Value>,
    pub source_type: Option<String>,
    pub source_id: Option<String>,
}

/// Query parameters for listing events
#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct ListEventsQuery {
    pub topology_id: Option<String>,
    pub event_type: Option<String>,
    pub severity: Option<String>,
    pub source_type: Option<String>,
    pub since: Option<String>,  // ISO 8601 timestamp
    pub until: Option<String>,  // ISO 8601 timestamp
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Events list response with pagination
#[derive(Debug, Serialize, ToSchema)]
pub struct EventsResponse {
    pub events: Vec<Event>,
    pub total: i64,
    pub has_more: bool,
}

/// List events with filtering
#[utoipa::path(
    get,
    path = "/api/events",
    tag = "events",
    params(
        ListEventsQuery
    ),
    responses(
        (status = 200, description = "List of events", body = EventsResponse),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn list_events(
    State(state): State<AppState>,
    Query(query): Query<ListEventsQuery>,
) -> AppResult<Json<EventsResponse>> {
    let limit = query.limit.unwrap_or(100).min(500);
    let offset = query.offset.unwrap_or(0);

    // Build dynamic query
    let mut sql = String::from(
        "SELECT id, topology_id, event_type, event_subtype, severity, title, description, metadata, source_type, source_id, created_at FROM events WHERE 1=1"
    );
    let mut count_sql = String::from("SELECT COUNT(*) as count FROM events WHERE 1=1");

    if let Some(ref tid) = query.topology_id {
        sql.push_str(&format!(" AND topology_id = '{}'", tid));
        count_sql.push_str(&format!(" AND topology_id = '{}'", tid));
    }
    if let Some(ref et) = query.event_type {
        sql.push_str(&format!(" AND event_type = '{}'", et));
        count_sql.push_str(&format!(" AND event_type = '{}'", et));
    }
    if let Some(ref sev) = query.severity {
        sql.push_str(&format!(" AND severity = '{}'", sev));
        count_sql.push_str(&format!(" AND severity = '{}'", sev));
    }
    if let Some(ref st) = query.source_type {
        sql.push_str(&format!(" AND source_type = '{}'", st));
        count_sql.push_str(&format!(" AND source_type = '{}'", st));
    }
    if let Some(ref since) = query.since {
        sql.push_str(&format!(" AND created_at >= '{}'", since));
        count_sql.push_str(&format!(" AND created_at >= '{}'", since));
    }
    if let Some(ref until) = query.until {
        sql.push_str(&format!(" AND created_at <= '{}'", until));
        count_sql.push_str(&format!(" AND created_at <= '{}'", until));
    }

    sql.push_str(" ORDER BY created_at DESC");
    sql.push_str(&format!(" LIMIT {} OFFSET {}", limit, offset));

    // Get total count
    let count_row: (i64,) = sqlx::query_as(&count_sql)
        .fetch_one(state.db.pool())
        .await
        .map_err(|e| AppError::internal(&format!("Failed to count events: {}", e)))?;
    let total = count_row.0;

    // Get events
    let rows: Vec<EventRow> = sqlx::query_as(&sql)
        .fetch_all(state.db.pool())
        .await
        .map_err(|e| AppError::internal(&format!("Failed to list events: {}", e)))?;

    let events: Vec<Event> = rows
        .into_iter()
        .map(|row| Event {
            id: row.id,
            topology_id: row.topology_id,
            event_type: row.event_type,
            event_subtype: row.event_subtype,
            severity: row.severity,
            title: row.title,
            description: row.description,
            metadata: row.metadata.and_then(|s| serde_json::from_str(&s).ok()),
            source_type: row.source_type,
            source_id: row.source_id,
            created_at: row.created_at.parse().unwrap_or_else(|_| Utc::now()),
        })
        .collect();

    Ok(Json(EventsResponse {
        has_more: (offset + events.len() as i64) < total,
        events,
        total,
    }))
}

/// Get events for a specific topology
#[utoipa::path(
    get,
    path = "/api/topologies/{id}/events",
    tag = "events",
    params(
        ("id" = String, Path, description = "Topology ID"),
        ListEventsQuery
    ),
    responses(
        (status = 200, description = "List of topology events", body = EventsResponse),
        (status = 404, description = "Topology not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn list_topology_events(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
    Query(query): Query<ListEventsQuery>,
) -> AppResult<Json<EventsResponse>> {
    let mut new_query = query;
    new_query.topology_id = Some(topology_id);
    list_events(State(state), Query(new_query)).await
}

/// Create a new event
#[utoipa::path(
    post,
    path = "/api/events",
    tag = "events",
    request_body = CreateEventRequest,
    responses(
        (status = 200, description = "Event created", body = Event),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn create_event(
    State(state): State<AppState>,
    Json(request): Json<CreateEventRequest>,
) -> AppResult<Json<Event>> {
    let now = Utc::now();
    let metadata_str = request.metadata.as_ref().map(|m| serde_json::to_string(&m).unwrap_or_default());
    let severity = request.severity.unwrap_or_else(|| "info".to_string());

    let result = sqlx::query(
        r#"
        INSERT INTO events (topology_id, event_type, event_subtype, severity, title, description, metadata, source_type, source_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&request.topology_id)
    .bind(&request.event_type)
    .bind(&request.event_subtype)
    .bind(&severity)
    .bind(&request.title)
    .bind(&request.description)
    .bind(&metadata_str)
    .bind(&request.source_type)
    .bind(&request.source_id)
    .bind(now.to_rfc3339())
    .execute(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to create event: {}", e)))?;

    let id = result.last_insert_rowid();

    // Broadcast event via WebSocket
    let event = Event {
        id,
        topology_id: request.topology_id,
        event_type: request.event_type,
        event_subtype: request.event_subtype,
        severity,
        title: request.title,
        description: request.description,
        metadata: request.metadata,
        source_type: request.source_type,
        source_id: request.source_id,
        created_at: now,
    };

    // Note: Event created events are logged but not broadcast via WebSocket
    // to avoid recursive event creation

    Ok(Json(event))
}

/// Get event statistics
#[utoipa::path(
    get,
    path = "/api/events/stats",
    tag = "events",
    params(
        ListEventsQuery
    ),
    responses(
        (status = 200, description = "Event statistics", body = Object),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn event_stats(
    State(state): State<AppState>,
    Query(query): Query<ListEventsQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let since = query.since.unwrap_or_else(|| {
        (Utc::now() - Duration::hours(24)).to_rfc3339()
    });

    // Get counts by severity
    let severity_counts: Vec<(String, i64)> = sqlx::query_as(
        "SELECT severity, COUNT(*) as count FROM events WHERE created_at >= ? GROUP BY severity"
    )
    .bind(&since)
    .fetch_all(state.db.pool())
    .await
    .unwrap_or_default();

    // Get counts by event type
    let type_counts: Vec<(String, i64)> = sqlx::query_as(
        "SELECT event_type, COUNT(*) as count FROM events WHERE created_at >= ? GROUP BY event_type ORDER BY count DESC LIMIT 10"
    )
    .bind(&since)
    .fetch_all(state.db.pool())
    .await
    .unwrap_or_default();

    // Get total count
    let total: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM events WHERE created_at >= ?"
    )
    .bind(&since)
    .fetch_one(state.db.pool())
    .await
    .unwrap_or((0,));

    let stats = serde_json::json!({
        "total": total.0,
        "since": since,
        "by_severity": severity_counts.into_iter().collect::<std::collections::HashMap<_, _>>(),
        "by_type": type_counts.into_iter().collect::<std::collections::HashMap<_, _>>(),
    });

    Ok(Json(stats))
}

/// Helper function to create an event (for use by other modules)
#[allow(clippy::too_many_arguments)]
pub async fn emit_event(
    state: &AppState,
    topology_id: Option<&str>,
    event_type: &str,
    event_subtype: Option<&str>,
    severity: EventSeverity,
    title: &str,
    description: Option<&str>,
    source_type: Option<EventSourceType>,
    source_id: Option<&str>,
    metadata: Option<serde_json::Value>,
) {
    let now = Utc::now();
    let metadata_str = metadata.as_ref().map(|m| serde_json::to_string(m).unwrap_or_default());

    let result = sqlx::query(
        r#"
        INSERT INTO events (topology_id, event_type, event_subtype, severity, title, description, metadata, source_type, source_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(topology_id)
    .bind(event_type)
    .bind(event_subtype)
    .bind(severity.to_string())
    .bind(title)
    .bind(description)
    .bind(&metadata_str)
    .bind(source_type.map(|st| st.to_string()))
    .bind(source_id)
    .bind(now.to_rfc3339())
    .execute(state.db.pool())
    .await;

    if let Err(e) = result {
        tracing::error!("Failed to insert event: {}", e);
    }

    info!(
        topology_id = ?topology_id,
        event_type = event_type,
        severity = ?severity,
        title = title,
        "Event emitted"
    );
}
