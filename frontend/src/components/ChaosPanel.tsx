import { useState, useEffect } from 'react';
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
} from '../services/api';
import './ChaosPanel.css';

interface ChaosPanelProps {
  topologyId: string;
  nodes: Node[];
  links: Link[];
  onClose?: () => void;
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

const STATUS_LABELS: Record<ChaosConditionStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#999' },
  active: { label: 'Active', color: '#4caf50' },
  paused: { label: 'Paused', color: '#ff9800' },
};

export function ChaosPanel({ topologyId, nodes, links, onClose }: ChaosPanelProps) {
  const [conditions, setConditions] = useState<ChaosCondition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedConditions, setExpandedConditions] = useState<Set<string>>(new Set());
  const [editingCondition, setEditingCondition] = useState<ChaosCondition | null>(null);
  const [editDirection, setEditDirection] = useState<ChaosDirection>('to');
  const [editDuration, setEditDuration] = useState<string>('');
  const [editParams, setEditParams] = useState<Record<string, any>>({});

  const queryClient = useQueryClient();

  // Form state
  const [chaosType, setChaosType] = useState<ChaosType>('delay');
  const [sourceNode, setSourceNode] = useState<string>('');
  const [targetNode, setTargetNode] = useState<string>('');
  const [direction, setDirection] = useState<ChaosDirection>('to');
  const [duration, setDuration] = useState<string>('');

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
    
    console.log('ChaosPanel handleSubmit called');
    console.log('topologyId:', topologyId);
    console.log('sourceNode:', sourceNode);
    console.log('targetNode:', targetNode);
    
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

    console.log('Request to send:', request);

    try {
      setLoading(true);
      await chaosApi.create(request);
      setShowForm(false);
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

  const hasActiveConditions = conditions.some(c => c.status === 'active');
  const hasInactiveConditions = conditions.some(c => c.status !== 'active');

  return (
    <div className="chaos-panel">
      <div className="chaos-panel-header">
        <h3>🔥 Chaos Engineering</h3>
        <div className="header-actions">
          <button 
            className="refresh-btn"
            onClick={fetchConditions}
            disabled={loading}
            title="Refresh conditions"
          >
            🔄
          </button>
          {onClose && <button className="close-btn" onClick={onClose}>×</button>}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="chaos-panel-content">
        {/* Global Controls */}
        {conditions.length > 0 && (
          <div className="global-controls">
            <button 
              className="btn-success"
              onClick={handleStartAll}
              disabled={loading || !hasInactiveConditions}
              title="Start all conditions"
            >
              ▶ Start All
            </button>
            <button 
              className="btn-warning"
              onClick={handleStopAll}
              disabled={loading || !hasActiveConditions}
              title="Stop all conditions"
            >
              ⏸ Stop All
            </button>
            <button 
              className="btn-danger"
              onClick={handleDeleteAll}
              disabled={loading}
              title="Delete all conditions"
            >
              🗑 Delete All
            </button>
          </div>
        )}

        {/* Conditions List */}
        <div className="section">
          <div className="section-header">
            <h4>Chaos Conditions ({conditions.length})</h4>
          </div>

          {loading && conditions.length === 0 && <div className="loading">Loading...</div>}

          {conditions.length === 0 ? (
            <p className="empty-text">No chaos conditions defined. Add one below.</p>
          ) : (
            <ul className="conditions-list">
              {conditions.map((c) => {
                const isExpanded = expandedConditions.has(c.id);
                return (
                  <li key={c.id} className={`condition-item status-${c.status} ${isExpanded ? 'expanded' : ''}`}>
                    <div className="condition-main">
                      <button
                        className="btn-icon btn-expand"
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
                        <div className="condition-type">
                          {CHAOS_TYPES.find(t => t.value === c.chaos_type)?.label || c.chaos_type}
                          <span className="condition-params">{formatParams(c)}</span>
                        </div>
                        <div className="condition-targets">
                          {getNodeName(c.source_node_id)} 
                          {c.target_node_id 
                            ? ` → ${getNodeName(c.target_node_id)}`
                            : ' → All'
                          }
                        </div>
                      </div>
                    </div>
                    <div className="condition-actions">
                      <button
                        className="btn-icon btn-edit"
                        onClick={() => handleEdit(c)}
                        disabled={loading}
                        title="Edit"
                      >
                        ✏
                      </button>
                      {c.status === 'active' ? (
                        <button
                          className="btn-icon btn-stop"
                          onClick={() => handleStop(c.id)}
                          disabled={loading}
                          title="Stop"
                        >
                          ⏸
                        </button>
                      ) : (
                        <button
                          className="btn-icon btn-start"
                          onClick={() => handleStart(c.id)}
                          disabled={loading}
                          title="Start"
                        >
                          ▶
                        </button>
                      )}
                      <button
                        className="btn-icon btn-delete"
                        onClick={() => handleDelete(c.id)}
                        disabled={loading}
                        title="Delete"
                      >
                        🗑
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="condition-details">
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
                        {n.name}
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
                    {getConnectedNodes(sourceNode)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
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
                    placeholder="e.g., 60s, 5m (empty = indefinite)"
                  />
                </div>
              </div>

              {renderParams()}

              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Creating...' : 'Add Condition'}
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

      {/* Edit Modal */}
      {editingCondition && (
        <div className="modal-overlay" onClick={() => setEditingCondition(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Chaos Condition</h3>
              <button className="close-btn" onClick={() => setEditingCondition(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Direction</label>
                <select
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
                <label>Duration (optional)</label>
                <input
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
                    <label>Latency</label>
                    <input
                      type="text"
                      value={editParams.latency || ''}
                      onChange={(e) => setEditParams({...editParams, latency: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Jitter (optional)</label>
                    <input
                      type="text"
                      value={editParams.jitter || ''}
                      onChange={(e) => setEditParams({...editParams, jitter: e.target.value || undefined})}
                    />
                  </div>
                </>
              )}

              {editingCondition.chaos_type === 'loss' && (
                <div className="form-group">
                  <label>Loss Percentage</label>
                  <input
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
                    <label>Rate</label>
                    <input
                      type="text"
                      value={editParams.rate || ''}
                      onChange={(e) => setEditParams({...editParams, rate: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Buffer</label>
                    <input
                      type="number"
                      value={editParams.buffer || ''}
                      onChange={(e) => setEditParams({...editParams, buffer: parseInt(e.target.value) || undefined})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Limit</label>
                    <input
                      type="number"
                      value={editParams.limit || ''}
                      onChange={(e) => setEditParams({...editParams, limit: parseInt(e.target.value) || undefined})}
                    />
                  </div>
                </>
              )}

              {editingCondition.chaos_type === 'corrupt' && (
                <div className="form-group">
                  <label>Corrupt Percentage</label>
                  <input
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
                  <label>Duplicate Percentage</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editParams.duplicate || ''}
                    onChange={(e) => setEditParams({...editParams, duplicate: e.target.value})}
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setEditingCondition(null)}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={handleEditSubmit}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
