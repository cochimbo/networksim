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
        // Applications
        crate::api::applications::deploy,
        crate::api::applications::list_by_node,
        crate::api::applications::get,
        crate::api::applications::uninstall,
        crate::api::applications::logs,
        // Cluster
        crate::api::health::cluster_status,
        crate::api::health::health_check,
        // Live Metrics
        crate::api::live_metrics::get_live_metrics,
        crate::api::live_metrics::get_metrics_history,
        crate::api::live_metrics::get_aggregated_metrics,
        crate::api::live_metrics::get_metrics_by_app,
        // New v1 endpoints
        crate::api::chaos::affected_apps,
        // Events
        crate::api::events::list_events,
        crate::api::events::create_event,
        crate::api::events::event_stats,
        crate::api::events::list_topology_events,
        // Scenarios
        crate::api::scenarios::list_scenarios,
        crate::api::scenarios::create_scenario,
        crate::api::scenarios::get_scenario,
        crate::api::scenarios::update_scenario,
        crate::api::scenarios::delete_scenario,
        crate::api::scenarios::run_scenario,
    ),
    components(
        schemas(
            // Application schemas
            crate::models::Application,
            crate::models::AppStatus,
            crate::helm::types::DeployAppRequest,
            // Event schemas
            crate::api::events::Event,
            crate::api::events::CreateEventRequest,
            crate::api::events::EventsResponse,
            crate::api::events::EventSeverity,
            crate::api::events::EventSourceType,
            // Topology schemas
            crate::models::Topology,
            crate::models::Node,
            crate::models::Link,
            crate::models::Position,
            crate::models::NodeConfig,
            crate::models::EnvVar,
            crate::models::LinkProperties,
            crate::models::CreateTopologyRequest,
            crate::models::UpdateTopologyRequest,
            // Deployment schemas
            crate::api::deploy::DeploymentResponse,
            crate::api::deploy::NodeStatusResponse,
            // Chaos schemas
            crate::chaos::ChaosCondition,
            crate::chaos::UpdateChaosRequest,
            crate::chaos::ChaosConditionStatus,
            crate::chaos::CreateChaosRequest,
            crate::chaos::ChaosType,
            crate::chaos::ChaosDirection,
            crate::chaos::ChaosParams,
            crate::chaos::DelayParams,
            crate::chaos::LossParams,
            crate::chaos::BandwidthParams,
            crate::chaos::CorruptParams,
            crate::chaos::DuplicateParams,
            crate::chaos::StressCpuParams,
            crate::chaos::PodKillParams,
            crate::chaos::IoDelayParams,
            crate::chaos::HttpAbortParams,
            // Preset schemas
            ChaosPresetSchema,
            crate::api::presets::CreatePresetRequest,
            crate::api::presets::ApplyPresetRequest,
            // Diagnostic schemas
            crate::api::diagnostic::AppToAppTestRequest,
            DiagnosticReportSchema,
            DiagnosticSummarySchema,
            ConnectivityResultSchema,
            // Cluster schemas
            crate::api::health::ClusterStatusResponse,
            crate::api::health::HealthResponse,
            // Metrics schemas
            crate::api::live_metrics::LiveMetricsSnapshot,
            crate::api::live_metrics::NetworkMetric,
            crate::api::live_metrics::NodeMetric,
            crate::api::live_metrics::MetricsSummary,
            crate::api::live_metrics::AggregatedMetrics,
            crate::api::live_metrics::MetricDataPoint,
            crate::api::live_metrics::MetricsByAppResponse,
            crate::api::live_metrics::AppMetrics,
            // Common
            ErrorResponse,
            // Scenarios
            crate::models::scenarios::Scenario,
            crate::models::scenarios::ScenarioStep,
            crate::models::scenarios::CreateScenarioRequest,
            crate::models::scenarios::UpdateScenarioRequest,
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

// --- Deployment Schemas ---

// --- Chaos Schemas ---

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
