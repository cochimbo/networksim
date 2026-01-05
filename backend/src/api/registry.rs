//! Registry Configuration API
//!
//! Manage private container registries for application deployments.

use axum::{
    extract::{Path, State},
    Json,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;
use uuid::Uuid;

use crate::api::AppState;
use crate::error::{AppError, AppResult};

/// Registry configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryConfig {
    pub id: String,
    pub name: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing)]  // Never expose password in responses
    pub password: Option<String>,
    pub is_default: bool,
    pub is_insecure: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct RegistryRow {
    id: String,
    name: String,
    url: String,
    username: Option<String>,
    password: Option<String>,
    is_default: i32,
    is_insecure: i32,
    created_at: String,
    updated_at: String,
}

impl From<RegistryRow> for RegistryConfig {
    fn from(row: RegistryRow) -> Self {
        RegistryConfig {
            id: row.id,
            name: row.name,
            url: row.url,
            username: row.username,
            password: row.password,
            is_default: row.is_default != 0,
            is_insecure: row.is_insecure != 0,
            created_at: row.created_at.parse().unwrap_or_else(|_| Utc::now()),
            updated_at: row.updated_at.parse().unwrap_or_else(|_| Utc::now()),
        }
    }
}

/// Response without password
#[derive(Debug, Serialize)]
pub struct RegistryResponse {
    pub id: String,
    pub name: String,
    pub url: String,
    pub username: Option<String>,
    pub has_credentials: bool,
    pub is_default: bool,
    pub is_insecure: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<RegistryConfig> for RegistryResponse {
    fn from(config: RegistryConfig) -> Self {
        RegistryResponse {
            id: config.id,
            name: config.name,
            url: config.url,
            has_credentials: config.username.is_some() && config.password.is_some(),
            username: config.username,
            is_default: config.is_default,
            is_insecure: config.is_insecure,
            created_at: config.created_at,
            updated_at: config.updated_at,
        }
    }
}

/// Create registry request
#[derive(Debug, Deserialize)]
pub struct CreateRegistryRequest {
    pub name: String,
    pub url: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub is_default: Option<bool>,
    pub is_insecure: Option<bool>,
}

/// Update registry request
#[derive(Debug, Deserialize)]
pub struct UpdateRegistryRequest {
    pub name: Option<String>,
    pub url: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub is_default: Option<bool>,
    pub is_insecure: Option<bool>,
}

/// List all registries
pub async fn list_registries(
    State(state): State<AppState>,
) -> AppResult<Json<Vec<RegistryResponse>>> {
    let rows: Vec<RegistryRow> = sqlx::query_as(
        "SELECT id, name, url, username, password, is_default, is_insecure, created_at, updated_at FROM registry_configs ORDER BY is_default DESC, name"
    )
    .fetch_all(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to list registries: {}", e)))?;

    let registries: Vec<RegistryResponse> = rows
        .into_iter()
        .map(|r| RegistryConfig::from(r).into())
        .collect();

    Ok(Json(registries))
}

/// Get a registry by ID
pub async fn get_registry(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<RegistryResponse>> {
    let row: RegistryRow = sqlx::query_as(
        "SELECT id, name, url, username, password, is_default, is_insecure, created_at, updated_at FROM registry_configs WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to get registry: {}", e)))?
    .ok_or_else(|| AppError::not_found(&format!("Registry {} not found", id)))?;

    Ok(Json(RegistryConfig::from(row).into()))
}

/// Create a new registry
pub async fn create_registry(
    State(state): State<AppState>,
    Json(req): Json<CreateRegistryRequest>,
) -> AppResult<Json<RegistryResponse>> {
    let id = format!("registry-{}", &Uuid::new_v4().to_string()[..8]);
    let now = Utc::now();
    let is_default = req.is_default.unwrap_or(false);
    let is_insecure = req.is_insecure.unwrap_or(false);

    // If this is set as default, unset other defaults
    if is_default {
        sqlx::query("UPDATE registry_configs SET is_default = 0")
            .execute(state.db.pool())
            .await
            .map_err(|e| AppError::internal(&format!("Failed to update defaults: {}", e)))?;
    }

    sqlx::query(
        "INSERT INTO registry_configs (id, name, url, username, password, is_default, is_insecure, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&req.name)
    .bind(&req.url)
    .bind(&req.username)
    .bind(&req.password)
    .bind(if is_default { 1 } else { 0 })
    .bind(if is_insecure { 1 } else { 0 })
    .bind(now.to_rfc3339())
    .bind(now.to_rfc3339())
    .execute(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to create registry: {}", e)))?;

    // Create ImagePullSecret in K8s if credentials provided
    if req.username.is_some() && req.password.is_some() {
        if let Some(k8s) = &state.k8s {
            if let Err(e) = create_image_pull_secret(
                k8s,
                &id,
                &req.url,
                req.username.as_deref().unwrap_or(""),
                req.password.as_deref().unwrap_or(""),
            ).await {
                tracing::warn!("Failed to create ImagePullSecret: {}", e);
            }
        }
    }

    info!(registry_id = %id, name = %req.name, "Created registry config");

    let config = RegistryConfig {
        id,
        name: req.name,
        url: req.url,
        username: req.username,
        password: req.password,
        is_default,
        is_insecure,
        created_at: now,
        updated_at: now,
    };

    Ok(Json(config.into()))
}

/// Update a registry
pub async fn update_registry(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateRegistryRequest>,
) -> AppResult<Json<RegistryResponse>> {
    // Get existing
    let existing: RegistryRow = sqlx::query_as(
        "SELECT id, name, url, username, password, is_default, is_insecure, created_at, updated_at FROM registry_configs WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to get registry: {}", e)))?
    .ok_or_else(|| AppError::not_found(&format!("Registry {} not found", id)))?;

    let now = Utc::now();
    let name = req.name.unwrap_or(existing.name);
    let url = req.url.unwrap_or(existing.url);
    let username = req.username.or(existing.username);
    let password = req.password.or(existing.password);
    let is_default = req.is_default.unwrap_or(existing.is_default != 0);
    let is_insecure = req.is_insecure.unwrap_or(existing.is_insecure != 0);

    // If this is set as default, unset other defaults
    if is_default && existing.is_default == 0 {
        sqlx::query("UPDATE registry_configs SET is_default = 0")
            .execute(state.db.pool())
            .await
            .map_err(|e| AppError::internal(&format!("Failed to update defaults: {}", e)))?;
    }

    sqlx::query(
        "UPDATE registry_configs SET name = ?, url = ?, username = ?, password = ?, is_default = ?, is_insecure = ?, updated_at = ? WHERE id = ?"
    )
    .bind(&name)
    .bind(&url)
    .bind(&username)
    .bind(&password)
    .bind(if is_default { 1 } else { 0 })
    .bind(if is_insecure { 1 } else { 0 })
    .bind(now.to_rfc3339())
    .bind(&id)
    .execute(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to update registry: {}", e)))?;

    // Update ImagePullSecret in K8s
    if username.is_some() && password.is_some() {
        if let Some(k8s) = &state.k8s {
            if let Err(e) = create_image_pull_secret(
                k8s,
                &id,
                &url,
                username.as_deref().unwrap_or(""),
                password.as_deref().unwrap_or(""),
            ).await {
                tracing::warn!("Failed to update ImagePullSecret: {}", e);
            }
        }
    }

    info!(registry_id = %id, "Updated registry config");

    let config = RegistryConfig {
        id,
        name,
        url,
        username,
        password,
        is_default,
        is_insecure,
        created_at: existing.created_at.parse().unwrap_or_else(|_| Utc::now()),
        updated_at: now,
    };

    Ok(Json(config.into()))
}

/// Delete a registry
pub async fn delete_registry(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    // Don't allow deleting docker-hub
    if id == "docker-hub" {
        return Err(AppError::bad_request("Cannot delete Docker Hub registry"));
    }

    let result = sqlx::query("DELETE FROM registry_configs WHERE id = ?")
        .bind(&id)
        .execute(state.db.pool())
        .await
        .map_err(|e| AppError::internal(&format!("Failed to delete registry: {}", e)))?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found(&format!("Registry {} not found", id)));
    }

    // Delete ImagePullSecret from K8s
    if let Some(k8s) = &state.k8s {
        let secret_name = format!("registry-secret-{}", id);
        if let Err(e) = k8s.delete_secret(&secret_name, "networksim-sim").await {
            tracing::warn!("Failed to delete ImagePullSecret: {}", e);
        }
    }

    info!(registry_id = %id, "Deleted registry config");

    Ok(Json(serde_json::json!({"deleted": true})))
}

/// Get the default registry
pub async fn get_default_registry(
    State(state): State<AppState>,
) -> AppResult<Json<RegistryResponse>> {
    let row: RegistryRow = sqlx::query_as(
        "SELECT id, name, url, username, password, is_default, is_insecure, created_at, updated_at FROM registry_configs WHERE is_default = 1 LIMIT 1"
    )
    .fetch_optional(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to get default registry: {}", e)))?
    .ok_or_else(|| AppError::not_found("No default registry configured"))?;

    Ok(Json(RegistryConfig::from(row).into()))
}

/// Test registry connection
pub async fn test_registry(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let row: RegistryRow = sqlx::query_as(
        "SELECT id, name, url, username, password, is_default, is_insecure, created_at, updated_at FROM registry_configs WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to get registry: {}", e)))?
    .ok_or_else(|| AppError::not_found(&format!("Registry {} not found", id)))?;

    // Try to connect to the registry
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(row.is_insecure != 0)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::internal(&format!("Failed to create HTTP client: {}", e)))?;

    let url = if row.url.starts_with("http") {
        format!("{}/v2/", row.url.trim_end_matches('/'))
    } else {
        // If insecure is set, default to http, otherwise https
        if row.is_insecure != 0 {
            format!("http://{}/v2/", row.url.trim_end_matches('/'))
        } else {
            format!("https://{}/v2/", row.url.trim_end_matches('/'))
        }
    };

    let mut request = client.get(&url);

    if let (Some(user), Some(pass)) = (&row.username, &row.password) {
        request = request.basic_auth(user, Some(pass));
    }

    match request.send().await {
        Ok(response) => {
            let status = response.status();
            if status.is_success() || status.as_u16() == 401 {
                // 401 is expected for registries that require auth
                Ok(Json(serde_json::json!({
                    "success": true,
                    "status": status.as_u16(),
                    "message": "Registry is reachable"
                })))
            } else {
                Ok(Json(serde_json::json!({
                    "success": false,
                    "status": status.as_u16(),
                    "message": format!("Registry returned status {}", status)
                })))
            }
        }
        Err(e) => {
            Ok(Json(serde_json::json!({
                "success": false,
                "message": format!("Failed to connect: {}", e)
            })))
        }
    }
}

/// Create ImagePullSecret in Kubernetes
async fn create_image_pull_secret(
    k8s: &crate::k8s::K8sClient,
    registry_id: &str,
    registry_url: &str,
    username: &str,
    password: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use k8s_openapi::api::core::v1::Secret;
    use k8s_openapi::ByteString;
    use kube::api::{Api, PostParams};
    use std::collections::BTreeMap;

    let secret_name = format!("registry-secret-{}", registry_id);

    // Create docker config JSON
    let auth = STANDARD.encode(format!("{}:{}", username, password));
    let docker_config = serde_json::json!({
        "auths": {
            registry_url: {
                "username": username,
                "password": password,
                "auth": auth
            }
        }
    });

    let docker_config_str = serde_json::to_string(&docker_config)?;

    let mut data = BTreeMap::new();
    data.insert(
        ".dockerconfigjson".to_string(),
        ByteString(docker_config_str.into_bytes()),
    );

    let secret = Secret {
        metadata: kube::api::ObjectMeta {
            name: Some(secret_name.clone()),
            namespace: Some("networksim-sim".to_string()),
            ..Default::default()
        },
        type_: Some("kubernetes.io/dockerconfigjson".to_string()),
        data: Some(data),
        ..Default::default()
    };

    let secrets: Api<Secret> = Api::namespaced(k8s.inner().clone(), "networksim-sim");

    // Try to delete existing secret first
    let _ = secrets.delete(&secret_name, &Default::default()).await;

    // Create new secret
    secrets.create(&PostParams::default(), &secret).await?;

    info!(secret_name = %secret_name, "Created ImagePullSecret");

    Ok(())
}

/// Get ImagePullSecret name for a registry
pub fn get_image_pull_secret_name(registry_id: &str) -> String {
    if registry_id == "docker-hub" {
        String::new() // No secret needed for Docker Hub public images
    } else {
        format!("registry-secret-{}", registry_id)
    }
}
