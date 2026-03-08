/**
 * Test factories for Timeline-related data
 * Use these to create consistent mock data for tests
 */

import type { MilestoneCelebration } from '@/hooks/use-immersive-timeline';

// Counter for generating unique IDs
let idCounter = 0;
const generateId = (prefix: string) => `${prefix}-${++idCounter}`;

// Reset counter between test suites
export const resetIdCounter = () => {
  idCounter = 0;
};

/**
 * Timeline segment progress status
 */
export type SegmentStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed';

/**
 * Timeline segment factory
 */
export interface TimelineSegment {
  id: string;
  title: string;
  description?: string;
  phase: string;
  status: SegmentStatus;
  progress: number;
  startDate: string;
  endDate: string;
  order: number;
  media?: Array<{
    id: string;
    url: string;
    type: 'image' | 'video';
    caption?: string;
    thumbnailUrl?: string;
  }>;
  pendingApprovalsCount: number;
  activitiesCount: number;
}

export const createTimelineSegment = (
  overrides: Partial<TimelineSegment> = {}
): TimelineSegment => ({
  id: generateId('segment'),
  title: 'Design Phase',
  description: 'Initial design and concept development',
  phase: 'design',
  status: 'in_progress',
  progress: 50,
  startDate: '2024-01-01',
  endDate: '2024-03-31',
  order: 1,
  media: [],
  pendingApprovalsCount: 0,
  activitiesCount: 5,
  ...overrides,
});

/**
 * Timeline progress factory
 */
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

export const createTimelineProgress = (
  overrides: Partial<TimelineProgress> = {}
): TimelineProgress => ({
  overall: 65,
  timeElapsed: 45,
  milestones: {
    completed: 3,
    total: 5,
    percentage: 60,
    ...overrides.milestones,
  },
  approvals: {
    approved: 8,
    pending: 2,
    total: 10,
    percentage: 80,
    ...overrides.approvals,
  },
  ...overrides,
});

/**
 * Attention required items factory
 */
export interface AttentionRequired {
  pendingApprovals: number;
  overdueItems: number;
  unreadMessages: number;
}

export const createAttentionRequired = (
  overrides: Partial<AttentionRequired> = {}
): AttentionRequired => ({
  pendingApprovals: 2,
  overdueItems: 0,
  unreadMessages: 3,
  ...overrides,
});

/**
 * Next milestone factory
 */
export interface NextMilestone {
  id: string;
  title: string;
  targetDate: string;
  daysUntil: number;
}

export const createNextMilestone = (
  overrides: Partial<NextMilestone> = {}
): NextMilestone => ({
  id: generateId('milestone'),
  title: 'First Prototype Review',
  targetDate: '2024-03-15',
  daysUntil: 15,
  ...overrides,
});

/**
 * Full immersive timeline factory
 */
export interface ImmersiveTimeline {
  projectId: string;
  projectTitle: string;
  projectStatus: string;
  progress: TimelineProgress;
  segments: TimelineSegment[];
  activeSegmentId: string | null;
  nextMilestone: NextMilestone | null;
  attentionRequired: AttentionRequired;
}

export const createImmersiveTimeline = (
  overrides: Partial<ImmersiveTimeline> = {}
): ImmersiveTimeline => {
  const segment1 = createTimelineSegment({
    id: 'segment-1',
    title: 'Design Phase',
    status: 'completed',
    progress: 100,
    order: 1,
  });

  const segment2 = createTimelineSegment({
    id: 'segment-2',
    title: 'Manufacturing',
    phase: 'production',
    status: 'in_progress',
    progress: 50,
    pendingApprovalsCount: 2,
    order: 2,
  });

  return {
    projectId: overrides.projectId || generateId('project'),
    projectTitle: 'Modern Living Room',
    projectStatus: 'active',
    progress: createTimelineProgress(overrides.progress),
    segments: overrides.segments || [segment1, segment2],
    activeSegmentId: 'segment-2',
    nextMilestone: createNextMilestone(overrides.nextMilestone || {}),
    attentionRequired: createAttentionRequired(overrides.attentionRequired || {}),
    ...overrides,
  };
};

/**
 * Milestone celebration factory
 */
export type AchievementType =
  | 'first_milestone'
  | 'halfway'
  | 'major_decision'
  | 'final_delivery'
  | 'on_time';

export const createMilestoneCelebration = (
  overrides: Partial<MilestoneCelebration> = {}
): MilestoneCelebration => ({
  id: generateId('milestone'),
  title: 'Design Phase Complete',
  description: 'All design concepts have been approved',
  completedAt: new Date().toISOString(),
  completedBy: 'Designer Sarah',
  designerMessage: 'Congratulations on reaching this milestone!',
  achievementType: 'first_milestone' as AchievementType,
  milestoneNumber: 1,
  totalMilestones: 5,
  celebrationMedia: [
    {
      id: generateId('media'),
      url: '/celebration.jpg',
      type: 'image',
      caption: 'Final design render',
    },
  ],
  ...overrides,
});

/**
 * Segment media factory
 */
export interface SegmentMedia {
  segmentId: string;
  media: Array<{
    id: string;
    url: string;
    type: 'image' | 'video';
    caption?: string;
  }>;
}

export const createSegmentMedia = (
  segmentId: string,
  count = 3
): SegmentMedia => ({
  segmentId,
  media: Array.from({ length: count }, (_, i) => ({
    id: generateId('media'),
    url: `/media/image-${i + 1}.jpg`,
    type: 'image' as const,
    caption: `Image ${i + 1}`,
  })),
});

/**
 * Helper to create multiple segments with different statuses
 */
export const createTimelineWithPhases = (phases: string[]): TimelineSegment[] =>
  phases.map((phase, index) => {
    const status: SegmentStatus =
      index === 0
        ? 'completed'
        : index === 1
          ? 'in_progress'
          : 'not_started';
    const progress = status === 'completed' ? 100 : status === 'in_progress' ? 50 : 0;

    return createTimelineSegment({
      id: `segment-${index + 1}`,
      title: phase,
      phase: phase.toLowerCase().replace(/\s/g, '_'),
      status,
      progress,
      order: index + 1,
    });
  });
