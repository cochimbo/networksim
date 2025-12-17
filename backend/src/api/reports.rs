//! Reports API
//!
//! Generate reports for topologies including chaos experiments, metrics, and events

use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::api::AppState;
use crate::error::{AppError, AppResult};

/// Database record for events
#[derive(Debug, sqlx::FromRow)]
struct EventRecord {
    id: String,
    event_type: String,
    message: String,
    created_at: DateTime<Utc>,
}

/// Query parameters for report generation
#[derive(Debug, Deserialize)]
pub struct ReportQuery {
    /// Include events in the report
    #[serde(default = "default_true")]
    pub include_events: bool,
    /// Include chaos conditions in the report
    #[serde(default = "default_true")]
    pub include_chaos: bool,
    /// Include applications in the report
    #[serde(default = "default_true")]
    pub include_apps: bool,
    /// Time range start (ISO 8601)
    pub from: Option<DateTime<Utc>>,
    /// Time range end (ISO 8601)
    pub to: Option<DateTime<Utc>>,
}

fn default_true() -> bool {
    true
}

/// Complete report structure
#[derive(Debug, Serialize)]
pub struct TopologyReport {
    pub generated_at: DateTime<Utc>,
    pub topology: TopologySummary,
    pub chaos_summary: ChaosSummary,
    pub applications: Vec<ApplicationSummary>,
    pub events: Vec<EventSummary>,
    pub statistics: ReportStatistics,
}

#[derive(Debug, Serialize)]
pub struct TopologySummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub node_count: usize,
    pub link_count: usize,
    pub nodes: Vec<NodeSummary>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct NodeSummary {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct ChaosSummary {
    pub total_conditions: usize,
    pub active_conditions: usize,
    pub conditions_by_type: Vec<ChaosTypeCount>,
    pub conditions: Vec<ChaosConditionSummary>,
}

#[derive(Debug, Serialize)]
pub struct ChaosTypeCount {
    pub chaos_type: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct ChaosConditionSummary {
    pub id: String,
    pub chaos_type: String,
    pub source_node: String,
    pub target_node: Option<String>,
    pub status: String,
    pub duration: Option<String>,
    pub params: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct ApplicationSummary {
    pub id: String,
    pub image: String,
    pub node_id: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct EventSummary {
    pub id: String,
    pub event_type: String,
    pub message: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ReportStatistics {
    pub total_chaos_experiments: usize,
    pub unique_chaos_types: usize,
    pub affected_nodes: usize,
    pub total_events: usize,
    pub deployed_apps: usize,
}

/// Generate a JSON report for a topology
#[utoipa::path(
    get,
    path = "/api/topologies/{id}/report",
    tag = "reports",
    params(
        ("id" = String, Path, description = "Topology ID"),
        ("include_events" = Option<bool>, Query, description = "Include events"),
        ("include_chaos" = Option<bool>, Query, description = "Include chaos conditions"),
        ("include_apps" = Option<bool>, Query, description = "Include applications"),
    ),
    responses(
        (status = 200, description = "Report generated successfully"),
        (status = 404, description = "Topology not found")
    )
)]
pub async fn generate_report(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
    Query(query): Query<ReportQuery>,
) -> AppResult<Json<TopologyReport>> {
    let report = build_report(&state, &topology_id, &query).await?;
    Ok(Json(report))
}

/// Generate an HTML report for a topology
#[utoipa::path(
    get,
    path = "/api/topologies/{id}/report/html",
    tag = "reports",
    params(
        ("id" = String, Path, description = "Topology ID"),
    ),
    responses(
        (status = 200, description = "HTML report generated successfully"),
        (status = 404, description = "Topology not found")
    )
)]
pub async fn generate_html_report(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
) -> AppResult<Response> {
    let query = ReportQuery {
        include_events: true,
        include_chaos: true,
        include_apps: true,
        from: None,
        to: None,
    };

    let report = build_report(&state, &topology_id, &query).await?;
    let html = render_html_report(&report);

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CONTENT_DISPOSITION, &format!("attachment; filename=\"report-{}.html\"", topology_id)),
        ],
        html,
    ).into_response())
}

async fn build_report(
    state: &AppState,
    topology_id: &str,
    query: &ReportQuery,
) -> AppResult<TopologyReport> {
    // Get topology
    let topology = state
        .db
        .get_topology(topology_id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Topology {} not found", topology_id)))?;

    // Get chaos conditions
    let chaos_conditions = if query.include_chaos {
        state.db.list_chaos_conditions(topology_id).await?
    } else {
        Vec::new()
    };

    // Get applications
    let applications = if query.include_apps {
        state.db.list_applications(topology_id).await?
    } else {
        Vec::new()
    };

    // Get events from database directly
    let events: Vec<EventRecord> = if query.include_events {
        sqlx::query_as::<_, EventRecord>(
            "SELECT id, event_type, COALESCE(description, title, '') as message, created_at
             FROM events WHERE topology_id = ? ORDER BY created_at DESC LIMIT 100"
        )
        .bind(topology_id)
        .fetch_all(state.db.pool())
        .await
        .unwrap_or_default()
    } else {
        Vec::new()
    };

    // Build node lookup
    let node_names: std::collections::HashMap<String, String> = topology
        .nodes
        .iter()
        .map(|n| (n.id.clone(), n.name.clone()))
        .collect();

    // Build chaos summary
    let active_count = chaos_conditions.iter().filter(|c| c.status == crate::chaos::ChaosConditionStatus::Active).count();

    let mut type_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for condition in &chaos_conditions {
        *type_counts.entry(condition.chaos_type.to_string()).or_insert(0) += 1;
    }

    let conditions_by_type: Vec<ChaosTypeCount> = type_counts
        .into_iter()
        .map(|(chaos_type, count)| ChaosTypeCount { chaos_type, count })
        .collect();
    let unique_chaos_types_count = conditions_by_type.len();

    let chaos_summaries: Vec<ChaosConditionSummary> = chaos_conditions
        .iter()
        .map(|c| ChaosConditionSummary {
            id: c.id.clone(),
            chaos_type: c.chaos_type.to_string(),
            source_node: node_names.get(&c.source_node_id).cloned().unwrap_or_else(|| c.source_node_id.clone()),
            target_node: c.target_node_id.as_ref().map(|t| node_names.get(t).cloned().unwrap_or_else(|| t.clone())),
            status: format!("{:?}", c.status).to_lowercase(),
            duration: c.duration.clone(),
            params: c.params.clone(),
        })
        .collect();

    // Collect affected nodes
    let mut affected_nodes: std::collections::HashSet<String> = std::collections::HashSet::new();
    for condition in &chaos_conditions {
        affected_nodes.insert(condition.source_node_id.clone());
        if let Some(ref target) = condition.target_node_id {
            affected_nodes.insert(target.clone());
        }
    }

    // Build application summaries
    let app_summaries: Vec<ApplicationSummary> = applications
        .iter()
        .map(|a| ApplicationSummary {
            id: a.id.to_string(),
            image: a.image_name.clone(),
            node_id: a.node_selector.first().cloned().unwrap_or_default(),
            status: a.status.to_string(),
        })
        .collect();

    // Build event summaries
    let event_summaries: Vec<EventSummary> = events
        .iter()
        .map(|e| EventSummary {
            id: e.id.clone(),
            event_type: e.event_type.clone(),
            message: e.message.clone(),
            created_at: e.created_at.to_rfc3339(),
        })
        .collect();

    Ok(TopologyReport {
        generated_at: Utc::now(),
        topology: TopologySummary {
            id: topology.id.clone(),
            name: topology.name.clone(),
            description: topology.description.clone(),
            node_count: topology.nodes.len(),
            link_count: topology.links.len(),
            nodes: topology.nodes.iter().map(|n| NodeSummary {
                id: n.id.clone(),
                name: n.name.clone(),
            }).collect(),
            created_at: topology.created_at,
        },
        chaos_summary: ChaosSummary {
            total_conditions: chaos_conditions.len(),
            active_conditions: active_count,
            conditions_by_type,
            conditions: chaos_summaries,
        },
        applications: app_summaries,
        events: event_summaries,
        statistics: ReportStatistics {
            total_chaos_experiments: chaos_conditions.len(),
            unique_chaos_types: unique_chaos_types_count,
            affected_nodes: affected_nodes.len(),
            total_events: events.len(),
            deployed_apps: applications.len(),
        },
    })
}

fn render_html_report(report: &TopologyReport) -> String {
    format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chaos Engineering Report - {topology_name}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            border-radius: 12px;
            margin-bottom: 30px;
        }}
        .header h1 {{ font-size: 2.5em; margin-bottom: 10px; }}
        .header .meta {{ opacity: 0.9; font-size: 0.9em; }}
        .section {{
            background: white;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}
        .section h2 {{
            color: #667eea;
            border-bottom: 2px solid #eee;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }}
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }}
        .stat-card {{
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }}
        .stat-card .value {{ font-size: 2.5em; font-weight: bold; color: #667eea; }}
        .stat-card .label {{ color: #666; font-size: 0.9em; }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }}
        th, td {{
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }}
        th {{ background: #f8f9fa; font-weight: 600; color: #555; }}
        tr:hover {{ background: #f8f9fa; }}
        .status {{
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 500;
        }}
        .status-active {{ background: #d4edda; color: #155724; }}
        .status-pending {{ background: #fff3cd; color: #856404; }}
        .status-paused {{ background: #f8d7da; color: #721c24; }}
        .chaos-type {{
            display: inline-block;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.85em;
            background: #e9ecef;
        }}
        .node-list {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 15px; }}
        .node-chip {{
            background: #667eea;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.9em;
        }}
        .footer {{
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.9em;
        }}
        .empty {{ color: #999; font-style: italic; padding: 20px; text-align: center; }}
        @media print {{
            body {{ background: white; }}
            .section {{ box-shadow: none; border: 1px solid #ddd; }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Chaos Engineering Report</h1>
            <div class="meta">
                <strong>Topology:</strong> {topology_name}<br>
                <strong>Generated:</strong> {generated_at}<br>
                {description}
            </div>
        </div>

        <div class="section">
            <h2>Summary Statistics</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="value">{node_count}</div>
                    <div class="label">Nodes</div>
                </div>
                <div class="stat-card">
                    <div class="value">{link_count}</div>
                    <div class="label">Links</div>
                </div>
                <div class="stat-card">
                    <div class="value">{chaos_count}</div>
                    <div class="label">Chaos Experiments</div>
                </div>
                <div class="stat-card">
                    <div class="value">{active_chaos}</div>
                    <div class="label">Active Chaos</div>
                </div>
                <div class="stat-card">
                    <div class="value">{app_count}</div>
                    <div class="label">Applications</div>
                </div>
                <div class="stat-card">
                    <div class="value">{event_count}</div>
                    <div class="label">Events</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>Topology Nodes</h2>
            <div class="node-list">
                {nodes_html}
            </div>
        </div>

        <div class="section">
            <h2>Chaos Conditions</h2>
            {chaos_table}
        </div>

        <div class="section">
            <h2>Applications</h2>
            {apps_table}
        </div>

        <div class="section">
            <h2>Recent Events</h2>
            {events_table}
        </div>

        <div class="footer">
            Generated by NetworkSim Chaos Engineering Platform<br>
            Report ID: {topology_id} | {generated_at}
        </div>
    </div>
</body>
</html>"#,
        topology_name = report.topology.name,
        topology_id = report.topology.id,
        generated_at = report.generated_at.format("%Y-%m-%d %H:%M:%S UTC"),
        description = report.topology.description.as_ref().map(|d| format!("<strong>Description:</strong> {}", d)).unwrap_or_default(),
        node_count = report.topology.node_count,
        link_count = report.topology.link_count,
        chaos_count = report.chaos_summary.total_conditions,
        active_chaos = report.chaos_summary.active_conditions,
        app_count = report.applications.len(),
        event_count = report.events.len(),
        nodes_html = render_nodes_html(&report.topology.nodes),
        chaos_table = render_chaos_table(&report.chaos_summary.conditions),
        apps_table = render_apps_table(&report.applications),
        events_table = render_events_table(&report.events),
    )
}

fn render_nodes_html(nodes: &[NodeSummary]) -> String {
    if nodes.is_empty() {
        return "<div class=\"empty\">No nodes defined</div>".to_string();
    }
    nodes.iter()
        .map(|n| format!("<span class=\"node-chip\">{}</span>", n.name))
        .collect::<Vec<_>>()
        .join("\n")
}

fn render_chaos_table(conditions: &[ChaosConditionSummary]) -> String {
    if conditions.is_empty() {
        return "<div class=\"empty\">No chaos conditions configured</div>".to_string();
    }

    let rows: String = conditions.iter()
        .map(|c| format!(
            "<tr><td><span class=\"chaos-type\">{}</span></td><td>{}</td><td>{}</td><td><span class=\"status status-{}\">{}</span></td><td>{}</td></tr>",
            c.chaos_type,
            c.source_node,
            c.target_node.as_ref().unwrap_or(&"-".to_string()),
            c.status,
            c.status,
            c.duration.as_ref().unwrap_or(&"indefinite".to_string())
        ))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "<table><thead><tr><th>Type</th><th>Source</th><th>Target</th><th>Status</th><th>Duration</th></tr></thead><tbody>{}</tbody></table>",
        rows
    )
}

fn render_apps_table(apps: &[ApplicationSummary]) -> String {
    if apps.is_empty() {
        return "<div class=\"empty\">No applications deployed</div>".to_string();
    }

    let rows: String = apps.iter()
        .map(|a| format!(
            "<tr><td>{}</td><td>{}</td><td><span class=\"status status-{}\">{}</span></td></tr>",
            a.image,
            a.node_id,
            if a.status == "running" { "active" } else { "pending" },
            a.status
        ))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "<table><thead><tr><th>Image</th><th>Node</th><th>Status</th></tr></thead><tbody>{}</tbody></table>",
        rows
    )
}

fn render_events_table(events: &[EventSummary]) -> String {
    if events.is_empty() {
        return "<div class=\"empty\">No events recorded</div>".to_string();
    }

    let rows: String = events.iter()
        .take(20) // Limit to 20 most recent
        .map(|e| format!(
            "<tr><td>{}</td><td>{}</td><td>{}</td></tr>",
            e.created_at,
            e.event_type,
            e.message
        ))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "<table><thead><tr><th>Time</th><th>Type</th><th>Message</th></tr></thead><tbody>{}</tbody></table>",
        rows
    )
}
