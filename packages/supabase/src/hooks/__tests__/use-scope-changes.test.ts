import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invalidateQueries = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ rpc }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import {
  COMPLETED_PROJECT_SCOPE_CHANGE_ERROR,
  useCreateClientScopeChangeRequest,
  type ClientScopeChangeRequestReceipt,
} from '../use-scope-changes';

type MutationConfig = {
  mutationFn: (input: {
    projectId: string;
    title: string;
    description: string;
  }) => Promise<ClientScopeChangeRequestReceipt>;
  onSuccess: (
    result: ClientScopeChangeRequestReceipt,
    variables: { projectId: string; title: string; description: string },
  ) => void;
};

describe('useCreateClientScopeChangeRequest', () => {
  beforeEach(() => {
    rpc.mockReset();
    invalidateQueries.mockReset();
  });

  it('creates through the 00395 authority RPC and accepts only its narrow receipt', async () => {
    const receipt: ClientScopeChangeRequestReceipt = {
      id: 'change-1',
      project_id: 'project-1',
      status: 'sent',
      sent_at: '2026-08-01T12:00:00.000Z',
    };
    rpc.mockResolvedValue({ data: receipt, error: null });

    const mutation = useCreateClientScopeChangeRequest() as unknown as MutationConfig;
    await expect(
      mutation.mutationFn({
        projectId: 'project-1',
        title: 'Add a lamp',
        description: 'One reading lamp beside the chair.',
      }),
    ).resolves.toEqual(receipt);

    expect(rpc).toHaveBeenCalledWith('create_client_scope_change_request', {
      p_project_id: 'project-1',
      p_title: 'Add a lamp',
      p_description: 'One reading lamp beside the chair.',
    });
  });

  it('maps the stable completed-project RPC slug to calm client copy', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: '23514',
        message: 'create_client_scope_change_request: completed_project',
      },
    });

    const mutation = useCreateClientScopeChangeRequest() as unknown as MutationConfig;

    await expect(
      mutation.mutationFn({
        projectId: 'project-closed',
        title: 'Late request',
        description: 'This project is already complete.',
      }),
    ).rejects.toThrow(COMPLETED_PROJECT_SCOPE_CHANGE_ERROR);
  });

  it('rejects expanded or malformed receipts instead of trusting arbitrary RPC JSON', async () => {
    rpc.mockResolvedValue({
      data: {
        id: 'change-1',
        project_id: 'project-1',
        status: 'sent',
        sent_at: '2026-08-01T12:00:00.000Z',
        requested_by: 'must-not-leak',
      },
      error: null,
    });

    const mutation = useCreateClientScopeChangeRequest() as unknown as MutationConfig;

    await expect(
      mutation.mutationFn({
        projectId: 'project-1',
        title: 'Add a lamp',
        description: 'One reading lamp.',
      }),
    ).rejects.toThrow(/malformed receipt/);
  });

  it('invalidates both the request list and designer activity after success', () => {
    const mutation = useCreateClientScopeChangeRequest() as unknown as MutationConfig;
    const variables = {
      projectId: 'project-1',
      title: 'Add a lamp',
      description: 'One reading lamp.',
    };
    mutation.onSuccess(
      {
        id: 'change-1',
        project_id: 'project-1',
        status: 'sent',
        sent_at: '2026-08-01T12:00:00.000Z',
      },
      variables,
    );

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['scope-changes', 'project-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['project-activity-from-log', 'project-1'],
    });
  });
});
