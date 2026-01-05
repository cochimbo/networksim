use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::{sqlite::SqlitePoolOptions, FromRow, Pool, Sqlite};

use crate::chaos::{ChaosCondition, ChaosConditionStatus, ChaosDirection, ChaosType};
use crate::models::{Application, Topology};

pub type DbPool = Pool<Sqlite>;

#[derive(Clone)]
pub struct Database {
    pool: DbPool,
}

#[derive(FromRow)]
struct TopologyRow {
    id: String,
    name: String,
    description: Option<String>,
    data: String,
    created_at: String,
    updated_at: String,
}

#[derive(FromRow)]
struct ChaosConditionRow {
    id: String,
    topology_id: String,
    source_node_id: String,
    target_node_id: Option<String>,
    chaos_type: String,
    direction: String,
    duration: Option<String>,
    params: String,
    status: String,
    k8s_name: Option<String>,
    started_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(FromRow)]
struct ApplicationRow {
    id: String,
    topology_id: String,
    node_selector: Option<String>,  // JSON array of node IDs
    image_name: Option<String>, // Full image reference
    // name: String, // Eliminado
    chart: String,  // Keep for backward compatibility during migration
    // version: Option<String>,
    namespace: String,
    envvalues: Option<String>,
    status: String,
    release_name: Option<String>,
    created_at: String,
    updated_at: String,
}

impl Database {
    pub async fn new(database_url: &str) -> Result<Self> {
        // Create database file if it doesn't exist
        // If the URL contains SQLite URI query params (e.g. "?mode=rwc"), strip them
        let mut db_path = database_url.trim_start_matches("sqlite://").to_string();
        if let Some(idx) = db_path.find('?') {
            db_path.truncate(idx);
        }
        if db_path != ":memory:" {
            if let Some(parent) = std::path::Path::new(&db_path).parent() {
                std::fs::create_dir_all(parent)?;
            }
            if !std::path::Path::new(&db_path).exists() {
                std::fs::File::create(&db_path)?;
            }
        }

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await?;

        Ok(Self { pool })
    }

    pub async fn run_migrations(&self) -> Result<()> {
        sqlx::migrate!("./migrations").run(&self.pool).await?;
        Ok(())
    }

    pub fn pool(&self) -> &DbPool {
        &self.pool
    }

    /// Get a topology by ID
    pub async fn get_topology(&self, id: &str) -> Result<Option<Topology>, sqlx::Error> {
        let row: Option<TopologyRow> = sqlx::query_as(
            "SELECT id, name, description, data, created_at, updated_at FROM topologies WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(row) => {
                let data: serde_json::Value = serde_json::from_str(&row.data)
                    .map_err(|e| sqlx::Error::Decode(Box::new(e)))?;

                let topology = Topology {
                    id: row.id,
                    name: row.name,
                    description: row.description,
                    nodes: serde_json::from_value(data.get("nodes").cloned().unwrap_or_default())
                        .map_err(|e| sqlx::Error::Decode(Box::new(e)))?,
                    links: serde_json::from_value(data.get("links").cloned().unwrap_or_default())
                        .map_err(|e| sqlx::Error::Decode(Box::new(e)))?,
                    created_at: row
                        .created_at
                        .parse::<DateTime<Utc>>()
                        .map_err(|e| sqlx::Error::Decode(Box::new(e)))?,
                    updated_at: row
                        .updated_at
                        .parse::<DateTime<Utc>>()
                        .map_err(|e| sqlx::Error::Decode(Box::new(e)))?,
                };
                Ok(Some(topology))
            }
            None => Ok(None),
        }
    }

    // ==================== Chaos Conditions ====================

    /// Create a new chaos condition
    pub async fn create_chaos_condition(
        &self,
        condition: &ChaosCondition,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now().to_rfc3339();
        let started_at = condition.started_at.map(|dt| dt.to_rfc3339());
        sqlx::query(
            r#"
            INSERT INTO chaos_conditions (id, topology_id, source_node_id, target_node_id, chaos_type, direction, duration, params, status, k8s_name, started_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&condition.id)
        .bind(&condition.topology_id)
        .bind(&condition.source_node_id)
        .bind(&condition.target_node_id)
        .bind(condition.chaos_type.to_string())
        .bind(condition.direction.to_string())
        .bind(&condition.duration)
        .bind(condition.params.to_string())
        .bind(condition.status.to_string())
        .bind(&condition.k8s_name)
        .bind(&started_at)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Get a chaos condition by ID
    pub async fn get_chaos_condition(
        &self,
        id: &str,
    ) -> Result<Option<ChaosCondition>, sqlx::Error> {
        let row: Option<ChaosConditionRow> = sqlx::query_as(
            "SELECT id, topology_id, source_node_id, target_node_id, chaos_type, direction, duration, params, status, k8s_name, started_at, created_at, updated_at FROM chaos_conditions WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        row.map(Self::row_to_chaos_condition).transpose()
    }

    /// List all chaos conditions for a topology
    pub async fn list_chaos_conditions(
        &self,
        topology_id: &str,
    ) -> Result<Vec<ChaosCondition>, sqlx::Error> {
        let rows: Vec<ChaosConditionRow> = sqlx::query_as(
            "SELECT id, topology_id, source_node_id, target_node_id, chaos_type, direction, duration, params, status, k8s_name, started_at, created_at, updated_at FROM chaos_conditions WHERE topology_id = ? ORDER BY created_at",
        )
        .bind(topology_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(Self::row_to_chaos_condition).collect()
    }

    /// Update chaos condition status and k8s_name
    /// Sets started_at when status becomes Active, clears it otherwise
    pub async fn update_chaos_condition_status(
        &self,
        id: &str,
        status: &ChaosConditionStatus,
        k8s_name: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now().to_rfc3339();
        // Set started_at when activating, clear when pausing/pending
        let started_at = if *status == ChaosConditionStatus::Active {
            Some(now.clone())
        } else {
            None
        };

        sqlx::query(
            "UPDATE chaos_conditions SET status = ?, k8s_name = ?, started_at = ?, updated_at = ? WHERE id = ?",
        )
        .bind(status.to_string())
        .bind(k8s_name)
        .bind(&started_at)
        .bind(&now)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Update chaos condition (all fields)
    pub async fn update_chaos_condition(
        &self,
        condition: &ChaosCondition,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE chaos_conditions SET 
                direction = ?, 
                duration = ?, 
                params = ?, 
                updated_at = ? 
             WHERE id = ?",
        )
        .bind(condition.direction.to_string())
        .bind(&condition.duration)
        .bind(serde_json::to_string(&condition.params).unwrap_or_default())
        .bind(condition.updated_at.to_rfc3339())
        .bind(&condition.id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Delete a chaos condition
    pub async fn delete_chaos_condition(&self, id: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM chaos_conditions WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Delete all chaos conditions for a topology
    pub async fn delete_all_chaos_conditions(&self, topology_id: &str) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM chaos_conditions WHERE topology_id = ?")
            .bind(topology_id)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected())
    }

    /// Create a new application
    pub async fn create_application(&self, app: &Application) -> Result<(), sqlx::Error> {
        let node_selector_json = serde_json::to_string(&app.node_selector)
            .map_err(|e| sqlx::Error::Decode(Box::new(e)))?;

        // Log attempt to insert application (help debug missing persistence)
        tracing::info!("DB:create_application - id={}, topology_id={}, has_values={}",
            app.id, app.topology_id, app.values.is_some());

        if let Some(vals) = &app.values {
            match serde_json::to_string(vals) {
                Ok(s) => tracing::debug!("DB:create_application - values serialized (len={})", s.len()),
                Err(e) => tracing::warn!("DB:create_application - failed serializing values: {}", e),
            }
        }

        let res = sqlx::query(
            "INSERT INTO applications (id, topology_id, node_selector, image_name, chart, namespace, envvalues, status, release_name, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(app.id.to_string())
        .bind(app.topology_id.to_string())
        .bind(node_selector_json)
        .bind(&app.image_name)
        .bind(&app.image_name) // Keep chart for backward compatibility
        .bind(&app.namespace)
                .bind(app.values.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default()))
        .bind(app.status.to_string())
        .bind(&app.release_name)
        .bind(app.created_at.to_rfc3339())
        .bind(app.updated_at.to_rfc3339())
        .execute(&self.pool)
        .await;

        match res {
            Ok(_) => {
                tracing::info!("DB:create_application - insert successful: id={}", app.id);
                Ok(())
            }
            Err(e) => {
                tracing::error!("DB:create_application - insert failed: {}", e);
                Err(e)
            }
        }
    }

    /// Get an application by ID
    pub async fn get_application(&self, id: &str) -> Result<Option<Application>, sqlx::Error> {
          let row: Option<ApplicationRow> = sqlx::query_as(
              "SELECT id, topology_id, node_selector, image_name, chart, namespace, envvalues, status, release_name, created_at, updated_at 
             FROM applications WHERE id = ?",
          )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        row.map(Self::row_to_application).transpose()
    }

    /// List all applications for a topology
    pub async fn list_applications(&self, topology_id: &str) -> Result<Vec<Application>, sqlx::Error> {
          let rows: Vec<ApplicationRow> = sqlx::query_as(
              "SELECT id, topology_id, node_selector, image_name, chart, namespace, envvalues, status, release_name, created_at, updated_at 
             FROM applications WHERE topology_id = ? ORDER BY created_at",
          )
        .bind(topology_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(Self::row_to_application).collect()
    }

    /// List all applications for a specific node
    pub async fn list_applications_by_node(&self, node_id: &str) -> Result<Vec<Application>, sqlx::Error> {
          let rows: Vec<ApplicationRow> = sqlx::query_as(
              "SELECT id, topology_id, node_selector, image_name, chart, namespace, envvalues, status, release_name, created_at, updated_at 
             FROM applications WHERE node_selector LIKE ? ORDER BY created_at",
          )
        .bind(format!("%\"{}\"", node_id))
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(Self::row_to_application).collect()
    }

    /// Update application status and release name
    pub async fn update_application_status(
        &self,
        id: &str,
        status: &crate::models::AppStatus,
        release_name: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE applications SET status = ?, release_name = ?, updated_at = ? WHERE id = ?",
        )
        .bind(status.to_string())
        .bind(release_name)
        .bind(&now)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Update application (all fields)
    pub async fn update_application(&self, app: &Application) -> Result<(), sqlx::Error> {
        let node_selector_json = serde_json::to_string(&app.node_selector)
            .map_err(|e| sqlx::Error::Decode(Box::new(e)))?;

        sqlx::query(
            "UPDATE applications SET 
                node_selector = ?,
                image_name = ?,
                chart = ?,
                namespace = ?,
                envvalues = ?,
                status = ?,
                release_name = ?,
                updated_at = ?
             WHERE id = ?"
        )
        .bind(node_selector_json)
        .bind(&app.image_name)
        .bind(&app.image_name)
        .bind(&app.namespace)
        .bind(app.values.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default()))
        .bind(app.status.to_string())
        .bind(&app.release_name)
        .bind(app.updated_at.to_rfc3339())
        .bind(app.id.to_string())
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Delete an application
    pub async fn delete_application(&self, id: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM applications WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Delete all applications for a topology
    pub async fn delete_all_applications(&self, topology_id: &str) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM applications WHERE topology_id = ?")
            .bind(topology_id)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected())
    }

    /// Helper to convert row to ChaosCondition
    fn row_to_chaos_condition(row: ChaosConditionRow) -> Result<ChaosCondition, sqlx::Error> {
        let chaos_type = match row.chaos_type.as_str() {
            "delay" => ChaosType::Delay,
            "loss" => ChaosType::Loss,
            "bandwidth" => ChaosType::Bandwidth,
            "corrupt" => ChaosType::Corrupt,
            "duplicate" => ChaosType::Duplicate,
            "partition" => ChaosType::Partition,
            "stress-cpu" => ChaosType::StressCpu,
            "pod-kill" => ChaosType::PodKill,
            "io-delay" => ChaosType::IoDelay,
            "http-abort" => ChaosType::HttpAbort,
            _ => ChaosType::Delay,
        };

        let direction = match row.direction.as_str() {
            "to" => ChaosDirection::To,
            "from" => ChaosDirection::From,
            "both" => ChaosDirection::Both,
            _ => ChaosDirection::To,
        };

        let status = row
            .status
            .parse::<ChaosConditionStatus>()
            .unwrap_or_default();

        let params: serde_json::Value =
            serde_json::from_str(&row.params).map_err(|e| sqlx::Error::Decode(Box::new(e)))?;

        // Parse started_at if present
        let started_at = row.started_at.and_then(|s| s.parse::<DateTime<Utc>>().ok());

        Ok(ChaosCondition {
            id: row.id,
            topology_id: row.topology_id,
            source_node_id: row.source_node_id,
            target_node_id: row.target_node_id,
            chaos_type,
            direction,
            duration: row.duration,
            params,
            status,
            k8s_name: row.k8s_name,
            started_at,
            created_at: row
                .created_at
                .parse::<DateTime<Utc>>()
                .map_err(|e| sqlx::Error::Decode(Box::new(e)))?,
            updated_at: row
                .updated_at
                .parse::<DateTime<Utc>>()
                .map_err(|e| sqlx::Error::Decode(Box::new(e)))?,
        })
    }

    /// Helper to convert row to Application
    fn row_to_application(row: ApplicationRow) -> Result<Application, sqlx::Error> {
        use crate::models::AppStatus;
        use uuid::Uuid;

        let status = match row.status.to_lowercase().as_str() {
            "pending" => AppStatus::Pending,
            "deploying" => AppStatus::Deploying,
            "deployed" => AppStatus::Deployed,
            "failed" => AppStatus::Failed,
            "uninstalling" => AppStatus::Uninstalling,
            _ => AppStatus::Pending,
        };

        let values = if let Some(values_str) = row.envvalues {
            Some(serde_json::from_str(&values_str).map_err(|e| sqlx::Error::Decode(Box::new(e)))?)
        } else {
            None
        };

        // Parse node_selector from JSON array, default to empty vec if None
        let node_selector: Vec<String> = if let Some(selector_str) = row.node_selector {
            serde_json::from_str(&selector_str).map_err(|e| sqlx::Error::Decode(Box::new(e)))?
        } else {
            Vec::new()
        };

        // Use chart_reference if available, otherwise fall back to chart for backward compatibility
        let image_name = row.image_name.unwrap_or_else(|| row.chart.clone());

        Ok(Application {
            id: Uuid::parse_str(&row.id).map_err(|e| sqlx::Error::Decode(Box::new(e)))?,
            topology_id: Uuid::parse_str(&row.topology_id).map_err(|e| sqlx::Error::Decode(Box::new(e)))?,
            node_selector,
            image_name,
            // name: row.name, // Eliminado
            namespace: row.namespace,
            values,
            status,
            release_name: row.release_name.unwrap_or_default(),
            created_at: row
                .created_at
                .parse::<DateTime<Utc>>()
                .map_err(|e| sqlx::Error::Decode(Box::new(e)))?,
            updated_at: row
                .updated_at
                .parse::<DateTime<Utc>>()
                .map_err(|e| sqlx::Error::Decode(Box::new(e)))?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_database_connection() {
        let db = Database::new("sqlite::memory:").await.unwrap();
        let result = sqlx::query("SELECT 1").fetch_one(db.pool()).await;
        assert!(result.is_ok());
    }
}
