import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import {
  agentTasksService,
  type AgentTaskFilters,
  type ReviewTaskInput,
} from '@/services/agent-tasks';
import type { AgentTask } from '@patina/agent-queue';

// ─── Query keys ──────────────────────────────────────────────────────────────
// One canonical factory. lists() is the invalidation root for every filtered
// inbox list; detail(id) and stats() are separate.
export const agentTaskKeys = {
  all: ['agent-tasks'] as const,
  lists: () => [...agentTaskKeys.all, 'list'] as const,
  list: (filters?: AgentTaskFilters) => [...agentTaskKeys.lists(), filters ?? {}] as const,
  detail: (id: string) => [...agentTaskKeys.all, 'detail', id] as const,
  stats: () => [...agentTaskKeys.all, 'stats'] as const,
};

const DEFAULT_FILTERS: AgentTaskFilters = { status: 'awaiting_review' };
const POLL_INTERVAL_MS = 30_000;

/**
 * The inbox list. Defaults to awaiting_review (exception-first). The server
 * sorts priority asc then created_at asc, so the returned order is the
 * grooming order — do not re-sort client-side.
 */
export function useAgentTasks(filters: AgentTaskFilters = DEFAULT_FILTERS) {
  return useQuery({
    queryKey: agentTaskKeys.list(filters),
    queryFn: () => agentTasksService.list(filters),
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 10_000,
  });
}

export function useAgentTask(id: string | null | undefined) {
  return useQuery({
    queryKey: agentTaskKeys.detail(id ?? ''),
    queryFn: () => agentTasksService.get(id as string),
    enabled: !!id,
  });
}

export function useAgentQueueStats() {
  return useQuery({
    queryKey: agentTaskKeys.stats(),
    queryFn: () => agentTasksService.stats(),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/**
 * Review (approve/reject/edit-then-approve) a task.
 *
 * Optimistic: onMutate removes the reviewed task from every cached inbox list
 * so it leaves the queue instantly; onError restores the snapshots; onSettled
 * invalidates lists() + stats() to reconcile with the server. The reviewer is
 * never blocked on downstream execution (the route is fire-and-forget).
 */
export function useReviewTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: ReviewTaskInput) => agentTasksService.review(input),

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: agentTaskKeys.lists() });
      // Snapshot every list query so we can roll back on error.
      const snapshots = qc.getQueriesData<AgentTask[]>({ queryKey: agentTaskKeys.lists() });
      for (const [key, tasks] of snapshots) {
        if (!tasks) continue;
        qc.setQueryData<AgentTask[]>(
          key as QueryKey,
          tasks.filter((t) => t.id !== input.id),
        );
      }
      return { snapshots };
    },

    onError: (_err, _input, context) => {
      context?.snapshots?.forEach(([key, tasks]) => {
        qc.setQueryData(key as QueryKey, tasks);
      });
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: agentTaskKeys.lists() });
      qc.invalidateQueries({ queryKey: agentTaskKeys.stats() });
    },
  });
}
