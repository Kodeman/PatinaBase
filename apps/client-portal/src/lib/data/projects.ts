import 'server-only';

import { cache } from 'react';

import { createServerClient } from '@patina/supabase/server';

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
    currentPhase: 'design_refinement',
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
    phase: 'consultation',
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
    phase: 'concept_development',
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
    phase: 'design_refinement',
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
    phase: 'procurement',
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
    phase: 'installation',
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
    phase: 'final_walkthrough',
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

// ── Phase summarisation (project_phases → progress / current / next) ──

const phaseProgress = (phase: any): number => {
  const status = String(phase?.status ?? '').toLowerCase();
  if (phase?.progress != null) return Math.min(Math.max(asNumber(phase.progress), 0), 100);
  if (status === 'completed') return 100;
  if (status === 'in_progress' || status === 'in-progress' || status === 'active') return 50;
  return 0;
};

const summarisePhases = (
  phasesInput: unknown,
): { phases: any[]; progressPercentage: number; currentPhaseLabel: string; completed: number; nextPhase: any | null } => {
  const phases = asArray<any>(phasesInput)
    .slice()
    .sort((a, b) => asNumber(a?.sort_order) - asNumber(b?.sort_order));

  if (phases.length === 0) {
    return { phases, progressPercentage: 0, currentPhaseLabel: '', completed: 0, nextPhase: null };
  }

  const sum = phases.reduce((acc, p) => acc + phaseProgress(p), 0);
  const progressPercentage = Math.round(sum / phases.length);
  const completed = phases.filter((p) => String(p?.status ?? '').toLowerCase() === 'completed').length;
  const inProgress = phases.find((p) => {
    const s = String(p?.status ?? '').toLowerCase();
    return s === 'in_progress' || s === 'in-progress' || s === 'active';
  });
  const nextPhase = inProgress ?? phases.find((p) => String(p?.status ?? '').toLowerCase() !== 'completed') ?? null;
  return { phases, progressPercentage, currentPhaseLabel: asString(inProgress?.name), completed, nextPhase };
};

// ── Per-project attention counts (approvals + unread messages) ──
//
// These replace the hardwired zeros. Counts are PER PROJECT because the header
// aggregates them (`projects.reduce(...)`) and the project cards display them
// individually — so a per-project map is the only shape that keeps both correct.
//
// Scoping rules:
//  • decisions  → client_decisions joined to designer_clients.client_id = auth.uid()
//                 (client_decisions has no client_id column of its own; the
//                 deciding client is identified via designer_clients). Mirrors the
//                 notification-bell scoping so a designer can't see other clients'
//                 pending decisions as "approvals".
//  • proposals  → proposals.client_id = auth.uid(), status in (sent, viewed).
//  • unread     → comms messages in the client's project threads created after
//                 their last_read_at and not authored by them (mirrors the inbox
//                 useInboxMessages unread rule).
//
// Note: decisions / proposals with a NULL project_id and messages in non-project
// threads are not attributable to a project and are therefore excluded from these
// per-project counts (they surface in the notification bell instead).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tallyByProject = (rows: unknown, key = 'project_id'): Map<string, number> => {
  const map = new Map<string, number>();
  for (const row of asArray<any>(rows)) {
    const pid = row?.[key];
    if (typeof pid === 'string' && pid) map.set(pid, (map.get(pid) ?? 0) + 1);
  }
  return map;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countPendingDecisionsByProject(supabase: any, userId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('client_decisions')
    .select('project_id, designer_clients!inner(client_id)')
    .eq('status', 'pending')
    .eq('designer_clients.client_id', userId);
  if (error) throw error;
  return tallyByProject(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countAwaitingProposalsByProject(supabase: any, userId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('proposals')
    .select('project_id')
    .eq('client_id', userId)
    .in('status', ['sent', 'viewed']);
  if (error) throw error;
  return tallyByProject(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countUnreadMessagesByProject(supabase: any, userId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  const { data: participantRows, error: pErr } = await supabase
    .from('comms_thread_participants')
    .select('thread_id, last_read_at, archived_at, left_at')
    .eq('profile_id', userId);
  if (pErr) throw pErr;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const active = asArray<any>(participantRows).filter((p) => !p?.left_at && !p?.archived_at);
  if (active.length === 0) return map;

  const lastReadByThread = new Map<string, string>(
    active.map((p) => [p.thread_id, p.last_read_at ?? '1970-01-01T00:00:00Z']),
  );

  const { data: threadRows, error: tErr } = await supabase
    .from('comms_threads')
    .select('id, project_id')
    .in('id', active.map((p) => p.thread_id));
  if (tErr) throw tErr;

  const projectByThread = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of asArray<any>(threadRows)) {
    if (t?.project_id) projectByThread.set(t.id, t.project_id);
  }
  const projectThreadIds = Array.from(projectByThread.keys());
  if (projectThreadIds.length === 0) return map;

  const { data: messageRows, error: mErr } = await supabase
    .from('comms_messages')
    .select('thread_id, sender_id, created_at')
    .in('thread_id', projectThreadIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (mErr) throw mErr;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of asArray<any>(messageRows)) {
    if (!m || m.sender_id === userId) continue; // own messages are never unread
    const lastRead = lastReadByThread.get(m.thread_id);
    const isUnread = !lastRead || new Date(m.created_at) > new Date(lastRead);
    if (!isUnread) continue;
    const pid = projectByThread.get(m.thread_id);
    if (pid) map.set(pid, (map.get(pid) ?? 0) + 1);
  }
  return map;
}

/**
 * Compute per-project approval (decisions + proposals) and unread-message
 * counts for the signed-in client. Best-effort: a count failure must never
 * break the projects read path (which previously 500'd), so on error we log and
 * return empty maps → counts fall back to 0.
 */
async function computeProjectCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<{ approvalsByProject: Map<string, number>; unreadByProject: Map<string, number> }> {
  try {
    const [decisions, proposals, unreadByProject] = await Promise.all([
      countPendingDecisionsByProject(supabase, userId),
      countAwaitingProposalsByProject(supabase, userId),
      countUnreadMessagesByProject(supabase, userId),
    ]);
    const approvalsByProject = new Map<string, number>();
    for (const [pid, n] of decisions) approvalsByProject.set(pid, (approvalsByProject.get(pid) ?? 0) + n);
    for (const [pid, n] of proposals) approvalsByProject.set(pid, (approvalsByProject.get(pid) ?? 0) + n);
    return { approvalsByProject, unreadByProject };
  } catch (error) {
    console.warn('[Client Portal] Project count computation failed — counts default to 0', error);
    return { approvalsByProject: new Map(), unreadByProject: new Map() };
  }
}

// ── Public API (Supabase-backed; RLS scopes to projects.client_id = auth.uid()) ──

const PROJECT_LIST_SELECT =
  'id, name, site_address, status, current_phase, brief_document_url, updated_at, ' +
  'project_phases(id, name, phase_key, status, sort_order, target_end_date, progress)';

const PROJECT_DETAIL_SELECT =
  'id, name, site_address, status, current_phase, notes, kickoff_message, brief_document_url, ' +
  'start_date, kickoff_date, target_end_date, expected_completion_date, updated_at, ' +
  'project_phases(id, name, phase_key, status, sort_order, start_date, target_end_date, completed_at, progress)';

// Real "approvals pending" per project = client_decisions still awaiting the
// client's response (status 'pending'). RLS scopes client_decisions to the
// client, so this counts only decisions addressed to them. Best-effort: a
// failure here must never break the project read (falls back to 0).
// (Proposal-line verdicts awaiting the client, C3, live on the proposal document
// itself — its own rollup header — since an active project's proposal is signed.)
const fetchPendingApprovalCounts = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectIds: string[],
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  if (projectIds.length === 0) return counts;
  const { data, error } = await supabase
    .from('client_decisions')
    .select('project_id')
    .in('project_id', projectIds)
    .eq('status', 'pending');
  if (error) return counts;
  for (const row of asArray<any>(data)) {
    const pid = asString(row?.project_id);
    if (!pid) continue;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  return counts;
};

export const fetchClientProjects = cache(async (): Promise<ProjectListItem[]> => {
  try {
    const supabase = (await createServerClient()) as any;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_LIST_SELECT)
      .eq('client_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) throw error;

    const { approvalsByProject, unreadByProject } = await computeProjectCounts(supabase, user.id);

    return asArray<any>(data).map((row) => {
      const { progressPercentage, currentPhaseLabel, nextPhase } = summarisePhases(row?.project_phases);
      const projectId = asString(row?.id);
      return mapProjectListItem({
        id: row?.id,
        name: row?.name,
        location: row?.site_address,
        heroImageUrl: row?.brief_document_url,
        status: row?.status,
        currentPhase: currentPhaseLabel || row?.current_phase,
        progressPercentage,
        nextMilestoneTitle: nextPhase?.name,
        approvalsPending: approvalsByProject.get(projectId) ?? 0,
        unreadMessages: unreadByProject.get(projectId) ?? 0,
      });
    });
  } catch (error) {
    if (env.isDevelopment) {
      console.warn('[Client Portal] Projects query failed — using fallback data', error);
      return devFallbackProjects;
    }
    throw error;
  }
});

export const fetchClientProjectView = cache(async (projectId: string): Promise<ClientProjectView> => {
  try {
    const supabase = (await createServerClient()) as any;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: row, error } = await supabase
      .from('projects')
      .select(PROJECT_DETAIL_SELECT)
      .eq('id', projectId)
      .eq('client_id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error('Project not found');

    const { approvalsByProject, unreadByProject } = await computeProjectCounts(supabase, user.id);

    const { phases, progressPercentage, currentPhaseLabel, completed, nextPhase } = summarisePhases(
      row.project_phases,
    );

    const pending = await fetchPendingApprovalCounts(supabase, [projectId]);

    const milestones: MilestoneDetail[] = phases
      .map((phase, index) =>
        mapMilestone(
          {
            id: phase?.id,
            title: phase?.name,
            phase: phase?.phase_key,
            status: phase?.status,
            startDate: phase?.start_date,
            targetDate: phase?.target_end_date,
            completionDate: phase?.completed_at,
            progressPercentage: phaseProgress(phase),
          },
          index,
        ),
      )
      .sort((a, b) => a.index - b.index);

    const project = mapProjectOverview({
      id: row.id,
      name: row.name,
      location: row.site_address,
      summary: row.kickoff_message || row.notes,
      currentPhase: currentPhaseLabel || row.current_phase,
      status: row.status,
      startDate: row.start_date || row.kickoff_date,
      projectedCompletionDate: row.target_end_date || row.expected_completion_date,
      heroImageUrl: row.brief_document_url,
      progressPercentage,
      completedMilestones: completed,
      totalMilestones: phases.length,
      approvalsPending: approvalsByProject.get(projectId) ?? 0,
      unreadMessages: unreadByProject.get(projectId) ?? 0,
      nextMilestone: nextPhase
        ? {
            id: nextPhase.id,
            title: nextPhase.name,
            targetDate: nextPhase.target_end_date,
            status: nextPhase.status,
          }
        : undefined,
    });

    return { project, milestones, lastUpdated: asString(row.updated_at) };
  } catch (error) {
    if (env.isDevelopment) {
      console.warn('[Client Portal] Project view query failed — using fallback data for', projectId, error);
      return devFallbackProjectView(projectId);
    }
    throw error;
  }
});
