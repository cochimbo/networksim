//! Test Runner API - Execute and manage test runs
//!
//! Provides endpoints for running various tests and viewing results.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;
use uuid::Uuid;

use crate::api::events::{emit_event, EventSeverity, EventSourceType};
use crate::api::AppState;
use crate::error::{AppError, AppResult};

/// Test run status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TestStatus {
    Pending,
    Running,
    Passed,
    Failed,
    Cancelled,
}

impl std::fmt::Display for TestStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TestStatus::Pending => write!(f, "pending"),
            TestStatus::Running => write!(f, "running"),
            TestStatus::Passed => write!(f, "passed"),
            TestStatus::Failed => write!(f, "failed"),
            TestStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

/// Test types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TestType {
    Diagnostic,       // Network connectivity test
    ChaosValidation,  // Verify chaos conditions are working
    Smoke,            // Basic health checks
    Custom,           // User-defined tests
}

impl std::fmt::Display for TestType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TestType::Diagnostic => write!(f, "diagnostic"),
            TestType::ChaosValidation => write!(f, "chaos_validation"),
            TestType::Smoke => write!(f, "smoke"),
            TestType::Custom => write!(f, "custom"),
        }
    }
}

/// Test run record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRun {
    pub id: String,
    pub topology_id: String,
    pub test_type: String,
    pub status: String,
    pub total_tests: i32,
    pub passed_tests: i32,
    pub failed_tests: i32,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub duration_ms: Option<i64>,
    pub results: Option<serde_json::Value>,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct TestRunRow {
    id: String,
    topology_id: String,
    test_type: String,
    status: String,
    total_tests: Option<i32>,
    passed_tests: Option<i32>,
    failed_tests: Option<i32>,
    started_at: Option<String>,
    completed_at: Option<String>,
    duration_ms: Option<i64>,
    results: Option<String>,
    error_message: Option<String>,
    created_at: String,
}

/// Start test request
#[derive(Debug, Deserialize)]
pub struct StartTestRequest {
    pub test_type: String,
    pub options: Option<serde_json::Value>,
}

/// Query parameters for listing test runs
#[derive(Debug, Deserialize)]
pub struct ListTestsQuery {
    pub status: Option<String>,
    pub test_type: Option<String>,
    pub limit: Option<i64>,
}

/// List test runs for a topology
///
/// GET /api/topologies/:id/tests
pub async fn list_tests(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
    Query(query): Query<ListTestsQuery>,
) -> AppResult<Json<Vec<TestRun>>> {
    let limit = query.limit.unwrap_or(50).min(200);

    let mut sql = String::from(
        "SELECT id, topology_id, test_type, status, total_tests, passed_tests, failed_tests, started_at, completed_at, duration_ms, results, error_message, created_at FROM test_runs WHERE topology_id = ?"
    );

    if let Some(ref status) = query.status {
        sql.push_str(&format!(" AND status = '{}'", status));
    }
    if let Some(ref test_type) = query.test_type {
        sql.push_str(&format!(" AND test_type = '{}'", test_type));
    }

    sql.push_str(&format!(" ORDER BY created_at DESC LIMIT {}", limit));

    let rows: Vec<TestRunRow> = sqlx::query_as(&sql)
        .bind(&topology_id)
        .fetch_all(state.db.pool())
        .await
        .map_err(|e| AppError::internal(&format!("Failed to list test runs: {}", e)))?;

    let runs: Vec<TestRun> = rows.into_iter().map(row_to_test_run).collect();

    Ok(Json(runs))
}

/// Get a specific test run
///
/// GET /api/topologies/:topology_id/tests/:test_id
pub async fn get_test(
    State(state): State<AppState>,
    Path((topology_id, test_id)): Path<(String, String)>,
) -> AppResult<Json<TestRun>> {
    let row: TestRunRow = sqlx::query_as(
        "SELECT id, topology_id, test_type, status, total_tests, passed_tests, failed_tests, started_at, completed_at, duration_ms, results, error_message, created_at FROM test_runs WHERE id = ? AND topology_id = ?"
    )
    .bind(&test_id)
    .bind(&topology_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to get test run: {}", e)))?
    .ok_or_else(|| AppError::not_found(&format!("Test run {} not found", test_id)))?;

    Ok(Json(row_to_test_run(row)))
}

/// Start a new test run
///
/// POST /api/topologies/:id/tests
pub async fn start_test(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
    Json(request): Json<StartTestRequest>,
) -> AppResult<Json<TestRun>> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

    info!(
        topology_id = %topology_id,
        test_type = %request.test_type,
        test_id = %id,
        "Starting test run"
    );

    // Create test run record
    sqlx::query(
        r#"
        INSERT INTO test_runs (id, topology_id, test_type, status, started_at, created_at)
        VALUES (?, ?, ?, 'running', ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&topology_id)
    .bind(&request.test_type)
    .bind(now.to_rfc3339())
    .bind(now.to_rfc3339())
    .execute(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to create test run: {}", e)))?;

    // Emit event
    emit_event(
        &state,
        Some(&topology_id),
        "test",
        Some("started"),
        EventSeverity::Info,
        &format!("Test '{}' started", request.test_type),
        None,
        Some(EventSourceType::Test),
        Some(&id),
        Some(serde_json::json!({"test_type": request.test_type})),
    )
    .await;

    // Spawn background task to run the test
    let state_clone = state.clone();
    let topology_id_clone = topology_id.clone();
    let test_id_clone = id.clone();
    let test_type = request.test_type.clone();

    tokio::spawn(async move {
        run_test_async(&state_clone, &topology_id_clone, &test_id_clone, &test_type).await;
    });

    let run = TestRun {
        id,
        topology_id,
        test_type: request.test_type,
        status: "running".to_string(),
        total_tests: 0,
        passed_tests: 0,
        failed_tests: 0,
        started_at: Some(now),
        completed_at: None,
        duration_ms: None,
        results: None,
        error_message: None,
        created_at: now,
    };

    // Broadcast via WebSocket
    let _ = state.event_tx.send(super::Event::TestStarted {
        id: run.id.clone(),
        test_type: run.test_type.clone(),
    });

    Ok(Json(run))
}

/// Cancel a running test
///
/// POST /api/topologies/:topology_id/tests/:test_id/cancel
pub async fn cancel_test(
    State(state): State<AppState>,
    Path((topology_id, test_id)): Path<(String, String)>,
) -> AppResult<Json<TestRun>> {
    let now = Utc::now();

    // Update status to cancelled
    sqlx::query(
        "UPDATE test_runs SET status = 'cancelled', completed_at = ? WHERE id = ? AND topology_id = ? AND status = 'running'"
    )
    .bind(now.to_rfc3339())
    .bind(&test_id)
    .bind(&topology_id)
    .execute(state.db.pool())
    .await
    .map_err(|e| AppError::internal(&format!("Failed to cancel test: {}", e)))?;

    // Get updated record
    get_test(State(state), Path((topology_id, test_id))).await
}

/// Run test in background
async fn run_test_async(state: &AppState, topology_id: &str, test_id: &str, test_type: &str) {
    let start_time = std::time::Instant::now();
    let mut results = serde_json::json!({});
    let mut total_tests = 0;
    let mut passed_tests = 0;
    let mut failed_tests = 0;
    let mut error_message: Option<String> = None;

    let status = match test_type {
        "diagnostic" => {
            // Run diagnostic test
            match run_diagnostic_test(state, topology_id).await {
                Ok(report) => {
                    total_tests = report.summary.total_tests as i32;
                    passed_tests = report.summary.passed_tests as i32;
                    failed_tests = report.summary.failed_tests as i32;
                    results = serde_json::to_value(&report).unwrap_or_default();
                    if failed_tests > 0 {
                        "failed"
                    } else {
                        "passed"
                    }
                }
                Err(e) => {
                    error_message = Some(e.to_string());
                    "failed"
                }
            }
        }
        "smoke" => {
            // Run smoke tests
            match run_smoke_test(state, topology_id).await {
                Ok(report) => {
                    total_tests = report.total;
                    passed_tests = report.passed;
                    failed_tests = report.failed;
                    results = serde_json::to_value(&report).unwrap_or_default();
                    if failed_tests > 0 {
                        "failed"
                    } else {
                        "passed"
                    }
                }
                Err(e) => {
                    error_message = Some(e.to_string());
                    "failed"
                }
            }
        }
        "chaos_validation" => {
            // Run chaos validation
            match run_chaos_validation_test(state, topology_id).await {
                Ok(report) => {
                    total_tests = report.total;
                    passed_tests = report.passed;
                    failed_tests = report.failed;
                    results = serde_json::to_value(&report).unwrap_or_default();
                    if failed_tests > 0 {
                        "failed"
                    } else {
                        "passed"
                    }
                }
                Err(e) => {
                    error_message = Some(e.to_string());
                    "failed"
                }
            }
        }
        _ => {
            error_message = Some(format!("Unknown test type: {}", test_type));
            "failed"
        }
    };

    let duration_ms = start_time.elapsed().as_millis() as i64;
    let now = Utc::now();

    // Update test run record
    let _ = sqlx::query(
        r#"
        UPDATE test_runs SET
            status = ?,
            total_tests = ?,
            passed_tests = ?,
            failed_tests = ?,
            completed_at = ?,
            duration_ms = ?,
            results = ?,
            error_message = ?
        WHERE id = ?
        "#,
    )
    .bind(status)
    .bind(total_tests)
    .bind(passed_tests)
    .bind(failed_tests)
    .bind(now.to_rfc3339())
    .bind(duration_ms)
    .bind(serde_json::to_string(&results).ok())
    .bind(&error_message)
    .bind(test_id)
    .execute(state.db.pool())
    .await;

    // Emit completion event
    let severity = if status == "passed" {
        EventSeverity::Success
    } else {
        EventSeverity::Error
    };

    emit_event(
        state,
        Some(topology_id),
        "test",
        Some("completed"),
        severity,
        &format!("Test '{}' {}", test_type, status),
        error_message.as_deref(),
        Some(EventSourceType::Test),
        Some(test_id),
        Some(serde_json::json!({
            "status": status,
            "total": total_tests,
            "passed": passed_tests,
            "failed": failed_tests,
            "duration_ms": duration_ms
        })),
    )
    .await;

    // Broadcast via WebSocket
    let _ = state.event_tx.send(super::Event::TestCompleted {
        id: test_id.to_string(),
        status: status.to_string(),
    });

    info!(
        test_id = test_id,
        topology_id = topology_id,
        status = status,
        duration_ms = duration_ms,
        "Test completed"
    );
}

/// Run diagnostic test (network connectivity)
async fn run_diagnostic_test(
    _state: &AppState,
    _topology_id: &str,
) -> Result<crate::api::diagnostic::DiagnosticReport, String> {
    // This would call the diagnostic module
    // For now, return a mock result
    Err("Diagnostic test requires K8s connection".to_string())
}

/// Smoke test result
#[derive(Debug, Serialize)]
struct SmokeTestReport {
    total: i32,
    passed: i32,
    failed: i32,
    tests: Vec<SmokeTestResult>,
}

#[derive(Debug, Serialize)]
struct SmokeTestResult {
    name: String,
    status: String,
    message: Option<String>,
}

/// Run smoke tests
async fn run_smoke_test(state: &AppState, topology_id: &str) -> Result<SmokeTestReport, String> {
    let mut tests = Vec::new();
    let mut passed = 0;
    let mut failed = 0;

    // Test 1: Topology exists
    match state.db.get_topology(topology_id).await {
        Ok(Some(_)) => {
            tests.push(SmokeTestResult {
                name: "topology_exists".to_string(),
                status: "passed".to_string(),
                message: None,
            });
            passed += 1;
        }
        _ => {
            tests.push(SmokeTestResult {
                name: "topology_exists".to_string(),
                status: "failed".to_string(),
                message: Some("Topology not found".to_string()),
            });
            failed += 1;
        }
    }

    // Test 2: Database connection
    match sqlx::query("SELECT 1").fetch_one(state.db.pool()).await {
        Ok(_) => {
            tests.push(SmokeTestResult {
                name: "database_connection".to_string(),
                status: "passed".to_string(),
                message: None,
            });
            passed += 1;
        }
        Err(e) => {
            tests.push(SmokeTestResult {
                name: "database_connection".to_string(),
                status: "failed".to_string(),
                message: Some(e.to_string()),
            });
            failed += 1;
        }
    }

    // Test 3: K8s connection (if available)
    if state.k8s.read().await.is_some() {
        tests.push(SmokeTestResult {
            name: "kubernetes_connection".to_string(),
            status: "passed".to_string(),
            message: None,
        });
        passed += 1;
    } else {
        tests.push(SmokeTestResult {
            name: "kubernetes_connection".to_string(),
            status: "skipped".to_string(),
            message: Some("K8s client not configured".to_string()),
        });
    }

    Ok(SmokeTestReport {
        total: tests.len() as i32,
        passed,
        failed,
        tests,
    })
}

/// Run chaos validation test
async fn run_chaos_validation_test(
    state: &AppState,
    topology_id: &str,
) -> Result<SmokeTestReport, String> {
    let mut tests = Vec::new();
    let mut passed = 0;
    let failed = 0;

    // Get active chaos conditions
    let conditions = state
        .db
        .list_chaos_conditions(topology_id)
        .await
        .map_err(|e| e.to_string())?;

    if conditions.is_empty() {
        tests.push(SmokeTestResult {
            name: "chaos_conditions_exist".to_string(),
            status: "skipped".to_string(),
            message: Some("No chaos conditions to validate".to_string()),
        });
    } else {
        tests.push(SmokeTestResult {
            name: "chaos_conditions_exist".to_string(),
            status: "passed".to_string(),
            message: Some(format!("{} conditions found", conditions.len())),
        });
        passed += 1;
    }

    // Validate each condition
    for condition in &conditions {
        let test_name = format!("chaos_{}", condition.id);
        if condition.status == crate::chaos::ChaosConditionStatus::Active {
            tests.push(SmokeTestResult {
                name: test_name,
                status: "passed".to_string(),
                message: Some(format!("{:?} is active", condition.chaos_type)),
            });
            passed += 1;
        } else {
            tests.push(SmokeTestResult {
                name: test_name,
                status: "warning".to_string(),
                message: Some(format!("{:?} is {:?}", condition.chaos_type, condition.status)),
            });
        }
    }

    Ok(SmokeTestReport {
        total: tests.len() as i32,
        passed,
        failed,
        tests,
    })
}

/// Convert row to TestRun
fn row_to_test_run(row: TestRunRow) -> TestRun {
    TestRun {
        id: row.id,
        topology_id: row.topology_id,
        test_type: row.test_type,
        status: row.status,
        total_tests: row.total_tests.unwrap_or(0),
        passed_tests: row.passed_tests.unwrap_or(0),
        failed_tests: row.failed_tests.unwrap_or(0),
        started_at: row.started_at.and_then(|s| s.parse().ok()),
        completed_at: row.completed_at.and_then(|s| s.parse().ok()),
        duration_ms: row.duration_ms,
        results: row.results.and_then(|s| serde_json::from_str(&s).ok()),
        error_message: row.error_message,
        created_at: row.created_at.parse().unwrap_or_else(|_| Utc::now()),
    }
}
