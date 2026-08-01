import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.fn();
const rpc = vi.fn();
const getUser = vi.fn();
const invalidateQueries = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from, rpc, auth: { getUser } }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQuery: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import { useReassignLead } from '../use-project-team';

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
  getUser.mockReset();
  invalidateQueries.mockReset();
  rpc.mockResolvedValue({ data: { id: 'project-1' }, error: null });
});

describe('project lead reassignment authority', () => {
  it('routes the complete transfer through one checked RPC', async () => {
    const config = useReassignLead() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
      onSuccess: (data: unknown, input: { projectId: string }) => void;
    };
    const input = {
      projectId: 'project-1',
      oldDesignerId: 'designer-old',
      newDesignerId: 'designer-new',
    };

    await config.mutationFn(input);
    config.onSuccess(undefined, input);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('reassign_project_lead', {
      p_project_id: 'project-1',
      p_expected_designer_id: 'designer-old',
      p_new_designer_id: 'designer-new',
    });
    expect(from).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['project-permissions', 'project-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['document-state'],
    });
  });
});
