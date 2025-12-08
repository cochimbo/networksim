//! Chaos Engineering module for NetworkSim
//!
//! Integrates with Chaos Mesh to inject network conditions like:
//! - Latency (delay)
//! - Packet loss
//! - Bandwidth limiting
//! - Packet corruption
//! - Network partition

mod client;
mod conditions;
mod types;

pub use client::ChaosClient;
pub use conditions::{create_network_chaos, ChaosAction};
pub use types::*;
