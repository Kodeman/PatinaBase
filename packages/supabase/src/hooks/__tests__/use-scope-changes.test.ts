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
  useAcceptClientScopeChangeRequest,
  useApplyScopeChange,
  useApproveScopeChange,
  useCancelClientScopeChangeRequest,
  useCreateClientScopeChangeRequest,
  useDeclineScopeChange,
  useSendScopeChangeRequest,
  type ClientScopeChangeRequestReceipt,
} from '../use-scope-changes';

type CreateMutationConfig = {
  mutationFn: (input: {
    projectId: string;
    idempotencyKey: string;
    title: string;
    description: string;
  }) => Promise<ClientScopeChangeRequestReceipt>;
  onSuccess: (
    result: ClientScopeChangeRequestReceipt,
    variables: {
      projectId: string;
      idempotencyKey: string;
      title: string;
      description: string;
    },
  ) => void;
};

type MutationConfig<TInput, TResult = unknown> = {
  mutationFn: (input: TInput) => Promise<TResult>;
  onSuccess: (result: TResult, variables: TInput) => void;
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

    const mutation = useCreateClientScopeChangeRequest() as unknown as CreateMutationConfig;
    await expect(
      mutation.mutationFn({
        projectId: 'project-1',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        title: 'Add a lamp',
        description: 'One reading lamp beside the chair.',
      }),
    ).resolves.toEqual(receipt);

    expect(rpc).toHaveBeenCalledWith('create_client_scope_change_request', {
      p_project_id: 'project-1',
      p_idempotency_key: '11111111-1111-4111-8111-111111111111',
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

    const mutation = useCreateClientScopeChangeRequest() as unknown as CreateMutationConfig;

    await expect(
      mutation.mutationFn({
        projectId: 'project-closed',
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
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

    const mutation = useCreateClientScopeChangeRequest() as unknown as CreateMutationConfig;

    await expect(
      mutation.mutationFn({
        projectId: 'project-1',
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
        title: 'Add a lamp',
        description: 'One reading lamp.',
      }),
    ).rejects.toThrow(/malformed receipt/);
  });

  it('invalidates both the request list and designer activity after success', () => {
    const mutation = useCreateClientScopeChangeRequest() as unknown as CreateMutationConfig;
    const variables = {
      projectId: 'project-1',
      idempotencyKey: '44444444-4444-4444-8444-444444444444',
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

  it('routes every workflow transition through its checked RPC', async () => {
    rpc.mockResolvedValue({ data: { status: 'ok' }, error: null });

    const send = useSendScopeChangeRequest() as unknown as MutationConfig<{
      requestId: string;
      projectId: string;
    }>;
    await send.mutationFn({ requestId: 'request-1', projectId: 'project-1' });
    expect(rpc).toHaveBeenLastCalledWith('send_scope_change_request', {
      p_request_id: 'request-1',
      p_project_id: 'project-1',
    });

    const approve = useApproveScopeChange() as unknown as MutationConfig<{
      requestId: string;
      projectId: string;
      approvedByName: string;
      approvedIp?: string;
    }>;
    await approve.mutationFn({
      requestId: 'request-2',
      projectId: 'project-1',
      approvedByName: '  Client Name  ',
      approvedIp: '203.0.113.1',
    });
    expect(rpc).toHaveBeenLastCalledWith('approve_scope_change_request', {
      p_request_id: 'request-2',
      p_project_id: 'project-1',
      p_approved_by_name: '  Client Name  ',
      p_approved_ip: '203.0.113.1',
    });

    const acceptClientRequest = useAcceptClientScopeChangeRequest() as unknown as MutationConfig<{
      requestId: string;
      projectId: string;
    }>;
    await acceptClientRequest.mutationFn({
      requestId: 'request-client',
      projectId: 'project-1',
    });
    expect(rpc).toHaveBeenLastCalledWith('accept_client_scope_change_request', {
      p_request_id: 'request-client',
      p_project_id: 'project-1',
    });

    const decline = useDeclineScopeChange() as unknown as MutationConfig<{
      requestId: string;
      projectId: string;
      declineReason?: string;
    }>;
    await decline.mutationFn({
      requestId: 'request-3',
      projectId: 'project-1',
      declineReason: 'Not in scope',
    });
    expect(rpc).toHaveBeenLastCalledWith('decline_scope_change_request', {
      p_request_id: 'request-3',
      p_project_id: 'project-1',
      p_decline_reason: 'Not in scope',
    });

    const cancel = useCancelClientScopeChangeRequest() as unknown as MutationConfig<{
      requestId: string;
      projectId: string;
    }>;
    await cancel.mutationFn({ requestId: 'request-4', projectId: 'project-1' });
    expect(rpc).toHaveBeenLastCalledWith('cancel_scope_change_request', {
      p_request_id: 'request-4',
      p_project_id: 'project-1',
    });

    const apply = useApplyScopeChange() as unknown as MutationConfig<
      { requestId: string; projectId: string },
      { requestId: string; projectId: string }
    >;
    await expect(
      apply.mutationFn({ requestId: 'request-5', projectId: 'project-1' }),
    ).resolves.toEqual({ requestId: 'request-5', projectId: 'project-1' });
    expect(rpc).toHaveBeenLastCalledWith('apply_scope_change', {
      p_request_id: 'request-5',
    });
  });
});
