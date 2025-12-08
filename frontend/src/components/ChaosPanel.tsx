import { useState, useEffect } from 'react';
import {
  chaosApi,
  ChaosStatus,
  ChaosType,
  ChaosDirection,
  CreateChaosRequest,
  Node,
} from '../services/api';
import './ChaosPanel.css';

interface ChaosPanelProps {
  topologyId: string;
  nodes: Node[];
  onClose: () => void;
}

const CHAOS_TYPES: { value: ChaosType; label: string; description: string }[] = [
  { value: 'delay', label: 'Delay', description: 'Add latency to network traffic' },
  { value: 'loss', label: 'Packet Loss', description: 'Drop a percentage of packets' },
  { value: 'bandwidth', label: 'Bandwidth', description: 'Limit network bandwidth' },
  { value: 'corrupt', label: 'Corrupt', description: 'Corrupt packet data' },
  { value: 'duplicate', label: 'Duplicate', description: 'Duplicate packets' },
  { value: 'partition', label: 'Partition', description: 'Complete network partition' },
];

const DIRECTIONS: { value: ChaosDirection; label: string }[] = [
  { value: 'to', label: 'Outgoing' },
  { value: 'from', label: 'Incoming' },
  { value: 'both', label: 'Both' },
];

export function ChaosPanel({ topologyId, nodes, onClose }: ChaosPanelProps) {
  const [conditions, setConditions] = useState<ChaosStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [chaosType, setChaosType] = useState<ChaosType>('delay');
  const [sourceNode, setSourceNode] = useState<string>('');
  const [targetNode, setTargetNode] = useState<string>('');
  const [direction, setDirection] = useState<ChaosDirection>('to');
  const [duration, setDuration] = useState<string>('60s');

  // Type-specific params
  const [latency, setLatency] = useState('100ms');
  const [jitter, setJitter] = useState('20ms');
  const [lossPercent, setLossPercent] = useState('10');
  const [bandwidthRate, setBandwidthRate] = useState('1mbps');
  const [corruptPercent, setCorruptPercent] = useState('10');
  const [duplicatePercent, setDuplicatePercent] = useState('10');

  useEffect(() => {
    fetchConditions();
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

    try {
      setLoading(true);
      await chaosApi.create(request);
      setShowForm(false);
      await fetchConditions();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create chaos condition');
      console.error(err);
    } finally {
      setLoading(false);
    }
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
      default:
        return {};
    }
  };

  const handleDelete = async (conditionId: string) => {
    try {
      setLoading(true);
      await chaosApi.delete(topologyId, conditionId);
      await fetchConditions();
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
    } catch (err) {
      setError('Failed to delete all chaos conditions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const renderParams = () => {
    switch (chaosType) {
      case 'delay':
        return (
          <>
            <div className="form-group">
              <label>Latency</label>
              <input
                type="text"
                value={latency}
                onChange={(e) => setLatency(e.target.value)}
                placeholder="100ms"
              />
            </div>
            <div className="form-group">
              <label>Jitter (optional)</label>
              <input
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
            <label>Loss Percentage</label>
            <input
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
            <label>Rate Limit</label>
            <input
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
            <label>Corruption Percentage</label>
            <input
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
            <label>Duplication Percentage</label>
            <input
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
          <p className="info-text">
            Network partition will completely disconnect the selected nodes.
          </p>
        );
      default:
        return null;
    }
  };

  return (
    <div className="chaos-panel">
      <div className="chaos-panel-header">
        <h3>🔥 Chaos Engineering</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="chaos-panel-content">
        {/* Active Conditions */}
        <div className="section">
          <div className="section-header">
            <h4>Active Conditions</h4>
            {conditions.length > 0 && (
              <button className="btn-danger-small" onClick={handleDeleteAll}>
                Delete All
              </button>
            )}
          </div>

          {loading && <div className="loading">Loading...</div>}

          {conditions.length === 0 ? (
            <p className="empty-text">No active chaos conditions</p>
          ) : (
            <ul className="conditions-list">
              {conditions.map((c) => (
                <li key={c.condition_id} className="condition-item">
                  <div className="condition-info">
                    <span className={`status-badge ${c.phase.toLowerCase()}`}>
                      {c.phase}
                    </span>
                    <span className="condition-type">{c.chaos_type}</span>
                    <span className="condition-targets">
                      {c.target_pods.join(' → ')}
                    </span>
                  </div>
                  <button
                    className="btn-delete"
                    onClick={() => handleDelete(c.condition_id)}
                    disabled={loading}
                  >
                    🗑️
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add New Condition */}
        <div className="section">
          {!showForm ? (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Add Chaos Condition
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="chaos-form">
              <h4>New Chaos Condition</h4>

              <div className="form-group">
                <label>Type</label>
                <select
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
                  <label>Source Node</label>
                  <select
                    value={sourceNode}
                    onChange={(e) => setSourceNode(e.target.value)}
                    required
                  >
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Target Node (optional)</label>
                  <select
                    value={targetNode}
                    onChange={(e) => setTargetNode(e.target.value)}
                  >
                    <option value="">All traffic</option>
                    {nodes
                      .filter((n) => n.id !== sourceNode)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name} ({n.type})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Direction</label>
                  <select
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

                <div className="form-group">
                  <label>Duration (optional)</label>
                  <input
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="60s, 5m"
                  />
                </div>
              </div>

              {renderParams()}

              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Condition'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
