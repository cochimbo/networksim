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
use axum::http::{header, Method};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::api::AppState;
use crate::api::openapi::ApiDoc;

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
        .route("/api/topologies/:id/duplicate", post(api::topologies::duplicate))
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
        .route("/api/topologies/:topology_id/apps/draft", post(api::applications::create_draft))
        .route("/api/topologies/:topology_id/apps", get(api::applications::list_by_topology))
        .route("/api/topologies/:topology_id/apps/:app_id", put(api::applications::update_application))
        .route("/api/topologies/:topology_id/nodes/:node_id/apps", post(api::applications::deploy))
        .route("/api/topologies/:topology_id/nodes/:node_id/apps", get(api::applications::list_by_node))
        .route("/api/topologies/:topology_id/apps/:app_id", get(api::applications::get))
        .route("/api/topologies/:topology_id/apps/:app_id", delete(api::applications::uninstall))
        .route("/api/topologies/:topology_id/apps/:app_id/logs", get(api::applications::logs))
        .route("/api/topologies/:topology_id/apps/:app_id/status", get(api::applications::status))
        // WebSocket
        .route("/ws/events", get(api::ws::ws_handler))
        // Metrics (Prometheus)
        .route("/metrics", get(api::metrics::metrics_handler))
        // Live Metrics
        .route(
            "/api/topologies/:id/metrics/live",
            get(api::live_metrics::get_live_metrics),
        )
        .route(
            "/api/topologies/:id/metrics/history",
            get(api::live_metrics::get_metrics_history),
        )
        .route(
            "/api/topologies/:id/metrics/aggregated",
            get(api::live_metrics::get_aggregated_metrics),
        )
        .route(
            "/api/topologies/:id/metrics/by-app",
            get(api::live_metrics::get_metrics_by_app),
        )
        // Events
        .route("/api/events", get(api::events::list_events))
        .route("/api/events", post(api::events::create_event))
        .route("/api/events/stats", get(api::events::event_stats))
        .route(
            "/api/topologies/:id/events",
            get(api::events::list_topology_events),
        )
        // Presets
        .route("/api/presets", get(api::presets::list_presets))
        .route("/api/presets", post(api::presets::create_preset))
        .route("/api/presets/:id", get(api::presets::get_preset))
        .route("/api/presets/:id", delete(api::presets::delete_preset))
        .route(
            "/api/topologies/:topology_id/presets/:preset_id/apply",
            post(api::presets::apply_preset),
        )
        // Registry Configuration
        .route("/api/registries", get(api::registry::list_registries))
        .route("/api/registries", post(api::registry::create_registry))
        .route("/api/registries/default", get(api::registry::get_default_registry))
        .route("/api/registries/:id", get(api::registry::get_registry))
        .route("/api/registries/:id", put(api::registry::update_registry))
        .route("/api/registries/:id", delete(api::registry::delete_registry))
        .route("/api/registries/:id/test", post(api::registry::test_registry))
        // Test Runner
        .route("/api/topologies/:id/tests", get(api::test_runner::list_tests))
        .route("/api/topologies/:id/tests", post(api::test_runner::start_test))
        .route(
            "/api/topologies/:topology_id/tests/:test_id",
            get(api::test_runner::get_test),
        )
        .route(
            "/api/topologies/:topology_id/tests/:test_id/cancel",
            post(api::test_runner::cancel_test),
        )
        // =========================================================================
        // API v1 - Standardized endpoints with new features
        // =========================================================================
        // Chaos affected apps (new)
        .route(
            "/api/v1/chaos/:condition_id/affected-apps",
            get(api::chaos::affected_apps),
        )
        // App-to-app tests (new)
        .route(
            "/api/v1/topologies/:id/tests/app-to-app",
            post(api::diagnostic::run_app_to_app_test),
        )
        // v1 aliases for existing endpoints (for gradual migration)
        .route("/api/v1/topologies", get(api::topologies::list))
        .route("/api/v1/topologies", post(api::topologies::create))
        .route("/api/v1/topologies/:id", get(api::topologies::get))
        .route("/api/v1/topologies/:id", put(api::topologies::update))
        .route("/api/v1/topologies/:id", delete(api::topologies::delete))
        .route("/api/v1/topologies/:id/deploy", post(api::deploy::deploy))
        .route("/api/v1/topologies/:id/deploy", delete(api::deploy::destroy))
        .route("/api/v1/topologies/:id/status", get(api::deploy::status))
        .route("/api/v1/topologies/:id/chaos", get(api::chaos::list))
        .route("/api/v1/topologies/:id/chaos", delete(api::chaos::delete_all))
        .route("/api/v1/chaos", post(api::chaos::create))
        .route("/api/v1/presets", get(api::presets::list_presets))
        .route("/api/v1/presets", post(api::presets::create_preset))
        .route("/api/v1/presets/:id", get(api::presets::get_preset))
        .route("/api/v1/presets/:id", delete(api::presets::delete_preset))
        .route("/api/v1/cluster/status", get(api::health::cluster_status))
        // Templates
        .route("/api/templates", get(api::templates::list))
        .route("/api/templates/:template_id", get(api::templates::get))
        .route("/api/templates/:template_id/generate", post(api::templates::generate))
        // Reports
        .route("/api/topologies/:id/report", get(api::reports::generate_report))
        .route("/api/topologies/:id/report/html", get(api::reports::generate_html_report))
        // OpenAPI / Swagger UI
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        // State and middleware
        // Note: Rate limiting should be implemented at proxy/ingress level (nginx, traefik)
        // for production deployments. See DEVELOPMENT.md for details.
        .with_state(state)
        .layer(TraceLayer::new_for_http())
        .layer(cors_layer())
}

/// Create CORS layer with secure configuration
fn cors_layer() -> CorsLayer {
    // Allow origins from environment or default to localhost for development
    let allowed_origins = std::env::var("CORS_ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:3000,http://127.0.0.1:3000".to_string());

    let origins: Vec<_> = allowed_origins
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect();

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::ACCEPT,
        ])
        .allow_credentials(true)
}
