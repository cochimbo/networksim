//! NetworkSim Backend Library
//!
//! This library contains all the core components of the NetworkSim backend.

pub mod api;
pub mod chaos;
pub mod config;
pub mod db;
pub mod error;
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
        .route("/api/deployments/active", get(api::deploy::get_active_deployment))
        // Chaos - per topology
        .route("/api/topologies/:id/chaos", get(api::chaos::list))
        .route("/api/topologies/:id/chaos", delete(api::chaos::delete_all))
        .route("/api/topologies/:id/chaos/:condition_id", delete(api::chaos::delete))
        // Chaos - global create
        .route("/api/chaos", post(api::chaos::create))
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
