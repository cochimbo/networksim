//! Kubernetes client wrapper for NetworkSim

use anyhow::Result;
use k8s_openapi::api::core::v1::{Namespace, Pod, Service};
use k8s_openapi::api::networking::v1::NetworkPolicy;
use kube::{
    api::{Api, DeleteParams, ListParams, PostParams},
    Client, Config,
};
use tracing::{info, instrument};

/// Wrapper around kube::Client with helper methods for NetworkSim operations
#[derive(Clone)]
pub struct K8sClient {
    client: Client,
    namespace: String,
}

impl K8sClient {
    /// Create a new K8sClient using the default kubeconfig or in-cluster config
    #[instrument(skip_all)]
    pub async fn new() -> Result<Self> {
        let config = Config::infer().await?;
        let client = Client::try_from(config)?;

        info!("Connected to Kubernetes cluster");

        Ok(Self {
            client,
            namespace: "networksim-sim".to_string(),
        })
    }

    /// Create a K8sClient with a specific namespace
    pub async fn with_namespace(namespace: &str) -> Result<Self> {
        let mut client = Self::new().await?;
        client.namespace = namespace.to_string();
        Ok(client)
    }

    /// Get the namespace this client operates in
    pub fn namespace(&self) -> &str {
        &self.namespace
    }

    /// Get the inner kube Client
    pub fn inner(&self) -> &Client {
        &self.client
    }

    /// Ensure the simulation namespace exists
    #[instrument(skip(self))]
    pub async fn ensure_namespace(&self) -> Result<()> {
        let namespaces: Api<Namespace> = Api::all(self.client.clone());

        let ns = Namespace {
            metadata: k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta {
                name: Some(self.namespace.clone()),
                labels: Some(
                    [
                        (
                            "app.kubernetes.io/managed-by".to_string(),
                            "networksim".to_string(),
                        ),
                        ("networksim.io/type".to_string(), "simulation".to_string()),
                    ]
                    .into_iter()
                    .collect(),
                ),
                ..Default::default()
            },
            ..Default::default()
        };

        match namespaces.create(&PostParams::default(), &ns).await {
            Ok(_) => {
                info!(namespace = %self.namespace, "Created namespace");
            }
            Err(kube::Error::Api(e)) if e.code == 409 => {
                // Already exists, that's fine
                info!(namespace = %self.namespace, "Namespace already exists");
            }
            Err(e) => return Err(e.into()),
        }

        Ok(())
    }

    /// Get a typed API for pods in the simulation namespace
    pub fn pods(&self) -> Api<Pod> {
        Api::namespaced(self.client.clone(), &self.namespace)
    }

    /// Get a typed API for services in the simulation namespace
    pub fn services(&self) -> Api<Service> {
        Api::namespaced(self.client.clone(), &self.namespace)
    }

    /// Get a typed API for network policies in the simulation namespace
    pub fn network_policies(&self) -> Api<NetworkPolicy> {
        Api::namespaced(self.client.clone(), &self.namespace)
    }

    /// Create a pod
    #[instrument(skip(self, pod), fields(pod_name = %pod.metadata.name.as_deref().unwrap_or("unknown")))]
    pub async fn create_pod(&self, pod: &Pod) -> Result<Pod> {
        let pods = self.pods();
        let created = pods.create(&PostParams::default(), pod).await?;
        info!("Created pod");
        Ok(created)
    }

    /// Delete a pod
    #[instrument(skip(self))]
    pub async fn delete_pod(&self, name: &str) -> Result<()> {
        let pods = self.pods();
        pods.delete(name, &DeleteParams::default()).await?;
        info!(name, "Deleted pod");
        Ok(())
    }

    /// Get a pod by name
    pub async fn get_pod(&self, name: &str) -> Result<Pod> {
        let pods = self.pods();
        Ok(pods.get(name).await?)
    }

    /// List pods with a label selector
    pub async fn list_pods(&self, label_selector: &str) -> Result<Vec<Pod>> {
        let pods = self.pods();
        let list = pods
            .list(&ListParams::default().labels(label_selector))
            .await?;
        Ok(list.items)
    }

    /// Create a service
    #[instrument(skip(self, service), fields(service_name = %service.metadata.name.as_deref().unwrap_or("unknown")))]
    pub async fn create_service(&self, service: &Service) -> Result<Service> {
        let services = self.services();
        let created = services.create(&PostParams::default(), service).await?;
        info!("Created service");
        Ok(created)
    }

    /// Delete a service
    #[instrument(skip(self))]
    pub async fn delete_service(&self, name: &str) -> Result<()> {
        let services = self.services();
        services.delete(name, &DeleteParams::default()).await?;
        info!(name, "Deleted service");
        Ok(())
    }

    /// Create a network policy
    #[instrument(skip(self, policy), fields(policy_name = %policy.metadata.name.as_deref().unwrap_or("unknown")))]
    pub async fn create_network_policy(&self, policy: &NetworkPolicy) -> Result<NetworkPolicy> {
        let policies = self.network_policies();
        let created = policies.create(&PostParams::default(), policy).await?;
        info!("Created network policy");
        Ok(created)
    }

    /// Delete a network policy
    #[instrument(skip(self))]
    pub async fn delete_network_policy(&self, name: &str) -> Result<()> {
        let policies = self.network_policies();
        policies.delete(name, &DeleteParams::default()).await?;
        info!(name, "Deleted network policy");
        Ok(())
    }

    /// Delete all resources for a topology deployment
    #[instrument(skip(self))]
    pub async fn cleanup_deployment(&self, topology_id: &str) -> Result<()> {
        let label_selector = format!("networksim.io/topology={}", topology_id);

        // Delete pods
        let pods = self.list_pods(&label_selector).await?;
        for pod in pods {
            if let Some(name) = pod.metadata.name {
                let _ = self.delete_pod(&name).await;
            }
        }

        // Delete services
        let services = self.services();
        let svc_list = services
            .list(&ListParams::default().labels(&label_selector))
            .await?;
        for svc in svc_list.items {
            if let Some(name) = svc.metadata.name {
                let _ = self.delete_service(&name).await;
            }
        }

        // Delete network policies
        let policies = self.network_policies();
        let policy_list = policies
            .list(&ListParams::default().labels(&label_selector))
            .await?;
        for policy in policy_list.items {
            if let Some(name) = policy.metadata.name {
                let _ = self.delete_network_policy(&name).await;
            }
        }

        info!(topology_id, "Cleaned up all deployment resources");
        Ok(())
    }

    /// Check if cluster is reachable
    pub async fn health_check(&self) -> Result<bool> {
        let version = self.client.apiserver_version().await?;
        info!(version = %version.git_version, "Kubernetes cluster is healthy");
        Ok(true)
    }
}
