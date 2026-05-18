/**
 * React Query hooks for Waitlist management
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { waitlistService } from '@/services/waitlist';
import type {
  WaitlistActivityKind,
  WaitlistEntryPatch,
  WaitlistFilters,
} from '@/services/waitlist';

export const waitlistKeys = {
  all: ['waitlist'] as const,
  entries: (filters?: WaitlistFilters) => [...waitlistKeys.all, 'entries', filters] as const,
  entry: (id: string) => [...waitlistKeys.all, 'entry', id] as const,
  stats: () => [...waitlistKeys.all, 'stats'] as const,
  activities: (id: string) => [...waitlistKeys.all, 'activities', id] as const,
  tasks: (id: string) => [...waitlistKeys.all, 'tasks', id] as const,
};

export function useWaitlistEntries(filters?: WaitlistFilters) {
  return useQuery({
    queryKey: waitlistKeys.entries(filters),
    queryFn: () => waitlistService.getEntries(filters),
  });
}

export function useWaitlistStats() {
  return useQuery({
    queryKey: waitlistKeys.stats(),
    queryFn: () => waitlistService.getStats(),
  });
}

export function useWaitlistEntry(id: string | null) {
  return useQuery({
    queryKey: waitlistKeys.entry(id ?? ''),
    queryFn: () => waitlistService.getEntry(id!),
    enabled: !!id,
  });
}

export function useWaitlistActivities(id: string | null) {
  return useQuery({
    queryKey: waitlistKeys.activities(id ?? ''),
    queryFn: () => waitlistService.listActivities(id!),
    enabled: !!id,
  });
}

export function useWaitlistTasks(id: string | null) {
  return useQuery({
    queryKey: waitlistKeys.tasks(id ?? ''),
    queryFn: () => waitlistService.listTasks(id!),
    enabled: !!id,
  });
}

/**
 * Returns a function to invalidate all waitlist queries.
 * Call after converting a waitlist entry to a user.
 */
export function useInvalidateWaitlist() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: waitlistKeys.all });
  };
}

export function useUpdateWaitlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: WaitlistEntryPatch }) =>
      waitlistService.updateEntry(id, patch),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: waitlistKeys.all });
      queryClient.invalidateQueries({ queryKey: waitlistKeys.entry(vars.id) });
      queryClient.invalidateQueries({ queryKey: waitlistKeys.activities(vars.id) });
    },
  });
}

export function useLogWaitlistActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      kind,
      body,
      metadata,
    }: {
      id: string;
      kind: WaitlistActivityKind;
      body?: string;
      metadata?: Record<string, unknown>;
    }) => waitlistService.logActivity(id, { kind, body, metadata }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: waitlistKeys.activities(vars.id) });
    },
  });
}

export function useCreateWaitlistTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      title,
      dueDate,
      assignedAdminId,
    }: {
      id: string;
      title: string;
      dueDate?: string | null;
      assignedAdminId?: string | null;
    }) => waitlistService.createTask(id, { title, dueDate, assignedAdminId }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: waitlistKeys.tasks(vars.id) });
      queryClient.invalidateQueries({ queryKey: waitlistKeys.activities(vars.id) });
    },
  });
}

export function useUpdateWaitlistTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      waitlistId,
      taskId,
      patch,
    }: {
      waitlistId: string;
      taskId: string;
      patch: { completed?: boolean; title?: string; dueDate?: string | null; assignedAdminId?: string | null };
    }) => waitlistService.updateTask(waitlistId, taskId, patch),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: waitlistKeys.tasks(vars.waitlistId) });
      queryClient.invalidateQueries({ queryKey: waitlistKeys.activities(vars.waitlistId) });
    },
  });
}
