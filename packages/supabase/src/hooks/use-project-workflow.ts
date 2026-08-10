import { useQuery } from '@tanstack/react-query';

import { createBrowserClient } from '../client';
import type { Database } from '../database.types';

export type ProjectWorkflowRow =
  Database['public']['Functions']['get_project_workflow']['Returns'][number];

export const projectWorkflowQueryKey = (
  projectId: string | null | undefined,
) => ['project-workflow', projectId] as const;

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
      return data ?? [];
    },
  });
}
