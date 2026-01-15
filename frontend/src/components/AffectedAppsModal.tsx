import {
  AlertTriangle, X, ArrowRight, Box, Zap, Check, Loader2
} from 'lucide-react';

interface AffectedAppsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  chaosType: string;
  sourceNodeId: string;
  sourceNodeName: string;
  targetNodeId?: string;
  targetNodeName?: string;
  params: Record<string, any>;
  applications: any[];
  nodes: { id: string; name: string }[];
  isLoading?: boolean;
}

const CHAOS_INFO: Record<string, { name: string; icon: string; description: string; color: string }> = {
  delay: {
    name: 'Delay',
    icon: '⏱️',
    description: 'Añade latencia a los paquetes de red',
    color: 'amber',
  },
  loss: {
    name: 'Packet Loss',
    icon: '📉',
    description: 'Causa pérdida aleatoria de paquetes',
    color: 'red',
  },
  bandwidth: {
    name: 'Bandwidth',
    icon: '📊',
    description: 'Limita el ancho de banda disponible',
    color: 'purple',
  },
  corrupt: {
    name: 'Corruption',
    icon: '🔧',
    description: 'Corrompe datos de los paquetes',
    color: 'orange',
  },
  duplicate: {
    name: 'Duplicate',
    icon: '📋',
    description: 'Duplica paquetes de red',
    color: 'cyan',
  },
  partition: {
    name: 'Partition',
    icon: '🚫',
    description: 'Bloquea completamente el tráfico',
    color: 'red',
  },
};

export function AffectedAppsModal({
  isOpen,
  onClose,
  onConfirm,
  chaosType,
  sourceNodeId,
  sourceNodeName,
  targetNodeId,
  targetNodeName,
  params,
  applications,
  isLoading = false,
}: AffectedAppsModalProps) {
  if (!isOpen) return null;

  const chaosInfo = CHAOS_INFO[chaosType] || CHAOS_INFO.delay;

  // Find affected apps
  const directApps = applications.filter(app =>
    app.node_selector.includes(sourceNodeId) && app.status === 'deployed'
  );
  const indirectApps = targetNodeId
    ? applications.filter(app =>
        app.node_selector.includes(targetNodeId) &&
        app.status === 'deployed' &&
        !app.node_selector.includes(sourceNodeId)
      )
    : [];

  const totalAffected = directApps.length + indirectApps.length;
  const hasAffectedApps = totalAffected > 0;

  // Format params for display
  const paramsList = Object.entries(params || {})
    .filter(([_, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}: ${v}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className={`p-4 bg-gradient-to-r from-${chaosInfo.color}-500 to-${chaosInfo.color}-600`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{chaosInfo.icon}</span>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Aplicar {chaosInfo.name}
                </h2>
                <p className="text-sm text-white/80">{chaosInfo.description}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/20 text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Route */}
          <div className="flex items-center justify-center gap-3 py-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="text-center">
              <div className="text-xs text-gray-500 uppercase">Source</div>
              <div className="font-semibold text-gray-900 dark:text-white">{sourceNodeName}</div>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400" />
            <div className="text-center">
              <div className="text-xs text-gray-500 uppercase">Target</div>
              <div className="font-semibold text-gray-900 dark:text-white">
                {targetNodeName || 'All traffic'}
              </div>
            </div>
          </div>

          {/* Parameters */}
          {paramsList.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {paramsList.map((param, i) => (
                <span
                  key={i}
                  className="px-2 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300"
                >
                  {param}
                </span>
              ))}
            </div>
          )}

          {/* Affected Apps Warning */}
          {hasAffectedApps ? (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                    {totalAffected} aplicacion{totalAffected !== 1 ? 'es' : ''} ser{totalAffected !== 1 ? 'án' : 'á'} afectada{totalAffected !== 1 ? 's' : ''}
                  </h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Las siguientes aplicaciones experimentarán {chaosInfo.name.toLowerCase()} en su tráfico de red:
                  </p>

                  {/* Direct Apps */}
                  {directApps.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase mb-1">
                        Impacto Directo (origen)
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {directApps.map(app => (
                          <span
                            key={app.id}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"
                          >
                            <Box className="h-3 w-3" />
                            {app.image_name.split('/').pop()?.split(':')[0] || app.image_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Indirect Apps */}
                  {indirectApps.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase mb-1">
                        Impacto Indirecto (destino)
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {indirectApps.map(app => (
                          <span
                            key={app.id}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200"
                          >
                            <Box className="h-3 w-3" />
                            {app.image_name.split('/').pop()?.split(':')[0] || app.image_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                <Check className="h-5 w-5 text-green-500" />
                <span>No hay aplicaciones desplegadas en los nodos afectados</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-white rounded-lg transition-colors flex items-center gap-2 ${
              hasAffectedApps
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-blue-600 hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Aplicando...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                {hasAffectedApps ? 'Aplicar de todos modos' : 'Aplicar Chaos'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AffectedAppsModal;
