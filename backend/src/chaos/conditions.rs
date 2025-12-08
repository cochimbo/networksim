//! Chaos Mesh condition builders
//!
//! Creates NetworkChaos CRD resources for different chaos types

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;

use super::types::*;

/// The Chaos Mesh NetworkChaos action
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChaosAction {
    Delay,
    Loss,
    Bandwidth,
    Corrupt,
    Duplicate,
    Partition,
}

impl From<&ChaosType> for ChaosAction {
    fn from(t: &ChaosType) -> Self {
        match t {
            ChaosType::Delay => ChaosAction::Delay,
            ChaosType::Loss => ChaosAction::Loss,
            ChaosType::Bandwidth => ChaosAction::Bandwidth,
            ChaosType::Corrupt => ChaosAction::Corrupt,
            ChaosType::Duplicate => ChaosAction::Duplicate,
            ChaosType::Partition => ChaosAction::Partition,
        }
    }
}

/// NetworkChaos spec structure matching Chaos Mesh CRD
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkChaosSpec {
    pub action: String,
    pub mode: String,
    pub selector: PodSelector,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<PodSelector>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delay: Option<DelaySpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loss: Option<LossSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bandwidth: Option<BandwidthSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub corrupt: Option<CorruptSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duplicate: Option<DuplicateSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodSelector {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub namespaces: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label_selectors: Option<BTreeMap<String, String>>,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DelaySpec {
    pub latency: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub jitter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LossSpec {
    pub loss: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BandwidthSpec {
    pub rate: String,
    pub buffer: u32,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorruptSpec {
    pub corrupt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateSpec {
    pub duplicate: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation: Option<String>,
}

/// Create a NetworkChaos manifest
pub fn create_network_chaos(
    name: &str,
    namespace: &str,
    topology_id: &str,
    source_node_id: &str,
    target_node_id: Option<&str>,
    chaos_type: &ChaosType,
    direction: &ChaosDirection,
    duration: Option<&str>,
    params: &serde_json::Value,
) -> serde_json::Value {
    let action = match chaos_type {
        ChaosType::Delay => "delay",
        ChaosType::Loss => "loss",
        ChaosType::Bandwidth => "bandwidth",
        ChaosType::Corrupt => "corrupt",
        ChaosType::Duplicate => "duplicate",
        ChaosType::Partition => "partition",
    };

    // Source selector
    let mut source_labels = BTreeMap::new();
    source_labels.insert("networksim.io/topology".to_string(), topology_id.to_string());
    source_labels.insert("networksim.io/node".to_string(), source_node_id.to_string());

    // Build spec based on chaos type
    let mut spec = json!({
        "action": action,
        "mode": "all",
        "selector": {
            "namespaces": [namespace],
            "labelSelectors": source_labels,
            "mode": "all"
        },
        "direction": direction.to_string()
    });

    // Add target if specified
    if let Some(target_id) = target_node_id {
        let mut target_labels = BTreeMap::new();
        target_labels.insert("networksim.io/topology".to_string(), topology_id.to_string());
        target_labels.insert("networksim.io/node".to_string(), target_id.to_string());
        
        // Chaos Mesh requires target.selector structure
        spec["target"] = json!({
            "selector": {
                "namespaces": [namespace],
                "labelSelectors": target_labels
            },
            "mode": "all"
        });
    }

    // Add duration if specified
    if let Some(dur) = duration {
        spec["duration"] = json!(dur);
    }

    // Add type-specific parameters
    match chaos_type {
        ChaosType::Delay => {
            let delay_params: DelayParams = serde_json::from_value(params.clone())
                .unwrap_or_else(|_| DelayParams {
                    latency: "100ms".to_string(),
                    jitter: None,
                    correlation: None,
                });
            let mut delay = json!({
                "latency": delay_params.latency
            });
            if let Some(jitter) = delay_params.jitter {
                delay["jitter"] = json!(jitter);
            }
            if let Some(corr) = delay_params.correlation {
                delay["correlation"] = json!(corr);
            }
            spec["delay"] = delay;
        }
        ChaosType::Loss => {
            let loss_params: LossParams = serde_json::from_value(params.clone())
                .unwrap_or_else(|_| LossParams {
                    loss: "10".to_string(),
                    correlation: None,
                });
            let mut loss = json!({
                "loss": loss_params.loss
            });
            if let Some(corr) = loss_params.correlation {
                loss["correlation"] = json!(corr);
            }
            spec["loss"] = loss;
        }
        ChaosType::Bandwidth => {
            let bw_params: BandwidthParams = serde_json::from_value(params.clone())
                .unwrap_or_else(|_| BandwidthParams {
                    rate: "1mbps".to_string(),
                    buffer: Some(10000),
                    limit: Some(10000),
                });
            spec["bandwidth"] = json!({
                "rate": bw_params.rate,
                "buffer": bw_params.buffer.unwrap_or(10000),
                "limit": bw_params.limit.unwrap_or(10000)
            });
        }
        ChaosType::Corrupt => {
            let corrupt_params: CorruptParams = serde_json::from_value(params.clone())
                .unwrap_or_else(|_| CorruptParams {
                    corrupt: "10".to_string(),
                    correlation: None,
                });
            let mut corrupt = json!({
                "corrupt": corrupt_params.corrupt
            });
            if let Some(corr) = corrupt_params.correlation {
                corrupt["correlation"] = json!(corr);
            }
            spec["corrupt"] = corrupt;
        }
        ChaosType::Duplicate => {
            let dup_params: DuplicateParams = serde_json::from_value(params.clone())
                .unwrap_or_else(|_| DuplicateParams {
                    duplicate: "10".to_string(),
                    correlation: None,
                });
            let mut dup = json!({
                "duplicate": dup_params.duplicate
            });
            if let Some(corr) = dup_params.correlation {
                dup["correlation"] = json!(corr);
            }
            spec["duplicate"] = dup;
        }
        ChaosType::Partition => {
            // Partition uses loss with 100%
            spec["action"] = json!("loss");
            spec["loss"] = json!({
                "loss": "100"
            });
        }
    }

    // Build the full NetworkChaos resource
    json!({
        "apiVersion": "chaos-mesh.org/v1alpha1",
        "kind": "NetworkChaos",
        "metadata": {
            "name": name,
            "namespace": namespace,
            "labels": {
                "app.kubernetes.io/managed-by": "networksim",
                "networksim.io/topology": topology_id,
                "networksim.io/chaos": "true"
            }
        },
        "spec": spec
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_delay_chaos() {
        let chaos = create_network_chaos(
            "test-delay",
            "networksim-sim",
            "topo-123",
            "node-1",
            Some("node-2"),
            &ChaosType::Delay,
            &ChaosDirection::To,
            Some("60s"),
            &json!({"latency": "200ms", "jitter": "50ms"}),
        );

        assert_eq!(chaos["kind"], "NetworkChaos");
        assert_eq!(chaos["spec"]["action"], "delay");
        assert_eq!(chaos["spec"]["delay"]["latency"], "200ms");
        assert_eq!(chaos["spec"]["delay"]["jitter"], "50ms");
        assert_eq!(chaos["spec"]["duration"], "60s");
    }

    #[test]
    fn test_create_loss_chaos() {
        let chaos = create_network_chaos(
            "test-loss",
            "networksim-sim",
            "topo-123",
            "node-1",
            None,
            &ChaosType::Loss,
            &ChaosDirection::Both,
            None,
            &json!({"loss": "25"}),
        );

        assert_eq!(chaos["spec"]["action"], "loss");
        assert_eq!(chaos["spec"]["loss"]["loss"], "25");
        assert_eq!(chaos["spec"]["direction"], "both");
    }

    #[test]
    fn test_create_partition_chaos() {
        let chaos = create_network_chaos(
            "test-partition",
            "networksim-sim",
            "topo-123",
            "node-1",
            Some("node-2"),
            &ChaosType::Partition,
            &ChaosDirection::Both,
            None,
            &json!({}),
        );

        // Partition is implemented as 100% loss
        assert_eq!(chaos["spec"]["action"], "loss");
        assert_eq!(chaos["spec"]["loss"]["loss"], "100");
    }
}
