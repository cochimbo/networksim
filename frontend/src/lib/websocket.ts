// Singleton WebSocket manager - independent of React lifecycle

export type EventType = 
  | 'topology:created'
  | 'topology:updated'
  | 'topology:deleted'
  | 'deployment:status'
  | 'node:status'
  | 'chaos:applied'
  | 'chaos:removed';

export interface WebSocketEvent {
  type: EventType;
  data: Record<string, unknown>;
}

type Listener = (event: WebSocketEvent) => void;
type StatusListener = (connected: boolean) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectInterval = 3000;
  private reconnectTimeout: number | null = null;
  private isConnecting = false;
  private _isConnected = false;

  get isConnected() {
    return this._isConnected;
  }

  private getWsUrl(): string {
    // In development, connect directly to backend
    if (import.meta.env.DEV) {
      return 'ws://localhost:8080/ws/events';
    }
    // In production, use same host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/events`;
  }

  connect() {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }

    this.isConnecting = true;
    const url = this.getWsUrl();
    console.log('[WebSocket] Connecting to', url);

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this.isConnecting = false;
        this._isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyStatusListeners(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketEvent;
          console.log('[WebSocket] Event:', data.type);
          this.listeners.forEach(listener => {
            try {
              listener(data);
            } catch (err) {
              console.error('[WebSocket] Listener error:', err);
            }
          });
        } catch (err) {
          console.error('[WebSocket] Parse error:', err);
        }
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.isConnecting = false;
        this._isConnected = false;
        this.ws = null;
        this.notifyStatusListeners(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        this.isConnecting = false;
      };
    } catch (err) {
      console.error('[WebSocket] Failed to create:', err);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WebSocket] Max reconnect attempts reached');
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    console.log(`[WebSocket] Reconnecting in ${this.reconnectInterval}ms (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimeout = window.setTimeout(() => {
      this.connect();
    }, this.reconnectInterval);
  }

  private notifyStatusListeners(connected: boolean) {
    this.statusListeners.forEach(listener => listener(connected));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    // Immediately notify of current status
    listener(this._isConnected);
    return () => this.statusListeners.delete(listener);
  }

  reconnect() {
    this.reconnectAttempts = 0;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.connect();
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
  }
}

// Global singleton instance
export const wsManager = new WebSocketManager();

// Auto-connect when module loads
wsManager.connect();
