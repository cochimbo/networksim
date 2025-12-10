import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Play, Trash2, FileText, Loader2, Package } from 'lucide-react';
import { applicationsApi, DeployAppRequest, ChartType, AppRuntimeStatus } from '../services/api';

interface ApplicationsPanelProps {
  topologyId: string;
  nodes: Array<{ id: string; name: string }>;
  selectedNode?: { id: string; name: string } | null;
  isTopologyDeployed?: boolean;
}

// Predefined charts available
const PREDEFINED_CHARTS = [
  { name: 'nginx', description: 'High-performance web server' },
  { name: 'redis', description: 'In-memory data structure store' },
  { name: 'postgres', description: 'Advanced open source relational database' },
  { name: 'mysql', description: 'Popular open source database' },
  { name: 'mongodb', description: 'Document database' },
  { name: 'rabbitmq', description: 'Message broker' },
  { name: 'prometheus', description: 'Monitoring and alerting toolkit' },
  { name: 'grafana', description: 'Observability platform' },
];

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  deployed: 'bg-green-100 text-green-800',
};

const STATUS_LABELS = {
  pending: 'Pending/Deploying',
  error: 'Error',
  deployed: 'Deployed',
};

// Map backend status to simplified frontend status
// If topology is not deployed, all apps show as pending
// Otherwise: pending/deploying/uninstalling -> pending, failed -> error, deployed -> deployed
const mapStatus = (backendStatus: string, isTopologyDeployed: boolean = false): 'pending' | 'error' | 'deployed' => {
  // If topology is not deployed, all applications are pending
  if (!isTopologyDeployed) {
    return 'pending';
  }

  switch (backendStatus) {
    case 'pending':
    case 'deploying':
    case 'uninstalling':
      return 'pending';
    case 'failed':
      return 'error';
    case 'deployed':
      return 'deployed';
    default:
      return 'pending';
  }
};

export function ApplicationsPanel({ topologyId, nodes, selectedNode, isTopologyDeployed = false }: ApplicationsPanelProps) {
  const queryClient = useQueryClient();
  const [showDeployForm, setShowDeployForm] = useState(false);
  const [deployForm, setDeployForm] = useState<DeployAppRequest>({
    chart: '',
    chart_type: 'predefined',
    node_selector: selectedNode ? [selectedNode.id] : [],
    name: '',
    version: '',
    values: {},
  });
  const [logs, setLogs] = useState<string>('');
  const [chartValidationError, setChartValidationError] = useState<string>('');
  const [appStatuses, setAppStatuses] = useState<Record<string, AppRuntimeStatus>>({});

  // Update deploy form when selectedNode changes
  useEffect(() => {
    if (selectedNode) {
      setDeployForm(prev => ({
        ...prev,
        node_selector: [selectedNode.id]
      }));
    }
  }, [selectedNode]);

  // Query para obtener aplicaciones de la topología
  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['applications', topologyId],
    queryFn: () => applicationsApi.listByTopology(topologyId),
  });

  // Function to load detailed status for an application
  const loadAppStatus = async (appId: string) => {
    try {
      const status = await applicationsApi.getStatus(topologyId, appId);
      setAppStatuses(prev => ({ ...prev, [appId]: status }));
    } catch (error) {
      console.error('Failed to load app status:', error);
    }
  };

  // Load status for all applications when topology is deployed
  useEffect(() => {
    if (isTopologyDeployed && applications.length > 0) {
      applications.forEach(app => {
        loadAppStatus(app.id);
      });
    }
  }, [applications, isTopologyDeployed]);

  // Mutation para desplegar aplicación
  const deployMutation = useMutation({
    mutationFn: (request: DeployAppRequest) => applicationsApi.deployTopology(topologyId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications', topologyId] });
      setShowDeployForm(false);
      setDeployForm({
        chart: '',
        chart_type: 'predefined',
        node_selector: [],
        name: '',
        version: '',
        values: {},
      });
    },
  });

  // Mutation para desinstalar aplicación
  const uninstallMutation = useMutation({
    mutationFn: (appId: string) => applicationsApi.uninstall(topologyId, appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications', topologyId] });
      setLogs('');
    },
  });

  // Mutation para obtener logs
  const logsMutation = useMutation({
    mutationFn: (appId: string) => applicationsApi.getLogs(topologyId, appId),
    onSuccess: (data) => {
      setLogs(data.logs);
    },
  });

  const handleDeploy = () => {
    if (!deployForm.chart.trim()) {
      setChartValidationError('Chart name is required');
      return;
    }

    if (deployForm.node_selector.length === 0) {
      setChartValidationError('Select at least one node to deploy to');
      return;
    }

    // Validate custom chart format
    if (deployForm.chart_type === 'custom' && !deployForm.chart.includes('/')) {
      setChartValidationError('Custom charts must be in format: repo/chart');
      return;
    }

    setChartValidationError('');
    deployMutation.mutate(deployForm);
  };

  const handleNodeToggle = (nodeId: string) => {
    setDeployForm(prev => ({
      ...prev,
      node_selector: prev.node_selector.includes(nodeId)
        ? prev.node_selector.filter(id => id !== nodeId)
        : [...prev.node_selector, nodeId]
    }));
  };

  const handlePredefinedChartSelect = (chartName: string) => {
    setDeployForm(prev => ({
      ...prev,
      chart: chartName,
      chart_type: 'predefined',
      name: prev.name || `${chartName}-app`,
    }));
    setChartValidationError('');
  };

  const getNodeNames = (nodeIds: string[]) => {
    return nodeIds.map(id => {
      const node = nodes.find(n => n.id === id);
      return node ? node.name : id;
    }).join(', ');
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Package className="h-5 w-5" />
          Applications
        </h2>
        {selectedNode && (
          <p className="text-sm text-gray-600 mt-1">
            Node: <span className="font-medium">{selectedNode.name}</span>
          </p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Deploy Form */}
        {showDeployForm && (
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Deploy New Application</h3>

            <div className="space-y-4">
              {/* Chart Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Chart Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="predefined"
                      checked={deployForm.chart_type === 'predefined'}
                      onChange={(e) => setDeployForm(prev => ({
                        ...prev,
                        chart_type: e.target.value as ChartType,
                        chart: e.target.value === 'predefined' ? '' : prev.chart
                      }))}
                      className="mr-2"
                    />
                    Predefined
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="custom"
                      checked={deployForm.chart_type === 'custom'}
                      onChange={(e) => setDeployForm(prev => ({
                        ...prev,
                        chart_type: e.target.value as ChartType,
                        chart: e.target.value === 'custom' ? '' : prev.chart
                      }))}
                      className="mr-2"
                    />
                    Custom
                  </label>
                </div>
              </div>

              {/* Predefined Charts */}
              {deployForm.chart_type === 'predefined' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Predefined Charts</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PREDEFINED_CHARTS.map((chart) => (
                      <button
                        key={chart.name}
                        onClick={() => handlePredefinedChartSelect(chart.name)}
                        className={`p-2 text-left border rounded-md hover:bg-gray-50 ${
                          deployForm.chart === chart.name ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                        }`}
                      >
                        <div className="font-medium text-sm">{chart.name}</div>
                        <div className="text-xs text-gray-500">{chart.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Chart Input */}
              {deployForm.chart_type === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Custom Chart (repo/chart)
                  </label>
                  <input
                    type="text"
                    value={deployForm.chart}
                    onChange={(e) => setDeployForm(prev => ({ ...prev, chart: e.target.value }))}
                    placeholder="bitnami/apache"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {/* Application Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Application Name</label>
                <input
                  type="text"
                  value={deployForm.name}
                  onChange={(e) => setDeployForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="my-app"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Version */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Version (optional)</label>
                <input
                  type="text"
                  value={deployForm.version || ''}
                  onChange={(e) => setDeployForm(prev => ({ ...prev, version: e.target.value || undefined }))}
                  placeholder="latest"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Node Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Deploy to Nodes</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {nodes.map((node) => (
                    <label key={node.id} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={deployForm.node_selector.includes(node.id)}
                        onChange={() => handleNodeToggle(node.id)}
                        className="mr-2"
                      />
                      <span className="text-sm">{node.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Error Message */}
              {chartValidationError && (
                <div className="text-red-600 text-sm">{chartValidationError}</div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleDeploy}
                  disabled={deployMutation.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {deployMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Schedule
                </button>
                <button
                  onClick={() => setShowDeployForm(false)}
                  className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Applications List */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-900">Configured Applications</h3>
            <button
              onClick={() => setShowDeployForm(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add App
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (selectedNode ? applications.filter(app => app.node_selector.includes(selectedNode.id)) : applications).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{selectedNode ? `No applications on ${selectedNode.name}` : 'No applications configured'}</p>
              <p className="text-sm">Click "Add App" to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(selectedNode ? applications.filter(app => app.node_selector.includes(selectedNode.id)) : applications).map((app) => {
                const appStatus = appStatuses[app.id] as AppRuntimeStatus | undefined;
                const runningNodes = appStatus?.node_statuses.filter((ns: any) => ns.running).length || 0;
                const totalNodes = app.node_selector.length;
                
                return (
                  <div key={app.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm">{app.name}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[mapStatus(app.status, isTopologyDeployed)]}`}>
                          {STATUS_LABELS[mapStatus(app.status, isTopologyDeployed)]}
                        </span>
                        {isTopologyDeployed && appStatus && (
                          <span className="text-xs text-gray-500">
                            ({runningNodes}/{totalNodes} running)
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => loadAppStatus(app.id)}
                          className="p-1 rounded hover:bg-gray-100"
                          title="Refresh Status"
                          disabled={!isTopologyDeployed}
                        >
                          <Loader2 className={`h-4 w-4 ${appStatus ? '' : 'animate-spin'}`} />
                        </button>
                        <button
                          onClick={() => logsMutation.mutate(app.id)}
                          className="p-1 rounded hover:bg-gray-100"
                          title="View Logs"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => uninstallMutation.mutate(app.id)}
                          disabled={uninstallMutation.isPending}
                          className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                          title="Uninstall"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-gray-600 space-y-1">
                      <div>Chart: {app.chart_reference}</div>
                      <div>Nodes: {getNodeNames(app.node_selector)}</div>
                      {app.version && <div>Version: {app.version}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Logs Panel */}
        {logs && (
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Application Logs</h4>
              <button
                onClick={() => setLogs('')}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded max-h-48 overflow-y-auto">
              {logs}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}