import { useState, useEffect } from 'react';
import EnvVarsEditor from './EnvVarsEditor';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Trash2, Package } from 'lucide-react';
import { applicationsApi, DeployAppRequest, AppRuntimeStatus } from '../services/api';
import envIcon from '../assets/icons/env-icon.png';
import { SkeletonList } from './Skeleton';
import './ApplicationsPanel.css';

interface ApplicationsPanelProps {
  topologyId: string;
  nodes: Array<{ id: string; name: string }>;
  selectedNode?: { id: string; name: string } | null;
  isTopologyDeployed?: boolean;
}

// Predefined charts available
const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  deploying: 'bg-blue-100 text-blue-800',
  uninstalling: 'bg-orange-100 text-orange-800',
  error: 'bg-red-100 text-red-800',
  deployed: 'bg-green-100 text-green-800',
};

const STATUS_LABELS = {
  pending: 'Pending',
  deploying: 'Deploying',
  uninstalling: 'Uninstalling',
  error: 'Error',
  deployed: 'Deployed',
};

// Map backend status to simplified frontend status
// If topology is not deployed, all apps show as pending
// Otherwise: pending/deploying/uninstalling -> pending, failed -> error, deployed -> deployed
const mapStatus = (backendStatus: string, isTopologyDeployed: boolean = false): 'pending' | 'deploying' | 'uninstalling' | 'error' | 'deployed' => {
  // If topology is not deployed, all applications are pending
  if (!isTopologyDeployed) {
    return 'pending';
  }

  const status = backendStatus.toLowerCase();

  switch (status) {
    case 'pending':
      return 'pending';
    case 'deploying':
      return 'deploying';
    case 'uninstalling':
      return 'uninstalling';
    case 'failed':
    case 'error':
    case 'crashloopbackoff':
    case 'imagepullbackoff':
    case 'errimagepull':
      return 'error';
    case 'deployed':
    case 'running':
      return 'deployed';
    default:
      return 'pending';
  }
};

export function ApplicationsPanel({ topologyId, nodes, selectedNode, isTopologyDeployed = false }: ApplicationsPanelProps) {
  const queryClient = useQueryClient();
  const [showDeployForm, setShowDeployForm] = useState(false);
  const [deployForm, setDeployForm] = useState<any>({
    chart: '',
    node_selector: selectedNode ? [selectedNode.id] : [],
    envvalues: {},
  });
  // Eliminado: const [logs, setLogs] = useState<string>('');
  const [chartValidationError, setChartValidationError] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string>('');
  const [appStatuses, setAppStatuses] = useState<Record<string, AppRuntimeStatus>>({});
  const [showEnvEditor, setShowEnvEditor] = useState<{ appId: string, env: any[] } | null>(null);

  // Actualizar deployForm cuando cambia el nodo seleccionado
  useEffect(() => {
    if (selectedNode) {
      setDeployForm((prev: any) => ({
        ...prev,
        node_selector: [selectedNode.id]
      }));
    }
  }, [selectedNode]);

  // Query para obtener aplicaciones de la topología
  const { data: applications = [], isLoading: isLoadingApps } = useQuery({
    queryKey: ['applications', topologyId],
    queryFn: () => applicationsApi.listByTopology(topologyId),
    refetchInterval: isTopologyDeployed ? 5000 : false, // Refetch cada 5 segundos cuando la topología está desplegada
  });

  // Función para cargar el status de una app
  const loadAppStatus = async (appId: string) => {
    try {
      const status = await applicationsApi.getStatus(topologyId, appId);
      setAppStatuses(prev => ({ ...prev, [appId]: status }));
    } catch (error) {
      console.error('Failed to load app status:', error);
    }
  };

  // Cargar status de todas las apps cuando la topología está desplegada
  useEffect(() => {
    if (isTopologyDeployed && applications.length > 0) {
      applications.forEach(app => {
        loadAppStatus(app.id);
      });
    }
  }, [applications, isTopologyDeployed]);

  // Función para recargar todos los estados de runtime
  const reloadAllAppStatuses = () => {
    if (isTopologyDeployed && applications.length > 0) {
      applications.forEach(app => {
        loadAppStatus(app.id);
      });
    }
  };

  // Mutation para desplegar aplicación
  const deployMutation = useMutation({
    mutationFn: (request: DeployAppRequest) => applicationsApi.deployTopology(topologyId, request),
    onSuccess: (newApp) => {
      // Optimistic update: añadir la nueva app a la lista inmediatamente
      queryClient.setQueryData(['applications', topologyId], (oldData: any) => {
        return oldData ? [...oldData, newApp] : [newApp];
      });
      
      queryClient.invalidateQueries({ queryKey: ['applications', topologyId] });
      setShowDeployForm(false);
      setDeployForm({
        chart: '',
        node_selector: [],
        envvalues: {},
      });
      // Recargar estados de runtime después de un pequeño delay para que la DB se actualice
      setTimeout(reloadAllAppStatuses, 1000);
    },
  });

  // Mutation para desinstalar aplicación
  const uninstallMutation = useMutation({
    mutationFn: (appId: string) => applicationsApi.uninstall(topologyId, appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications', topologyId] });
      setDeleteError('');
      // Recargar estados de runtime después de desinstalar
      setTimeout(reloadAllAppStatuses, 1000);
    },
    onError: (error: any) => {
      setDeleteError(error?.message || 'Error deleting application');
    },
  });

  // Eliminado: logsMutation

  const handleDeploy = () => {
    if (!deployForm.chart.trim()) {
      setChartValidationError('Image name is required');
      return;
    }
    if (deployForm.node_selector.length === 0) {
      setChartValidationError('Select at least one node to deploy to');
      return;
    }
    setChartValidationError('');
    // Log del objeto que se enviará
    const deployPayload = {
      chart: deployForm.chart,
      node_selector: deployForm.node_selector,
      envvalues: deployForm.envvalues && Object.keys(deployForm.envvalues).length > 0 ? deployForm.envvalues : undefined
    };
    // eslint-disable-next-line no-console
    console.log('Deploy payload:', deployPayload);
    deployMutation.mutate(deployPayload);
  };

  const getNodeNames = (nodeIds: string[]) => {
    return nodeIds.map(id => {
      const node = nodes.find(n => n.id === id);
      return node ? node.name : id;
    }).join(', ');
  };

  return (
    <div className="applications-panel w-full max-w-full flex flex-col">
      <div className="applications-panel-header">
        <h3>🟢 Applications</h3>
      </div>
      <div className="p-4 flex-1 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-900">{selectedNode ? `Applications for ${selectedNode.name}` : 'All Configured Applications'}</h3>
          {selectedNode && (
            <button
              onClick={() => setShowDeployForm(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add App
            </button>
          )}
        </div>
        {showDeployForm && selectedNode && (
          <div className="mb-4 p-4 border rounded bg-gray-50">
            <h4 className="font-medium mb-2">Deploy New Application to <span className='font-bold'>{selectedNode.name}</span></h4>
            <input
              type="text"
              placeholder="Image name (e.g. nginx:latest)"
              value={deployForm.chart}
              onChange={e => setDeployForm((prev: any) => ({ ...prev, chart: e.target.value }))}
              className="mb-2 p-2 border rounded w-full"
            />
            {chartValidationError && <div className="text-red-600 text-sm mb-2">{chartValidationError}</div>}
            <div className="flex gap-2">
              <button
                onClick={handleDeploy}
                disabled={deployMutation.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
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
        )}
        {deleteError && (
          <div className="mb-2 text-red-600 text-sm font-semibold">{deleteError}</div>
        )}
        {isLoadingApps ? (
          <SkeletonList count={3} />
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
              const runningNodes = appStatus?.node_statuses?.filter((ns: any) => ns.running).length || 0;
              const totalNodes = app.node_selector.length;
              return (
                <div key={app.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-col gap-0.5">
                      <h4 className="font-bold text-[11px] leading-tight break-all">{app.id}</h4>
                      <span className={`block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium w-fit ${STATUS_COLORS[mapStatus(app.status, isTopologyDeployed)]}`}>
                        {STATUS_LABELS[mapStatus(app.status, isTopologyDeployed)]}
                      </span>
                      {false && (
                        <span className="text-[11px] font-bold text-gray-400 break-all">{app.id}</span>
                      )}
                      {isTopologyDeployed && appStatus && (
                        <span className="text-xs text-gray-500">
                          ({runningNodes}/{totalNodes} running)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={async () => {
                          if (isTopologyDeployed) return;
                          console.log('ApplicationsPanel: opening EnvVarsEditor, fetching latest app', { topologyId, appId: app.id });
                          try {
                            const freshApp = await applicationsApi.get(topologyId, app.id);
                            console.log('ApplicationsPanel: fetched app for EnvVarsEditor', { appId: app.id, envvalues: freshApp.envvalues, values: (freshApp as any).values });
                            const rawEnv = freshApp.envvalues || (freshApp as any).values;
                            let envList: Array<{ name: string; value: string }> = [];
                            if (Array.isArray(rawEnv?.env)) {
                              envList = rawEnv.env;
                            } else if (Array.isArray(rawEnv)) {
                              envList = rawEnv;
                            } else if (rawEnv && typeof rawEnv === 'object') {
                              envList = Object.entries(rawEnv).map(([k, v]) => ({ name: k, value: v == null ? '' : String(v) }));
                            }
                            console.log('ApplicationsPanel: normalized env for editor', { appId: app.id, envList });
                            setShowEnvEditor({ appId: app.id, env: envList });
                          } catch (e) {
                            console.error('ApplicationsPanel: Failed to fetch app before opening env editor, falling back to cached values', e);
                            const fallbackRaw = app.envvalues || (app as any).values;
                            let fallbackList: Array<{ name: string; value: string }> = [];
                            if (Array.isArray(fallbackRaw?.env)) {
                              fallbackList = fallbackRaw.env;
                            } else if (Array.isArray(fallbackRaw)) {
                              fallbackList = fallbackRaw;
                            } else if (fallbackRaw && typeof fallbackRaw === 'object') {
                              fallbackList = Object.entries(fallbackRaw).map(([k, v]) => ({ name: k, value: v == null ? '' : String(v) }));
                            }
                            setShowEnvEditor({ appId: app.id, env: fallbackList });
                          }
                        }}
                        disabled={isTopologyDeployed}
                        className="p-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isTopologyDeployed ? "Cannot edit env vars while topology is deployed" : "Editar variables de entorno"}
                      >
                        <img src={envIcon} alt="Env" className="h-4 w-7" />
                      </button>
                      <button
                        onClick={() => {
                          if (!isTopologyDeployed) {
                            uninstallMutation.mutate(app.id);
                          }
                        }}
                        disabled={uninstallMutation.isPending || isTopologyDeployed}
                        className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                        title="Uninstall"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>Image: {app.image_name}</div>
                    <div>Nodes: {getNodeNames(app.node_selector)}</div>
                    {/* Eliminado campo Version */}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* Eliminado: Logs Panel */}
        {showEnvEditor && (
          <EnvVarsEditor
            initialVars={showEnvEditor.env}
            onSave={async (vars) => {
              console.log('ApplicationsPanel: saving env for app', showEnvEditor.appId, vars);
              const payload = { env: vars };
              console.log('ApplicationsPanel: PUT payload for updateAppValues', payload);
              try {
                // Call backend to update app envvalues (send array inside object)
                const res = await applicationsApi.updateAppValues(topologyId, showEnvEditor.appId, payload);
                console.log('ApplicationsPanel: updateAppValues success', res);
                // Invalidate applications list so UI reflects persisted changes
                queryClient.invalidateQueries({ queryKey: ['applications', topologyId] });
                // Also refresh runtime statuses after a short delay
                setTimeout(reloadAllAppStatuses, 500);
              } catch (e:any) {
                console.error('ApplicationsPanel: updateAppValues failed', e);
                alert('No se pudo guardar las variables en la aplicación: ' + (e?.message || e));
              }
              setShowEnvEditor(null);
            }}
            onClose={() => setShowEnvEditor(null)}
          />
        )}
      </div>
    </div>
  );
}