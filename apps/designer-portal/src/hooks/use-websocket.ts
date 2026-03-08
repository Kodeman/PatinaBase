'use client'

/**
 * React hooks for WebSocket integration
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { wsClient, WebSocketEventType } from '@/lib/websocket';
import { queryKeys } from '@/lib/react-query';

/**
 * Hook to listen for WebSocket events
 */
export function useWebSocketEvent<T = any>(
  eventType: WebSocketEventType,
  handler: (data: T) => void,
  enabled = true
) {
  const handlerRef = useRef(handler);

  // Update ref when handler changes
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = wsClient.on(eventType, (data) => {
      handlerRef.current(data);
    });

    return unsubscribe;
  }, [eventType, enabled]);
}

/**
 * Hook to get WebSocket connection state
 */
export function useWebSocketConnectionState() {
  const [isConnected, setIsConnected] = useState(wsClient.isConnected());

  useEffect(() => {
    const unsubscribe = wsClient.onConnectionStateChange(setIsConnected);
    return unsubscribe;
  }, []);

  return isConnected;
}

/**
 * Hook to send WebSocket messages
 */
export function useWebSocketSend() {
  const send = useCallback((type: WebSocketEventType, payload: unknown) => {
    wsClient.send(type, payload);
  }, []);

  return send;
}

/**
 * Hook for real-time message updates
 */
export function useRealtimeMessages(threadId: string | null) {
  const queryClient = useQueryClient();

  useWebSocketEvent(
    'message',
    useCallback(
      (message: any) => {
        if (!threadId || message.threadId !== threadId) return;

        // Invalidate thread queries to refetch new messages
        queryClient.invalidateQueries({
          queryKey: queryKeys.threads.detail(threadId),
        });
      },
      [threadId, queryClient]
    ),
    !!threadId
  );
}

/**
 * Hook for real-time thread updates
 */
export function useRealtimeThreads() {
  const queryClient = useQueryClient();

  useWebSocketEvent(
    'thread_update',
    useCallback(
      () => {
        // Invalidate all thread list queries
        queryClient.invalidateQueries({
          queryKey: queryKeys.threads.all,
        });
      },
      [queryClient]
    )
  );
}

/**
 * Hook for typing indicators
 */
export function useTypingIndicator(threadId: string | null) {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const send = useWebSocketSend();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useWebSocketEvent(
    'typing',
    useCallback(
      (data: { threadId: string; userId: string; isTyping: boolean }) => {
        if (!threadId || data.threadId !== threadId) return;

        setTypingUsers((prev) => {
          if (data.isTyping) {
            return prev.includes(data.userId) ? prev : [...prev, data.userId];
          } else {
            return prev.filter((id) => id !== data.userId);
          }
        });
      },
      [threadId]
    ),
    !!threadId
  );

  const setTyping = useCallback(
    (isTyping: boolean, userId: string) => {
      if (!threadId) return;

      send('typing', { threadId, userId, isTyping });

      // Auto-stop typing after 3 seconds
      if (isTyping) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          send('typing', { threadId, userId, isTyping: false });
        }, 3000);
      }
    },
    [threadId, send]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { typingUsers, setTyping };
}

/**
 * Hook for real-time notifications
 */
export function useRealtimeNotifications() {
  const [notifications, setNotifications] = useState<any[]>([]);

  useWebSocketEvent(
    'notification',
    useCallback((notification: any) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 50)); // Keep last 50
    }, [])
  );

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications, clearNotifications, removeNotification };
}

/**
 * Hook for real-time cart updates
 */
export function useRealtimeCart(cartId: string | null) {
  const queryClient = useQueryClient();

  useWebSocketEvent(
    'cart_update',
    useCallback(
      (data: { cartId: string }) => {
        if (!cartId || data.cartId !== cartId) return;

        // Invalidate cart queries
        queryClient.invalidateQueries({
          queryKey: ['carts', cartId],
        });
      },
      [cartId, queryClient]
    ),
    !!cartId
  );
}

/**
 * Hook for real-time order updates
 */
export function useRealtimeOrder(orderId: string | null) {
  const queryClient = useQueryClient();

  useWebSocketEvent(
    'order_update',
    useCallback(
      (data: { orderId: string }) => {
        if (!orderId || data.orderId !== orderId) return;

        // Invalidate order queries
        queryClient.invalidateQueries({
          queryKey: ['orders', orderId],
        });
      },
      [orderId, queryClient]
    ),
    !!orderId
  );
}

/**
 * Hook to manage WebSocket connection lifecycle
 */
export function useWebSocketConnection() {
  useEffect(() => {
    // Connect on mount
    wsClient.connect();

    // Disconnect on unmount
    return () => {
      // Don't disconnect on unmount as we want to maintain connection across components
      // Only disconnect when explicitly needed or on app unmount
    };
  }, []);

  const isConnected = useWebSocketConnectionState();

  const connect = useCallback(() => {
    wsClient.connect();
  }, []);

  const disconnect = useCallback(() => {
    wsClient.disconnect();
  }, []);

  return { isConnected, connect, disconnect };
}

/**
 * Hook for user presence tracking
 */
export function usePresence(userId: string | null) {
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const send = useWebSocketSend();

  useWebSocketEvent(
    'presence',
    useCallback((data: { userId: string; status: 'online' | 'offline' }) => {
      setOnlineUsers((prev) => {
        if (data.status === 'online') {
          return prev.includes(data.userId) ? prev : [...prev, data.userId];
        } else {
          return prev.filter((id) => id !== data.userId);
        }
      });
    }, [])
  );

  const setStatus = useCallback(
    (status: 'online' | 'offline') => {
      if (!userId) return;
      send('presence', { userId, status });
    },
    [userId, send]
  );

  // Set online on mount and offline on unmount
  useEffect(() => {
    if (userId) {
      setStatus('online');
      return () => {
        setStatus('offline');
      };
    }
  }, [userId, setStatus]);

  return { onlineUsers, setStatus };
}
