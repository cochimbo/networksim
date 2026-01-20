use utoipa::OpenApi;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Generate OpenAPI JSON from the derived ApiDoc and write to openapi.json
    let spec = networksim_backend::api::openapi::ApiDoc::openapi();
    let json = serde_json::to_string_pretty(&spec)?;
    std::fs::write("openapi.json", json)?;
    println!("Wrote openapi.json");
    Ok(())
}
