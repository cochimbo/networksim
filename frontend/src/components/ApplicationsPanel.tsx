import { useState, useEffect } from 'react';
import EnvVarsEditor from './EnvVarsEditor';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Trash2, Package, ChevronDown, ChevronUp, HardDrive, Cpu, Heart, FileText } from 'lucide-react';
import { applicationsApi, DeployAppRequest, AppRuntimeStatus, VolumeMount, HealthCheck } from '../services/api';
import envIcon from '../assets/icons/env-icon.png';
import { SkeletonList } from './Skeleton';
import { LogViewerModal } from './LogViewerModal';
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [deployForm, setDeployForm] = useState<{
    chart: string;
    node_selector: string[];
    envvalues: Record<string, any>;
    replicas: number;
    volumes: VolumeMount[];
    cpu_request: string;
    memory_request: string;
    cpu_limit: string;
    memory_limit: string;
    healthCheck?: HealthCheck;
  }>({
    chart: '',
    node_selector: selectedNode ? [selectedNode.id] : [],
    envvalues: {},
    replicas: 1,
    volumes: [],
    cpu_request: '',
    memory_request: '',
    cpu_limit: '',
    memory_limit: '',
  });
  const [chartValidationError, setChartValidationError] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string>('');
  const [appStatuses, setAppStatuses] = useState<Record<string, AppRuntimeStatus>>({});
  const [showEnvEditor, setShowEnvEditor] = useState<{ appId: string, env: any[] } | null>(null);
  const [logViewer, setLogViewer] = useState<{ appId: string; appName: string } | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setShowAdvanced(false);
      setDeployForm({
        chart: '',
        node_selector: [],
        envvalues: {},
        replicas: 1,
        volumes: [],
        cpu_request: '',
        memory_request: '',
        cpu_limit: '',
        memory_limit: '',
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

  const handleUseLocalRegistry = () => {
    const prefix = 'host.k3d.internal:5000/';
    if (!deployForm.chart.startsWith(prefix)) {
      setDeployForm(prev => ({ ...prev, chart: prefix + prev.chart }));
    }
  };

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
    // Build deploy payload with all fields
    const deployPayload: DeployAppRequest = {
      chart: deployForm.chart,
      node_selector: deployForm.node_selector,
      envvalues: deployForm.envvalues && Object.keys(deployForm.envvalues).length > 0 ? deployForm.envvalues : undefined,
      replicas: deployForm.replicas > 1 ? deployForm.replicas : undefined,
      volumes: deployForm.volumes.length > 0 ? deployForm.volumes : undefined,
      healthCheck: deployForm.healthCheck,
      cpu_request: deployForm.cpu_request || undefined,
      memory_request: deployForm.memory_request || undefined,
      cpu_limit: deployForm.cpu_limit || undefined,
      memory_limit: deployForm.memory_limit || undefined,
    };
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
            <h4 className="font-medium mb-3">Deploy New Application to <span className='font-bold'>{selectedNode.name}</span></h4>

            {/* Basic fields */}
            <div className="space-y-2 mb-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-700">Image Name</label>
                <button
                  type="button"
                  onClick={handleUseLocalRegistry}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  title="Prefix with host.k3d.internal:5000/"
                >
                  Use local registry
                </button>
              </div>
              <input
                type="text"
                placeholder="Image name (e.g. nginx:latest)"
                value={deployForm.chart}
                onChange={e => setDeployForm(prev => ({ ...prev, chart: e.target.value }))}
                className="p-2 border rounded w-full text-sm"
              />
              {chartValidationError && <div className="text-red-600 text-sm">{chartValidationError}</div>}

              {/* Replicas */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 w-20">Replicas:</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={deployForm.replicas}
                  onChange={e => setDeployForm(prev => ({ ...prev, replicas: parseInt(e.target.value) || 1 }))}
                  className="p-2 border rounded w-20 text-sm"
                />
              </div>
            </div>

            {/* Advanced options toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-2"
            >
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Advanced Options
            </button>

            {showAdvanced && (
              <div className="space-y-3 p-3 bg-white border rounded mb-3">
                {/* Resource Limits */}
                <div>
                  <div className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                    <Cpu className="h-4 w-4" /> Resources
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="CPU Request (e.g. 100m)"
                      value={deployForm.cpu_request}
                      onChange={e => setDeployForm(prev => ({ ...prev, cpu_request: e.target.value }))}
                      className="p-2 border rounded text-xs"
                    />
                    <input
                      type="text"
                      placeholder="CPU Limit (e.g. 500m)"
                      value={deployForm.cpu_limit}
                      onChange={e => setDeployForm(prev => ({ ...prev, cpu_limit: e.target.value }))}
                      className="p-2 border rounded text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Memory Request (e.g. 64Mi)"
                      value={deployForm.memory_request}
                      onChange={e => setDeployForm(prev => ({ ...prev, memory_request: e.target.value }))}
                      className="p-2 border rounded text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Memory Limit (e.g. 256Mi)"
                      value={deployForm.memory_limit}
                      onChange={e => setDeployForm(prev => ({ ...prev, memory_limit: e.target.value }))}
                      className="p-2 border rounded text-xs"
                    />
                  </div>
                </div>

                {/* Volumes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1 text-sm font-medium text-gray-700">
                      <HardDrive className="h-4 w-4" /> Volumes
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeployForm(prev => ({
                        ...prev,
                        volumes: [...prev.volumes, { name: `vol-${prev.volumes.length + 1}`, mountPath: '/data', type: 'emptyDir' }]
                      }))}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      + Add Volume
                    </button>
                  </div>
                  {deployForm.volumes.map((vol, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-2">
                      <select
                        value={vol.type}
                        onChange={e => {
                          const newVols = [...deployForm.volumes];
                          newVols[idx] = { ...vol, type: e.target.value as VolumeMount['type'] };
                          setDeployForm(prev => ({ ...prev, volumes: newVols }));
                        }}
                        className="p-1 border rounded text-xs w-24"
                      >
                        <option value="emptyDir">emptyDir</option>
                        <option value="hostPath">hostPath</option>
                        <option value="configMap">configMap</option>
                        <option value="secret">secret</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Mount path"
                        value={vol.mountPath}
                        onChange={e => {
                          const newVols = [...deployForm.volumes];
                          newVols[idx] = { ...vol, mountPath: e.target.value };
                          setDeployForm(prev => ({ ...prev, volumes: newVols }));
                        }}
                        className="p-1 border rounded text-xs flex-1"
                      />
                      {vol.type !== 'emptyDir' && (
                        <input
                          type="text"
                          placeholder={vol.type === 'hostPath' ? '/host/path' : 'name'}
                          value={vol.source || ''}
                          onChange={e => {
                            const newVols = [...deployForm.volumes];
                            newVols[idx] = { ...vol, source: e.target.value };
                            setDeployForm(prev => ({ ...prev, volumes: newVols }));
                          }}
                          className="p-1 border rounded text-xs w-28"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setDeployForm(prev => ({
                          ...prev,
                          volumes: prev.volumes.filter((_, i) => i !== idx)
                        }))}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Health Check */}
                <div>
                  <div className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                    <Heart className="h-4 w-4" /> Health Check
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={deployForm.healthCheck?.type || ''}
                      onChange={e => {
                        if (!e.target.value) {
                          setDeployForm(prev => ({ ...prev, healthCheck: undefined }));
                        } else {
                          setDeployForm(prev => ({
                            ...prev,
                            healthCheck: { type: e.target.value as HealthCheck['type'], port: 80, path: '/health' }
                          }));
                        }
                      }}
                      className="p-1 border rounded text-xs"
                    >
                      <option value="">None</option>
                      <option value="http">HTTP</option>
                      <option value="tcp">TCP</option>
                    </select>
                    {deployForm.healthCheck?.type === 'http' && (
                      <>
                        <input
                          type="text"
                          placeholder="/health"
                          value={deployForm.healthCheck.path || ''}
                          onChange={e => setDeployForm(prev => ({
                            ...prev,
                            healthCheck: { ...prev.healthCheck!, path: e.target.value }
                          }))}
                          className="p-1 border rounded text-xs w-20"
                        />
                        <input
                          type="number"
                          placeholder="80"
                          value={deployForm.healthCheck.port || ''}
                          onChange={e => setDeployForm(prev => ({
                            ...prev,
                            healthCheck: { ...prev.healthCheck!, port: parseInt(e.target.value) || 80 }
                          }))}
                          className="p-1 border rounded text-xs w-16"
                        />
                      </>
                    )}
                    {deployForm.healthCheck?.type === 'tcp' && (
                      <input
                        type="number"
                        placeholder="Port"
                        value={deployForm.healthCheck.port || ''}
                        onChange={e => setDeployForm(prev => ({
                          ...prev,
                          healthCheck: { ...prev.healthCheck!, port: parseInt(e.target.value) || 80 }
                        }))}
                        className="p-1 border rounded text-xs w-16"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

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
                onClick={() => { setShowDeployForm(false); setShowAdvanced(false); }}
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
                      {/* Show replicas and resources */}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {(app.replicas && app.replicas > 1) && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                            {app.replicas}x replicas
                          </span>
                        )}
                        {(app.cpu_limit || app.memory_limit) && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded flex items-center gap-1">
                            <Cpu className="h-3 w-3" />
                            {app.cpu_limit || app.cpu_request || '-'} / {app.memory_limit || app.memory_request || '-'}
                          </span>
                        )}
                        {(app.volumes && app.volumes.length > 0) && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            {app.volumes.length} vol
                          </span>
                        )}
                        {app.healthCheck && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-600 rounded flex items-center gap-1">
                            <Heart className="h-3 w-3" />
                            {app.healthCheck.type}
                          </span>
                        )}
                      </div>
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
                        onClick={() => setLogViewer({ appId: app.id, appName: app.image_name })}
                        disabled={!isTopologyDeployed}
                        className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                        title={isTopologyDeployed ? "View Logs" : "Logs available only when deployed"}
                      >
                        <FileText className="h-4 w-4" />
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
        {logViewer && (
          <LogViewerModal
            isOpen={true}
            onClose={() => setLogViewer(null)}
            topologyId={topologyId}
            appId={logViewer.appId}
            appName={logViewer.appName}
          />
        )}
      </div>
    </div>
  );
}