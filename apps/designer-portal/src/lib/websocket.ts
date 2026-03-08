/**
 * WebSocket client for real-time communication
 */

import { env } from './env';

export type WebSocketEventType =
  | 'message'
  | 'thread_update'
  | 'notification'
  | 'cart_update'
  | 'order_update'
  | 'typing'
  | 'presence'
  | 'ping'
  | 'pong';

export interface WebSocketMessage {
  type: WebSocketEventType;
  payload: unknown;
  timestamp: string;
}

type EventHandler = (data: any) => void;
type ConnectionStateHandler = (connected: boolean) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout = 1000;
  private handlers = new Map<WebSocketEventType, Set<EventHandler>>();
  private connectionStateHandlers = new Set<ConnectionStateHandler>();
  private shouldReconnect = true;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Only initialize on client side
      this.token = sessionStorage.getItem('access_token');
    }
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (typeof window === 'undefined') {
      console.warn('WebSocket connection skipped: not in browser environment');
      return;
    }

    try {
      const wsUrl = this.buildWebSocketUrl();
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  on(eventType: WebSocketEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  onConnectionStateChange(handler: ConnectionStateHandler): () => void {
    this.connectionStateHandlers.add(handler);

    // Return unsubscribe function
    return () => {
      this.connectionStateHandlers.delete(handler);
    };
  }

  send(type: WebSocketEventType, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        type,
        payload,
        timestamp: new Date().toISOString(),
      };
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private buildWebSocketUrl(): string {
    const baseUrl = env.wsUrl;
    const url = new URL(baseUrl);

    if (this.token) {
      url.searchParams.append('token', this.token);
    }

    return url.toString();
  }

  private handleOpen(): void {
    console.log('WebSocket connected');
    this.reconnectAttempts = 0;
    this.startHeartbeat();
    this.notifyConnectionState(true);
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);

      // Handle heartbeat/pong messages
      if (message.type === 'pong' as WebSocketEventType) {
        return;
      }

      // Dispatch to registered handlers
      const handlers = this.handlers.get(message.type);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(message.payload);
          } catch (error) {
            console.error(`Error in WebSocket handler for ${message.type}:`, error);
          }
        });
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleError(event: Event): void {
    console.error('WebSocket error:', event);
  }

  private handleClose(): void {
    console.log('WebSocket disconnected');
    this.stopHeartbeat();
    this.notifyConnectionState(false);

    if (this.shouldReconnect) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(
      this.reconnectTimeout * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    );

    console.log(`Reconnecting in ${delay}ms...`);
    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send('ping' as WebSocketEventType, {});
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private notifyConnectionState(connected: boolean): void {
    this.connectionStateHandlers.forEach((handler) => {
      try {
        handler(connected);
      } catch (error) {
        console.error('Error in connection state handler:', error);
      }
    });
  }

  updateToken(token: string | null): void {
    this.token = token;
    if (token && typeof window !== 'undefined') {
      sessionStorage.setItem('access_token', token);
    }
    // Reconnect with new token
    if (this.isConnected()) {
      this.disconnect();
      this.shouldReconnect = true;
      this.connect();
    }
  }
}

// Singleton instance
export const wsClient = new WebSocketClient();

// Auto-connect on client side if token is available
if (typeof window !== 'undefined') {
  const token = sessionStorage.getItem('access_token');
  if (token) {
    wsClient.connect();
  }
}
