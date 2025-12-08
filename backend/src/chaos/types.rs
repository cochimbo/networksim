//! Chaos condition types and request/response models

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Types of chaos conditions that can be applied
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ChaosType {
    /// Network latency/delay
    Delay,
    /// Packet loss
    Loss,
    /// Bandwidth limiting
    Bandwidth,
    /// Packet corruption
    Corrupt,
    /// Packet duplication
    Duplicate,
    /// Network partition (complete disconnect)
    Partition,
}

impl std::fmt::Display for ChaosType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChaosType::Delay => write!(f, "delay"),
            ChaosType::Loss => write!(f, "loss"),
            ChaosType::Bandwidth => write!(f, "bandwidth"),
            ChaosType::Corrupt => write!(f, "corrupt"),
            ChaosType::Duplicate => write!(f, "duplicate"),
            ChaosType::Partition => write!(f, "partition"),
        }
    }
}

/// Parameters for delay chaos
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DelayParams {
    /// Latency to add (e.g., "100ms", "1s")
    pub latency: String,
    /// Random jitter (e.g., "10ms")
    #[serde(default)]
    pub jitter: Option<String>,
    /// Correlation percentage (0-100)
    #[serde(default)]
    pub correlation: Option<String>,
}

/// Parameters for packet loss chaos
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LossParams {
    /// Loss percentage (e.g., "25" for 25%)
    pub loss: String,
    /// Correlation percentage
    #[serde(default)]
    pub correlation: Option<String>,
}

/// Parameters for bandwidth limiting
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BandwidthParams {
    /// Rate limit (e.g., "1mbps", "100kbps")
    pub rate: String,
    /// Buffer size in bytes
    #[serde(default)]
    pub buffer: Option<u32>,
    /// Limit in bytes
    #[serde(default)]
    pub limit: Option<u32>,
}

/// Parameters for packet corruption
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CorruptParams {
    /// Corruption percentage (e.g., "10")
    pub corrupt: String,
    /// Correlation percentage
    #[serde(default)]
    pub correlation: Option<String>,
}

/// Parameters for packet duplication
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DuplicateParams {
    /// Duplication percentage
    pub duplicate: String,
    /// Correlation percentage
    #[serde(default)]
    pub correlation: Option<String>,
}

/// Union of all chaos parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ChaosParams {
    Delay(DelayParams),
    Loss(LossParams),
    Bandwidth(BandwidthParams),
    Corrupt(CorruptParams),
    Duplicate(DuplicateParams),
    /// Empty for partition
    None,
}

impl Default for ChaosParams {
    fn default() -> Self {
        ChaosParams::None
    }
}

/// Target direction for network chaos
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ChaosDirection {
    /// Apply to outgoing traffic
    #[default]
    To,
    /// Apply to incoming traffic
    From,
    /// Apply to both directions
    Both,
}

impl std::fmt::Display for ChaosDirection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChaosDirection::To => write!(f, "to"),
            ChaosDirection::From => write!(f, "from"),
            ChaosDirection::Both => write!(f, "both"),
        }
    }
}

/// Request to create a chaos condition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateChaosRequest {
    /// Topology ID the chaos applies to
    pub topology_id: String,
    /// Source node ID (where chaos originates)
    pub source_node_id: String,
    /// Target node ID (optional - if not set, applies to all traffic)
    #[serde(default)]
    pub target_node_id: Option<String>,
    /// Type of chaos to apply
    pub chaos_type: ChaosType,
    /// Direction of traffic to affect
    #[serde(default)]
    pub direction: ChaosDirection,
    /// Duration (e.g., "60s", "5m") - if not set, runs until deleted
    #[serde(default)]
    pub duration: Option<String>,
    /// Parameters specific to the chaos type
    pub params: serde_json::Value,
}

/// A chaos condition that has been applied
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaosCondition {
    /// Unique ID
    pub id: String,
    /// Topology ID
    pub topology_id: String,
    /// Source node ID
    pub source_node_id: String,
    /// Target node ID (if specific)
    pub target_node_id: Option<String>,
    /// Type of chaos
    pub chaos_type: ChaosType,
    /// Direction
    pub direction: ChaosDirection,
    /// Duration
    pub duration: Option<String>,
    /// Parameters
    pub params: serde_json::Value,
    /// Kubernetes resource name
    pub k8s_name: String,
    /// Whether the condition is currently active
    pub active: bool,
    /// When created
    pub created_at: DateTime<Utc>,
}

/// Status of a chaos condition from Kubernetes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaosStatus {
    /// K8s resource name
    pub name: String,
    /// Condition ID extracted from name
    pub condition_id: String,
    /// Type of chaos
    pub chaos_type: ChaosType,
    /// Current phase (Running, Pending, etc.)
    pub phase: String,
    /// Target pods affected
    pub target_pods: Vec<String>,
    /// Status message
    pub message: Option<String>,
}
