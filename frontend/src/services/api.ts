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
}

export interface LinkProperties {
  bandwidth?: string;
  latency?: string;
}

export interface Link {
  id: string;
  source: string;
  target: string;
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
export type ChaosType = 'delay' | 'loss' | 'bandwidth' | 'corrupt' | 'duplicate' | 'partition';
export type ChaosDirection = 'to' | 'from' | 'both';

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

export type ChaosParams = DelayParams | LossParams | BandwidthParams | CorruptParams | DuplicateParams | Record<string, unknown>;

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
    console.log('chaosApi.create called with data:', data);
    console.log('API_BASE:', API_BASE);
    console.log('Full URL:', `${API_BASE}/api/chaos`);
    const response = await api.post('/api/chaos', data);
    console.log('Response:', response);
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
export type ChartType = 'predefined' | 'custom';

export interface Application {
  id: string;
  topology_id: string;
  node_selector: string[]; // Array of node IDs where to deploy
  chart_type: ChartType;
  chart_reference: string; // Full chart reference
  name: string;
  chart: string; // Keep for backward compatibility
  version?: string;
  namespace: string;
  values?: Record<string, any>;
  status: AppStatus;
  release_name: string;
  created_at: string;
  updated_at: string;
}

export interface DeployAppRequest {
  chart: string;
  chart_type?: ChartType; // 'predefined' or 'custom', defaults to 'predefined'
  node_selector: string[]; // List of node IDs where to deploy
  name?: string;
  version?: string;
  // namespace is now fixed to simulation namespace for network policies
  values?: Record<string, any>;
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

export default api;
