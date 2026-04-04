import 'server-only';

import { cache } from 'react';

import { serverProjectsApi } from '../api-client-server';
import { env } from '../env';
import type {
  ClientProjectView,
  DocumentAttachment,
  MilestoneApproval,
  MilestoneDetail,
  MilestoneStatus,
  ProjectListItem,
  TimelineMessage,
} from '../../types/project';

const generateId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `id-${Math.random().toString(36).slice(2, 10)}`;
};

const asArray = <T>(value: unknown, fallback: T[] = []): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }

  return fallback;
};

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asString = (value: unknown, fallback = ''): string => {
  return typeof value === 'string' ? value : fallback;
};

const normaliseStatus = (value: unknown): MilestoneStatus => {
  switch (typeof value === 'string' ? value.toLowerCase() : '') {
    case 'completed':
      return 'completed';
    case 'active':
    case 'in_progress':
    case 'in-progress':
      return 'in_progress';
    case 'attention':
    case 'attention_needed':
    case 'requires_action':
      return 'attention';
    case 'blocked':
      return 'blocked';
    default:
      return 'upcoming';
  }
};

const mapDocument = (input: any): DocumentAttachment => ({
  id: asString(input?.id, generateId()),
  title: asString(input?.title || input?.name, 'Untitled Document'),
  description: asString(input?.description),
  type: asString(input?.type || input?.mimeType),
  url: asString(input?.url || input?.downloadUrl),
  thumbnailUrl: asString(input?.thumbnailUrl || input?.previewUrl),
  uploadedAt: asString(input?.uploadedAt || input?.createdAt),
  uploadedBy: asString(input?.uploadedBy || input?.ownerName),
});

const mapMessage = (input: any): TimelineMessage => ({
  id: asString(input?.id, generateId()),
  authorId: asString(input?.authorId || input?.senderId, 'unknown'),
  authorName: asString(input?.authorName || input?.senderName || 'Team'),
  authorRole: asString(input?.authorRole || input?.senderRole),
  body: asString(input?.body || input?.content || ''),
  createdAt: asString(input?.createdAt || input?.timestamp || new Date().toISOString()),
  attachments: asArray(input?.attachments).map(mapDocument),
  isSystem: Boolean(input?.isSystem || input?.system),
});

const mapApproval = (input: any): MilestoneApproval => ({
  id: asString(input?.id, generateId()),
  status: ((): MilestoneApproval['status'] => {
    const status = typeof input?.status === 'string' ? input.status.toLowerCase() : 'pending';
    if (status === 'approved') return 'approved';
    if (status === 'rejected') return 'rejected';
    if (status === 'changes_requested' || status === 'changes-requested') return 'needs_discussion';
    return 'pending';
  })(),
  summary: asString(input?.summary || input?.title),
  requestedAt: asString(input?.requestedAt || input?.createdAt),
  decidedAt: asString(input?.decidedAt || input?.completedAt),
  dueDate: asString(input?.dueDate || input?.deadline),
  requiresClientAction: Boolean(
    input?.requiresClientAction || input?.needsAction || input?.status === 'pending'
  ),
  totalValue: typeof input?.totalValue === 'number' ? input.totalValue : undefined,
  currency: asString(input?.currency || input?.currencyCode),
});

const mapMilestone = (input: any, index: number): MilestoneDetail => ({
  id: asString(input?.id, generateId()),
  index,
  title: asString(input?.title || input?.name || `Milestone ${index + 1}`),
  phase: asString(input?.phase || input?.category),
  description: asString(input?.description || input?.summary),
  status: normaliseStatus(input?.status),
  startDate: asString(input?.startDate),
  targetDate: asString(input?.targetDate || input?.dueDate),
  completionDate: asString(input?.completionDate || input?.completedAt),
  progressPercentage: Math.min(Math.max(asNumber(input?.progressPercentage, 0), 0), 100),
  checklist: asArray(input?.checklist || input?.tasks).map((task: any) => ({
    id: asString(task?.id, generateId()),
    label: asString(task?.label || task?.title || 'Task'),
    completed: Boolean(task?.completed || task?.isDone),
    completedAt: asString(task?.completedAt || task?.doneAt),
  })),
  documents: asArray(input?.documents || input?.attachments).map(mapDocument),
  messages: asArray(input?.messages || input?.comments).map(mapMessage),
  approval: input?.approval || input?.requiresApproval ? mapApproval(input?.approval ?? input) : undefined,
  threadId: asString(input?.threadId || input?.messageThreadId || input?.communicationsThreadId),
  tags: asArray(input?.tags || input?.labels).map((tag: any) => asString(tag)).filter(Boolean),
});

const mapProjectOverview = (input: any) => ({
  id: asString(input?.id),
  name: asString(input?.name || input?.title || 'Unnamed Project'),
  code: asString(input?.code),
  location: asString(input?.location || input?.address),
  summary: asString(input?.summary || input?.description),
  currentPhase: asString(input?.currentPhase || input?.phase),
  status: asString(input?.status || 'active'),
  startDate: asString(input?.startDate || input?.kickoffDate),
  projectedCompletionDate: asString(input?.projectedCompletionDate || input?.completionDate),
  heroImageUrl: asString(input?.heroImageUrl || input?.coverImageUrl),
  progressPercentage: Math.min(Math.max(asNumber(input?.progressPercentage || input?.progress, 0), 0), 100),
  completedMilestones: asNumber(input?.completedMilestones || input?.milestonesCompleted, 0),
  totalMilestones: asNumber(input?.totalMilestones || input?.milestoneCount, 0),
  approvalsPending: asNumber(input?.approvalsPending || input?.pendingApprovals, 0),
  unreadMessages: asNumber(input?.unreadMessages || input?.pendingMessages, 0),
  nextMilestone: input?.nextMilestone
    ? {
        id: asString(input.nextMilestone.id, generateId()),
        title: asString(input.nextMilestone.title || input.nextMilestone.name || 'Upcoming Milestone'),
        targetDate: asString(input.nextMilestone.targetDate || input.nextMilestone.dueDate),
        status: normaliseStatus(input.nextMilestone.status),
      }
    : undefined,
});

const mapProjectListItem = (input: any): ProjectListItem => ({
  id: asString(input?.id),
  name: asString(input?.name || input?.title || 'Unnamed Project'),
  code: asString(input?.code),
  location: asString(input?.location || input?.address),
  heroImageUrl: asString(input?.heroImageUrl || input?.coverImageUrl),
  progressPercentage: Math.min(Math.max(asNumber(input?.progressPercentage || input?.progress, 0), 0), 100),
  status: asString(input?.status || 'active'),
  currentPhase: asString(input?.currentPhase || input?.phase),
  nextMilestoneTitle: asString(input?.nextMilestone?.title || input?.nextMilestoneTitle),
  approvalsPending: asNumber(input?.approvalsPending || input?.pendingApprovals, 0),
  unreadMessages: asNumber(input?.unreadMessages || input?.pendingMessages, 0),
});

// ── Dev fallback data (used when the projects NestJS service is unavailable) ──

const devFallbackProjects: ProjectListItem[] = [
  {
    id: 'project-lakefront-condo',
    name: 'Lakefront Condo Renovation',
    code: 'LCR-2025',
    location: 'Chicago, IL',
    heroImageUrl: '',
    progressPercentage: 62,
    status: 'active',
    currentPhase: 'Design',
    nextMilestoneTitle: 'Design Approval',
    approvalsPending: 1,
    unreadMessages: 3,
  },
  {
    id: 'project-highland-estate',
    name: 'Highland Park Estate',
    code: 'HPE-2025',
    location: 'Dallas, TX',
    heroImageUrl: '',
    progressPercentage: 25,
    status: 'active',
    currentPhase: 'Discovery',
    nextMilestoneTitle: 'Concept Presentation',
    approvalsPending: 0,
    unreadMessages: 1,
  },
];

const devFallbackMilestones: MilestoneDetail[] = [
  {
    id: 'ms-1',
    index: 0,
    title: 'Initial Consultation',
    phase: 'Discovery',
    description: 'Met with designer to discuss vision, budget, and timeline.',
    status: 'completed',
    startDate: '2025-01-10',
    targetDate: '2025-01-15',
    completionDate: '2025-01-15',
    progressPercentage: 100,
    checklist: [
      { id: 'c1', label: 'Vision board created', completed: true },
      { id: 'c2', label: 'Budget approved', completed: true },
      { id: 'c3', label: 'Timeline agreed', completed: true },
    ],
    documents: [],
    messages: [
      { id: 'm1', authorId: 'designer-1', authorName: 'Leah Kochaver', authorRole: 'designer', body: 'Thank you for the wonderful consultation!', createdAt: '2025-01-15T14:30:00Z' },
    ],
    tags: [],
  },
  {
    id: 'ms-2',
    index: 1,
    title: 'Design Concept Development',
    phase: 'Design',
    description: 'Comprehensive design concepts including floor plans, color palettes, and furniture selections.',
    status: 'completed',
    startDate: '2025-01-20',
    targetDate: '2025-02-01',
    completionDate: '2025-02-01',
    progressPercentage: 100,
    checklist: [
      { id: 'c4', label: 'Floor plan drafted', completed: true },
      { id: 'c5', label: 'Color palette selected', completed: true },
      { id: 'c6', label: 'Furniture sourced', completed: true },
    ],
    documents: [],
    messages: [],
    tags: [],
  },
  {
    id: 'ms-3',
    index: 2,
    title: 'Design Approval',
    phase: 'Design',
    description: 'Review and approve the final design concepts and material selections.',
    status: 'attention',
    startDate: '2025-02-05',
    targetDate: '2025-02-15',
    progressPercentage: 85,
    checklist: [
      { id: 'c7', label: 'Review floor plan', completed: true },
      { id: 'c8', label: 'Approve color selections', completed: true },
      { id: 'c9', label: 'Sign off on furniture', completed: false },
    ],
    documents: [],
    messages: [
      { id: 'm2', authorId: 'designer-1', authorName: 'Leah Kochaver', authorRole: 'designer', body: 'The final design package is ready for your review!', createdAt: '2025-02-14T10:00:00Z' },
    ],
    approval: {
      id: 'a1',
      status: 'pending',
      summary: 'Design Concept Approval — please review the final design package',
      requestedAt: '2025-02-14T10:00:00Z',
      dueDate: '2025-02-20',
      requiresClientAction: true,
      totalValue: 12500,
      currency: 'USD',
    },
    tags: [],
  },
  {
    id: 'ms-4',
    index: 3,
    title: 'Material Ordering',
    phase: 'Procurement',
    description: 'Order all approved materials, furniture, and fixtures.',
    status: 'upcoming',
    targetDate: '2025-03-01',
    progressPercentage: 0,
    checklist: [
      { id: 'c10', label: 'Order furniture', completed: false },
      { id: 'c11', label: 'Order fixtures', completed: false },
      { id: 'c12', label: 'Schedule deliveries', completed: false },
    ],
    documents: [],
    messages: [],
    tags: [],
  },
  {
    id: 'ms-5',
    index: 4,
    title: 'Installation',
    phase: 'Installation',
    description: 'Professional installation of all furniture, fixtures, and décor.',
    status: 'upcoming',
    targetDate: '2025-03-15',
    progressPercentage: 0,
    checklist: [],
    documents: [],
    messages: [],
    tags: [],
  },
  {
    id: 'ms-6',
    index: 5,
    title: 'Final Walkthrough',
    phase: 'Completion',
    description: 'Tour your completed space, final touches, and project completion celebration.',
    status: 'upcoming',
    targetDate: '2025-03-22',
    progressPercentage: 0,
    checklist: [],
    documents: [],
    messages: [],
    tags: [],
  },
];

const devFallbackProjectView = (projectId: string): ClientProjectView => {
  const listItem = devFallbackProjects.find((p) => p.id === projectId) ?? devFallbackProjects[0];
  return {
    project: {
      id: listItem.id,
      name: listItem.name,
      code: listItem.code,
      location: listItem.location,
      summary: 'A luxury residential renovation bringing modern warmth and timeless elegance to every room.',
      currentPhase: listItem.currentPhase,
      status: listItem.status,
      startDate: '2025-01-10',
      projectedCompletionDate: '2025-03-30',
      heroImageUrl: '',
      progressPercentage: listItem.progressPercentage,
      completedMilestones: 2,
      totalMilestones: 6,
      approvalsPending: listItem.approvalsPending,
      unreadMessages: listItem.unreadMessages,
      nextMilestone: { id: 'ms-3', title: 'Design Approval', targetDate: '2025-02-15', status: 'attention' },
    },
    milestones: devFallbackMilestones,
    lastUpdated: new Date().toISOString(),
  };
};

// ── Public API ──

export const fetchClientProjects = cache(async (): Promise<ProjectListItem[]> => {
  try {
    const response = await serverProjectsApi.getProjects();
    return asArray(response?.data || response).map(mapProjectListItem);
  } catch (error) {
    if (env.isDevelopment) {
      console.warn('[Client Portal] Projects service unavailable — using fallback data');
      return devFallbackProjects;
    }
    throw error;
  }
});

export const fetchClientProjectView = cache(async (projectId: string): Promise<ClientProjectView> => {
  try {
    const response = await serverProjectsApi.getClientView(projectId);
    const project = mapProjectOverview(response?.project ?? response);
    const milestonesSource = response?.milestones ?? response?.timeline ?? [];

    const milestones = asArray(milestonesSource)
      .map((milestone, index) => mapMilestone(milestone, index))
      .sort((a, b) => a.index - b.index);

    return {
      project,
      milestones,
      lastUpdated: asString(response?.lastUpdated || response?.updatedAt),
    };
  } catch (error) {
    if (env.isDevelopment) {
      console.warn('[Client Portal] Projects service unavailable — using fallback data for', projectId);
      return devFallbackProjectView(projectId);
    }
    throw error;
  }
});
