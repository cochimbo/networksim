import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Play, Trash2, FileText, Loader2 } from 'lucide-react';
import { applicationsApi, Application, DeployAppRequest } from '../services/api';

interface ApplicationsModalProps {
  topologyId: string;
  nodeId: string;
  nodeName: string;
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  deploying: 'bg-blue-100 text-blue-800',
  deployed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  uninstalling: 'bg-orange-100 text-orange-800',
};

const STATUS_LABELS = {
  pending: 'Pending',
  deploying: 'Deploying',
  deployed: 'Deployed',
  failed: 'Failed',
  uninstalling: 'Uninstalling',
};

// Ejemplos de charts comunes para mostrar como ayuda
const COMMON_CHART_EXAMPLES = [
  'nginx', 'redis', 'postgres', 'mysql', 'mongodb', 'rabbitmq',
  'prometheus', 'grafana', 'elasticsearch', 'jenkins'
];

export function ApplicationsModal({ topologyId, nodeId, nodeName, isOpen, onClose }: ApplicationsModalProps) {
  const queryClient = useQueryClient();
  const [showDeployForm, setShowDeployForm] = useState(false);
  const [deployForm, setDeployForm] = useState<DeployAppRequest>({
    chart: '',
    name: '',
    version: '',
    values: {},
  });
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [chartValidationError, setChartValidationError] = useState<string>('');

  // Query para obtener aplicaciones del nodo
  const { data: applications = [], isLoading, refetch } = useQuery({
    queryKey: ['applications', topologyId, nodeId],
    queryFn: () => applicationsApi.listByNode(topologyId, nodeId),
    enabled: isOpen,
    refetchInterval: isOpen ? 5000 : false, // Actualizar cada 5 segundos cuando el modal esté abierto
  });

  // Query para obtener logs de una aplicación
  const { data: appLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['application-logs', topologyId, selectedApp?.id],
    queryFn: () => selectedApp ? applicationsApi.getLogs(topologyId, selectedApp.id) : Promise.resolve(null),
    enabled: !!selectedApp,
  });

  // Mutation para desplegar aplicación
  const deployMutation = useMutation({
    mutationFn: (request: DeployAppRequest) => applicationsApi.deploy(topologyId, nodeId, request),
    onSuccess: () => {
      // Invalidar y refetch la query para asegurar actualización
      queryClient.invalidateQueries({ queryKey: ['applications', topologyId, nodeId] });
      setShowDeployForm(false);
      setDeployForm({
        chart: '',
        name: '',
        version: '',
        values: {},
      });
    },
    onError: (error) => {
      console.error('Error deploying application:', error);
      alert(`Error al desplegar la aplicación: ${error.message || 'Error desconocido'}`);
    },
  });

  // Mutation para desinstalar aplicación
  const uninstallMutation = useMutation({
    mutationFn: (appId: string) => applicationsApi.uninstall(topologyId, appId),
    onSuccess: () => {
      refetch();
      setSelectedApp(null);
      setLogs('');
    },
  });

  // Actualizar logs cuando cambie appLogs
  useEffect(() => {
    if (appLogs?.logs) {
      setLogs(appLogs.logs);
    }
  }, [appLogs]);

  // Validar formato del chart
  const validateChart = (chart: string): string => {
    if (!chart.trim()) {
      return '';
    }

    // Charts válidos: solo nombre (para charts por defecto), o repo/nombre
    const chartRegex = /^([a-z0-9-]+\/)?[a-z0-9-]+$/;
    if (!chartRegex.test(chart)) {
      return 'Formato inválido. Use: nombre o repositorio/nombre';
    }

    // Verificar que no tenga caracteres especiales problemáticos
    if (chart.includes(' ') || chart.includes('\t')) {
      return 'El nombre del chart no puede contener espacios';
    }

    return '';
  };

  // Manejar cambios en el campo chart
  const handleChartChange = (value: string) => {
    setDeployForm(prev => ({ ...prev, chart: value }));
    setChartValidationError(validateChart(value));
  };

  // Seleccionar un ejemplo de chart
  const selectChartExample = (chartName: string) => {
    setDeployForm(prev => ({ ...prev, chart: chartName }));
    setChartValidationError('');
  };

  const handleShowDeployForm = () => {
    setShowDeployForm(true);
    setDeployForm({
      chart: '',
      name: '',
      version: '',
      values: {},
    });
    setChartValidationError('');
  };

  const handleDeploy = () => {
    if (!deployForm.chart.trim()) {
      alert('El campo Chart de Helm es obligatorio');
      return;
    }

    const validationError = validateChart(deployForm.chart);
    if (validationError) {
      setChartValidationError(validationError);
      alert(`Error de validación: ${validationError}`);
      return;
    }

    console.log('Deploying application:', deployForm);
    deployMutation.mutate(deployForm);
  };

  const handleUninstall = (app: Application) => {
    if (confirm(`¿Desinstalar la aplicación "${app.name}"?`)) {
      uninstallMutation.mutate(app.id);
    }
  };

  const handleViewLogs = (app: Application) => {
    setSelectedApp(app);
    refetchLogs();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Aplicaciones - {nodeName}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Gestiona aplicaciones Helm desplegadas en este nodo
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex" style={{ height: 'calc(90vh - 120px)' }}>
          {/* Lista de aplicaciones */}
          <div className="w-1/2 border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">Aplicaciones Desplegadas</h3>
                <button
                  onClick={handleShowDeployForm}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Desplegar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : applications.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">📦</div>
                  <p>No hay aplicaciones desplegadas</p>
                  <p className="text-sm mt-1">Haz click en "Desplegar" para agregar una</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {applications.map((app) => (
                    <div
                      key={app.id}
                      className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                        selectedApp?.id === app.id
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedApp(app)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900">{app.name}</h4>
                        <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[app.status]}`}>
                          {STATUS_LABELS[app.status]}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>Chart: {app.chart}</div>
                        {app.version && <div>Versión: {app.version}</div>}
                        <div>Namespace: {app.namespace}</div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewLogs(app);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                        >
                          <FileText className="h-3 w-3" />
                          Logs
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUninstall(app);
                          }}
                          disabled={uninstallMutation.isPending}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Panel derecho - Formulario de despliegue o detalles/logs */}
          <div className="w-1/2 flex flex-col">
            {showDeployForm ? (
              <div className="flex-1 overflow-y-auto p-4">
                <h3 className="font-medium text-gray-900 mb-4">Desplegar Nueva Aplicación</h3>
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
                  <div className="text-sm text-blue-800">
                    <strong>Namespace:</strong> Las aplicaciones se despliegan en <code className="bg-blue-100 px-1 rounded text-xs">networksim-sim</code> para funcionar con las políticas de red.
                  </div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-md p-3 mb-4">
                  <div className="text-sm text-green-800">
                    <strong>Charts:</strong> Usa charts como <code className="bg-green-100 px-1 rounded text-xs">nginx</code>, <code className="bg-green-100 px-1 rounded text-xs">redis</code>, <code className="bg-green-100 px-1 rounded text-xs">postgres</code> o <code className="bg-green-100 px-1 rounded text-xs">repo/chart</code> para repositorios específicos.
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Chart de Helm *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={deployForm.chart}
                        onChange={(e) => handleChartChange(e.target.value)}
                        placeholder="nginx, redis, postgres, etc."
                        className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                          chartValidationError ? 'border-red-300' : 'border-gray-300'
                        }`}
                      />
                      {deployForm.chart === '' ? (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-y-auto">
                          <div className="px-3 py-2 text-sm text-gray-500 border-b border-gray-100">
                            <strong>Ejemplos de charts:</strong>
                          </div>
                          <div className="grid grid-cols-2 gap-1 p-2">
                            {COMMON_CHART_EXAMPLES.slice(0, 10).map((chart, index) => (
                              <button
                                key={index}
                                onClick={() => selectChartExample(chart)}
                                className="text-left px-2 py-1 text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none rounded"
                              >
                                {chart}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    {chartValidationError && (
                      <p className="mt-1 text-sm text-red-600">{chartValidationError}</p>
                    )}
                    {!chartValidationError && deployForm.chart && (
                      <p className="mt-1 text-sm text-green-600">✓ Formato válido</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre de la aplicación
                    </label>
                    <input
                      type="text"
                      value={deployForm.name}
                      onChange={(e) => setDeployForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Opcional - se generará automáticamente"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Versión
                    </label>
                    <input
                      type="text"
                      value={deployForm.version || ''}
                      onChange={(e) => setDeployForm(prev => ({ ...prev, version: e.target.value }))}
                      placeholder="Opcional - usa la última versión"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={handleDeploy}
                      disabled={deployMutation.isPending || !deployForm.chart.trim()}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deployMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Desplegar
                    </button>
                    <button
                      onClick={() => setShowDeployForm(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            ) : selectedApp ? (
              <div className="flex-1 flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-medium text-gray-900">Logs - {selectedApp.name}</h3>
                </div>
                <div className="flex-1 p-4 overflow-y-auto">
                  <pre className="text-xs font-mono bg-gray-900 text-green-400 p-3 rounded whitespace-pre-wrap">
                    {logs || 'Cargando logs...'}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <div className="text-4xl mb-2">📋</div>
                  <p>Selecciona una aplicación para ver sus logs</p>
                  <p className="text-sm mt-1">O despliega una nueva aplicación</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}