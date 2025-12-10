use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::api::AppState;
use crate::error::{AppError, AppResult};
use crate::helm::types::DeployAppRequest;
use crate::k8s::{DeploymentManager, DeploymentState};
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
        node_selector: vec![node_id.clone()], // Convert single node_id to array
        chart_type: crate::models::ChartType::Predefined, // Default to predefined for backward compatibility
        chart_reference: request.chart.clone(),
        name: app_name.clone(),
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
        tracing::info!("📄 App {}: status={:?}, chart={}", app.id, app.status, app.chart_reference);
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
    // Get application details first
    let app = state.db.get_application(&app_id.to_string()).await?
        .ok_or_else(|| AppError::NotFound(format!("Application {} not found", app_id)))?;

    // Update status to uninstalling
    state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Uninstalling, Some(&app.release_name)).await?;

    // Remove application containers from all selected nodes
    let mut uninstall_errors = Vec::new();
    
    for node_id in &app.node_selector {
        match remove_application_from_node(&state, &app.topology_id.to_string(), node_id, &app).await {
            Ok(_) => {
                tracing::info!("✅ Application removed from node {}", node_id);
            }
            Err(e) => {
                let error_msg = format!("Failed to remove from node {}: {}", node_id, e);
                tracing::error!("❌ {}", error_msg);
                uninstall_errors.push(error_msg);
            }
        }
    }

    if uninstall_errors.is_empty() {
        // Delete from database
        state.db.delete_application(&app_id.to_string()).await?;
        Ok(Json(serde_json::json!({
            "message": format!("Application {} uninstalled successfully", app_id)
        })))
    } else {
        // Update status back to deployed if uninstall partially failed
        state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Deployed, Some(&app.release_name)).await?;
        Err(AppError::internal(&format!("Partial uninstall failure: {}", uninstall_errors.join(", "))).into())
    }
}

/// Remove application container from a specific node
async fn remove_application_from_node(
    state: &AppState,
    topology_id: &str,
    node_id: &str,
    app: &Application,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Get the current pod for this node
    let pod_name = format!("ns-{}-{}", &topology_id[..8.min(topology_id.len())], node_id).to_lowercase();
    
    let k8s = state.k8s.as_ref().ok_or("K8s client not available")?;
    
    // Get current pod spec
    let current_pod = k8s.get_pod_in_namespace(&pod_name, "networksim-sim").await?;
    
    // Check if application container exists
    let container_name = format!("app-{}", app.id.simple());
    let has_container = if let Some(spec) = &current_pod.spec {
        spec.containers.iter().any(|c| c.name == container_name)
    } else {
        false
    };

    if !has_container {
        tracing::info!("Application container {} does not exist in pod {}", container_name, pod_name);
        return Ok(());
    }
    
    // Create new pod spec without the application container
    let mut new_pod = current_pod.clone();
    if let Some(spec) = &mut new_pod.spec {
        spec.containers.retain(|c| c.name != container_name);
    }
    
    // Update the pod
    k8s.update_pod(&new_pod).await?;
    
    tracing::info!("Removed application container {} from pod {}", container_name, pod_name);
    Ok(())
}

/// Get application logs
pub async fn logs(
    State(state): State<AppState>,
    Path((_topology_id, app_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    // Get application details first
    let app = state.db.get_application(&app_id.to_string()).await?
        .ok_or_else(|| AppError::NotFound(format!("Application {} not found", app_id)))?;

    let k8s = state.k8s.as_ref().ok_or_else(|| AppError::internal("K8s client not available"))?;

    // Get logs from application containers across all selected nodes
    let mut all_logs = Vec::new();
    let mut errors = Vec::new();

    for node_id in &app.node_selector {
        let pod_name = format!("ns-{}-{}", &app.topology_id.to_string()[..8.min(app.topology_id.to_string().len())], node_id).to_lowercase();
        let container_name = format!("app-{}", app.id.simple());

        match k8s.get_container_logs(&pod_name, &container_name, "networksim-sim", 1000).await {
            Ok(logs) => {
                all_logs.push(format!("=== Logs from {} (node {}) ===", app.name, node_id));
                all_logs.push(logs);
                all_logs.push("".to_string());
            }
            Err(e) => {
                errors.push(format!("Failed to get logs from node {}: {}", node_id, e));
            }
        }
    }

    if all_logs.is_empty() && !errors.is_empty() {
        return Err(AppError::internal(&format!("Failed to get application logs: {}", errors.join(", "))).into());
    }

    let combined_logs = all_logs.join("\n");
    Ok(Json(serde_json::json!({
        "logs": combined_logs,
        "truncated": false
    })))
}

/// Deploy an application to multiple nodes in a topology
pub async fn deploy_topology(
    State(state): State<AppState>,
    Path(topology_id): Path<Uuid>,
    Json(request): Json<DeployAppRequest>,
) -> AppResult<Json<Application>> {
    tracing::info!("🚀 STARTING deploy_topology function");
    tracing::info!("🚀 Starting topology-wide application deployment: topology_id={}, chart={}, node_selector={:?}",
                   topology_id, request.chart, request.node_selector);

    // Validate node_selector is not empty
    if request.node_selector.is_empty() {
        return Err(AppError::BadRequest("node_selector cannot be empty".to_string()).into());
    }

    // Check if topology is deployed by verifying pods exist for all selected nodes
    let k8s = state.k8s.as_ref().ok_or_else(|| AppError::internal("K8s client not available"))?;
    
    // Check if topology is deployed using DeploymentManager
    let deployment_manager = DeploymentManager::new(k8s.clone());
    let topology_status = deployment_manager.get_status(&topology_id.to_string()).await;
    let is_topology_deployed = match topology_status {
        Ok(status) => matches!(status.status, DeploymentState::Running | DeploymentState::PartiallyRunning),
        Err(_) => false,
    };
    
    if is_topology_deployed {
        // If topology is deployed, verify that pods exist for all selected nodes
        for node_id in &request.node_selector {
            let pod_name = format!("ns-{}-{}", &topology_id.to_string()[..8.min(topology_id.to_string().len())], node_id).to_lowercase();
            match k8s.get_pod_in_namespace(&pod_name, "networksim-sim").await {
                Ok(_) => {
                    tracing::info!("✅ Pod {} exists for node {}", pod_name, node_id);
                }
                Err(e) => {
                    tracing::error!("❌ Pod {} not found for node {}: {}", pod_name, node_id, e);
                    return Err(AppError::BadRequest(format!("Cannot deploy application: pod for node '{}' does not exist. Please ensure the topology is deployed and all nodes are running.", node_id)).into());
                }
            }
        }
        tracing::info!("✅ All required pods exist, proceeding with application deployment");
    } else {
        // If topology is not deployed, just validate that selected nodes exist in topology definition
        let topology = state.db.get_topology(&topology_id.to_string()).await?
            .ok_or_else(|| AppError::NotFound(format!("Topology {} not found", topology_id)))?;
        
        let existing_node_ids: std::collections::HashSet<String> = topology.nodes.iter()
            .map(|n| n.id.clone())
            .collect();
        
        for node_id in &request.node_selector {
            if !existing_node_ids.contains(node_id) {
                return Err(AppError::BadRequest(format!("Node '{}' does not exist in topology", node_id)).into());
            }
        }
        tracing::info!("✅ All selected nodes exist in topology definition, scheduling application for deployment");
    }

    // Parse chart_type
    let chart_type = match request.chart_type.as_deref() {
        Some("custom") => crate::models::ChartType::Custom,
        _ => crate::models::ChartType::Predefined,
    };

    // Create application record
    let app_id = Uuid::new_v4();
    let app_name = request.name.clone().filter(|n| !n.trim().is_empty()).unwrap_or_else(|| format!("app-{}", app_id.simple()));
    let release_name = format!("app-{}", app_id.simple());
    let namespace = "networksim-sim".to_string();

    tracing::info!("📝 Creating topology-wide application record: id={}, name={}, release_name={}, namespace={}, nodes={:?}",
                   app_id, app_name, release_name, namespace, request.node_selector);

    let initial_status = if is_topology_deployed {
        crate::models::AppStatus::Deploying
    } else {
        crate::models::AppStatus::Pending
    };

    let app = Application {
        id: app_id,
        topology_id,
        node_selector: request.node_selector.clone(),
        chart_type,
        chart_reference: request.chart.clone(),
        name: app_name.clone(),
        version: request.version.clone(),
        namespace: namespace.clone(),
        values: request.values.clone(),
        status: initial_status.clone(),
        release_name: release_name.clone(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    // Save to database first
    state.db.create_application(&app).await?;
    tracing::info!("💾 Application record saved to database");

    // Only attempt deployment if topology is deployed
    if is_topology_deployed {
        // Update status to deploying
        state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Deploying, Some(&release_name)).await?;
        tracing::info!("🔄 Application status updated to Deploying");

        // Deploy as sidecars to selected nodes
        let mut deployment_errors = Vec::new();
        
        for node_id in &request.node_selector {
            match deploy_application_to_node(&state, &topology_id.to_string(), node_id, &app).await {
                Ok(_) => {
                    tracing::info!("✅ Application deployed to node {}", node_id);
                }
                Err(e) => {
                    let error_msg = format!("Failed to deploy to node {}: {}", node_id, e);
                    tracing::error!("❌ {}", error_msg);
                    deployment_errors.push(error_msg);
                }
            }
        }

        // Update final status
        if deployment_errors.is_empty() {
            state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Deployed, Some(&release_name)).await?;
            tracing::info!("✅ Topology-wide application deployment completed successfully");
            
            // Return the application with updated status
            let updated_app = state.db.get_application(&app.id.to_string()).await?
                .ok_or_else(|| AppError::internal("Failed to retrieve updated application"))?;
            Ok(Json(updated_app))
        } else {
            state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Failed, Some(&release_name)).await?;
            tracing::error!("❌ Application deployment failed with {} errors", deployment_errors.len());
            Err(AppError::internal(&format!("Deployment failed: {}", deployment_errors.join(", "))).into())
        }
    } else {
        tracing::info!("📅 Application scheduled for deployment when topology is started");
        Ok(Json(app))
    }
}

/// Deploy application as sidecar to a specific node
pub async fn deploy_application_to_node(
    state: &AppState,
    topology_id: &str,
    node_id: &str,
    app: &Application,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let k8s = state.k8s.as_ref().ok_or("K8s client not available")?;
    
    // Create a separate deployment for the application instead of sidecar
    use crate::k8s::resources::create_application_deployment;
    
    let deployment_name = format!("app-{}-{}", app.id.simple(), node_id);
    
    // Check if deployment already exists
    if k8s.deployment_exists(&deployment_name, "networksim-sim").await? {
        tracing::info!("Application deployment {} already exists", deployment_name);
        return Ok(());
    }
    
    // Create deployment spec for the application
    let deployment = create_application_deployment(app, node_id, topology_id);
    
    // Create the deployment
    k8s.create_deployment(&deployment).await?;
    
    tracing::info!("✅ Created application deployment {} for node {}", deployment_name, node_id);
    
    // Wait for deployment to be ready
    let max_attempts = 20;
    let mut attempts = 0;
    
    while attempts < max_attempts {
        if k8s.check_deployment_ready(&deployment_name, "networksim-sim").await? {
            tracing::info!("✅ Application deployment {} is ready", deployment_name);
            return Ok(());
        }
        
        tracing::info!("⏳ Waiting for application deployment {} to be ready (attempt {}/{})", deployment_name, attempts + 1, max_attempts);
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
        attempts += 1;
    }
    
    tracing::error!("❌ Application deployment {} failed to become ready after {} attempts", deployment_name, max_attempts);
    Err(format!("Application deployment {} failed to start", deployment_name).into())
}

/// List all applications for a topology
pub async fn list_by_topology(
    State(state): State<AppState>,
    Path(topology_id): Path<Uuid>,
) -> AppResult<Json<Vec<Application>>> {
    let apps = state.db.list_applications(&topology_id.to_string()).await?;
    tracing::info!("📋 Found {} applications for topology {}", apps.len(), topology_id);
    Ok(Json(apps))
}

/// Check the runtime status of an application
pub async fn status(
    State(state): State<AppState>,
    Path((_topology_id, app_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    // Get application details first
    let app = state.db.get_application(&app_id.to_string()).await?
        .ok_or_else(|| AppError::NotFound(format!("Application {} not found", app_id)))?;

    let k8s = state.k8s.as_ref().ok_or_else(|| AppError::internal("K8s client not available"))?;

    let mut node_statuses = Vec::new();
    let mut all_running = true;

    for node_id in &app.node_selector {
        let pod_name = format!("ns-{}-{}", &app.topology_id.to_string()[..8.min(app.topology_id.to_string().len())], node_id).to_lowercase();
        let container_name = format!("app-{}", app.id.simple());

        match k8s.check_pod_containers_running(&pod_name, "networksim-sim").await {
            Ok(is_running) => {
                node_statuses.push(serde_json::json!({
                    "node_id": node_id,
                    "pod_name": pod_name,
                    "container_name": container_name,
                    "running": is_running
                }));
                
                if !is_running {
                    all_running = false;
                }
            }
            Err(e) => {
                node_statuses.push(serde_json::json!({
                    "node_id": node_id,
                    "pod_name": pod_name,
                    "container_name": container_name,
                    "error": e.to_string(),
                    "running": false
                }));
                all_running = false;
            }
        }
    }

    Ok(Json(serde_json::json!({
        "application_id": app.id,
        "application_name": app.name,
        "all_running": all_running,
        "node_statuses": node_statuses
    })))
}