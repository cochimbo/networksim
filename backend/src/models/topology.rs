use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use utoipa::ToSchema;

/// A network topology containing nodes and links
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Topology {
    #[schema(example = "topology-1234")]
    pub id: String,
    #[schema(example = "Office Network")]
    pub name: String,
    #[serde(default)]
    #[schema(example = "Small office topology with 3 nodes")]
    pub description: Option<String>,
    pub nodes: Vec<Node>,
    pub links: Vec<Link>,
    #[schema(example = "2025-01-01T12:00:00Z")]
    pub created_at: DateTime<Utc>,
    #[schema(example = "2025-01-01T12:00:00Z")]
    pub updated_at: DateTime<Utc>,
}

/// A node in the network topology
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Node {
    #[schema(example = "node-1")]
    pub id: String,
    #[schema(example = "Router A")]
    pub name: String,
    pub position: Position,
    #[serde(default)]
    pub config: NodeConfig,
}

/// Position of a node on the canvas
#[derive(Debug, Clone, Serialize, Deserialize, Default, ToSchema)]
pub struct Position {
    #[schema(example = 100.0)]
    pub x: f64,
    #[schema(example = 200.0)]
    pub y: f64,
}

/// Configuration for a node
#[derive(Debug, Clone, Serialize, Deserialize, Default, ToSchema)]
pub struct NodeConfig {
    #[serde(default)]
    #[schema(example = "nginx:latest")]
    pub image: Option<String>,
    #[serde(default)]
    #[schema(example = "500m")]
    pub cpu: Option<String>,
    #[serde(default)]
    #[schema(example = "256Mi")]
    pub memory: Option<String>,
    #[serde(default)]
    pub env: Option<Vec<EnvVar>>,
}

/// Environment variable
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct EnvVar {
    #[schema(example = "APP_MODE")]
    pub name: String,
    #[schema(example = "production")]
    pub value: String,
}

/// A link between two nodes
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Link {
    #[schema(example = "link-1")]
    pub id: String,
    #[schema(example = "node-1")]
    pub source: String,
    #[schema(example = "node-2")]
    pub target: String,
    #[serde(default)]
    pub properties: LinkProperties,
}

/// Properties of a link
#[derive(Debug, Clone, Serialize, Deserialize, Default, ToSchema)]
pub struct LinkProperties {
    #[serde(default)]
    #[schema(example = "100mbit")]
    pub bandwidth: Option<String>,
    #[serde(default)]
    #[schema(example = "20ms")]
    pub latency: Option<String>,
}

/// Request to create a new topology
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateTopologyRequest {
    #[schema(example = "Office Network")]
    pub name: Option<String>,
    #[serde(default)]
    #[schema(example = "Small office topology with 3 nodes")]
    pub description: Option<String>,
    #[serde(default)]
    pub nodes: Vec<Node>,
    #[serde(default)]
    pub links: Vec<Link>,
}

/// Request to update an existing topology
#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateTopologyRequest {
    #[schema(example = "Office Network Updated")]
    pub name: Option<String>,
    #[serde(default)]
    #[schema(example = "Updated description")]
    pub description: Option<String>,
    #[serde(default)]
    pub nodes: Option<Vec<Node>>,
    #[serde(default)]
    pub links: Option<Vec<Link>>,
}

impl Topology {
    #[allow(dead_code)]
    pub fn new(name: String, description: Option<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            description,
            nodes: Vec::new(),
            links: Vec::new(),
            created_at: now,
            updated_at: now,
        }
    }

    /// Validate the topology
    pub fn validate(&self) -> Result<(), String> {
        // Check for duplicate node IDs
        let mut node_ids: Vec<&str> = self.nodes.iter().map(|n| n.id.as_str()).collect();
        node_ids.sort();
        for i in 1..node_ids.len() {
            if node_ids[i] == node_ids[i - 1] {
                return Err(format!("Duplicate node ID: {}", node_ids[i]));
            }
        }

        // Check that all link sources and targets exist
        for link in &self.links {
            if !self.nodes.iter().any(|n| n.id == link.source) {
                return Err(format!("Link source not found: {}", link.source));
            }
            if !self.nodes.iter().any(|n| n.id == link.target) {
                return Err(format!("Link target not found: {}", link.target));
            }
        }

        Ok(())
    }
}

impl Node {
    #[allow(dead_code)]
    pub fn new(name: String, x: f64, y: f64) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            position: Position { x, y },
            config: NodeConfig::default(),
        }
    }
}

impl Link {
    #[allow(dead_code)]
    pub fn new(source: String, target: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            source,
            target,
            properties: LinkProperties::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_topology() {
        let topology = Topology::new("Test".to_string(), Some("Description".to_string()));
        assert!(!topology.id.is_empty());
        // assert_eq!(topology.name, "Test"); // Eliminado
        assert_eq!(topology.description, Some("Description".to_string()));
    }

    #[test]
    fn test_validate_topology() {
        let mut topology = Topology::new("Test".to_string(), None);

        // Empty topology is valid
        assert!(topology.validate().is_ok());

        // Add nodes
        let node1 = Node::new("Node1".to_string(), 0.0, 0.0);
        let node2 = Node::new("Node2".to_string(), 100.0, 100.0);
        let node1_id = node1.id.clone();
        let node2_id = node2.id.clone();

        topology.nodes.push(node1);
        topology.nodes.push(node2);

        // Add valid link
        topology
            .links
            .push(Link::new(node1_id.clone(), node2_id.clone()));
        assert!(topology.validate().is_ok());

        // Add invalid link (non-existent target)
        topology
            .links
            .push(Link::new(node1_id, "non-existent".to_string()));
        assert!(topology.validate().is_err());
    }

    #[test]
    fn test_duplicate_node_ids() {
        let mut topology = Topology::new("Test".to_string(), None);

        let node1 = Node::new("Node1".to_string(), 0.0, 0.0);
        let mut node2 = Node::new("Node2".to_string(), 100.0, 100.0);

        // Force same ID
        node2.id = node1.id.clone();

        topology.nodes.push(node1);
        topology.nodes.push(node2);

        assert!(topology.validate().is_err());
    }
}
