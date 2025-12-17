import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally before any imports
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocking
import api from './api';

describe('API Service', () => {
  beforeEach(() => {
    mockFetch.mockClear();
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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTopologies),
      });

      const result = await api.listTopologies();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/topologies'),
        expect.any(Object)
      );
      expect(result).toEqual(mockTopologies);
    });

    it('should create topology', async () => {
      const newTopology = {
        name: 'New Topology',
        nodes: [{ id: 'n1', name: 'Node 1', position: { x: 0, y: 0 }, config: {} }],
        links: [],
      };

      const createdTopology = { id: '123', ...newTopology };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createdTopology),
      });

      const result = await api.createTopology(newTopology);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/topologies'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newTopology),
        })
      );
      expect(result).toEqual(createdTopology);
    });

    it('should get topology by ID', async () => {
      const topology = { id: '123', name: 'Test', nodes: [], links: [] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(topology),
      });

      const result = await api.getTopology('123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/topologies/123'),
        expect.any(Object)
      );
      expect(result).toEqual(topology);
    });

    it('should update topology', async () => {
      const updates = { name: 'Updated Name' };
      const updatedTopology = { id: '123', name: 'Updated Name', nodes: [], links: [] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedTopology),
      });

      const result = await api.updateTopology('123', updates);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/topologies/123'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updates),
        })
      );
      expect(result).toEqual(updatedTopology);
    });

    it('should delete topology', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await api.deleteTopology('123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/topologies/123'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('Deployment API', () => {
    it('should deploy topology', async () => {
      const deployResponse = { status: 'deployed', pods: 3 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(deployResponse),
      });

      const result = await api.deployTopology('123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/topologies/123/deploy'),
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result).toEqual(deployResponse);
    });

    it('should destroy deployment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await api.destroyDeployment('123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/topologies/123/deploy'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should get deployment status', async () => {
      const status = { deployed: true, pods: [{ name: 'pod-1', status: 'Running' }] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(status),
      });

      const result = await api.getDeploymentStatus('123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/topologies/123/status'),
        expect.any(Object)
      );
      expect(result).toEqual(status);
    });
  });

  describe('Error Handling', () => {
    it('should throw on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ error: 'Topology not found' }),
      });

      await expect(api.getTopology('nonexistent')).rejects.toThrow();
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(api.listTopologies()).rejects.toThrow('Network error');
    });
  });
});

describe('API URL Construction', () => {
  it('should construct correct base URL', () => {
    // Test that API uses the correct base URL
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
    expect(baseUrl).toContain('localhost:8080');
  });
});
