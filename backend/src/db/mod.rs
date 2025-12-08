use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::{sqlite::SqlitePoolOptions, FromRow, Pool, Sqlite};

use crate::models::Topology;
use crate::chaos::{ChaosCondition, ChaosConditionStatus, ChaosDirection, ChaosType};

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
    created_at: String,
    updated_at: String,
}

impl Database {
    pub async fn new(database_url: &str) -> Result<Self> {
        // Create database file if it doesn't exist
        let db_path = database_url.trim_start_matches("sqlite://");
        if db_path != ":memory:" {
            if let Some(parent) = std::path::Path::new(db_path).parent() {
                std::fs::create_dir_all(parent)?;
            }
            if !std::path::Path::new(db_path).exists() {
                std::fs::File::create(db_path)?;
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
                    created_at: row.created_at.parse::<DateTime<Utc>>()
                        .map_err(|e| sqlx::Error::Decode(Box::new(e)))?,
                    updated_at: row.updated_at.parse::<DateTime<Utc>>()
                        .map_err(|e| sqlx::Error::Decode(Box::new(e)))?,
                };
                Ok(Some(topology))
            }
            None => Ok(None),
        }
    }

    // ==================== Chaos Conditions ====================

    /// Create a new chaos condition
    pub async fn create_chaos_condition(&self, condition: &ChaosCondition) -> Result<(), sqlx::Error> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            INSERT INTO chaos_conditions (id, topology_id, source_node_id, target_node_id, chaos_type, direction, duration, params, status, k8s_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Get a chaos condition by ID
    pub async fn get_chaos_condition(&self, id: &str) -> Result<Option<ChaosCondition>, sqlx::Error> {
        let row: Option<ChaosConditionRow> = sqlx::query_as(
            "SELECT id, topology_id, source_node_id, target_node_id, chaos_type, direction, duration, params, status, k8s_name, created_at, updated_at FROM chaos_conditions WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        row.map(Self::row_to_chaos_condition).transpose()
    }

    /// List all chaos conditions for a topology
    pub async fn list_chaos_conditions(&self, topology_id: &str) -> Result<Vec<ChaosCondition>, sqlx::Error> {
        let rows: Vec<ChaosConditionRow> = sqlx::query_as(
            "SELECT id, topology_id, source_node_id, target_node_id, chaos_type, direction, duration, params, status, k8s_name, created_at, updated_at FROM chaos_conditions WHERE topology_id = ? ORDER BY created_at",
        )
        .bind(topology_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(Self::row_to_chaos_condition)
            .collect()
    }

    /// Update chaos condition status and k8s_name
    pub async fn update_chaos_condition_status(
        &self,
        id: &str,
        status: &ChaosConditionStatus,
        k8s_name: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE chaos_conditions SET status = ?, k8s_name = ?, updated_at = ? WHERE id = ?",
        )
        .bind(status.to_string())
        .bind(k8s_name)
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
        .bind(&condition.direction.to_string())
        .bind(&condition.duration)
        .bind(serde_json::to_string(&condition.params).unwrap_or_default())
        .bind(&condition.updated_at.to_rfc3339())
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

    /// Helper to convert row to ChaosCondition
    fn row_to_chaos_condition(row: ChaosConditionRow) -> Result<ChaosCondition, sqlx::Error> {
        let chaos_type = match row.chaos_type.as_str() {
            "delay" => ChaosType::Delay,
            "loss" => ChaosType::Loss,
            "bandwidth" => ChaosType::Bandwidth,
            "corrupt" => ChaosType::Corrupt,
            "duplicate" => ChaosType::Duplicate,
            "partition" => ChaosType::Partition,
            _ => ChaosType::Delay,
        };

        let direction = match row.direction.as_str() {
            "to" => ChaosDirection::To,
            "from" => ChaosDirection::From,
            "both" => ChaosDirection::Both,
            _ => ChaosDirection::To,
        };

        let status = row.status.parse::<ChaosConditionStatus>()
            .unwrap_or_default();

        let params: serde_json::Value = serde_json::from_str(&row.params)
            .map_err(|e| sqlx::Error::Decode(Box::new(e)))?;

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
            created_at: row.created_at.parse::<DateTime<Utc>>()
                .map_err(|e| sqlx::Error::Decode(Box::new(e)))?,
            updated_at: row.updated_at.parse::<DateTime<Utc>>()
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
