import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Play, Loader2, Check, X, ArrowRight, Clock, Zap,
  Wifi, AlertTriangle
} from 'lucide-react';

interface AppToAppTestProps {
  topologyId: string;
  applications: any[];
  nodes: { id: string; name: string }[];
  onTestStart?: (fromAppId: string, toAppId: string) => void;
  onTestComplete?: (result: TestResult) => void;
}

interface TestResult {
  from_app: {
    app_id: string;
    app_name: string;
    node_id: string;
    node_name: string;
    pod_ip: string | null;
  };
  to_app: {
    app_id: string;
    app_name: string;
    node_id: string;
    node_name: string;
    pod_ip: string | null;
  };
  test_type: string;
  success: boolean;
  latency_ms: number | null;
  status_code: number | null;
  error: string | null;
  chaos_affecting: {
    condition_id: string;
    chaos_type: string;
    status: string;
    impact: string;
  }[];
}

export function AppToAppTest({
  topologyId,
  applications,
  nodes,
  onTestStart,
  onTestComplete,
}: AppToAppTestProps) {
  const [fromApp, setFromApp] = useState<string>('');
  const [toApp, setToApp] = useState<string>('');
  const [testType, setTestType] = useState<'ping' | 'tcp' | 'http'>('ping');
  const [port, setPort] = useState<string>('80');
  const [lastResult, setLastResult] = useState<TestResult | null>(null);

  const deployedApps = applications.filter((a: any) => a.status === 'deployed');
  const nodeMap = new Map(nodes.map((n: any) => [n.id, n.name]));

  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/topologies/${topologyId}/tests/app-to-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_app_id: fromApp,
          to_app_id: toApp,
          test_type: testType,
          port: testType !== 'ping' ? parseInt(port) : undefined,
          timeout_secs: 10,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Test failed');
      }
      return response.json() as Promise<TestResult>;
    },
    onMutate: () => {
      onTestStart?.(fromApp, toApp);
    },
    onSuccess: (result) => {
      setLastResult(result);
      onTestComplete?.(result);
    },
    onError: (error) => {
      console.error('Test error:', error);
    },
  });

  const handleRunTest = () => {
    if (fromApp && toApp && fromApp !== toApp) {
      testMutation.mutate();
    }
  };

  const getAppLabel = (app: any) => {
    const nodeNames = app.node_selector
      .map((id: string) => nodeMap.get(id) || id)
      .join(', ');
    const imageName = app.image_name.split('/').pop()?.split(':')[0] || app.image_name;
    return `${imageName} @ ${nodeNames}`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white">
        <h3 className="font-semibold flex items-center gap-2">
          <Wifi className="h-4 w-4" />
          Test App-to-App
        </h3>
        <p className="text-xs text-blue-100 mt-0.5">
          Prueba conectividad entre aplicaciones desplegadas
        </p>
      </div>

      {/* Form */}
      <div className="p-4 space-y-4">
        {deployedApps.length < 2 ? (
          <div className="text-center py-4 text-gray-500">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Necesitas al menos 2 apps desplegadas</p>
          </div>
        ) : (
          <>
            {/* From App */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Desde App
              </label>
              <select
                value={fromApp}
                onChange={(e) => setFromApp(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Seleccionar...</option>
                {deployedApps.map(app => (
                  <option key={app.id} value={app.id} disabled={app.id === toApp}>
                    {getAppLabel(app)}
                  </option>
                ))}
              </select>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <ArrowRight className="h-5 w-5 text-gray-400" />
            </div>

            {/* To App */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Hacia App
              </label>
              <select
                value={toApp}
                onChange={(e) => setToApp(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Seleccionar...</option>
                {deployedApps.map(app => (
                  <option key={app.id} value={app.id} disabled={app.id === fromApp}>
                    {getAppLabel(app)}
                  </option>
                ))}
              </select>
            </div>

            {/* Test Type */}
            <div className="flex gap-2">
              {(['ping', 'tcp', 'http'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setTestType(type)}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                    testType === type
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Port (for TCP/HTTP) */}
            {testType !== 'ping' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Puerto
                </label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="80"
                />
              </div>
            )}

            {/* Run Button */}
            <button
              onClick={handleRunTest}
              disabled={!fromApp || !toApp || fromApp === toApp || testMutation.isPending}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {testMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ejecutando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Ejecutar Test
                </>
              )}
            </button>
          </>
        )}

        {/* Result */}
        {lastResult && (
          <div className={`rounded-lg p-4 ${
            lastResult.success
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {lastResult.success ? (
                  <Check className="h-5 w-5 text-green-600" />
                ) : (
                  <X className="h-5 w-5 text-red-600" />
                )}
                <span className={`font-semibold ${
                  lastResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                }`}>
                  {lastResult.success ? 'Conectado' : 'Fallo'}
                </span>
              </div>
              <span className="text-xs text-gray-500 uppercase">
                {lastResult.test_type}
              </span>
            </div>

            {/* Route */}
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span className="font-medium">{lastResult.from_app.app_name}</span>
              <ArrowRight className="h-3 w-3 inline mx-1" />
              <span className="font-medium">{lastResult.to_app.app_name}</span>
            </div>

            {/* Metrics */}
            <div className="flex gap-4 text-sm">
              {lastResult.latency_ms != null && (
                <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                  <Clock className="h-3 w-3" />
                  <span>{lastResult.latency_ms.toFixed(2)} ms</span>
                </div>
              )}
              {lastResult.status_code != null && (
                <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                  <span>HTTP {lastResult.status_code}</span>
                </div>
              )}
            </div>

            {/* Error */}
            {lastResult.error && (
              <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                Error: {lastResult.error}
              </div>
            )}

            {/* Chaos Affecting */}
            {lastResult.chaos_affecting.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Chaos Afectando
                </div>
                <div className="flex flex-wrap gap-1">
                  {lastResult.chaos_affecting.map((c, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"
                    >
                      {c.chaos_type} ({c.impact})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {testMutation.isError && (
          <div className="text-sm text-red-600 dark:text-red-400 text-center">
            {(testMutation.error as Error).message}
          </div>
        )}
      </div>
    </div>
  );
}

export default AppToAppTest;
