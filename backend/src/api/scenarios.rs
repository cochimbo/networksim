use axum::{
    extract::{Path, State},
    Json, Router, routing::{get, post},
};
// use tracing::{info, error};
use crate::{
    api::{AppState, response::ApiResponse},
    models::scenarios::{Scenario, CreateScenarioRequest, UpdateScenarioRequest},
    error::AppError,
    chaos::{ChaosDirection, ChaosCondition, ChaosConditionStatus},
};
use chrono::Utc;
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/topologies/:topology_id/scenarios", get(list_scenarios).post(create_scenario))
        .route("/api/scenarios/:id", get(get_scenario).put(update_scenario).delete(delete_scenario))
        .route("/api/scenarios/:id/run", post(run_scenario))
}

async fn run_scenario(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<ApiResponse<()>, AppError> {
    let scenario = sqlx::query_as::<_, Scenario>(
        "SELECT * FROM scenarios WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(state.db.pool())
    .await?
    .ok_or_else(|| AppError::NotFound("Scenario not found".to_string()))?;

    // Spawn execution task
    tokio::spawn(async move {
        if let Err(e) = execute_scenario_logic(state, scenario).await {
            tracing::error!("Scenario execution failed: {}", e);
        }
    });

    Ok(ApiResponse::success(()))
}

async fn execute_scenario_logic(state: AppState, scenario: Scenario) -> Result<(), AppError> {
    tracing::info!("Starting scenario: {}", scenario.name);
    
    // Launch all steps
    for step in scenario.steps.0 {
        let state_clone = state.clone();
        let topology_id = scenario.topology_id.clone();
        
        tokio::spawn(async move {
            // Wait for step start time
            let delay_ms = (step.start_at * 1000.0) as u64;
            tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;


            let condition_id = Uuid::new_v4().to_string();
            let now = Utc::now();
            
            let condition = ChaosCondition {
                id: condition_id.clone(),
                topology_id: topology_id.clone(),
                source_node_id: step.source_node_id.clone(),
                target_node_id: step.target_node_id.clone(),
                chaos_type: step.chaos_type.clone(),
                direction: ChaosDirection::Both,
                duration: Some(format!("{}s", step.duration)),
                params: step.params.clone(),
                status: ChaosConditionStatus::Pending,
                k8s_name: None,
                started_at: None,
                created_at: now,
                updated_at: now,
            };

            // 1. Persist condition in DB
            match state_clone.db.create_chaos_condition(&condition).await {
                Ok(_) => {},
                Err(e) => {
                    tracing::error!("Failed to create chaos condition for step: {}", e);
                    return;
                }
            };

            tracing::info!("Executing Scenario Step: {} on {}", step.chaos_type, step.source_node_id);

            // 2. Apply to Kubernetes using ChaosClient
            // We use the "networksim-sim" namespace or from config if available (hardcoded for now to match other modules)
            match crate::chaos::ChaosClient::new("networksim-sim").await {
               Ok(client) => {
                   let res = client.create_chaos(
                       &condition.topology_id,
                       &condition.id,
                       &condition.source_node_id,
                       condition.target_node_id.as_deref(),
                       &condition.chaos_type,
                       &ChaosDirection::Both, // TODO: support direction from params
                       condition.duration.as_deref(),
                       &condition.params
                   ).await;

                   if let Err(e) = res {
                        tracing::error!("Failed to apply chaos to K8s: {}", e);
                        // Try to mark as failed in DB
                        let _ = state_clone.db.update_chaos_condition_status(&condition.id, &ChaosConditionStatus::Paused, None).await;
                        return;
                   }
                   
                   // Mark as Active
                   let _ = state_clone.db.update_chaos_condition_status(&condition.id, &ChaosConditionStatus::Active, None).await;

                   // 3. Wait for duration
                   let duration_ms = (step.duration * 1000.0) as u64;
                   tokio::time::sleep(tokio::time::Duration::from_millis(duration_ms)).await;

                   // 4. Cleanup (Stop chaos)
                   // Even if duration is passed to Chaos Mesh, we explicitly delete it to clean up CRDs
                   if let Err(e) = client.delete_chaos(&condition.topology_id, &condition.id).await {
                        tracing::error!("Failed to cleanup chaos: {}", e);
                   }

                   // Mark as finished/paused
                   let _ = state_clone.db.update_chaos_condition_status(&condition.id, &ChaosConditionStatus::Paused, None).await;
               },
               Err(e) => {
                   tracing::error!("Failed to create K8s client: {}", e);
               }
            }
        });
    }

    Ok(())
}

async fn list_scenarios(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
) -> Result<ApiResponse<Vec<Scenario>>, AppError> {
    let scenarios = sqlx::query_as::<_, Scenario>(
        r#"
        SELECT * FROM scenarios 
        WHERE topology_id = ? 
        ORDER BY created_at DESC
        "#,
    )
    .bind(topology_id)
    .fetch_all(state.db.pool())
    .await?;

    Ok(ApiResponse::success(scenarios))
}

async fn get_scenario(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<ApiResponse<Scenario>, AppError> {
    let scenario = sqlx::query_as::<_, Scenario>(
        r#"
        SELECT * FROM scenarios WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(state.db.pool())
    .await?
    .ok_or_else(|| AppError::NotFound("Scenario not found".to_string()))?;

    Ok(ApiResponse::success(scenario))
}

async fn create_scenario(
    State(state): State<AppState>,
    Path(topology_id): Path<String>,
    Json(payload): Json<CreateScenarioRequest>,
) -> Result<ApiResponse<Scenario>, AppError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    let scenario = Scenario {
        id: id.clone(),
        topology_id: topology_id.clone(),
        name: payload.name,
        description: payload.description,
        total_duration: payload.total_duration,
        steps: sqlx::types::Json(payload.steps),
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    sqlx::query(
        r#"
        INSERT INTO scenarios (id, topology_id, name, description, total_duration, steps, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&scenario.id)
    .bind(&scenario.topology_id)
    .bind(&scenario.name)
    .bind(&scenario.description)
    .bind(scenario.total_duration)
    .bind(&scenario.steps)
    .bind(&scenario.created_at)
    .bind(&scenario.updated_at)
    .execute(state.db.pool())
    .await?;

    Ok(ApiResponse::success(scenario))
}

async fn update_scenario(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateScenarioRequest>,
) -> Result<ApiResponse<Scenario>, AppError> {
    let mut scenario = sqlx::query_as::<_, Scenario>(
        "SELECT * FROM scenarios WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(state.db.pool())
    .await?
    .ok_or_else(|| AppError::NotFound("Scenario not found".to_string()))?;

    let now = Utc::now().to_rfc3339();
    
    if let Some(name) = payload.name {
        scenario.name = name;
    }
    if let Some(desc) = payload.description {
        scenario.description = Some(desc);
    }
    if let Some(dur) = payload.total_duration {
        scenario.total_duration = dur;
    }
    if let Some(steps) = payload.steps {
        scenario.steps = sqlx::types::Json(steps);
    }
    scenario.updated_at = now.clone();

    sqlx::query(
        r#"
        UPDATE scenarios 
        SET name = ?, description = ?, total_duration = ?, steps = ?, updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(&scenario.name)
    .bind(&scenario.description)
    .bind(scenario.total_duration)
    .bind(&scenario.steps)
    .bind(&scenario.updated_at)
    .bind(&id)
    .execute(state.db.pool())
    .await?;

    Ok(ApiResponse::success(scenario))
}

async fn delete_scenario(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<ApiResponse<()>, AppError> {
    let result = sqlx::query("DELETE FROM scenarios WHERE id = ?")
        .bind(id)
        .execute(state.db.pool())
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Scenario not found".to_string()));
    }

    Ok(ApiResponse::success(()))
}
