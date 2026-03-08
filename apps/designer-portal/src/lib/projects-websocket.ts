/**
 * Projects WebSocket Client
 *
 * Socket.io client for real-time project updates.
 * Connects to the projects service WebSocket namespace.
 */

import { io, Socket } from 'socket.io-client';
import { env } from './env';

// =============================================================================
// EVENT TYPES - Match backend event-bridge.service.ts
// =============================================================================

export type ProjectEventType =
  // Timeline Events
  | 'timeline:segment:updated'
  // Approval Events
  | 'approval:requested'
  | 'approval:approved'
  | 'approval:rejected'
  | 'approval:discussed'
  // Project Events
  | 'project:status:changed'
  | 'activity:logged'
  // Task Events
  | 'task:created'
  | 'task:status:changed'
  | 'task:completed'
  | 'task:comment:added'
  | 'task:mention'
  // RFI Events
  | 'rfi:created'
  | 'rfi:answered'
  | 'rfi:status:changed'
  | 'rfi:answered:notification'
  // Change Order Events
  | 'change_order:submitted'
  | 'change_order:approved'
  | 'change_order:rejected'
  // Issue Events
  | 'issue:created'
  | 'issue:resolved'
  | 'issue:status:changed'
  // Document Events
  | 'document:uploaded'
  | 'document:upload:progress'
  | 'document:version:created'
  // Milestone Events
  | 'milestone:completed'
  | 'milestone:status:changed'
  // Connection Events
  | 'connected'
  | 'pong';

// =============================================================================
// EVENT PAYLOADS
// =============================================================================

export interface ProjectStatusChangedPayload {
  projectId: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  timestamp: string;
}

export interface TaskEventPayload {
  projectId: string;
  taskId: string;
  title: string;
  status?: string;
  assigneeId?: string;
  changedBy: string;
  timestamp: string;
}

export interface ApprovalEventPayload {
  projectId: string;
  approvalId: string;
  title: string;
  approvalType: string;
  status: string;
  requestedBy: string;
  assignedTo: string;
  timestamp: string;
}

export interface MilestoneEventPayload {
  projectId: string;
  milestoneId: string;
  title: string;
  status: string;
  changedBy: string;
  timestamp: string;
}

export interface RFIEventPayload {
  projectId: string;
  rfiId: string;
  title: string;
  status: string;
  assignedTo?: string;
  timestamp: string;
}

export interface ChangeOrderEventPayload {
  projectId: string;
  changeOrderId: string;
  title: string;
  status: string;
  costImpact?: number;
  scheduleImpact?: number;
  timestamp: string;
}

export interface IssueEventPayload {
  projectId: string;
  issueId: string;
  title: string;
  severity: string;
  status: string;
  timestamp: string;
}

export interface DocumentEventPayload {
  projectId: string;
  documentId: string;
  title: string;
  category: string;
  uploadedBy: string;
  timestamp: string;
}

export interface PresenceInfo {
  userId: string;
  projectId: string;
  connectedAt: string;
  userAgent?: string;
}

export interface ConnectionQuality {
  status: 'excellent' | 'good' | 'fair' | 'poor';
  latencyMs: number;
}

// =============================================================================
// WEBSOCKET CLIENT
// =============================================================================

type EventHandler<T = unknown> = (data: T) => void;
type ConnectionStateHandler = (connected: boolean) => void;

class ProjectsWebSocketClient {
  private socket: Socket | null = null;
  private currentProjectId: string | null = null;
  private handlers = new Map<ProjectEventType, Set<EventHandler>>();
  private connectionStateHandlers = new Set<ConnectionStateHandler>();
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private pingInterval: NodeJS.Timeout | null = null;
  private lastPongAt: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = sessionStorage.getItem('access_token');
    }
  }

  /**
   * Connect to the projects WebSocket namespace
   */
  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    if (typeof window === 'undefined') {
      console.warn('Projects WebSocket: not in browser environment');
      return;
    }

    try {
      const wsUrl = this.buildWebSocketUrl();

      this.socket = io(wsUrl, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        auth: {
          token: this.token,
        },
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
      });

      this.setupEventListeners();
    } catch (error) {
      console.error('Failed to create Projects WebSocket connection:', error);
    }
  }

  /**
   * Disconnect from the WebSocket
   */
  disconnect(): void {
    this.stopPing();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentProjectId = null;
    this.notifyConnectionState(false);
  }

  /**
   * Subscribe to a specific project for real-time updates
   */
  subscribeToProject(projectId: string): void {
    if (!this.socket?.connected) {
      console.warn('Projects WebSocket not connected');
      return;
    }

    // Unsubscribe from previous project if any
    if (this.currentProjectId && this.currentProjectId !== projectId) {
      this.unsubscribeFromProject(this.currentProjectId);
    }

    this.socket.emit('subscribe:project', { projectId });
    this.currentProjectId = projectId;
  }

  /**
   * Unsubscribe from a project
   */
  unsubscribeFromProject(projectId: string): void {
    if (!this.socket?.connected) return;

    this.socket.emit('unsubscribe:project', { projectId });
    if (this.currentProjectId === projectId) {
      this.currentProjectId = null;
    }
  }

  /**
   * Get presence information for the current project
   */
  async getProjectPresence(): Promise<PresenceInfo[]> {
    return new Promise((resolve) => {
      if (!this.socket?.connected || !this.currentProjectId) {
        resolve([]);
        return;
      }

      this.socket.emit('presence:get', { projectId: this.currentProjectId }, (response: PresenceInfo[]) => {
        resolve(response);
      });
    });
  }

  /**
   * Register an event handler
   */
  on<T = unknown>(eventType: ProjectEventType, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as EventHandler);

    return () => {
      this.handlers.get(eventType)?.delete(handler as EventHandler);
    };
  }

  /**
   * Register a connection state handler
   */
  onConnectionStateChange(handler: ConnectionStateHandler): () => void {
    this.connectionStateHandlers.add(handler);
    return () => {
      this.connectionStateHandlers.delete(handler);
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Get connection quality metrics
   */
  getConnectionQuality(): ConnectionQuality | null {
    if (!this.isConnected() || this.lastPongAt === 0) {
      return null;
    }

    const latency = Date.now() - this.lastPongAt;
    let status: ConnectionQuality['status'];

    if (latency < 50) {
      status = 'excellent';
    } else if (latency < 100) {
      status = 'good';
    } else if (latency < 300) {
      status = 'fair';
    } else {
      status = 'poor';
    }

    return { status, latencyMs: latency };
  }

  /**
   * Update authentication token
   */
  updateToken(token: string | null): void {
    this.token = token;
    if (token && typeof window !== 'undefined') {
      sessionStorage.setItem('access_token', token);
    }

    // Reconnect with new token
    if (this.isConnected()) {
      this.disconnect();
      this.connect();
    }
  }

  // Private methods

  private buildWebSocketUrl(): string {
    // Connect to projects service WebSocket namespace
    const baseUrl = env.projectsWsUrl || `${env.apiUrl?.replace('http', 'ws')}/projects`;
    return baseUrl;
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Projects WebSocket connected');
      this.reconnectAttempts = 0;
      this.startPing();
      this.notifyConnectionState(true);

      // Re-subscribe to current project if any
      if (this.currentProjectId) {
        this.subscribeToProject(this.currentProjectId);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Projects WebSocket disconnected:', reason);
      this.stopPing();
      this.notifyConnectionState(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Projects WebSocket connection error:', error);
      this.reconnectAttempts++;
    });

    // Handle pong for latency measurement
    this.socket.on('pong', () => {
      this.lastPongAt = Date.now();
    });

    // Set up handlers for all project events
    const eventTypes: ProjectEventType[] = [
      'timeline:segment:updated',
      'approval:requested',
      'approval:approved',
      'approval:rejected',
      'approval:discussed',
      'project:status:changed',
      'activity:logged',
      'task:created',
      'task:status:changed',
      'task:completed',
      'task:comment:added',
      'task:mention',
      'rfi:created',
      'rfi:answered',
      'rfi:status:changed',
      'rfi:answered:notification',
      'change_order:submitted',
      'change_order:approved',
      'change_order:rejected',
      'issue:created',
      'issue:resolved',
      'issue:status:changed',
      'document:uploaded',
      'document:upload:progress',
      'document:version:created',
      'milestone:completed',
      'milestone:status:changed',
    ];

    eventTypes.forEach((eventType) => {
      this.socket!.on(eventType, (data: unknown) => {
        this.dispatchEvent(eventType, data);
      });
    });
  }

  private dispatchEvent(eventType: ProjectEventType, data: unknown): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in Projects WebSocket handler for ${eventType}:`, error);
        }
      });
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

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping');
      }
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

// Singleton instance
export const projectsWsClient = new ProjectsWebSocketClient();
