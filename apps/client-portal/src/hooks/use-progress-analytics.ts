'use client';

/**
 * Progress Analytics Hook
 * Provides project progress metrics, health indicators, and engagement tracking
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

// Types
export interface SegmentProgress {
  segmentId: string;
  title: string;
  phase: string;
  progress: number;
  status: string;
  daysElapsed: number;
  daysRemaining: number;
  onTrack: boolean;
  estimatedCompletionDate?: string;
}

export interface MilestoneMetrics {
  totalMilestones: number;
  completedMilestones: number;
  upcomingMilestones: number;
  overdueMilestones: number;
  onTimeCompletionRate: number;
  avgCompletionDays: number;
  nextMilestone?: {
    id: string;
    title: string;
    targetDate: string;
    daysUntil: number;
  };
}

export interface ApprovalMetrics {
  totalApprovals: number;
  pendingApprovals: number;
  approvedCount: number;
  rejectedCount: number;
  needsDiscussionCount: number;
  avgResponseTimeHours: number;
  approvalRate: number;
  pendingList: Array<{
    id: string;
    title: string;
    type: string;
    dueDate?: string;
    daysPending: number;
    priority: 'low' | 'normal' | 'high' | 'urgent';
  }>;
}

export interface EngagementMetrics {
  totalViews: number;
  uniqueSessions: number;
  avgViewDurationSeconds: number;
  popularSegments: Array<{
    segmentId: string;
    title: string;
    viewCount: number;
  }>;
  celebrationViews: number;
  mediaGalleryOpens: number;
  daysSinceLastVisit: number;
}

export interface ProjectProgressSummary {
  projectId: string;
  projectName: string;
  overallProgress: number;
  healthScore: number;
  status: 'on_track' | 'at_risk' | 'behind' | 'ahead';
  currentPhase: string;
  startDate: string;
  estimatedEndDate: string;
  daysElapsed: number;
  daysRemaining: number;
  segmentProgress: SegmentProgress[];
  milestoneMetrics: MilestoneMetrics;
  approvalMetrics: ApprovalMetrics;
  engagement: EngagementMetrics;
  lastUpdated: string;
}

export interface HealthIndicator {
  category: 'schedule' | 'approvals' | 'engagement' | 'milestones';
  score: number;
  status: 'good' | 'warning' | 'critical';
  message: string;
  recommendation?: string;
}

// API fetch functions
async function fetchProgressSummary(projectId: string): Promise<ProjectProgressSummary> {
  const res = await fetch(`/api/projects/${projectId}/timeline/analytics/summary`);
  if (!res.ok) throw new Error('Failed to fetch progress analytics');
  return res.json();
}

async function fetchHealthIndicators(projectId: string): Promise<HealthIndicator[]> {
  const res = await fetch(`/api/projects/${projectId}/timeline/analytics/health`);
  if (!res.ok) throw new Error('Failed to fetch health indicators');
  return res.json();
}

async function recordTimelineView(
  projectId: string,
  data: { sessionId: string; durationSeconds?: number }
): Promise<void> {
  await fetch(`/api/projects/${projectId}/timeline/analytics/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function recordMediaGalleryOpen(
  projectId: string,
  segmentId: string
): Promise<void> {
  await fetch(`/api/projects/${projectId}/timeline/segment/${segmentId}/media/opened`, {
    method: 'POST',
  });
}

// Generate unique session ID
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Hook for fetching project progress analytics
 */
export function useProgressAnalytics(projectId: string | undefined) {
  return useQuery({
    queryKey: ['progress-analytics', projectId],
    queryFn: () => fetchProgressSummary(projectId!),
    enabled: !!projectId,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}

/**
 * Hook for fetching health indicators
 */
export function useHealthIndicators(projectId: string | undefined) {
  return useQuery({
    queryKey: ['health-indicators', projectId],
    queryFn: () => fetchHealthIndicators(projectId!),
    enabled: !!projectId,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

/**
 * Hook for tracking timeline views with automatic session management
 */
export function useTimelineViewTracking(projectId: string | undefined) {
  const sessionIdRef = useRef<string>(generateSessionId());
  const startTimeRef = useRef<number>(Date.now());
  const isTracking = useRef(false);

  const mutation = useMutation({
    mutationFn: (data: { sessionId: string; durationSeconds?: number }) =>
      recordTimelineView(projectId!, data),
  });

  // Start tracking when component mounts
  const startTracking = useCallback(() => {
    if (!projectId || isTracking.current) return;
    isTracking.current = true;
    startTimeRef.current = Date.now();
    sessionIdRef.current = generateSessionId();
  }, [projectId]);

  // End tracking and record view
  const endTracking = useCallback(() => {
    if (!projectId || !isTracking.current) return;

    const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
    isTracking.current = false;

    // Only record if user spent at least 3 seconds
    if (durationSeconds >= 3) {
      mutation.mutate({
        sessionId: sessionIdRef.current,
        durationSeconds,
      });
    }
  }, [projectId, mutation]);

  // Auto-track on mount/unmount
  useEffect(() => {
    if (!projectId) return;

    startTracking();

    // Record view when page becomes hidden or closes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        endTracking();
      } else {
        startTracking();
      }
    };

    const handleBeforeUnload = () => {
      endTracking();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      endTracking();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [projectId, startTracking, endTracking]);

  return {
    startTracking,
    endTracking,
    sessionId: sessionIdRef.current,
  };
}

/**
 * Hook for tracking media gallery opens
 */
export function useMediaGalleryTracking(projectId: string | undefined) {
  const mutation = useMutation({
    mutationFn: (segmentId: string) => recordMediaGalleryOpen(projectId!, segmentId),
  });

  const trackGalleryOpen = useCallback(
    (segmentId: string) => {
      if (!projectId) return;
      mutation.mutate(segmentId);
    },
    [projectId, mutation]
  );

  return { trackGalleryOpen };
}

/**
 * Combined analytics hook for convenience
 */
export function useProjectAnalytics(projectId: string | undefined) {
  const progressQuery = useProgressAnalytics(projectId);
  const healthQuery = useHealthIndicators(projectId);
  const viewTracking = useTimelineViewTracking(projectId);
  const galleryTracking = useMediaGalleryTracking(projectId);
  const queryClient = useQueryClient();

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['progress-analytics', projectId] });
    queryClient.invalidateQueries({ queryKey: ['health-indicators', projectId] });
  }, [queryClient, projectId]);

  return {
    // Progress data
    progress: progressQuery.data,
    isLoadingProgress: progressQuery.isLoading,
    progressError: progressQuery.error,

    // Health indicators
    healthIndicators: healthQuery.data,
    isLoadingHealth: healthQuery.isLoading,
    healthError: healthQuery.error,

    // Tracking
    ...viewTracking,
    ...galleryTracking,

    // Utilities
    refetch,
    isLoading: progressQuery.isLoading || healthQuery.isLoading,
  };
}
