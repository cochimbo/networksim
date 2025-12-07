use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A network topology containing nodes and links
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Topology {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub nodes: Vec<Node>,
    pub links: Vec<Link>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A node in the network topology
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub position: Position,
    #[serde(default)]
    pub config: NodeConfig,
}

/// Type of network node
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum NodeType {
    #[default]
    Server,
    Router,
    Client,
    Custom,
}

/// Position of a node on the canvas
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

/// Configuration for a node
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NodeConfig {
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub cpu: Option<String>,
    #[serde(default)]
    pub memory: Option<String>,
    #[serde(default)]
    pub env: Vec<EnvVar>,
}

/// Environment variable
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvVar {
    pub name: String,
    pub value: String,
}

/// A link between two nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Link {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(default)]
    pub properties: LinkProperties,
}

/// Properties of a link
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LinkProperties {
    #[serde(default)]
    pub bandwidth: Option<String>,
    #[serde(default)]
    pub latency: Option<String>,
}

/// Request to create a new topology
#[derive(Debug, Deserialize)]
pub struct CreateTopologyRequest {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub nodes: Vec<Node>,
    #[serde(default)]
    pub links: Vec<Link>,
}

/// Request to update an existing topology
#[derive(Debug, Deserialize)]
pub struct UpdateTopologyRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub nodes: Option<Vec<Node>>,
    #[serde(default)]
    pub links: Option<Vec<Link>>,
}

impl Topology {
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
    pub fn new(name: String, node_type: NodeType, x: f64, y: f64) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            node_type,
            position: Position { x, y },
            config: NodeConfig::default(),
        }
    }
}

impl Link {
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
        assert_eq!(topology.name, "Test");
        assert_eq!(topology.description, Some("Description".to_string()));
    }

    #[test]
    fn test_validate_topology() {
        let mut topology = Topology::new("Test".to_string(), None);

        // Empty topology is valid
        assert!(topology.validate().is_ok());

        // Add nodes
        let node1 = Node::new("Node1".to_string(), NodeType::Server, 0.0, 0.0);
        let node2 = Node::new("Node2".to_string(), NodeType::Client, 100.0, 100.0);
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

        let mut node1 = Node::new("Node1".to_string(), NodeType::Server, 0.0, 0.0);
        let mut node2 = Node::new("Node2".to_string(), NodeType::Client, 100.0, 100.0);

        // Force same ID
        node2.id = node1.id.clone();

        topology.nodes.push(node1);
        topology.nodes.push(node2);

        assert!(topology.validate().is_err());
    }
}
