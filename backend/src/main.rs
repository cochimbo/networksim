use anyhow::Result;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use networksim_backend::{api::AppState, config::Config, create_router, db::Database};

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
    let state = AppState::new(db, config.clone());

    // Build router
    let app = create_router(state);

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
