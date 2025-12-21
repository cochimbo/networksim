//! OpenAPI documentation for the NetworkSim API
//!
//! This module provides Swagger/OpenAPI documentation for all API endpoints.

use utoipa::OpenApi;

/// API Documentation
#[derive(OpenApi)]
#[openapi(
    info(
        title = "NetworkSim API",
        version = "1.0.0",
        description = "Network Topology Simulator with Chaos Engineering capabilities.\n\n## Features\n- Create and manage network topologies\n- Deploy topologies to Kubernetes\n- Apply chaos engineering (delay, loss, partition, etc.)\n- Monitor network metrics and events\n- Run diagnostic tests",
        license(name = "MIT"),
        contact(name = "NetworkSim Team")
    ),
    servers(
        (url = "http://localhost:8080", description = "Local development server")
    ),
    tags(
        (name = "topologies", description = "Topology management - create, update, delete, deploy"),
        (name = "chaos", description = "Chaos engineering - apply network conditions"),
        (name = "presets", description = "Chaos presets - predefined chaos configurations"),
        (name = "metrics", description = "Live metrics and monitoring"),
        (name = "events", description = "Event timeline and logging"),
        (name = "tests", description = "Network diagnostic tests"),
        (name = "applications", description = "Application deployment on nodes"),
        (name = "cluster", description = "Kubernetes cluster status")
    ),
    paths(
        // Topologies
        crate::api::topologies::list,
        crate::api::topologies::create,
        crate::api::topologies::get,
        crate::api::topologies::update,
        crate::api::topologies::delete,
        // Deploy
        crate::api::deploy::deploy,
        crate::api::deploy::destroy,
        crate::api::deploy::status,
        // Chaos
        crate::api::chaos::list,
        crate::api::chaos::create,
        crate::api::chaos::start,
        crate::api::chaos::stop,
        crate::api::chaos::delete,
        crate::api::chaos::delete_all,
        // Presets
        crate::api::presets::list_presets,
        crate::api::presets::get_preset,
        crate::api::presets::create_preset,
        crate::api::presets::delete_preset,
        // Diagnostic
        crate::api::diagnostic::run_diagnostic,
        crate::api::diagnostic::run_app_to_app_test,
        // Cluster
        crate::api::health::cluster_status,
        // New v1 endpoints
        crate::api::chaos::affected_apps,
    ),
    components(
        schemas(
            // Topology schemas
            TopologySchema,
            NodeSchema,
            LinkSchema,
            PositionSchema,
            NodeConfigSchema,
            LinkPropertiesSchema,
            CreateTopologyRequest,
            UpdateTopologyRequest,
            // Deployment schemas
            DeploymentStatusSchema,
            NodeStatusSchema,
            // Chaos schemas
            ChaosConditionSchema,
            CreateChaosRequest,
            ChaosTypeSchema,
            ChaosDirectionSchema,
            ChaosParamsSchema,
            // Preset schemas
            ChaosPresetSchema,
            CreatePresetRequest,
            // Diagnostic schemas
            DiagnosticReportSchema,
            DiagnosticSummarySchema,
            ConnectivityResultSchema,
            // Cluster schemas
            ClusterStatusSchema,
            // Common
            ErrorResponse,
        )
    )
)]
pub struct ApiDoc;

// ============================================================================
// Schema definitions for OpenAPI documentation
// ============================================================================

use utoipa::ToSchema;
use serde::{Deserialize, Serialize};

/// Error response returned by the API
#[derive(Serialize, Deserialize, ToSchema)]
pub struct ErrorResponse {
    /// Error message
    pub error: String,
    /// HTTP status code
    pub status: u16,
}

// --- Topology Schemas ---

/// Network topology definition
#[derive(Serialize, Deserialize, ToSchema)]
pub struct TopologySchema {
    /// Unique identifier
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub id: String,
    /// Topology name
    #[schema(example = "My Network")]
    pub name: String,
    /// Optional description
    #[schema(example = "A test network topology")]
    pub description: Option<String>,
    /// List of nodes in the topology
    pub nodes: Vec<NodeSchema>,
    /// List of links between nodes
    pub links: Vec<LinkSchema>,
    /// Creation timestamp
    pub created_at: String,
    /// Last update timestamp
    pub updated_at: String,
}

/// Node in a topology
#[derive(Serialize, Deserialize, ToSchema)]
pub struct NodeSchema {
    /// Unique node identifier
    #[schema(example = "server-1")]
    pub id: String,
    /// Node display name
    #[schema(example = "Web Server")]
    pub name: String,
    /// Position in the graph editor
    pub position: PositionSchema,
    /// Node configuration
    pub config: Option<NodeConfigSchema>,
}

/// Position coordinates
#[derive(Serialize, Deserialize, ToSchema)]
pub struct PositionSchema {
    /// X coordinate
    #[schema(example = 100.0)]
    pub x: f64,
    /// Y coordinate
    #[schema(example = 200.0)]
    pub y: f64,
}

/// Node configuration options
#[derive(Serialize, Deserialize, ToSchema)]
pub struct NodeConfigSchema {
    /// Container image to use
    #[schema(example = "alpine:latest")]
    pub image: Option<String>,
    /// CPU limit
    #[schema(example = "100m")]
    pub cpu: Option<String>,
    /// Memory limit
    #[schema(example = "128Mi")]
    pub memory: Option<String>,
}

/// Link between two nodes
#[derive(Serialize, Deserialize, ToSchema)]
pub struct LinkSchema {
    /// Unique link identifier
    #[schema(example = "link-1")]
    pub id: String,
    /// Source node ID
    #[schema(example = "server-1")]
    pub source: String,
    /// Target node ID
    #[schema(example = "server-2")]
    pub target: String,
    /// Link properties
    pub properties: Option<LinkPropertiesSchema>,
}

/// Link properties
#[derive(Serialize, Deserialize, ToSchema)]
pub struct LinkPropertiesSchema {
    /// Bandwidth limit
    #[schema(example = "100mbps")]
    pub bandwidth: Option<String>,
    /// Latency
    #[schema(example = "10ms")]
    pub latency: Option<String>,
}

/// Request to create a new topology
#[derive(Serialize, Deserialize, ToSchema)]
pub struct CreateTopologyRequest {
    /// Topology name
    #[schema(example = "Production Network")]
    pub name: String,
    /// Optional description
    pub description: Option<String>,
    /// List of nodes
    pub nodes: Vec<NodeSchema>,
    /// List of links
    pub links: Vec<LinkSchema>,
}

/// Request to update a topology
#[derive(Serialize, Deserialize, ToSchema)]
pub struct UpdateTopologyRequest {
    /// Updated name
    pub name: Option<String>,
    /// Updated description
    pub description: Option<String>,
    /// Updated nodes
    pub nodes: Option<Vec<NodeSchema>>,
    /// Updated links
    pub links: Option<Vec<LinkSchema>>,
}

// --- Deployment Schemas ---

/// Deployment status for a topology
#[derive(Serialize, Deserialize, ToSchema)]
pub struct DeploymentStatusSchema {
    /// Topology ID
    pub topology_id: String,
    /// Overall status: deploying, running, stopping, stopped, error
    #[schema(example = "running")]
    pub status: String,
    /// Status message
    pub message: Option<String>,
    /// Status of each node
    pub nodes: Vec<NodeStatusSchema>,
}

/// Status of a deployed node
#[derive(Serialize, Deserialize, ToSchema)]
pub struct NodeStatusSchema {
    /// Node ID
    #[schema(example = "server-1")]
    pub id: String,
    /// Node name
    pub name: String,
    /// Status: pending, running, error
    #[schema(example = "running")]
    pub status: String,
    /// Kubernetes pod name
    #[schema(example = "ns-abc123-server-1")]
    pub pod_name: Option<String>,
    /// Pod IP address
    #[schema(example = "10.42.0.15")]
    pub pod_ip: Option<String>,
    /// Error message if any
    pub message: Option<String>,
}

// --- Chaos Schemas ---

/// Chaos condition applied to a topology
#[derive(Serialize, Deserialize, ToSchema)]
pub struct ChaosConditionSchema {
    /// Unique condition ID
    #[schema(example = "abc12345")]
    pub id: String,
    /// Topology ID
    pub topology_id: String,
    /// Source node ID
    #[schema(example = "server-1")]
    pub source_node_id: String,
    /// Target node ID (optional for node-based chaos like stress-cpu, pod-kill)
    pub target_node_id: Option<String>,
    /// Type of chaos
    pub chaos_type: ChaosTypeSchema,
    /// Traffic direction
    pub direction: ChaosDirectionSchema,
    /// Duration (e.g., "60s", "5m")
    pub duration: Option<String>,
    /// Chaos parameters
    pub params: ChaosParamsSchema,
    /// Kubernetes resource name
    pub k8s_name: Option<String>,
    /// Status: pending, active, paused
    #[schema(example = "active")]
    pub status: String,
    /// When chaos was activated (for countdown timer)
    pub started_at: Option<String>,
    /// Creation timestamp
    pub created_at: String,
    /// Last update timestamp
    pub updated_at: String,
}

/// Request to create a chaos condition
#[derive(Serialize, Deserialize, ToSchema)]
pub struct CreateChaosRequest {
    /// Topology ID
    pub topology_id: String,
    /// Source node ID
    #[schema(example = "server-1")]
    pub source_node_id: String,
    /// Target node ID (optional - if not set, affects all traffic from source)
    pub target_node_id: Option<String>,
    /// Type of chaos to apply
    pub chaos_type: ChaosTypeSchema,
    /// Traffic direction (must be "to" if no target specified)
    #[schema(example = "to")]
    pub direction: ChaosDirectionSchema,
    /// Duration (optional - if not set, runs until deleted)
    #[schema(example = "60s")]
    pub duration: Option<String>,
    /// Chaos parameters specific to the chaos type
    pub params: ChaosParamsSchema,
}

/// Type of chaos to apply
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ChaosTypeSchema {
    // NetworkChaos types
    /// Add network latency
    Delay,
    /// Cause packet loss
    Loss,
    /// Limit bandwidth
    Bandwidth,
    /// Corrupt packets
    Corrupt,
    /// Duplicate packets
    Duplicate,
    /// Network partition (block all traffic)
    Partition,
    // StressChaos
    /// CPU stress on target pods
    #[serde(rename = "stress-cpu")]
    StressCpu,
    // PodChaos
    /// Kill target pods
    #[serde(rename = "pod-kill")]
    PodKill,
    // IOChaos
    /// Add latency to disk I/O
    #[serde(rename = "io-delay")]
    IoDelay,
    // HTTPChaos
    /// Abort HTTP requests with error codes
    #[serde(rename = "http-abort")]
    HttpAbort,
}

/// Traffic direction for chaos
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum ChaosDirectionSchema {
    /// Outgoing traffic only
    To,
    /// Incoming traffic only
    From,
    /// Both directions (requires target)
    Both,
}

/// Parameters for chaos conditions
#[derive(Serialize, Deserialize, ToSchema)]
pub struct ChaosParamsSchema {
    // NetworkChaos params
    /// Latency to add (for delay type)
    #[schema(example = "100ms")]
    pub latency: Option<String>,
    /// Jitter for latency variation
    #[schema(example = "20ms")]
    pub jitter: Option<String>,
    /// Packet loss percentage (for loss type)
    #[schema(example = "10")]
    pub loss: Option<String>,
    /// Bandwidth rate limit (for bandwidth type)
    #[schema(example = "1mbps")]
    pub rate: Option<String>,
    /// Corruption percentage (for corrupt type)
    #[schema(example = "5")]
    pub corrupt: Option<String>,
    // StressChaos params
    /// Number of CPU workers (for stress-cpu)
    #[schema(example = 2)]
    pub workers: Option<u32>,
    /// CPU load percentage (for stress-cpu)
    #[schema(example = 80)]
    pub load: Option<u32>,
    // PodChaos params
    /// Grace period before killing pod (for pod-kill)
    #[schema(example = 0)]
    pub grace_period: Option<i64>,
    // IOChaos params
    /// I/O delay (for io-delay)
    #[schema(example = "100ms")]
    pub delay: Option<String>,
    /// Path to affect (for io-delay)
    #[schema(example = "/data")]
    pub path: Option<String>,
    /// Percentage of operations to affect
    #[schema(example = 100)]
    pub percent: Option<u32>,
    // HTTPChaos params
    /// HTTP status code to return (for http-abort)
    #[schema(example = 500)]
    pub code: Option<u16>,
    /// HTTP method to match
    #[schema(example = "GET")]
    pub method: Option<String>,
    /// HTTP port to intercept
    #[schema(example = 8080)]
    pub port: Option<u16>,
}

// --- Preset Schemas ---

/// Predefined chaos preset
#[derive(Serialize, Deserialize, ToSchema)]
pub struct ChaosPresetSchema {
    /// Unique preset ID
    #[schema(example = "preset-high-latency")]
    pub id: String,
    /// Preset name
    #[schema(example = "High Latency")]
    pub name: String,
    /// Description
    #[schema(example = "Add 200ms latency with 50ms jitter")]
    pub description: String,
    /// Category for grouping
    #[schema(example = "latency")]
    pub category: String,
    /// Icon emoji
    #[schema(example = "🐢")]
    pub icon: String,
    /// Chaos type
    pub chaos_type: String,
    /// Direction
    pub direction: String,
    /// Duration
    pub duration: Option<String>,
    /// Chaos parameters
    pub params: serde_json::Value,
    /// Whether this is a built-in preset
    pub is_builtin: bool,
}

/// Request to create a custom preset
#[derive(Serialize, Deserialize, ToSchema)]
pub struct CreatePresetRequest {
    /// Preset name
    pub name: String,
    /// Description
    pub description: String,
    /// Category
    pub category: String,
    /// Chaos type
    pub chaos_type: String,
    /// Direction
    pub direction: String,
    /// Duration
    pub duration: Option<String>,
    /// Parameters
    pub params: serde_json::Value,
}

// --- Diagnostic Schemas ---

/// Network diagnostic report
#[derive(Serialize, Deserialize, ToSchema)]
pub struct DiagnosticReportSchema {
    /// Topology ID
    pub topology_id: String,
    /// Timestamp of the diagnostic
    pub timestamp: String,
    /// Summary statistics
    pub summary: DiagnosticSummarySchema,
    /// Individual connectivity test results
    pub connectivity_tests: Vec<ConnectivityResultSchema>,
}

/// Diagnostic summary statistics
#[derive(Serialize, Deserialize, ToSchema)]
pub struct DiagnosticSummarySchema {
    /// Total number of nodes
    pub total_nodes: u32,
    /// Total tests run
    pub total_tests: u32,
    /// Tests that passed
    pub passed_tests: u32,
    /// Tests that failed
    pub failed_tests: u32,
    /// Success rate percentage
    #[schema(example = 100.0)]
    pub success_rate: f64,
}

/// Result of a connectivity test between two nodes
#[derive(Serialize, Deserialize, ToSchema)]
pub struct ConnectivityResultSchema {
    /// Source node ID
    pub from_node: String,
    /// Target node ID
    pub to_node: String,
    /// Expected connectivity: allow or deny
    #[schema(example = "allow")]
    pub expected: String,
    /// Actual connectivity: connected, blocked, unknown, error
    #[schema(example = "connected")]
    pub actual: String,
    /// Latency in milliseconds
    pub latency_ms: Option<f64>,
    /// Test status: pass, fail, warning, skipped
    #[schema(example = "pass")]
    pub status: String,
}

// --- Cluster Schemas ---

/// Kubernetes cluster status
#[derive(Serialize, Deserialize, ToSchema)]
pub struct ClusterStatusSchema {
    /// Whether connected to the cluster
    pub connected: bool,
    /// Status message
    #[schema(example = "Kubernetes cluster connected")]
    pub message: String,
}
