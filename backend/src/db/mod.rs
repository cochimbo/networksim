use anyhow::Result;
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};

pub type DbPool = Pool<Sqlite>;

#[derive(Clone)]
pub struct Database {
    pool: DbPool,
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
