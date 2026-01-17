use axum::{extract::State, Json};
use serde::Serialize;
use utoipa::ToSchema;

use crate::api::AppState;

#[derive(Serialize, ToSchema)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

#[derive(Serialize, ToSchema)]
pub struct ClusterStatusResponse {
    pub connected: bool,
    pub message: String,
}

/// System health check
#[utoipa::path(
    get,
    path = "/health",
    tag = "system",
    responses(
        (status = 200, description = "System is healthy", body = HealthResponse)
    )
)]
pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

/// Get Kubernetes cluster connection status
#[utoipa::path(
    get,
    path = "/api/cluster/status",
    tag = "cluster",
    responses(
        (status = 200, description = "Cluster status", body = ClusterStatusResponse),
    )
)]
pub async fn cluster_status(State(state): State<AppState>) -> Json<ClusterStatusResponse> {
    let connected = state.k8s.read().await.is_some();
    let message = if connected {
        "Kubernetes cluster connected".to_string()
    } else {
        "Kubernetes cluster not available".to_string()
    };

    Json(ClusterStatusResponse { connected, message })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_health_check() {
        let response = health_check().await;
        assert_eq!(response.status, "ok");
    }
}
