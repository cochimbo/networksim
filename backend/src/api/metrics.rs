use axum::response::IntoResponse;

/// Prometheus metrics endpoint
#[utoipa::path(
    get,
    path = "/metrics",
    tag = "metrics",
    responses((status = 200, description = "Prometheus metrics"))
)]
pub async fn metrics_handler() -> impl IntoResponse {
    // TODO: Implement proper metrics in Phase 8
    // For now, return basic placeholder
    let metrics = r#"
# HELP networksim_info NetworkSim backend info
# TYPE networksim_info gauge
networksim_info{version="0.1.0"} 1
"#;

    ([("content-type", "text/plain; charset=utf-8")], metrics)
}
