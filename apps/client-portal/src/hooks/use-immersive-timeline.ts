'use client';

/**
 * Hook for fetching and managing immersive timeline data
 * Provides real-time updates and celebration tracking
 */

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useWebSocket } from '@/lib/websocket';

// Types matching the backend ImmersiveTimelineDto
export interface TimelineMedia {
  id: string;
  url: string;
  type: 'image' | 'video' | '3d' | 'before_after';
  caption?: string;
  thumbnailUrl?: string;
  order?: number;
}

export interface SegmentNarrative {
  happening: string;
  completed: string[];
  nextSteps: string[];
  designerNotes?: string;
}

export interface ImmersiveSegment {
  id: string;
  title: string;
  description?: string;
  phase: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'delayed' | 'cancelled';
  progress: number;
  startDate: string;
  endDate: string;
  order: number;
  media?: TimelineMedia[];
  narrative?: SegmentNarrative;
  pendingApprovalsCount: number;
  activitiesCount: number;
  milestone?: {
    id: string;
    title: string;
    status: string;
    targetDate: string;
    completedAt?: string;
  };
  primaryApproval?: {
    id: string;
    title: string;
    status: string;
    dueDate?: string;
    approvalType: string;
  };
}

export interface TimelineProgress {
  overall: number;
  timeElapsed: number;
  milestones: {
    completed: number;
    total: number;
    percentage: number;
  };
  approvals: {
    approved: number;
    pending: number;
    total: number;
    percentage: number;
  };
}

export interface ImmersiveTimeline {
  projectId: string;
  projectTitle: string;
  projectStatus: string;
  progress: TimelineProgress;
  segments: ImmersiveSegment[];
  activeSegmentId?: string;
  nextMilestone?: {
    id: string;
    title: string;
    targetDate: string;
    daysUntil: number;
  };
  attentionRequired?: {
    pendingApprovals: number;
    overdueItems: number;
    unreadMessages: number;
  };
}

export interface MilestoneCelebration {
  id: string;
  title: string;
  description: string;
  completedAt: string;
  completedBy: string;
  celebrationMedia?: TimelineMedia[];
  designerMessage?: string;
  achievementType?: 'first_milestone' | 'halfway' | 'major_decision' | 'final_delivery' | 'on_time';
  milestoneNumber: number;
  totalMilestones: number;
}

// Fetch immersive timeline data
async function fetchImmersiveTimeline(projectId: string): Promise<ImmersiveTimeline> {
  const response = await fetch(`/api/projects/${projectId}/timeline/immersive`);
  if (!response.ok) {
    throw new Error('Failed to fetch timeline');
  }
  return response.json();
}

// Fetch recent celebrations
async function fetchCelebrations(projectId: string, limit = 5): Promise<MilestoneCelebration[]> {
  const response = await fetch(`/api/projects/${projectId}/timeline/celebrations?limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch celebrations');
  }
  return response.json();
}

// Fetch specific celebration
async function fetchCelebration(projectId: string, milestoneId: string): Promise<MilestoneCelebration> {
  const response = await fetch(`/api/projects/${projectId}/timeline/celebrations/${milestoneId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch celebration');
  }
  return response.json();
}

// Record celebration viewed
async function recordCelebrationViewed(projectId: string, milestoneId: string): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}/timeline/celebrations/${milestoneId}/viewed`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to record view');
  }
}

// Fetch segment media gallery
async function fetchSegmentMedia(projectId: string, segmentId: string) {
  const response = await fetch(`/api/projects/${projectId}/timeline/segment/${segmentId}/media`);
  if (!response.ok) {
    throw new Error('Failed to fetch media');
  }
  return response.json();
}

/**
 * Main hook for immersive timeline
 */
export function useImmersiveTimeline(projectId: string | null) {
  const queryClient = useQueryClient();
  const { onMilestoneUpdate, onMilestoneCompleted, onActivityUpdate } = useWebSocket();
  const [showCelebration, setShowCelebration] = useState<MilestoneCelebration | null>(null);

  // Main timeline query
  const timelineQuery = useQuery({
    queryKey: ['immersive-timeline', projectId],
    queryFn: () => fetchImmersiveTimeline(projectId!),
    enabled: !!projectId,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  // Subscribe to WebSocket updates
  useEffect(() => {
    if (!projectId) return;

    const unsubscribeMilestone = onMilestoneUpdate(() => {
      queryClient.invalidateQueries({ queryKey: ['immersive-timeline', projectId] });
    });

    const unsubscribeCompletion = onMilestoneCompleted(async (data: any) => {
      // Refresh timeline
      queryClient.invalidateQueries({ queryKey: ['immersive-timeline', projectId] });
      queryClient.invalidateQueries({ queryKey: ['celebrations', projectId] });

      // Show celebration if milestone was just completed
      if (data.milestoneId) {
        try {
          const celebration = await fetchCelebration(projectId, data.milestoneId);
          setShowCelebration(celebration);
        } catch (error) {
          console.error('Failed to fetch celebration:', error);
        }
      }
    });

    const unsubscribeActivity = onActivityUpdate(() => {
      queryClient.invalidateQueries({ queryKey: ['immersive-timeline', projectId] });
    });

    return () => {
      unsubscribeMilestone();
      unsubscribeCompletion();
      unsubscribeActivity();
    };
  }, [projectId, queryClient, onMilestoneUpdate, onMilestoneCompleted, onActivityUpdate]);

  const dismissCelebration = useCallback(() => {
    setShowCelebration(null);
  }, []);

  return {
    timeline: timelineQuery.data,
    isLoading: timelineQuery.isLoading,
    isError: timelineQuery.isError,
    error: timelineQuery.error,
    refetch: timelineQuery.refetch,
    showCelebration,
    dismissCelebration,
  };
}

/**
 * Hook for celebrations list
 */
export function useCelebrations(projectId: string | null, limit = 5) {
  return useQuery({
    queryKey: ['celebrations', projectId, limit],
    queryFn: () => fetchCelebrations(projectId!, limit),
    enabled: !!projectId,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook for recording celebration view
 */
export function useRecordCelebrationView(projectId: string) {
  return useMutation({
    mutationFn: (milestoneId: string) => recordCelebrationViewed(projectId, milestoneId),
  });
}

/**
 * Hook for segment media gallery
 */
export function useSegmentMedia(projectId: string | null, segmentId: string | null) {
  return useQuery({
    queryKey: ['segment-media', projectId, segmentId],
    queryFn: () => fetchSegmentMedia(projectId!, segmentId!),
    enabled: !!projectId && !!segmentId,
    staleTime: 300000, // 5 minutes
  });
}
