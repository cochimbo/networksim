//! Topology Templates API
//!
//! Provides predefined topology templates for common architectures

use axum::{extract::Path, Json};
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

use crate::error::AppResult;
use crate::models::{Link, LinkProperties, Node, NodeConfig, Position};

/// A topology template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopologyTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub icon: String,
    pub node_count: usize,
    pub preview: TemplatePreview,
}

/// Preview data for a template (nodes and links without IDs)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplatePreview {
    pub nodes: Vec<TemplateNode>,
    pub links: Vec<TemplateLink>,
}

/// A node in a template (without generated ID)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateNode {
    pub name: String,
    pub position: Position,
    #[serde(default)]
    pub config: NodeConfig,
}

/// A link in a template (using node indices)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateLink {
    pub source_index: usize,
    pub target_index: usize,
    #[serde(default)]
    pub properties: LinkProperties,
}

/// Response with generated nodes and links (with UUIDs)
#[derive(Debug, Serialize)]
pub struct GeneratedTopology {
    pub name: String,
    pub description: String,
    pub nodes: Vec<Node>,
    pub links: Vec<Link>,
}

/// List all available templates
#[utoipa::path(
    get,
    path = "/api/templates",
    tag = "templates",
    responses(
        (status = 200, description = "List of available templates")
    )
)]
pub async fn list() -> Json<Vec<TopologyTemplate>> {
    Json(get_all_templates())
}

/// Get a specific template by ID
#[utoipa::path(
    get,
    path = "/api/templates/{template_id}",
    tag = "templates",
    params(
        ("template_id" = String, Path, description = "Template ID")
    ),
    responses(
        (status = 200, description = "Template details"),
        (status = 404, description = "Template not found")
    )
)]
pub async fn get(Path(template_id): Path<String>) -> AppResult<Json<TopologyTemplate>> {
    let templates = get_all_templates();
    let template = templates
        .into_iter()
        .find(|t| t.id == template_id)
        .ok_or_else(|| crate::error::AppError::not_found(&format!("Template {} not found", template_id)))?;
    Ok(Json(template))
}

/// Generate topology from a template
#[utoipa::path(
    post,
    path = "/api/templates/{template_id}/generate",
    tag = "templates",
    params(
        ("template_id" = String, Path, description = "Template ID")
    ),
    responses(
        (status = 200, description = "Generated topology data"),
        (status = 404, description = "Template not found")
    )
)]
pub async fn generate(Path(template_id): Path<String>) -> AppResult<Json<GeneratedTopology>> {
    let templates = get_all_templates();
    let template = templates
        .into_iter()
        .find(|t| t.id == template_id)
        .ok_or_else(|| crate::error::AppError::not_found(&format!("Template {} not found", template_id)))?;

    // Generate nodes with UUIDs
    let nodes: Vec<Node> = template
        .preview
        .nodes
        .iter()
        .map(|tn| Node {
            id: uuid::Uuid::new_v4().to_string(),
            name: tn.name.clone(),
            position: tn.position.clone(),
            config: tn.config.clone(),
        })
        .collect();

    // Generate links using the generated node IDs
    let links: Vec<Link> = template
        .preview
        .links
        .iter()
        .filter_map(|tl| {
            let source_id = nodes.get(tl.source_index)?.id.clone();
            let target_id = nodes.get(tl.target_index)?.id.clone();
            Some(Link {
                id: uuid::Uuid::new_v4().to_string(),
                source: source_id,
                target: target_id,
                properties: tl.properties.clone(),
            })
        })
        .collect();

    Ok(Json(GeneratedTopology {
        name: template.name.clone(),
        description: template.description.clone(),
        nodes,
        links,
    }))
}

/// Get all predefined templates
fn get_all_templates() -> Vec<TopologyTemplate> {
    vec![
        create_microservices_template(),
        create_three_tier_template(),
        create_star_template(),
        create_ring_template(),
        create_mesh_template(),
        create_pipeline_template(),
    ]
}

/// Microservices architecture template
fn create_microservices_template() -> TopologyTemplate {
    let nodes = vec![
        TemplateNode {
            name: "API Gateway".to_string(),
            position: Position { x: 400.0, y: 100.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "Auth Service".to_string(),
            position: Position { x: 200.0, y: 250.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "User Service".to_string(),
            position: Position { x: 400.0, y: 250.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "Order Service".to_string(),
            position: Position { x: 600.0, y: 250.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "Product Service".to_string(),
            position: Position { x: 300.0, y: 400.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "Payment Service".to_string(),
            position: Position { x: 500.0, y: 400.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "Notification Service".to_string(),
            position: Position { x: 700.0, y: 400.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "Database".to_string(),
            position: Position { x: 400.0, y: 550.0 },
            config: NodeConfig::default(),
        },
    ];

    let links = vec![
        // Gateway connections
        TemplateLink { source_index: 0, target_index: 1, properties: LinkProperties::default() },
        TemplateLink { source_index: 0, target_index: 2, properties: LinkProperties::default() },
        TemplateLink { source_index: 0, target_index: 3, properties: LinkProperties::default() },
        // Service interconnections
        TemplateLink { source_index: 2, target_index: 1, properties: LinkProperties::default() },
        TemplateLink { source_index: 3, target_index: 4, properties: LinkProperties::default() },
        TemplateLink { source_index: 3, target_index: 5, properties: LinkProperties::default() },
        TemplateLink { source_index: 3, target_index: 6, properties: LinkProperties::default() },
        TemplateLink { source_index: 5, target_index: 6, properties: LinkProperties::default() },
        // Database connections
        TemplateLink { source_index: 2, target_index: 7, properties: LinkProperties::default() },
        TemplateLink { source_index: 3, target_index: 7, properties: LinkProperties::default() },
        TemplateLink { source_index: 4, target_index: 7, properties: LinkProperties::default() },
    ];

    TopologyTemplate {
        id: "microservices".to_string(),
        name: "Microservices".to_string(),
        description: "E-commerce style microservices with API gateway, auth, and multiple services".to_string(),
        category: "architecture".to_string(),
        icon: "grid-3x3".to_string(),
        node_count: nodes.len(),
        preview: TemplatePreview { nodes, links },
    }
}

/// Three-tier architecture template
fn create_three_tier_template() -> TopologyTemplate {
    let nodes = vec![
        TemplateNode {
            name: "Load Balancer".to_string(),
            position: Position { x: 400.0, y: 80.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "Web Server 1".to_string(),
            position: Position { x: 250.0, y: 200.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "Web Server 2".to_string(),
            position: Position { x: 550.0, y: 200.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "App Server 1".to_string(),
            position: Position { x: 250.0, y: 350.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "App Server 2".to_string(),
            position: Position { x: 550.0, y: 350.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "Database Primary".to_string(),
            position: Position { x: 300.0, y: 500.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "Database Replica".to_string(),
            position: Position { x: 500.0, y: 500.0 },
            config: NodeConfig::default(),
        },
    ];

    let links = vec![
        // Load balancer to web servers
        TemplateLink { source_index: 0, target_index: 1, properties: LinkProperties::default() },
        TemplateLink { source_index: 0, target_index: 2, properties: LinkProperties::default() },
        // Web servers to app servers
        TemplateLink { source_index: 1, target_index: 3, properties: LinkProperties::default() },
        TemplateLink { source_index: 1, target_index: 4, properties: LinkProperties::default() },
        TemplateLink { source_index: 2, target_index: 3, properties: LinkProperties::default() },
        TemplateLink { source_index: 2, target_index: 4, properties: LinkProperties::default() },
        // App servers to databases
        TemplateLink { source_index: 3, target_index: 5, properties: LinkProperties::default() },
        TemplateLink { source_index: 4, target_index: 5, properties: LinkProperties::default() },
        // Database replication
        TemplateLink { source_index: 5, target_index: 6, properties: LinkProperties::default() },
    ];

    TopologyTemplate {
        id: "three-tier".to_string(),
        name: "3-Tier Application".to_string(),
        description: "Classic three-tier architecture with load balancer, web/app servers, and database".to_string(),
        category: "architecture".to_string(),
        icon: "layers".to_string(),
        node_count: nodes.len(),
        preview: TemplatePreview { nodes, links },
    }
}

/// Star topology template
fn create_star_template() -> TopologyTemplate {
    let center = Position { x: 400.0, y: 300.0 };
    let radius = 180.0;
    let satellite_count = 6;

    let mut nodes = vec![TemplateNode {
        name: "Central Hub".to_string(),
        position: center.clone(),
        config: NodeConfig::default(),
    }];

    // Create satellite nodes in a circle
    for i in 0..satellite_count {
        let angle = (i as f64) * 2.0 * PI / (satellite_count as f64);
        nodes.push(TemplateNode {
            name: format!("Node {}", i + 1),
            position: Position {
                x: center.x + radius * angle.cos(),
                y: center.y + radius * angle.sin(),
            },
            config: NodeConfig::default(),
        });
    }

    // All satellites connect to center
    let links: Vec<TemplateLink> = (1..=satellite_count)
        .map(|i| TemplateLink {
            source_index: 0,
            target_index: i,
            properties: LinkProperties::default(),
        })
        .collect();

    TopologyTemplate {
        id: "star".to_string(),
        name: "Star Topology".to_string(),
        description: "Central hub with multiple connected nodes - good for testing single point of failure".to_string(),
        category: "topology".to_string(),
        icon: "star".to_string(),
        node_count: nodes.len(),
        preview: TemplatePreview { nodes, links },
    }
}

/// Ring topology template
fn create_ring_template() -> TopologyTemplate {
    let center = Position { x: 400.0, y: 300.0 };
    let radius = 180.0;
    let node_count = 6;

    let nodes: Vec<TemplateNode> = (0..node_count)
        .map(|i| {
            let angle = (i as f64) * 2.0 * PI / (node_count as f64) - PI / 2.0;
            TemplateNode {
                name: format!("Node {}", i + 1),
                position: Position {
                    x: center.x + radius * angle.cos(),
                    y: center.y + radius * angle.sin(),
                },
                config: NodeConfig::default(),
            }
        })
        .collect();

    // Each node connects to the next, forming a ring
    let links: Vec<TemplateLink> = (0..node_count)
        .map(|i| TemplateLink {
            source_index: i,
            target_index: (i + 1) % node_count,
            properties: LinkProperties::default(),
        })
        .collect();

    TopologyTemplate {
        id: "ring".to_string(),
        name: "Ring Topology".to_string(),
        description: "Circular topology where each node connects to two neighbors - tests cascade failures".to_string(),
        category: "topology".to_string(),
        icon: "circle".to_string(),
        node_count: nodes.len(),
        preview: TemplatePreview { nodes, links },
    }
}

/// Full mesh topology template
fn create_mesh_template() -> TopologyTemplate {
    let center = Position { x: 400.0, y: 300.0 };
    let radius = 180.0;
    let node_count = 5;

    let nodes: Vec<TemplateNode> = (0..node_count)
        .map(|i| {
            let angle = (i as f64) * 2.0 * PI / (node_count as f64) - PI / 2.0;
            TemplateNode {
                name: format!("Node {}", i + 1),
                position: Position {
                    x: center.x + radius * angle.cos(),
                    y: center.y + radius * angle.sin(),
                },
                config: NodeConfig::default(),
            }
        })
        .collect();

    // Every node connects to every other node
    let mut links = Vec::new();
    for i in 0..node_count {
        for j in (i + 1)..node_count {
            links.push(TemplateLink {
                source_index: i,
                target_index: j,
                properties: LinkProperties::default(),
            });
        }
    }

    TopologyTemplate {
        id: "mesh".to_string(),
        name: "Full Mesh".to_string(),
        description: "Every node connected to every other node - high redundancy, complex failure scenarios".to_string(),
        category: "topology".to_string(),
        icon: "share-2".to_string(),
        node_count: nodes.len(),
        preview: TemplatePreview { nodes, links },
    }
}

/// Pipeline/chain topology template
fn create_pipeline_template() -> TopologyTemplate {
    let nodes = vec![
        TemplateNode {
            name: "Ingress".to_string(),
            position: Position { x: 150.0, y: 300.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "Validator".to_string(),
            position: Position { x: 300.0, y: 300.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "Processor".to_string(),
            position: Position { x: 450.0, y: 300.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "Enricher".to_string(),
            position: Position { x: 600.0, y: 300.0 },
            config: NodeConfig::default(),
        },
        TemplateNode {
            name: "Output".to_string(),
            position: Position { x: 750.0, y: 300.0 },
            config: NodeConfig::default(),
        },
    ];

    let links = vec![
        TemplateLink { source_index: 0, target_index: 1, properties: LinkProperties::default() },
        TemplateLink { source_index: 1, target_index: 2, properties: LinkProperties::default() },
        TemplateLink { source_index: 2, target_index: 3, properties: LinkProperties::default() },
        TemplateLink { source_index: 3, target_index: 4, properties: LinkProperties::default() },
    ];

    TopologyTemplate {
        id: "pipeline".to_string(),
        name: "Data Pipeline".to_string(),
        description: "Linear data processing pipeline - tests sequential failure propagation".to_string(),
        category: "architecture".to_string(),
        icon: "arrow-right".to_string(),
        node_count: nodes.len(),
        preview: TemplatePreview { nodes, links },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_templates_valid() {
        let templates = get_all_templates();
        assert!(!templates.is_empty());

        for template in templates {
            assert!(!template.id.is_empty());
            assert!(!template.name.is_empty());
            assert_eq!(template.node_count, template.preview.nodes.len());

            // Verify all link indices are valid
            for link in &template.preview.links {
                assert!(link.source_index < template.preview.nodes.len());
                assert!(link.target_index < template.preview.nodes.len());
            }
        }
    }
}
