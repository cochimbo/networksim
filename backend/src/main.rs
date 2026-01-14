use anyhow::Result;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use networksim_backend::{
    api::AppState,
    config::Config,
    create_router,
    db::Database,
    helm::HelmClient,
    k8s::{start_chaos_watcher, start_pod_watcher, K8sClient},
};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
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

    // Initialize Helm client (optional)
    let helm_namespace = config.helm_namespace.clone().unwrap_or_else(|| "default".to_string());
    let helm = HelmClient::new(helm_namespace);
    let state = state.with_helm(helm);
    tracing::info!("Helm client initialized");

    // Spawn K8s Connection Manager (Automatic Reconnection)
    let mgr_state = state.clone();
    tokio::spawn(async move {
        // Initial delay to let things settle
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        
        // Track if watchers have been launched
        let mut watchers_launched = false;

        tracing::info!("🔄 K8s Connection Manager started");

        loop {
            // 1. Check Connection / Reconnect
            let needs_connect = mgr_state.k8s.read().await.is_none();

            if needs_connect {
                // Retry connection
                match K8sClient::new().await {
                    Ok(k8s) => {
                        match k8s.health_check().await {
                            Ok(_) => {
                                tracing::info!("✅ Connected to Kubernetes cluster");
                                mgr_state.set_k8s(k8s).await;
                            }
                            Err(e) => {
                                tracing::warn!("⚠️ K8s client created but unhealthy: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        // Silent/Debug log for failures to avoid spamming unless debug enabled
                        tracing::debug!("K8s connection attempt failed: {}", e);
                    }
                }
            } else {
                // 2. Monitor Health of existing connection
                // We clone to verify without holding the lock during network request
                let k8s_opt = mgr_state.k8s.read().await.clone();
                if let Some(k8s) = k8s_opt {
                    if let Err(e) = k8s.health_check().await {
                        tracing::error!("❌ Lost K8s connection: {}. Reconnecting...", e);
                        // Invalidate client so it reconnects next loop
                        let mut guard = mgr_state.k8s.write().await;
                        *guard = None;
                    }
                }
            }

            // 3. Start Watchers (Once connected)
            // Note: Watchers internally manage their own clients but we only launch them
            // when we believe K8s is ready to avoid immediate failures.
            if !watchers_launched && mgr_state.k8s.read().await.is_some() {
                tracing::info!("🚀 Starting Kubernetes watchers");
                
                let event_tx = mgr_state.event_tx.clone();
                tokio::spawn(async move {
                    start_pod_watcher(event_tx).await;
                });

                let event_tx = mgr_state.event_tx.clone();
                tokio::spawn(async move {
                    start_chaos_watcher(event_tx).await;
                });

                watchers_launched = true;
            }

            // Poll interval
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
        }
    });

    // Build router
    let app = create_router(state);

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
