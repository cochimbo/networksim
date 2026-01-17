import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  chaosApi,
  ChaosCondition,
  ChaosType,
  ChaosDirection,
  CreateChaosRequest,
  Node,
  Link,
  ChaosConditionStatus,
  Application,
} from '../services/api';
import './ChaosPanel.css';
import { AffectedAppsModal } from './AffectedAppsModal';
import { useToast } from './Toast';

// Countdown timer component for active chaos with duration
function ChaosCountdown({ startedAt, duration, onExpired }: {
  startedAt?: string;
  duration?: string;
  onExpired?: () => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const expiredCalledRef = useRef(false);

  useEffect(() => {
    // Reset expired flag when startedAt or duration changes
    expiredCalledRef.current = false;
  }, [startedAt, duration]);

  useEffect(() => {
    if (!startedAt || !duration) {
      setRemaining(null);
      return;
    }

    // Parse duration (e.g., "30s", "5m", "1h")
    const parseDuration = (d: string): number => {
      const match = d.match(/^(\d+)(s|m|h)$/);
      if (!match) return 0;
      const value = parseInt(match[1], 10);
      const unit = match[2];
      if (unit === 's') return value * 1000;
      if (unit === 'm') return value * 60 * 1000;
      if (unit === 'h') return value * 60 * 60 * 1000;
      return 0;
    };

    const durationMs = parseDuration(duration);
    if (durationMs === 0) {
      setRemaining(null);
      return;
    }

    const startTime = new Date(startedAt).getTime();
    const endTime = startTime + durationMs;
    let interval: NodeJS.Timeout | null = null;

    const updateRemaining = () => {
      const now = Date.now();
      const left = Math.max(0, endTime - now);
      setRemaining(left);

      // Only call onExpired once
      if (left === 0 && onExpired && !expiredCalledRef.current) {
        expiredCalledRef.current = true;
        if (interval) clearInterval(interval);
        onExpired();
      }
    };

    updateRemaining();
    interval = setInterval(updateRemaining, 1000);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [startedAt, duration, onExpired]);

  if (remaining === null) return null;

  const seconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  let display: string;
  if (hours > 0) {
    display = `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    display = `${minutes}m ${seconds % 60}s`;
  } else {
    display = `${seconds}s`;
  }

  return (
    <span className={`countdown ${seconds < 10 ? 'countdown-warning' : ''}`}>
      ⏱ {display}
    </span>
  );
}

interface ChaosPanelProps {
  topologyId: string;
  nodes: Node[];
  links: Link[];
  applications?: Application[];
  onClose?: () => void;
}

const CHAOS_TYPES: { value: ChaosType; label: string; description: string; category: 'network' | 'stress' | 'pod' | 'io' | 'http'; icon: string }[] = [
  // Network chaos types
  { value: 'delay', label: 'Delay', description: 'Add latency to network traffic', category: 'network', icon: '⏱️' },
  { value: 'loss', label: 'Packet Loss', description: 'Drop a percentage of packets', category: 'network', icon: '📉' },
  { value: 'bandwidth', label: 'Bandwidth', description: 'Limit network bandwidth', category: 'network', icon: '📊' },
  { value: 'corrupt', label: 'Corrupt', description: 'Corrupt packet data', category: 'network', icon: '🔧' },
  { value: 'duplicate', label: 'Duplicate', description: 'Duplicate packets', category: 'network', icon: '📋' },
  { value: 'partition', label: 'Partition', description: 'Complete network partition', category: 'network', icon: '🚫' },
  // New chaos types
  { value: 'stress-cpu', label: 'CPU Stress', description: 'Stress CPU on target pods', category: 'stress', icon: '💻' },
  { value: 'pod-kill', label: 'Pod Kill', description: 'Kill target pods', category: 'pod', icon: '💀' },
  { value: 'io-delay', label: 'I/O Delay', description: 'Add latency to disk I/O', category: 'io', icon: '💾' },
  { value: 'http-abort', label: 'HTTP Abort', description: 'Abort HTTP requests with error code', category: 'http', icon: '🌐' },
];

// Helper to check if chaos type requires target node
const chaosTypeRequiresTarget = (type: ChaosType): boolean => {
  const networkTypes: ChaosType[] = ['delay', 'loss', 'bandwidth', 'corrupt', 'duplicate', 'partition'];
  return networkTypes.includes(type);
};

const DIRECTIONS: { value: ChaosDirection; label: string }[] = [
  { value: 'to', label: 'Outgoing' },
  { value: 'from', label: 'Incoming' },
  { value: 'both', label: 'Both' },
];

const STATUS_LABELS: Record<ChaosConditionStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#9ca3af' }, // gray-400
  active: { label: 'Active', color: '#22c55e' }, // green-500
  paused: { label: 'Paused', color: '#f59e0b' }, // amber-500
};

const getChaosColorClass = (type: string) => {
  if (type.includes('stress')) return 'bg-orange-100 border-orange-500 text-orange-800 dark:bg-orange-900/50 dark:border-orange-400 dark:text-orange-100';
  if (type.includes('pod')) return 'bg-gray-200 border-gray-500 text-gray-800 dark:bg-gray-600 dark:border-gray-400 dark:text-gray-100';
  if (type === 'partition') return 'bg-slate-800 border-slate-600 text-slate-100 dark:bg-black dark:border-slate-500 dark:text-white';
  
  if (type === 'delay') return 'bg-blue-100 border-blue-500 text-blue-800 dark:bg-blue-900/50 dark:border-blue-400 dark:text-blue-100';
  if (type === 'loss') return 'bg-pink-100 border-pink-500 text-pink-800 dark:bg-pink-900/50 dark:border-pink-400 dark:text-pink-100';
  if (type === 'bandwidth') return 'bg-cyan-100 border-cyan-500 text-cyan-800 dark:bg-cyan-900/50 dark:border-cyan-400 dark:text-cyan-100';
  if (type === 'corrupt') return 'bg-yellow-100 border-yellow-500 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-400 dark:text-yellow-100';
  if (type === 'duplicate') return 'bg-violet-100 border-violet-500 text-violet-800 dark:bg-violet-900/50 dark:border-violet-400 dark:text-violet-100';
  
  if (type === 'io-delay') return 'bg-emerald-100 border-emerald-500 text-emerald-800 dark:bg-emerald-900/50 dark:border-emerald-400 dark:text-emerald-100';
  if (type === 'http-abort') return 'bg-rose-100 border-rose-500 text-rose-800 dark:bg-rose-900/50 dark:border-rose-400 dark:text-rose-100';

  // Default
  return 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-200';
};

export function ChaosPanel({ topologyId, nodes, links, applications = [], onClose: _onClose }: ChaosPanelProps) {
  const [conditions, setConditions] = useState<ChaosCondition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use error if needed, or suppress
  useEffect(() => {
    if (error) console.error(error);
  }, [error]);
  const [showForm, setShowForm] = useState(false);
  const [expandedConditions, setExpandedConditions] = useState<Set<string>>(new Set());
  const [editingCondition, setEditingCondition] = useState<ChaosCondition | null>(null);
  const [editDirection, setEditDirection] = useState<ChaosDirection>('to');
  const [editDuration, setEditDuration] = useState<string>('');
  const [editParams, setEditParams] = useState<Record<string, any>>({});

  // State for confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<CreateChaosRequest | null>(null);

  const queryClient = useQueryClient();
  const toast = useToast();

  // Form state
  const [chaosType, setChaosType] = useState<ChaosType>('delay');
  const [sourceNode, setSourceNode] = useState<string>('');
  const [targetNode, setTargetNode] = useState<string>('');
  const [direction, setDirection] = useState<ChaosDirection>('to');
  const [duration, setDuration] = useState<string>('');

  // Type-specific params (NetworkChaos)
  const [latency, setLatency] = useState('100ms');
  const [jitter, setJitter] = useState('20ms');
  const [lossPercent, setLossPercent] = useState('10');
  const [bandwidthRate, setBandwidthRate] = useState('1mbps');
  const [corruptPercent, setCorruptPercent] = useState('10');
  const [duplicatePercent, setDuplicatePercent] = useState('10');

  // New chaos type params
  const [cpuLoad, setCpuLoad] = useState(80);
  const [cpuWorkers, setCpuWorkers] = useState(2);
  const [gracePeriod, setGracePeriod] = useState(0);
  const [ioDelay, setIoDelay] = useState('100ms');
  const [ioPercent, setIoPercent] = useState(100);
  const [httpCode, setHttpCode] = useState(500);

  // View mode for the panel
  const [viewMode, setViewMode] = useState<'manual' | 'palette'>('palette');

  useEffect(() => {
    fetchConditions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyId]);

  useEffect(() => {
    if (nodes.length > 0 && !sourceNode) {
      setSourceNode(nodes[0].id);
    }
  }, [nodes, sourceNode]);

  const fetchConditions = async () => {
    try {
      setLoading(true);
      const data = await chaosApi.list(topologyId);
      setConditions(data);
      setError(null);
    } catch (err) {
      setError('Failed to load chaos conditions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const params = buildParams();
    const request: CreateChaosRequest = {
      topology_id: topologyId,
      source_node_id: sourceNode,
      target_node_id: targetNode || undefined,
      chaos_type: chaosType,
      direction,
      duration: duration || undefined,
      params,
    };

    // Show confirmation modal with affected apps
    setPendingRequest(request);
    setShowConfirmModal(true);
  };

  const handleConfirmCreate = async () => {
    if (!pendingRequest) return;

    try {
      setLoading(true);
      await chaosApi.create(pendingRequest);
      setShowForm(false);
      setShowConfirmModal(false);
      setPendingRequest(null);
      await fetchConditions();
      // Invalidate chaos conditions query in TopologyEditor
      queryClient.invalidateQueries({ queryKey: ['chaos-conditions', topologyId] });
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create chaos condition');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelConfirm = () => {
    setShowConfirmModal(false);
    setPendingRequest(null);
  };

  const buildParams = () => {
    switch (chaosType) {
      case 'delay':
        return { latency, jitter: jitter || undefined };
      case 'loss':
        return { loss: lossPercent };
      case 'bandwidth':
        return { rate: bandwidthRate, buffer: 10000, limit: 10000 };
      case 'corrupt':
        return { corrupt: corruptPercent };
      case 'duplicate':
        return { duplicate: duplicatePercent };
      case 'partition':
        return {};
      // New chaos types
      case 'stress-cpu':
        return { load: cpuLoad, workers: cpuWorkers };
      case 'pod-kill':
        return { grace_period: gracePeriod };
      case 'io-delay':
        return { delay: ioDelay, percent: ioPercent };
      case 'http-abort':
        return { code: httpCode };
      default:
        return {};
    }
  };

  const handleStart = async (conditionId: string) => {
    try {
      setLoading(true);
      await chaosApi.start(topologyId, conditionId);
      await fetchConditions();
      // Invalidate chaos conditions query in TopologyEditor
      queryClient.invalidateQueries({ queryKey: ['chaos-conditions', topologyId] });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start condition');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async (conditionId: string) => {
    try {
      setLoading(true);
      await chaosApi.stop(topologyId, conditionId);
      await fetchConditions();
      // Invalidate chaos conditions query in TopologyEditor
      queryClient.invalidateQueries({ queryKey: ['chaos-conditions', topologyId] });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to stop condition');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartAll = async () => {
    try {
      setLoading(true);
      const result = await chaosApi.startAll(topologyId);
      if (result.errors && result.errors.length > 0) {
        setError(`Started ${result.started}, errors: ${result.errors.join(', ')}`);
      }
      await fetchConditions();
      // Invalidate chaos conditions query in TopologyEditor
      queryClient.invalidateQueries({ queryKey: ['chaos-conditions', topologyId] });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start all conditions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStopAll = async () => {
    try {
      setLoading(true);
      await chaosApi.stopAll(topologyId);
      await fetchConditions();
      // Invalidate chaos conditions query in TopologyEditor
      queryClient.invalidateQueries({ queryKey: ['chaos-conditions', topologyId] });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to stop all conditions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (conditionId: string) => {
    try {
      setLoading(true);
      await chaosApi.delete(topologyId, conditionId);
      await fetchConditions();
      // Invalidate chaos conditions query in TopologyEditor
      queryClient.invalidateQueries({ queryKey: ['chaos-conditions', topologyId] });
    } catch (err) {
      setError('Failed to delete chaos condition');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Delete all chaos conditions?')) return;
    
    try {
      setLoading(true);
      await chaosApi.deleteAll(topologyId);
      await fetchConditions();
      // Invalidate chaos conditions query in TopologyEditor
      queryClient.invalidateQueries({ queryKey: ['chaos-conditions', topologyId] });
    } catch (err) {
      setError('Failed to delete all chaos conditions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getNodeName = (nodeId: string): string => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.name || nodeId;
  };

  const getConnectedNodes = (sourceNodeId: string): Node[] => {
    const connectedNodeIds = new Set<string>();
    
    // Find all links connected to the source node
    links.forEach(link => {
      if (link.source === sourceNodeId) {
        connectedNodeIds.add(link.target);
      } else if (link.target === sourceNodeId) {
        connectedNodeIds.add(link.source);
      }
    });
    
    // Return nodes that are connected (excluding the source node itself)
    return nodes.filter(node => 
      connectedNodeIds.has(node.id) && node.id !== sourceNodeId
    );
  };

  const toggleExpanded = (conditionId: string) => {
    const newExpanded = new Set(expandedConditions);
    if (newExpanded.has(conditionId)) {
      newExpanded.delete(conditionId);
    } else {
      newExpanded.add(conditionId);
    }
    setExpandedConditions(newExpanded);
  };

  const handleEdit = (condition: ChaosCondition) => {
    setEditingCondition(condition);
    setEditDirection(condition.direction);
    setEditDuration(condition.duration || '');
    setEditParams(condition.params as Record<string, any>);
  };

  const handleEditSubmit = async () => {
    if (!editingCondition) return;

    try {
      setLoading(true);
      await chaosApi.update(topologyId, editingCondition.id, {
        direction: editDirection,
        duration: editDuration || undefined,
        params: editParams,
      });
      await fetchConditions();
      queryClient.invalidateQueries({ queryKey: ['chaos-conditions', topologyId] });
      setEditingCondition(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update chaos condition');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatParams = (condition: ChaosCondition): string => {
    const params = condition.params as Record<string, unknown>;
    switch (condition.chaos_type) {
      case 'delay':
        return `${params.latency}${params.jitter ? ` ±${params.jitter}` : ''}`;
      case 'loss':
        return `${params.loss}%`;
      case 'bandwidth':
        return `${params.rate}`;
      case 'corrupt':
        return `${params.corrupt}%`;
      case 'duplicate':
        return `${params.duplicate}%`;
      case 'partition':
        return 'Complete';
      // New chaos types
      case 'stress-cpu':
        return `${params.load || 80}% load, ${params.workers || 1} workers`;
      case 'pod-kill':
        return `grace: ${params.grace_period || 0}s`;
      case 'io-delay':
        return `${params.delay || '100ms'} (${params.percent || 100}%)`;
      case 'http-abort':
        return `HTTP ${params.code || 500}`;
      default:
        return '';
    }
  };

  const renderParams = () => {
    switch (chaosType) {
      case 'delay':
        return (
          <>
            <div className="form-group">
              <label className="dark:text-gray-300">Latency</label>
              <input
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                type="text"
                value={latency}
                onChange={(e) => setLatency(e.target.value)}
                placeholder="100ms"
              />
            </div>
            <div className="form-group">
              <label className="dark:text-gray-300">Jitter (optional)</label>
              <input
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                type="text"
                value={jitter}
                onChange={(e) => setJitter(e.target.value)}
                placeholder="20ms"
              />
            </div>
          </>
        );
      case 'loss':
        return (
          <div className="form-group">
            <label className="dark:text-gray-300">Loss Percentage</label>
            <input
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              type="number"
              min="0"
              max="100"
              value={lossPercent}
              onChange={(e) => setLossPercent(e.target.value)}
            />
          </div>
        );
      case 'bandwidth':
        return (
          <div className="form-group">
            <label className="dark:text-gray-300">Rate Limit</label>
            <input
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              type="text"
              value={bandwidthRate}
              onChange={(e) => setBandwidthRate(e.target.value)}
              placeholder="1mbps"
            />
          </div>
        );
      case 'corrupt':
        return (
          <div className="form-group">
            <label className="dark:text-gray-300">Corruption Percentage</label>
            <input
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              type="number"
              min="0"
              max="100"
              value={corruptPercent}
              onChange={(e) => setCorruptPercent(e.target.value)}
            />
          </div>
        );
      case 'duplicate':
        return (
          <div className="form-group">
            <label className="dark:text-gray-300">Duplication Percentage</label>
            <input
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              type="number"
              min="0"
              max="100"
              value={duplicatePercent}
              onChange={(e) => setDuplicatePercent(e.target.value)}
            />
          </div>
        );
      case 'partition':
        return (
          <p className="info-text dark:text-gray-400">
            Network partition will completely disconnect the selected nodes.
          </p>
        );
      // New chaos types
      case 'stress-cpu':
        return (
          <>
            <div className="form-group">
              <label className="dark:text-gray-300">CPU Load (%)</label>
              <input
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                type="number"
                min="0"
                max="100"
                value={cpuLoad}
                onChange={(e) => setCpuLoad(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="form-group">
              <label className="dark:text-gray-300">Workers</label>
              <input
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                type="number"
                min="1"
                max="32"
                value={cpuWorkers}
                onChange={(e) => setCpuWorkers(parseInt(e.target.value) || 1)}
              />
            </div>
            <p className="info-text dark:text-gray-400">
              Stress CPU on target pods. Higher load and more workers = more stress.
            </p>
          </>
        );
      case 'pod-kill':
        return (
          <>
            <div className="form-group">
              <label className="dark:text-gray-300">Grace Period (seconds)</label>
              <input
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                type="number"
                min="0"
                value={gracePeriod}
                onChange={(e) => setGracePeriod(parseInt(e.target.value) || 0)}
              />
            </div>
            <p className="info-text dark:text-gray-400">
              Kill target pods. Set grace period to 0 for immediate termination.
            </p>
          </>
        );
      case 'io-delay':
        return (
          <>
            <div className="form-group">
              <label className="dark:text-gray-300">I/O Delay</label>
              <input
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                type="text"
                value={ioDelay}
                onChange={(e) => setIoDelay(e.target.value)}
                placeholder="100ms"
              />
            </div>
            <div className="form-group">
              <label className="dark:text-gray-300">Percent of operations</label>
              <input
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                type="number"
                min="0"
                max="100"
                value={ioPercent}
                onChange={(e) => setIoPercent(parseInt(e.target.value) || 100)}
              />
            </div>
            <p className="info-text dark:text-gray-400">
              Add latency to disk I/O operations on target pods.
            </p>
          </>
        );
      case 'http-abort':
        return (
          <>
            <div className="form-group">
              <label className="dark:text-gray-300">HTTP Status Code</label>
              <select
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                value={httpCode}
                onChange={(e) => setHttpCode(parseInt(e.target.value))}
              >
                <option value={500}>500 - Internal Server Error</option>
                <option value={502}>502 - Bad Gateway</option>
                <option value={503}>503 - Service Unavailable</option>
                <option value={504}>504 - Gateway Timeout</option>
                <option value={429}>429 - Too Many Requests</option>
                <option value={400}>400 - Bad Request</option>
                <option value={403}>403 - Forbidden</option>
                <option value={404}>404 - Not Found</option>
              </select>
            </div>
            <p className="info-text dark:text-gray-400">
              Abort HTTP requests and return the selected error code.
            </p>
          </>
        );
      default:
        return null;
    }
  };

  const hasActiveConditions = conditions.some(c => c.status === 'active');
  const hasInactiveConditions = conditions.some(c => c.status !== 'active');

  return (
    <div className="chaos-panel dark:bg-gray-900">
      <div className="chaos-panel-header dark:text-gray-100 dark:border-gray-700">
        <h3>🔥 Chaos Engineering</h3>
        <div className="header-actions">
          <button 
            className="refresh-btn dark:text-gray-400 dark:hover:text-gray-200"
            onClick={fetchConditions}
            disabled={loading}
            title="Refresh conditions"
          >
            🔄
          </button>
          {/* Botón de cerrar eliminado, ya no es modal */}
        </div>
      </div>

      <div className="chaos-panel-content">
        {/* View Mode Toggle */}
        <div className="flex p-2 bg-gray-100 dark:bg-gray-800 rounded-lg mb-4 gap-1">
          <button
            className={`flex-1 py-1.5 px-3 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'manual' 
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
            onClick={() => setViewMode('manual')}
          >
            Active Chaos
          </button>
          <button
            className={`flex-1 py-1.5 px-3 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'palette' 
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
             onClick={() => setViewMode('palette')}
          >
            Tools Palette
          </button>
        </div>

        {/* Chaos Tools Palette (Draggable) */}
        {viewMode === 'palette' && (
        <div className="section">
          <div className="section-header dark:text-gray-300">
            <h4>Chaos Tools</h4>
          </div>
          <p className="text-xs text-gray-500 mb-2">Drag tools to the Scenario timeline below</p>
          <div className="grid grid-cols-2 gap-2">
            {CHAOS_TYPES.map(type => (
              <div
                key={type.value}
                className={`flex items-center gap-2 p-2 border rounded cursor-grab hover:brightness-95 dark:hover:brightness-110 ${getChaosColorClass(type.value)}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify({
                    type: 'chaos-tool',
                    chaosType: type.value
                  }));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <div className={`p-1 rounded bg-black/5 dark:bg-white/10 flex items-center justify-center w-8 h-8`}>
                  <span className="text-lg">{type.icon}</span>
                </div>
                <span className="text-sm font-medium truncate">{type.label}</span>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Global Controls */}
        {viewMode === 'manual' && conditions.length > 0 && (
          <div className="global-controls dark:border-gray-700 dark:bg-gray-800">
            <button 
              className="btn-success dark:bg-green-700 dark:hover:bg-green-600"
              onClick={handleStartAll}
              disabled={loading || !hasInactiveConditions}
              title="Start all conditions"
            >
              ▶ Start All
            </button>
            <button 
              className="btn-warning dark:bg-yellow-700 dark:hover:bg-yellow-600"
              onClick={handleStopAll}
              disabled={loading || !hasActiveConditions}
              title="Stop all conditions"
            >
              ⏸ Stop All
            </button>
            <button 
              className="btn-danger dark:bg-red-700 dark:hover:bg-red-600"
              onClick={handleDeleteAll}
              disabled={loading}
              title="Delete all conditions"
            >
              🗑 Delete All
            </button>
          </div>
        )}

        {/* Conditions List */}
        {viewMode === 'manual' && (
        <div className="section">
          <div className="section-header dark:text-gray-300">
            <h4>Chaos Conditions ({conditions.length})</h4>
          </div>

          {loading && conditions.length === 0 && <div className="loading dark:text-gray-400">Loading...</div>}

          {conditions.length === 0 ? (
            <p className="empty-text dark:text-gray-500">No chaos conditions defined. Add one below.</p>
          ) : (
            <ul className="conditions-list">
              {conditions.map((c) => {
                const isExpanded = expandedConditions.has(c.id);
                return (
                  <li key={c.id} className={`condition-item status-${c.status} ${isExpanded ? 'expanded' : ''} dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700/50`}>
                    <div className="condition-main">
                      <button
                        className="btn-icon btn-expand dark:text-gray-400 dark:hover:text-gray-200"
                        onClick={() => toggleExpanded(c.id)}
                        title={isExpanded ? "Collapse" : "Expand"}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                      <span 
                        className="status-indicator"
                        style={{ backgroundColor: STATUS_LABELS[c.status].color }}
                        title={STATUS_LABELS[c.status].label}
                      />
                      <div className="condition-info">
                        <div className="condition-type dark:text-gray-200">
                          {CHAOS_TYPES.find(t => t.value === c.chaos_type)?.label || c.chaos_type}
                          <span className="condition-params dark:text-gray-400">{formatParams(c)}</span>
                        </div>
                        <div className="condition-targets dark:text-gray-400">
                          {getNodeName(c.source_node_id)}
                          {c.target_node_id
                            ? ` → ${getNodeName(c.target_node_id)}`
                            : ' → All'
                          }
                          {c.status === 'active' && c.duration && c.started_at && (
                            <ChaosCountdown
                              startedAt={c.started_at}
                              duration={c.duration}
                              onExpired={() => {
                                toast.info(`Chaos "${CHAOS_TYPES.find(t => t.value === c.chaos_type)?.label || c.chaos_type}" expired`);
                                fetchConditions();
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="condition-actions">
                      <button
                        className="btn-icon btn-edit dark:text-gray-400 dark:hover:text-blue-400"
                        onClick={() => handleEdit(c)}
                        disabled={loading}
                        title="Edit"
                      >
                        ✏
                      </button>
                      {c.status === 'active' ? (
                        <button
                          className="btn-icon btn-stop dark:text-gray-400 dark:hover:text-yellow-400"
                          onClick={() => handleStop(c.id)}
                          disabled={loading}
                          title="Stop"
                        >
                          ⏸
                        </button>
                      ) : (
                        <button
                          className="btn-icon btn-start dark:text-gray-400 dark:hover:text-green-400"
                          onClick={() => handleStart(c.id)}
                          disabled={loading}
                          title="Start"
                        >
                          ▶
                        </button>
                      )}
                      <button
                        className="btn-icon btn-delete dark:text-gray-400 dark:hover:text-red-400"
                        onClick={() => handleDelete(c.id)}
                        disabled={loading}
                        title="Delete"
                      >
                        🗑
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="condition-details dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300">
                        <div className="detail-row">
                          <strong>ID:</strong> {c.id}
                        </div>
                        <div className="detail-row">
                          <strong>Type:</strong> {CHAOS_TYPES.find(t => t.value === c.chaos_type)?.label || c.chaos_type}
                        </div>
                        <div className="detail-row">
                          <strong>Direction:</strong> {c.direction}
                        </div>
                        <div className="detail-row">
                          <strong>Duration:</strong> {c.duration || 'Until stopped'}
                        </div>
                        <div className="detail-row">
                          <strong>Status:</strong> {STATUS_LABELS[c.status].label}
                        </div>
                        <div className="detail-row">
                          <strong>Source:</strong> {getNodeName(c.source_node_id)}
                        </div>
                        {c.target_node_id && (
                          <div className="detail-row">
                            <strong>Target:</strong> {getNodeName(c.target_node_id)}
                          </div>
                        )}
                        <div className="detail-row">
                          <strong>Parameters:</strong>
                          <pre className="params-json">{JSON.stringify(c.params, null, 2)}</pre>
                        </div>
                        <div className="detail-row">
                          <strong>Created:</strong> {new Date(c.created_at).toLocaleString()}
                        </div>
                        <div className="detail-row">
                          <strong>Updated:</strong> {new Date(c.updated_at).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        )}

        {/* Add New Condition */}
        <div className="section">
          {!showForm ? (
            <button className="btn-primary dark:bg-indigo-600 dark:hover:bg-indigo-500" onClick={() => setShowForm(true)}>
              + Add Chaos Condition
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="chaos-form dark:bg-gray-800/50 dark:border-gray-700 dark:p-4 dark:rounded-lg">
              <h4 className="dark:text-gray-200">New Chaos Condition</h4>

              <div className="form-group">
                <label className="dark:text-gray-300">Type</label>
                <select
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  value={chaosType}
                  onChange={(e) => setChaosType(e.target.value as ChaosType)}
                >
                  {CHAOS_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} - {t.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="dark:text-gray-300">Source Node</label>
                  <select
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    value={sourceNode}
                    onChange={(e) => setSourceNode(e.target.value)}
                    required
                  >
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </div>

                {chaosTypeRequiresTarget(chaosType) && (
                  <div className="form-group">
                    <label className="dark:text-gray-300">Target Node (optional)</label>
                    <select
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      value={targetNode}
                      onChange={(e) => setTargetNode(e.target.value)}
                    >
                      <option value="">All traffic</option>
                      {getConnectedNodes(sourceNode)
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="form-row">
                {chaosTypeRequiresTarget(chaosType) && (
                  <div className="form-group">
                    <label className="dark:text-gray-300">Direction</label>
                    <select
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      value={direction}
                      onChange={(e) => setDirection(e.target.value as ChaosDirection)}
                    >
                      {DIRECTIONS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
              
                )}

                <div className="form-group">
                  <label className="dark:text-gray-300">Duration (optional)</label>
                  <input
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="e.g., 60s, 5m (empty = indefinite)"
                  />
                </div>
              </div>

              {renderParams()}

              <div className="form-actions">
                <button type="submit" className="btn-primary dark:bg-indigo-600 dark:hover:bg-indigo-500" disabled={loading}>
                  {loading ? 'Creating...' : 'Add Condition'}
                </button>
                <button
                  type="button"
                  className="btn-secondary dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingCondition && (
        <div className="modal-overlay dark:bg-black/70" onClick={() => setEditingCondition(null)}>
          <div className="modal-content dark:bg-gray-800 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header dark:border-gray-700">
              <h3 className="dark:text-gray-100">Edit Chaos Condition</h3>
              <button className="close-btn dark:text-gray-400 dark:hover:text-gray-200" onClick={() => setEditingCondition(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="dark:text-gray-300">Direction</label>
                <select
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  value={editDirection}
                  onChange={(e) => setEditDirection(e.target.value as ChaosDirection)}
                >
                  {DIRECTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="dark:text-gray-300">Duration (optional)</label>
                <input
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  type="text"
                  value={editDuration}
                  onChange={(e) => setEditDuration(e.target.value)}
                  placeholder="e.g., 30s, 5m"
                />
              </div>

              {/* Type-specific parameter editing */}
              {editingCondition.chaos_type === 'delay' && (
                <>
                  <div className="form-group">
                    <label className="dark:text-gray-300">Latency</label>
                    <input
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      type="text"
                      value={editParams.latency || ''}
                      onChange={(e) => setEditParams({...editParams, latency: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="dark:text-gray-300">Jitter (optional)</label>
                    <input
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      type="text"
                      value={editParams.jitter || ''}
                      onChange={(e) => setEditParams({...editParams, jitter: e.target.value || undefined})}
                    />
                  </div>
                </>
              )}

              {editingCondition.chaos_type === 'loss' && (
                <div className="form-group">
                  <label className="dark:text-gray-300">Loss Percentage</label>
                  <input
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    type="number"
                    min="0"
                    max="100"
                    value={editParams.loss || ''}
                    onChange={(e) => setEditParams({...editParams, loss: e.target.value})}
                  />
                </div>
              )}

              {editingCondition.chaos_type === 'bandwidth' && (
                <>
                  <div className="form-group">
                    <label className="dark:text-gray-300">Rate</label>
                    <input
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      type="text"
                      value={editParams.rate || ''}
                      onChange={(e) => setEditParams({...editParams, rate: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="dark:text-gray-300">Buffer</label>
                    <input
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      type="number"
                      value={editParams.buffer || ''}
                      onChange={(e) => setEditParams({...editParams, buffer: parseInt(e.target.value) || undefined})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="dark:text-gray-300">Limit</label>
                    <input
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      type="number"
                      value={editParams.limit || ''}
                      onChange={(e) => setEditParams({...editParams, limit: parseInt(e.target.value) || undefined})}
                    />
                  </div>
                </>
              )}

              {editingCondition.chaos_type === 'corrupt' && (
                <div className="form-group">
                  <label className="dark:text-gray-300">Corrupt Percentage</label>
                  <input
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    type="number"
                    min="0"
                    max="100"
                    value={editParams.corrupt || ''}
                    onChange={(e) => setEditParams({...editParams, corrupt: e.target.value})}
                  />
                </div>
              )}

              {editingCondition.chaos_type === 'duplicate' && (
                <div className="form-group">
                  <label className="dark:text-gray-300">Duplicate Percentage</label>
                  <input
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    type="number"
                    min="0"
                    max="100"
                    value={editParams.duplicate || ''}
                    onChange={(e) => setEditParams({...editParams, duplicate: e.target.value})}
                  />
                </div>
              )}
            </div>
            <div className="modal-footer dark:border-gray-700">
              <button
                className="btn-secondary dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                onClick={() => setEditingCondition(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary dark:bg-indigo-600 dark:hover:bg-indigo-500"
                onClick={handleEditSubmit}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Affected Apps Confirmation Modal */}
      {pendingRequest && (
        <AffectedAppsModal
          isOpen={showConfirmModal}
          onClose={handleCancelConfirm}
          onConfirm={handleConfirmCreate}
          chaosType={pendingRequest.chaos_type}
          sourceNodeId={pendingRequest.source_node_id}
          sourceNodeName={getNodeName(pendingRequest.source_node_id)}
          targetNodeId={pendingRequest.target_node_id}
          targetNodeName={pendingRequest.target_node_id ? getNodeName(pendingRequest.target_node_id) : undefined}
          params={pendingRequest.params || {}}
          applications={applications}
          nodes={nodes.map(n => ({ id: n.id, name: n.name }))}
          isLoading={loading}
        />
      )}
    </div>
  );
}
