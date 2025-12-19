import { useEffect, useState, useCallback } from 'react';
import {
  Grid3X3,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import api from '../services/api';

interface ConnectivityResult {
  from_node: string;
  to_node: string;
  expected: 'allow' | 'deny';
  actual: 'connected' | 'blocked' | 'unknown' | 'error';
  latency_ms?: number;
  status: 'pass' | 'fail' | 'warning' | 'skipped';
}

interface DiagnosticReport {
  topology_id: string;
  timestamp: string;
  summary: {
    total_nodes: number;
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    success_rate: number;
    unexpected_connections: number;
    missing_connections: number;
  };
  connectivity_tests: ConnectivityResult[];
  connectivity_matrix: Record<string, Record<string, boolean>>;
}

interface NetworkMatrixProps {
  topologyId: string;
  nodes: { id: string; name: string }[];
  onNodeSelect?: (nodeId: string) => void;
  className?: string;
}

const statusConfig = {
  pass: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100' },
  fail: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-100' },
  skipped: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-100' },
};

export function NetworkMatrix({
  topologyId,
  nodes,
  onNodeSelect,
  className = '',
}: NetworkMatrixProps) {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ from: string; to: string } | null>(null);

  const runDiagnostic = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.runDiagnostic(topologyId);
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to run diagnostic');
    } finally {
      setLoading(false);
    }
  }, [topologyId]);

  // Auto-run on mount if no report
  useEffect(() => {
    if (!report && nodes.length > 0) {
      runDiagnostic();
    }
  }, [nodes.length]);

  const getConnectivityForPair = (from: string, to: string) => {
    if (!report) return null;
    return report.connectivity_tests.find(
      (t) => t.from_node === from && t.to_node === to
    );
  };

  const getCellColor = (from: string, to: string) => {
    if (from === to) return 'bg-gray-200';

    const test = getConnectivityForPair(from, to);
    if (!test) return 'bg-gray-50';

    if (test.status === 'pass') {
      return test.actual === 'connected' ? 'bg-green-200' : 'bg-green-100';
    }
    if (test.status === 'fail') return 'bg-red-200';
    if (test.status === 'warning') return 'bg-yellow-200';
    return 'bg-gray-100';
  };

  const getCellContent = (from: string, to: string) => {
    if (from === to) return '-';

    const test = getConnectivityForPair(from, to);
    if (!test) return '?';

    if (test.latency_ms !== undefined && test.actual === 'connected') {
      return `${test.latency_ms.toFixed(0)}`;
    }

    if (test.actual === 'connected') return '✓';
    if (test.actual === 'blocked') return '✗';
    return '?';
  };

  return (
    <div className={`network-matrix ${className}`}>
      {/* Header */}
      <div className="matrix-header flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <Grid3X3 size={18} className="text-primary-500" />
          <h3 className="font-semibold text-gray-700">Connectivity Matrix</h3>
        </div>
        <button
          onClick={runDiagnostic}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-500 text-white rounded hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Testing...' : 'Run Test'}
        </button>
      </div>

      {/* Summary */}
      {report && (
        <div className="matrix-summary grid grid-cols-4 gap-2 p-3 bg-gray-50 border-b border-gray-200">
          <div className="text-center">
            <div className="text-lg font-bold text-gray-800">
              {report.summary.total_tests}
            </div>
            <div className="text-xs text-gray-500">Total Tests</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">
              {report.summary.passed_tests}
            </div>
            <div className="text-xs text-gray-500">Passed</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-600">
              {report.summary.failed_tests}
            </div>
            <div className="text-xs text-gray-500">Failed</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-primary-600">
              {report.summary.success_rate.toFixed(0)}%
            </div>
            <div className="text-xs text-gray-500">Success Rate</div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 text-center bg-amber-50 border border-amber-200 rounded-lg">
          <div className="text-amber-700 font-medium mb-1">
            {error.includes('400') || error.includes('No pods')
              ? 'Topology not deployed'
              : 'Error'}
          </div>
          <div className="text-amber-600 text-sm">
            {error.includes('400') || error.includes('No pods')
              ? 'Deploy the topology first to run network diagnostics'
              : error}
          </div>
        </div>
      )}

      {/* Matrix Grid */}
      {nodes.length > 0 && (
        <div className="matrix-grid p-3 overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="p-1 text-left text-gray-500 font-normal">
                  <ArrowRight size={12} className="inline" />
                </th>
                {nodes.map((node) => (
                  <th
                    key={node.id}
                    className="p-1 text-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                    onClick={() => onNodeSelect?.(node.id)}
                    title={node.name}
                  >
                    {node.name.slice(0, 8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nodes.map((fromNode) => (
                <tr key={fromNode.id}>
                  <td
                    className="p-1 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                    onClick={() => onNodeSelect?.(fromNode.id)}
                    title={fromNode.name}
                  >
                    {fromNode.name.slice(0, 8)}
                  </td>
                  {nodes.map((toNode) => (
                    <td
                      key={`${fromNode.id}-${toNode.id}`}
                      className={`
                        p-1 text-center cursor-pointer transition-colors
                        ${getCellColor(fromNode.id, toNode.id)}
                        ${
                          selectedCell?.from === fromNode.id &&
                          selectedCell?.to === toNode.id
                            ? 'ring-2 ring-primary-500'
                            : ''
                        }
                        hover:opacity-80
                      `}
                      onClick={() => {
                        if (fromNode.id !== toNode.id) {
                          setSelectedCell({ from: fromNode.id, to: toNode.id });
                        }
                      }}
                      title={`${fromNode.name} → ${toNode.name}`}
                    >
                      {getCellContent(fromNode.id, toNode.id)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Selected Cell Details */}
      {selectedCell && report && (
        <div className="cell-details p-3 border-t border-gray-200 bg-gray-50">
          {(() => {
            const test = getConnectivityForPair(selectedCell.from, selectedCell.to);
            if (!test) return <p className="text-gray-500 text-sm">No data</p>;

            const StatusIcon = statusConfig[test.status].icon;
            return (
              <div className="flex items-center gap-3">
                <StatusIcon
                  size={20}
                  className={statusConfig[test.status].color}
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-800">
                    {test.from_node} → {test.to_node}
                  </div>
                  <div className="text-xs text-gray-500">
                    Expected: {test.expected} | Actual: {test.actual}
                    {test.latency_ms !== undefined && ` | Latency: ${test.latency_ms.toFixed(1)}ms`}
                  </div>
                </div>
                <span
                  className={`px-2 py-1 text-xs rounded ${statusConfig[test.status].bg} ${statusConfig[test.status].color}`}
                >
                  {test.status.toUpperCase()}
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Legend */}
      <div className="matrix-legend flex items-center gap-4 p-2 border-t border-gray-100 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-green-200 rounded" /> Connected
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-red-200 rounded" /> Blocked/Failed
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-yellow-200 rounded" /> Warning
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-gray-100 rounded" /> No test
        </span>
      </div>
    </div>
  );
}

export default NetworkMatrix;
