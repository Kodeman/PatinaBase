import { useQuery, type QueryClient } from '@tanstack/react-query';

import { createBrowserClient } from '../client';
import type { Database } from '../database.types';

type GeneratedProjectWorkflowRow =
  Database['public']['Functions']['get_project_workflow']['Returns'][number];

/**
 * Nullable RPC boundary for fields whose SQL sources are nullable. Keep this
 * wrapper here until the generated contract is refreshed from the deployed
 * function; generated database types must not be hand-edited.
 */
export type ProjectWorkflowRow = Omit<
  GeneratedProjectWorkflowRow,
  | 'canonical_stage_key'
  | 'completed_at'
  | 'follows_phase_id'
  | 'gate_note'
  | 'phase_key'
  | 'source_proposal_phase_id'
  | 'start_date'
  | 'target_end_date'
  | 'workflow_track'
> & {
  canonical_stage_key: string | null;
  completed_at: string | null;
  follows_phase_id: string | null;
  gate_note: string | null;
  phase_key: string | null;
  source_proposal_phase_id: string | null;
  start_date: string | null;
  target_end_date: string | null;
  workflow_track: string | null;
  advance_blocker_count: number;
  blocks_advance: boolean;
};

export const projectWorkflowQueryKey = (
  projectId: string | null | undefined,
) => ['project-workflow', projectId] as const;

type WorkflowInvalidationClient = Pick<QueryClient, 'invalidateQueries'>;

/** One project-scoped invalidation door for every workflow-authoritative write. */
export function invalidateProjectWorkflow(
  queryClient: WorkflowInvalidationClient,
  projectId: string | null | undefined,
) {
  if (!projectId) return Promise.resolve();
  return queryClient.invalidateQueries({
    queryKey: projectWorkflowQueryKey(projectId),
  });
}

function projectWorkflowRowFromRpc(
  row: GeneratedProjectWorkflowRow,
): ProjectWorkflowRow {
  const runtime = row as GeneratedProjectWorkflowRow & {
    advance_blocker_count?: unknown;
    blocks_advance?: unknown;
  };

  return {
    ...row,
    advance_blocker_count:
      typeof runtime.advance_blocker_count === 'number'
        ? runtime.advance_blocker_count
        : 0,
    blocks_advance: runtime.blocks_advance === true,
  };
}

/**
 * Designer-authorized workflow read model for one project. This is the single
 * query contract for canonical classification, graph topology, provenance,
 * configured outputs, and live blockers.
 */
export function useProjectWorkflow(projectId: string | null | undefined) {
  return useQuery({
    queryKey: projectWorkflowQueryKey(projectId),
    enabled: Boolean(projectId),
    queryFn: async (): Promise<ProjectWorkflowRow[]> => {
      if (!projectId) return [];

      const { data, error } = await createBrowserClient().rpc(
        'get_project_workflow',
        { p_project_id: projectId },
      );
      if (error) throw error;
      return (data ?? []).map(projectWorkflowRowFromRpc);
    },
    // TODO(wave1-reconciliation): remove silent once wave1 schema is applied to prod
    meta: { errorSurface: 'silent' },
  });
}
