use axum::{
    extract::{Path, State, Multipart},
    Json,
};
use serde::{Deserialize, Serialize};
use k8s_openapi::api::core::v1::{PersistentVolumeClaim, ConfigMap, PersistentVolumeClaimSpec, ResourceRequirements};
use k8s_openapi::apimachinery::pkg::api::resource::Quantity;
use std::collections::BTreeMap;

use crate::api::AppState;
use crate::error::{AppError, AppResult};

// DTOs
#[derive(Debug, Serialize, Deserialize)]
pub struct PvcDto {
    pub name: String,
    pub size: String,
    pub status: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePvcRequest {
    pub name: String,
    pub size: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigMapDto {
    pub name: String,
    pub keys: Vec<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateConfigMapRequest {
    pub name: String,
}

// Handlers for PVCs

/// List all PersistentVolumeClaims
pub async fn list_pvcs(State(state): State<AppState>) -> AppResult<Json<Vec<PvcDto>>> {
    let k8s = state.k8s.read().await.clone().ok_or_else(|| {
        AppError::BadRequest("K8s client not available".to_string())
    })?;

    let items = k8s.list_pvcs().await.map_err(|e| AppError::internal(&e.to_string()))?;
    
    let dtos = items.into_iter().map(|pvc| {
        let name = pvc.metadata.name.unwrap_or_default();
        let status = pvc.status.as_ref()
            .and_then(|s| s.phase.clone())
            .unwrap_or_else(|| "Unknown".to_string());
        
        let size = pvc.spec.as_ref()
            .and_then(|s| s.resources.as_ref())
            .and_then(|r| r.requests.as_ref())
            .and_then(|req| req.get("storage"))
            .map(|q| q.0.clone())
            .unwrap_or_else(|| "-".to_string());

        let created_at = pvc.metadata.creation_timestamp.map(|t| t.0.to_rfc3339());

        PvcDto { name, size, status, created_at }
    }).collect();

    Ok(Json(dtos))
}

/// Create a new PVC
pub async fn create_pvc(
    State(state): State<AppState>,
    Json(req): Json<CreatePvcRequest>,
) -> AppResult<Json<PvcDto>> {
    let k8s = state.k8s.read().await.clone().ok_or_else(|| {
        AppError::BadRequest("K8s client not available".to_string())
    })?;

    if k8s.pvc_exists(&req.name).await.unwrap_or(false) {
        return Err(AppError::BadRequest(format!("PVC {} already exists", req.name)));
    }

    let mut requests = BTreeMap::new();
    requests.insert("storage".to_string(), Quantity(req.size.clone()));

    let pvc = PersistentVolumeClaim {
        metadata: k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta {
            name: Some(req.name.clone()),
            labels: Some(BTreeMap::from([
                ("app.kubernetes.io/managed-by".to_string(), "networksim".to_string()),
                ("networksim.io/type".to_string(), "user-volume".to_string()),
            ])),
            ..Default::default()
        },
        spec: Some(PersistentVolumeClaimSpec {
            access_modes: Some(vec!["ReadWriteOnce".to_string()]),
            resources: Some(ResourceRequirements {
                requests: Some(requests),
                ..Default::default()
            }),
            ..Default::default()
        }),
        ..Default::default()
    };

    k8s.create_pvc(&pvc).await.map_err(|e| AppError::internal(&format!("Failed to create PVC: {}", e)))?;

    Ok(Json(PvcDto {
        name: req.name,
        size: req.size,
        status: "Pending".to_string(),
        created_at: Some(chrono::Utc::now().to_rfc3339()),
    }))
}

/// Delete a PVC
pub async fn delete_pvc(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let k8s = state.k8s.read().await.clone().ok_or_else(|| {
        AppError::BadRequest("K8s client not available".to_string())
    })?;

    k8s.delete_pvc(&name).await.map_err(|e| AppError::internal(&format!("Failed to delete PVC: {}", e)))?;

    Ok(Json(serde_json::json!({ "success": true })))
}


// Handlers for ConfigMaps

/// List ConfigMaps (Configuration Groups)
pub async fn list_config_maps(State(state): State<AppState>) -> AppResult<Json<Vec<ConfigMapDto>>> {
    let k8s = state.k8s.read().await.clone().ok_or_else(|| {
        AppError::BadRequest("K8s client not available".to_string())
    })?;

    let items = k8s.list_config_maps().await.map_err(|e| AppError::internal(&e.to_string()))?;

    let dtos = items.into_iter()
        .filter(|cm| {
             // Filter: Only show CMs managed by us or created by user explicitly (checking label)
             // For now, let's filter out known system/internal maps slightly, or better: 
             // Just filtering by usage label is safer, but user might want to see others.
             // We'll trust the label "networksim.io/type=user-config" or similar for created ones,
             // but let's just return all non-system ones for visibility.
             let name = cm.metadata.name.as_deref().unwrap_or("");
             !name.eq("kube-root-ca.crt") && !name.starts_with("kube-")
        })
        .map(|cm| {
            let name = cm.metadata.name.unwrap_or_default();
            let keys = cm.data.as_ref().map(|d| d.keys().cloned().collect()).unwrap_or_default();
            let created_at = cm.metadata.creation_timestamp.map(|t| t.0.to_rfc3339());
            
            ConfigMapDto { name, keys, created_at }
        }).collect();

    Ok(Json(dtos))
}

/// Create a new ConfigMap (Group)
pub async fn create_config_map(
    State(state): State<AppState>,
    Json(req): Json<CreateConfigMapRequest>,
) -> AppResult<Json<ConfigMapDto>> {
    let k8s = state.k8s.read().await.clone().ok_or_else(|| {
        AppError::BadRequest("K8s client not available".to_string())
    })?;

    if k8s.config_map_exists(&req.name).await.unwrap_or(false) {
        return Err(AppError::BadRequest(format!("ConfigMap {} already exists", req.name)));
    }

    let cm = ConfigMap {
        metadata: k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta {
            name: Some(req.name.clone()),
            labels: Some(BTreeMap::from([
                ("app.kubernetes.io/managed-by".to_string(), "networksim".to_string()),
                ("networksim.io/type".to_string(), "user-config".to_string()),
            ])),
            ..Default::default()
        },
        data: Some(BTreeMap::new()),
        ..Default::default()
    };

    k8s.create_config_map(&cm).await.map_err(|e| AppError::internal(&format!("Failed to create ConfigMap: {}", e)))?;

    Ok(Json(ConfigMapDto {
        name: req.name,
        keys: vec![],
        created_at: Some(chrono::Utc::now().to_rfc3339()),
    }))
}

/// Delete a ConfigMap
pub async fn delete_config_map(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let k8s = state.k8s.read().await.clone().ok_or_else(|| {
        AppError::BadRequest("K8s client not available".to_string())
    })?;

    k8s.delete_config_map(&name).await.map_err(|e| AppError::internal(&format!("Failed to delete ConfigMap: {}", e)))?;

    Ok(Json(serde_json::json!({ "success": true })))
}

/// Upload file to ConfigMap
pub async fn upload_file_to_config_map(
    State(state): State<AppState>,
    Path(name): Path<String>,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    let k8s = state.k8s.read().await.clone().ok_or_else(|| {
        AppError::BadRequest("K8s client not available".to_string())
    })?;

    // 1. Get existing ConfigMap
    let mut cm = k8s.get_config_map(&name).await.map_err(|_| {
        AppError::NotFound(format!("ConfigMap {} not found", name))
    })?;

    let mut data_map = cm.data.unwrap_or_default();
    let mut files_added = Vec::new();

    // 2. Process multipart
    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let file_name = field.file_name().unwrap_or("unknown.txt").to_string();
        let content_bytes = field.bytes().await.map_err(|e| AppError::internal(&format!("Failed to read field: {}", e)))?;
        
        // Try to convert to string (ConfigMaps store strings in 'data', binaries in 'binary_data')
        // For simplicity in this version, we assume text files.
        if let Ok(content_str) = String::from_utf8(content_bytes.to_vec()) {
            data_map.insert(file_name.clone(), content_str);
            files_added.push(file_name);
        } else {
             // If we wanted to support binary, we'd use .binary_data field of ConfigMap, but the K8s crate 
             // might need specific handling. Let's stick to text for config files.
             return Err(AppError::BadRequest(format!("File {} is not valid UTF-8 text", file_name)));
        }
    }

    // 3. Update ConfigMap
    cm.data = Some(data_map);
    k8s.update_config_map(&cm).await.map_err(|e| AppError::internal(&format!("Failed to update ConfigMap: {}", e)))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "files_added": files_added
    })))
}
