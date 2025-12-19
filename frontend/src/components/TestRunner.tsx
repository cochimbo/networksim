import { useEffect, useState, useCallback } from 'react';
import {
  Play,
  Square,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  TestTube,
  Zap,
  Activity,
  FileSearch,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import api from '../services/api';

interface TestRun {
  id: string;
  topology_id: string;
  test_type: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  results?: any;
  error_message?: string;
  created_at: string;
}

interface TestRunnerProps {
  topologyId: string;
  onTestComplete?: (result: TestRun) => void;
  className?: string;
}

const testTypes = [
  {
    id: 'diagnostic',
    name: 'Network Diagnostic',
    description: 'Test connectivity between all nodes',
    icon: Activity,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
  },
  {
    id: 'smoke',
    name: 'Smoke Test',
    description: 'Basic health checks',
    icon: FileSearch,
    color: 'text-green-500',
    bg: 'bg-green-50',
  },
  {
    id: 'chaos_validation',
    name: 'Chaos Validation',
    description: 'Verify chaos conditions are applied',
    icon: Zap,
    color: 'text-purple-500',
    bg: 'bg-purple-50',
  },
];

const statusConfig: Record<string, { icon: typeof Clock; color: string; bg: string; animate?: boolean }> = {
  pending: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100' },
  running: { icon: RefreshCw, color: 'text-blue-500', bg: 'bg-blue-100', animate: true },
  passed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100' },
  cancelled: { icon: Square, color: 'text-gray-500', bg: 'bg-gray-100' },
};

export function TestRunner({
  topologyId,
  onTestComplete,
  className = '',
}: TestRunnerProps) {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningTest, setRunningTest] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  // Fetch test runs
  const fetchRuns = useCallback(async () => {
    try {
      const data = await api.listTestRuns(topologyId);
      setRuns(data);

      // Check for running tests
      const running = data.find((r: TestRun) => r.status === 'running');
      if (running) {
        setRunningTest(running.id);
        pollTestStatus(running.id);
      } else {
        setRunningTest(null);
      }
    } catch (err) {
      console.error('Error fetching test runs:', err);
    } finally {
      setLoading(false);
    }
  }, [topologyId]);

  // Poll running test status
  const pollTestStatus = useCallback(async (testId: string) => {
    try {
      const test = await api.getTestRun(topologyId, testId);
      if (test.status === 'running') {
        setTimeout(() => pollTestStatus(testId), 2000);
      } else {
        setRunningTest(null);
        fetchRuns();
        onTestComplete?.(test);
      }
    } catch (err) {
      console.error('Error polling test status:', err);
      setRunningTest(null);
    }
  }, [topologyId, fetchRuns, onTestComplete]);

  // Initial fetch
  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Start a new test
  const startTest = async (testType: string) => {
    try {
      setRunningTest('starting');
      const run = await api.startTest(topologyId, { test_type: testType });
      setRunningTest(run.id);
      pollTestStatus(run.id);
      fetchRuns();
    } catch (err: any) {
      alert(err.message || 'Failed to start test');
      setRunningTest(null);
    }
  };

  // Cancel running test
  const cancelTest = async (testId: string) => {
    try {
      await api.cancelTest(topologyId, testId);
      setRunningTest(null);
      fetchRuns();
    } catch (err) {
      console.error('Error cancelling test:', err);
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className={`test-runner ${className}`}>
      {/* Header */}
      <div className="runner-header flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <TestTube size={18} className="text-primary-500" />
          <h3 className="font-semibold text-gray-700">Test Runner</h3>
        </div>
        <button
          onClick={fetchRuns}
          disabled={loading}
          className="p-1.5 rounded hover:bg-gray-200 transition-colors"
        >
          <RefreshCw size={14} className={`text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Test Types */}
      <div className="test-types p-3 border-b border-gray-100">
        <div className="text-xs text-gray-500 mb-2">Run a test</div>
        <div className="grid grid-cols-1 gap-2">
          {testTypes.map((test) => {
            const Icon = test.icon;
            const isRunning = runningTest !== null;

            return (
              <button
                key={test.id}
                onClick={() => startTest(test.id)}
                disabled={isRunning}
                className={`
                  test-type-btn flex items-center gap-3 p-3 rounded-lg border transition-all
                  ${isRunning ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary-300 hover:shadow-sm'}
                  ${test.bg} border-transparent
                `}
              >
                <div className={`p-2 rounded-full bg-white ${test.color}`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium text-gray-800 text-sm">{test.name}</div>
                  <div className="text-xs text-gray-500">{test.description}</div>
                </div>
                {!isRunning && (
                  <Play size={16} className="text-gray-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Current Running Test */}
      {runningTest && runningTest !== 'starting' && (
        <div className="running-test p-3 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw size={16} className="text-blue-500 animate-spin" />
              <span className="text-sm font-medium text-blue-700">Test in progress...</span>
            </div>
            <button
              onClick={() => cancelTest(runningTest)}
              className="px-2 py-1 text-xs bg-white text-red-600 rounded border border-red-200 hover:bg-red-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Test History */}
      <div className="test-history flex-1 overflow-y-auto">
        <div className="text-xs text-gray-500 px-3 py-2 bg-gray-50 border-b border-gray-100">
          Recent Tests
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-24 text-gray-400">
            <RefreshCw size={20} className="animate-spin" />
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-gray-400">
            <TestTube size={24} className="mb-1" />
            <span className="text-sm">No tests run yet</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {runs.map((run) => {
              const config = statusConfig[run.status];
              const StatusIcon = config.icon;
              const isExpanded = expandedRun === run.id;
              const testType = testTypes.find((t) => t.id === run.test_type);

              return (
                <div key={run.id} className="test-run">
                  <button
                    onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                    className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className={`p-1.5 rounded-full ${config.bg}`}>
                      <StatusIcon
                        size={14}
                        className={`${config.color} ${config.animate ? 'animate-spin' : ''}`}
                      />
                    </div>

                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 text-sm">
                          {testType?.name || run.test_type}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
                          {run.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span>{formatTime(run.started_at)}</span>
                        <span>•</span>
                        <span>{formatDuration(run.duration_ms)}</span>
                        {run.total_tests > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-green-600">{run.passed_tests} passed</span>
                            {run.failed_tests > 0 && (
                              <span className="text-red-600">{run.failed_tests} failed</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {isExpanded ? (
                      <ChevronDown size={16} className="text-gray-400" />
                    ) : (
                      <ChevronRight size={16} className="text-gray-400" />
                    )}
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-3 pb-3 bg-gray-50">
                      {run.error_message && (
                        <div className="mb-2 p-2 bg-red-50 text-red-700 text-xs rounded border border-red-100">
                          {run.error_message}
                        </div>
                      )}

                      {run.results && (
                        <div className="text-xs">
                          <div className="font-medium text-gray-600 mb-1">Results:</div>
                          <pre className="p-2 bg-white rounded border border-gray-200 overflow-auto max-h-40">
                            {JSON.stringify(run.results, null, 2)}
                          </pre>
                        </div>
                      )}

                      {!run.error_message && !run.results && run.status !== 'running' && (
                        <div className="text-xs text-gray-500">No detailed results available</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default TestRunner;
