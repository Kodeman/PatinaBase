import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ rpc }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
}));

import {
  invalidateProjectWorkflow,
  projectWorkflowQueryKey,
  useProjectWorkflow,
} from '../use-project-workflow';

interface QueryConfig {
  queryKey: readonly unknown[];
  enabled: boolean;
  queryFn: () => Promise<unknown>;
}

describe('useProjectWorkflow', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('uses one canonical project workflow cache key', () => {
    expect(projectWorkflowQueryKey('project-1')).toEqual([
      'project-workflow',
      'project-1',
    ]);
    expect(projectWorkflowQueryKey(null)).toEqual([
      'project-workflow',
      null,
    ]);
  });

  it('invalidates only the canonical project-scoped workflow key', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    await invalidateProjectWorkflow({ invalidateQueries }, 'project-1');
    await invalidateProjectWorkflow({ invalidateQueries }, null);

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['project-workflow', 'project-1'],
    });
  });

  it('reads the authorized workflow RPC and returns its rows', async () => {
    const rows = [{ phase_id: 'phase-1' }];
    rpc.mockResolvedValue({ data: rows, error: null });
    const query = useProjectWorkflow('project-1') as unknown as QueryConfig;

    expect(query.queryKey).toEqual(['project-workflow', 'project-1']);
    expect(query.enabled).toBe(true);
    await expect(query.queryFn()).resolves.toEqual([
      {
        phase_id: 'phase-1',
        advance_blocker_count: 0,
        blocks_advance: false,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('get_project_workflow', {
      p_project_id: 'project-1',
    });
  });

  it('preserves the advance-only blocker contract when the RPC provides it', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          phase_id: 'phase-1',
          advance_blocker_count: 2,
          blocks_advance: true,
        },
      ],
      error: null,
    });
    const query = useProjectWorkflow('project-1') as unknown as QueryConfig;

    await expect(query.queryFn()).resolves.toEqual([
      {
        phase_id: 'phase-1',
        advance_blocker_count: 2,
        blocks_advance: true,
      },
    ]);
  });

  it('is disabled without a project and never calls the RPC', async () => {
    const query = useProjectWorkflow(null) as unknown as QueryConfig;

    expect(query.enabled).toBe(false);
    await expect(query.queryFn()).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('surfaces RPC failures', async () => {
    const error = new Error('workflow unavailable');
    rpc.mockResolvedValue({ data: null, error });
    const query = useProjectWorkflow('project-1') as unknown as QueryConfig;

    await expect(query.queryFn()).rejects.toBe(error);
  });
});
