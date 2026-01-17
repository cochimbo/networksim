use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::api::{AppState, Event};
use crate::error::{AppError, AppResult};
use crate::helm::types::DeployAppRequest;
use crate::k8s::{DeploymentManager, DeploymentState};
use crate::models::Application;
use serde::Deserialize;

/// Deploy an application to a node
#[utoipa::path(
    post,
    path = "/api/topologies/{topology_id}/nodes/{node_id}/apps",
    tag = "applications",
    params(
        ("topology_id" = Uuid, Path, description = "Topology ID"),
        ("node_id" = String, Path, description = "Node ID")
    ),
    request_body = DeployAppRequest,
    responses(
        (status = 200, description = "App deployed", body = Application),
        (status = 400, description = "Bad request"),
        (status = 404, description = "Topology or node not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn deploy(
    State(state): State<AppState>,
    Path((topology_id, node_id)): Path<(Uuid, String)>,
    Json(request): Json<DeployAppRequest>,
) -> AppResult<Json<Application>> {
    tracing::info!("🚀 ===== STARTING APPLICATION DEPLOYMENT =====");
    tracing::info!("📋 Request details: topology_id={}, node_id={}, image={}",
                   topology_id, node_id, request.chart);
    tracing::info!("📦 Payload breakdown: envvalues={:?}, replicas={:?}, volumes_count={:?}, values={:?}", 
        request.envvalues.is_some(), 
        request.replicas, 
        request.volumes.as_ref().map(|v| v.len()),
        request.values.is_some()
    );

    let k8s = state.k8s.read().await.clone().ok_or_else(|| {
        tracing::error!("❌ K8s client not available");
        AppError::BadRequest("K8s client not available".to_string())
    })?;
    tracing::info!("✅ K8s client available, namespace: {}", k8s.namespace());

    // Create application record
    let app_id = Uuid::new_v4();
    let deployment_name = crate::k8s::resources::make_deployment_name(&app_id.simple().to_string(), &node_id);
    let namespace = k8s.namespace().to_string();

    tracing::info!("🆔 Generated application ID: {}", app_id);
    tracing::info!("🏷️  Generated deployment name: {}", deployment_name);
    tracing::info!("📝 Creating application record with details: id={}, deployment_name={}, namespace={}, topology_id={}, node_selector=[{}]",
                   app_id, deployment_name, namespace, topology_id, node_id);

    // Construct consolidated values object
    let mut values_map = serde_json::Map::new();
    
    // Add legacy/direct values if present
    if let Some(v) = &request.values {
        if let Some(obj) = v.as_object() {
            values_map.extend(obj.clone());
        }
    }
    
    // Add explicitly typed fields
    if let Some(env) = &request.envvalues {
        // Handle envvalues as a map of key-value pairs
        if let Some(env_obj) = env.as_object() {
             let mut env_array = Vec::new();
             for (k, v) in env_obj {
                 let val_str = if let Some(s) = v.as_str() { s.to_string() } else { v.to_string() };
                 env_array.push(serde_json::json!({
                     "name": k,
                     "value": val_str
                 }));
             }
             values_map.insert("env".to_string(), serde_json::Value::Array(env_array));
        } else {
             values_map.insert("env".to_string(), env.clone());
        }
    }
    if let Some(vols) = &request.volumes {
         values_map.insert("volumes".to_string(), serde_json::Value::Array(vols.clone()));
    }
    if let Some(reps) = request.replicas {
        values_map.insert("replicas".to_string(), serde_json::Value::Number(reps.into()));
    }
    // Resources
    let mut resources = serde_json::Map::new();
    if let Some(v) = &request.cpu_request { resources.insert("cpu_request".to_string(), serde_json::Value::String(v.clone())); }
    if let Some(v) = &request.memory_request { resources.insert("memory_request".to_string(), serde_json::Value::String(v.clone())); }
    if let Some(v) = &request.cpu_limit { resources.insert("cpu_limit".to_string(), serde_json::Value::String(v.clone())); }
    if let Some(v) = &request.memory_limit { resources.insert("memory_limit".to_string(), serde_json::Value::String(v.clone())); }
    if !resources.is_empty() {
        values_map.insert("resources".to_string(), serde_json::Value::Object(resources));
    }
    if let Some(hc) = &request.health_check {
        values_map.insert("healthCheck".to_string(), hc.clone());
    }

    let final_values = if values_map.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(values_map))
    };

    tracing::info!("💾 Final consolidated values to be stored: {:?}", final_values);

    let app = Application {
        id: app_id,
        topology_id,
        node_selector: vec![node_id.clone()],
        image_name: request.chart.clone(),
        namespace: namespace.clone(),
        values: final_values,
        status: crate::models::AppStatus::Pending,
        release_name: deployment_name.clone(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    // Save to database first
    tracing::info!("💾 Attempting to save application to database...");
    match state.db.create_application(&app).await {
        Ok(_) => tracing::info!("✅ Application saved to database successfully"),
        Err(e) => {
            tracing::error!("❌ Failed to save application to database: {}", e);
            return Err(e.into());
        }
    }

    // Update status to deploying
    tracing::info!("🔄 Updating application status to Deploying...");
    match state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Deploying, Some(&deployment_name)).await {
        Ok(_) => tracing::info!("✅ Application status updated to Deploying"),
        Err(e) => {
            tracing::error!("❌ Failed to update application status to Deploying: {}", e);
            return Err(e.into());
        }
    }

    // Create dynamic ConfigMaps if requested
    let cms = crate::k8s::resources::build_dynamic_configmaps(&app);
    if !cms.is_empty() {
        tracing::info!("📦 Found {} dynamic ConfigMaps to create", cms.len());
        for cm in cms {
            let cm_name = cm.metadata.name.clone().unwrap_or_default();
            // Check if exists
            let exists = k8s.config_map_exists(&cm_name).await.unwrap_or(false);
            if !exists {
                tracing::info!("creating ConfigMap: {}", cm_name);
                if let Err(e) = k8s.create_config_map(&cm).await {
                    tracing::error!("Failed to create ConfigMap {}: {}", cm_name, e);
                }
            } else {
                 tracing::info!("ConfigMap {} already exists, skipping creation", cm_name);
            }
        }
    }

    // Create dynamic PVCs if requested
    let pvcs = crate::k8s::resources::build_dynamic_pvcs(&app);
    if !pvcs.is_empty() {
        tracing::info!("📦 Found {} dynamic PVCs to create", pvcs.len());
        for pvc in pvcs {
            let pvc_name = pvc.metadata.name.clone().unwrap_or_default();
            // Check if exists
            let exists = k8s.pvc_exists(&pvc_name).await.unwrap_or(false);
            if !exists {
                tracing::info!("creating PVC: {}", pvc_name);
                if let Err(e) = k8s.create_pvc(&pvc).await {
                    tracing::error!("Failed to create PVC {}: {}", pvc_name, e);
                    // Continue anyway, maybe it races or it's fine
                }
            } else {
                 tracing::info!("PVC {} already exists, skipping creation", pvc_name);
            }
        }
    }

    // Create the deployment
    tracing::info!("⚓ Creating Kubernetes deployment specification...");
    let deployment = crate::k8s::resources::create_application_deployment(&app, &node_id, &topology_id.to_string());
    tracing::info!("📦 Deployment spec created for: {}", deployment_name);

    tracing::info!("🚀 Sending deployment to Kubernetes API...");
    match k8s.create_deployment(&deployment).await {
        Ok(_) => {
            tracing::info!("✅ Kubernetes deployment created successfully");
            // Update status to deployed
            tracing::info!("🔄 Updating application status to Deployed...");
            match state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Deployed, Some(&deployment_name)).await {
                Ok(_) => tracing::info!("✅ Application deployment completed successfully - status updated to Deployed"),
                Err(e) => {
                    tracing::error!("❌ Deployment succeeded but failed to update status to Deployed: {}", e);
                    return Err(e.into());
                }
            }
            // Update the app struct status for the response
            let mut app = app;
            app.status = crate::models::AppStatus::Deployed;
            tracing::info!("🎉 ===== APPLICATION DEPLOYMENT COMPLETED SUCCESSFULLY =====");
            Ok(Json(app))
        }
        Err(e) => {
            tracing::error!("❌ Kubernetes deployment creation failed: {}", e);
            // Update status to failed
            tracing::info!("🔄 Updating application status to Failed due to deployment error...");
            match state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Failed, Some(&deployment_name)).await {
                Ok(_) => tracing::info!("✅ Application status updated to Failed"),
                Err(update_err) => tracing::error!("❌ Failed to update application status to Failed: {}", update_err),
            }
            tracing::error!("💥 ===== APPLICATION DEPLOYMENT FAILED =====");
            Err(AppError::internal(&format!("Failed to create deployment: {}", e)))
        }
    }
}

/// List all applications for a node
#[utoipa::path(
    get,
    path = "/api/topologies/{topology_id}/nodes/{node_id}/apps",
    tag = "applications",
    params(
        ("topology_id" = Uuid, Path, description = "Topology ID"),
        ("node_id" = String, Path, description = "Node ID")
    ),
    responses(
        (status = 200, description = "List of applications", body = Vec<Application>),
        (status = 404, description = "Topology or node not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn list_by_node(
    State(state): State<AppState>,
    Path((_topology_id, node_id)): Path<(Uuid, String)>,
) -> AppResult<Json<Vec<Application>>> {
    let apps = state.db.list_applications_by_node(&node_id.to_string()).await?;
    tracing::info!("📋 Found {} applications for node {}", apps.len(), node_id);
    for app in &apps {
        tracing::info!("📄 App {}: status={:?}, image={}", app.id, app.status, app.image_name);
    }
    Ok(Json(apps))
}

/// Get application details
#[utoipa::path(
    get,
    path = "/api/topologies/{topology_id}/apps/{app_id}",
    tag = "applications",
    params(
        ("topology_id" = Uuid, Path, description = "Topology ID"),
        ("app_id" = Uuid, Path, description = "Application ID")
    ),
    responses(
        (status = 200, description = "Application details", body = Application),
        (status = 404, description = "Application not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get(
    State(state): State<AppState>,
    Path((_topology_id, app_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<Application>> {
    let app = state.db.get_application(&app_id.to_string()).await?
        .ok_or_else(|| AppError::NotFound(format!("Application {} not found", app_id)))?;
    Ok(Json(app))
}

/// Uninstall an application by ID (helper function for internal use)
pub async fn uninstall_application_by_id(
    state: &AppState,
    app_id: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Get application details first
    let app = state.db.get_application(app_id).await?
        .ok_or_else(|| format!("Application {} not found", app_id))?;

    // Update status to uninstalling
    state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Uninstalling, Some(&app.release_name)).await?;

    // Remove application containers from all selected nodes
    let mut uninstall_errors = Vec::new();
    
    for node_id in &app.node_selector {
        match remove_application_from_node(state, &app.topology_id.to_string(), node_id, &app).await {
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
        state.db.delete_application(app_id).await?;
        tracing::info!("Application {} uninstalled successfully", app_id);
        Ok(())
    } else {
        // Update status back to deployed if uninstall partially failed
        state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Deployed, Some(&app.release_name)).await?;
            Err(format!("Partial uninstall failure: {}", uninstall_errors.join(", ")).into())
    }
}

/// Uninstall an application
#[utoipa::path(
    delete,
    path = "/api/topologies/{topology_id}/apps/{app_id}",
    tag = "applications",
    params(
        ("topology_id" = Uuid, Path, description = "Topology ID"),
        ("app_id" = Uuid, Path, description = "Application ID")
    ),
    responses(
        (status = 200, description = "Application uninstalled"),
        (status = 404, description = "Application not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn uninstall(
    State(state): State<AppState>,
    Path((_topology_id, app_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    // Get application details first
    let app = state.db.get_application(&app_id.to_string()).await?
        .ok_or_else(|| AppError::NotFound(format!("Application {} not found", app_id)))?;

    let k8s = state.k8s.read().await.clone().ok_or_else(|| {
        tracing::error!("❌ K8s client not available");
        AppError::BadRequest("K8s client not available".to_string())
    })?;

    // Update status to uninstalling
    state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Uninstalling, Some(&app.release_name)).await?;

    // For each node, delete the corresponding deployment
    let mut uninstall_errors = Vec::new();
    for node_id in &app.node_selector {
        let deployment_name = crate::k8s::resources::make_deployment_name(&app.id.simple().to_string(), node_id);
        match k8s.delete_deployment(&deployment_name).await {
            Ok(_) => {
                tracing::info!("✅ Deployment {} deleted successfully", deployment_name);
            }
            Err(e) => {
                // Check if it's not found (already deleted), ignore
                if e.to_string().contains("not found") || e.to_string().contains("NotFound") {
                    tracing::info!("✅ Deployment {} already deleted or not found, skipping", deployment_name);
                } else {
                    let error_msg = format!("Failed to delete deployment {}: {}", deployment_name, e);
                    tracing::error!("❌ {}", error_msg);
                    uninstall_errors.push(error_msg);
                }
            }
        }
    }

    if uninstall_errors.is_empty() {
        let topology_id_str = app.topology_id.to_string();
        state.db.delete_application(&app_id.to_string()).await?;

        // Broadcast app uninstalled event
        let _ = state.event_tx.send(Event::AppUninstalled {
            topology_id: topology_id_str,
            app_id: app_id.to_string(),
        });

        Ok(Json(serde_json::json!({
            "message": format!("Application {} uninstalled successfully", app_id)
        })))
    } else {
        state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Deployed, Some(&app.release_name)).await?;
        Err(AppError::internal(&format!("Partial uninstall failure: {}", uninstall_errors.join(", "))))
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
    
    let k8s = state.k8s.read().await.clone().ok_or("K8s client not available")?;
    
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
#[utoipa::path(
    get,
    path = "/api/topologies/{topology_id}/apps/{app_id}/logs",
    tag = "applications",
    params(
        ("topology_id" = Uuid, Path, description = "Topology ID"),
        ("app_id" = Uuid, Path, description = "Application ID")
    ),
    responses(
        (status = 200, description = "Application logs"),
        (status = 404, description = "Application not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn logs(
    State(state): State<AppState>,
    Path((_topology_id, app_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    // Get application details first
    let app = state.db.get_application(&app_id.to_string()).await?
        .ok_or_else(|| AppError::NotFound(format!("Application {} not found", app_id)))?;

    let k8s = state.k8s.read().await.clone().ok_or_else(|| AppError::internal("K8s client not available"))?;

    // Get logs from application containers across all selected nodes
    let mut all_logs = Vec::new();
    let mut errors = Vec::new();

    for node_id in &app.node_selector {
        // Find the pod for this application on this node
        let label_selector = format!("networksim.io/application={},networksim.io/node={}", app.id, node_id);
        
        match k8s.list_pods(&label_selector).await {
            Ok(pods) => {
                if let Some(pod) = pods.first() {
                    if let Some(pod_name) = &pod.metadata.name {
                        let container_name = format!("app-{}", app.id.simple());
                        
                        match k8s.get_container_logs(pod_name, &container_name, k8s.namespace(), 1000).await {
                            Ok(logs) => {
                                all_logs.push(format!("=== Logs from image {} (node {}) ===", app.image_name, node_id));
                                all_logs.push(logs);
                                all_logs.push("".to_string());
                            }
                            Err(e) => {
                                errors.push(format!("Failed to get logs from node {}: {}", node_id, e));
                            }
                        }
                    } else {
                         errors.push(format!("Pod for node {} has no name", node_id));
                    }
                } else {
                    // Fallback to old logic just in case (sidecar model)
                    let pod_name = format!("ns-{}-{}", &app.topology_id.to_string()[..8.min(app.topology_id.to_string().len())], node_id).to_lowercase();
                    let container_name = format!("app-{}", app.id.simple());
                    
                    match k8s.get_container_logs(&pod_name, &container_name, k8s.namespace(), 1000).await {
                        Ok(logs) => {
                            all_logs.push(format!("=== Logs from image {} (node {}) ===", app.image_name, node_id));
                            all_logs.push(logs);
                            all_logs.push("".to_string());
                        }
                        Err(e) => {
                             errors.push(format!("No pods found for app {} on node {} and fallback failed: {}", app.id, node_id, e));
                        }
                    }
                }
            }
            Err(e) => {
                errors.push(format!("Failed to list pods for node {}: {}", node_id, e));
            }
        }
    }

    if all_logs.is_empty() && !errors.is_empty() {
        // If we have errors, return them as logs so the user sees something
        let error_logs = errors.join("\n");
        return Ok(Json(serde_json::json!({
            "logs": format!("Failed to retrieve logs:\n{}", error_logs),
            "truncated": false
        })));
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
        return Err(AppError::BadRequest("node_selector cannot be empty".to_string()));
    }

    // Check if topology is deployed by verifying pods exist for all selected nodes
    let k8s = state.k8s.read().await.clone().ok_or_else(|| AppError::internal("K8s client not available"))?;
    
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
                    return Err(AppError::BadRequest(format!("Cannot deploy application: pod for node '{}' does not exist. Please ensure the topology is deployed and all nodes are running.", node_id)));
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
                return Err(AppError::BadRequest(format!("Node '{}' does not exist in topology", node_id)));
            }
        }
        tracing::info!("✅ All selected nodes exist in topology definition, scheduling application for deployment");
    }

    // Create application record
    let app_id = Uuid::new_v4();
    let app_name = format!("app-{}", app_id.simple());
    let release_name = format!("app-{}", app_id.simple());
    let namespace = "networksim-sim".to_string();

    tracing::info!("📝 Creating topology-wide application record: id={}, name={}, release_name={}, namespace={}, nodes={:?}",
                   app_id, app_name, release_name, namespace, request.node_selector);

    let initial_status = if is_topology_deployed {
        crate::models::AppStatus::Deploying
    } else {
        crate::models::AppStatus::Pending
    };

    // Construct consolidated values object
    let mut values_map = serde_json::Map::new();
    
    // Add legacy/direct values if present
    if let Some(v) = &request.values {
        if let Some(obj) = v.as_object() {
            values_map.extend(obj.clone());
        }
    }
    
    // Add explicitly typed fields
    if let Some(env) = &request.envvalues {
        // Handle envvalues as a map of key-value pairs
        if let Some(env_obj) = env.as_object() {
             let mut env_array = Vec::new();
             for (k, v) in env_obj {
                 let val_str = if let Some(s) = v.as_str() { s.to_string() } else { v.to_string() };
                 env_array.push(serde_json::json!({
                     "name": k,
                     "value": val_str
                 }));
             }
             values_map.insert("env".to_string(), serde_json::Value::Array(env_array));
        } else {
             values_map.insert("env".to_string(), env.clone());
        }
    }
    if let Some(vols) = &request.volumes {
         values_map.insert("volumes".to_string(), serde_json::Value::Array(vols.clone()));
    }
    if let Some(reps) = request.replicas {
        values_map.insert("replicas".to_string(), serde_json::Value::Number(reps.into()));
    }
    // Resources
    let mut resources = serde_json::Map::new();
    if let Some(v) = &request.cpu_request { resources.insert("cpu_request".to_string(), serde_json::Value::String(v.clone())); }
    if let Some(v) = &request.memory_request { resources.insert("memory_request".to_string(), serde_json::Value::String(v.clone())); }
    if let Some(v) = &request.cpu_limit { resources.insert("cpu_limit".to_string(), serde_json::Value::String(v.clone())); }
    if let Some(v) = &request.memory_limit { resources.insert("memory_limit".to_string(), serde_json::Value::String(v.clone())); }
    if !resources.is_empty() {
        values_map.insert("resources".to_string(), serde_json::Value::Object(resources));
    }
    if let Some(hc) = &request.health_check {
        values_map.insert("healthCheck".to_string(), hc.clone());
    }

    let final_values = if values_map.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(values_map))
    };

    let app = Application {
        id: app_id,
        topology_id,
        node_selector: request.node_selector.clone(),
        image_name: request.chart.clone(),
        // name: app_name.clone(),
        // version: None, // Eliminado
        namespace: namespace.clone(),
        values: final_values,
        status: initial_status.clone(),
        release_name: release_name.clone(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        // version: None, // Eliminado
        // version: None, // Eliminado
        // version: None, // Eliminado
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

            // Broadcast app deployed event
            let _ = state.event_tx.send(Event::AppDeployed {
                topology_id: topology_id.to_string(),
                app_id: app.id.to_string(),
                image: app.image_name.clone(),
            });

            // Return the application with updated status
            let updated_app = state.db.get_application(&app.id.to_string()).await?
                .ok_or_else(|| AppError::internal("Failed to retrieve updated application"))?;
            Ok(Json(updated_app))
        } else {
            state.db.update_application_status(&app.id.to_string(), &crate::models::AppStatus::Failed, Some(&release_name)).await?;
            tracing::error!("❌ Application deployment failed with {} errors", deployment_errors.len());
            Err(AppError::internal(&format!("Deployment failed: {}", deployment_errors.join(", "))))
        }
    } else {
        tracing::info!("📅 Application scheduled for deployment when topology is started");
        Ok(Json(app))
    }
}

/// Create an application draft (save values/env without attempting k8s deployment)
pub async fn create_draft(
    State(state): State<AppState>,
    Path(topology_id): Path<Uuid>,
    Json(request): Json<DeployAppRequest>,
) -> AppResult<Json<Application>> {
    tracing::info!("create_draft - topology={}, chart={}, node_selector_len={}, envvalues_present={}",
        topology_id, request.chart, request.node_selector.len(), request.values.is_some());

    let app_id = Uuid::new_v4();
    let release_name = format!("app-{}", app_id.simple());
    let namespace = "networksim-sim".to_string();

    let app = Application {
        id: app_id,
        topology_id,
        node_selector: request.node_selector.clone(),
        image_name: request.chart.clone(),
        namespace: namespace.clone(),
        values: request.values.clone(),
        status: crate::models::AppStatus::Pending,
        release_name: release_name.clone(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    match state.db.create_application(&app).await {
        Ok(_) => {
            tracing::info!("create_draft - saved application draft id={}", app.id);
            Ok(Json(app))
        }
        Err(e) => {
            tracing::error!("create_draft - failed to save draft: {}", e);
            Err(e.into())
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateAppValuesRequest {
    #[serde(rename = "envvalues")]
    pub values: Option<serde_json::Value>,
}

/// Update an existing application's values (env, etc.)
pub async fn update_application(
    State(state): State<AppState>,
    Path((topology_id, app_id)): Path<(Uuid, Uuid)>,
    Json(request): Json<UpdateAppValuesRequest>,
) -> AppResult<Json<Application>> {
    tracing::info!("update_application - topology={}, app_id={}, has_envvalues={}", topology_id, app_id, request.values.is_some());

    let mut app = state.db.get_application(&app_id.to_string()).await?
        .ok_or_else(|| AppError::NotFound(format!("Application {} not found", app_id)))?;

    // Performe smart merge of values instead of overwrite
    if let Some(new_values) = request.values {
        if let Some(new_obj) = new_values.as_object() {
            // If we have an object, merge it with existing values
            let mut final_map = if let Some(existing) = &app.values {
                existing.as_object().cloned().unwrap_or_default()
            } else {
                serde_json::Map::new()
            };
            
            for (k, v) in new_obj {
                final_map.insert(k.clone(), v.clone());
            }
            app.values = Some(serde_json::Value::Object(final_map));
        } else {
             // If not an object, fall back to overwrite
             app.values = Some(new_values);
        }
    }
    
    app.updated_at = chrono::Utc::now();

    state.db.update_application(&app).await?;

    tracing::info!("update_application - updated app {}", app.id);
    Ok(Json(app))
}

/// Deploy application as sidecar to a specific node
pub async fn deploy_application_to_node(
    state: &AppState,
    topology_id: &str,
    node_id: &str,
    app: &Application,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let k8s = state.k8s.read().await.clone().ok_or("K8s client not available")?;
    
    // Create a separate deployment for the application
    use crate::k8s::resources::create_application_deployment;
    
    let deployment_name = crate::k8s::resources::make_deployment_name(&app.id.simple().to_string(), node_id);
    
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

    let k8s = state.k8s.read().await.clone().ok_or_else(|| AppError::internal("K8s client not available"))?;

    let mut node_statuses = Vec::new();
    let mut all_running = true;

    for node_id in &app.node_selector {
        let deployment_name = crate::k8s::resources::make_deployment_name(&app.id.simple().to_string(), node_id);
        match k8s.check_deployment_ready(&deployment_name, "networksim-sim").await {
            Ok(is_ready) => {
                node_statuses.push(serde_json::json!({
                    "node_id": node_id,
                    "pod_name": format!("{}-{}", deployment_name, "pod"), // Simplified
                    "container_name": format!("app-{}", app.id.simple()),
                    "running": is_ready
                }));
                
                if !is_ready {
                    all_running = false;
                }
            }
            Err(e) => {
                node_statuses.push(serde_json::json!({
                    "node_id": node_id,
                    "pod_name": format!("{}-{}", deployment_name, "pod"),
                    "container_name": format!("app-{}", app.id.simple()),
                    "error": e.to_string(),
                    "running": false
                }));
                all_running = false;
            }
        }
    }

    Ok(Json(serde_json::json!({
        "application_id": app.id,
        "application_name": app.image_name,
        "all_running": all_running,
        "node_statuses": node_statuses
    })))
}