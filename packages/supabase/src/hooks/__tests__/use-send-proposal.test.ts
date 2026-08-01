import { beforeEach, describe, expect, it, vi } from 'vitest';

type Milestone = {
  id: string;
  label: string;
  percentage: number;
  amount_cents: number;
  trigger_condition: string | null;
  sort_order: number;
};

const rpc = vi.fn();
const invoke = vi.fn();
const from = vi.fn();
const invalidateQueries = vi.fn();
const supabaseClient = { from, rpc, functions: { invoke } };

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import {
  useProposalSendDispatchStatus,
  useRetryProposalSend,
  useSendProposal,
} from '../use-proposals';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MutationConfig = any;

let proposalReads: Array<{
  data: { total_amount: number } | null;
  error: unknown;
}>;
let milestoneReads: Array<{ data: Milestone[] | null; error: unknown }>;
let reconciliationResult: { data: { id: string } | null; error: unknown };
const reconciliations: Array<{
  values: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}> = [];
const expectedSnapshot = {
  proposalUpdatedAt: '2026-07-31T12:00:00.000Z',
  proposalTotalAmount: 1_320_000,
  scheduleFingerprint: 'schedule-fingerprint-v1',
};
let snapshotReads: Array<{ data: unknown; error: unknown }>;
let sendRpcResult: { data: unknown; error: unknown };

function snapshotResult(snapshot = expectedSnapshot): {
  data: unknown;
  error: unknown;
} {
  return {
    data: [
      {
        proposal_updated_at: snapshot.proposalUpdatedAt,
        proposal_total_amount: snapshot.proposalTotalAmount,
        schedule_fingerprint: snapshot.scheduleFingerprint,
      },
    ],
    error: null,
  };
}

function proposalQuery() {
  const query: {
    select: () => typeof query;
    eq: () => typeof query;
    single: () => Promise<{
      data: { total_amount: number } | null;
      error: unknown;
    }>;
  } = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(
      async () =>
        proposalReads.shift() ?? {
          data: { total_amount: 1_320_000 },
          error: null,
        },
    ),
  };
  return query;
}

function milestoneQuery() {
  let mode: 'select' | 'update' = 'select';
  let values: Record<string, unknown> = {};
  const filters: Array<[string, unknown]> = [];
  const query: {
    select: () => typeof query;
    update: (nextValues: Record<string, unknown>) => typeof query;
    eq: (field: string, value: unknown) => typeof query;
    order: () => Promise<{ data: Milestone[] | null; error: unknown }>;
    maybeSingle: () => Promise<{
      data: { id: string } | null;
      error: unknown;
    }>;
  } = {
    select: vi.fn(() => query),
    update: vi.fn((nextValues: Record<string, unknown>) => {
      mode = 'update';
      values = nextValues;
      return query;
    }),
    eq: vi.fn((field: string, value: unknown) => {
      filters.push([field, value]);
      return query;
    }),
    order: vi.fn(
      async () => milestoneReads.shift() ?? { data: [], error: null },
    ),
    maybeSingle: vi.fn(async () => {
      if (mode === 'update') reconciliations.push({ values, filters });
      return reconciliationResult;
    }),
  };
  return query;
}

beforeEach(() => {
  proposalReads = [];
  milestoneReads = [];
  snapshotReads = [];
  sendRpcResult = {
    data: {
      id: 'proposal-1',
      sent_at: '2026-07-31T12:01:00.000Z',
      proposal_send_dispatch_id: 'dispatch-1',
    },
    error: null,
  };
  reconciliationResult = { data: { id: 'deposit' }, error: null };
  reconciliations.length = 0;
  from.mockReset();
  from.mockImplementation((table: string) =>
    table === 'proposals' ? proposalQuery() : milestoneQuery(),
  );
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) =>
    name === 'get_proposal_send_snapshot'
      ? (snapshotReads.shift() ?? snapshotResult())
      : sendRpcResult,
  );
  invoke.mockReset();
  invoke.mockResolvedValue({
    data: { delivery_state: 'delivered', retryable: false },
    error: null,
  });
  invalidateQueries.mockReset();
  invalidateQueries.mockResolvedValue(undefined);
});

function config(): MutationConfig {
  return useSendProposal({ errorSurface: 'inline' }) as MutationConfig;
}

function retryConfig(): MutationConfig {
  return useRetryProposalSend({ errorSurface: 'inline' }) as MutationConfig;
}

function deliveryStatusConfig(): MutationConfig {
  return useProposalSendDispatchStatus({
    proposalId: 'proposal-1',
    dispatchId: 'dispatch-1',
    sentAt: '2026-07-31T12:01:00.000Z',
  }) as MutationConfig;
}

describe('useSendProposal payment preflight', () => {
  it('invalidates the editor, mirror, and drafting reads after send', async () => {
    await config().onSuccess({}, { proposalId: 'proposal-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['proposal-payment-milestones', 'proposal-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['proposal-mirror', 'proposal-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['drafting-facets', 'proposal-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['proposal-send-dispatch-status', 'proposal-1'],
    });
  });

  it('fails closed before the RPC for a zero-dollar schedule', async () => {
    proposalReads.push({ data: { total_amount: 1_320_000 }, error: null });
    milestoneReads.push({
      data: [
        {
          id: 'milestone-1',
          label: 'New Milestone',
          percentage: 0,
          amount_cents: 0,
          trigger_condition: null,
          sort_order: 0,
        },
      ],
      error: null,
    });

    await expect(
      config().mutationFn({
        proposalId: 'proposal-1',
        expectedSnapshot,
      }),
    ).rejects.toThrow('must total 100%');
    expect(rpc).not.toHaveBeenCalledWith('send_proposal', expect.anything());
    expect(invoke).not.toHaveBeenCalled();
  });

  it('CAS-reconciles a stale amount, verifies it, then sends', async () => {
    proposalReads.push(
      { data: { total_amount: 1_320_000 }, error: null },
      { data: { total_amount: 1_320_000 }, error: null },
    );
    milestoneReads.push(
      {
        data: [
          {
            id: 'deposit',
            label: 'Project deposit',
            percentage: 100,
            amount_cents: 320_000,
            trigger_condition: null,
            sort_order: 0,
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'deposit',
            label: 'Project deposit',
            percentage: 100,
            amount_cents: 1_320_000,
            trigger_condition: null,
            sort_order: 0,
          },
        ],
        error: null,
      },
    );

    await expect(
      config().mutationFn({
        proposalId: 'proposal-1',
        expectedSnapshot,
      }),
    ).resolves.toMatchObject({ id: 'proposal-1', _emailDispatched: true });

    expect(reconciliations).toEqual([
      {
        values: { amount_cents: 1_320_000 },
        filters: [
          ['id', 'deposit'],
          ['percentage', 100],
          ['amount_cents', 320_000],
        ],
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('send_proposal', {
      p_proposal_id: 'proposal-1',
      p_expected_updated_at: expectedSnapshot.proposalUpdatedAt,
      p_expected_total_amount: expectedSnapshot.proposalTotalAmount,
      p_expected_schedule_fingerprint: expectedSnapshot.scheduleFingerprint,
      p_personal_message: null,
      p_cc_email: null,
      p_valid_until: null,
    });
    expect(invoke).toHaveBeenCalledWith('proposal-send', {
      body: {
        proposalId: 'proposal-1',
        sentAt: '2026-07-31T12:01:00.000Z',
        dispatchId: 'dispatch-1',
      },
    });
  });

  it('consumes the edge body and never maps pending or suppressed as success', async () => {
    const valid = {
      id: 'deposit',
      label: 'Project deposit',
      percentage: 100,
      amount_cents: 1_320_000,
      trigger_condition: null,
      sort_order: 0,
    };

    for (const deliveryState of ['pending', 'suppressed'] as const) {
      proposalReads.push(
        { data: { total_amount: 1_320_000 }, error: null },
        { data: { total_amount: 1_320_000 }, error: null },
      );
      milestoneReads.push(
        { data: [valid], error: null },
        { data: [valid], error: null },
      );
      invoke.mockResolvedValueOnce({
        data: {
          delivery_state: deliveryState,
          retryable: deliveryState === 'pending',
        },
        error: null,
      });

      await expect(
        config().mutationFn({ proposalId: 'proposal-1', expectedSnapshot }),
      ).resolves.toMatchObject({
        _emailDispatched: false,
        _emailDeliveryState: deliveryState,
        _emailRetryable: deliveryState === 'pending',
      });
    }
  });

  it('returns a retryable pending outbox when edge invocation never starts', async () => {
    const valid = {
      id: 'deposit',
      label: 'Project deposit',
      percentage: 100,
      amount_cents: 1_320_000,
      trigger_condition: null,
      sort_order: 0,
    };
    proposalReads.push(
      { data: { total_amount: 1_320_000 }, error: null },
      { data: { total_amount: 1_320_000 }, error: null },
    );
    milestoneReads.push(
      { data: [valid], error: null },
      { data: [valid], error: null },
    );
    invoke.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(
      config().mutationFn({ proposalId: 'proposal-1', expectedSnapshot }),
    ).resolves.toMatchObject({
      _emailDispatched: false,
      _emailDeliveryState: 'pending',
      _emailRetryable: true,
      proposal_send_dispatch_id: 'dispatch-1',
    });
  });

  it('retries the exact outbox tuple without rerunning the business send RPC', async () => {
    invoke.mockResolvedValueOnce({
      data: { delivery_state: 'delivered', retryable: false },
      error: null,
    });

    await expect(
      retryConfig().mutationFn({
        proposalId: 'proposal-1',
        sentAt: '2026-07-31T12:01:00.000Z',
        dispatchId: 'dispatch-1',
      }),
    ).resolves.toMatchObject({
      _emailDispatched: true,
      _emailDeliveryState: 'delivered',
    });
    expect(invoke).toHaveBeenCalledWith('proposal-send', {
      body: {
        proposalId: 'proposal-1',
        sentAt: '2026-07-31T12:01:00.000Z',
        dispatchId: 'dispatch-1',
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not invoke proposal-send without the exact committed sent_at', async () => {
    const valid = {
      id: 'deposit',
      label: 'Project deposit',
      percentage: 100,
      amount_cents: 1_320_000,
      trigger_condition: null,
      sort_order: 0,
    };
    proposalReads.push(
      { data: { total_amount: 1_320_000 }, error: null },
      { data: { total_amount: 1_320_000 }, error: null },
    );
    milestoneReads.push(
      { data: [valid], error: null },
      { data: [valid], error: null },
    );
    sendRpcResult = {
      data: {
        id: 'proposal-1',
        sent_at: null,
        proposal_send_dispatch_id: 'dispatch-1',
      },
      error: null,
    };

    await expect(
      config().mutationFn({ proposalId: 'proposal-1', expectedSnapshot }),
    ).resolves.toMatchObject({ _emailDispatched: false });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('does not overwrite a concurrent edit when reconciliation loses its CAS', async () => {
    proposalReads.push({ data: { total_amount: 1_320_000 }, error: null });
    milestoneReads.push({
      data: [
        {
          id: 'deposit',
          label: 'Project deposit',
          percentage: 100,
          amount_cents: 320_000,
          trigger_condition: null,
          sort_order: 0,
        },
      ],
      error: null,
    });
    reconciliationResult = { data: null, error: null };

    await expect(
      config().mutationFn({
        proposalId: 'proposal-1',
        expectedSnapshot,
      }),
    ).rejects.toThrow('changed while it was being checked');
    expect(rpc).not.toHaveBeenCalledWith('send_proposal', expect.anything());
  });

  it('CAS-compares the original row when only a later milestone is stale', async () => {
    const first = {
      id: 'first',
      label: 'Deposit',
      percentage: 50,
      amount_cents: 660_000,
      trigger_condition: null,
      sort_order: 0,
    };
    const staleSecond = {
      id: 'second',
      label: 'Completion',
      percentage: 50,
      amount_cents: 160_000,
      trigger_condition: null,
      sort_order: 1,
    };
    proposalReads.push(
      { data: { total_amount: 1_320_000 }, error: null },
      { data: { total_amount: 1_320_000 }, error: null },
    );
    milestoneReads.push(
      { data: [first, staleSecond], error: null },
      {
        data: [first, { ...staleSecond, amount_cents: 660_000 }],
        error: null,
      },
    );
    reconciliationResult = { data: { id: 'second' }, error: null };

    await config().mutationFn({
      proposalId: 'proposal-1',
      expectedSnapshot,
    });

    expect(reconciliations).toEqual([
      {
        values: { amount_cents: 660_000 },
        filters: [
          ['id', 'second'],
          ['percentage', 50],
          ['amount_cents', 160_000],
        ],
      },
    ]);
  });

  it('fails closed when the final reread no longer matches', async () => {
    proposalReads.push(
      { data: { total_amount: 1_320_000 }, error: null },
      { data: { total_amount: 1_320_000 }, error: null },
    );
    milestoneReads.push(
      {
        data: [
          {
            id: 'deposit',
            label: 'Project deposit',
            percentage: 100,
            amount_cents: 1_320_000,
            trigger_condition: null,
            sort_order: 0,
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'deposit',
            label: 'Project deposit',
            percentage: 50,
            amount_cents: 660_000,
            trigger_condition: null,
            sort_order: 0,
          },
        ],
        error: null,
      },
    );

    await expect(
      config().mutationFn({
        proposalId: 'proposal-1',
        expectedSnapshot,
      }),
    ).rejects.toThrow('changed since it was reviewed');
    expect(rpc).not.toHaveBeenCalledWith('send_proposal', expect.anything());
  });

  it('rejects a valid concurrent schedule edit before calling the send RPC', async () => {
    const reviewed = {
      id: 'deposit',
      label: 'Project deposit',
      percentage: 100,
      amount_cents: 1_320_000,
      trigger_condition: 'Upon contract signing',
      sort_order: 0,
    };
    proposalReads.push(
      { data: { total_amount: 1_320_000 }, error: null },
      { data: { total_amount: 1_320_000 }, error: null },
    );
    milestoneReads.push(
      { data: [reviewed], error: null },
      {
        data: [
          {
            ...reviewed,
            label: 'Non-refundable project deposit',
          },
        ],
        error: null,
      },
    );

    await expect(
      config().mutationFn({
        proposalId: 'proposal-1',
        expectedSnapshot,
      }),
    ).rejects.toThrow('changed since it was reviewed');
    expect(rpc).not.toHaveBeenCalledWith('send_proposal', expect.anything());
  });

  it('rejects when the authoritative snapshot changes before the send RPC', async () => {
    const valid = {
      id: 'deposit',
      label: 'Project deposit',
      percentage: 100,
      amount_cents: 1_320_000,
      trigger_condition: null,
      sort_order: 0,
    };
    proposalReads.push(
      { data: { total_amount: 1_320_000 }, error: null },
      { data: { total_amount: 1_320_000 }, error: null },
    );
    milestoneReads.push(
      { data: [valid], error: null },
      { data: [valid], error: null },
    );
    snapshotReads.push(
      snapshotResult(),
      snapshotResult({
        ...expectedSnapshot,
        scheduleFingerprint: 'schedule-fingerprint-v2',
      }),
    );

    await expect(
      config().mutationFn({
        proposalId: 'proposal-1',
        expectedSnapshot,
      }),
    ).rejects.toThrow('changed since it was reviewed');
    expect(rpc).not.toHaveBeenCalledWith('send_proposal', expect.anything());
  });

  it('preserves the authoritative locked-snapshot mismatch for the inline send sheet', async () => {
    const valid = {
      id: 'deposit',
      label: 'Project deposit',
      percentage: 100,
      amount_cents: 1_320_000,
      trigger_condition: null,
      sort_order: 0,
    };
    proposalReads.push(
      { data: { total_amount: 1_320_000 }, error: null },
      { data: { total_amount: 1_320_000 }, error: null },
    );
    milestoneReads.push(
      { data: [valid], error: null },
      { data: [valid], error: null },
    );
    sendRpcResult = {
      data: null,
      error: new Error(
        'proposal changed after send review; refresh and review again',
      ),
    };

    await expect(
      config().mutationFn({
        proposalId: 'proposal-1',
        expectedSnapshot,
      }),
    ).rejects.toThrow(
      'proposal changed after send review; refresh and review again',
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reads and preserves the exact durable terminal delivery status', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        delivery_state: 'unconfirmed',
        attempt_count: 3,
        retryable: false,
        retry_exhausted: true,
        last_error: 'provider response was not confirmed',
      },
      error: null,
    });

    await expect(deliveryStatusConfig().queryFn()).resolves.toEqual({
      dispatchId: 'dispatch-1',
      proposalId: 'proposal-1',
      sentAt: '2026-07-31T12:01:00.000Z',
      state: 'unconfirmed',
      attemptCount: 3,
      retryable: false,
      detail: 'provider response was not confirmed',
    });
    expect(rpc).toHaveBeenCalledWith('get_proposal_send_dispatch_status', {
      p_proposal_id: 'proposal-1',
      p_dispatch_id: 'dispatch-1',
      p_sent_at: '2026-07-31T12:01:00.000Z',
    });
  });

  it('fails closed when the durable delivery status payload is malformed', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        delivery_state: 'mystery',
        attempt_count: 1,
        retryable: true,
      },
      error: null,
    });

    await expect(deliveryStatusConfig().queryFn()).rejects.toThrow(
      'delivery status could not be verified',
    );
  });
});
