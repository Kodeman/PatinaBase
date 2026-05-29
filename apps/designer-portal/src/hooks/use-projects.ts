/**
 * Hooks for Project Tracking — Opus System
 *
 * UUID-shaped IDs hit Supabase (project_rooms, project_ffe_items, project_phases,
 * project_payment_milestones, projects via 00066/00084). Slug-shaped IDs (e.g. the
 * Olsen showcase fixture) fall back to mock data.
 *
 * Tasks, documents, activity feed, and time tracking remain on the NestJS
 * svc_projects service (real-time / activity-stream surfaces).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { mockData } from '@/data/mock-designer-data';
import { projectsApi } from '@/lib/api-client';
import { withMockData } from '@/lib/mock-data';
import { queryKeys } from '@/lib/react-query';
import { normalizePhaseSlug } from '@/types/project-ui';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: string) => UUID_RE.test(id);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

// Human-readable size for project_documents.size_bytes (DocumentGrid shows the
// `size` string verbatim).
function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v % 1 === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

function formatDocDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface ProjectFilters {
  designerId?: string;
  status?: string;
}

// ── List-level Metrics ──

export function useProjectListMetrics() {
  return useQuery({
    queryKey: [...queryKeys.projects.all, 'list-metrics'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('projects')
        .select('status, budget_cents, start_date, target_end_date');

      // Supabase unavailable / no real rows yet → keep the showcase fixture so
      // dev/demo doesn't render an empty zero state.
      if (error || !data || data.length === 0) {
        return mockData.getProjectListMetrics();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = data as any[];
      const active = rows.filter(
        (p) => p.status === 'active' || p.status === 'planning'
      );

      const activeValue = active.reduce(
        (sum, p) => sum + (p.budget_cents || 0),
        0
      );

      const withDates = active.filter((p) => p.start_date && p.target_end_date);
      const avgMonths =
        withDates.length > 0
          ? withDates.reduce((sum, p) => {
              const start = new Date(p.start_date).getTime();
              const end = new Date(p.target_end_date).getTime();
              return sum + (end - start) / (1000 * 60 * 60 * 24 * 30.44);
            }, 0) / withDates.length
          : 0;

      // Invoiced MTD — sum of paid + outstanding milestones across all projects.
      const { data: milestones } = await supabase
        .from('project_payment_milestones')
        .select('amount_cents, status')
        .in('status', ['paid', 'outstanding']);
      const invoicedMTD = (milestones ?? []).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sum: number, m: any) => sum + (m.amount_cents || 0),
        0
      );

      return {
        activeValue,
        activeCount: active.length,
        avgTimeline: Math.round(avgMonths * 10) / 10,
        invoicedMTD,
      };
    },
  });
}

// ── Core Project Queries (Supabase for UUIDs, mock for slugs) ──

export function useProjects(filters?: ProjectFilters) {
  return useQuery({
    queryKey: queryKeys.projects.list(filters),
    queryFn: async () => {
      const supabase = getSupabase();
      let query = supabase
        .from('projects')
        .select(`
          *,
          client:profiles!projects_client_id_fkey(id, full_name, display_name, email),
          designer:profiles!projects_designer_id_fkey(id, full_name, display_name, email)
        `)
        .order('updated_at', { ascending: false });

      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.designerId) query = query.eq('designer_id', filters.designerId);

      const { data, error } = await query;
      if (error) {
        // Supabase failed — fall back to mock data so dev/showcase still works
        return mockData.getProjects(filters);
      }

      // If we have no real Supabase rows yet, augment with mock projects
      if (!data || data.length === 0) {
        return mockData.getProjects(filters);
      }

      return data;
    },
  });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.projects.detail(id) : ['projects', 'null'],
    queryFn: async () => {
      if (!id) throw new Error('Project ID required');

      // Slug fallback (mock fixtures like 'olsen-residence')
      if (!isUuid(id)) {
        const project = mockData.getProjectById(id);
        if (!project) throw new Error('Project not found');
        return project;
      }

      // Real UUID → Supabase
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          designer:profiles!projects_designer_id_fkey(id, full_name, display_name, email),
          client:profiles!projects_client_id_fkey(id, full_name, display_name, email),
          proposal:proposals!projects_proposal_id_fkey(id, title, signed_at)
        `)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

// ── Project Sub-Resource Queries ──

// Tasks live in Supabase public.project_tasks (00169). Previously routed to the
// disconnected svc_projects store, which 404'd → fabricated mock fallback.
export function useProjectTasks(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.tasks(projectId) : ['projects', 'tasks', 'null'],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID required');
      if (!isUuid(projectId)) return mockData.getProjectTasks(projectId);

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('project_tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((t: any) => ({
        id: t.id,
        projectId: t.project_id,
        // Normalize so PhaseTimelineV2 (which matches canonical slugs) groups
        // the task under the right phase.
        phase: normalizePhaseSlug(t.phase_key),
        title: t.title,
        description: t.description ?? undefined,
        status: t.status,
        dueDate: t.due_date ?? undefined,
        completedAt: t.completed_at ?? undefined,
      }));
    },
    enabled: !!projectId,
  });
}

// Timeline = project_phases (Supabase for UUID, mock for slug)
export function useProjectTimeline(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.timeline(projectId) : ['projects', 'timeline', 'null'],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID required');

      if (!isUuid(projectId)) return mockData.getProjectTimeline(projectId);

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('project_phases')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

// Documents live in Supabase public.project_documents (00169). Previously routed
// to the disconnected svc_projects store, which 404'd → silent mock fallback.
export function useProjectDocuments(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.documents(projectId) : ['projects', 'documents', 'null'],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID required');
      if (!isUuid(projectId)) return mockData.getProjectDocuments(projectId);

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('project_documents')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((d: any) => ({
        id: d.id,
        projectId: d.project_id,
        title: d.title,
        type: d.doc_type,
        category: d.category ?? undefined,
        date: formatDocDate(d.created_at),
        size: formatBytes(d.size_bytes),
        status: d.status ?? undefined,
        version: d.version ?? undefined,
      }));
    },
    enabled: !!projectId,
  });
}

// Milestones = project_payment_milestones (Supabase for UUID, mock for slug)
export function useProjectMilestones(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.milestones(projectId) : ['projects', 'milestones', 'null'],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID required');

      if (!isUuid(projectId)) return mockData.getProjectMilestones(projectId);

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('project_payment_milestones')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

// Activity feed remains on NestJS svc_projects
export function useProjectActivity(projectId: string | null, limit?: number) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.activity(projectId) : ['projects', 'activity', 'null'],
    queryFn: () => {
      if (!projectId) throw new Error('Project ID required');
      const mockFn = () => mockData.getProjectActivity(projectId);
      if (!isUuid(projectId)) return Promise.resolve(mockFn());
      return withMockData(() => projectsApi.getActivityFeed(projectId, { limit }), mockFn);
    },
    enabled: !!projectId,
  });
}

export function useProjectBudgetItems(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? [...queryKeys.projects.all, projectId, 'budget-items'] : ['projects', 'budget-items', 'null'],
    queryFn: () => {
      if (!projectId) throw new Error('Project ID required');
      const mockFn = () => mockData.getProjectBudgetItems(projectId);
      if (!isUuid(projectId)) return Promise.resolve(mockFn());
      return withMockData(() => projectsApi.getProjectStats(projectId), mockFn);
    },
    enabled: !!projectId,
  });
}

// ── V2 Sub-Resource Queries (now backed by Supabase 00066 tables) ──

export function useProjectRooms(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.rooms(projectId) : ['projects', 'rooms', 'null'],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID required');

      if (!isUuid(projectId)) return mockData.getProjectRooms(projectId);

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('project_rooms')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

export function useProjectFFEItems(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.ffeItems(projectId) : ['projects', 'ffe-items', 'null'],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID required');

      if (!isUuid(projectId)) return mockData.getProjectFFEItems(projectId);

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('project_ffe_items')
        .select(`
          *,
          room:project_rooms!project_room_id(id, name),
          product:products!product_id(id, name, images, brand)
        `)
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

export function useProjectFinancials(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.financials(projectId) : ['projects', 'financials', 'null'],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID required');

      if (!isUuid(projectId)) return mockData.getProjectFinancials(projectId);

      const supabase = getSupabase();
      const [projectRes, roomsRes, itemsRes] = await Promise.all([
        supabase
          .from('projects')
          .select('budget_cents, committed_cents, actual_cents, design_fee_cents')
          .eq('id', projectId)
          .single(),
        supabase
          .from('project_rooms')
          .select('id, name, budget_cents, committed_cents, actual_cents')
          .eq('project_id', projectId),
        supabase
          .from('project_ffe_items')
          .select('ffe_category, line_total_cents, status')
          .eq('project_id', projectId),
      ]);

      const project = projectRes.data;
      const rooms = roomsRes.data ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = (itemsRes.data ?? []) as any[];

      const categoryMap = new Map<string, { budget: number; committed: number; actual: number }>();
      for (const item of items) {
        const cat = item.ffe_category || 'Uncategorized';
        const existing = categoryMap.get(cat) || { budget: 0, committed: 0, actual: 0 };
        existing.budget += item.line_total_cents || 0;
        if (['ordered', 'production', 'shipped', 'delivered', 'installed'].includes(item.status)) {
          existing.committed += item.line_total_cents || 0;
        }
        if (['delivered', 'installed'].includes(item.status)) {
          existing.actual += item.line_total_cents || 0;
        }
        categoryMap.set(cat, existing);
      }

      return {
        budgetCents: project?.budget_cents || 0,
        committedCents: project?.committed_cents || 0,
        actualCents: project?.actual_cents || 0,
        designFeeCents: project?.design_fee_cents || 0,
        varianceCents: (project?.budget_cents || 0) - (project?.actual_cents || 0),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        byRoom: rooms.map((r: any) => ({
          roomId: r.id,
          roomName: r.name,
          budgetCents: r.budget_cents,
          committedCents: r.committed_cents || 0,
          actualCents: r.actual_cents || 0,
        })),
        byCategory: Array.from(categoryMap.entries()).map(([category, stats]) => ({
          category,
          budgetCents: stats.budget,
          committedCents: stats.committed,
          actualCents: stats.actual,
        })),
      };
    },
    enabled: !!projectId,
  });
}

// Time tracking is not yet a built feature. Slug fixtures keep their mock data
// for demos; real (UUID) projects return null so TimeTrackingPanel renders
// nothing rather than fabricating hours (was previously always-mock).
export function useProjectTimeTracking(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.timeTracking(projectId) : ['projects', 'time-tracking', 'null'],
    queryFn: () => {
      if (!projectId) throw new Error('Project ID required');
      if (!isUuid(projectId)) return Promise.resolve(mockData.getProjectTimeTracking(projectId));
      return Promise.resolve(null);
    },
    enabled: !!projectId,
  });
}

// Key metrics derived client-side from project + FFE items + phases.
// Returns the same shape as mockData.getProjectKeyMetrics() so KeyMetricsRow
// renders both data sources without conditional branches.
export function useProjectKeyMetrics(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.keyMetrics(projectId) : ['projects', 'key-metrics', 'null'],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID required');

      if (!isUuid(projectId)) return mockData.getProjectKeyMetrics(projectId);

      const supabase = getSupabase();
      const [projectRes, itemsRes, phasesRes, decisionsRes, milestonesRes] = await Promise.all([
        supabase
          .from('projects')
          .select('budget_cents, committed_cents, actual_cents, design_fee_cents, start_date, target_end_date')
          .eq('id', projectId)
          .single(),
        supabase.from('project_ffe_items').select('id, status').eq('project_id', projectId),
        supabase.from('project_phases').select('id, status, progress, duration_weeks').eq('project_id', projectId),
        supabase.from('client_decisions').select('id, status, due_date').eq('project_id', projectId),
        supabase
          .from('project_payment_milestones')
          .select('id, status, amount_cents')
          .eq('project_id', projectId),
      ]);

      const project = projectRes.data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = (itemsRes.data ?? []) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const phases = (phasesRes.data ?? []) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decisions = (decisionsRes.data ?? []) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const milestones = (milestonesRes.data ?? []) as any[];

      const orderedCount = items.filter((i) =>
        ['ordered', 'production', 'shipped', 'delivered', 'installed'].includes(i.status)
      ).length;
      const totalItems = items.length;

      const totalWeeks = phases.reduce((sum, p) => sum + (p.duration_weeks || 0), 0) || 12;
      let weekNumber = 0;
      if (project?.start_date) {
        weekNumber = Math.max(
          1,
          Math.ceil((Date.now() - new Date(project.start_date).getTime()) / (7 * 86400000))
        );
      }
      const avgPhaseProgress = phases.length
        ? Math.round(phases.reduce((sum, p) => sum + (p.progress || 0), 0) / phases.length)
        : 0;

      const budgetTotal = project?.budget_cents || 0;
      const committed = project?.committed_cents || 0;
      const committedPct = budgetTotal > 0 ? Math.round((committed / budgetTotal) * 100) : 0;
      const actual = project?.actual_cents || 0;
      const overUnder = budgetTotal > 0 ? (actual - budgetTotal) / budgetTotal : 0;
      const budgetStatus =
        Math.abs(overUnder) < 0.05 ? 'On target' : overUnder > 0 ? 'Over budget' : 'Under budget';

      const invoicedCents = milestones
        .filter((m) => m.status === 'paid' || m.status === 'outstanding')
        .reduce((sum, m) => sum + (m.amount_cents || 0), 0);
      const outstandingCents = milestones
        .filter((m) => m.status === 'outstanding')
        .reduce((sum, m) => sum + (m.amount_cents || 0), 0);

      const decisionsOpen = decisions.filter((d) => d.status === 'pending' || d.status === 'open').length;
      const decisionsOverdue = decisions.filter(
        (d) => d.status === 'pending' && d.due_date && new Date(d.due_date).getTime() < Date.now()
      ).length;

      return {
        progress: avgPhaseProgress,
        weekNumber,
        totalWeeks,
        budgetTotal,
        budgetStatus,
        committed,
        committedPct,
        invoiced: invoicedCents,
        outstanding: outstandingCents,
        ffeOrdered: orderedCount,
        ffeTotal: totalItems,
        decisionsOpen,
        decisionsOverdue,
        hoursSpent: 0, // wired in Sprint 3 (svc_projects time tracking)
        hoursEstimated: 0,
      };
    },
    enabled: !!projectId,
  });
}

// ── Mutations ──

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('activate_project_v2', { input });
      if (error) throw error;
      return { id: data as string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: unknown }) => {
      // UUID → Supabase
      if (isUuid(id)) {
        const supabase = getSupabase();
        const { data: row, error } = await supabase
          .from('projects')
          .update(data as Record<string, unknown>)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return row;
      }
      // Slug → NestJS / mock fallback
      return withMockData(
        () => projectsApi.updateProject(id, data),
        () => Promise.resolve({ id, ...(data as object) })
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: string; data: unknown }) => {
      // UUID → Supabase public.project_tasks. Callers pass { title, phase, status }.
      if (isUuid(projectId)) {
        const supabase = getSupabase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = (data ?? {}) as any;
        const { data: row, error } = await supabase
          .from('project_tasks')
          .insert({
            project_id: projectId,
            title: d.title,
            phase_key: d.phase ?? d.phase_key ?? null,
            status: d.status ?? 'todo',
          })
          .select()
          .single();
        if (error) throw error;
        return row;
      }
      return withMockData(
        () => projectsApi.createTask(projectId, data),
        () => Promise.resolve({ projectId, ...(data as object) })
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.tasks(variables.projectId) });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, data }: { taskId: string; data: unknown }) => {
      if (isUuid(taskId)) {
        const supabase = getSupabase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: Record<string, any> = { ...((data ?? {}) as object) };
        // Keep completed_at consistent with the done/undone toggle.
        if (patch.status === 'done') patch.completed_at = new Date().toISOString();
        else if (patch.status === 'todo' || patch.status === 'blocked') patch.completed_at = null;
        const { data: row, error } = await supabase
          .from('project_tasks')
          .update(patch)
          .eq('id', taskId)
          .select()
          .single();
        if (error) throw error;
        return row;
      }
      return withMockData(
        () => projectsApi.updateTask(taskId, data),
        () => Promise.resolve({ taskId, ...(data as object) })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      if (isUuid(taskId)) {
        const supabase = getSupabase();
        const { error } = await supabase.from('project_tasks').delete().eq('id', taskId);
        if (error) throw error;
        return;
      }
      return withMockData(
        () => projectsApi.deleteTask(taskId),
        () => Promise.resolve()
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useCompleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: unknown }) => {
      if (isUuid(id)) {
        const supabase = getSupabase();
        const { data: row, error } = await supabase
          .from('projects')
          .update({ status: 'completed', ...(data as object) })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return row;
      }
      return withMockData(
        () => projectsApi.updateProject(id, { status: 'completed', ...(data as object) }),
        () => Promise.resolve({ id, status: 'completed', ...(data as object) })
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useCreateRFI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: unknown }) =>
      withMockData(
        () => projectsApi.createRFI(projectId, data),
        () => Promise.resolve({ projectId, ...(data as object) })
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.rfis(variables.projectId) });
    },
  });
}

export function useCreateChangeOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: unknown }) =>
      withMockData(
        () => projectsApi.createChangeOrder(projectId, data),
        () => Promise.resolve({ projectId, ...(data as object) })
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.projectId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.changeOrders(variables.projectId),
      });
    },
  });
}
