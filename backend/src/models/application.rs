use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use sqlx::FromRow;
use strum::Display;

/// Estado de una aplicación Helm
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, Display, PartialEq)]
#[sqlx(type_name = "TEXT")]
#[serde(rename_all = "lowercase")]
pub enum AppStatus {
    Pending,
    Deploying,
    Deployed,
    Failed,
    Uninstalling,
}

impl From<String> for AppStatus {
    fn from(s: String) -> Self {
        match s.to_lowercase().as_str() {
            "pending" => AppStatus::Pending,
            "deploying" => AppStatus::Deploying,
            "deployed" => AppStatus::Deployed,
            "failed" => AppStatus::Failed,
            "uninstalling" => AppStatus::Uninstalling,
            _ => AppStatus::Pending, // Default to pending for unknown values
        }
    }
}

impl From<&str> for AppStatus {
    fn from(s: &str) -> Self {
        AppStatus::from(s.to_string())
    }
}

/// Modelo de base de datos para aplicaciones desplegadas con Helm
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Application {
    pub id: Uuid,
    pub node_id: String,
    pub topology_id: Uuid,
    pub name: String,
    pub chart: String,
    pub version: Option<String>,
    pub namespace: String,
    pub values: Option<serde_json::Value>,
    pub status: AppStatus,
    pub release_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Request para crear una nueva aplicación
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateApplication {
    pub node_id: String,
    pub topology_id: Uuid,
    pub name: String,
    pub chart: String,
    pub version: Option<String>,
    pub values: Option<serde_json::Value>,
}

/// Request para actualizar una aplicación
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateApplication {
    pub status: Option<AppStatus>,
    pub values: Option<serde_json::Value>,
}