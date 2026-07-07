'use client';

/**
 * React hooks for real-time project updates via WebSocket
 *
 * These hooks provide real-time project data synchronization by:
 * 1. Subscribing to project-specific WebSocket events
 * 2. Automatically invalidating React Query caches on updates
 * 3. Providing type-safe event handlers
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  projectsWsClient,
  type ProjectEventType,
  type ProjectStatusChangedPayload,
  type TaskEventPayload,
  type ApprovalEventPayload,
  type MilestoneEventPayload,
  type RFIEventPayload,
  type ChangeOrderEventPayload,
  type IssueEventPayload,
  type DocumentEventPayload,
  type PresenceInfo,
  type ConnectionQuality,
} from '@/lib/projects-websocket';
import { queryKeys } from '@/lib/react-query';

// =============================================================================
// CONNECTION HOOKS
// =============================================================================

/**
 * Hook to manage WebSocket connection lifecycle
 */
export function useProjectsWebSocket() {
  const [isConnected, setIsConnected] = useState(projectsWsClient.isConnected());
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality | null>(null);

  useEffect(() => {
    // Connect on mount
    projectsWsClient.connect();

    const unsubscribe = projectsWsClient.onConnectionStateChange((connected) => {
      setIsConnected(connected);
      if (connected) {
        setConnectionQuality(projectsWsClient.getConnectionQuality());
      } else {
        setConnectionQuality(null);
      }
    });

    // Update quality periodically
    const qualityInterval = setInterval(() => {
      if (projectsWsClient.isConnected()) {
        setConnectionQuality(projectsWsClient.getConnectionQuality());
      }
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(qualityInterval);
    };
  }, []);

  const connect = useCallback(() => {
    projectsWsClient.connect();
  }, []);

  const disconnect = useCallback(() => {
    projectsWsClient.disconnect();
  }, []);

  return { isConnected, connectionQuality, connect, disconnect };
}

// =============================================================================
// PROJECT SUBSCRIPTION HOOK
// =============================================================================

/**
 * Main hook to subscribe to real-time project updates
 *
 * @param projectId - The project ID to subscribe to
 * @param options - Configuration options
 */
export function useProjectSubscription(
  projectId: string | null,
  options: {
    /** Enable auto-invalidation of React Query caches */
    autoInvalidate?: boolean;
    /** Custom event handlers */
    onTaskUpdate?: (payload: TaskEventPayload) => void;
    onApprovalUpdate?: (payload: ApprovalEventPayload) => void;
    onMilestoneUpdate?: (payload: MilestoneEventPayload) => void;
    onRFIUpdate?: (payload: RFIEventPayload) => void;
    onChangeOrderUpdate?: (payload: ChangeOrderEventPayload) => void;
    onIssueUpdate?: (payload: IssueEventPayload) => void;
    onDocumentUpdate?: (payload: DocumentEventPayload) => void;
    onProjectStatusChange?: (payload: ProjectStatusChangedPayload) => void;
  } = {}
) {
  const {
    autoInvalidate = true,
    onTaskUpdate,
    onApprovalUpdate,
    onMilestoneUpdate,
    onRFIUpdate,
    onChangeOrderUpdate,
    onIssueUpdate,
    onDocumentUpdate,
    onProjectStatusChange,
  } = options;

  const queryClient = useQueryClient();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [presence, setPresence] = useState<PresenceInfo[]>([]);
  const handlersRef = useRef(options);

  // Update handlers ref
  useEffect(() => {
    handlersRef.current = options;
  }, [options]);

  // Subscribe/unsubscribe to project
  useEffect(() => {
    if (!projectId) {
      setIsSubscribed(false);
      return;
    }

    projectsWsClient.subscribeToProject(projectId);
    setIsSubscribed(true);

    // Fetch initial presence
    projectsWsClient.getProjectPresence().then(setPresence);

    return () => {
      projectsWsClient.unsubscribeFromProject(projectId);
      setIsSubscribed(false);
    };
  }, [projectId]);

  // Set up event handlers
  useEffect(() => {
    if (!projectId) return;

    const unsubscribers: (() => void)[] = [];

    // Task events
    const taskHandler = (payload: TaskEventPayload) => {
      if (payload.projectId !== projectId) return;

      if (autoInvalidate) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
        queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      }
      handlersRef.current.onTaskUpdate?.(payload);
    };

    unsubscribers.push(
      projectsWsClient.on('task:created', taskHandler),
      projectsWsClient.on('task:status:changed', taskHandler),
      projectsWsClient.on('task:completed', taskHandler),
      projectsWsClient.on('task:comment:added', taskHandler)
    );

    // Approval events
    const approvalHandler = (payload: ApprovalEventPayload) => {
      if (payload.projectId !== projectId) return;

      if (autoInvalidate) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
        queryClient.invalidateQueries({ queryKey: ['approvals', projectId] });
      }
      handlersRef.current.onApprovalUpdate?.(payload);
    };

    unsubscribers.push(
      projectsWsClient.on('approval:requested', approvalHandler),
      projectsWsClient.on('approval:approved', approvalHandler),
      projectsWsClient.on('approval:rejected', approvalHandler),
      projectsWsClient.on('approval:discussed', approvalHandler)
    );

    // Milestone events
    const milestoneHandler = (payload: MilestoneEventPayload) => {
      if (payload.projectId !== projectId) return;

      if (autoInvalidate) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
        queryClient.invalidateQueries({ queryKey: ['milestones', projectId] });
      }
      handlersRef.current.onMilestoneUpdate?.(payload);
    };

    unsubscribers.push(
      projectsWsClient.on('milestone:completed', milestoneHandler),
      projectsWsClient.on('milestone:status:changed', milestoneHandler)
    );

    // RFI events
    const rfiHandler = (payload: RFIEventPayload) => {
      if (payload.projectId !== projectId) return;

      if (autoInvalidate) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
        queryClient.invalidateQueries({ queryKey: ['rfis', projectId] });
      }
      handlersRef.current.onRFIUpdate?.(payload);
    };

    unsubscribers.push(
      projectsWsClient.on('rfi:created', rfiHandler),
      projectsWsClient.on('rfi:answered', rfiHandler),
      projectsWsClient.on('rfi:status:changed', rfiHandler)
    );

    // Change Order events
    const changeOrderHandler = (payload: ChangeOrderEventPayload) => {
      if (payload.projectId !== projectId) return;

      if (autoInvalidate) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
        queryClient.invalidateQueries({ queryKey: ['changeOrders', projectId] });
      }
      handlersRef.current.onChangeOrderUpdate?.(payload);
    };

    unsubscribers.push(
      projectsWsClient.on('change_order:submitted', changeOrderHandler),
      projectsWsClient.on('change_order:approved', changeOrderHandler),
      projectsWsClient.on('change_order:rejected', changeOrderHandler)
    );

    // Issue events
    const issueHandler = (payload: IssueEventPayload) => {
      if (payload.projectId !== projectId) return;

      if (autoInvalidate) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
        queryClient.invalidateQueries({ queryKey: ['issues', projectId] });
      }
      handlersRef.current.onIssueUpdate?.(payload);
    };

    unsubscribers.push(
      projectsWsClient.on('issue:created', issueHandler),
      projectsWsClient.on('issue:resolved', issueHandler),
      projectsWsClient.on('issue:status:changed', issueHandler)
    );

    // Document events
    const documentHandler = (payload: DocumentEventPayload) => {
      if (payload.projectId !== projectId) return;

      if (autoInvalidate) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
        queryClient.invalidateQueries({ queryKey: ['documents', projectId] });
      }
      handlersRef.current.onDocumentUpdate?.(payload);
    };

    unsubscribers.push(
      projectsWsClient.on('document:uploaded', documentHandler),
      projectsWsClient.on('document:version:created', documentHandler)
    );

    // Project status events
    const projectStatusHandler = (payload: ProjectStatusChangedPayload) => {
      if (payload.projectId !== projectId) return;

      if (autoInvalidate) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      }
      handlersRef.current.onProjectStatusChange?.(payload);
    };

    unsubscribers.push(projectsWsClient.on('project:status:changed', projectStatusHandler));

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [projectId, autoInvalidate, queryClient]);

  // Refresh presence periodically
  useEffect(() => {
    if (!projectId || !isSubscribed) return;

    const interval = setInterval(() => {
      projectsWsClient.getProjectPresence().then(setPresence);
    }, 30000);

    return () => clearInterval(interval);
  }, [projectId, isSubscribed]);

  return {
    isSubscribed,
    presence,
    refreshPresence: useCallback(async () => {
      const newPresence = await projectsWsClient.getProjectPresence();
      setPresence(newPresence);
      return newPresence;
    }, []),
  };
}

// =============================================================================
// SPECIFIC EVENT HOOKS
// =============================================================================

/**
 * Hook for listening to a specific project event type
 */
export function useProjectEvent<T = unknown>(
  eventType: ProjectEventType,
  handler: (data: T) => void,
  enabled = true
) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;

    return projectsWsClient.on(eventType, (data) => {
      handlerRef.current(data as T);
    });
  }, [eventType, enabled]);
}

/**
 * Hook for real-time task updates
 */
export function useRealtimeTasks(projectId: string | null) {
  const queryClient = useQueryClient();
  const [lastUpdate, setLastUpdate] = useState<TaskEventPayload | null>(null);

  useProjectEvent<TaskEventPayload>(
    'task:status:changed',
    useCallback(
      (payload) => {
        if (!projectId || payload.projectId !== projectId) return;
        setLastUpdate(payload);
        queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      },
      [projectId, queryClient]
    ),
    !!projectId
  );

  return { lastUpdate };
}

/**
 * Hook for real-time approval updates with notification support
 */
export function useRealtimeApprovals(projectId: string | null) {
  const queryClient = useQueryClient();
  const [pendingCount, setPendingCount] = useState(0);
  const [lastApprovalEvent, setLastApprovalEvent] = useState<ApprovalEventPayload | null>(null);

  const handleApproval = useCallback(
    (payload: ApprovalEventPayload) => {
      if (!projectId || payload.projectId !== projectId) return;
      setLastApprovalEvent(payload);
      queryClient.invalidateQueries({ queryKey: ['approvals', projectId] });

      // Update pending count based on event type
      if (payload.status === 'pending') {
        setPendingCount((prev) => prev + 1);
      } else if (payload.status === 'approved' || payload.status === 'rejected') {
        setPendingCount((prev) => Math.max(0, prev - 1));
      }
    },
    [projectId, queryClient]
  );

  useProjectEvent('approval:requested', handleApproval, !!projectId);
  useProjectEvent('approval:approved', handleApproval, !!projectId);
  useProjectEvent('approval:rejected', handleApproval, !!projectId);

  return { lastApprovalEvent, pendingCount };
}

/**
 * Hook for real-time milestone updates
 */
export function useRealtimeMilestones(projectId: string | null) {
  const queryClient = useQueryClient();
  const [completedMilestones, setCompletedMilestones] = useState<string[]>([]);

  useProjectEvent<MilestoneEventPayload>(
    'milestone:completed',
    useCallback(
      (payload) => {
        if (!projectId || payload.projectId !== projectId) return;
        setCompletedMilestones((prev) =>
          prev.includes(payload.milestoneId) ? prev : [...prev, payload.milestoneId]
        );
        queryClient.invalidateQueries({ queryKey: ['milestones', projectId] });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      },
      [projectId, queryClient]
    ),
    !!projectId
  );

  return { completedMilestones };
}

/**
 * Hook for @mention notifications
 */
export function useTaskMentions(userId: string | null) {
  const [mentions, setMentions] = useState<TaskEventPayload[]>([]);

  useProjectEvent<TaskEventPayload & { mentionedUsers: string[] }>(
    'task:mention',
    useCallback(
      (payload) => {
        if (!userId || !payload.mentionedUsers?.includes(userId)) return;
        setMentions((prev) => [payload, ...prev].slice(0, 20)); // Keep last 20
      },
      [userId]
    ),
    !!userId
  );

  const clearMentions = useCallback(() => {
    setMentions([]);
  }, []);

  const dismissMention = useCallback((taskId: string) => {
    setMentions((prev) => prev.filter((m) => m.taskId !== taskId));
  }, []);

  return { mentions, clearMentions, dismissMention };
}

/**
 * Hook for document upload progress
 */
export function useDocumentUploadProgress(projectId: string | null) {
  const [uploads, setUploads] = useState<
    Map<string, { documentId: string; progress: number; title: string }>
  >(new Map());

  useProjectEvent<{ documentId: string; progress: number; title: string; projectId: string }>(
    'document:upload:progress',
    useCallback(
      (payload) => {
        if (!projectId || payload.projectId !== projectId) return;

        setUploads((prev) => {
          const next = new Map(prev);
          if (payload.progress >= 100) {
            next.delete(payload.documentId);
          } else {
            next.set(payload.documentId, {
              documentId: payload.documentId,
              progress: payload.progress,
              title: payload.title,
            });
          }
          return next;
        });
      },
      [projectId]
    ),
    !!projectId
  );

  return { uploads: Array.from(uploads.values()) };
}
