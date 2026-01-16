use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::chaos::ChaosType;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Scenario {
    pub id: String,
    pub topology_id: String,
    pub name: String,
    pub description: Option<String>,
    pub total_duration: i64,
    pub steps: sqlx::types::Json<Vec<ScenarioStep>>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioStep {
    pub id: String,
    #[serde(rename = "type")]
    pub chaos_type: ChaosType,
    #[serde(rename = "sourceNodeId")]
    pub source_node_id: String,
    #[serde(rename = "targetNodeId")]
    #[serde(default)]
    pub target_node_id: Option<String>,
    #[serde(rename = "startAt")]
    pub start_at: f64,
    pub duration: f64,
    pub params: serde_json::Value,
    #[serde(rename = "laneId")]
    pub lane_id: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateScenarioRequest {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub total_duration: i64,
    pub steps: Vec<ScenarioStep>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateScenarioRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub total_duration: Option<i64>,
    #[serde(default)]
    pub steps: Option<Vec<ScenarioStep>>,
}
