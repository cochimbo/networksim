//! Kubernetes client wrapper for NetworkSim

use anyhow::Result;
use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::{Namespace, Pod, Service, PersistentVolumeClaim, ConfigMap};
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

    /// Get a typed API for deployments in the simulation namespace
    pub fn deployments(&self) -> Api<Deployment> {
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

    /// Get a pod by name in a specific namespace
    pub async fn get_pod_in_namespace(&self, name: &str, namespace: &str) -> Result<Pod> {
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), namespace);
        Ok(pods.get(name).await?)
    }

    /// Update a pod
    #[instrument(skip(self, pod), fields(pod_name = %pod.metadata.name.as_deref().unwrap_or("unknown")))]
    pub async fn update_pod(&self, pod: &Pod) -> Result<Pod> {
        let pods = self.pods();
        let updated = pods.replace(
            pod.metadata.name.as_deref().unwrap_or("unknown"),
            &kube::api::PostParams::default(),
            pod,
        ).await?;
        info!("Updated pod");
        Ok(updated)
    }

    /// Get logs from a specific container in a pod
    #[instrument(skip(self))]
    pub async fn get_container_logs(&self, pod_name: &str, container_name: &str, namespace: &str, tail_lines: usize) -> Result<String> {
        use kube::api::LogParams;
        
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), namespace);
        let log_params = LogParams {
            container: Some(container_name.to_string()),
            tail_lines: Some(tail_lines as i64),
            ..Default::default()
        };
        
        let logs = pods.logs(pod_name, &log_params).await?;
        Ok(logs)
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

    /// Create a deployment
    #[instrument(skip(self, deployment), fields(deployment_name = %deployment.metadata.name.as_deref().unwrap_or("unknown")))]
    pub async fn create_deployment(&self, deployment: &Deployment) -> Result<Deployment> {
        let deployments = self.deployments();
        let created = deployments.create(&PostParams::default(), deployment).await?;
        info!("Created deployment");
        Ok(created)
    }

    /// Delete a deployment
    #[instrument(skip(self))]
    pub async fn delete_deployment(&self, name: &str) -> Result<()> {
        let deployments = self.deployments();
        deployments.delete(name, &DeleteParams::default()).await?;
        info!(name, "Deleted deployment");
        Ok(())
    }

    /// Get a deployment by name
    pub async fn get_deployment(&self, name: &str) -> Result<Deployment> {
        let deployments = self.deployments();
        Ok(deployments.get(name).await?)
    }

    /// Check if a deployment exists
    pub async fn deployment_exists(&self, name: &str, namespace: &str) -> Result<bool> {
        let deployments: Api<Deployment> = Api::namespaced(self.client.clone(), namespace);
        match deployments.get(name).await {
            Ok(_) => Ok(true),
            Err(kube::Error::Api(e)) if e.code == 404 => Ok(false),
            Err(e) => Err(e.into()),
        }
    }

    /// Check if a deployment is ready
    pub async fn check_deployment_ready(&self, name: &str, namespace: &str) -> Result<bool> {
        let deployments: Api<Deployment> = Api::namespaced(self.client.clone(), namespace);
        let deployment = deployments.get(name).await?;
        let replicas = deployment.spec.as_ref().and_then(|s| s.replicas).unwrap_or(0);
        let ready_replicas = deployment.status.as_ref().and_then(|s| s.ready_replicas).unwrap_or(0);
        Ok(ready_replicas >= replicas && replicas > 0)
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

    /// Delete a secret
    #[instrument(skip(self))]
    pub async fn delete_secret(&self, name: &str, namespace: &str) -> Result<()> {
        use k8s_openapi::api::core::v1::Secret;
        let secrets: Api<Secret> = Api::namespaced(self.client.clone(), namespace);
        match secrets.delete(name, &DeleteParams::default()).await {
            Ok(_) => {
                info!(name, namespace, "Deleted secret");
                Ok(())
            }
            Err(kube::Error::Api(e)) if e.code == 404 => {
                // Secret doesn't exist, that's fine
                Ok(())
            }
            Err(e) => Err(e.into()),
        }
    }

    /// Delete all resources for a topology deployment
    #[instrument(skip(self))]
    pub async fn cleanup_deployment(&self, topology_id: &str) -> Result<()> {
        let label_selector = format!("networksim.io/topology={}", topology_id);

        // Delete deployments first (this will trigger pod deletion for managed pods)
        let deployments = self.deployments();
        let deploy_list = deployments
            .list(&ListParams::default().labels(&label_selector))
            .await?;
        for deploy in deploy_list.items {
            if let Some(name) = deploy.metadata.name {
                let _ = self.delete_deployment(&name).await;
            }
        }

        // Delete pods (for unmanaged pods or to speed up deletion)
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

    /// Check if all containers in a pod are running
    #[instrument(skip(self))]
    pub async fn check_pod_containers_running(&self, pod_name: &str, namespace: &str) -> Result<bool> {
        let pod = self.get_pod_in_namespace(pod_name, namespace).await?;
        
        // Check if pod is in Running phase
        if pod.status.as_ref().and_then(|s| s.phase.as_ref()) != Some(&"Running".to_string()) {
            return Ok(false);
        }
        
        // Check if all containers are ready
        if let Some(status) = &pod.status {
            if let Some(container_statuses) = &status.container_statuses {
                for container_status in container_statuses {
                    if !container_status.ready {
                        return Ok(false);
                    }
                    // Also check if container is in running state
                    if let Some(state) = &container_status.state {
                        if state.running.is_none() {
                            return Ok(false);
                        }
                    }
                }
            }
        }
        
        Ok(true)
    }

    /// Check if cluster is reachable
    pub async fn health_check(&self) -> Result<bool> {
        let version = self.client.apiserver_version().await?;
        info!(version = %version.git_version, "Kubernetes cluster is healthy");
        Ok(true)
    }

    /// Access PVCs API
    fn pvcs(&self) -> Api<PersistentVolumeClaim> {
        Api::namespaced(self.client.clone(), &self.namespace)
    }

    /// Create a PersistentVolumeClaim
    #[instrument(skip(self, pvc), fields(pvc_name = %pvc.metadata.name.as_deref().unwrap_or("unknown")))]
    pub async fn create_pvc(&self, pvc: &PersistentVolumeClaim) -> Result<PersistentVolumeClaim> {
        let pvcs = self.pvcs();
        let created = pvcs.create(&PostParams::default(), pvc).await?;
        info!("Created PVC");
        Ok(created)
    }

    /// Check if PVC exists
    pub async fn pvc_exists(&self, name: &str) -> Result<bool> {
        let pvcs = self.pvcs();
        match pvcs.get(name).await {
            Ok(_) => Ok(true),
            Err(kube::Error::Api(ae)) if ae.code == 404 => Ok(false),
            Err(e) => Err(e.into()),
        }
    }

    /// Access ConfigMaps API
    fn config_maps(&self) -> Api<ConfigMap> {
        Api::namespaced(self.client.clone(), &self.namespace)
    }

    /// Create a ConfigMap
    #[instrument(skip(self, cm), fields(cm_name = %cm.metadata.name.as_deref().unwrap_or("unknown")))]
    pub async fn create_config_map(&self, cm: &ConfigMap) -> Result<ConfigMap> {
        let cms = self.config_maps();
        let created = cms.create(&PostParams::default(), cm).await?;
        info!("Created ConfigMap");
        Ok(created)
    }

    /// Check if ConfigMap exists
    pub async fn config_map_exists(&self, name: &str) -> Result<bool> {
        let cms = self.config_maps();
        match cms.get(name).await {
            Ok(_) => Ok(true),
            Err(kube::Error::Api(ae)) if ae.code == 404 => Ok(false),
            Err(e) => Err(e.into()),
        }
    }
}
