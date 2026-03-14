import 'server-only';

import { cache } from 'react';

import { serverProjectsApi } from '../api-client-server';
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

export const fetchClientProjects = cache(async (): Promise<ProjectListItem[]> => {
  const response = await serverProjectsApi.getProjects();
  return asArray(response?.data || response).map(mapProjectListItem);
});

export const fetchClientProjectView = cache(async (projectId: string): Promise<ClientProjectView> => {
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
});
