/**
 * Hooks for Project Tracking — Opus System
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mockData } from '@/data/mock-designer-data';
import { projectsApi } from '@/lib/api-client';
import { withMockData } from '@/lib/mock-data';
import { queryKeys } from '@/lib/react-query';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProjectFilters {
  designerId?: string;
  status?: string;
}

// ── List-level Metrics ──

export function useProjectListMetrics() {
  return useQuery({
    queryKey: [...queryKeys.projects.all, 'list-metrics'],
    queryFn: () =>
      withMockData(
        () => Promise.resolve(mockData.getProjectListMetrics()),
        () => mockData.getProjectListMetrics()
      ),
  });
}

// ── Core Project Queries ──

export function useProjects(filters?: ProjectFilters) {
  return useQuery({
    queryKey: queryKeys.projects.list(filters),
    queryFn: () =>
      withMockData(
        () => projectsApi.getProjects(filters),
        () => mockData.getProjects(filters)
      ),
  });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.projects.detail(id) : ['projects', 'null'],
    queryFn: () => {
      if (!id) throw new Error('Project ID required');
      const mockFn = () => {
        const project = mockData.getProjectById(id);
        if (!project) throw new Error('Project not found');
        return project;
      };
      // Skip live API for non-UUID IDs (mock data uses slug IDs)
      if (!UUID_RE.test(id)) return Promise.resolve(mockFn());
      return withMockData(
        () => projectsApi.getProject(id),
        mockFn
      );
    },
    enabled: !!id,
  });
}

// ── Project Sub-Resource Queries ──

export function useProjectTasks(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.tasks(projectId) : ['projects', 'tasks', 'null'],
    queryFn: () => {
      if (!projectId) throw new Error('Project ID required');
      const mockFn = () => mockData.getProjectTasks(projectId);
      if (!UUID_RE.test(projectId)) return Promise.resolve(mockFn());
      return withMockData(() => projectsApi.getTasks(projectId), mockFn);
    },
    enabled: !!projectId,
  });
}

export function useProjectTimeline(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.timeline(projectId) : ['projects', 'timeline', 'null'],
    queryFn: () => {
      if (!projectId) throw new Error('Project ID required');
      const mockFn = () => mockData.getProjectTimeline(projectId);
      if (!UUID_RE.test(projectId)) return Promise.resolve(mockFn());
      return withMockData(() => projectsApi.getTimelineSegments(projectId), mockFn);
    },
    enabled: !!projectId,
  });
}

export function useProjectDocuments(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.documents(projectId) : ['projects', 'documents', 'null'],
    queryFn: () => {
      if (!projectId) throw new Error('Project ID required');
      const mockFn = () => mockData.getProjectDocuments(projectId);
      if (!UUID_RE.test(projectId)) return Promise.resolve(mockFn());
      return withMockData(() => projectsApi.getDocuments(projectId), mockFn);
    },
    enabled: !!projectId,
  });
}

export function useProjectMilestones(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.milestones(projectId) : ['projects', 'milestones', 'null'],
    queryFn: () => {
      if (!projectId) throw new Error('Project ID required');
      const mockFn = () => mockData.getProjectMilestones(projectId);
      if (!UUID_RE.test(projectId)) return Promise.resolve(mockFn());
      return withMockData(() => projectsApi.getMilestones(projectId), mockFn);
    },
    enabled: !!projectId,
  });
}

export function useProjectActivity(projectId: string | null, limit?: number) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.activity(projectId) : ['projects', 'activity', 'null'],
    queryFn: () => {
      if (!projectId) throw new Error('Project ID required');
      const mockFn = () => mockData.getProjectActivity(projectId);
      if (!UUID_RE.test(projectId)) return Promise.resolve(mockFn());
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
      if (!UUID_RE.test(projectId)) return Promise.resolve(mockFn());
      return withMockData(() => projectsApi.getProjectStats(projectId), mockFn);
    },
    enabled: !!projectId,
  });
}

// ── V2 Sub-Resource Queries ──

export function useProjectRooms(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.rooms(projectId) : ['projects', 'rooms', 'null'],
    queryFn: () => {
      if (!projectId) throw new Error('Project ID required');
      const mockFn = () => mockData.getProjectRooms(projectId);
      if (!UUID_RE.test(projectId)) return Promise.resolve(mockFn());
      return withMockData(() => Promise.resolve(mockFn()), mockFn);
    },
    enabled: !!projectId,
  });
}

export function useProjectFFEItems(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.ffeItems(projectId) : ['projects', 'ffe-items', 'null'],
    queryFn: () => {
      if (!projectId) throw new Error('Project ID required');
      const mockFn = () => mockData.getProjectFFEItems(projectId);
      if (!UUID_RE.test(projectId)) return Promise.resolve(mockFn());
      return withMockData(() => Promise.resolve(mockFn()), mockFn);
    },
    enabled: !!projectId,
  });
}

export function useProjectFinancials(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.financials(projectId) : ['projects', 'financials', 'null'],
    queryFn: () => {
      if (!projectId) throw new Error('Project ID required');
      const mockFn = () => mockData.getProjectFinancials(projectId);
      if (!UUID_RE.test(projectId)) return Promise.resolve(mockFn());
      return withMockData(() => Promise.resolve(mockFn()), mockFn);
    },
    enabled: !!projectId,
  });
}

export function useProjectTimeTracking(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.timeTracking(projectId) : ['projects', 'time-tracking', 'null'],
    queryFn: () => {
      if (!projectId) throw new Error('Project ID required');
      const mockFn = () => mockData.getProjectTimeTracking(projectId);
      if (!UUID_RE.test(projectId)) return Promise.resolve(mockFn());
      return withMockData(() => Promise.resolve(mockFn()), mockFn);
    },
    enabled: !!projectId,
  });
}

export function useProjectKeyMetrics(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? queryKeys.projects.keyMetrics(projectId) : ['projects', 'key-metrics', 'null'],
    queryFn: () => {
      if (!projectId) throw new Error('Project ID required');
      const mockFn = () => mockData.getProjectKeyMetrics(projectId);
      if (!UUID_RE.test(projectId)) return Promise.resolve(mockFn());
      return withMockData(() => Promise.resolve(mockFn()), mockFn);
    },
    enabled: !!projectId,
  });
}

// ── Mutations ──

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: unknown) =>
      withMockData(
        () => projectsApi.createProject(data),
        () => Promise.resolve({ id: `mock-project-${Date.now()}`, ...(data as object) })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      withMockData(
        () => projectsApi.updateProject(id, data),
        () => Promise.resolve({ id, ...(data as object) })
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: unknown }) =>
      withMockData(
        () => projectsApi.createTask(projectId, data),
        () => Promise.resolve({ projectId, ...data })
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.tasks(variables.projectId) });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: unknown }) =>
      withMockData(
        () => projectsApi.updateTask(taskId, data),
        () => Promise.resolve({ taskId, ...data })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) =>
      withMockData(
        () => projectsApi.deleteTask(taskId),
        () => Promise.resolve()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useCompleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      withMockData(
        () => projectsApi.updateProject(id, { status: 'completed', ...(data as object) }),
        () => Promise.resolve({ id, status: 'completed', ...(data as object) })
      ),
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
        () => Promise.resolve({ projectId, ...data })
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
        () => Promise.resolve({ projectId, ...data })
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.projectId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.changeOrders(variables.projectId),
      });
    },
  });
}
