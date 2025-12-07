use anyhow::Result;
use axum::{
    routing::{get, post, put, delete},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod api;
mod config;
mod db;
mod error;
mod models;

use crate::config::Config;
use crate::db::Database;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "networksim_backend=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting NetworkSim Backend");

    // Load configuration
    let config = Config::load()?;
    tracing::info!("Configuration loaded");

    // Initialize database
    let db = Database::new(&config.database_url).await?;
    db.run_migrations().await?;
    tracing::info!("Database initialized");

    // Build application state
    let state = api::AppState::new(db, config.clone());

    // Build router
    let app = Router::new()
        // Health check
        .route("/health", get(api::health::health_check))
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
        // Chaos
        .route("/api/chaos", get(api::chaos::list))
        .route("/api/chaos", post(api::chaos::create))
        .route("/api/chaos/:id", delete(api::chaos::delete))
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
        );

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("Listening on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
