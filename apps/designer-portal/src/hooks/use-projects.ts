/**
 * Hooks for Project Tracking
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mockData } from '@/data/mock-designer-data';
import { projectsApi } from '@/lib/api-client';
import { withMockData } from '@/lib/mock-data';
import { queryKeys } from '@/lib/react-query';

interface ProjectFilters {
  designerId?: string;
  status?: string;
}

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
      return withMockData(
        () => projectsApi.getProject(id),
        () => {
          const project = mockData.getProjectById(id);
          if (!project) throw new Error('Project not found');
          return project;
        }
      );
    },
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: unknown) =>
      withMockData(
        () => projectsApi.createProject(data),
        () => Promise.resolve({ id: `mock-project-${Date.now()}`, ...data })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
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
      // Invalidate all projects as we don't know which project the task belongs to
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
