use std::process::Stdio;
use tokio::process::Command;
use anyhow::{Result, Context};
use tracing::{info, warn, error};

/// Cliente para interactuar con Helm CLI
#[derive(Clone)]
pub struct HelmClient {
    namespace: String,
}

impl HelmClient {
    pub fn new(namespace: String) -> Self {
        Self { namespace }
    }

    /// Get the configured namespace
    pub fn namespace(&self) -> &str {
        &self.namespace
    }

    /// Instalar un chart Helm
    pub async fn install_chart(
        &self,
        release_name: &str,
        chart: &str,
        version: Option<&str>,
        values: Option<&serde_json::Value>,
    ) -> Result<String> {
        // Parse chart name and tag
        let (chart_name, tag) = if let Some(colon_pos) = chart.find(':') {
            let name = &chart[..colon_pos];
            let tag = &chart[colon_pos + 1..];
            (name.to_string(), Some(tag.to_string()))
        } else {
            (chart.to_string(), None)
        };

        // Si el chart no contiene "/", asumir que es de bitnami
        let full_chart = if chart_name.contains('/') {
            chart_name
        } else {
            format!("bitnami/{}", chart_name)
        };

        info!("Installing Helm chart: {} (release: {})", full_chart, release_name);

        // If tag is specified, add it to values
        let mut merged_values = values.cloned().unwrap_or(serde_json::json!({}));
        if let Some(tag) = tag {
            merged_values["image"] = serde_json::json!({ "tag": tag });
        }
        let values = if merged_values.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
            Some(&merged_values)
        } else {
            None
        };

        let mut cmd = Command::new("helm");
        cmd.arg("install")
            .arg(release_name)
            .arg(&full_chart)
            .arg("--namespace")
            .arg(&self.namespace)
            .arg("--create-namespace");

        if let Some(ver) = version {
            cmd.arg("--version").arg(ver);
        }

        if let Some(vals) = values {
            // Crear archivo temporal con values
            let values_yaml = serde_yaml::to_string(vals)
                .context("Failed to serialize values to YAML")?;
            let temp_file = format!("/tmp/helm-values-{}.yaml", release_name);
            tokio::fs::write(&temp_file, &values_yaml).await
                .context("Failed to write values file")?;
            cmd.arg("--values").arg(&temp_file);
        }

        let output = cmd
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .context("Failed to execute helm install")?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        info!("Helm install stdout: {}", stdout);
        if !stderr.is_empty() {
            warn!("Helm install stderr: {}", stderr);
        }

        if output.status.success() {
            info!("Helm chart installed successfully");
            Ok(stdout.to_string())
        } else {
            error!("Helm install failed: {}", stderr);
            Err(anyhow::anyhow!("Helm install failed: {}", stderr).into())
        }
    }

    /// Instalar RabbitMQ usando kubectl directamente (para evitar problemas con imágenes bloqueadas)

    /// Desinstalar un release Helm
    pub async fn uninstall_release(&self, release_name: &str) -> Result<String> {
        info!("Uninstalling Helm release: {}", release_name);

        let output = Command::new("helm")
            .arg("uninstall")
            .arg(release_name)
            .arg("--namespace")
            .arg(&self.namespace)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .context("Failed to execute helm uninstall")?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        if output.status.success() {
            info!("Helm release uninstalled successfully: {}", stdout);
            Ok(stdout.to_string())
        } else {
            error!("Helm uninstall failed: {}", stderr);
            Err(anyhow::anyhow!("Helm uninstall failed: {}", stderr).into())
        }
    }

    /// Obtener logs de un release
    pub async fn get_logs(&self, release_name: &str, tail_lines: usize) -> Result<String> {
        info!("Getting logs for release: {}", release_name);

        self.get_logs_with_kubectl(release_name, tail_lines).await
    }

    /// Obtener logs usando kubectl
    async fn get_logs_with_kubectl(&self, release_name: &str, tail_lines: usize) -> Result<String> {
        let output = Command::new("kubectl")
            .arg("logs")
            .arg(format!("deployment/{}", release_name))
            .arg("--namespace")
            .arg(&self.namespace)
            .arg(format!("--tail={}", tail_lines))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .context("Failed to execute kubectl logs")?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        if output.status.success() {
            Ok(stdout.to_string())
        } else {
            // Si falla, intentar con pods directamente
            warn!("Failed to get logs from deployment, trying pods: {}", stderr);
            self.get_logs_from_pods(release_name, tail_lines).await
        }
    }

    /// Obtener logs de pods directamente
    async fn get_logs_from_pods(&self, release_name: &str, tail_lines: usize) -> Result<String> {
        // Obtener nombre del pod
        let pod_output = Command::new("kubectl")
            .arg("get")
            .arg("pods")
            .arg("--namespace")
            .arg(&self.namespace)
            .arg("-l")
            .arg(format!("networksim-app={}", release_name))
            .arg("-o")
            .arg("jsonpath={.items[0].metadata.name}")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .context("Failed to get pod name")?;

        if !pod_output.status.success() {
            return Err(anyhow::anyhow!("No pods found for release: {}", release_name).into());
        }

        let pod_name_output = String::from_utf8_lossy(&pod_output.stdout);
        let pod_name = pod_name_output.trim();

        if pod_name.is_empty() {
            return Err(anyhow::anyhow!("No pods found for release: {}", release_name).into());
        }

        let output = Command::new("kubectl")
            .arg("logs")
            .arg(pod_name)
            .arg("--namespace")
            .arg(&self.namespace)
            .arg(format!("--tail={}", tail_lines))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .context("Failed to get logs from pod")?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        if output.status.success() {
            Ok(stdout.to_string())
        } else {
            Err(anyhow::anyhow!("Failed to get logs: {}", stderr).into())
        }
    }
}
