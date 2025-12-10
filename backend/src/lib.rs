//! NetworkSim Backend Library
//!
//! This library contains all the core components of the NetworkSim backend.

pub mod api;
pub mod chaos;
pub mod config;
pub mod db;
pub mod error;
pub mod helm;
pub mod k8s;
pub mod models;

use axum::{
    routing::{delete, get, post, put},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::api::AppState;

/// Create the application router with the given state
pub fn create_router(state: AppState) -> Router {
    Router::new()
        // Health check
        .route("/health", get(api::health::health_check))
        .route("/api/cluster/status", get(api::health::cluster_status))
        // Topologies
        .route("/api/topologies", get(api::topologies::list))
        .route("/api/topologies", post(api::topologies::create))
        .route("/api/topologies/:id", get(api::topologies::get))
        .route("/api/topologies/:id", put(api::topologies::update))
        .route("/api/topologies/:id", delete(api::topologies::delete))
        // Deployment
        .route("/api/topologies/:id/deploy", post(api::deploy::deploy))
        .route("/api/topologies/:id/deploy", delete(api::deploy::destroy))
        .route("/api/topologies/:id/status", get(api::deploy::status))
        .route(
            "/api/deployments/active",
            get(api::deploy::get_active_deployment),
        )
        // Diagnostic
        .route(
            "/api/topologies/:id/diagnostic",
            get(api::diagnostic::run_diagnostic),
        )
        .route(
            "/api/topologies/:topology_id/nodes/:node_id/containers",
            get(api::diagnostic::get_node_containers),
        )
        // Chaos - per topology
        .route("/api/topologies/:id/chaos", get(api::chaos::list))
        .route("/api/topologies/:id/chaos", delete(api::chaos::delete_all))
        .route(
            "/api/topologies/:id/chaos/start",
            post(api::chaos::start_all),
        )
        .route("/api/topologies/:id/chaos/stop", post(api::chaos::stop_all))
        .route(
            "/api/topologies/:id/chaos/:condition_id",
            delete(api::chaos::delete),
        )
        .route(
            "/api/topologies/:id/chaos/:condition_id",
            put(api::chaos::update),
        )
        .route(
            "/api/topologies/:id/chaos/:condition_id/start",
            post(api::chaos::start),
        )
        .route(
            "/api/topologies/:id/chaos/:condition_id/stop",
            post(api::chaos::stop),
        )
        // Chaos - global create
        .route("/api/chaos", post(api::chaos::create))
        // Applications
        .route("/api/topologies/:topology_id/apps", post(api::applications::deploy_topology))
        .route("/api/topologies/:topology_id/apps", get(api::applications::list_by_topology))
        .route("/api/topologies/:topology_id/nodes/:node_id/apps", post(api::applications::deploy))
        .route("/api/topologies/:topology_id/nodes/:node_id/apps", get(api::applications::list_by_node))
        .route("/api/topologies/:topology_id/apps/:app_id", get(api::applications::get))
        .route("/api/topologies/:topology_id/apps/:app_id", delete(api::applications::uninstall))
        .route("/api/topologies/:topology_id/apps/:app_id/logs", get(api::applications::logs))
        .route("/api/topologies/:topology_id/apps/:app_id/status", get(api::applications::status))
        // WebSocket
        .route("/ws/events", get(api::ws::ws_handler))
        // Metrics
        .route("/metrics", get(api::metrics::metrics_handler))
        // State and middleware
        .with_state(state)
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
}
