//! Network diagnostic API endpoints
//!
//! Provides network connectivity testing and analysis for deployed topologies

use axum::{
    extract::{Path, State},
    Json,
};
use k8s_openapi::api::core::v1::Pod;
use kube::{api::Api, Client};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tracing::{info, warn};

use crate::api::AppState;
use crate::error::{AppError, AppResult};

/// Result of a connectivity test between two nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectivityResult {
    pub from_node: String,
    pub to_node: String,
    pub expected: ConnectivityExpectation,
    pub actual: ConnectivityStatus,
    pub latency_ms: Option<f64>,
    pub status: TestStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectivityExpectation {
    Allow,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectivityStatus {
    Connected,
    Blocked,
    Unknown,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TestStatus {
    Pass,
    Fail,
    Warning,
    Skipped,
}

/// Network statistics for a node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeNetworkStats {
    pub node_id: String,
    pub node_name: String,
    pub pod_name: String,
    pub pod_ip: String,
    pub rx_bytes: Option<u64>,
    pub tx_bytes: Option<u64>,
    pub incoming_connections: u32,
    pub outgoing_connections: u32,
}

/// Full diagnostic report for a topology
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticReport {
    pub topology_id: String,
    pub timestamp: String,
    pub summary: DiagnosticSummary,
    pub connectivity_tests: Vec<ConnectivityResult>,
    pub node_stats: Vec<NodeNetworkStats>,
    pub connectivity_matrix: HashMap<String, HashMap<String, bool>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticSummary {
    pub total_nodes: u32,
    pub total_tests: u32,
    pub passed_tests: u32,
    pub failed_tests: u32,
    pub success_rate: f64,
    pub unexpected_connections: u32,
    pub missing_connections: u32,
}

/// Information about a container running in a pod
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerInfo {
    pub name: String,
    pub image: String,
    pub status: String,
    pub ready: bool,
    pub restart_count: i32,
    pub started_at: Option<String>,
    pub ports: Vec<ContainerPort>,
    pub application_name: Option<String>,
    pub application_image: Option<String>,
}

/// Container port information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerPort {
    pub container_port: i32,
    pub protocol: String,
    pub name: Option<String>,
}

/// Run network diagnostic for a deployed topology
///
/// GET /api/topologies/:id/diagnostic
#[utoipa::path(
    get,
    path = "/api/topologies/{id}/diagnostic",
    tag = "tests",
    params(
        ("id" = String, Path, description = "Topology ID")
    ),
    responses(
        (status = 200, description = "Diagnostic report", body = super::openapi::DiagnosticReportSchema),
        (status = 400, description = "No pods deployed for this topology"),
        (status = 404, description = "Topology not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn run_diagnostic(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<DiagnosticReport>> {
    info!(topology_id = %id, "Running network diagnostic");

    // Check if K8s client is available
    let k8s = state
        .k8s
        .ok_or_else(|| AppError::internal("Kubernetes client not configured"))?;

    // Get the topology from database to know expected connections
    let topology = state
        .db
        .get_topology(&id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Topology {} not found", id)))?;

    // Build expected connectivity from links
    let mut expected_connections: HashMap<String, HashSet<String>> = HashMap::new();
    for node in &topology.nodes {
        expected_connections.insert(node.id.clone(), HashSet::new());
    }
    for link in &topology.links {
        // Bidirectional - each node can reach the other
        expected_connections
            .entry(link.source.clone())
            .or_default()
            .insert(link.target.clone());
        expected_connections
            .entry(link.target.clone())
            .or_default()
            .insert(link.source.clone());
    }

    // Get deployed pods
    let client: &Client = k8s.inner();
    let pods: Api<Pod> = Api::namespaced(client.clone(), "networksim-sim");

    let pod_list = pods
        .list(&kube::api::ListParams::default().labels(&format!("networksim.io/topology={}", id)))
        .await
        .map_err(|e| AppError::internal(&format!("Failed to list pods: {}", e)))?;

    if pod_list.items.is_empty() {
        return Err(AppError::bad_request("No pods deployed for this topology"));
    }

    // Build pod info map
    let mut pod_info: HashMap<String, (String, String)> = HashMap::new(); // node_id -> (pod_name, pod_ip)
    let mut node_names: HashMap<String, String> = HashMap::new(); // node_id -> node_name

    for pod in &pod_list.items {
        let node_id = pod
            .metadata
            .labels
            .as_ref()
            .and_then(|l| l.get("networksim.io/node"))
            .cloned()
            .unwrap_or_default();

        let pod_name = pod.metadata.name.clone().unwrap_or_default();
        let pod_ip = pod
            .status
            .as_ref()
            .and_then(|s| s.pod_ip.clone())
            .unwrap_or_default();

        let node_name = pod
            .metadata
            .annotations
            .as_ref()
            .and_then(|a| a.get("networksim.io/node-name"))
            .cloned()
            .unwrap_or_else(|| node_id.clone());

        if !node_id.is_empty() && !pod_ip.is_empty() {
            pod_info.insert(node_id.clone(), (pod_name, pod_ip));
            node_names.insert(node_id.clone(), node_name);
        }
    }

    // Run connectivity tests
    let mut connectivity_tests = Vec::new();
    let mut connectivity_matrix: HashMap<String, HashMap<String, bool>> = HashMap::new();

    let node_ids: Vec<String> = pod_info.keys().cloned().collect();

    for from_node in &node_ids {
        let (from_pod, _from_ip) = match pod_info.get(from_node) {
            Some(info) => info,
            None => continue,
        };

        connectivity_matrix.insert(from_node.clone(), HashMap::new());

        for to_node in &node_ids {
            if from_node == to_node {
                continue;
            }

            let (_to_pod, to_ip) = match pod_info.get(to_node) {
                Some(info) => info,
                None => continue,
            };

            // Determine expected connectivity
            let should_connect = expected_connections
                .get(from_node)
                .map(|s| s.contains(to_node))
                .unwrap_or(false);

            let expected = if should_connect {
                ConnectivityExpectation::Allow
            } else {
                ConnectivityExpectation::Deny
            };

            // Test actual connectivity using kubectl exec
            let (actual, latency) = test_pod_connectivity(client, from_pod, to_ip).await;

            // Determine test status
            let status = match (&expected, &actual) {
                (ConnectivityExpectation::Allow, ConnectivityStatus::Connected) => TestStatus::Pass,
                (ConnectivityExpectation::Deny, ConnectivityStatus::Blocked) => TestStatus::Pass,
                (ConnectivityExpectation::Allow, ConnectivityStatus::Blocked) => TestStatus::Fail,
                (ConnectivityExpectation::Deny, ConnectivityStatus::Connected) => {
                    TestStatus::Warning
                }
                _ => TestStatus::Skipped,
            };

            // Update matrix
            connectivity_matrix
                .get_mut(from_node)
                .unwrap()
                .insert(to_node.clone(), actual == ConnectivityStatus::Connected);

            connectivity_tests.push(ConnectivityResult {
                from_node: from_node.clone(),
                to_node: to_node.clone(),
                expected,
                actual,
                latency_ms: latency,
                status,
            });
        }
    }

    // Calculate summary
    let total_tests = connectivity_tests.len() as u32;
    let passed_tests = connectivity_tests
        .iter()
        .filter(|t| t.status == TestStatus::Pass)
        .count() as u32;
    let failed_tests = connectivity_tests
        .iter()
        .filter(|t| t.status == TestStatus::Fail)
        .count() as u32;
    let unexpected_connections = connectivity_tests
        .iter()
        .filter(|t| t.status == TestStatus::Warning)
        .count() as u32;
    let missing_connections = connectivity_tests
        .iter()
        .filter(|t| t.status == TestStatus::Fail && t.expected == ConnectivityExpectation::Allow)
        .count() as u32;

    let success_rate = if total_tests > 0 {
        (passed_tests as f64 / total_tests as f64) * 100.0
    } else {
        100.0
    };

    // Build node stats
    let node_stats: Vec<NodeNetworkStats> = pod_info
        .iter()
        .map(|(node_id, (pod_name, pod_ip))| {
            let incoming = connectivity_tests
                .iter()
                .filter(|t| &t.to_node == node_id && t.actual == ConnectivityStatus::Connected)
                .count() as u32;
            let outgoing = connectivity_tests
                .iter()
                .filter(|t| &t.from_node == node_id && t.actual == ConnectivityStatus::Connected)
                .count() as u32;

            NodeNetworkStats {
                node_id: node_id.clone(),
                node_name: node_names.get(node_id).cloned().unwrap_or_default(),
                pod_name: pod_name.clone(),
                pod_ip: pod_ip.clone(),
                rx_bytes: None, // Could be populated with exec call
                tx_bytes: None,
                incoming_connections: incoming,
                outgoing_connections: outgoing,
            }
        })
        .collect();

    let report = DiagnosticReport {
        topology_id: id.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        summary: DiagnosticSummary {
            total_nodes: pod_info.len() as u32,
            total_tests,
            passed_tests,
            failed_tests,
            success_rate,
            unexpected_connections,
            missing_connections,
        },
        connectivity_tests,
        node_stats,
        connectivity_matrix,
    };

    info!(
        topology_id = %id,
        passed = passed_tests,
        failed = failed_tests,
        "Diagnostic complete"
    );

    Ok(Json(report))
}

/// Test connectivity from one pod to another using kubectl exec equivalent
async fn test_pod_connectivity(
    client: &Client,
    from_pod: &str,
    to_ip: &str,
) -> (ConnectivityStatus, Option<f64>) {
    use k8s_openapi::api::core::v1::Pod;
    use kube::api::{Api, AttachParams};
    use tokio::io::AsyncReadExt;

    let pods: Api<Pod> = Api::namespaced(client.clone(), "networksim-sim");

    // Try to exec into the pod and test connectivity
    let ap = AttachParams {
        stdin: false,
        stdout: true,
        stderr: true,
        tty: false,
        ..Default::default()
    };

    // Simple ping test command
    let command = vec![
        "sh".to_string(),
        "-c".to_string(),
        format!(
            "ping -c 1 -W 2 {} >/dev/null 2>&1 && echo 'OK' || echo 'FAIL'",
            to_ip
        ),
    ];

    match pods.exec(from_pod, command, &ap).await {
        Ok(mut attached) => {
            // Read all stdout with timeout
            let mut stdout_str = String::new();
            if let Some(mut stdout) = attached.stdout() {
                let mut buf = Vec::new();
                // Read with timeout
                let read_result = tokio::time::timeout(
                    std::time::Duration::from_secs(5),
                    stdout.read_to_end(&mut buf)
                ).await;

                if let Ok(Ok(_)) = read_result {
                    stdout_str = String::from_utf8_lossy(&buf).to_string();
                }
            }

            // Also try stderr if stdout is empty
            if stdout_str.is_empty() {
                if let Some(mut stderr) = attached.stderr() {
                    let mut buf = Vec::new();
                    let _ = tokio::time::timeout(
                        std::time::Duration::from_secs(2),
                        stderr.read_to_end(&mut buf)
                    ).await;
                    let stderr_str = String::from_utf8_lossy(&buf).to_string();
                    if stderr_str.contains("OK") {
                        stdout_str = stderr_str;
                    }
                }
            }

            // Wait for the process to complete
            let _ = attached.join().await;

            if stdout_str.contains("OK") {
                (ConnectivityStatus::Connected, Some(1.0))
            } else {
                (ConnectivityStatus::Blocked, None)
            }
        }
        Err(e) => {
            warn!(error = %e, "Failed to exec into pod for connectivity test");
            (ConnectivityStatus::Error, None)
        }
    }
}

/// Get container information for a specific node/pod
///
/// GET /api/topologies/:topology_id/nodes/:node_id/containers
pub async fn get_node_containers(
    State(state): State<AppState>,
    Path((topology_id, node_id)): Path<(String, String)>,
) -> AppResult<Json<Vec<ContainerInfo>>> {
    info!(topology_id = %topology_id, node_id = %node_id, "Getting container info for node");

    let k8s = state
        .k8s
        .ok_or_else(|| AppError::internal("Kubernetes client not configured"))?;

    let client: &Client = k8s.inner();
    let pods: Api<Pod> = Api::namespaced(client.clone(), "networksim-sim");

    // Find the pod for this node
    let pod_name = format!(
        "ns-{}-{}",
        &topology_id[..8.min(topology_id.len())],
        node_id
    )
    .to_lowercase();

    let pod = pods
        .get(&pod_name)
        .await
        .map_err(|e| AppError::internal(&format!("Failed to get pod {}: {}", &pod_name, e)))?;

    // Get applications for this node to show their containers too
    let applications = state.db.list_applications_by_node(&node_id).await
        .unwrap_or_default();

    let mut containers = Vec::new();

    // First, add containers from the node pod
    if let Some(status) = &pod.status {
        if let Some(container_statuses) = &status.container_statuses {
            for container_status in container_statuses {
                let ready = container_status.ready;
                let restart_count = container_status.restart_count;
                let started_at = container_status
                    .state
                    .as_ref()
                    .and_then(|state| state.running.as_ref())
                    .and_then(|running| running.started_at.as_ref())
                    .map(|time| time.0.to_string());

                // Determine status
                let status = if ready {
                    "Running"
                } else if let Some(state) = &container_status.state {
                    if state.waiting.is_some() {
                        "Waiting"
                    } else if state.terminated.is_some() {
                        "Terminated"
                    } else {
                        "Unknown"
                    }
                } else {
                    "Unknown"
                };

                // Get ports from spec
                let ports = if let Some(spec) = &pod.spec {
                    spec.containers
                        .iter()
                        .find(|c| c.name == container_status.name)
                        .and_then(|c| c.ports.as_ref())
                        .map(|ports| {
                            ports
                                .iter()
                                .map(|p| ContainerPort {
                                    container_port: p.container_port,
                                    protocol: p.protocol.clone().unwrap_or_else(|| "TCP".to_string()),
                                    name: p.name.clone(),
                                })
                                .collect()
                        })
                        .unwrap_or_default()
                } else {
                    Vec::new()
                };

                containers.push(ContainerInfo {
                    name: container_status.name.clone(),
                    image: container_status.image.clone(),
                    status: status.to_string(),
                    ready,
                    restart_count,
                    started_at,
                    ports,
                    application_name: Some("Node Base".to_string()),
                    application_image: Some("alpine".to_string()),
                });
            }
        }
    }

    // Then, add containers from applications deployed to this node
    for app in &applications {
        // Find pods created by this application
        let label_selector = format!("app.kubernetes.io/instance={}", app.release_name);
        let app_pods: Vec<k8s_openapi::api::core::v1::Pod> = pods
            .list(&kube::api::ListParams::default().labels(&label_selector))
            .await
            .map(|list| list.items)
            .unwrap_or_default();

        for app_pod in app_pods {
            if let Some(status) = &app_pod.status {
                if let Some(container_statuses) = &status.container_statuses {
                    for container_status in container_statuses {
                        let ready = container_status.ready;
                        let restart_count = container_status.restart_count;
                        let started_at = container_status
                            .state
                            .as_ref()
                            .and_then(|state| state.running.as_ref())
                            .and_then(|running| running.started_at.as_ref())
                            .map(|time| time.0.to_string());

                        // Determine status
                        let status = if ready {
                            "Running"
                        } else if let Some(state) = &container_status.state {
                            if state.waiting.is_some() {
                                "Waiting"
                            } else if state.terminated.is_some() {
                                "Terminated"
                            } else {
                                "Unknown"
                            }
                        } else {
                            "Unknown"
                        };

                        // Get ports from spec
                        let ports = if let Some(spec) = &app_pod.spec {
                            spec.containers
                                .iter()
                                .find(|c| c.name == container_status.name)
                                .and_then(|c| c.ports.as_ref())
                                .map(|ports| {
                                    ports
                                        .iter()
                                        .map(|p| ContainerPort {
                                        container_port: p.container_port,
                                        protocol: p.protocol.clone().unwrap_or_else(|| "TCP".to_string()),
                                        name: p.name.clone(),
                                    })
                                    .collect()
                                })
                                .unwrap_or_default()
                        } else {
                            Vec::new()
                        };

                        containers.push(ContainerInfo {
                            name: container_status.name.clone(),
                            image: container_status.image.clone(),
                            status: status.to_string(),
                            ready,
                            restart_count,
                            started_at,
                            ports,
                               application_name: Some(app.image_name.clone()),
                            application_image: Some(app.image_name.clone()),
                        });
                    }
                }
            }
        }
    }

    Ok(Json(containers))
}

// ============================================================================
// App-to-App Tests
// ============================================================================

/// Request for app-to-app connectivity test
#[derive(Debug, Deserialize)]
pub struct AppToAppTestRequest {
    /// Source application ID
    pub from_app_id: String,
    /// Target application ID
    pub to_app_id: String,
    /// Test type: "http", "tcp", or "ping"
    #[serde(default = "default_test_type")]
    pub test_type: String,
    /// Target port for TCP/HTTP tests (optional)
    pub port: Option<u16>,
    /// HTTP path for HTTP tests (default: "/")
    pub path: Option<String>,
    /// Timeout in seconds (default: 5)
    #[serde(default = "default_timeout")]
    pub timeout_secs: u32,
}

fn default_test_type() -> String {
    "ping".to_string()
}

fn default_timeout() -> u32 {
    5
}

/// Result of an app-to-app test
#[derive(Debug, Serialize)]
pub struct AppToAppTestResult {
    pub from_app: AppTestInfo,
    pub to_app: AppTestInfo,
    pub test_type: String,
    pub success: bool,
    pub latency_ms: Option<f64>,
    pub status_code: Option<u16>,
    pub error: Option<String>,
    pub chaos_affecting: Vec<ChaosAffectingResult>,
}

/// App information in test result
#[derive(Debug, Serialize)]
pub struct AppTestInfo {
    pub app_id: String,
    pub app_name: String,
    pub node_id: String,
    pub node_name: String,
    pub pod_ip: Option<String>,
}

/// Chaos condition affecting this test
#[derive(Debug, Serialize)]
pub struct ChaosAffectingResult {
    pub condition_id: String,
    pub chaos_type: String,
    pub status: String,
    pub impact: String, // "outbound" or "inbound"
}

/// Run an app-to-app connectivity test
///
/// POST /api/v1/topologies/:id/tests/app-to-app
#[utoipa::path(
    post,
    path = "/api/v1/topologies/{id}/tests/app-to-app",
    tag = "tests",
    params(
        ("id" = String, Path, description = "Topology ID")
    ),
    responses(
        (status = 200, description = "Test result"),
        (status = 400, description = "Invalid test parameters"),
        (status = 404, description = "Application not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn run_app_to_app_test(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
    Json(request): Json<AppToAppTestRequest>,
) -> AppResult<Json<AppToAppTestResult>> {
    info!(
        "Running app-to-app test: {} -> {} ({})",
        request.from_app_id, request.to_app_id, request.test_type
    );

    // Get K8s client
    let k8s = state
        .k8s
        .as_ref()
        .ok_or_else(|| AppError::internal("Kubernetes client not configured"))?;

    // Get topology for node names
    let topology = state
        .db
        .get_topology(&topology_id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Topology {} not found", topology_id)))?;

    let node_names: HashMap<String, String> = topology
        .nodes
        .iter()
        .map(|n| (n.id.clone(), n.name.clone()))
        .collect();

    // Get source and target applications
    let from_app = state
        .db
        .get_application(&request.from_app_id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Source app {} not found", request.from_app_id)))?;

    let to_app = state
        .db
        .get_application(&request.to_app_id)
        .await?
        .ok_or_else(|| AppError::not_found(&format!("Target app {} not found", request.to_app_id)))?;

    // Verify apps belong to the topology
    if from_app.topology_id.to_string() != topology_id || to_app.topology_id.to_string() != topology_id {
        return Err(AppError::bad_request("Apps must belong to the specified topology"));
    }

    // Get pod info for both apps
    let client: &Client = k8s.inner();
    let pods: Api<Pod> = Api::namespaced(client.clone(), "networksim-sim");

    // Get source app pod
    let from_node_id = from_app.node_selector.first()
        .ok_or_else(|| AppError::bad_request("Source app has no node selector"))?;
    let from_deployment = crate::k8s::resources::make_deployment_name(&from_app.id.simple().to_string(), from_node_id);

    let from_pod = get_pod_for_deployment(&pods, &from_deployment).await?;
    let from_pod_ip = from_pod.status.as_ref()
        .and_then(|s| s.pod_ip.clone());

    // Get target app pod
    let to_node_id = to_app.node_selector.first()
        .ok_or_else(|| AppError::bad_request("Target app has no node selector"))?;
    let to_deployment = crate::k8s::resources::make_deployment_name(&to_app.id.simple().to_string(), to_node_id);

    let to_pod = get_pod_for_deployment(&pods, &to_deployment).await?;
    let to_pod_ip = to_pod.status.as_ref()
        .and_then(|s| s.pod_ip.clone())
        .ok_or_else(|| AppError::internal("Target pod has no IP"))?;

    // Get chaos conditions affecting this test
    let chaos_conditions = state.db.list_chaos_conditions(&topology_id).await?;
    let mut chaos_affecting = Vec::new();

    for cond in &chaos_conditions {
        // Check if source node is affected (outbound)
        if cond.source_node_id == *from_node_id {
            let affects_target = cond.target_node_id.as_ref()
                .map(|t| t == to_node_id)
                .unwrap_or(true); // No target means all traffic affected
            if affects_target {
                chaos_affecting.push(ChaosAffectingResult {
                    condition_id: cond.id.clone(),
                    chaos_type: format!("{:?}", cond.chaos_type).to_lowercase(),
                    status: format!("{:?}", cond.status).to_lowercase(),
                    impact: "outbound".to_string(),
                });
            }
        }
        // Check if target node is affected (inbound to target)
        if cond.source_node_id == *to_node_id {
            let affects_source = cond.target_node_id.as_ref()
                .map(|t| t == from_node_id)
                .unwrap_or(true);
            if affects_source {
                chaos_affecting.push(ChaosAffectingResult {
                    condition_id: cond.id.clone(),
                    chaos_type: format!("{:?}", cond.chaos_type).to_lowercase(),
                    status: format!("{:?}", cond.status).to_lowercase(),
                    impact: "inbound".to_string(),
                });
            }
        }
    }

    // Run the test
    let from_pod_name = from_pod.metadata.name.clone().unwrap_or_default();
    let (success, latency_ms, status_code, error) = match request.test_type.as_str() {
        "http" => {
            let port = request.port.unwrap_or(80);
            let path = request.path.as_deref().unwrap_or("/");
            run_http_test(client, &from_pod_name, &to_pod_ip, port, path, request.timeout_secs).await
        }
        "tcp" => {
            let port = request.port.ok_or_else(|| AppError::bad_request("Port required for TCP test"))?;
            run_tcp_test(client, &from_pod_name, &to_pod_ip, port, request.timeout_secs).await
        }
        "ping" | _ => {
            run_ping_test(client, &from_pod_name, &to_pod_ip, request.timeout_secs).await
        }
    };

    Ok(Json(AppToAppTestResult {
        from_app: AppTestInfo {
            app_id: from_app.id.to_string(),
            app_name: from_app.image_name.clone(),
            node_id: from_node_id.clone(),
            node_name: node_names.get(from_node_id).cloned().unwrap_or_default(),
            pod_ip: from_pod_ip,
        },
        to_app: AppTestInfo {
            app_id: to_app.id.to_string(),
            app_name: to_app.image_name.clone(),
            node_id: to_node_id.clone(),
            node_name: node_names.get(to_node_id).cloned().unwrap_or_default(),
            pod_ip: Some(to_pod_ip),
        },
        test_type: request.test_type,
        success,
        latency_ms,
        status_code,
        error,
        chaos_affecting,
    }))
}

/// Get a pod from a deployment
async fn get_pod_for_deployment(pods: &Api<Pod>, deployment_name: &str) -> Result<Pod, AppError> {
    let label_selector = format!("app.kubernetes.io/instance={}", deployment_name);
    let pod_list = pods
        .list(&kube::api::ListParams::default().labels(&label_selector))
        .await
        .map_err(|e| AppError::internal(&format!("Failed to list pods: {}", e)))?;

    pod_list.items.into_iter().next()
        .ok_or_else(|| AppError::not_found(&format!("No pod found for deployment {}", deployment_name)))
}

/// Run HTTP connectivity test
async fn run_http_test(
    client: &Client,
    from_pod: &str,
    to_ip: &str,
    port: u16,
    path: &str,
    timeout_secs: u32,
) -> (bool, Option<f64>, Option<u16>, Option<String>) {
    use kube::api::{Api, AttachParams};
    use tokio::io::AsyncReadExt;

    let pods: Api<Pod> = Api::namespaced(client.clone(), "networksim-sim");
    let ap = AttachParams {
        stdin: false,
        stdout: true,
        stderr: true,
        tty: false,
        ..Default::default()
    };

    // Use wget to test HTTP (more commonly available than curl in minimal containers)
    let command = vec![
        "sh".to_string(),
        "-c".to_string(),
        format!(
            "start=$(date +%s%N); wget -q -O /dev/null -T {} --spider http://{}:{}{} 2>&1 && echo \"OK $(( ($(date +%s%N) - $start) / 1000000 ))\" || echo \"FAIL\"",
            timeout_secs, to_ip, port, path
        ),
    ];

    match pods.exec(from_pod, command, &ap).await {
        Ok(mut attached) => {
            let mut stdout_str = String::new();
            if let Some(mut stdout) = attached.stdout() {
                let mut buf = Vec::new();
                let _ = tokio::time::timeout(
                    std::time::Duration::from_secs(timeout_secs as u64 + 2),
                    stdout.read_to_end(&mut buf)
                ).await;
                stdout_str = String::from_utf8_lossy(&buf).to_string();
            }
            let _ = attached.join().await;

            if stdout_str.contains("OK") {
                let latency = stdout_str.split_whitespace()
                    .last()
                    .and_then(|s| s.parse::<f64>().ok());
                (true, latency, Some(200), None)
            } else {
                (false, None, None, Some("HTTP request failed".to_string()))
            }
        }
        Err(e) => (false, None, None, Some(format!("Exec failed: {}", e))),
    }
}

/// Run TCP connectivity test
async fn run_tcp_test(
    client: &Client,
    from_pod: &str,
    to_ip: &str,
    port: u16,
    timeout_secs: u32,
) -> (bool, Option<f64>, Option<u16>, Option<String>) {
    use kube::api::{Api, AttachParams};
    use tokio::io::AsyncReadExt;

    let pods: Api<Pod> = Api::namespaced(client.clone(), "networksim-sim");
    let ap = AttachParams {
        stdin: false,
        stdout: true,
        stderr: true,
        tty: false,
        ..Default::default()
    };

    // Use nc (netcat) to test TCP connection
    let command = vec![
        "sh".to_string(),
        "-c".to_string(),
        format!(
            "start=$(date +%s%N); nc -z -w {} {} {} && echo \"OK $(( ($(date +%s%N) - $start) / 1000000 ))\" || echo \"FAIL\"",
            timeout_secs, to_ip, port
        ),
    ];

    match pods.exec(from_pod, command, &ap).await {
        Ok(mut attached) => {
            let mut stdout_str = String::new();
            if let Some(mut stdout) = attached.stdout() {
                let mut buf = Vec::new();
                let _ = tokio::time::timeout(
                    std::time::Duration::from_secs(timeout_secs as u64 + 2),
                    stdout.read_to_end(&mut buf)
                ).await;
                stdout_str = String::from_utf8_lossy(&buf).to_string();
            }
            let _ = attached.join().await;

            if stdout_str.contains("OK") {
                let latency = stdout_str.split_whitespace()
                    .last()
                    .and_then(|s| s.parse::<f64>().ok());
                (true, latency, None, None)
            } else {
                (false, None, None, Some(format!("TCP connection to port {} failed", port)))
            }
        }
        Err(e) => (false, None, None, Some(format!("Exec failed: {}", e))),
    }
}

/// Run ping connectivity test
async fn run_ping_test(
    client: &Client,
    from_pod: &str,
    to_ip: &str,
    timeout_secs: u32,
) -> (bool, Option<f64>, Option<u16>, Option<String>) {
    use kube::api::{Api, AttachParams};
    use tokio::io::AsyncReadExt;

    let pods: Api<Pod> = Api::namespaced(client.clone(), "networksim-sim");
    let ap = AttachParams {
        stdin: false,
        stdout: true,
        stderr: true,
        tty: false,
        ..Default::default()
    };

    let command = vec![
        "sh".to_string(),
        "-c".to_string(),
        format!(
            "ping -c 3 -W {} {} 2>&1 | sed -n 's/.*time=\\([0-9.]*\\).*/\\1/p' | awk '{{sum+=$1; count++}} END {{if(count>0) print \"OK \" sum/count; else print \"FAIL\"}}'",
            timeout_secs, to_ip
        ),
    ];

    match pods.exec(from_pod, command, &ap).await {
        Ok(mut attached) => {
            let mut stdout_str = String::new();
            if let Some(mut stdout) = attached.stdout() {
                let mut buf = Vec::new();
                let _ = tokio::time::timeout(
                    std::time::Duration::from_secs(timeout_secs as u64 + 5),
                    stdout.read_to_end(&mut buf)
                ).await;
                stdout_str = String::from_utf8_lossy(&buf).to_string();
            }
            let _ = attached.join().await;

            if stdout_str.contains("OK") {
                let latency = stdout_str.split_whitespace()
                    .last()
                    .and_then(|s| s.parse::<f64>().ok());
                (true, latency, None, None)
            } else {
                (false, None, None, Some("Ping failed".to_string()))
            }
        }
        Err(e) => (false, None, None, Some(format!("Exec failed: {}", e))),
    }
}
