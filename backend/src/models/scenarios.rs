use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::chaos::ChaosType;
use utoipa::ToSchema;

/// A test scenario composed of ordered chaos steps to run against a topology.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct Scenario {
    #[schema(example = "scenario-1234")]
    pub id: String,
    #[schema(example = "topology-1234")]
    pub topology_id: String,
    #[schema(example = "Baseline failure test")]
    pub name: String,
    #[schema(example = "Simulates intermittent packet loss between two nodes")]
    pub description: Option<String>,
    #[schema(example = 60)]
    pub total_duration: i64,
    /// Ordered steps that make up the scenario
    #[schema(value_type = Vec<ScenarioStep>)]
    pub steps: sqlx::types::Json<Vec<ScenarioStep>>,
    #[schema(example = "2025-01-01T12:00:00Z")]
    pub created_at: String,
    #[schema(example = "2025-01-01T12:05:00Z")]
    pub updated_at: String,
}

/// Single step inside a scenario, describing a chaos action to apply.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ScenarioStep {
    #[schema(example = "step-1")]
    pub id: String,
    #[serde(rename = "type")]
    /// Chaos type for the step (see ChaosType enum)
    pub chaos_type: ChaosType,
    #[serde(rename = "sourceNodeId")]
    /// Source node id for the action
    #[schema(example = "node-1")]
    pub source_node_id: String,
    #[serde(rename = "targetNodeId")]
    #[serde(default)]
    /// Optional target node id for the action
    #[schema(example = "node-2")]
    pub target_node_id: Option<String>,
    #[serde(rename = "startAt")]
    /// Start time (seconds) relative to scenario start
    #[schema(example = 0.0)]
    pub start_at: f64,
    /// Duration in seconds
    #[schema(example = 10.0)]
    pub duration: f64,
    /// Step-specific parameters as JSON
    pub params: serde_json::Value,
    #[serde(rename = "laneId")]
    #[schema(example = "lane-1")]
    pub lane_id: String,
}

/// Request to create a new scenario for a topology.
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateScenarioRequest {
    #[schema(example = "Baseline failure test")]
    pub name: String,
    #[serde(default)]
    #[schema(example = "Optional description")]
    pub description: Option<String>,
    #[schema(example = 60)]
    pub total_duration: i64,
    #[schema(value_type = Vec<ScenarioStep>)]
    pub steps: Vec<ScenarioStep>,
}

/// Partial update for an existing scenario.
#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateScenarioRequest {
    #[serde(default)]
    #[schema(example = "Updated scenario name")]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub total_duration: Option<i64>,
    #[serde(default)]
    pub steps: Option<Vec<ScenarioStep>>,
}
