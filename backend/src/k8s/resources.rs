//! Kubernetes resource builders for NetworkSim
//! 
//! Functions to create Pod, Service, and NetworkPolicy specs from topology data

use k8s_openapi::api::core::v1::{
    Container, ContainerPort, EnvVar, Pod, PodSpec, ResourceRequirements, Service, ServicePort,
    ServiceSpec,
};
use k8s_openapi::api::networking::v1::{
    NetworkPolicy, NetworkPolicyIngressRule, NetworkPolicyPeer, NetworkPolicyPort,
    NetworkPolicySpec,
};
use k8s_openapi::apimachinery::pkg::api::resource::Quantity;
use k8s_openapi::apimachinery::pkg::apis::meta::v1::{LabelSelector, ObjectMeta};
use k8s_openapi::apimachinery::pkg::util::intstr::IntOrString;
use std::collections::BTreeMap;

use crate::models::{Node, NodeConfig};

/// Default container image for simulation nodes
pub const DEFAULT_NODE_IMAGE: &str = "alpine:3.18";

/// Create labels for a topology resource
pub fn topology_labels(topology_id: &str, node_id: &str) -> BTreeMap<String, String> {
    [
        ("app.kubernetes.io/managed-by".to_string(), "networksim".to_string()),
        ("networksim.io/topology".to_string(), topology_id.to_string()),
        ("networksim.io/node".to_string(), node_id.to_string()),
    ]
    .into_iter()
    .collect()
}

/// Create a Pod spec for a topology node
pub fn create_pod_spec(topology_id: &str, node: &Node) -> Pod {
    let labels = topology_labels(topology_id, &node.id);
    let image = node
        .config
        .image
        .clone()
        .unwrap_or_else(|| DEFAULT_NODE_IMAGE.to_string());

    // Build resource requirements
    let resources = build_resource_requirements(&node.config);

    // Build environment variables
    let env_vars = build_env_vars(&node.config, &node.name, topology_id);

    // DNS-safe name: prefix with 'ns-' and use short topology id
    let short_id = &topology_id[..8.min(topology_id.len())];
    let pod_name = format!("ns-{}-{}", short_id, node.id).to_lowercase();

    Pod {
        metadata: ObjectMeta {
            name: Some(pod_name),
            namespace: Some("networksim-sim".to_string()),
            labels: Some(labels.clone()),
            annotations: Some(
                [
                    ("networksim.io/node-name".to_string(), node.name.clone()),
                    ("networksim.io/node-type".to_string(), node.node_type.to_string()),
                ]
                .into_iter()
                .collect(),
            ),
            ..Default::default()
        },
        spec: Some(PodSpec {
            containers: vec![Container {
                name: "main".to_string(),
                image: Some(image),
                image_pull_policy: Some("IfNotPresent".to_string()),
                // Keep the container running with a sleep command
                command: Some(vec!["/bin/sh".to_string()]),
                args: Some(vec![
                    "-c".to_string(),
                    "trap 'exit 0' TERM; while true; do sleep 1; done".to_string(),
                ]),
                resources: Some(resources),
                env: Some(env_vars),
                ports: Some(vec![
                    ContainerPort {
                        container_port: 8080,
                        name: Some("http".to_string()),
                        protocol: Some("TCP".to_string()),
                        ..Default::default()
                    },
                ]),
                ..Default::default()
            }],
            restart_policy: Some("Always".to_string()),
            // Use host networking for simplicity in simulation
            // In production, would use CNI plugin for proper network simulation
            dns_policy: Some("ClusterFirst".to_string()),
            ..Default::default()
        }),
        ..Default::default()
    }
}

/// Build resource requirements from node config
fn build_resource_requirements(config: &NodeConfig) -> ResourceRequirements {
    let mut limits = BTreeMap::new();
    let mut requests = BTreeMap::new();

    // CPU
    let cpu = config.cpu.clone().unwrap_or_else(|| "100m".to_string());
    limits.insert("cpu".to_string(), Quantity(cpu.clone()));
    requests.insert("cpu".to_string(), Quantity(cpu));

    // Memory
    let memory = config.memory.clone().unwrap_or_else(|| "128Mi".to_string());
    limits.insert("memory".to_string(), Quantity(memory.clone()));
    requests.insert("memory".to_string(), Quantity(memory));

    ResourceRequirements {
        limits: Some(limits),
        requests: Some(requests),
        ..Default::default()
    }
}

/// Build environment variables from node config
fn build_env_vars(config: &NodeConfig, node_name: &str, topology_id: &str) -> Vec<EnvVar> {
    let mut env_vars = vec![
        EnvVar {
            name: "NODE_NAME".to_string(),
            value: Some(node_name.to_string()),
            ..Default::default()
        },
        EnvVar {
            name: "TOPOLOGY_ID".to_string(),
            value: Some(topology_id.to_string()),
            ..Default::default()
        },
    ];

    // Add custom environment variables from config
    if let Some(custom_env) = &config.env {
        for env in custom_env {
            env_vars.push(EnvVar {
                name: env.name.clone(),
                value: Some(env.value.clone()),
                ..Default::default()
            });
        }
    }

    env_vars
}

/// Create a ClusterIP Service for a node (for inter-node communication)
pub fn create_service(topology_id: &str, node: &Node) -> Service {
    let labels = topology_labels(topology_id, &node.id);

    // DNS-safe name: prefix with 'ns-' and use short topology id
    let short_id = &topology_id[..8.min(topology_id.len())];
    let svc_name = format!("ns-{}-{}", short_id, node.id).to_lowercase();

    Service {
        metadata: ObjectMeta {
            name: Some(svc_name),
            namespace: Some("networksim-sim".to_string()),
            labels: Some(labels.clone()),
            ..Default::default()
        },
        spec: Some(ServiceSpec {
            selector: Some(labels),
            ports: Some(vec![ServicePort {
                name: Some("http".to_string()),
                port: 8080,
                target_port: Some(IntOrString::Int(8080)),
                protocol: Some("TCP".to_string()),
                ..Default::default()
            }]),
            type_: Some("ClusterIP".to_string()),
            ..Default::default()
        }),
        ..Default::default()
    }
}

/// Create a NetworkPolicy that allows traffic only between connected nodes
/// 
/// This implements the topology links as network policies:
/// - Each node gets a policy that allows ingress only from nodes it's connected to
/// - If a node has no links, it can only receive traffic from itself
pub fn create_network_policy(
    topology_id: &str,
    node: &Node,
    connected_node_ids: &[String],
) -> NetworkPolicy {
    let labels = topology_labels(topology_id, &node.id);

    // DNS-safe name: prefix with 'ns-' and use short topology id
    let short_id = &topology_id[..8.min(topology_id.len())];
    let policy_name = format!("ns-{}-{}-netpol", short_id, node.id).to_lowercase();

    // Build ingress rules - allow traffic from connected nodes
    let ingress_rules = if connected_node_ids.is_empty() {
        // No connections - only allow traffic from same pod
        vec![]
    } else {
        // Allow traffic from each connected node
        let peers: Vec<NetworkPolicyPeer> = connected_node_ids
            .iter()
            .map(|connected_id| NetworkPolicyPeer {
                pod_selector: Some(LabelSelector {
                    match_labels: Some(
                        [("networksim.io/node".to_string(), connected_id.clone())]
                            .into_iter()
                            .collect(),
                    ),
                    ..Default::default()
                }),
                namespace_selector: Some(LabelSelector {
                    match_labels: Some(
                        [("networksim.io/type".to_string(), "simulation".to_string())]
                            .into_iter()
                            .collect(),
                    ),
                    ..Default::default()
                }),
                ..Default::default()
            })
            .collect();

        vec![NetworkPolicyIngressRule {
            from: Some(peers),
            ports: Some(vec![NetworkPolicyPort {
                port: Some(IntOrString::Int(8080)),
                protocol: Some("TCP".to_string()),
                ..Default::default()
            }]),
        }]
    };

    NetworkPolicy {
        metadata: ObjectMeta {
            name: Some(policy_name),
            namespace: Some("networksim-sim".to_string()),
            labels: Some(labels.clone()),
            ..Default::default()
        },
        spec: Some(NetworkPolicySpec {
            pod_selector: LabelSelector {
                match_labels: Some(
                    [("networksim.io/node".to_string(), node.id.clone())]
                        .into_iter()
                        .collect(),
                ),
                ..Default::default()
            },
            ingress: Some(ingress_rules),
            policy_types: Some(vec!["Ingress".to_string()]),
            ..Default::default()
        }),
    }
}

/// Get node IDs that are connected to a given node based on links
pub fn get_connected_nodes(node_id: &str, links: &[(String, String, String)]) -> Vec<String> {
    links
        .iter()
        .filter_map(|(_, source, target)| {
            if source == node_id {
                Some(target.clone())
            } else if target == node_id {
                Some(source.clone())
            } else {
                None
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::NodeType;

    fn create_test_node() -> Node {
        Node {
            id: "node-1".to_string(),
            name: "Test Node".to_string(),
            node_type: NodeType::Server,
            position: crate::models::Position { x: 100.0, y: 100.0 },
            config: NodeConfig::default(),
        }
    }

    #[test]
    fn test_topology_labels() {
        let labels = topology_labels("topo-123", "node-1");
        
        assert_eq!(labels.get("networksim.io/topology"), Some(&"topo-123".to_string()));
        assert_eq!(labels.get("networksim.io/node"), Some(&"node-1".to_string()));
        assert_eq!(labels.get("app.kubernetes.io/managed-by"), Some(&"networksim".to_string()));
    }

    #[test]
    fn test_create_pod_spec() {
        let node = create_test_node();
        let pod = create_pod_spec("topo-123", &node);

        // DNS-safe name with ns- prefix and short topology id
        assert_eq!(pod.metadata.name, Some("ns-topo-123-node-1".to_string()));
        assert_eq!(pod.metadata.namespace, Some("networksim-sim".to_string()));
        
        let spec = pod.spec.unwrap();
        assert_eq!(spec.containers.len(), 1);
        assert_eq!(spec.containers[0].name, "main");
        assert_eq!(spec.containers[0].image, Some(DEFAULT_NODE_IMAGE.to_string()));
    }

    #[test]
    fn test_create_pod_with_custom_image() {
        let mut node = create_test_node();
        node.config.image = Some("nginx:latest".to_string());
        
        let pod = create_pod_spec("topo-123", &node);
        let spec = pod.spec.unwrap();
        
        assert_eq!(spec.containers[0].image, Some("nginx:latest".to_string()));
    }

    #[test]
    fn test_create_service() {
        let node = create_test_node();
        let service = create_service("topo-123", &node);

        // DNS-safe name with ns- prefix
        assert_eq!(service.metadata.name, Some("ns-topo-123-node-1".to_string()));
        
        let spec = service.spec.unwrap();
        assert_eq!(spec.type_, Some("ClusterIP".to_string()));
    }

    #[test]
    fn test_get_connected_nodes() {
        let links = vec![
            ("link-1".to_string(), "node-1".to_string(), "node-2".to_string()),
            ("link-2".to_string(), "node-1".to_string(), "node-3".to_string()),
            ("link-3".to_string(), "node-2".to_string(), "node-3".to_string()),
        ];

        let connected = get_connected_nodes("node-1", &links);
        assert_eq!(connected.len(), 2);
        assert!(connected.contains(&"node-2".to_string()));
        assert!(connected.contains(&"node-3".to_string()));

        let connected_2 = get_connected_nodes("node-2", &links);
        assert_eq!(connected_2.len(), 2);
        assert!(connected_2.contains(&"node-1".to_string()));
        assert!(connected_2.contains(&"node-3".to_string()));
    }

    #[test]
    fn test_create_network_policy() {
        let node = create_test_node();
        let connected = vec!["node-2".to_string(), "node-3".to_string()];
        
        let policy = create_network_policy("topo-123", &node, &connected);
        
        // DNS-safe name with ns- prefix
        assert_eq!(policy.metadata.name, Some("ns-topo-123-node-1-netpol".to_string()));
        
        let spec = policy.spec.unwrap();
        assert_eq!(spec.policy_types, Some(vec!["Ingress".to_string()]));
        
        let ingress = spec.ingress.unwrap();
        assert_eq!(ingress.len(), 1);
        assert_eq!(ingress[0].from.as_ref().unwrap().len(), 2);
    }
}
