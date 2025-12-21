//! Live Metrics API - Real-time and historical network metrics
//!
//! Provides endpoints for:
//! - Network metrics between nodes (latency, packet loss, bandwidth)
//! - Node-level metrics (CPU, memory, network I/O)
//! - Historical data queries
//! - Aggregations and statistics

use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{DateTime, Duration, Utc};
use k8s_openapi::api::core::v1::Pod;
use kube::{api::Api, Client};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::collections::HashMap;
use tokio::io::AsyncWriteExt;
use tracing::{info, warn};

use crate::models::Application;

use crate::api::AppState;
use crate::error::{AppError, AppResult};

/// Network metrics between two nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkMetric {
    pub id: i64,
    pub topology_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub latency_ms: Option<f64>,
    pub packet_loss_percent: Option<f64>,
    pub bandwidth_bps: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub is_connected: bool,
    pub measured_at: DateTime<Utc>,
    /// Optional: Source application ID (for app-specific metrics)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_app_id: Option<String>,
    /// Optional: Source application name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_app_name: Option<String>,
    /// Optional: Target application ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_app_id: Option<String>,
    /// Optional: Target application name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_app_name: Option<String>,
    /// Active chaos conditions affecting this metric
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chaos_conditions: Option<Vec<String>>,
}

#[derive(Debug, FromRow)]
struct NetworkMetricRow {
    id: i64,
    topology_id: String,
    source_node_id: String,
    target_node_id: String,
    latency_ms: Option<f64>,
    packet_loss_percent: Option<f64>,
    bandwidth_bps: Option<f64>,
    jitter_ms: Option<f64>,
    is_connected: i32,
    measured_at: String,
}

/// Node-level metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeMetric {
    pub id: i64,
    pub topology_id: String,
    pub node_id: String,
    pub pod_name: Option<String>,
    pub cpu_usage_percent: Option<f64>,
    pub memory_usage_bytes: Option<i64>,
    pub memory_limit_bytes: Option<i64>,
    pub rx_bytes: Option<i64>,
    pub tx_bytes: Option<i64>,
    pub rx_packets: Option<i64>,
    pub tx_packets: Option<i64>,
    pub status: String,
    pub measured_at: DateTime<Utc>,
}

#[allow(dead_code)]
#[derive(Debug, FromRow)]
struct NodeMetricRow {
    id: i64,
    topology_id: String,
    node_id: String,
    pod_name: Option<String>,
    cpu_usage_percent: Option<f64>,
    memory_usage_bytes: Option<i64>,
    memory_limit_bytes: Option<i64>,
    rx_bytes: Option<i64>,
    tx_bytes: Option<i64>,
    rx_packets: Option<i64>,
    tx_packets: Option<i64>,
    status: String,
    measured_at: String,
}

/// Query parameters for metrics
#[derive(Debug, Deserialize)]
pub struct MetricsQuery {
    pub since: Option<String>,      // ISO 8601 timestamp
    pub until: Option<String>,      // ISO 8601 timestamp
    pub interval: Option<String>,   // Aggregation interval: 1m, 5m, 15m, 1h
    pub source_node: Option<String>,
    pub target_node: Option<String>,
    pub limit: Option<i64>,
}

/// Aggregated metrics response
#[derive(Debug, Serialize)]
pub struct AggregatedMetrics {
    pub interval: String,
    pub data_points: Vec<MetricDataPoint>,
}

#[derive(Debug, Serialize)]
pub struct MetricDataPoint {
    pub timestamp: DateTime<Utc>,
    pub avg_latency_ms: Option<f64>,
    pub max_latency_ms: Option<f64>,
    pub min_latency_ms: Option<f64>,
    pub avg_packet_loss: Option<f64>,
    pub sample_count: i64,
}

/// Live metrics snapshot
#[derive(Debug, Serialize)]
pub struct LiveMetricsSnapshot {
    pub topology_id: String,
    pub timestamp: DateTime<Utc>,
    pub network_metrics: Vec<NetworkMetric>,
    pub node_metrics: Vec<NodeMetric>,
    pub summary: MetricsSummary,
}

#[derive(Debug, Serialize)]
pub struct MetricsSummary {
    pub total_nodes: usize,
    pub total_pairs: usize,
    pub connected_pairs: usize,
    pub blocked_pairs: usize,
    /// Pairs with links that are connected (expected behavior)
    pub linked_connected: usize,
    /// Pairs with links that are blocked (problem - should be connected)
    pub linked_blocked: usize,
    /// Pairs without links that are blocked (expected behavior)
    pub unlinked_blocked: usize,
    pub avg_latency_ms: Option<f64>,
    pub max_latency_ms: Option<f64>,
    pub total_packet_loss_events: usize,
}

/// Get live metrics snapshot for a topology
///
/// GET /api/topologies/:id/metrics/live
pub async fn get_live_metrics(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
) -> AppResult<Json<LiveMetricsSnapshot>> {
    info!(topology_id = %topology_id, "Getting live metrics");

    // Check K8s client
    let k8s = state
        .k8s
        .as_ref()
        .ok_or_else(|| AppError::internal("Kubernetes client not configured"))?;

    // Get topology to know expected nodes
    let topology = state
        .db
        .get_topology(&topology_id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Topology {} not found", topology_id)))?;

    // Get pods
    let client: &Client = k8s.inner();
    let pods: Api<Pod> = Api::namespaced(client.clone(), "networksim-sim");

    let pod_list = pods
        .list(&kube::api::ListParams::default().labels(&format!("networksim.io/topology={}", topology_id)))
        .await
        .map_err(|e| AppError::internal(&format!("Failed to list pods: {}", e)))?;

    // Build pod info
    let mut pod_info: HashMap<String, (String, String)> = HashMap::new(); // node_id -> (pod_name, pod_ip)
    for pod in &pod_list.items {
        let node_id = pod
            .metadata
            .labels
            .as_ref()
            .and_then(|l| l.get("networksim.io/node"))
            .cloned()
            .unwrap_or_default();

        let pod_name = pod.metadata.name.clone().unwrap_or_default();
        let pod_ip = pod
            .status
            .as_ref()
            .and_then(|s| s.pod_ip.clone())
            .unwrap_or_default();

        if !node_id.is_empty() && !pod_ip.is_empty() {
            pod_info.insert(node_id, (pod_name, pod_ip));
        }
    }

    let now = Utc::now();
    let mut network_metrics = Vec::new();
    let mut node_metrics = Vec::new();

    // Pre-load all apps and chaos conditions to avoid N+1 queries
    let all_apps = state.db.list_applications(&topology_id).await.unwrap_or_default();
    let all_chaos = state.db.list_chaos_conditions(&topology_id).await.unwrap_or_default();

    // Build apps lookup by node_selector for quick filtering
    let apps_by_node: HashMap<String, Vec<&Application>> = {
        let mut map: HashMap<String, Vec<&Application>> = HashMap::new();
        for app in &all_apps {
            for node_id in &app.node_selector {
                map.entry(node_id.clone()).or_default().push(app);
            }
        }
        map
    };

    // Collect network metrics between all pairs
    let node_ids: Vec<String> = pod_info.keys().cloned().collect();

    for from_node in &node_ids {
        let (from_pod, _from_ip) = match pod_info.get(from_node) {
            Some(info) => info,
            None => continue,
        };

        for to_node in &node_ids {
            if from_node == to_node {
                continue;
            }

            let (_to_pod, to_ip) = match pod_info.get(to_node) {
                Some(info) => info,
                None => continue,
            };

            // Measure connectivity and latency
            let (is_connected, latency_ms, packet_loss) =
                measure_connectivity(client, from_pod, to_ip).await;

            // Get apps on source and target nodes (from pre-loaded data)
            let source_apps: Vec<&Application> = apps_by_node.get(from_node).cloned().unwrap_or_default();
            let target_apps: Vec<&Application> = apps_by_node.get(to_node).cloned().unwrap_or_default();

            // Get chaos conditions affecting this pair (from pre-loaded data)
            let chaos_conditions = &all_chaos;
            let affecting_chaos: Vec<String> = chaos_conditions
                .iter()
                .filter(|c| {
                    c.source_node_id == *from_node &&
                    (c.target_node_id.is_none() || c.target_node_id.as_ref() == Some(to_node)) &&
                    format!("{:?}", c.status).to_lowercase() == "active"
                })
                .map(|c| format!("{}:{:?}", c.id, c.chaos_type))
                .collect();

            let metric = NetworkMetric {
                id: 0,
                topology_id: topology_id.clone(),
                source_node_id: from_node.clone(),
                target_node_id: to_node.clone(),
                latency_ms,
                packet_loss_percent: packet_loss,
                bandwidth_bps: None, // Would need iperf for this
                jitter_ms: None,
                is_connected,
                measured_at: now,
                source_app_id: source_apps.first().map(|a| a.id.to_string()),
                source_app_name: source_apps.first().map(|a| a.image_name.clone()),
                target_app_id: target_apps.first().map(|a| a.id.to_string()),
                target_app_name: target_apps.first().map(|a| a.image_name.clone()),
                chaos_conditions: if affecting_chaos.is_empty() { None } else { Some(affecting_chaos) },
            };

            // Save to database for historical data
            let _ = save_network_metric(&state, &metric).await;

            network_metrics.push(metric);
        }

        // Collect node metrics
        let (pod_name, _) = match pod_info.get(from_node) {
            Some(info) => info,
            None => continue, // Skip if pod info not found
        };
        let pod_status = get_pod_status(&pod_list, pod_name);

        let node_metric = NodeMetric {
            id: 0,
            topology_id: topology_id.clone(),
            node_id: from_node.clone(),
            pod_name: Some(pod_name.clone()),
            cpu_usage_percent: None, // Would need metrics-server
            memory_usage_bytes: None,
            memory_limit_bytes: None,
            rx_bytes: None,
            tx_bytes: None,
            rx_packets: None,
            tx_packets: None,
            status: pod_status,
            measured_at: now,
        };

        let _ = save_node_metric(&state, &node_metric).await;
        node_metrics.push(node_metric);
    }

    // Build set of linked pairs (bidirectional)
    let mut linked_pairs: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
    for link in &topology.links {
        linked_pairs.insert((link.source.clone(), link.target.clone()));
        linked_pairs.insert((link.target.clone(), link.source.clone()));
    }

    // Calculate summary with link awareness
    let connected_pairs = network_metrics.iter().filter(|m| m.is_connected).count();
    let blocked_pairs = network_metrics.iter().filter(|m| !m.is_connected).count();

    // Linked pairs that are connected (good)
    let linked_connected = network_metrics
        .iter()
        .filter(|m| m.is_connected && linked_pairs.contains(&(m.source_node_id.clone(), m.target_node_id.clone())))
        .count();

    // Linked pairs that are blocked (problem!)
    let linked_blocked = network_metrics
        .iter()
        .filter(|m| !m.is_connected && linked_pairs.contains(&(m.source_node_id.clone(), m.target_node_id.clone())))
        .count();

    // Unlinked pairs that are blocked (expected - by design)
    let unlinked_blocked = network_metrics
        .iter()
        .filter(|m| !m.is_connected && !linked_pairs.contains(&(m.source_node_id.clone(), m.target_node_id.clone())))
        .count();

    let latencies: Vec<f64> = network_metrics
        .iter()
        .filter_map(|m| m.latency_ms)
        .collect();

    let avg_latency = if !latencies.is_empty() {
        Some(latencies.iter().sum::<f64>() / latencies.len() as f64)
    } else {
        None
    };

    let max_latency = latencies.iter().cloned().fold(None, |max, val| {
        Some(max.map_or(val, |m: f64| m.max(val)))
    });

    let packet_loss_events = network_metrics
        .iter()
        .filter(|m| m.packet_loss_percent.is_some_and(|p| p > 0.0))
        .count();

    let total_pairs = network_metrics.len();

    let snapshot = LiveMetricsSnapshot {
        topology_id,
        timestamp: now,
        network_metrics,
        node_metrics,
        summary: MetricsSummary {
            total_nodes: node_ids.len(),
            total_pairs,
            connected_pairs,
            blocked_pairs,
            linked_connected,
            linked_blocked,
            unlinked_blocked,
            avg_latency_ms: avg_latency,
            max_latency_ms: max_latency,
            total_packet_loss_events: packet_loss_events,
        },
    };

    Ok(Json(snapshot))
}

/// Get historical network metrics
///
/// GET /api/topologies/:id/metrics/history
pub async fn get_metrics_history(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
    Query(query): Query<MetricsQuery>,
) -> AppResult<Json<Vec<NetworkMetric>>> {
    let since = query.since.unwrap_or_else(|| {
        (Utc::now() - Duration::hours(1)).to_rfc3339()
    });
    let limit = query.limit.unwrap_or(1000).min(5000);

    let mut sql = String::from(
        "SELECT id, topology_id, source_node_id, target_node_id, latency_ms, packet_loss_percent, bandwidth_bps, jitter_ms, is_connected, measured_at FROM network_metrics WHERE topology_id = ? AND measured_at >= ?"
    );

    if let Some(ref source) = query.source_node {
        sql.push_str(&format!(" AND source_node_id = '{}'", source));
    }
    if let Some(ref target) = query.target_node {
        sql.push_str(&format!(" AND target_node_id = '{}'", target));
    }
    if let Some(ref until) = query.until {
        sql.push_str(&format!(" AND measured_at <= '{}'", until));
    }

    sql.push_str(&format!(" ORDER BY measured_at DESC LIMIT {}", limit));

    let rows: Vec<NetworkMetricRow> = sqlx::query_as(&sql)
        .bind(&topology_id)
        .bind(&since)
        .fetch_all(state.db.pool())
        .await
        .map_err(|e| AppError::internal(&format!("Failed to get metrics: {}", e)))?;

    let metrics: Vec<NetworkMetric> = rows
        .into_iter()
        .map(|row| NetworkMetric {
            id: row.id,
            topology_id: row.topology_id,
            source_node_id: row.source_node_id,
            target_node_id: row.target_node_id,
            latency_ms: row.latency_ms,
            packet_loss_percent: row.packet_loss_percent,
            bandwidth_bps: row.bandwidth_bps,
            jitter_ms: row.jitter_ms,
            is_connected: row.is_connected != 0,
            measured_at: row.measured_at.parse().unwrap_or_else(|_| Utc::now()),
            // Historical data doesn't have app info
            source_app_id: None,
            source_app_name: None,
            target_app_id: None,
            target_app_name: None,
            chaos_conditions: None,
        })
        .collect();

    Ok(Json(metrics))
}

/// Get aggregated metrics (for charts)
///
/// GET /api/topologies/:id/metrics/aggregated
pub async fn get_aggregated_metrics(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
    Query(query): Query<MetricsQuery>,
) -> AppResult<Json<AggregatedMetrics>> {
    let since = query.since.unwrap_or_else(|| {
        (Utc::now() - Duration::hours(1)).to_rfc3339()
    });
    let interval = query.interval.unwrap_or_else(|| "5m".to_string());

    // Calculate interval in seconds for grouping
    let interval_seconds = match interval.as_str() {
        "1m" => 60,
        "5m" => 300,
        "15m" => 900,
        "1h" => 3600,
        _ => 300,
    };

    // SQLite doesn't have great time bucketing, so we'll do it in Rust
    let rows: Vec<NetworkMetricRow> = sqlx::query_as(
        "SELECT id, topology_id, source_node_id, target_node_id, latency_ms, packet_loss_percent, bandwidth_bps, jitter_ms, is_connected, measured_at FROM network_metrics WHERE topology_id = ? AND measured_at >= ? ORDER BY measured_at"
    )
    .bind(&topology_id)
    .bind(&since)
    .fetch_all(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to get metrics: {}", e)))?;

    // Group by time buckets
    let mut buckets: HashMap<i64, Vec<NetworkMetricRow>> = HashMap::new();
    for row in rows {
        let timestamp: DateTime<Utc> = row.measured_at.parse().unwrap_or_else(|_| Utc::now());
        let bucket = (timestamp.timestamp() / interval_seconds) * interval_seconds;
        buckets.entry(bucket).or_default().push(row);
    }

    // Calculate aggregates
    let mut data_points: Vec<MetricDataPoint> = buckets
        .into_iter()
        .map(|(bucket, rows)| {
            let latencies: Vec<f64> = rows.iter().filter_map(|r| r.latency_ms).collect();
            let losses: Vec<f64> = rows.iter().filter_map(|r| r.packet_loss_percent).collect();

            MetricDataPoint {
                timestamp: DateTime::from_timestamp(bucket, 0).unwrap_or_else(Utc::now),
                avg_latency_ms: if latencies.is_empty() {
                    None
                } else {
                    Some(latencies.iter().sum::<f64>() / latencies.len() as f64)
                },
                max_latency_ms: latencies.iter().cloned().fold(None, |max, val| {
                    Some(max.map_or(val, |m: f64| m.max(val)))
                }),
                min_latency_ms: latencies.iter().cloned().fold(None, |min, val| {
                    Some(min.map_or(val, |m: f64| m.min(val)))
                }),
                avg_packet_loss: if losses.is_empty() {
                    None
                } else {
                    Some(losses.iter().sum::<f64>() / losses.len() as f64)
                },
                sample_count: rows.len() as i64,
            }
        })
        .collect();

    // Sort by timestamp
    data_points.sort_by_key(|dp| dp.timestamp);

    Ok(Json(AggregatedMetrics {
        interval,
        data_points,
    }))
}

/// Measure connectivity and latency between pods
async fn measure_connectivity(
    client: &Client,
    from_pod: &str,
    to_ip: &str,
) -> (bool, Option<f64>, Option<f64>) {
    use kube::api::{Api, AttachParams};

    let pods: Api<Pod> = Api::namespaced(client.clone(), "networksim-sim");

    let ap = AttachParams {
        stdin: true,
        stdout: true,
        stderr: true,
        tty: false,
        ..Default::default()
    };

    // Ping with timing
    let command = vec![
        "sh".to_string(),
        "-c".to_string(),
        format!(
            "ping -c 5 -W 2 {} 2>/dev/null | tail -1 | awk -F'/' '{{print $5}}'",
            to_ip
        ),
    ];

    match pods.exec(from_pod, command, &ap).await {
        Ok(mut attached) => {
            if let Some(mut stdin) = attached.stdin() {
                let _ = stdin.shutdown().await;
            }

            let mut stdout_str = String::new();
            if let Some(mut stdout) = attached.stdout() {
                use tokio::io::AsyncReadExt;
                let mut buf = [0u8; 256];
                if let Ok(n) = stdout.read(&mut buf).await {
                    stdout_str = String::from_utf8_lossy(&buf[..n]).trim().to_string();
                }
            }

            if let Ok(latency) = stdout_str.parse::<f64>() {
                (true, Some(latency), Some(0.0))
            } else if stdout_str.is_empty() {
                // No response = blocked
                (false, None, Some(100.0))
            } else {
                // Connected but couldn't parse latency
                (true, None, None)
            }
        }
        Err(e) => {
            warn!(error = %e, "Failed to measure connectivity");
            (false, None, None)
        }
    }
}

/// Get pod status from pod list
fn get_pod_status(pod_list: &kube::api::ObjectList<Pod>, pod_name: &str) -> String {
    pod_list
        .items
        .iter()
        .find(|p| p.metadata.name.as_deref() == Some(pod_name))
        .and_then(|p| p.status.as_ref())
        .and_then(|s| s.phase.clone())
        .unwrap_or_else(|| "Unknown".to_string())
}

/// Save network metric to database
async fn save_network_metric(state: &AppState, metric: &NetworkMetric) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO network_metrics (topology_id, source_node_id, target_node_id, latency_ms, packet_loss_percent, bandwidth_bps, jitter_ms, is_connected, measured_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&metric.topology_id)
    .bind(&metric.source_node_id)
    .bind(&metric.target_node_id)
    .bind(metric.latency_ms)
    .bind(metric.packet_loss_percent)
    .bind(metric.bandwidth_bps)
    .bind(metric.jitter_ms)
    .bind(if metric.is_connected { 1 } else { 0 })
    .bind(metric.measured_at.to_rfc3339())
    .execute(state.db.pool())
    .await?;

    Ok(())
}

/// Save node metric to database
async fn save_node_metric(state: &AppState, metric: &NodeMetric) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO node_metrics (topology_id, node_id, pod_name, cpu_usage_percent, memory_usage_bytes, memory_limit_bytes, rx_bytes, tx_bytes, rx_packets, tx_packets, status, measured_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&metric.topology_id)
    .bind(&metric.node_id)
    .bind(&metric.pod_name)
    .bind(metric.cpu_usage_percent)
    .bind(metric.memory_usage_bytes)
    .bind(metric.memory_limit_bytes)
    .bind(metric.rx_bytes)
    .bind(metric.tx_bytes)
    .bind(metric.rx_packets)
    .bind(metric.tx_packets)
    .bind(&metric.status)
    .bind(metric.measured_at.to_rfc3339())
    .execute(state.db.pool())
    .await?;

    Ok(())
}

/// Clean up old metrics (retention policy)
pub async fn cleanup_old_metrics(state: &AppState, retention_hours: i64) -> Result<(u64, u64), sqlx::Error> {
    let cutoff = (Utc::now() - Duration::hours(retention_hours)).to_rfc3339();

    let network_deleted = sqlx::query("DELETE FROM network_metrics WHERE measured_at < ?")
        .bind(&cutoff)
        .execute(state.db.pool())
        .await?
        .rows_affected();

    let node_deleted = sqlx::query("DELETE FROM node_metrics WHERE measured_at < ?")
        .bind(&cutoff)
        .execute(state.db.pool())
        .await?
        .rows_affected();

    info!(
        network_deleted = network_deleted,
        node_deleted = node_deleted,
        "Cleaned up old metrics"
    );

    Ok((network_deleted, node_deleted))
}

/// Metrics grouped by application
#[derive(Debug, Serialize)]
pub struct AppMetrics {
    pub app_id: String,
    pub app_name: String,
    pub node_id: String,
    pub avg_latency_ms: Option<f64>,
    pub max_latency_ms: Option<f64>,
    pub min_latency_ms: Option<f64>,
    pub avg_packet_loss: Option<f64>,
    pub sample_count: i64,
    pub is_affected_by_chaos: bool,
    pub chaos_types: Vec<String>,
}

/// Response for metrics by app endpoint
#[derive(Debug, Serialize)]
pub struct MetricsByAppResponse {
    pub topology_id: String,
    pub timestamp: DateTime<Utc>,
    pub apps: Vec<AppMetrics>,
}

/// Get metrics aggregated by application
///
/// GET /api/topologies/:topology_id/metrics/by-app
pub async fn get_metrics_by_app(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
) -> AppResult<Json<MetricsByAppResponse>> {
    // Get all applications for this topology
    let apps = state.db.list_applications(&topology_id).await
        .map_err(|e| AppError::internal(&format!("Failed to list applications: {}", e)))?;

    // Get recent network metrics (last 5 minutes)
    let since = (Utc::now() - Duration::minutes(5)).to_rfc3339();
    let metrics: Vec<NetworkMetricRow> = sqlx::query_as(
        "SELECT id, topology_id, source_node_id, target_node_id, latency_ms, packet_loss_percent, bandwidth_bps, jitter_ms, is_connected, measured_at FROM network_metrics WHERE topology_id = ? AND measured_at > ? ORDER BY measured_at DESC"
    )
    .bind(&topology_id)
    .bind(&since)
    .fetch_all(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to fetch metrics: {}", e)))?;

    // Get active chaos conditions
    let chaos_conditions = state.db.list_chaos_conditions(&topology_id).await
        .unwrap_or_default();
    let active_chaos: Vec<_> = chaos_conditions
        .iter()
        .filter(|c| format!("{:?}", c.status).to_lowercase() == "active")
        .collect();

    // Aggregate metrics per app
    let mut app_metrics = Vec::new();

    for app in apps {
        for node_id in &app.node_selector {
            // Get metrics where this node is source or target
            let relevant_metrics: Vec<_> = metrics
                .iter()
                .filter(|m| m.source_node_id == *node_id || m.target_node_id == *node_id)
                .collect();

            if relevant_metrics.is_empty() {
                continue;
            }

            // Calculate aggregates
            let latencies: Vec<f64> = relevant_metrics
                .iter()
                .filter_map(|m| m.latency_ms)
                .collect();

            let losses: Vec<f64> = relevant_metrics
                .iter()
                .filter_map(|m| m.packet_loss_percent)
                .collect();

            // Check if affected by chaos
            let affecting_chaos: Vec<String> = active_chaos
                .iter()
                .filter(|c| c.source_node_id == *node_id || c.target_node_id.as_ref() == Some(node_id))
                .map(|c| format!("{:?}", c.chaos_type))
                .collect();

            app_metrics.push(AppMetrics {
                app_id: app.id.to_string(),
                app_name: app.image_name.clone(),
                node_id: node_id.clone(),
                avg_latency_ms: if latencies.is_empty() {
                    None
                } else {
                    Some(latencies.iter().sum::<f64>() / latencies.len() as f64)
                },
                max_latency_ms: latencies.iter().cloned().fold(None, |max, val| {
                    Some(max.map_or(val, |m: f64| m.max(val)))
                }),
                min_latency_ms: latencies.iter().cloned().fold(None, |min, val| {
                    Some(min.map_or(val, |m: f64| m.min(val)))
                }),
                avg_packet_loss: if losses.is_empty() {
                    None
                } else {
                    Some(losses.iter().sum::<f64>() / losses.len() as f64)
                },
                sample_count: relevant_metrics.len() as i64,
                is_affected_by_chaos: !affecting_chaos.is_empty(),
                chaos_types: affecting_chaos,
            });
        }
    }

    Ok(Json(MetricsByAppResponse {
        topology_id,
        timestamp: Utc::now(),
        apps: app_metrics,
    }))
}
