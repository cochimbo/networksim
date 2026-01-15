use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Estado de una aplicación Helm
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
#[serde(rename_all = "lowercase")]
pub enum AppStatus {
    Pending,
    Deploying,
    Deployed,
    Failed,
    Uninstalling,
}

/// Información de una aplicación desplegada con Helm
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Application {
    pub id: Uuid,
    pub node_id: String,
    pub topology_id: Uuid,
    pub chart: String,
    pub namespace: String,
    #[serde(rename = "envvalues")]
    pub values: Option<serde_json::Value>,
    pub status: AppStatus,
    pub release_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Request para desplegar una aplicación
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeployAppRequest {
    pub chart: String,
    pub chart_type: Option<String>,
    pub node_selector: Vec<String>,
    
    // Configuración detallada que el frontend envía plana
    pub envvalues: Option<serde_json::Value>,
    pub replicas: Option<i32>,
    pub volumes: Option<Vec<serde_json::Value>>, // Usamos Value para ser flexibles con los tipos de volumen
    #[serde(rename = "healthCheck")]
    pub health_check: Option<serde_json::Value>,
    pub cpu_request: Option<String>,
    pub memory_request: Option<String>,
    pub cpu_limit: Option<String>,
    pub memory_limit: Option<String>,

    // Campo legacy por si acaso, pero el frontend envía lo de arriba
    pub values: Option<serde_json::Value>,
}

/// Información de un chart Helm disponible
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartInfo {
    pub name: String,
    pub version: String,
    pub description: String,
    pub app_version: Option<String>,
}

/// Respuesta de listado de aplicaciones
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppListResponse {
    pub applications: Vec<Application>,
}

/// Logs de una aplicación
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppLogs {
    pub logs: String,
    pub truncated: bool,
}