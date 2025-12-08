use anyhow::Result;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use networksim_backend::{
    api::AppState,
    config::Config,
    create_router,
    db::Database,
    k8s::{start_chaos_watcher, start_pod_watcher, K8sClient},
};

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
    let mut state = AppState::new(db, config.clone());

    // Try to connect to Kubernetes (optional)
    let k8s_connected = match K8sClient::new().await {
        Ok(k8s) => match k8s.health_check().await {
            Ok(_) => {
                tracing::info!("Kubernetes client connected");
                state = state.with_k8s(k8s);
                true
            }
            Err(e) => {
                tracing::warn!(
                    "Kubernetes health check failed: {}. K8s features disabled.",
                    e
                );
                false
            }
        },
        Err(e) => {
            tracing::warn!(
                "Failed to connect to Kubernetes: {}. K8s features disabled.",
                e
            );
            false
        }
    };

    // Start Kubernetes watchers if connected
    if k8s_connected {
        let event_tx = state.event_tx.clone();
        tokio::spawn(async move {
            start_pod_watcher(event_tx).await;
        });

        let event_tx = state.event_tx.clone();
        tokio::spawn(async move {
            start_chaos_watcher(event_tx).await;
        });

        tracing::info!("Kubernetes watchers started");
    }

    // Build router
    let app = create_router(state);

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
