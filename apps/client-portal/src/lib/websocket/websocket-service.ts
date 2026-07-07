import { createBrowserClient } from '@patina/supabase';
import type { ApprovalStatus } from '@patina/types';

// Event types for type-safe realtime communication.
// Server → client events match the projects service EventBridge broadcasts;
// they arrive over a Supabase Realtime private channel (`project:<id>`) instead
// of Socket.io, but the event names and payloads are unchanged.
export enum WebSocketEvent {
  // Client -> Server events (retained for API compatibility; now no-ops —
  // subscription is handled by the Supabase channel, not per-message emits)
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

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>;
type ProjectChannel = ReturnType<SupabaseBrowserClient['channel']>;

interface PresenceMeta {
  userId: string;
  userName?: string;
  projectId?: string;
}

/**
 * Realtime service for the client portal project view.
 *
 * Backed by Supabase Realtime broadcast channels (private `project:<id>`).
 * The public API — `connect`, `subscribeToProject`, `on`/`off`, presence, and
 * the milestone room helpers — is unchanged from the former Socket.io
 * implementation, so `websocket-context.tsx` and its consumers are untouched.
 * Server-originated events arrive as broadcasts; peer presence uses Supabase
 * Realtime Presence and is surfaced as synthetic `team:presence` events.
 */
export class WebSocketService {
  private supabase: SupabaseBrowserClient | null = null;
  private channel: ProjectChannel | null = null;
  private config: WebSocketConfig;
  private eventHandlers: Map<string, Set<Function>> = new Map();
  private isConnected: boolean = false;
  private currentProjectId: string | null = null;

  constructor(config: WebSocketConfig) {
    this.config = {
      reconnectAttempts: 10,
      reconnectDelay: 1000,
      debug: false,
      ...config,
    };
  }

  // Initialize the realtime connection and subscribe to the configured project.
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.supabase) {
          this.supabase = createBrowserClient();
        }
        // Authorize the Realtime connection so private-channel RLS can run.
        if (this.config.authToken) {
          this.supabase.realtime.setAuth(this.config.authToken);
        }

        if (!this.config.projectId) {
          // No project yet — connection is established lazily on subscribe.
          resolve();
          return;
        }

        this.subscribeToProject(this.config.projectId, resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Subscribe to realtime updates for a project.
  subscribeToProject(
    projectId: string,
    onSubscribed?: () => void,
    onError?: (err: unknown) => void,
  ): void {
    if (!this.supabase) {
      this.supabase = createBrowserClient();
      if (this.config.authToken) {
        this.supabase.realtime.setAuth(this.config.authToken);
      }
    }

    // Swap channels if the project changed.
    if (this.channel && this.currentProjectId !== projectId) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    if (this.channel) {
      onSubscribed?.();
      return;
    }

    this.currentProjectId = projectId;
    const channel = this.supabase.channel(`project:${projectId}`, {
      config: {
        private: true,
        presence: { key: this.config.userId ?? 'anonymous' },
        broadcast: { self: false },
      },
    });

    // Every server broadcast → dispatch to registered handlers by event name.
    channel.on('broadcast', { event: '*' }, (message: any) => {
      this.dispatch(message.event, message.payload);
    });

    // Peer presence → synthetic `team:presence` events (WebSocketPresenceUpdate).
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, PresenceMeta[]>;
      for (const metas of Object.values(state)) {
        const meta = metas[0];
        if (meta) this.emitPresence(meta, 'viewing');
      }
    });
    channel.on('presence', { event: 'join' }, ({ newPresences }: any) => {
      for (const meta of newPresences ?? []) this.emitPresence(meta, 'viewing');
    });
    channel.on('presence', { event: 'leave' }, ({ leftPresences }: any) => {
      for (const meta of leftPresences ?? []) this.emitPresence(meta, 'offline');
    });

    channel.subscribe((status: string, err?: Error) => {
      if (status === 'SUBSCRIBED') {
        this.isConnected = true;
        this.dispatch(WebSocketEvent.CONNECT, undefined);
        if (this.config.userId) {
          channel.track({
            userId: this.config.userId,
            projectId,
          } satisfies PresenceMeta);
        }
        if (this.config.debug) console.log(`[Realtime] Subscribed to project:${projectId}`);
        onSubscribed?.();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.isConnected = false;
        this.dispatch(WebSocketEvent.ERROR, err ?? new Error(status));
        if (this.config.debug) console.error(`[Realtime] ${status}`, err);
        onError?.(err ?? new Error(status));
      } else if (status === 'CLOSED') {
        this.isConnected = false;
        this.dispatch(WebSocketEvent.DISCONNECT, status);
      }
    });

    this.channel = channel;
  }

  // Unsubscribe from a project's realtime updates.
  unsubscribeFromProject(projectId: string): void {
    if (this.channel && this.currentProjectId === projectId) {
      this.supabase?.removeChannel(this.channel);
      this.channel = null;
      this.currentProjectId = null;
      this.isConnected = false;
    }
  }

  // Milestone rooms no longer exist server-side (milestone updates arrive on the
  // project channel). Retained as no-ops for API compatibility.
  joinMilestone(_milestoneId: string): void {}
  leaveMilestone(_milestoneId: string): void {}

  // Register an event handler.
  on(event: WebSocketEvent, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)?.add(handler);
  }

  // Remove an event handler.
  off(event: WebSocketEvent, handler: Function): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  // Emit a client-originated broadcast on the current channel (rarely used).
  emit(event: string, data: any): void {
    if (!this.channel) {
      console.warn('[Realtime] Cannot emit: no active channel');
      return;
    }
    this.channel.send({ type: 'broadcast', event, payload: data });
  }

  // Dispatch an event to all registered handlers.
  private dispatch(event: string, payload: any): void {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[Realtime] Handler for ${event} threw:`, error);
      }
    }
  }

  private emitPresence(meta: PresenceMeta, status: 'viewing' | 'offline'): void {
    if (!meta?.userId) return;
    const update: WebSocketPresenceUpdate = {
      projectId: meta.projectId ?? this.currentProjectId ?? '',
      userId: meta.userId,
      userName: meta.userName ?? meta.userId,
      status,
      lastSeen: new Date().toISOString(),
    };
    this.dispatch(WebSocketEvent.TEAM_MEMBER_PRESENCE, update);
  }

  // Get connection status.
  isSocketConnected(): boolean {
    return this.isConnected;
  }

  // Clean up and disconnect.
  disconnect(): void {
    if (this.channel && this.supabase) {
      this.supabase.removeChannel(this.channel);
    }
    this.channel = null;
    this.currentProjectId = null;
    this.isConnected = false;
    this.eventHandlers.clear();

    if (this.config.debug) {
      console.log('[Realtime] Disconnected and cleaned up');
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
