//! Chaos condition types and request/response models

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Types of chaos conditions that can be applied
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ChaosType {
    // ---- NetworkChaos types ----
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
    // ---- New chaos types ----
    /// CPU stress (StressChaos)
    #[serde(rename = "stress-cpu")]
    StressCpu,
    /// Pod kill (PodChaos)
    #[serde(rename = "pod-kill")]
    PodKill,
    /// I/O delay (IOChaos)
    #[serde(rename = "io-delay")]
    IoDelay,
    /// HTTP abort (HTTPChaos)
    #[serde(rename = "http-abort")]
    HttpAbort,
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
            ChaosType::StressCpu => write!(f, "stress-cpu"),
            ChaosType::PodKill => write!(f, "pod-kill"),
            ChaosType::IoDelay => write!(f, "io-delay"),
            ChaosType::HttpAbort => write!(f, "http-abort"),
        }
    }
}

/// Kind of Chaos Mesh CRD to use
#[derive(Debug, Clone, PartialEq)]
pub enum ChaosCrdKind {
    NetworkChaos,
    StressChaos,
    PodChaos,
    IOChaos,
    HTTPChaos,
}

impl ChaosType {
    /// Returns the CRD kind for this chaos type
    pub fn crd_kind(&self) -> ChaosCrdKind {
        match self {
            ChaosType::Delay
            | ChaosType::Loss
            | ChaosType::Bandwidth
            | ChaosType::Corrupt
            | ChaosType::Duplicate
            | ChaosType::Partition => ChaosCrdKind::NetworkChaos,
            ChaosType::StressCpu => ChaosCrdKind::StressChaos,
            ChaosType::PodKill => ChaosCrdKind::PodChaos,
            ChaosType::IoDelay => ChaosCrdKind::IOChaos,
            ChaosType::HttpAbort => ChaosCrdKind::HTTPChaos,
        }
    }

    /// Returns true if this chaos type requires a target node (NetworkChaos types)
    pub fn requires_target(&self) -> bool {
        matches!(self.crd_kind(), ChaosCrdKind::NetworkChaos)
    }

    /// Returns true if this is a network-based chaos type
    pub fn is_network_chaos(&self) -> bool {
        matches!(self.crd_kind(), ChaosCrdKind::NetworkChaos)
    }
}

/// Parameters for delay chaos
#[derive(Debug, Clone, Serialize, Deserialize, Default, ToSchema)]
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
#[derive(Debug, Clone, Serialize, Deserialize, Default, ToSchema)]
pub struct LossParams {
    /// Loss percentage (e.g., "25" for 25%)
    pub loss: String,
    /// Correlation percentage
    #[serde(default)]
    pub correlation: Option<String>,
}

/// Parameters for bandwidth limiting
#[derive(Debug, Clone, Serialize, Deserialize, Default, ToSchema)]
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
#[derive(Debug, Clone, Serialize, Deserialize, Default, ToSchema)]
pub struct CorruptParams {
    /// Corruption percentage (e.g., "10")
    pub corrupt: String,
    /// Correlation percentage
    #[serde(default)]
    pub correlation: Option<String>,
}

/// Parameters for packet duplication
#[derive(Debug, Clone, Serialize, Deserialize, Default, ToSchema)]
pub struct DuplicateParams {
    /// Duplication percentage
    pub duplicate: String,
    /// Correlation percentage
    #[serde(default)]
    pub correlation: Option<String>,
}

// ---- New chaos type parameters ----

/// Parameters for CPU stress (StressChaos)
#[derive(Debug, Clone, Serialize, Deserialize, Default, ToSchema)]
pub struct StressCpuParams {
    /// Number of CPU stress workers
    #[serde(default)]
    pub workers: Option<u32>,
    /// CPU load percentage (0-100)
    #[serde(default)]
    pub load: Option<u32>,
}

/// Parameters for pod kill (PodChaos)
#[derive(Debug, Clone, Serialize, Deserialize, Default, ToSchema)]
pub struct PodKillParams {
    /// Grace period in seconds before killing
    #[serde(default)]
    pub grace_period: Option<i64>,
}

/// Parameters for I/O delay (IOChaos)
#[derive(Debug, Clone, Serialize, Deserialize, Default, ToSchema)]
pub struct IoDelayParams {
    /// Delay to add to I/O operations (e.g., "100ms")
    pub delay: String,
    /// Path to affect (default: "/")
    #[serde(default)]
    pub path: Option<String>,
    /// Percentage of operations to delay (0-100)
    #[serde(default)]
    pub percent: Option<u32>,
    /// I/O methods to affect (read, write, etc.)
    #[serde(default)]
    pub methods: Option<Vec<String>>,
}

/// Parameters for HTTP abort (HTTPChaos)
#[derive(Debug, Clone, Serialize, Deserialize, Default, ToSchema)]
pub struct HttpAbortParams {
    /// HTTP status code to return (e.g., 500, 429)
    #[serde(default)]
    pub code: Option<u16>,
    /// HTTP method to match (GET, POST, etc.)
    #[serde(default)]
    pub method: Option<String>,
    /// Path pattern to match (e.g., "/api/*")
    #[serde(default)]
    pub path: Option<String>,
    /// Port to intercept
    #[serde(default)]
    pub port: Option<u16>,
}

/// Union of all chaos parameters
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
#[derive(Default)]
pub enum ChaosParams {
    // NetworkChaos params
    Delay(DelayParams),
    Loss(LossParams),
    Bandwidth(BandwidthParams),
    Corrupt(CorruptParams),
    Duplicate(DuplicateParams),
    // New chaos type params
    StressCpu(StressCpuParams),
    PodKill(PodKillParams),
    IoDelay(IoDelayParams),
    HttpAbort(HttpAbortParams),
    /// Empty for partition and other types without params
    #[default]
    None,
}

/// Target direction for network chaos
#[derive(Debug, Clone, Serialize, Deserialize, Default, ToSchema)]
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
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
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

/// Request to update a chaos condition (only editable fields)
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct UpdateChaosRequest {
    /// Direction of traffic to affect
    #[serde(default)]
    pub direction: ChaosDirection,
    /// Duration (e.g., "60s", "5m") - if not set, runs until deleted
    #[serde(default)]
    pub duration: Option<String>,
    /// Parameters specific to the chaos type
    pub params: serde_json::Value,
}

/// Status of a chaos condition in the system
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ChaosConditionStatus {
    /// Created but not yet applied to K8s
    #[default]
    Pending,
    /// Currently active in K8s
    Active,
    /// Paused (removed from K8s but saved in DB)
    Paused,
}

impl std::fmt::Display for ChaosConditionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChaosConditionStatus::Pending => write!(f, "pending"),
            ChaosConditionStatus::Active => write!(f, "active"),
            ChaosConditionStatus::Paused => write!(f, "paused"),
        }
    }
}

impl std::str::FromStr for ChaosConditionStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "pending" => Ok(ChaosConditionStatus::Pending),
            "active" => Ok(ChaosConditionStatus::Active),
            "paused" => Ok(ChaosConditionStatus::Paused),
            _ => Err(format!("Unknown status: {}", s)),
        }
    }
}

/// A chaos condition that has been applied
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
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
    /// Kubernetes resource name (when active)
    #[serde(default)]
    pub k8s_name: Option<String>,
    /// Current status: pending, active, paused
    #[serde(default)]
    pub status: ChaosConditionStatus,
    /// When the chaos was started (activated) - for countdown timer
    #[serde(default)]
    pub started_at: Option<DateTime<Utc>>,
    /// When created
    pub created_at: DateTime<Utc>,
    /// When last updated
    pub updated_at: DateTime<Utc>,
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
