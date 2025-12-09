use sqlx::sqlite::SqlitePool;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let database_url = env::var("DATABASE_URL").unwrap_or("sqlite:networksim.db".to_string());
    let pool = SqlitePool::connect(&database_url).await?;
    
    let status: String = sqlx::query_scalar("SELECT status FROM applications WHERE id = '4b5b6cd4-f052-4ca4-972a-116283ff9cce'")
        .fetch_one(&pool)
        .await?;
    
    println!("Status from DB: {}", status);
    
    // Try to convert to enum
    use networksim_backend::models::AppStatus;
    match status.as_str() {
        "pending" => println!("Converted to: Pending"),
        "deploying" => println!("Converted to: Deploying"), 
        "deployed" => println!("Converted to: Deployed"),
        "failed" => println!("Converted to: Failed"),
        "uninstalling" => println!("Converted to: Uninstalling"),
        _ => println!("Unknown status: {}", status),
    }
    
    Ok(())
}
