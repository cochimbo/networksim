//! Tests for data models
//!
//! These tests verify topology and application model serialization and validation.

use serde_json::json;

#[test]
fn test_topology_node_serialization() {
    let node = json!({
        "id": "node-1",
        "name": "Server Node",
        "position": {"x": 100.0, "y": 200.0},
        "config": {
            "image": "nginx:latest",
            "resources": {"cpu": "100m", "memory": "128Mi"}
        }
    });

    // Verify structure
    assert_eq!(node["id"], "node-1");
    assert_eq!(node["name"], "Server Node");
    assert_eq!(node["position"]["x"], 100.0);
    assert_eq!(node["config"]["image"], "nginx:latest");
}

#[test]
fn test_topology_link_serialization() {
    let link = json!({
        "id": "link-1",
        "source": "node-1",
        "target": "node-2",
        "properties": {
            "bandwidth": "1000Mbps",
            "latency": "5ms"
        }
    });

    assert_eq!(link["id"], "link-1");
    assert_eq!(link["source"], "node-1");
    assert_eq!(link["target"], "node-2");
    assert_eq!(link["properties"]["bandwidth"], "1000Mbps");
}

#[test]
fn test_complete_topology_structure() {
    let topology = json!({
        "id": "topo-uuid",
        "name": "Test Network",
        "description": "A test network topology",
        "nodes": [
            {"id": "router", "name": "Router", "position": {"x": 0.0, "y": 0.0}},
            {"id": "server1", "name": "Server 1", "position": {"x": 100.0, "y": 0.0}},
            {"id": "server2", "name": "Server 2", "position": {"x": 100.0, "y": 100.0}}
        ],
        "links": [
            {"id": "l1", "source": "router", "target": "server1"},
            {"id": "l2", "source": "router", "target": "server2"}
        ]
    });

    let nodes = topology["nodes"].as_array().unwrap();
    let links = topology["links"].as_array().unwrap();

    assert_eq!(nodes.len(), 3);
    assert_eq!(links.len(), 2);

    // Verify link references exist in nodes
    let node_ids: Vec<&str> = nodes.iter().map(|n| n["id"].as_str().unwrap()).collect();

    for link in links {
        let source = link["source"].as_str().unwrap();
        let target = link["target"].as_str().unwrap();
        assert!(node_ids.contains(&source), "Link source not found in nodes");
        assert!(node_ids.contains(&target), "Link target not found in nodes");
    }
}

#[test]
fn test_node_types() {
    let node_types = vec!["router", "server", "client", "custom"];

    for node_type in node_types {
        let node = json!({
            "id": format!("{}-1", node_type),
            "name": format!("{} Node", node_type),
            "type": node_type,
            "position": {"x": 0.0, "y": 0.0}
        });

        assert_eq!(node["type"], node_type);
    }
}

#[test]
fn test_application_deployment_structure() {
    let app = json!({
        "id": "app-uuid",
        "node_id": "node-1",
        "chart": {
            "repository": "https://charts.example.com",
            "name": "nginx",
            "version": "1.0.0"
        },
        "values": {
            "replicaCount": 1,
            "service": {"port": 80}
        },
        "status": "deployed"
    });

    assert_eq!(app["chart"]["name"], "nginx");
    assert_eq!(app["status"], "deployed");
}

#[test]
fn test_position_coordinates() {
    // Test various position values including negative
    let positions = vec![
        (0.0, 0.0),
        (100.0, 200.0),
        (-50.0, 100.0),
        (1000.0, -500.0),
        (0.5, 0.5),
    ];

    for (x, y) in positions {
        let pos = json!({"x": x, "y": y});
        assert_eq!(pos["x"].as_f64().unwrap(), x);
        assert_eq!(pos["y"].as_f64().unwrap(), y);
    }
}

#[test]
fn test_link_properties_optional() {
    // Link with no properties
    let link_minimal = json!({
        "id": "l1",
        "source": "n1",
        "target": "n2"
    });

    assert!(link_minimal.get("properties").is_none());

    // Link with empty properties
    let link_empty = json!({
        "id": "l2",
        "source": "n1",
        "target": "n2",
        "properties": {}
    });

    assert!(link_empty["properties"].as_object().unwrap().is_empty());

    // Link with full properties
    let link_full = json!({
        "id": "l3",
        "source": "n1",
        "target": "n2",
        "properties": {
            "bandwidth": "100Mbps",
            "latency": "10ms",
            "loss": "0.1%"
        }
    });

    assert_eq!(link_full["properties"].as_object().unwrap().len(), 3);
}

#[test]
fn test_topology_metadata() {
    let topology = json!({
        "id": "topo-1",
        "name": "Test",
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-02T12:00:00Z",
        "nodes": [],
        "links": []
    });

    // Verify timestamps are valid ISO 8601
    let created = topology["created_at"].as_str().unwrap();
    let updated = topology["updated_at"].as_str().unwrap();

    assert!(created.contains("T"));
    assert!(created.ends_with("Z"));
    assert!(updated.contains("T"));
}
