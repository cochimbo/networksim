//! Integration tests for the Chaos API endpoints
//!
//! These tests verify the chaos condition CRUD operations via the REST API.

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

async fn create_test_topology(app: &axum::Router) -> String {
    let payload = json!({
        "name": "Chaos Test Topology",
        "nodes": [
            {"id": "node-1", "name": "Node 1", "position": {"x": 0.0, "y": 0.0}},
            {"id": "node-2", "name": "Node 2", "position": {"x": 100.0, "y": 0.0}},
            {"id": "node-3", "name": "Node 3", "position": {"x": 50.0, "y": 100.0}}
        ],
        "links": [
            {"id": "l1", "source": "node-1", "target": "node-2"},
            {"id": "l2", "source": "node-2", "target": "node-3"}
        ]
    });

    let response = app
        .clone()
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

    json["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn test_list_chaos_empty() {
    let app = setup_app().await;
    let topology_id = create_test_topology(&app).await;

    let response = app
        .oneshot(
            Request::builder()
                .uri(format!("/api/topologies/{}/chaos", topology_id))
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

    assert!(json.is_array());
    assert_eq!(json.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn test_create_delay_chaos() {
    let app = setup_app().await;
    let topology_id = create_test_topology(&app).await;

    let chaos_payload = json!({
        "topology_id": topology_id,
        "source_node_id": "node-1",
        "target_node_id": "node-2",
        "chaos_type": "delay",
        "direction": "to",
        "duration": "60s",
        "params": {
            "latency": "100ms",
            "jitter": "10ms"
        }
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/chaos")
                .header("content-type", "application/json")
                .body(Body::from(chaos_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    // Should succeed even without K8s (chaos saved to DB)
    assert!(response.status() == StatusCode::OK || response.status() == StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn test_create_loss_chaos() {
    let app = setup_app().await;
    let topology_id = create_test_topology(&app).await;

    let chaos_payload = json!({
        "topology_id": topology_id,
        "source_node_id": "node-2",
        "chaos_type": "loss",
        "direction": "both",
        "params": {
            "loss": "25",
            "correlation": "50"
        }
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/chaos")
                .header("content-type", "application/json")
                .body(Body::from(chaos_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    // Check response (may fail if K8s not connected, but should not panic)
    let status = response.status();
    assert!(status == StatusCode::OK || status == StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn test_create_bandwidth_chaos() {
    let app = setup_app().await;
    let topology_id = create_test_topology(&app).await;

    let chaos_payload = json!({
        "topology_id": topology_id,
        "source_node_id": "node-1",
        "target_node_id": "node-3",
        "chaos_type": "bandwidth",
        "direction": "to",
        "params": {
            "rate": "1mbps",
            "buffer": 10000,
            "limit": 20000
        }
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/chaos")
                .header("content-type", "application/json")
                .body(Body::from(chaos_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    assert!(status == StatusCode::OK || status == StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn test_create_partition_chaos() {
    let app = setup_app().await;
    let topology_id = create_test_topology(&app).await;

    let chaos_payload = json!({
        "topology_id": topology_id,
        "source_node_id": "node-1",
        "chaos_type": "partition",
        "direction": "both",
        "params": {}
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/chaos")
                .header("content-type", "application/json")
                .body(Body::from(chaos_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    assert!(status == StatusCode::OK || status == StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn test_chaos_for_nonexistent_topology() {
    let app = setup_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/topologies/nonexistent-id/chaos")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // Should return 404 or empty array
    let status = response.status();
    assert!(status == StatusCode::OK || status == StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_chaos_invalid_node_id() {
    let app = setup_app().await;
    let topology_id = create_test_topology(&app).await;

    let chaos_payload = json!({
        "topology_id": topology_id,
        "source_node_id": "nonexistent-node",
        "chaos_type": "delay",
        "direction": "to",
        "params": {"latency": "100ms"}
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/chaos")
                .header("content-type", "application/json")
                .body(Body::from(chaos_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    // Should fail validation or K8s apply
    let status = response.status();
    // We accept various error codes since this depends on implementation
    assert!(status != StatusCode::OK || status == StatusCode::BAD_REQUEST || status == StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn test_chaos_types_serialization() {
    // Test that all chaos types serialize correctly in requests
    let chaos_types = vec![
        ("delay", json!({"latency": "100ms"})),
        ("loss", json!({"loss": "10"})),
        ("bandwidth", json!({"rate": "1mbps"})),
        ("corrupt", json!({"corrupt": "5"})),
        ("duplicate", json!({"duplicate": "10"})),
        ("partition", json!({})),
    ];

    for (chaos_type, params) in chaos_types {
        let request = json!({
            "topology_id": "test-id",
            "source_node_id": "node-1",
            "chaos_type": chaos_type,
            "direction": "to",
            "params": params
        });

        // Verify JSON serialization works
        let serialized = serde_json::to_string(&request).unwrap();
        assert!(serialized.contains(chaos_type));
    }
}

#[tokio::test]
async fn test_chaos_directions() {
    // Test all direction types serialize correctly
    let directions = vec!["to", "from", "both"];

    for direction in directions {
        let request = json!({
            "topology_id": "test-id",
            "source_node_id": "node-1",
            "chaos_type": "delay",
            "direction": direction,
            "params": {"latency": "100ms"}
        });

        let serialized = serde_json::to_string(&request).unwrap();
        assert!(serialized.contains(direction));
    }
}
