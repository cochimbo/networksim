use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::{sqlite::SqlitePoolOptions, FromRow, Pool, Sqlite};

use crate::models::Topology;

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
