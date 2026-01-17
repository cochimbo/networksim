import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure mock functions are initialized before vi.mock
const { mockGet, mockPost, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}));

// Mock axios module
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: mockGet,
      post: mockPost,
      put: mockPut,
      delete: mockDelete,
    })),
  },
}));

import api from './api';

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Topology API', () => {
    it('should list topologies', async () => {
      const mockTopologies = [
        { id: '1', name: 'Topology 1', nodes: [], links: [] },
        { id: '2', name: 'Topology 2', nodes: [], links: [] },
      ];

      mockGet.mockResolvedValueOnce({
        data: mockTopologies,
      });

      const result = await api.listTopologies();

      expect(mockGet).toHaveBeenCalledWith('/api/topologies');
      expect(result).toEqual(mockTopologies);
    });

    it('should create topology', async () => {
      const newTopology = {
        name: 'New Topology',
        nodes: [{ id: 'n1', name: 'Node 1', position: { x: 0, y: 0 }, config: {} }],
        links: [],
      };

      const createdTopology = { id: '123', ...newTopology };

      mockPost.mockResolvedValueOnce({
        data: createdTopology,
      });

      const result = await api.createTopology(newTopology);

      expect(mockPost).toHaveBeenCalledWith('/api/topologies', newTopology);
      expect(result).toEqual(createdTopology);
    });

    it('should get topology by ID', async () => {
      const topology = { id: '123', name: 'Test', nodes: [], links: [] };

      mockGet.mockResolvedValueOnce({
        data: topology,
      });

      const result = await api.getTopology('123');

      expect(mockGet).toHaveBeenCalledWith('/api/topologies/123');
      expect(result).toEqual(topology);
    });

    it('should update topology', async () => {
      const updates = { name: 'Updated Name' };
      const updatedTopology = { id: '123', name: 'Updated Name', nodes: [], links: [] };

      mockPut.mockResolvedValueOnce({
        data: updatedTopology,
      });

      const result = await api.updateTopology('123', updates);

      expect(mockPut).toHaveBeenCalledWith('/api/topologies/123', updates);
      expect(result).toEqual(updatedTopology);
    });

    it('should delete topology', async () => {
      mockDelete.mockResolvedValueOnce({
        data: {},
      });

      await api.deleteTopology('123');

      expect(mockDelete).toHaveBeenCalledWith('/api/topologies/123');
    });
  });

  describe('Deployment API', () => {
    it('should deploy topology', async () => {
      const deployResponse = { status: 'deployed', pods: 3 };

      mockPost.mockResolvedValueOnce({
        data: deployResponse,
      });

      const result = await api.deployTopology('123');

      expect(mockPost).toHaveBeenCalledWith('/api/topologies/123/deploy');
      expect(result).toEqual(deployResponse);
    });

    it('should destroy deployment', async () => {
      mockDelete.mockResolvedValueOnce({
        data: {},
      });

      await api.destroyDeployment('123');

      expect(mockDelete).toHaveBeenCalledWith('/api/topologies/123/deploy');
    });

    it('should get deployment status', async () => {
      const status = { deployed: true, pods: [{ name: 'pod-1', status: 'Running' }] };

      mockGet.mockResolvedValueOnce({
        data: status,
      });

      const result = await api.getDeploymentStatus('123');

      expect(mockGet).toHaveBeenCalledWith('/api/topologies/123/status');
      expect(result).toEqual(status);
    });
  });

  describe('Error Handling', () => {
    it('should throw on non-ok response', async () => {
      const error = new Error('Not Found');
      // @ts-ignore
      error.response = { status: 404, data: { error: 'Topology not found' } };
      
      mockGet.mockRejectedValueOnce(error);

      await expect(api.getTopology('nonexistent')).rejects.toThrow();
    });

    it('should throw on network error', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network Error'));

      await expect(api.listTopologies()).rejects.toThrow('Network Error');
    });
  });
});

describe('API URL Construction', () => {
  it('should construct correct base URL', () => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
    expect(baseUrl).toContain('localhost:8080');
  });
});
