//! Integration tests for the API

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::{json, Value};
use tower::ServiceExt;

use networksim_backend::{api::AppState, config::Config, db::Database};

async fn setup_app() -> axum::Router {
    let config = Config::default();
    let db = Database::new("sqlite::memory:").await.unwrap();
    db.run_migrations().await.unwrap();
    let state = AppState::new(db, config);

    networksim_backend::create_router(state)
}

#[tokio::test]
async fn test_health_check() {
    let app = setup_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["status"], "ok");
}

#[tokio::test]
async fn test_create_topology() {
    let app = setup_app().await;

    let payload = json!({
        "name": "Test Topology",
        "description": "A test topology",
        "nodes": [],
        "links": []
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/topologies")
                .header("content-type", "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["name"], "Test Topology");
    assert!(json["id"].is_string());
}

#[tokio::test]
async fn test_topology_crud() {
    let app = setup_app().await;

    // Create
    let create_payload = json!({
        "name": "CRUD Test",
        "nodes": [
            {"id": "n1", "name": "Node1", "position": {"x": 0.0, "y": 0.0}}
        ],
        "links": []
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/topologies")
                .header("content-type", "application/json")
                .body(Body::from(create_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let created: Value = serde_json::from_slice(&body).unwrap();
    let id = created["id"].as_str().unwrap();

    // List
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/topologies")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let list: Vec<Value> = serde_json::from_slice(&body).unwrap();

    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["name"], "CRUD Test");

    // Get
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/api/topologies/{}", id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Update
    let update_payload = json!({
        "name": "Updated Name"
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(&format!("/api/topologies/{}", id))
                .header("content-type", "application/json")
                .body(Body::from(update_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let updated: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(updated["name"], "Updated Name");

    // Delete
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(&format!("/api/topologies/{}", id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify deleted
    let response = app
        .oneshot(
            Request::builder()
                .uri(&format!("/api/topologies/{}", id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_topology_validation() {
    let app = setup_app().await;

    // Create topology with duplicate node IDs
    let payload = json!({
        "name": "Invalid Topology",
        "nodes": [
            {"id": "n1", "name": "Node1", "position": {"x": 0.0, "y": 0.0}},
            {"id": "n1", "name": "Node2", "position": {"x": 100.0, "y": 0.0}}
        ],
        "links": []
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/topologies")
                .header("content-type", "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_topology_with_links() {
    let app = setup_app().await;

    let payload = json!({
        "name": "Network with Links",
        "nodes": [
            {"id": "server", "name": "Server", "position": {"x": 0.0, "y": 0.0}},
            {"id": "client1", "name": "Client1", "position": {"x": 100.0, "y": 0.0}},
            {"id": "client2", "name": "Client2", "position": {"x": 100.0, "y": 100.0}}
        ],
        "links": [
            {"id": "l1", "source": "server", "target": "client1", "properties": {"bandwidth": "1000Mbps", "latency": "5ms"}},
            {"id": "l2", "source": "server", "target": "client2", "properties": {}}
        ]
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/topologies")
                .header("content-type", "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["nodes"].as_array().unwrap().len(), 3);
    assert_eq!(json["links"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn test_invalid_link_target() {
    let app = setup_app().await;

    let payload = json!({
        "name": "Invalid Links",
        "nodes": [
            {"id": "n1", "name": "Node1", "position": {"x": 0.0, "y": 0.0}}
        ],
        "links": [
            {"id": "l1", "source": "n1", "target": "nonexistent"}
        ]
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/topologies")
                .header("content-type", "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}
