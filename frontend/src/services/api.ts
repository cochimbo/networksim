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
  type: 'server' | 'router' | 'client' | 'custom';
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

export const chaosApi = {
  list: async (): Promise<any[]> => {
    const response = await api.get('/api/chaos');
    return response.data;
  },

  create: async (data: any): Promise<any> => {
    const response = await api.post('/api/chaos', data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/chaos/${id}`);
  },
};

export default api;
