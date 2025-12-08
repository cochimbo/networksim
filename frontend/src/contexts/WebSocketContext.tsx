import React, { createContext, useContext, useEffect, useState } from 'react';
import { wsManager, WebSocketEvent } from '../lib/websocket';

// Re-export types
export type { EventType, WebSocketEvent } from '../lib/websocket';

interface WebSocketContextValue {
  isConnected: boolean;
  reconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  isConnected: false,
  reconnect: () => {},
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(wsManager.isConnected);

  useEffect(() => {
    // Subscribe to status changes
    const unsubscribe = wsManager.subscribeStatus(setIsConnected);
    return unsubscribe;
  }, []);

  const reconnect = () => {
    wsManager.reconnect();
  };

  return (
    <WebSocketContext.Provider value={{ isConnected, reconnect }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  return useContext(WebSocketContext);
}

// Hook for components that need to react to events
export function useWebSocketEvents(onEvent?: (event: WebSocketEvent) => void) {
  const { isConnected, reconnect } = useWebSocketContext();

  useEffect(() => {
    if (onEvent) {
      return wsManager.subscribe(onEvent);
    }
  }, [onEvent]);

  return { isConnected, reconnect };
}
