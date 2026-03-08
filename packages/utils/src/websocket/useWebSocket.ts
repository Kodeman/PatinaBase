import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ConnectionMonitor, ConnectionQuality } from './connection-monitor';

/**
 * WebSocket Hook Configuration
 */
export interface UseWebSocketConfig {
  namespace: string;
  url?: string;
  enabled?: boolean;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionAttempts?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onQueuedMessages?: (messages: any[]) => void;
}

/**
 * WebSocket Hook Events
 */
export type WebSocketEvents = Record<string, (data: any) => void>;

/**
 * WebSocket Hook Return Value
 */
export interface UseWebSocketReturn {
  isConnected: boolean;
  connectionQuality: ConnectionQuality;
  socket: Socket | null;
  emit: (event: string, data?: any) => void;
  subscribe: (projectId: string) => void;
  unsubscribe: (projectId: string) => void;
  reconnect: () => void;
}

/**
 * React Hook for WebSocket Connections
 *
 * Provides real-time WebSocket connectivity with automatic reconnection,
 * connection quality monitoring, and event handling.
 *
 * @example
 * ```tsx
 * const { isConnected, emit, subscribe } = useWebSocket({
 *   namespace: '/projects',
 *   events: {
 *     'approval:created': (data) => console.log('New approval:', data),
 *   },
 * });
 *
 * useEffect(() => {
 *   if (isConnected && projectId) {
 *     subscribe(projectId);
 *   }
 * }, [isConnected, projectId, subscribe]);
 * ```
 */
export function useWebSocket(
  config: UseWebSocketConfig,
  events: WebSocketEvents = {},
): UseWebSocketReturn {
  const {
    namespace,
    url = process.env.NEXT_PUBLIC_PROJECTS_API_URL || 'http://localhost:3016',
    enabled = true,
    reconnection = true,
    reconnectionDelay = 1000,
    reconnectionAttempts = 5,
    onConnect,
    onDisconnect,
    onError,
    onQueuedMessages,
  } = config;

  const [isConnected, setIsConnected] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('disconnected');

  const socketRef = useRef<Socket | null>(null);
  const monitorRef = useRef<ConnectionMonitor>(new ConnectionMonitor());
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Get auth token from storage
   */
  const getAuthToken = useCallback((): string | null => {
    if (typeof window === 'undefined') return null;

    // Try to get token from localStorage or sessionStorage
    try {
      const winAny = window as any;
      return (
        (typeof winAny.localStorage !== 'undefined' ? winAny.localStorage.getItem('authToken') : null) ||
        (typeof winAny.sessionStorage !== 'undefined' ? winAny.sessionStorage.getItem('authToken') : null) ||
        null
      );
    } catch {
      return null;
    }
  }, []);

  /**
   * Start ping interval for connection monitoring
   */
  const startPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    pingIntervalRef.current = setInterval(() => {
      if (socketRef.current?.connected) {
        const clientTimestamp = Date.now();
        socketRef.current.emit('ping', { clientTimestamp });
      }
    }, 10000); // Ping every 10 seconds
  }, []);

  /**
   * Stop ping interval
   */
  const stopPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  /**
   * Initialize WebSocket connection
   */
  useEffect(() => {
    if (!enabled) return;

    const token = getAuthToken();
    if (!token) {
      console.warn('No auth token found, WebSocket connection not established');
      return;
    }

    // Create socket instance
    const socket = io(`${url}${namespace}`, {
      auth: { token },
      reconnection,
      reconnectionDelay,
      reconnectionAttempts,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    // Connection event handlers
    socket.on('connect', () => {
      console.log(`WebSocket connected: ${socket.id}`);
      setIsConnected(true);
      startPingInterval();
      monitorRef.current.reset();
      onConnect?.();
    });

    socket.on('disconnect', (reason: any) => {
      console.log(`WebSocket disconnected: ${reason}`);
      setIsConnected(false);
      setConnectionQuality('disconnected');
      stopPingInterval();
      onDisconnect?.();
    });

    socket.on('connect_error', (error: any) => {
      console.error('WebSocket connection error:', error);
      setConnectionQuality('disconnected');
      onError?.(error);
    });

    // Pong handler for latency measurement
    socket.on('pong', (data: { serverTimestamp: number; quality?: ConnectionQuality; avgLatency?: number }) => {
      const clientTimestamp = Date.now();
      const roundTripLatency = clientTimestamp - data.serverTimestamp;

      monitorRef.current.recordLatency(roundTripLatency);

      const quality = monitorRef.current.getQuality();
      setConnectionQuality(quality);
    });

    // Handle queued messages from server
    socket.on('queued:messages', (data: { messages: any[]; count: number }) => {
      console.log(`Received ${data.count} queued messages`);
      onQueuedMessages?.(data.messages);
    });

    // Register custom event listeners
    Object.entries(events).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    // Cleanup on unmount
    return () => {
      stopPingInterval();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    namespace,
    url,
    enabled,
    reconnection,
    reconnectionDelay,
    reconnectionAttempts,
    getAuthToken,
    startPingInterval,
    stopPingInterval,
    onConnect,
    onDisconnect,
    onError,
    onQueuedMessages,
  ]);

  /**
   * Update event listeners when events change
   */
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    // Re-register event listeners
    Object.entries(events).forEach(([event, handler]) => {
      socket.off(event); // Remove old listener
      socket.on(event, handler); // Add new listener
    });

    return () => {
      Object.keys(events).forEach((event) => {
        socket.off(event);
      });
    };
  }, [events]);

  /**
   * Emit event to server
   */
  const emit = useCallback((event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn('Cannot emit event: Socket not connected');
    }
  }, []);

  /**
   * Subscribe to project updates
   */
  const subscribe = useCallback((projectId: string) => {
    emit('subscribe:project', { projectId });
  }, [emit]);

  /**
   * Unsubscribe from project updates
   */
  const unsubscribe = useCallback((projectId: string) => {
    emit('unsubscribe:project', { projectId });
  }, [emit]);

  /**
   * Manually reconnect
   */
  const reconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.connect();
    }
  }, []);

  return {
    isConnected,
    connectionQuality,
    socket: socketRef.current,
    emit,
    subscribe,
    unsubscribe,
    reconnect,
  };
}
