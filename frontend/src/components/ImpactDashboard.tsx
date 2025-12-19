import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Zap, Box, AlertTriangle, Activity, ArrowRight,
  Wifi, WifiOff, Server
} from 'lucide-react';
import { chaosApi, applicationsApi } from '../services/api';

interface ImpactDashboardProps {
  topologyId: string;
  nodes: { id: string; name: string }[];
  isDeployed?: boolean;
}

interface AffectedApp {
  app_id: string;
  app_name: string;
  node_id: string;
  node_name: string;
  impact: 'direct' | 'indirect';
}

interface AffectedAppsResponse {
  condition_id: string;
  chaos_type: string;
  source_node_id: string;
  target_node_id: string | null;
  affected_apps: AffectedApp[];
  total_affected: number;
}

const CHAOS_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  delay: { icon: '⏱️', color: 'text-amber-600', bg: 'bg-amber-100' },
  loss: { icon: '📉', color: 'text-red-600', bg: 'bg-red-100' },
  bandwidth: { icon: '📊', color: 'text-purple-600', bg: 'bg-purple-100' },
  corrupt: { icon: '🔧', color: 'text-orange-600', bg: 'bg-orange-100' },
  duplicate: { icon: '📋', color: 'text-cyan-600', bg: 'bg-cyan-100' },
  partition: { icon: '🚫', color: 'text-red-700', bg: 'bg-red-200' },
};

export function ImpactDashboard({ topologyId, nodes }: ImpactDashboardProps) {
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [affectedApps, setAffectedApps] = useState<AffectedAppsResponse | null>(null);

  // Fetch chaos conditions
  const { data: chaosConditions = [] } = useQuery({
    queryKey: ['chaos-conditions', topologyId],
    queryFn: () => chaosApi.list(topologyId),
    enabled: !!topologyId,
    refetchInterval: 5000,
  });

  // Fetch applications
  const { data: applications = [] } = useQuery({
    queryKey: ['applications', topologyId],
    queryFn: () => applicationsApi.listByTopology(topologyId),
    enabled: !!topologyId,
    refetchInterval: 5000,
  });

  // Fetch affected apps when condition is selected
  useEffect(() => {
    if (selectedCondition) {
      fetch(`/api/v1/chaos/${selectedCondition}/affected-apps`)
        .then(res => res.json())
        .then(data => setAffectedApps(data))
        .catch(() => setAffectedApps(null));
    } else {
      setAffectedApps(null);
    }
  }, [selectedCondition]);

  const activeConditions = chaosConditions.filter((c: any) => c.status === 'active');
  const nodeMap = new Map(nodes.map(n => [n.id, n.name]));

  // Calculate stats
  const totalApps = applications.length;
  const deployedApps = applications.filter((a: any) => a.status === 'deployed').length;
  const affectedNodeIds = new Set(activeConditions.flatMap((c: any) =>
    [c.source_node_id, c.target_node_id].filter(Boolean)
  ));
  const nodesWithApps = new Set(applications.flatMap((a: any) => a.node_selector));
  const affectedNodesWithApps = [...affectedNodeIds].filter(id => nodesWithApps.has(id as string));

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-600 to-indigo-600">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Impact Dashboard
        </h2>
        <p className="text-purple-100 text-sm mt-1">
          Visualiza el impacto del chaos en tus aplicaciones
        </p>
      </div>

      {/* Stats Cards */}
      <div className="flex-shrink-0 p-4 grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-amber-600">
            <Zap className="h-4 w-4" />
            <span className="text-xs font-medium uppercase">Chaos Activo</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {activeConditions.length}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-blue-600">
            <Box className="h-4 w-4" />
            <span className="text-xs font-medium uppercase">Apps</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {deployedApps}/{totalApps}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-medium uppercase">Nodos Afectados</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {affectedNodesWithApps.length}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-green-600">
            <Server className="h-4 w-4" />
            <span className="text-xs font-medium uppercase">Nodos Total</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {nodes.length}
          </div>
        </div>
      </div>

      {/* Active Chaos List */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
          Condiciones Activas
        </h3>

        {activeConditions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Wifi className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No hay chaos activo</p>
            <p className="text-sm">La red funciona normalmente</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeConditions.map(condition => {
              const chaosInfo = CHAOS_ICONS[condition.chaos_type] || CHAOS_ICONS.delay;
              const isSelected = selectedCondition === condition.id;

              return (
                <div
                  key={condition.id}
                  className={`rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedCondition(isSelected ? null : condition.id)}
                >
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-lg ${chaosInfo.bg} p-1 rounded`}>
                          {chaosInfo.icon}
                        </span>
                        <div>
                          <span className={`text-sm font-medium ${chaosInfo.color}`}>
                            {condition.chaos_type.toUpperCase()}
                          </span>
                          {(condition.params as any)?.latency && (
                            <span className="text-xs text-gray-500 ml-2">
                              {(condition.params as any).latency}
                            </span>
                          )}
                          {(condition.params as any)?.loss && (
                            <span className="text-xs text-gray-500 ml-2">
                              {(condition.params as any).loss}%
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">
                        ACTIVE
                      </span>
                    </div>

                    <div className="mt-2 flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium">{nodeMap.get(condition.source_node_id) || condition.source_node_id}</span>
                      <ArrowRight className="h-4 w-4 mx-2" />
                      <span className="font-medium">
                        {condition.target_node_id
                          ? (nodeMap.get(condition.target_node_id) || condition.target_node_id)
                          : 'All'}
                      </span>
                    </div>
                  </div>

                  {/* Affected Apps Section */}
                  {isSelected && affectedApps && (
                    <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50">
                      <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2 flex items-center gap-1">
                        <Box className="h-3 w-3" />
                        Apps Afectadas ({affectedApps.total_affected})
                      </h4>
                      {affectedApps.affected_apps.length === 0 ? (
                        <p className="text-xs text-gray-500">No hay apps en los nodos afectados</p>
                      ) : (
                        <div className="space-y-1">
                          {affectedApps.affected_apps.map(app => (
                            <div
                              key={`${app.app_id}-${app.node_id}`}
                              className="flex items-center justify-between text-xs bg-white dark:bg-gray-700 rounded p-2"
                            >
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded text-white ${
                                  app.impact === 'direct' ? 'bg-red-500' : 'bg-yellow-500'
                                }`}>
                                  {app.impact === 'direct' ? 'DIRECT' : 'INDIRECT'}
                                </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {app.app_name}
                                </span>
                              </div>
                              <span className="text-gray-500">
                                @ {app.node_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Apps by Node */}
        {applications.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mt-6">
              Apps por Nodo
            </h3>
            <div className="space-y-2">
              {nodes.map(node => {
                const nodeApps = applications.filter((a: any) => a.node_selector.includes(node.id));
                const isAffected = affectedNodeIds.has(node.id);

                if (nodeApps.length === 0) return null;

                return (
                  <div
                    key={node.id}
                    className={`rounded-lg border p-3 ${
                      isAffected
                        ? 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        {node.name}
                      </span>
                      {isAffected && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800 flex items-center gap-1">
                          <WifiOff className="h-3 w-3" />
                          AFFECTED
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {nodeApps.map((app: any) => (
                        <span
                          key={app.id}
                          className={`px-2 py-1 text-xs rounded-full ${
                            app.status === 'deployed'
                              ? 'bg-green-100 text-green-800'
                              : app.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {app.image_name.split('/').pop()?.split(':')[0] || app.image_name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ImpactDashboard;
