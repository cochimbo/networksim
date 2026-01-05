import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings as SettingsIcon,
  Server,
  Database,
  Wifi,
  RefreshCw,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Edit2,
  Box,
  Eye,
  EyeOff,
  Star,
  TestTube,
} from 'lucide-react';

interface ClusterStatus {
  connected: boolean;
  message: string;
  version?: string;
  nodes?: number;
}

interface ChaosMeshStatus {
  installed: boolean;
  version?: string;
  pods?: number;
}

interface Registry {
  id: string;
  name: string;
  url: string;
  username?: string;
  has_credentials: boolean;
  is_default: boolean;
  is_insecure: boolean;
}

export default function Settings() {
  const queryClient = useQueryClient();
  const [clusterStatus, setClusterStatus] = useState<ClusterStatus | null>(null);
  const [chaosMeshStatus, setChaosMeshStatus] = useState<ChaosMeshStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiUrl] = useState('http://localhost:8080');

  // Registry state
  const [showRegistryForm, setShowRegistryForm] = useState(false);
  const [editingRegistry, setEditingRegistry] = useState<Registry | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [registryForm, setRegistryForm] = useState({
    name: '',
    url: '',
    username: '',
    password: '',
    is_insecure: false,
    is_default: false,
  });
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch registries
  const { data: registries = [], isLoading: loadingRegistries } = useQuery({
    queryKey: ['registries'],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/registries`);
      if (!res.ok) throw new Error('Failed to fetch registries');
      return res.json();
    },
  });

  // Create registry mutation
  const createRegistry = useMutation({
    mutationFn: async (data: typeof registryForm) => {
      const res = await fetch(`${apiUrl}/api/registries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create registry');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registries'] });
      resetForm();
    },
  });

  // Update registry mutation
  const updateRegistry = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof registryForm }) => {
      const res = await fetch(`${apiUrl}/api/registries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update registry');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registries'] });
      resetForm();
    },
  });

  // Delete registry mutation
  const deleteRegistry = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiUrl}/api/registries/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete registry');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registries'] });
    },
  });

  // Test registry connection
  const testRegistry = async (id: string) => {
    setTestResult(null);
    try {
      const res = await fetch(`${apiUrl}/api/registries/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, message: 'Failed to test connection' });
    }
  };

  const resetForm = () => {
    setShowRegistryForm(false);
    setEditingRegistry(null);
    setRegistryForm({ name: '', url: '', username: '', password: '', is_insecure: false, is_default: false });
    setShowPassword(false);
    setTestResult(null);
  };

  const handleEditRegistry = (registry: Registry) => {
    setEditingRegistry(registry);
    setRegistryForm({
      name: registry.name,
      url: registry.url,
      username: registry.username || '',
      password: '',
      is_insecure: registry.is_insecure,
      is_default: registry.is_default,
    });
    setShowRegistryForm(true);
  };

  const handleSubmitRegistry = () => {
    if (editingRegistry) {
      updateRegistry.mutate({ id: editingRegistry.id, data: registryForm });
    } else {
      createRegistry.mutate(registryForm);
    }
  };

  const checkStatus = async () => {
    setLoading(true);
    try {
      const clusterRes = await fetch(`${apiUrl}/api/cluster/status`);
      if (clusterRes.ok) {
        const data = await clusterRes.json();
        setClusterStatus(data);
      } else {
        setClusterStatus({ connected: false, message: 'Failed to connect to backend' });
      }

      const presetsRes = await fetch(`${apiUrl}/api/presets`);
      if (presetsRes.ok) {
        const presets = await presetsRes.json();
        setChaosMeshStatus({ installed: true, pods: presets.length });
      } else {
        setChaosMeshStatus({ installed: false });
      }
    } catch {
      setClusterStatus({ connected: false, message: 'Backend not reachable' });
      setChaosMeshStatus({ installed: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="h-8 w-8 text-gray-600" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
      </div>

      {/* System Status */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200">System Status</h2>
          <button
            onClick={checkStatus}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatusCard
            icon={<Server className="h-5 w-5" />}
            title="Backend API"
            subtitle={apiUrl}
            status={clusterStatus?.connected ? 'ok' : 'error'}
            statusText={clusterStatus?.connected ? 'Connected' : 'Disconnected'}
          />
          <StatusCard
            icon={<Wifi className="h-5 w-5" />}
            title="Kubernetes"
            subtitle={clusterStatus?.message || 'Checking...'}
            status={clusterStatus?.connected ? 'ok' : 'error'}
            statusText={clusterStatus?.connected ? 'Ready' : 'Not Ready'}
          />
          <StatusCard
            icon={<Database className="h-5 w-5" />}
            title="Chaos Mesh"
            subtitle={chaosMeshStatus?.installed ? `${chaosMeshStatus.pods} presets` : 'Not detected'}
            status={chaosMeshStatus?.installed ? 'ok' : 'warning'}
            statusText={chaosMeshStatus?.installed ? 'Installed' : 'Not Installed'}
          />
        </div>
      </div>

      {/* Container Registries */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Box className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200">Container Registries</h2>
          </div>
          <button
            onClick={() => setShowRegistryForm(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            <Plus size={14} />
            Add Registry
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Configure private container registries (Harbor, GitLab Registry, AWS ECR, etc.) for deploying your applications.
        </p>

        {/* Registry List */}
        <div className="space-y-3">
          {loadingRegistries ? (
            <div className="text-center py-8 text-gray-500">Loading registries...</div>
          ) : registries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No registries configured</div>
          ) : (
            registries.map((registry: Registry) => (
              <div
                key={registry.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center">
                    <Box className="h-5 w-5 text-gray-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700 dark:text-gray-200">{registry.name}</span>
                      {registry.is_default && (
                        <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
                          <Star size={10} /> Default
                        </span>
                      )}
                      {registry.is_insecure && (
                        <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded">HTTP</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{registry.url}</div>
                    {registry.has_credentials && (
                      <div className="text-xs text-gray-400">Authenticated as {registry.username}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => testRegistry(registry.id)}
                    className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    title="Test connection"
                  >
                    <TestTube size={16} />
                  </button>
                  <button
                    onClick={() => handleEditRegistry(registry)}
                    className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    title="Edit"
                  >
                    <Edit2 size={16} />
                  </button>
                  {registry.id !== 'docker-hub' && (
                    <button
                      onClick={() => deleteRegistry.mutate(registry.id)}
                      className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`mt-4 p-3 rounded-lg ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {testResult.success ? <CheckCircle className="inline mr-2" size={16} /> : <XCircle className="inline mr-2" size={16} />}
            {testResult.message}
          </div>
        )}
      </div>

      {/* Registry Form Modal */}
      {showRegistryForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-200">
              {editingRegistry ? 'Edit Registry' : 'Add Registry'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={registryForm.name}
                  onChange={(e) => setRegistryForm({ ...registryForm, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  placeholder="My Harbor Registry"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">URL</label>
                <input
                  type="text"
                  value={registryForm.url}
                  onChange={(e) => setRegistryForm({ ...registryForm, url: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  placeholder="harbor.mycompany.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Username (optional)</label>
                <input
                  type="text"
                  value={registryForm.username}
                  onChange={(e) => setRegistryForm({ ...registryForm, username: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  placeholder="admin"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Password (optional)</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={registryForm.password}
                    onChange={(e) => setRegistryForm({ ...registryForm, password: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 pr-10"
                    placeholder={editingRegistry ? '(unchanged)' : 'password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={registryForm.is_insecure}
                    onChange={(e) => setRegistryForm({ ...registryForm, is_insecure: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-300">Insecure (HTTP)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={registryForm.is_default}
                    onChange={(e) => setRegistryForm({ ...registryForm, is_default: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-300">Set as default</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRegistry}
                disabled={!registryForm.name || !registryForm.url}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                {editingRegistry ? 'Save Changes' : 'Add Registry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusCard({
  icon,
  title,
  subtitle,
  status,
  statusText,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  status: 'ok' | 'warning' | 'error';
  statusText: string;
}) {
  const statusColors = {
    ok: 'text-green-600',
    warning: 'text-yellow-500',
    error: 'text-red-500',
  };

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
      <div className="flex items-center gap-3 mb-2">
        <div className="text-gray-500">{icon}</div>
        <div className="font-medium text-gray-700 dark:text-gray-200">{title}</div>
      </div>
      <div className="text-sm text-gray-500 mb-2 truncate">{subtitle}</div>
      <div className={`flex items-center gap-1 text-sm ${statusColors[status]}`}>
        {status === 'ok' ? <CheckCircle size={14} /> : <XCircle size={14} />}
        {statusText}
      </div>
    </div>
  );
}
