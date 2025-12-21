//! Kubernetes resource builders for NetworkSim
//!
//! Functions to create Pod, Service, and NetworkPolicy specs from topology data

#![allow(clippy::items_after_test_module)]

use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::{
    Container, ContainerPort, EnvVar, Pod, PodSpec, ResourceRequirements, Service, ServicePort,
    ServiceSpec,
};
use k8s_openapi::api::networking::v1::{
    NetworkPolicy, NetworkPolicyEgressRule, NetworkPolicyIngressRule, NetworkPolicyPeer,
    NetworkPolicyPort, NetworkPolicySpec,
};
use k8s_openapi::apimachinery::pkg::api::resource::Quantity;
use k8s_openapi::apimachinery::pkg::apis::meta::v1::{LabelSelector, ObjectMeta};
use k8s_openapi::apimachinery::pkg::util::intstr::IntOrString;
use std::collections::BTreeMap;

use crate::models::{Node, NodeConfig, Application};

/// Default container image for simulation nodes
pub const DEFAULT_NODE_IMAGE: &str = "alpine:3.18";

/// Create labels for a topology resource
pub fn topology_labels(topology_id: &str, node_id: &str) -> BTreeMap<String, String> {
    [
        (
            "app.kubernetes.io/managed-by".to_string(),
            "networksim".to_string(),
        ),
        (
            "networksim.io/topology".to_string(),
            topology_id.to_string(),
        ),
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
    let env_vars = build_env_vars(&node.config, &node.id, topology_id);

    // DNS-safe name: prefix with 'ns-' and use short topology id
    let short_id = &topology_id[..8.min(topology_id.len())];
    let pod_name = format!("ns-{}-{}", short_id, node.id).to_lowercase();

    Pod {
        metadata: ObjectMeta {
            name: Some(pod_name),
            namespace: Some("networksim-sim".to_string()),
            labels: Some(labels.clone()),
            annotations: Some(
                [("networksim.io/node-name".to_string(), node.name.clone())]
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
                ports: Some(vec![ContainerPort {
                    container_port: 8080,
                    name: Some("http".to_string()),
                    protocol: Some("TCP".to_string()),
                    ..Default::default()
                }]),
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
/// - Each node gets a policy that allows egress only to nodes it's connected to
/// - DNS egress is always allowed for service discovery
/// - All protocols (TCP, UDP, ICMP) are controlled
/// - If a node has no links, it's isolated (only DNS egress allowed)
pub fn create_network_policy(
    topology_id: &str,
    node: &Node,
    connected_node_ids: &[String],
) -> NetworkPolicy {
    let labels = topology_labels(topology_id, &node.id);

    // DNS-safe name: prefix with 'ns-' and use short topology id
    let short_id = &topology_id[..8.min(topology_id.len())];
    let policy_name = format!("ns-{}-{}-netpol", short_id, node.id).to_lowercase();

    // Build peer list for connected nodes
    let connected_peers: Vec<NetworkPolicyPeer> = connected_node_ids
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

    // Build ingress rules - allow ALL traffic from connected nodes (TCP, UDP, ICMP)
    let ingress_rules = if connected_node_ids.is_empty() {
        // No connections - block all ingress
        vec![]
    } else {
        // Allow all traffic from connected nodes (no port restriction = all protocols)
        vec![NetworkPolicyIngressRule {
            from: Some(connected_peers.clone()),
            ports: None, // None = allow all ports and protocols including ICMP
        }]
    };

    // Build egress rules - allow traffic only to connected nodes + DNS
    let mut egress_rules = vec![];

    // Always allow DNS (UDP 53) for service discovery
    egress_rules.push(NetworkPolicyEgressRule {
        to: None, // Any destination
        ports: Some(vec![
            NetworkPolicyPort {
                port: Some(IntOrString::Int(53)),
                protocol: Some("UDP".to_string()),
                ..Default::default()
            },
            NetworkPolicyPort {
                port: Some(IntOrString::Int(53)),
                protocol: Some("TCP".to_string()),
                ..Default::default()
            },
        ]),
    });

    // Allow egress to connected nodes (all protocols)
    if !connected_node_ids.is_empty() {
        egress_rules.push(NetworkPolicyEgressRule {
            to: Some(connected_peers),
            ports: None, // None = allow all ports and protocols including ICMP
        });
    }

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
            egress: Some(egress_rules),
            policy_types: Some(vec!["Ingress".to_string(), "Egress".to_string()]),
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

    fn create_test_node() -> Node {
        Node {
            id: "node-1".to_string(),
            name: "Test Node".to_string(),
            position: crate::models::Position { x: 100.0, y: 100.0 },
            config: NodeConfig::default(),
        }
    }

    #[test]
    fn test_topology_labels() {
        let labels = topology_labels("topo-123", "node-1");

        assert_eq!(
            labels.get("networksim.io/topology"),
            Some(&"topo-123".to_string())
        );
        assert_eq!(
            labels.get("networksim.io/node"),
            Some(&"node-1".to_string())
        );
        assert_eq!(
            labels.get("app.kubernetes.io/managed-by"),
            Some(&"networksim".to_string())
        );
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
        assert_eq!(
            spec.containers[0].image,
            Some(DEFAULT_NODE_IMAGE.to_string())
        );
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
        assert_eq!(
            service.metadata.name,
            Some("ns-topo-123-node-1".to_string())
        );

        let spec = service.spec.unwrap();
        assert_eq!(spec.type_, Some("ClusterIP".to_string()));
    }

    #[test]
    fn test_get_connected_nodes() {
        let links = vec![
            (
                "link-1".to_string(),
                "node-1".to_string(),
                "node-2".to_string(),
            ),
            (
                "link-2".to_string(),
                "node-1".to_string(),
                "node-3".to_string(),
            ),
            (
                "link-3".to_string(),
                "node-2".to_string(),
                "node-3".to_string(),
            ),
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
        assert_eq!(
            policy.metadata.name,
            Some("ns-topo-123-node-1-netpol".to_string())
        );

        let spec = policy.spec.unwrap();
        assert_eq!(
            spec.policy_types,
            Some(vec!["Ingress".to_string(), "Egress".to_string()])
        );

        let ingress = spec.ingress.unwrap();
        assert_eq!(ingress.len(), 1);
        assert_eq!(ingress[0].from.as_ref().unwrap().len(), 2);
    }
}

/// Create a Pod spec for a topology node with applications as sidecars
pub fn create_pod_spec_with_applications(topology_id: &str, node: &Node, applications: &[Application]) -> Pod {
    let labels = topology_labels(topology_id, &node.id);
    let image = node
        .config
        .image
        .clone()
        .unwrap_or_else(|| DEFAULT_NODE_IMAGE.to_string());

    // Build resource requirements
    let resources = build_resource_requirements(&node.config);

    // Build environment variables
    let env_vars = build_env_vars(&node.config, &node.id, topology_id);

    // DNS-safe name: prefix with 'ns-' and use short topology id
    let short_id = &topology_id[..8.min(topology_id.len())];
    let pod_name = format!("ns-{}-{}", short_id, node.id).to_lowercase();

    // Create main container
    let mut containers = vec![Container {
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
        ports: Some(vec![ContainerPort {
            container_port: 8080,
            name: Some("http".to_string()),
            protocol: Some("TCP".to_string()),
            ..Default::default()
        }]),
        ..Default::default()
    }];

    // Add application containers as sidecars
    for app in applications {
        let app_container = create_application_container(app);
        containers.push(app_container);
    }

    Pod {
        metadata: ObjectMeta {
            name: Some(pod_name),
            namespace: Some("networksim-sim".to_string()),
            labels: Some(labels.clone()),
            annotations: Some(
                [("networksim.io/node-name".to_string(), node.id.clone())]
                    .into_iter()
                    .collect(),
            ),
            ..Default::default()
        },
        spec: Some(PodSpec {
            containers,
            restart_policy: Some("Always".to_string()),
            // Use host networking for simplicity in simulation
            // In production, would use CNI plugin for proper network simulation
            dns_policy: Some("ClusterFirst".to_string()),
            ..Default::default()
        }),
        ..Default::default()
    }
}

/// Parse volume configuration from app values and return (volumes, volume_mounts)
fn parse_volumes_from_app(app: &Application) -> (Vec<k8s_openapi::api::core::v1::Volume>, Vec<k8s_openapi::api::core::v1::VolumeMount>) {
    use k8s_openapi::api::core::v1::{Volume, VolumeMount, EmptyDirVolumeSource, HostPathVolumeSource, ConfigMapVolumeSource, SecretVolumeSource};

    let mut volumes = Vec::new();
    let mut volume_mounts = Vec::new();

    if let Some(values) = &app.values {
        if let Some(vol_array) = values.get("volumes").and_then(|v| v.as_array()) {
            for vol_config in vol_array {
                let name = vol_config.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let mount_path = vol_config.get("mountPath").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let vol_type = vol_config.get("type").and_then(|v| v.as_str()).unwrap_or("emptyDir");
                let source = vol_config.get("source").and_then(|v| v.as_str()).map(|s| s.to_string());
                let read_only = vol_config.get("readOnly").and_then(|v| v.as_bool()).unwrap_or(false);

                if name.is_empty() || mount_path.is_empty() {
                    tracing::warn!("Skipping volume with empty name or mountPath in app {}", app.id);
                    continue;
                }

                // Create volume based on type
                let volume = match vol_type {
                    "emptyDir" => Volume {
                        name: name.clone(),
                        empty_dir: Some(EmptyDirVolumeSource::default()),
                        ..Default::default()
                    },
                    "hostPath" => Volume {
                        name: name.clone(),
                        host_path: Some(HostPathVolumeSource {
                            path: source.clone().unwrap_or_else(|| mount_path.clone()),
                            type_: Some("DirectoryOrCreate".to_string()),
                        }),
                        ..Default::default()
                    },
                    "configMap" => Volume {
                        name: name.clone(),
                        config_map: Some(ConfigMapVolumeSource {
                            name: source.clone(),
                            ..Default::default()
                        }),
                        ..Default::default()
                    },
                    "secret" => Volume {
                        name: name.clone(),
                        secret: Some(SecretVolumeSource {
                            secret_name: source.clone(),
                            ..Default::default()
                        }),
                        ..Default::default()
                    },
                    _ => {
                        tracing::warn!("Unknown volume type '{}' for volume '{}' in app {}", vol_type, name, app.id);
                        continue;
                    }
                };

                volumes.push(volume);
                volume_mounts.push(VolumeMount {
                    name: name.clone(),
                    mount_path,
                    read_only: Some(read_only),
                    ..Default::default()
                });

                tracing::info!("Added volume '{}' ({}) for app {}", name, vol_type, app.id);
            }
        }
    }

    (volumes, volume_mounts)
}

/// Create a container spec for an application
pub fn create_application_container(app: &Application) -> Container {
    create_application_container_with_mounts(app, Vec::new())
}

/// Create a container spec for an application with volume mounts
pub fn create_application_container_with_mounts(app: &Application, volume_mounts: Vec<k8s_openapi::api::core::v1::VolumeMount>) -> Container {
    // Use image_name as the full image reference
    let image = app.image_name.clone();

    // Create environment variables for the application
    let mut env_vars = vec![
        EnvVar {
            name: "APPLICATION_NAME".to_string(),
            value: Some(app.image_name.clone()),
            ..Default::default()
        },
        EnvVar {
            name: "APPLICATION_CHART".to_string(),
            value: Some(app.image_name.clone()),
            ..Default::default()
        },
    ];

    // Add custom values as environment variables if they exist
    if let Some(values) = &app.values {
        // Build a set of existing env var NAMES to avoid overwriting defaults
        let mut existing_names: std::collections::HashSet<String> = std::collections::HashSet::new();
        for ev in &env_vars {
            existing_names.insert(ev.name.clone());
        }

        // Helper to sanitize and validate an env var name
        let sanitize_name = |s: &str| -> String {
            let mut out = s
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() || c == '_' { c.to_ascii_uppercase() } else { '_' })
                .collect::<String>();
            // If first char is a digit, prefix with '_'
            if out.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                out = format!("_{}", out);
            }
            out
        };

        // Support multiple shapes coming from the frontend:
        // - { "env": [ {"name":"FOO","value":"bar"}, ... ] }
        // - [ {"name":"FOO","value":"bar"}, ... ]
        // - { "FOO": "bar", ... }
        if let Some(env_array) = values.get("env").and_then(|v| v.as_array()) {
            for item in env_array {
                let raw_name = item.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let raw_value = item.get("value").and_then(|v| v.as_str()).unwrap_or("");
                let name = sanitize_name(raw_name);
                if name.is_empty() {
                    tracing::warn!("Skipping env var with empty name in app {}", app.id);
                    continue;
                }
                if existing_names.contains(&name) {
                    tracing::info!("Skipping env var '{}' for app {} to avoid overwriting existing variable", name, app.id);
                    continue;
                }
                existing_names.insert(name.clone());
                env_vars.push(EnvVar {
                    name,
                    value: Some(raw_value.to_string()),
                    ..Default::default()
                });
            }
        } else if let Some(arr) = values.as_array() {
            for item in arr {
                if let Some(raw_name) = item.get("name").and_then(|n| n.as_str()) {
                    let raw_value = item.get("value").and_then(|v| v.as_str()).unwrap_or("");
                    let name = sanitize_name(raw_name);
                    if name.is_empty() {
                        tracing::warn!("Skipping env var with empty name in app {}", app.id);
                        continue;
                    }
                    if existing_names.contains(&name) {
                        tracing::info!("Skipping env var '{}' for app {} to avoid overwriting existing variable", name, app.id);
                        continue;
                    }
                    existing_names.insert(name.clone());
                    env_vars.push(EnvVar {
                        name,
                        value: Some(raw_value.to_string()),
                        ..Default::default()
                    });
                }
            }
        } else if let Some(obj) = values.as_object() {
            for (key, value) in obj {
                let sval = if let Some(s) = value.as_str() { s.to_string() } else { value.to_string() };
                let name = sanitize_name(key);
                if name.is_empty() {
                    tracing::warn!("Skipping env var with empty name (key='{}') in app {}", key, app.id);
                    continue;
                }
                if existing_names.contains(&name) {
                    tracing::info!("Skipping env var '{}' (from key='{}') for app {} to avoid overwriting existing variable", name, key, app.id);
                    continue;
                }
                existing_names.insert(name.clone());
                env_vars.push(EnvVar {
                    name,
                    value: Some(sval),
                    ..Default::default()
                });
            }
        }
    }

    // Check if it's a base OS image that needs a keep-alive command
    // These images typically exit immediately if no command is provided
    let image_lower = image.to_lowercase();
    let needs_keep_alive = image_lower.contains("ubuntu") || 
                          image_lower.contains("alpine") || 
                          image_lower.contains("debian") || 
                          image_lower.contains("centos") || 
                          image_lower.contains("fedora") || 
                          image_lower.contains("busybox") ||
                          image_lower.contains("bash");

    let (command, args) = if needs_keep_alive {
        (
            Some(vec!["/bin/sh".to_string()]),
            Some(vec![
                "-c".to_string(),
                "trap 'exit 0' TERM; while true; do sleep 1; done".to_string(),
            ])
        )
    } else {
        (None, None)
    };

    Container {
        name: format!("app-{}", app.id.simple()),
        image: Some(image),
        image_pull_policy: Some("IfNotPresent".to_string()),
        command,
        args,
        env: Some(env_vars),
        volume_mounts: if volume_mounts.is_empty() { None } else { Some(volume_mounts) },
        // Basic resource limits for applications
        resources: Some(ResourceRequirements {
            limits: Some({
                let mut limits = BTreeMap::new();
                limits.insert("cpu".to_string(), Quantity("200m".to_string()));
                limits.insert("memory".to_string(), Quantity("256Mi".to_string()));
                limits
            }),
            requests: Some({
                let mut requests = BTreeMap::new();
                requests.insert("cpu".to_string(), Quantity("50m".to_string()));
                requests.insert("memory".to_string(), Quantity("64Mi".to_string()));
                requests
            }),
            ..Default::default()
        }),
        ..Default::default()
    }
}

/// Create a Deployment spec for an application
pub fn create_application_deployment(app: &Application, node_id: &str, topology_id: &str) -> Deployment {
    use k8s_openapi::api::apps::v1::{DeploymentSpec, DeploymentStrategy};
    use k8s_openapi::apimachinery::pkg::apis::meta::v1::LabelSelector;
    // Build a kubernetes-safe deployment name (max 63 chars)
    let deployment_name = make_deployment_name(&app.id.simple().to_string(), node_id);

    let mut labels = BTreeMap::new();
    labels.insert("app.kubernetes.io/name".to_string(), app.image_name.replace(":", "-"));
    labels.insert("app.kubernetes.io/managed-by".to_string(), "networksim".to_string());
    // Ensure the instance label is set so lookups by app.kubernetes.io/instance work
    labels.insert("app.kubernetes.io/instance".to_string(), deployment_name.clone());
    labels.insert("networksim.io/topology".to_string(), topology_id.to_string());
    labels.insert("networksim.io/node".to_string(), node_id.to_string());
    labels.insert("networksim.io/application".to_string(), app.id.to_string());

    // Parse volumes from app configuration
    let (volumes, volume_mounts) = parse_volumes_from_app(app);

    // Create container with volume mounts
    let app_container = create_application_container_with_mounts(app, volume_mounts);

    let pod_spec = PodSpec {
        containers: vec![app_container],
        volumes: if volumes.is_empty() { None } else { Some(volumes) },
        restart_policy: Some("Always".to_string()),
        ..Default::default()
    };
    
    let pod_template_spec = k8s_openapi::api::core::v1::PodTemplateSpec {
        metadata: Some(ObjectMeta {
            labels: Some(labels.clone()),
            ..Default::default()
        }),
        spec: Some(pod_spec),
    };
    
    let label_selector = LabelSelector {
        match_labels: Some(labels.clone()),
        ..Default::default()
    };
    
    let deployment_spec = DeploymentSpec {
        replicas: Some(1),
        selector: label_selector,
        template: pod_template_spec,
        strategy: Some(DeploymentStrategy {
            type_: Some("RollingUpdate".to_string()),
            ..Default::default()
        }),
        ..Default::default()
    };
    
    Deployment {
        metadata: ObjectMeta {
            name: Some(deployment_name),
            labels: Some(labels),
            ..Default::default()
        },
        spec: Some(deployment_spec),
        ..Default::default()
    }
}

/// Create a deployment name safe for Kubernetes label/value and resource name limits.
/// It will lowercase the input and truncate to 63 characters if necessary.
pub fn make_deployment_name(app_id_simple: &str, node_id: &str) -> String {
    let name = format!("app-{}-{}", app_id_simple, node_id).to_lowercase();
    if name.len() > 63 {
        name[..63].to_string()
    } else {
        name
    }
}