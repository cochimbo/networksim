import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types
export interface Position {
  x: number;
  y: number;
}

export interface NodeConfig {
  image?: string;
  cpu?: string;
  memory?: string;
  env?: Array<{ name: string; value: string }>;
}

export interface Node {
  id: string;
  name: string;
  position: Position;
  config: NodeConfig;
  group?: string;  // Optional group name for visual grouping
}

export interface LinkProperties {
  bandwidth?: string;
  latency?: string;
}

export interface Link {
  id: string;
  source: string;
  target: string;
  label?: string;  // Optional label for the connection
  properties?: LinkProperties;
}

export interface Topology {
  id: string;
  name: string;
  description?: string;
  nodes: Node[];
  links: Link[];
  created_at: string;
  updated_at: string;
}

export interface CreateTopologyRequest {
  name: string;
  description?: string;
  nodes?: Node[];
  links?: Link[];
}

export interface UpdateTopologyRequest {
  name?: string;
  description?: string;
  nodes?: Node[];
  links?: Link[];
}

// API functions
export const topologyApi = {
  list: async (): Promise<Topology[]> => {
    const response = await api.get('/api/topologies');
    return response.data;
  },

  get: async (id: string): Promise<Topology> => {
    const response = await api.get(`/api/topologies/${id}`);
    return response.data;
  },

  create: async (data: CreateTopologyRequest): Promise<Topology> => {
    const response = await api.post('/api/topologies', data);
    return response.data;
  },

  update: async (id: string, data: UpdateTopologyRequest): Promise<Topology> => {
    const response = await api.put(`/api/topologies/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/topologies/${id}`);
  },

  deploy: async (id: string): Promise<any> => {
    const response = await api.post(`/api/topologies/${id}/deploy`);
    return response.data;
  },

  destroy: async (id: string): Promise<void> => {
    await api.delete(`/api/topologies/${id}/deploy`);
  },

  status: async (id: string): Promise<any> => {
    const response = await api.get(`/api/topologies/${id}/status`);
    return response.data;
  },

  duplicate: async (id: string): Promise<Topology> => {
    const response = await api.post(`/api/topologies/${id}/duplicate`);
    return response.data;
  },
};

// Deployment API
export interface ActiveDeployment {
  topology_id: string;
  status: string;
  message?: string;
  nodes: Array<{
    id: string;
    name: string;
    status: string;
    pod_name?: string;
    pod_ip?: string;
    message?: string;
  }>;
}

export const deploymentApi = {
  getActive: async (): Promise<ActiveDeployment | null> => {
    const response = await api.get('/api/deployments/active');
    return response.data;
  },
};

// Chaos Types
// NetworkChaos types
export type NetworkChaosType = 'delay' | 'loss' | 'bandwidth' | 'corrupt' | 'duplicate' | 'partition';
// New chaos types (StressChaos, PodChaos, IOChaos, HTTPChaos)
export type NewChaosType = 'stress-cpu' | 'pod-kill' | 'io-delay' | 'http-abort';
export type ChaosType = NetworkChaosType | NewChaosType;

export type ChaosDirection = 'to' | 'from' | 'both';

// NetworkChaos params
export interface DelayParams {
  latency: string;
  jitter?: string;
  correlation?: string;
}

export interface LossParams {
  loss: string;
  correlation?: string;
}

export interface BandwidthParams {
  rate: string;
  buffer?: number;
  limit?: number;
}

export interface CorruptParams {
  corrupt: string;
  correlation?: string;
}

export interface DuplicateParams {
  duplicate: string;
  correlation?: string;
}

// New chaos type params
export interface StressCpuParams {
  workers?: number;
  load?: number; // 0-100
}

export interface PodKillParams {
  grace_period?: number;
}

export interface IoDelayParams {
  delay: string;
  path?: string;
  percent?: number;
  methods?: string[];
}

export interface HttpAbortParams {
  code?: number;
  method?: string;
  path?: string;
  port?: number;
}

export type ChaosParams =
  | DelayParams
  | LossParams
  | BandwidthParams
  | CorruptParams
  | DuplicateParams
  | StressCpuParams
  | PodKillParams
  | IoDelayParams
  | HttpAbortParams
  | Record<string, unknown>;

// Helper to check if a chaos type requires a target node
export function chaosTypeRequiresTarget(type: ChaosType): boolean {
  const networkTypes: ChaosType[] = ['delay', 'loss', 'bandwidth', 'corrupt', 'duplicate', 'partition'];
  return networkTypes.includes(type);
}

export interface CreateChaosRequest {
  topology_id: string;
  source_node_id: string;
  target_node_id?: string;
  chaos_type: ChaosType;
  direction: ChaosDirection;
  duration?: string;
  params: ChaosParams;
}

export type ChaosConditionStatus = 'pending' | 'active' | 'paused';

export interface ChaosCondition {
  id: string;
  topology_id: string;
  source_node_id: string;
  target_node_id?: string;
  chaos_type: ChaosType;
  direction: ChaosDirection;
  duration?: string;
  params: ChaosParams;
  k8s_name?: string;
  status: ChaosConditionStatus;
  started_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ChaosStatus {
  name: string;
  condition_id: string;
  chaos_type: ChaosType;
  phase: string;
  target_pods: string[];
  message?: string;
}

export const chaosApi = {
  list: async (topologyId: string): Promise<ChaosCondition[]> => {
    const response = await api.get(`/api/topologies/${topologyId}/chaos`);
    return response.data;
  },

  create: async (data: CreateChaosRequest): Promise<ChaosCondition> => {
    const response = await api.post('/api/chaos', data);
    return response.data;
  },

  start: async (topologyId: string, conditionId: string): Promise<ChaosCondition> => {
    const response = await api.post(`/api/topologies/${topologyId}/chaos/${conditionId}/start`);
    return response.data;
  },

  stop: async (topologyId: string, conditionId: string): Promise<ChaosCondition> => {
    const response = await api.post(`/api/topologies/${topologyId}/chaos/${conditionId}/stop`);
    return response.data;
  },

  startAll: async (topologyId: string): Promise<{ started: number; errors: string[] }> => {
    const response = await api.post(`/api/topologies/${topologyId}/chaos/start`);
    return response.data;
  },

  stopAll: async (topologyId: string): Promise<{ stopped: number }> => {
    const response = await api.post(`/api/topologies/${topologyId}/chaos/stop`);
    return response.data;
  },

  delete: async (topologyId: string, conditionId: string): Promise<void> => {
    await api.delete(`/api/topologies/${topologyId}/chaos/${conditionId}`);
  },

  update: async (topologyId: string, conditionId: string, data: Partial<CreateChaosRequest>): Promise<ChaosCondition> => {
    const response = await api.put(`/api/topologies/${topologyId}/chaos/${conditionId}`, data);
    return response.data;
  },

  deleteAll: async (topologyId: string): Promise<{ deleted: number }> => {
    const response = await api.delete(`/api/topologies/${topologyId}/chaos`);
    return response.data;
  },
};

// Scenarios
export interface Scenario {
  id: string;
  topology_id: string;
  name: string;
  description?: string;
  total_duration: number;
  steps: any[]; // ScenarioStep[] but simplified
  created_at: string;
  updated_at: string;
}

export const scenariosApi = {
  list: async (topologyId: string): Promise<Scenario[]> => {
    const response = await api.get(`/api/topologies/${topologyId}/scenarios`);
    return response.data.data;
  },
  
  get: async (id: string): Promise<Scenario> => {
    const response = await api.get(`/api/scenarios/${id}`);
    return response.data.data;
  },

  create: async (topologyId: string, data: Partial<Scenario>): Promise<Scenario> => {
    // Strip fields that shouldn't be sent to backend
    const { id, created_at, updated_at, topology_id, ...payload } = data as any;
    const response = await api.post(`/api/topologies/${topologyId}/scenarios`, payload);
    return response.data.data;
  },

  update: async (id: string, data: Partial<Scenario>): Promise<Scenario> => {
    // Strip fields that shouldn't be sent to backend
    const { id: _id, created_at, updated_at, topology_id, ...payload } = data as any;
    const response = await api.put(`/api/scenarios/${id}`, payload);
    return response.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/scenarios/${id}`);
  },

  run: async (id: string): Promise<void> => {
    await api.post(`/api/scenarios/${id}/run`);
  }
};

// Cluster Status
export interface ClusterStatus {
  connected: boolean;
  message: string;
}

export interface DeploymentStatus {
  topology_id: string;
  status: 'pending' | 'running' | 'stopped' | 'error' | 'not_deployed';
  message?: string;
  nodes: Array<{
    id: string;
    name: string;
    status: string;
    pod_name?: string;
    pod_ip?: string;
    message?: string;
  }>;
}

export const clusterApi = {
  status: async (): Promise<ClusterStatus> => {
    const response = await api.get('/api/cluster/status');
    return response.data;
  },
};

export interface ContainerInfo {
  name: string;
  image: string;
  status: string;
  ready: boolean;
  restart_count: number;
  started_at?: string;
  ports?: ContainerPort[];
  application_name?: string;
  application_chart?: string;
}

export interface ContainerPort {
  container_port: number;
  protocol: string;
  name?: string;
}

export const diagnosticApi = {
  getNodeContainers: async (topologyId: string, nodeId: string): Promise<ContainerInfo[]> => {
    const response = await api.get(`/api/topologies/${topologyId}/nodes/${nodeId}/containers`);
    return response.data;
  },
};

// Application Types
export type AppStatus = 'pending' | 'deploying' | 'deployed' | 'failed' | 'uninstalling';

export interface VolumeMount {
  name: string;
  mountPath: string;
  type: 'emptyDir' | 'hostPath' | 'configMap' | 'secret' | 'pvc';
  source?: string; // For hostPath, configMap, secret - the name/path
  size?: string; // For dynamic PVC creation (e.g. "1Gi")
  items?: Record<string, string>; // For dynamic ConfigMap creation (filename -> content)
  readOnly?: boolean;
}

export interface HealthCheck {
  type: 'http' | 'tcp' | 'exec';
  path?: string; // For http: /healthz
  port?: number; // For http/tcp
  command?: string[]; // For exec
  initialDelaySeconds?: number;
  periodSeconds?: number;
}

export interface Application {
  id: string;
  topology_id: string;
  node_selector: string[]; // Array de node IDs where to deploy
  image_name: string; // Full image reference
  chart: string; // Keep for backward compatibility
  namespace: string;
  envvalues?: Record<string, any>;
  status: AppStatus;
  release_name: string;
  created_at: string;
  updated_at: string;
  // New fields
  replicas?: number;
  volumes?: VolumeMount[];
  healthCheck?: HealthCheck;
  cpu_request?: string;
  memory_request?: string;
  cpu_limit?: string;
  memory_limit?: string;
}

export interface DeployAppRequest {
  chart: string;
  node_selector: string[]; // List of node IDs where to deploy
  // namespace is now fixed to simulation namespace for network policies
  envvalues?: Record<string, any>;
  replicas?: number;
  volumes?: VolumeMount[];
  healthCheck?: HealthCheck;
  cpu_request?: string;
  memory_request?: string;
  cpu_limit?: string;
  memory_limit?: string;
}

export interface AppLogs {
  logs: string;
  truncated: boolean;
}

export interface AppNodeStatus {
  node_id: string;
  pod_name: string;
  container_name: string;
  running: boolean;
  error?: string;
}

export interface AppRuntimeStatus {
  application_id: string;
  application_name: string;
  all_running: boolean;
  node_statuses: AppNodeStatus[];
}

export const applicationsApi = {
  // Topology-wide deployment (new)
  deployTopology: async (topologyId: string, request: DeployAppRequest): Promise<Application> => {
    const response = await api.post(`/api/topologies/${topologyId}/apps`, request);
    return response.data;
  },

  createAppDraft: async (topologyId: string, request: DeployAppRequest): Promise<Application> => {
    const response = await api.post(`/api/topologies/${topologyId}/apps/draft`, request);
    return response.data;
  },

  updateAppValues: async (topologyId: string, appId: string, values: Record<string, unknown> | null): Promise<Application> => {
    const response = await api.put(`/api/topologies/${topologyId}/apps/${appId}`, { envvalues: values });
    return response.data;
  },

  listByTopology: async (topologyId: string): Promise<Application[]> => {
    const response = await api.get(`/api/topologies/${topologyId}/apps`);
    return response.data;
  },

  // Node-specific deployment (existing, for backward compatibility)
  deploy: async (topologyId: string, nodeId: string, request: DeployAppRequest): Promise<Application> => {
    const response = await api.post(`/api/topologies/${topologyId}/nodes/${nodeId}/apps`, request);
    return response.data;
  },

  listByNode: async (topologyId: string, nodeId: string): Promise<Application[]> => {
    const response = await api.get(`/api/topologies/${topologyId}/nodes/${nodeId}/apps`);
    return response.data;
  },

  get: async (topologyId: string, appId: string): Promise<Application> => {
    const response = await api.get(`/api/topologies/${topologyId}/apps/${appId}`);
    return response.data;
  },

  uninstall: async (topologyId: string, appId: string): Promise<void> => {
    await api.delete(`/api/topologies/${topologyId}/apps/${appId}`);
  },

  getLogs: async (topologyId: string, appId: string): Promise<AppLogs> => {
    const response = await api.get(`/api/topologies/${topologyId}/apps/${appId}/logs`);
    return response.data;
  },

  getStatus: async (topologyId: string, appId: string): Promise<AppRuntimeStatus> => {
    const response = await api.get(`/api/topologies/${topologyId}/apps/${appId}/status`);
    return response.data;
  },
};

// ============================================================
// NEW APIs: Live Metrics, Events, Presets, Test Runner
// ============================================================

// Events Types
export interface Event {
  id: number;
  topology_id?: string;
  event_type: string;
  event_subtype?: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  source_type?: string;
  source_id?: string;
  created_at: string;
}

export interface EventsResponse {
  events: Event[];
  total: number;
  has_more: boolean;
}

// Network Metrics Types
export interface NetworkMetric {
  id: number;
  topology_id: string;
  source_node_id: string;
  target_node_id: string;
  latency_ms?: number;
  packet_loss_percent?: number;
  bandwidth_bps?: number;
  jitter_ms?: number;
  is_connected: boolean;
  measured_at: string;
}

export interface NodeMetric {
  id: number;
  topology_id: string;
  node_id: string;
  pod_name?: string;
  cpu_usage_percent?: number;
  memory_usage_bytes?: number;
  memory_limit_bytes?: number;
  rx_bytes?: number;
  tx_bytes?: number;
  status: string;
  measured_at: string;
}

export interface MetricsSummary {
  total_nodes: number;
  total_pairs: number;
  connected_pairs: number;
  blocked_pairs: number;
  linked_connected: number;
  linked_blocked: number;
  unlinked_blocked: number;
  avg_latency_ms?: number;
  max_latency_ms?: number;
  total_packet_loss_events: number;
}

export interface LiveMetricsSnapshot {
  topology_id: string;
  timestamp: string;
  network_metrics: NetworkMetric[];
  node_metrics: NodeMetric[];
  summary: MetricsSummary;
}

export interface AggregatedMetrics {
  interval: string;
  data_points: {
    timestamp: string;
    avg_latency_ms?: number;
    max_latency_ms?: number;
    min_latency_ms?: number;
    avg_packet_loss?: number;
    sample_count: number;
  }[];
}

// Preset Types
export interface ChaosPreset {
  id: string;
  name: string;
  description?: string;
  category: string;
  icon?: string;
  chaos_type: string;
  direction: string;
  duration?: string;
  params: Record<string, unknown>;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

// Test Run Types
export interface TestRun {
  id: string;
  topology_id: string;
  test_type: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  results?: any;
  error_message?: string;
  created_at: string;
}

// Diagnostic Types
export interface DiagnosticReport {
  topology_id: string;
  timestamp: string;
  summary: {
    total_nodes: number;
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    success_rate: number;
    unexpected_connections: number;
    missing_connections: number;
  };
  connectivity_tests: {
    from_node: string;
    to_node: string;
    expected: 'allow' | 'deny';
    actual: 'connected' | 'blocked' | 'unknown' | 'error';
    latency_ms?: number;
    status: 'pass' | 'fail' | 'warning' | 'skipped';
  }[];
  connectivity_matrix: Record<string, Record<string, boolean>>;
}

// Events API
export const eventsApi = {
  list: async (params?: Record<string, string>): Promise<EventsResponse> => {
    const response = await api.get('/api/events', { params });
    return response.data;
  },

  listByTopology: async (topologyId: string, params?: Record<string, string>): Promise<EventsResponse> => {
    const response = await api.get(`/api/topologies/${topologyId}/events`, { params });
    return response.data;
  },

  create: async (data: Partial<Event>): Promise<Event> => {
    const response = await api.post('/api/events', data);
    return response.data;
  },

  stats: async (params?: Record<string, string>): Promise<any> => {
    const response = await api.get('/api/events/stats', { params });
    return response.data;
  },
};

// Live Metrics API
export const metricsApi = {
  getLive: async (topologyId: string): Promise<LiveMetricsSnapshot> => {
    const response = await api.get(`/api/topologies/${topologyId}/metrics/live`);
    return response.data;
  },

  getHistory: async (topologyId: string, params?: Record<string, string>): Promise<NetworkMetric[]> => {
    const response = await api.get(`/api/topologies/${topologyId}/metrics/history`, { params });
    return response.data;
  },

  getAggregated: async (topologyId: string, params?: { interval?: string; since?: string }): Promise<AggregatedMetrics> => {
    const response = await api.get(`/api/topologies/${topologyId}/metrics/aggregated`, { params });
    return response.data;
  },
};

// Presets API
export const presetsApi = {
  list: async (): Promise<ChaosPreset[]> => {
    const response = await api.get('/api/presets');
    return response.data;
  },

  get: async (id: string): Promise<ChaosPreset> => {
    const response = await api.get(`/api/presets/${id}`);
    return response.data;
  },

  create: async (data: Partial<ChaosPreset>): Promise<ChaosPreset> => {
    const response = await api.post('/api/presets', data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/presets/${id}`);
  },

  apply: async (topologyId: string, presetId: string, data: { source_node_id: string; target_node_id?: string; duration?: string }): Promise<any> => {
    const response = await api.post(`/api/topologies/${topologyId}/presets/${presetId}/apply`, data);
    return response.data;
  },
};

// Test Runner API
export const testRunnerApi = {
  list: async (topologyId: string, params?: Record<string, string>): Promise<TestRun[]> => {
    const response = await api.get(`/api/topologies/${topologyId}/tests`, { params });
    return response.data;
  },

  get: async (topologyId: string, testId: string): Promise<TestRun> => {
    const response = await api.get(`/api/topologies/${topologyId}/tests/${testId}`);
    return response.data;
  },

  start: async (topologyId: string, data: { test_type: string; options?: any }): Promise<TestRun> => {
    const response = await api.post(`/api/topologies/${topologyId}/tests`, data);
    return response.data;
  },

  cancel: async (topologyId: string, testId: string): Promise<TestRun> => {
    const response = await api.post(`/api/topologies/${topologyId}/tests/${testId}/cancel`);
    return response.data;
  },
};

// Diagnostic API (extended)
export const diagnosticApiExtended = {
  ...diagnosticApi,

  runDiagnostic: async (topologyId: string): Promise<DiagnosticReport> => {
    const response = await api.get(`/api/topologies/${topologyId}/diagnostic`);
    return response.data;
  },
};

// ============================================================
// Templates API
// ============================================================

export interface TemplateNode {
  name: string;
  position: Position;
  config: NodeConfig;
}

export interface TemplateLink {
  source_index: number;
  target_index: number;
  properties?: LinkProperties;
}

export interface TemplatePreview {
  nodes: TemplateNode[];
  links: TemplateLink[];
}

export interface TopologyTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  node_count: number;
  preview: TemplatePreview;
}

export interface GeneratedTopology {
  name: string;
  description: string;
  nodes: Node[];
  links: Link[];
}

export const templatesApi = {
  list: async (): Promise<TopologyTemplate[]> => {
    const response = await api.get('/api/templates');
    return response.data;
  },

  get: async (templateId: string): Promise<TopologyTemplate> => {
    const response = await api.get(`/api/templates/${templateId}`);
    return response.data;
  },

  generate: async (templateId: string): Promise<GeneratedTopology> => {
    const response = await api.post(`/api/templates/${templateId}/generate`);
    return response.data;
  },
};

// ============================================================
// Reports API
// ============================================================

export interface TopologyReport {
  generated_at: string;
  topology: {
    id: string;
    name: string;
    description?: string;
    node_count: number;
    link_count: number;
    nodes: Array<{ id: string; name: string }>;
    created_at: string;
  };
  chaos_summary: {
    total_conditions: number;
    active_conditions: number;
    conditions_by_type: Array<{ chaos_type: string; count: number }>;
    conditions: Array<{
      id: string;
      chaos_type: string;
      source_node: string;
      target_node?: string;
      status: string;
      duration?: string;
      params: Record<string, unknown>;
    }>;
  };
  applications: Array<{
    id: string;
    image: string;
    node_id: string;
    status: string;
  }>;
  events: Array<{
    id: string;
    event_type: string;
    message: string;
    created_at: string;
  }>;
  statistics: {
    total_chaos_experiments: number;
    unique_chaos_types: number;
    affected_nodes: number;
    total_events: number;
    deployed_apps: number;
  };
}

export const reportsApi = {
  getJson: async (topologyId: string): Promise<TopologyReport> => {
    const response = await api.get(`/api/topologies/${topologyId}/report`);
    return response.data;
  },

  downloadHtml: async (topologyId: string): Promise<void> => {
    const response = await api.get(`/api/topologies/${topologyId}/report/html`, {
      responseType: 'blob',
    });
    const blob = new Blob([response.data], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report-${topologyId}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};

// Convenience wrapper for components
const apiWrapper = {
  // Existing
  ...api,

  // Topologies
  listTopologies: topologyApi.list,
  getTopology: topologyApi.get,
  createTopology: topologyApi.create,
  updateTopology: topologyApi.update,
  deleteTopology: topologyApi.delete,
  deployTopology: topologyApi.deploy,
  destroyDeployment: topologyApi.destroy,
  getDeploymentStatus: topologyApi.status,

  // Chaos
  listChaos: chaosApi.list,
  createChaos: chaosApi.create,
  startChaos: chaosApi.start,
  stopChaos: chaosApi.stop,
  deleteChaos: chaosApi.delete,

  // Events
  listEvents: eventsApi.list,
  listTopologyEvents: eventsApi.listByTopology,
  createEvent: eventsApi.create,
  getEventStats: eventsApi.stats,

  // Metrics
  getLiveMetrics: metricsApi.getLive,
  getMetricsHistory: metricsApi.getHistory,
  getAggregatedMetrics: metricsApi.getAggregated,

  // Presets
  listPresets: presetsApi.list,
  getPreset: presetsApi.get,
  createPreset: presetsApi.create,
  deletePreset: presetsApi.delete,
  applyPreset: presetsApi.apply,

  // Test Runner
  listTestRuns: testRunnerApi.list,
  getTestRun: testRunnerApi.get,
  startTest: testRunnerApi.start,
  cancelTest: testRunnerApi.cancel,

  // Diagnostic
  runDiagnostic: diagnosticApiExtended.runDiagnostic,
  getNodeContainers: diagnosticApi.getNodeContainers,

  // Volumes
  listPVCs: async () => (await api.get<PvcDto[]>('/api/volumes/pvc')).data,
  createPVC: async (name: string, size: string) => (await api.post<PvcDto>('/api/volumes/pvc', { name, size })).data,
  deletePVC: async (name: string) => (await api.delete<{ success: boolean }>(`/api/volumes/pvc/${name}`)).data,
  
  listConfigs: async () => (await api.get<ConfigMapDto[]>('/api/volumes/config')).data,
  createConfig: async (name: string) => (await api.post<ConfigMapDto>('/api/volumes/config', { name })).data,
  deleteConfig: async (name: string) => (await api.delete<{ success: boolean }>(`/api/volumes/config/${name}`)).data,
  uploadConfigFile: async (name: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return (await api.post<{ success: boolean, files_added: string[] }>(`/api/volumes/config/${name}/files`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })).data;
  },
};

// Volume Types
export interface PvcDto {
  name: string;
  size: string;
  status: string;
  created_at?: string;
}

export interface ConfigMapDto {
  name: string;
  keys: string[];
  created_at?: string;
}


export default apiWrapper;
