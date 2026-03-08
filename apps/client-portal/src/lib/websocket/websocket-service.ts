import { io, Socket } from 'socket.io-client';
import type { ApprovalStatus } from '@patina/types';

// Event types for type-safe WebSocket communication
// These match the backend event-bridge.service.ts events
export enum WebSocketEvent {
  // Client -> Server events (match backend gateway)
  SUBSCRIBE_PROJECT = 'subscribe:project',
  UNSUBSCRIBE_PROJECT = 'unsubscribe:project',
  PING = 'ping',
  PRESENCE_GET = 'presence:get',

  // Legacy client events (for backwards compatibility)
  JOIN_MILESTONE = 'milestone:join',
  LEAVE_MILESTONE = 'milestone:leave',

  // Server -> Client events (match backend event-bridge)
  PROJECT_STATUS_CHANGED = 'project:status:changed',
  ACTIVITY_LOGGED = 'activity:logged',

  // Milestone events
  MILESTONE_UPDATED = 'milestone:status:changed',
  MILESTONE_COMPLETED = 'milestone:completed',

  // Task events
  TASK_CREATED = 'task:created',
  TASK_STATUS_CHANGED = 'task:status:changed',
  TASK_COMPLETED = 'task:completed',
  TASK_COMMENT_ADDED = 'task:comment:added',

  // Approval events
  APPROVAL_REQUESTED = 'approval:requested',
  APPROVAL_APPROVED = 'approval:approved',
  APPROVAL_REJECTED = 'approval:rejected',
  APPROVAL_DISCUSSED = 'approval:discussed',

  // RFI events
  RFI_CREATED = 'rfi:created',
  RFI_ANSWERED = 'rfi:answered',
  RFI_STATUS_CHANGED = 'rfi:status:changed',

  // Change Order events
  CHANGE_ORDER_SUBMITTED = 'change_order:submitted',
  CHANGE_ORDER_APPROVED = 'change_order:approved',
  CHANGE_ORDER_REJECTED = 'change_order:rejected',

  // Document events
  DOCUMENT_UPLOADED = 'document:uploaded',
  DOCUMENT_VERSION_CREATED = 'document:version:created',

  // Timeline events
  TIMELINE_SEGMENT_UPDATED = 'timeline:segment:updated',

  // Message events (via threads)
  MESSAGE_NEW = 'message:new',
  MESSAGE_UPDATED = 'message:updated',

  // Presence
  TEAM_MEMBER_PRESENCE = 'team:presence',
  PONG = 'pong',

  // Connection events
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  RECONNECT = 'reconnect',
  ERROR = 'error',

  // Legacy aliases for backwards compatibility
  PROJECT_UPDATED = 'project:status:changed',
  APPROVAL_UPDATED = 'approval:approved',
  ACTIVITY_NEW = 'activity:logged',
}

// Type definitions for WebSocket payloads
export interface WebSocketMessage {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  milestoneId: string;
  threadId?: string;
}

export interface WebSocketMilestoneUpdate {
  id: string;
  projectId: string;
  status: string;
  progress: number;
  completedAt?: string;
  updatedFields: string[];
}

export interface WebSocketApprovalUpdate {
  id: string;
  projectId: string;
  milestoneId: string;
  status: ApprovalStatus;
  approvedBy?: string;
  comment?: string;
}

export interface WebSocketActivityUpdate {
  id: string;
  projectId: string;
  type: 'milestone' | 'message' | 'approval' | 'document' | 'status';
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface WebSocketPresenceUpdate {
  projectId: string;
  userId: string;
  userName: string;
  status: 'online' | 'offline' | 'viewing';
  currentMilestone?: string;
  lastSeen: string;
}

// WebSocket service configuration
interface WebSocketConfig {
  url: string;
  projectId?: string;
  userId?: string;
  authToken?: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  debug?: boolean;
}

export class WebSocketService {
  private socket: Socket | null = null;
  private config: WebSocketConfig;
  private eventHandlers: Map<string, Set<Function>> = new Map();
  private isConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;

  constructor(config: WebSocketConfig) {
    this.config = {
      reconnectAttempts: 10,
      reconnectDelay: 1000,
      debug: false,
      ...config,
    };
  }

  // Initialize WebSocket connection
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        if (this.config.debug) console.log('[WebSocket] Already connected');
        resolve();
        return;
      }

      try {
        // Create socket connection with authentication
        this.socket = io(this.config.url, {
          auth: {
            token: this.config.authToken,
            userId: this.config.userId,
          },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: this.config.reconnectAttempts,
          reconnectionDelay: this.config.reconnectDelay,
        });

        // Set up core event handlers
        this.setupCoreEventHandlers();

        // Handle successful connection
        this.socket.on(WebSocketEvent.CONNECT, () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;

          if (this.config.debug) {
            console.log('[WebSocket] Connected successfully');
          }

          // Auto-subscribe to project if projectId is provided
          if (this.config.projectId) {
            this.subscribeToProject(this.config.projectId);
          }

          resolve();
        });

        // Handle connection errors
        this.socket.on(WebSocketEvent.ERROR, (error) => {
          if (this.config.debug) {
            console.error('[WebSocket] Connection error:', error);
          }
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  // Set up core event handlers
  private setupCoreEventHandlers(): void {
    if (!this.socket) return;

    // Handle disconnect
    this.socket.on(WebSocketEvent.DISCONNECT, (reason) => {
      this.isConnected = false;
      if (this.config.debug) {
        console.log('[WebSocket] Disconnected:', reason);
      }
      this.handleReconnect();
    });

    // Handle reconnection
    this.socket.on(WebSocketEvent.RECONNECT, (attemptNumber) => {
      this.isConnected = true;
      if (this.config.debug) {
        console.log(`[WebSocket] Reconnected after ${attemptNumber} attempts`);
      }

      // Re-subscribe to project after reconnection
      if (this.config.projectId) {
        this.subscribeToProject(this.config.projectId);
      }
    });
  }

  // Handle reconnection logic
  private handleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= (this.config.reconnectAttempts || 10)) {
      if (this.config.debug) {
        console.error('[WebSocket] Max reconnection attempts reached');
      }
      return;
    }

    const delay = Math.min(
      (this.config.reconnectDelay || 1000) * Math.pow(2, this.reconnectAttempts),
      30000
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      if (this.config.debug) {
        console.log(`[WebSocket] Attempting reconnection ${this.reconnectAttempts}/${this.config.reconnectAttempts}`);
      }
      this.connect();
    }, delay);
  }

  // Subscribe to project updates
  subscribeToProject(projectId: string): void {
    if (!this.socket?.connected) {
      console.warn('[WebSocket] Cannot subscribe: not connected');
      return;
    }

    this.socket.emit(WebSocketEvent.SUBSCRIBE_PROJECT, { projectId });

    if (this.config.debug) {
      console.log(`[WebSocket] Subscribed to project: ${projectId}`);
    }
  }

  // Unsubscribe from project updates
  unsubscribeFromProject(projectId: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit(WebSocketEvent.UNSUBSCRIBE_PROJECT, { projectId });

    if (this.config.debug) {
      console.log(`[WebSocket] Unsubscribed from project: ${projectId}`);
    }
  }

  // Join milestone room for detailed updates
  joinMilestone(milestoneId: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit(WebSocketEvent.JOIN_MILESTONE, { milestoneId });

    if (this.config.debug) {
      console.log(`[WebSocket] Joined milestone: ${milestoneId}`);
    }
  }

  // Leave milestone room
  leaveMilestone(milestoneId: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit(WebSocketEvent.LEAVE_MILESTONE, { milestoneId });

    if (this.config.debug) {
      console.log(`[WebSocket] Left milestone: ${milestoneId}`);
    }
  }

  // Register event handler
  on(event: WebSocketEvent, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }

    this.eventHandlers.get(event)?.add(handler);

    // Register with socket if connected
    if (this.socket) {
      this.socket.on(event, handler as any);
    }
  }

  // Remove event handler
  off(event: WebSocketEvent, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);

      // Remove from socket if connected
      if (this.socket) {
        this.socket.off(event, handler as any);
      }
    }
  }

  // Send custom event
  emit(event: string, data: any): void {
    if (!this.socket?.connected) {
      console.warn('[WebSocket] Cannot emit: not connected');
      return;
    }

    this.socket.emit(event, data);
  }

  // Get connection status
  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  // Clean up and disconnect
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnected = false;
    this.eventHandlers.clear();

    if (this.config.debug) {
      console.log('[WebSocket] Disconnected and cleaned up');
    }
  }
}

// Singleton instance for global access
let wsInstance: WebSocketService | null = null;

export function getWebSocketService(config?: WebSocketConfig): WebSocketService {
  if (!wsInstance && config) {
    wsInstance = new WebSocketService(config);
  } else if (!wsInstance) {
    throw new Error('WebSocket service not initialized. Please provide config.');
  }

  return wsInstance;
}

export function disconnectWebSocket(): void {
  if (wsInstance) {
    wsInstance.disconnect();
    wsInstance = null;
  }
}