use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::api::AppState;
use crate::error::{AppError, AppResult};
use crate::helm::types::DeployAppRequest;
use crate::models::Application;

/// Deploy an application to a node
pub async fn deploy(
    State(state): State<AppState>,
    Path((topology_id, node_id)): Path<(Uuid, String)>,
    Json(request): Json<DeployAppRequest>,
) -> AppResult<Json<Application>> {
    tracing::info!("🚀 Starting application deployment: topology_id={}, node_id={}, chart={}", 
                   topology_id, node_id, request.chart);

    let helm = state.helm.as_ref().ok_or_else(|| {
        tracing::error!("❌ Helm client not available");
        AppError::BadRequest("Helm client not available".to_string())
    })?;
    tracing::info!("✅ Helm client available, namespace: {}", helm.namespace());

    // Create application record
    let app_id = Uuid::new_v4();
    let app_name = request.name.clone().filter(|n| !n.trim().is_empty()).unwrap_or_else(|| format!("app-{}", app_id.simple()));
    let release_name = format!("app-{}", app_id.simple());
    // Use the configured Helm namespace (same as simulation namespace)
    let namespace = helm.namespace().to_string();

    tracing::info!("📝 Creating application record: id={}, name={}, release_name={}, namespace={}", 
                   app_id, app_name, release_name, namespace);

    let app = Application {
        id: app_id,
        topology_id,
        node_id,
        name: app_name.clone(),
        chart: request.chart.clone(),
        version: request.version.clone(),
        namespace: namespace.clone(),
        values: request.values.clone(),
        status: crate::models::AppStatus::Pending,
        release_name: release_name.clone(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    // Save to database first
    tracing::info!("💾 Saving application to database...");
    state.db.create_application(&app).await?;
    tracing::info!("✅ Application saved to database successfully");

    // Update status to deploying
    tracing::info!("🔄 Updating application status to Deploying...");
    state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Deploying, Some(&release_name)).await?;
    tracing::info!("✅ Application status updated to Deploying");

    // Try to install with Helm
    tracing::info!("⚓ Installing Helm chart: {} version {:?} in namespace {}", 
                   request.chart, request.version, namespace);
    match helm.install_chart(&release_name, &request.chart, request.version.as_deref(), request.values.as_ref()).await {
        Ok(_) => {
            tracing::info!("✅ Helm chart installed successfully");
            // Update status to deployed
            tracing::info!("🔄 Updating application status to Deployed...");
            state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Deployed, Some(&release_name)).await?;
            tracing::info!("✅ Application deployment completed successfully");
            // Update the app struct status for the response
            let mut app = app;
            app.status = crate::models::AppStatus::Deployed;
            Ok(Json(app))
        }
        Err(e) => {
            tracing::error!("❌ Helm chart installation failed: {}", e);
            // Update status to failed
            tracing::info!("🔄 Updating application status to Failed...");
            state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Failed, Some(&release_name)).await?;
            tracing::error!("❌ Application deployment failed, status updated to Failed");
            Err(AppError::internal(&format!("Failed to deploy application: {}", e)).into())
        }
    }
}

/// List all applications for a node
pub async fn list_by_node(
    State(state): State<AppState>,
    Path((_topology_id, node_id)): Path<(Uuid, String)>,
) -> AppResult<Json<Vec<Application>>> {
    let apps = state.db.list_applications_by_node(&node_id.to_string()).await?;
    tracing::info!("📋 Found {} applications for node {}", apps.len(), node_id);
    for app in &apps {
        tracing::info!("📄 App {}: status={:?}, chart={}", app.id, app.status, app.chart);
    }
    Ok(Json(apps))
}

/// Get application details
pub async fn get(
    State(state): State<AppState>,
    Path((_topology_id, app_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<Application>> {
    let app = state.db.get_application(&app_id.to_string()).await?
        .ok_or_else(|| AppError::NotFound(format!("Application {} not found", app_id)))?;
    Ok(Json(app))
}

/// Uninstall an application
pub async fn uninstall(
    State(state): State<AppState>,
    Path((_topology_id, app_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    let helm = state.helm.as_ref().ok_or_else(|| {
        AppError::BadRequest("Helm client not available".to_string())
    })?;

    // Get application details first
    let app = state.db.get_application(&app_id.to_string()).await?
        .ok_or_else(|| AppError::NotFound(format!("Application {} not found", app_id)))?;

    // Update status to uninstalling
    state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Uninstalling, Some(&app.release_name)).await?;

    // Try to uninstall with Helm
    match helm.uninstall_release(&app.release_name).await {
        Ok(_) => {
            // Delete from database
            state.db.delete_application(&app_id.to_string()).await?;
            Ok(Json(serde_json::json!({
                "message": format!("Application {} uninstalled successfully", app_id)
            })))
        }
        Err(e) => {
            // Update status back to deployed if uninstall failed
            state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Deployed, Some(&app.release_name)).await?;
            Err(AppError::internal(&format!("Failed to uninstall application: {}", e)).into())
        }
    }
}

/// Get application logs
pub async fn logs(
    State(state): State<AppState>,
    Path((_topology_id, app_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    let helm = state.helm.as_ref().ok_or_else(|| {
        AppError::BadRequest("Helm client not available".to_string())
    })?;

    // Get application details first
    let app = state.db.get_application(&app_id.to_string()).await?
        .ok_or_else(|| AppError::NotFound(format!("Application {} not found", app_id)))?;

    // Get logs from Helm
    match helm.get_logs(&app.release_name, 1000).await {
        Ok(logs) => Ok(Json(serde_json::json!({
            "logs": logs
        }))),
        Err(e) => Err(AppError::internal(&format!("Failed to get application logs: {}", e)).into())
    }
}