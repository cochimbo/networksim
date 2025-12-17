import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Camera,
  Trash2,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  RefreshCw,
} from 'lucide-react';
import api from '../services/api';

interface MetricsSnapshot {
  id: string;
  name: string;
  timestamp: string;
  data: {
    avgLatency?: number;
    maxLatency?: number;
    packetLoss?: number;
    connectedPairs: number;
    blockedPairs: number;
  };
}

interface MetricsComparisonProps {
  topologyId: string;
  className?: string;
}

const STORAGE_KEY = 'networksim-metrics-snapshots';

export function MetricsComparison({ topologyId, className = '' }: MetricsComparisonProps) {
  const [snapshots, setSnapshots] = useState<MetricsSnapshot[]>([]);
  const [selectedBefore, setSelectedBefore] = useState<string | null>(null);
  const [selectedAfter, setSelectedAfter] = useState<string | null>(null);
  const [isTakingSnapshot, setIsTakingSnapshot] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');

  // Load snapshots from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`${STORAGE_KEY}-${topologyId}`);
    if (stored) {
      try {
        setSnapshots(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load snapshots:', e);
      }
    }
  }, [topologyId]);

  // Save snapshots to localStorage
  const saveSnapshots = useCallback((newSnapshots: MetricsSnapshot[]) => {
    setSnapshots(newSnapshots);
    localStorage.setItem(`${STORAGE_KEY}-${topologyId}`, JSON.stringify(newSnapshots));
  }, [topologyId]);

  // Take a new snapshot
  const takeSnapshot = async () => {
    setIsTakingSnapshot(true);
    try {
      const metrics = await api.getLiveMetrics(topologyId);

      const snapshot: MetricsSnapshot = {
        id: `snapshot-${Date.now()}`,
        name: snapshotName || `Snapshot ${snapshots.length + 1}`,
        timestamp: new Date().toISOString(),
        data: {
          avgLatency: metrics.summary.avg_latency_ms,
          maxLatency: metrics.summary.max_latency_ms,
          packetLoss: metrics.summary.total_packet_loss_events > 0
            ? (metrics.summary.total_packet_loss_events / metrics.network_metrics.length) * 100
            : 0,
          connectedPairs: metrics.summary.connected_pairs,
          blockedPairs: metrics.summary.blocked_pairs,
        },
      };

      saveSnapshots([...snapshots, snapshot]);
      setSnapshotName('');
    } catch (err) {
      console.error('Failed to take snapshot:', err);
      alert('Failed to take snapshot. Make sure the topology is deployed.');
    } finally {
      setIsTakingSnapshot(false);
    }
  };

  // Delete snapshot
  const deleteSnapshot = (id: string) => {
    saveSnapshots(snapshots.filter((s) => s.id !== id));
    if (selectedBefore === id) setSelectedBefore(null);
    if (selectedAfter === id) setSelectedAfter(null);
  };

  // Get comparison data
  const beforeSnapshot = snapshots.find((s) => s.id === selectedBefore);
  const afterSnapshot = snapshots.find((s) => s.id === selectedAfter);

  // Calculate difference
  const getDiff = (before?: number, after?: number) => {
    if (before === undefined || after === undefined) return null;
    const diff = after - before;
    const percent = before !== 0 ? ((diff / before) * 100).toFixed(1) : '∞';
    return { diff, percent };
  };

  // Get trend icon
  const getTrendIcon = (diff: number | null, invertColors = false) => {
    if (diff === null) return <Minus size={14} className="text-gray-400" />;
    if (diff > 0) {
      return invertColors
        ? <TrendingUp size={14} className="text-red-500" />
        : <TrendingUp size={14} className="text-green-500" />;
    }
    if (diff < 0) {
      return invertColors
        ? <TrendingDown size={14} className="text-green-500" />
        : <TrendingDown size={14} className="text-red-500" />;
    }
    return <Minus size={14} className="text-gray-400" />;
  };

  // Format time
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className={`metrics-comparison flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="comparison-header flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-blue-500" />
          <h3 className="font-semibold text-gray-700 dark:text-gray-200">Compare Metrics</h3>
        </div>
      </div>

      {/* Take Snapshot */}
      <div className="take-snapshot p-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            placeholder="Snapshot name (optional)"
            className="flex-1 px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600"
          />
          <button
            onClick={takeSnapshot}
            disabled={isTakingSnapshot}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm"
          >
            {isTakingSnapshot ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Camera size={14} />
            )}
            Capture
          </button>
        </div>
      </div>

      {/* Snapshots List */}
      <div className="snapshots-list flex-1 overflow-y-auto p-3">
        {snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <Camera size={24} className="mb-2" />
            <p className="text-sm">No snapshots yet</p>
            <p className="text-xs mt-1">Capture metrics to compare before/after chaos</p>
          </div>
        ) : (
          <div className="space-y-2">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className={`snapshot-item p-3 rounded-lg border transition-colors ${
                  selectedBefore === snapshot.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : selectedAfter === snapshot.id
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{snapshot.name}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock size={10} />
                      {formatTime(snapshot.timestamp)}
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      setSelectedBefore(selectedBefore === snapshot.id ? null : snapshot.id)
                    }
                    className={`px-2 py-1 text-xs rounded ${
                      selectedBefore === snapshot.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    Before
                  </button>

                  <button
                    onClick={() =>
                      setSelectedAfter(selectedAfter === snapshot.id ? null : snapshot.id)
                    }
                    className={`px-2 py-1 text-xs rounded ${
                      selectedAfter === snapshot.id
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    After
                  </button>

                  <button
                    onClick={() => deleteSnapshot(snapshot.id)}
                    className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Mini stats */}
                <div className="mt-2 flex gap-4 text-xs text-gray-500">
                  <span>Latency: {snapshot.data.avgLatency?.toFixed(1) ?? '-'}ms</span>
                  <span>Connected: {snapshot.data.connectedPairs}</span>
                  <span>Blocked: {snapshot.data.blockedPairs}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comparison Panel */}
      {beforeSnapshot && afterSnapshot && (
        <div className="comparison-panel p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2 mb-3 text-sm">
            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
              {beforeSnapshot.name}
            </span>
            <ArrowRight size={14} className="text-gray-400" />
            <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
              {afterSnapshot.name}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Latency */}
            <div className="metric-diff p-2 bg-white dark:bg-gray-700 rounded">
              <div className="text-xs text-gray-500">Avg Latency</div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">
                  {afterSnapshot.data.avgLatency?.toFixed(1) ?? '-'}
                </span>
                <span className="text-xs text-gray-400">ms</span>
                {getTrendIcon(
                  getDiff(beforeSnapshot.data.avgLatency, afterSnapshot.data.avgLatency)?.diff ?? null,
                  true // Higher latency is bad
                )}
                {getDiff(beforeSnapshot.data.avgLatency, afterSnapshot.data.avgLatency) && (
                  <span className="text-xs text-gray-500">
                    ({getDiff(beforeSnapshot.data.avgLatency, afterSnapshot.data.avgLatency)?.percent}%)
                  </span>
                )}
              </div>
            </div>

            {/* Max Latency */}
            <div className="metric-diff p-2 bg-white dark:bg-gray-700 rounded">
              <div className="text-xs text-gray-500">Max Latency</div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">
                  {afterSnapshot.data.maxLatency?.toFixed(1) ?? '-'}
                </span>
                <span className="text-xs text-gray-400">ms</span>
                {getTrendIcon(
                  getDiff(beforeSnapshot.data.maxLatency, afterSnapshot.data.maxLatency)?.diff ?? null,
                  true
                )}
              </div>
            </div>

            {/* Connected */}
            <div className="metric-diff p-2 bg-white dark:bg-gray-700 rounded">
              <div className="text-xs text-gray-500">Connected Pairs</div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">
                  {afterSnapshot.data.connectedPairs}
                </span>
                {getTrendIcon(
                  getDiff(beforeSnapshot.data.connectedPairs, afterSnapshot.data.connectedPairs)?.diff ?? null
                )}
              </div>
            </div>

            {/* Blocked */}
            <div className="metric-diff p-2 bg-white dark:bg-gray-700 rounded">
              <div className="text-xs text-gray-500">Blocked Pairs</div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">
                  {afterSnapshot.data.blockedPairs}
                </span>
                {getTrendIcon(
                  getDiff(beforeSnapshot.data.blockedPairs, afterSnapshot.data.blockedPairs)?.diff ?? null,
                  true // More blocked is bad
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MetricsComparison;
