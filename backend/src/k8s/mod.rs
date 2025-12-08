//! Kubernetes integration module for NetworkSim
//! 
//! This module handles all interactions with the K3s cluster:
//! - Creating pods for topology nodes
//! - Managing network policies for node connectivity
//! - Deploying and destroying topologies
//! - Watching pod and chaos events in real-time

mod client;
mod deployment;
mod resources;
mod watcher;

pub use client::K8sClient;
pub use deployment::{DeploymentManager, DeploymentStatus, NodeStatus};
pub use resources::{create_pod_spec, create_network_policy, create_service};
pub use watcher::{start_pod_watcher, start_chaos_watcher};
