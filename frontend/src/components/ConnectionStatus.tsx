import { useWebSocketEvents, WebSocketEvent } from '../contexts/WebSocketContext';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import './ConnectionStatus.css';

interface ConnectionStatusProps {
  showEvents?: boolean;
}

export function ConnectionStatus({ showEvents = false }: ConnectionStatusProps) {
  const queryClient = useQueryClient();
  const [recentEvents, setRecentEvents] = useState<WebSocketEvent[]>([]);

  const handleEvent = useCallback((event: WebSocketEvent) => {
    // Update recent events for display
    setRecentEvents(prev => [event, ...prev.slice(0, 4)]);

    // Invalidate queries based on event type
    switch (event.type) {
      case 'topology:created':
      case 'topology:updated':
      case 'topology:deleted':
        queryClient.invalidateQueries({ queryKey: ['topologies'] });
        if (event.data.id) {
          queryClient.invalidateQueries({ queryKey: ['topology', event.data.id] });
        }
        break;
      case 'deployment:status':
      case 'node:status':
        if (event.data.topology_id) {
          queryClient.invalidateQueries({ 
            queryKey: ['deployment-status', event.data.topology_id] 
          });
        }
        break;
      case 'chaos:applied':
      case 'chaos:removed':
        queryClient.invalidateQueries({ queryKey: ['chaos'] });
        break;
    }
  }, [queryClient]);

  const { isConnected, reconnect } = useWebSocketEvents(handleEvent);

  // Clear old events after 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setRecentEvents(prev => prev.slice(0, 3));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="connection-status">
      <div 
        className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}
        onClick={() => !isConnected && reconnect()}
        title={isConnected ? 'Real-time updates active' : 'Click to reconnect'}
      >
        <span className="status-dot" />
        <span className="status-text">
          {isConnected ? 'Live' : 'Offline'}
        </span>
      </div>

      {showEvents && recentEvents.length > 0 && (
        <div className="event-feed">
          {recentEvents.map((event, i) => (
            <div key={i} className="event-item">
              <span className="event-type">{event.type}</span>
              <span className="event-data">
                {JSON.stringify(event.data).slice(0, 50)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
