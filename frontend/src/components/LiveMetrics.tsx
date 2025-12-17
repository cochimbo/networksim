import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Activity,
  Clock,
  TrendingUp,
  TrendingDown,
  Wifi,
  WifiOff,
  RefreshCw,
  Gauge,
  ArrowUpDown,
} from 'lucide-react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import api from '../services/api';
import { SkeletonStats, SkeletonChart } from './Skeleton';

interface NetworkMetric {
  id: number;
  topology_id: string;
  source_node_id: string;
  target_node_id: string;
  latency_ms?: number;
  packet_loss_percent?: number;
  bandwidth_bps?: number;
  jitter_ms?: number;
  is_connected: boolean;
  measured_at: string;
}

interface NodeMetric {
  id: number;
  topology_id: string;
  node_id: string;
  pod_name?: string;
  cpu_usage_percent?: number;
  memory_usage_bytes?: number;
  memory_limit_bytes?: number;
  rx_bytes?: number;
  tx_bytes?: number;
  status: string;
  measured_at: string;
}

interface MetricsSummary {
  total_nodes: number;
  total_pairs: number;
  connected_pairs: number;
  blocked_pairs: number;
  linked_connected: number;
  linked_blocked: number;
  unlinked_blocked: number;
  avg_latency_ms?: number;
  max_latency_ms?: number;
  total_packet_loss_events: number;
}

interface LiveMetricsSnapshot {
  topology_id: string;
  timestamp: string;
  network_metrics: NetworkMetric[];
  node_metrics: NodeMetric[];
  summary: MetricsSummary;
}

interface AggregatedMetrics {
  interval: string;
  data_points: {
    timestamp: string;
    avg_latency_ms?: number;
    max_latency_ms?: number;
    min_latency_ms?: number;
    avg_packet_loss?: number;
    sample_count: number;
  }[];
}

interface ChaosCondition {
  id: string;
  chaos_type: string;
  status: 'pending' | 'active' | 'paused';
  created_at: string;
  updated_at: string;
}

interface ChartMarker {
  position: number; // 0-100%
  color: string;
  label: string;
  type: 'start' | 'stop';
}

interface LiveMetricsProps {
  topologyId: string;
  refreshInterval?: number;
  showChart?: boolean;
  className?: string;
  chaosConditions?: ChaosCondition[];
}

// Simple line chart component (no external deps)
function MiniChart({
  data,
  height = 60,
  color = '#0ea5e9',
  markers = [],
}: {
  data: number[];
  height?: number;
  color?: string;
  markers?: ChartMarker[];
}) {
  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-gray-400 text-xs"
        style={{ height }}
      >
        Not enough data
      </div>
    );
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = ((max - value) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width="100%" height={height + 16} className="overflow-visible">
      {/* Chaos markers - vertical lines */}
      {markers.map((marker, index) => (
        <g key={index}>
          <line
            x1={`${marker.position}%`}
            y1="0"
            x2={`${marker.position}%`}
            y2={height}
            stroke={marker.color}
            strokeWidth="2"
            strokeDasharray={marker.type === 'start' ? '0' : '4,2'}
            opacity="0.7"
          />
          {/* Small indicator at top */}
          <circle
            cx={`${marker.position}%`}
            cy="4"
            r="3"
            fill={marker.color}
          />
          {/* Label at bottom */}
          <text
            x={`${marker.position}%`}
            y={height + 12}
            textAnchor="middle"
            fontSize="8"
            fill={marker.color}
          >
            {marker.label}
          </text>
        </g>
      ))}

      {/* Main chart line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Current value dot */}
      <circle
        cx="100%"
        cy={((max - data[data.length - 1]) / range) * height}
        r="4"
        fill={color}
      />
    </svg>
  );
}

export function LiveMetrics({
  topologyId,
  refreshInterval = 5000,
  showChart = true,
  className = '',
  chaosConditions = [],
}: LiveMetricsProps) {
  const [snapshot, setSnapshot] = useState<LiveMetricsSnapshot | null>(null);
  const [history, setHistory] = useState<AggregatedMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<'1m' | '5m' | '15m' | '1h'>('5m');
  const { isConnected } = useWebSocketContext();

  // Fetch live metrics
  const fetchLiveMetrics = useCallback(async () => {
    try {
      const data = await api.getLiveMetrics(topologyId);
      setSnapshot(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching live metrics:', err);
      setError('Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, [topologyId]);

  // Fetch historical metrics
  const fetchHistory = useCallback(async () => {
    try {
      const data = await api.getAggregatedMetrics(topologyId, { interval: selectedInterval });
      setHistory(data);
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  }, [topologyId, selectedInterval]);

  // Initial fetch and refresh
  useEffect(() => {
    fetchLiveMetrics();
    fetchHistory();

    const interval = setInterval(fetchLiveMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchLiveMetrics, fetchHistory, refreshInterval]);

  // Extract chart data from history
  const chartData = useMemo(() => {
    if (!history?.data_points) return [];
    return history.data_points
      .slice(-20)
      .map((dp) => dp.avg_latency_ms ?? 0);
  }, [history]);

  const packetLossData = useMemo(() => {
    if (!history?.data_points) return [];
    return history.data_points
      .slice(-20)
      .map((dp) => dp.avg_packet_loss ?? 0);
  }, [history]);

  // Calculate trends
  const latencyTrend = useMemo(() => {
    if (chartData.length < 3) return 'stable';
    const recent = chartData.slice(-3);
    const older = chartData.slice(-6, -3);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / (older.length || 1);
    if (recentAvg > olderAvg * 1.2) return 'up';
    if (recentAvg < olderAvg * 0.8) return 'down';
    return 'stable';
  }, [chartData]);

  // Calculate chaos markers for the chart
  const chaosMarkers = useMemo((): ChartMarker[] => {
    if (!history?.data_points || history.data_points.length < 2 || chaosConditions.length === 0) {
      return [];
    }

    const dataPoints = history.data_points.slice(-20);
    if (dataPoints.length === 0) return [];

    const startTime = new Date(dataPoints[0].timestamp).getTime();
    const endTime = new Date(dataPoints[dataPoints.length - 1].timestamp).getTime();
    const timeRange = endTime - startTime;

    if (timeRange <= 0) return [];

    const markers: ChartMarker[] = [];
    const chaosTypeColors: Record<string, string> = {
      delay: '#f59e0b',
      loss: '#ef4444',
      bandwidth: '#8b5cf6',
      corrupt: '#f97316',
      duplicate: '#06b6d4',
      partition: '#dc2626',
    };
    const chaosTypeIcons: Record<string, string> = {
      delay: '⏱️',
      loss: '📉',
      bandwidth: '📊',
      corrupt: '🔧',
      duplicate: '📋',
      partition: '🚫',
    };

    chaosConditions.forEach((condition) => {
      const conditionTime = new Date(condition.updated_at).getTime();

      // Only show markers within the chart time range
      if (conditionTime >= startTime && conditionTime <= endTime) {
        const position = ((conditionTime - startTime) / timeRange) * 100;
        const color = chaosTypeColors[condition.chaos_type] || '#6b7280';
        const icon = chaosTypeIcons[condition.chaos_type] || '⚡';

        if (condition.status === 'active') {
          markers.push({
            position,
            color,
            label: icon,
            type: 'start',
          });
        } else if (condition.status === 'paused') {
          markers.push({
            position,
            color,
            label: '⏸',
            type: 'stop',
          });
        }
      }
    });

    return markers;
  }, [history, chaosConditions]);

  if (loading && !snapshot) {
    return (
      <div className={`live-metrics ${className}`}>
        <div className="metrics-header flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-primary-500" />
            <h3 className="font-semibold text-gray-700">Live Metrics</h3>
          </div>
        </div>
        <div className="p-3 space-y-4">
          <SkeletonStats />
          <SkeletonChart height={50} />
        </div>
      </div>
    );
  }

  return (
    <div className={`live-metrics ${className}`}>
      {/* Header */}
      <div className="metrics-header flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-primary-500" />
          <h3 className="font-semibold text-gray-700">Live Metrics</h3>
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`}
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedInterval}
            onChange={(e) => setSelectedInterval(e.target.value as any)}
            className="text-xs px-2 py-1 border rounded bg-white"
          >
            <option value="1m">1 min</option>
            <option value="5m">5 min</option>
            <option value="15m">15 min</option>
            <option value="1h">1 hour</option>
          </select>
          <button
            onClick={() => {
              fetchLiveMetrics();
              fetchHistory();
            }}
            className="p-1.5 rounded hover:bg-gray-200 transition-colors"
          >
            <RefreshCw size={14} className="text-gray-500" />
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-4 text-center text-red-500">{error}</div>
      ) : (
        <div className="metrics-content p-3 space-y-4">
          {/* Summary Stats */}
          {snapshot?.summary && (
            <div className="summary-stats grid grid-cols-2 gap-3">
              <StatCard
                icon={<Wifi size={16} />}
                label="Connected"
                value={snapshot.summary.linked_connected ?? snapshot.summary.connected_pairs}
                subValue={`of ${snapshot.summary.linked_connected + (snapshot.summary.linked_blocked ?? 0)} linked`}
                color="green"
              />
              <StatCard
                icon={<WifiOff size={16} />}
                label="Blocked"
                value={snapshot.summary.linked_blocked ?? 0}
                subValue={snapshot.summary.unlinked_blocked ? `+${snapshot.summary.unlinked_blocked} by design` : undefined}
                color={snapshot.summary.linked_blocked > 0 ? 'red' : 'green'}
              />
              <StatCard
                icon={<Gauge size={16} />}
                label="Avg Latency"
                value={snapshot.summary.avg_latency_ms?.toFixed(1) ?? '-'}
                subValue="ms"
                trend={latencyTrend}
                color="blue"
              />
              <StatCard
                icon={<ArrowUpDown size={16} />}
                label="Max Latency"
                value={snapshot.summary.max_latency_ms?.toFixed(1) ?? '-'}
                subValue="ms"
                color="yellow"
              />
            </div>
          )}

          {/* Latency Chart */}
          {showChart && chartData.length > 0 && (
            <div className="latency-chart bg-white p-3 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">
                  Latency Trend ({selectedInterval})
                </span>
                <div className="flex items-center gap-2">
                  {chaosMarkers.length > 0 && (
                    <span className="text-xs text-amber-600 flex items-center gap-1">
                      ⚡ {chaosMarkers.length} chaos
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {chartData[chartData.length - 1]?.toFixed(1) ?? '-'} ms
                  </span>
                </div>
              </div>
              <MiniChart data={chartData} height={50} color="#0ea5e9" markers={chaosMarkers} />
            </div>
          )}

          {/* Packet Loss Chart */}
          {showChart && packetLossData.some((v) => v > 0) && (
            <div className="packet-loss-chart bg-white p-3 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">
                  Packet Loss Trend
                </span>
                <span className="text-xs text-gray-400">
                  {packetLossData[packetLossData.length - 1]?.toFixed(1) ?? '-'}%
                </span>
              </div>
              <MiniChart data={packetLossData} height={50} color="#ef4444" markers={chaosMarkers} />
            </div>
          )}

          {/* Node Status */}
          {snapshot?.node_metrics && snapshot.node_metrics.length > 0 && (
            <div className="node-status">
              <h4 className="text-xs font-medium text-gray-600 mb-2">Node Status</h4>
              <div className="space-y-1">
                {snapshot.node_metrics.map((node) => (
                  <div
                    key={node.node_id}
                    className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded text-xs"
                  >
                    <span className="font-medium">{node.node_id}</span>
                    <span
                      className={`px-2 py-0.5 rounded ${
                        node.status === 'Running'
                          ? 'bg-green-100 text-green-700'
                          : node.status === 'Pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {node.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Last Updated */}
          {snapshot && (
            <div className="text-xs text-gray-400 text-center">
              <Clock size={12} className="inline mr-1" />
              Updated {new Date(snapshot.timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({
  icon,
  label,
  value,
  subValue,
  trend,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'stable';
  color: 'green' | 'red' | 'blue' | 'yellow';
}) {
  const colorClasses = {
    green: 'text-green-600 bg-green-50',
    red: 'text-red-600 bg-red-50',
    blue: 'text-blue-600 bg-blue-50',
    yellow: 'text-yellow-600 bg-yellow-50',
  };

  return (
    <div className={`stat-card p-3 rounded-lg ${colorClasses[color]} bg-opacity-50`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={colorClasses[color].split(' ')[0]}>{icon}</span>
        <span className="text-xs text-gray-600">{label}</span>
        {trend && trend !== 'stable' && (
          <span className={trend === 'up' ? 'text-red-500' : 'text-green-500'}>
            {trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold">{value}</span>
        {subValue && <span className="text-xs text-gray-500">{subValue}</span>}
      </div>
    </div>
  );
}

export default LiveMetrics;
