//! Tests for Chaos module
//!
//! These tests verify the chaos condition creation, validation, and management.

use serde_json::json;

use networksim_backend::chaos::types::*;

#[test]
fn test_chaos_type_display() {
    assert_eq!(ChaosType::Delay.to_string(), "delay");
    assert_eq!(ChaosType::Loss.to_string(), "loss");
    assert_eq!(ChaosType::Bandwidth.to_string(), "bandwidth");
    assert_eq!(ChaosType::Corrupt.to_string(), "corrupt");
    assert_eq!(ChaosType::Duplicate.to_string(), "duplicate");
    assert_eq!(ChaosType::Partition.to_string(), "partition");
}

#[test]
fn test_chaos_direction_display() {
    assert_eq!(ChaosDirection::To.to_string(), "to");
    assert_eq!(ChaosDirection::From.to_string(), "from");
    assert_eq!(ChaosDirection::Both.to_string(), "both");
}

#[test]
fn test_chaos_condition_status_parse() {
    assert_eq!(
        "pending".parse::<ChaosConditionStatus>().unwrap(),
        ChaosConditionStatus::Pending
    );
    assert_eq!(
        "active".parse::<ChaosConditionStatus>().unwrap(),
        ChaosConditionStatus::Active
    );
    assert_eq!(
        "paused".parse::<ChaosConditionStatus>().unwrap(),
        ChaosConditionStatus::Paused
    );
    assert!("invalid".parse::<ChaosConditionStatus>().is_err());
}

#[test]
fn test_delay_params_serialization() {
    let params = DelayParams {
        latency: "100ms".to_string(),
        jitter: Some("10ms".to_string()),
        correlation: Some("25".to_string()),
    };

    let json = serde_json::to_value(&params).unwrap();
    assert_eq!(json["latency"], "100ms");
    assert_eq!(json["jitter"], "10ms");
    assert_eq!(json["correlation"], "25");
}

#[test]
fn test_loss_params_serialization() {
    let params = LossParams {
        loss: "25".to_string(),
        correlation: Some("50".to_string()),
    };

    let json = serde_json::to_value(&params).unwrap();
    assert_eq!(json["loss"], "25");
    assert_eq!(json["correlation"], "50");
}

#[test]
fn test_bandwidth_params_serialization() {
    let params = BandwidthParams {
        rate: "1mbps".to_string(),
        buffer: Some(10000),
        limit: Some(20000),
    };

    let json = serde_json::to_value(&params).unwrap();
    assert_eq!(json["rate"], "1mbps");
    assert_eq!(json["buffer"], 10000);
    assert_eq!(json["limit"], 20000);
}

#[test]
fn test_create_chaos_request_deserialization() {
    let json_str = r#"{
        "topology_id": "test-topology",
        "source_node_id": "node-1",
        "target_node_id": "node-2",
        "chaos_type": "delay",
        "direction": "to",
        "duration": "60s",
        "params": {"latency": "100ms", "jitter": "10ms"}
    }"#;

    let request: CreateChaosRequest = serde_json::from_str(json_str).unwrap();

    assert_eq!(request.topology_id, "test-topology");
    assert_eq!(request.source_node_id, "node-1");
    assert_eq!(request.target_node_id, Some("node-2".to_string()));
    assert_eq!(request.chaos_type, ChaosType::Delay);
    assert_eq!(request.duration, Some("60s".to_string()));
}

#[test]
fn test_create_chaos_request_minimal() {
    let json_str = r#"{
        "topology_id": "test-topology",
        "source_node_id": "node-1",
        "chaos_type": "partition",
        "params": {}
    }"#;

    let request: CreateChaosRequest = serde_json::from_str(json_str).unwrap();

    assert_eq!(request.topology_id, "test-topology");
    assert_eq!(request.source_node_id, "node-1");
    assert_eq!(request.target_node_id, None);
    assert_eq!(request.chaos_type, ChaosType::Partition);
    assert_eq!(request.duration, None);
}

#[test]
fn test_chaos_status_serialization() {
    let status = ChaosStatus {
        name: "ns-abc12345-cond1".to_string(),
        condition_id: "cond1".to_string(),
        chaos_type: ChaosType::Delay,
        phase: "Running".to_string(),
        target_pods: vec!["node-1".to_string(), "node-2".to_string()],
        message: Some("Chaos injected successfully".to_string()),
    };

    let json = serde_json::to_value(&status).unwrap();

    assert_eq!(json["name"], "ns-abc12345-cond1");
    assert_eq!(json["chaos_type"], "delay");
    assert_eq!(json["phase"], "Running");
    assert_eq!(json["target_pods"].as_array().unwrap().len(), 2);
}

#[test]
fn test_all_chaos_types_serializable() {
    let types = vec![
        ChaosType::Delay,
        ChaosType::Loss,
        ChaosType::Bandwidth,
        ChaosType::Corrupt,
        ChaosType::Duplicate,
        ChaosType::Partition,
    ];

    for chaos_type in types {
        let json = serde_json::to_value(&chaos_type).unwrap();
        let deserialized: ChaosType = serde_json::from_value(json).unwrap();
        assert_eq!(chaos_type, deserialized);
    }
}

#[test]
fn test_update_chaos_request() {
    let json_str = r#"{
        "direction": "both",
        "duration": "120s",
        "params": {"latency": "200ms"}
    }"#;

    let request: UpdateChaosRequest = serde_json::from_str(json_str).unwrap();

    assert!(matches!(request.direction, ChaosDirection::Both));
    assert_eq!(request.duration, Some("120s".to_string()));
}
