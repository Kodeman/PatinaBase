'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { WebSocketService, WebSocketEvent, WebSocketMessage, WebSocketMilestoneUpdate, WebSocketApprovalUpdate, WebSocketActivityUpdate, WebSocketPresenceUpdate } from './websocket-service';
import { usePathname } from 'next/navigation';

// Context value type
interface WebSocketContextValue {
  isConnected: boolean;
  // Event subscription methods
  onMilestoneUpdate: (handler: (update: WebSocketMilestoneUpdate) => void) => () => void;
  onMessageReceived: (handler: (message: WebSocketMessage) => void) => () => void;
  onApprovalUpdate: (handler: (update: WebSocketApprovalUpdate) => void) => () => void;
  onActivityUpdate: (handler: (update: WebSocketActivityUpdate) => void) => () => void;
  onPresenceUpdate: (handler: (update: WebSocketPresenceUpdate) => void) => () => void;
  onMilestoneCompleted: (handler: (milestone: WebSocketMilestoneUpdate) => void) => () => void;
  // Actions
  joinMilestone: (milestoneId: string) => void;
  leaveMilestone: (milestoneId: string) => void;
  // Connection management
  reconnect: () => void;
}

// Create context
const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// WebSocket provider props
interface WebSocketProviderProps {
  children: React.ReactNode;
  projectId?: string;
  userId?: string;
  authToken?: string;
  wsUrl?: string;
  debug?: boolean;
}

// WebSocket provider component
export function WebSocketProvider({
  children,
  projectId,
  userId,
  authToken,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3016',
  debug = process.env.NODE_ENV === 'development',
}: WebSocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const wsServiceRef = useRef<WebSocketService | null>(null);
  const eventHandlersRef = useRef<Map<string, Set<Function>>>(new Map());
  const pathname = usePathname();

  // Set up global event handlers
  const setupGlobalEventHandlers = useCallback((wsService: WebSocketService) => {
    // Connection status handlers
    wsService.on(WebSocketEvent.CONNECT, () => {
      setIsConnected(true);
      if (debug) console.log('[WebSocket Context] Connection established');
    });

    wsService.on(WebSocketEvent.DISCONNECT, () => {
      setIsConnected(false);
      if (debug) console.log('[WebSocket Context] Connection lost');
    });

    wsService.on(WebSocketEvent.RECONNECT, () => {
      setIsConnected(true);
      if (debug) console.log('[WebSocket Context] Reconnected');
    });

    wsService.on(WebSocketEvent.ERROR, (error: any) => {
      console.error('[WebSocket Context] Error:', error);
    });
  }, [debug]);

  // Initialize WebSocket connection
  useEffect(() => {
    // Extract projectId from pathname if not provided
    const currentProjectId = projectId || pathname.match(/projects\/([^\/]+)/)?.[1];

    if (!currentProjectId) {
      if (debug) console.log('[WebSocket Context] No projectId available, skipping connection');
      return;
    }

    // Create WebSocket service instance
    const wsService = new WebSocketService({
      url: wsUrl,
      projectId: currentProjectId,
      userId,
      authToken,
      debug,
    });

    wsServiceRef.current = wsService;

    // Connect to WebSocket
    wsService.connect()
      .then(() => {
        setIsConnected(true);
        if (debug) console.log('[WebSocket Context] Connected successfully');

        // Set up global event handlers
        setupGlobalEventHandlers(wsService);
      })
      .catch((error) => {
        console.error('[WebSocket Context] Connection failed:', error);
        setIsConnected(false);
      });

    // Cleanup on unmount
    return () => {
      if (debug) console.log('[WebSocket Context] Cleaning up connection');
      wsService.disconnect();
      wsServiceRef.current = null;
      setIsConnected(false);
    };
  }, [projectId, userId, authToken, wsUrl, debug, pathname, setupGlobalEventHandlers]);

  // Generic event subscription helper
  const subscribeToEvent = useCallback(
    (event: WebSocketEvent, handler: Function): (() => void) => {
      if (!wsServiceRef.current) {
        console.warn('[WebSocket Context] Cannot subscribe: service not initialized');
        return () => {};
      }

      // Add handler to internal tracking
      if (!eventHandlersRef.current.has(event)) {
        eventHandlersRef.current.set(event, new Set());
      }
      eventHandlersRef.current.get(event)?.add(handler);

      // Register with WebSocket service
      wsServiceRef.current.on(event, handler);

      // Return cleanup function
      return () => {
        if (wsServiceRef.current) {
          wsServiceRef.current.off(event, handler);
        }
        eventHandlersRef.current.get(event)?.delete(handler);
      };
    },
    []
  );

  // Event subscription methods
  const onMilestoneUpdate = useCallback(
    (handler: (update: WebSocketMilestoneUpdate) => void) => {
      return subscribeToEvent(WebSocketEvent.MILESTONE_UPDATED, handler);
    },
    [subscribeToEvent]
  );

  const onMessageReceived = useCallback(
    (handler: (message: WebSocketMessage) => void) => {
      return subscribeToEvent(WebSocketEvent.MESSAGE_NEW, handler);
    },
    [subscribeToEvent]
  );

  const onApprovalUpdate = useCallback(
    (handler: (update: WebSocketApprovalUpdate) => void) => {
      return subscribeToEvent(WebSocketEvent.APPROVAL_UPDATED, handler);
    },
    [subscribeToEvent]
  );

  const onActivityUpdate = useCallback(
    (handler: (update: WebSocketActivityUpdate) => void) => {
      return subscribeToEvent(WebSocketEvent.ACTIVITY_NEW, handler);
    },
    [subscribeToEvent]
  );

  const onPresenceUpdate = useCallback(
    (handler: (update: WebSocketPresenceUpdate) => void) => {
      return subscribeToEvent(WebSocketEvent.TEAM_MEMBER_PRESENCE, handler);
    },
    [subscribeToEvent]
  );

  const onMilestoneCompleted = useCallback(
    (handler: (milestone: WebSocketMilestoneUpdate) => void) => {
      return subscribeToEvent(WebSocketEvent.MILESTONE_COMPLETED, handler);
    },
    [subscribeToEvent]
  );

  // Milestone room management
  const joinMilestone = useCallback((milestoneId: string) => {
    if (wsServiceRef.current) {
      wsServiceRef.current.joinMilestone(milestoneId);
    }
  }, []);

  const leaveMilestone = useCallback((milestoneId: string) => {
    if (wsServiceRef.current) {
      wsServiceRef.current.leaveMilestone(milestoneId);
    }
  }, []);

  // Reconnect method
  const reconnect = useCallback(() => {
    if (wsServiceRef.current) {
      wsServiceRef.current.connect().catch((error) => {
        console.error('[WebSocket Context] Reconnection failed:', error);
      });
    }
  }, []);

  // Context value
  const contextValue: WebSocketContextValue = {
    isConnected,
    onMilestoneUpdate,
    onMessageReceived,
    onApprovalUpdate,
    onActivityUpdate,
    onPresenceUpdate,
    onMilestoneCompleted,
    joinMilestone,
    leaveMilestone,
    reconnect,
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

// Hook to use WebSocket context
export function useWebSocket(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

// Hook for milestone-specific subscriptions
export function useMilestoneWebSocket(milestoneId: string) {
  const { joinMilestone, leaveMilestone, onMessageReceived, isConnected } = useWebSocket();
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);

  useEffect(() => {
    if (!milestoneId || !isConnected) return;

    // Join milestone room
    joinMilestone(milestoneId);

    // Subscribe to messages for this milestone
    const unsubscribe = onMessageReceived((message) => {
      if (message.milestoneId === milestoneId) {
        setMessages((prev) => [...prev, message]);
      }
    });

    // Cleanup
    return () => {
      leaveMilestone(milestoneId);
      unsubscribe();
    };
  }, [milestoneId, isConnected, joinMilestone, leaveMilestone, onMessageReceived]);

  return { messages, isConnected };
}

// Hook for project-level activity feed
export function useActivityFeed() {
  const { onActivityUpdate, isConnected } = useWebSocket();
  const [activities, setActivities] = useState<WebSocketActivityUpdate[]>([]);

  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = onActivityUpdate((activity) => {
      setActivities((prev) => [activity, ...prev].slice(0, 50)); // Keep last 50 activities
    });

    return unsubscribe;
  }, [isConnected, onActivityUpdate]);

  return activities;
}

// Hook for team presence tracking
export function useTeamPresence() {
  const { onPresenceUpdate, isConnected } = useWebSocket();
  const [presence, setPresence] = useState<Map<string, WebSocketPresenceUpdate>>(new Map());

  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = onPresenceUpdate((update) => {
      setPresence((prev) => {
        const newPresence = new Map(prev);
        if (update.status === 'offline') {
          newPresence.delete(update.userId);
        } else {
          newPresence.set(update.userId, update);
        }
        return newPresence;
      });
    });

    return unsubscribe;
  }, [isConnected, onPresenceUpdate]);

  return Array.from(presence.values());
}
