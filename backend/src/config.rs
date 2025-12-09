use anyhow::Result;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct Config {
    #[serde(default = "default_port")]
    pub port: u16,

    #[serde(default = "default_database_url")]
    pub database_url: String,

    #[serde(default = "default_kubeconfig")]
    pub kubeconfig: Option<String>,

    #[serde(default = "default_k8s_namespace_system")]
    pub k8s_namespace_system: String,

    #[serde(default = "default_k8s_namespace_sim")]
    pub k8s_namespace_sim: String,

    #[serde(default = "default_helm_namespace")]
    pub helm_namespace: Option<String>,
}

fn default_port() -> u16 {
    8080
}

fn default_database_url() -> String {
    "sqlite://networksim.db".to_string()
}

fn default_kubeconfig() -> Option<String> {
    None
}

fn default_k8s_namespace_system() -> String {
    "networksim-system".to_string()
}

fn default_k8s_namespace_sim() -> String {
    "networksim-sim".to_string()
}

fn default_helm_namespace() -> Option<String> {
    // Use the same namespace as the simulation for proper network policies
    Some(default_k8s_namespace_sim())
}

impl Config {
    pub fn load() -> Result<Self> {
        // Load .env file if it exists
        dotenvy::dotenv().ok();

        let config = config::Config::builder()
            .add_source(config::Environment::default())
            .build()?;

        let settings: Config = config
            .try_deserialize()
            .unwrap_or_else(|_| Config::default());

        Ok(settings)
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: default_port(),
            database_url: default_database_url(),
            kubeconfig: default_kubeconfig(),
            k8s_namespace_system: default_k8s_namespace_system(),
            k8s_namespace_sim: default_k8s_namespace_sim(),
            helm_namespace: default_helm_namespace(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.port, 8080);
        assert_eq!(config.database_url, "sqlite://networksim.db");
        assert_eq!(config.k8s_namespace_system, "networksim-system");
        assert_eq!(config.k8s_namespace_sim, "networksim-sim");
    }
}
