import { useEffect, useState, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  RefreshCw,
  Clock,
  Zap,
  Server,
  Link2,
  TestTube,
  Settings,
} from 'lucide-react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import api from '../services/api';

interface Event {
  id: number;
  topology_id?: string;
  event_type: string;
  event_subtype?: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  source_type?: string;
  source_id?: string;
  created_at: string;
}

interface EventTimelineProps {
  topologyId?: string;
  maxEvents?: number;
  showFilters?: boolean;
  compact?: boolean;
  className?: string;
}

const severityConfig = {
  info: {
    icon: Info,
    color: 'text-blue-500 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
  },
  success: {
    icon: CheckCircle,
    color: 'text-green-500 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-500 dark:text-yellow-400',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    border: 'border-yellow-200 dark:border-yellow-800',
  },
  error: {
    icon: AlertCircle,
    color: 'text-red-500 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
  },
};

const sourceTypeIcons: Record<string, LucideIcon> = {
  node: Server,
  link: Link2,
  chaos: Zap,
  deployment: Settings,
  test: TestTube,
  system: Activity,
};

export function EventTimeline({
  topologyId,
  maxEvents = 50,
  showFilters = true,
  compact = false,
  className = '',
}: EventTimelineProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const { isConnected } = useWebSocketContext();

  // Fetch events from API
  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = { limit: maxEvents.toString() };
      if (topologyId) params.topology_id = topologyId;
      if (severityFilter !== 'all') params.severity = severityFilter;
      if (filter !== 'all') params.event_type = filter;

      const response = await api.listEvents(params);
      setEvents(response.events || []);
      setError(null);
    } catch (err) {
      setError('Failed to load events');
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  }, [topologyId, maxEvents, filter, severityFilter]);

  // Initial fetch
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Listen for new events via WebSocket and polling fallback
  useEffect(() => {
    // Poll for events as fallback when WebSocket is not available
    const interval = setInterval(fetchEvents, 10000);
    return () => clearInterval(interval);
  }, [maxEvents, fetchEvents]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const eventTypes = ['all', 'chaos', 'deployment', 'test', 'node', 'system'];
  const severities = ['all', 'info', 'success', 'warning', 'error'];

  return (
    <div className={`event-timeline flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="timeline-header flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-primary-500" />
          <h3 className="font-semibold text-gray-700 dark:text-gray-300">Event Timeline</h3>
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-gray-400'
            }`}
            title={isConnected ? 'Live updates' : 'Disconnected'}
          />
        </div>
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="p-1.5 rounded hover:bg-gray-200 transition-colors"
          title="Refresh"
        >
          <RefreshCw
            size={16}
            className={`text-gray-500 ${loading ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="timeline-filters flex gap-2 p-2 border-b border-gray-100 bg-white">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-xs px-2 py-1 border rounded bg-white"
          >
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="text-xs px-2 py-1 border rounded bg-white"
          >
            {severities.map((sev) => (
              <option key={sev} value={sev}>
                {sev === 'all' ? 'All Severities' : sev.charAt(0).toUpperCase() + sev.slice(1)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Event List */}
      <div className="timeline-events flex-1 overflow-y-auto">
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <RefreshCw size={20} className="animate-spin mr-2" />
            Loading events...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-red-500">
            <AlertCircle size={20} className="mr-2" />
            {error}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <Clock size={24} className="mb-2" />
            <p className="text-sm">No events yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {events.map((event) => {
              const config = severityConfig[event.severity] || severityConfig.info;
              const SeverityIcon = config.icon;
              const SourceIcon = event.source_type
                ? sourceTypeIcons[event.source_type] || Activity
                : Activity;

              return (
                <div
                  key={event.id}
                  className={`event-item p-3 hover:bg-gray-50 transition-colors ${
                    compact ? 'py-2' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Severity Icon */}
                    <div
                      className={`flex-shrink-0 p-1.5 rounded-full ${config.bg}`}
                    >
                      <SeverityIcon size={14} className={config.color} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-gray-800 text-sm truncate">
                          {event.title}
                        </span>
                        {event.source_type && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <SourceIcon size={12} />
                            {event.source_type}
                          </span>
                        )}
                      </div>

                      {!compact && event.description && (
                        <p className="text-xs text-gray-500 line-clamp-2">
                          {event.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">
                          {formatTime(event.created_at)}
                        </span>
                        {event.event_subtype && (
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                            {event.event_subtype}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default EventTimeline;
