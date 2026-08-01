import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  makeDecision,
  resetDecisionFactoryCounter,
} from '../../test-utils/factories/decision';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────
//
// The hooks are tightly coupled to:
//   1) `createBrowserClient` from `@supabase/ssr` (chained query builder + RPC + auth)
//   2) `useMutation`/`useQuery`/`useQueryClient` from `@tanstack/react-query`
//
// We can't render the hooks (no jsdom, no @testing-library/react), so we
// intercept React Query at module boundary: each `useMutation`/`useQuery` call
// returns the config object verbatim, exposing `mutationFn`/`queryFn` for
// direct invocation. This lets us test hook *behavior* without React.
// ─────────────────────────────────────────────────────────────────────────────

// Builder — every chain method returns `this` and ultimately resolves to a
// `{ data, error }` shape that each test seeds via `setBuilderResult`.
type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  // chainable calls (recorded in `chain`) — typed as `any` to side-step
  // vitest's `Mock<any[], unknown>` declaration which doesn't accept the
  // narrower `Mock<unknown[], MockBuilder>` produced by our `record()` helper.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  select: any;
  insert: any;
  update: any;
  delete: any;
  eq: any;
  neq: any;
  in: any;
  is: any;
  lt: any;
  ilike: any;
  order: any;
  // terminal calls — return Promise of result
  single: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  // thenable so awaiting the chain itself resolves to result
  then: (resolve: (value: BuilderResult) => unknown) => Promise<unknown>;
  __chain: Array<{ method: string; args: unknown[] }>;
  __result: BuilderResult;
}

function makeBuilder(initial: BuilderResult = { data: null, error: null }): MockBuilder {
  const builder = {
    __chain: [] as Array<{ method: string; args: unknown[] }>,
    __result: initial,
  } as MockBuilder;

  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      builder.__chain.push({ method, args });
      return builder;
    });

  builder.select = record('select');
  builder.insert = record('insert');
  builder.update = record('update');
  builder.delete = record('delete');
  builder.eq = record('eq');
  builder.neq = record('neq');
  builder.in = record('in');
  builder.is = record('is');
  builder.lt = record('lt');
  builder.ilike = record('ilike');
  builder.order = record('order');

  builder.single = vi.fn(() => {
    builder.__chain.push({ method: 'single', args: [] });
    return Promise.resolve(builder.__result);
  });

  builder.then = (resolve) => Promise.resolve(builder.__result).then(resolve);

  return builder;
}

// Per-table builder registry — each `from('table')` call returns the registered
// builder for that table (or a fresh one if unset).
const builders: Record<string, MockBuilder> = {};

function setTableResult(table: string, result: BuilderResult): MockBuilder {
  const b = makeBuilder(result);
  builders[table] = b;
  return b;
}

// Realtime channel stub — `.channel().on().on().on().subscribe()` chain.
// `on` returns the channel so it's infinitely chainable; `subscribe` returns it
// too. `removeChannel` is a spy we assert the cleanup calls.
const channelOn = vi.fn();
const channelSubscribe = vi.fn();
const fakeChannel: Record<string, unknown> = {};
fakeChannel.on = vi.fn((..._args: unknown[]) => {
  channelOn(..._args);
  return fakeChannel;
});
fakeChannel.subscribe = vi.fn(() => {
  channelSubscribe();
  return fakeChannel;
});
const channelFactory = vi.fn(() => fakeChannel);
const removeChannel = vi.fn();

const supabaseClient = {
  auth: {
    getUser: vi.fn(),
    getSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    }),
  },
  from: vi.fn((table: string) => {
    if (!builders[table]) builders[table] = makeBuilder();
    return builders[table];
  }),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  channel: channelFactory,
  removeChannel,
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

// React Query stub — capture configs so tests can invoke `queryFn`/`mutationFn`
// directly. `useQueryClient` returns an invalidate spy we don't care about.
const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

// React stub — only `useEffect` is exercised (by useDecisionRealtime). Run the
// effect synchronously and stash its cleanup so tests can invoke it.
let lastEffectCleanup: (() => void) | void;
vi.mock('react', () => ({
  useEffect: (fn: () => (() => void) | void) => {
    lastEffectCleanup = fn();
  },
}));

// Import AFTER mocks are wired up.
import {
  useDecisionMetrics,
  useCreateDecision,
  useUpdateDecision,
  useExtendAndReopenDecision,
  useDeleteDecision,
  usePublishDraftDecision,
  useDecisionRealtime,
  useUpdateDecisionStatus,
  isValidDecisionTransition,
  useSelectDecisionOption,
  useApplyDecisionOverride,
  useMarkDecisionViewed,
  useAllDecisions,
} from '../use-decisions';

// Helper to find a recorded chain call.
function callsTo(builder: MockBuilder, method: string) {
  return builder.__chain.filter((c) => c.method === method);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetDecisionFactoryCounter();
  // Wipe builders + mock state.
  for (const k of Object.keys(builders)) delete builders[k];
  supabaseClient.auth.getUser.mockReset();
  // Default: authenticated test user. `useDecisionMetrics` and several other
  // hooks call `auth.getUser()` to hydrate the session before SELECTs; tests
  // that specifically exercise the "no user" branch override this with their
  // own `mockResolvedValue({ data: { user: null } })`.
  supabaseClient.auth.getUser.mockResolvedValue({
    data: { user: { id: 'test-user' } },
    error: null,
  });
  supabaseClient.from.mockClear();
  supabaseClient.rpc.mockReset();
  supabaseClient.rpc.mockResolvedValue({ data: null, error: null });
  invalidateQueries.mockReset();
  channelFactory.mockClear();
  channelOn.mockClear();
  channelSubscribe.mockClear();
  removeChannel.mockClear();
  lastEffectCleanup = undefined;
});

describe('useDecisionMetrics', () => {
  it('computes open, overdue, avg response days, on-time-rate, and total', async () => {
    const now = new Date('2026-04-28T00:00:00Z');
    vi.setSystemTime(now);

    // 1 draft (excluded by `.neq('status', 'draft')` — should never appear)
    // 2 pending (one overdue)
    // 2 responded (one on-time, one late)
    const decisions = [
      makeDecision({ status: 'pending', due_date: '2026-04-30T00:00:00Z' }), // open, not overdue
      makeDecision({
        status: 'pending',
        due_date: '2026-04-20T00:00:00Z', // overdue (past now)
      }),
      makeDecision({
        status: 'responded',
        sent_at: '2026-04-01T00:00:00Z',
        responded_at: '2026-04-04T00:00:00Z', // 3 days
        due_date: '2026-04-05T00:00:00Z', // on time
      }),
      makeDecision({
        status: 'responded',
        sent_at: '2026-04-10T00:00:00Z',
        responded_at: '2026-04-25T00:00:00Z', // 15 days, but past due_date
        due_date: '2026-04-15T00:00:00Z', // late
      }),
    ];

    setTableResult('client_decisions', { data: decisions, error: null });

    const config = useDecisionMetrics() as unknown as { queryFn: () => Promise<unknown> };
    const result = await config.queryFn();

    expect(result).toEqual({
      open: 2,
      overdue: 1,
      // avg of (3 days, 15 days) = 9 days, rounded to 1 decimal
      avgResponseDays: 9,
      // 1 of 2 with due_date was on-time = 50%
      onTimeRate: 50,
      total: 4,
    });

    // Asserts query shape: filter excludes drafts.
    const builder = builders['client_decisions'];
    expect(callsTo(builder, 'neq')).toHaveLength(1);
    expect(callsTo(builder, 'neq')[0].args).toEqual(['status', 'draft']);

    vi.useRealTimers();
  });

  it('returns 100% on-time-rate and 0 avg when no responded decisions exist', async () => {
    setTableResult('client_decisions', { data: [], error: null });
    const config = useDecisionMetrics() as unknown as { queryFn: () => Promise<unknown> };
    const result = await config.queryFn();
    expect(result).toEqual({
      open: 0,
      overdue: 0,
      avgResponseDays: 0,
      onTimeRate: 100,
      total: 0,
    });
  });
});

describe('useCreateDecision', () => {
  it('creates the row, options, dependencies, and first notice through one RPC', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: { id: 'dec-1', designer_client_id: 'dc-1', project_id: 'proj-1' },
      error: null,
    });

    const config = useCreateDecision() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await config.mutationFn({
      decisionId: 'dec-1',
      designerClientId: 'dc-1',
      projectId: 'proj-1',
      title: 'Pick a sofa',
      blockedFfeItemIds: ['ffe-1'],
      blockedTaskIds: ['task-1'],
      options: [{ name: 'Velvet', productId: 'prod-7' }],
    });

    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseClient.rpc).toHaveBeenCalledWith('create_client_decision', {
      p_decision_id: 'dec-1',
      p_payload: expect.objectContaining({
        designer_client_id: 'dc-1',
        project_id: 'proj-1',
        title: 'Pick a sofa',
        decision_type: 'product',
        blocking_status: 'non_blocking',
        status: 'pending',
      }),
      p_options: [expect.objectContaining({
        name: 'Velvet',
        product_id: 'prod-7',
        sort_order: 0,
      })],
      p_blocked_ffe_item_ids: ['ffe-1'],
      p_blocked_task_ids: ['task-1'],
    });
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });

  it('keeps an explicitly reused idempotency key bound to the same payload', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: { id: 'dec-2', designer_client_id: 'dc-1', project_id: null },
      error: null,
    });

    const config = useCreateDecision() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    const input = {
      decisionId: 'dec-2',
      designerClientId: 'dc-1',
      title: 'Draft decision',
      status: 'draft' as const,
      options: [],
    };
    await config.mutationFn(input);
    await config.mutationFn(input);

    expect(supabaseClient.rpc).toHaveBeenCalledTimes(2);
    expect(supabaseClient.rpc.mock.calls[1]).toEqual(supabaseClient.rpc.mock.calls[0]);
    const payload = supabaseClient.rpc.mock.calls[0][1] as {
      p_payload: Record<string, unknown>;
    };
    expect(payload.p_payload.status).toBe('draft');
    expect(payload.p_payload).not.toHaveProperty('sent_at');
  });

  it('surfaces an atomic create failure without fallback writes', async () => {
    const createError = { code: '23514', message: 'invalid decision' };
    supabaseClient.rpc.mockResolvedValueOnce({ data: null, error: createError });
    const config = useCreateDecision() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await expect(config.mutationFn({
      decisionId: 'dec-9',
      designerClientId: 'dc-1',
      title: 'Pick a sofa',
      options: [],
    })).rejects.toBe(createError);
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });
});

describe('useSelectDecisionOption', () => {
  it('submits selection, note, quantity, and consent in one checked RPC', async () => {
    const config = useSelectDecisionOption() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await config.mutationFn({
      optionId: 'opt-7',
      decisionId: 'dec-1',
      clientNote: 'Love it',
      quantity: 3,
      consent: {
        method: 'electronic_signature',
        signature: 'Client Name',
      },
    });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('apply_client_decision', {
      p_decision_id: 'dec-1',
      p_selected_option_id: 'opt-7',
      p_client_consent_method: 'electronic_signature',
      p_client_signature: 'Client Name',
      p_client_note: 'Love it',
      p_quantity: 3,
    });
    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseClient.from).not.toHaveBeenCalledWith('client_decision_options');
  });
});

describe('useApplyDecisionOverride', () => {
  it('records evidence and resolves through one checked RPC', async () => {
    const config = useApplyDecisionOverride() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await config.mutationFn({
      decisionId: 'dec-1',
      optionId: 'opt-7',
      consentMethod: 'verbal',
      consentEvidence: 'Client confirmed by phone 2026-04-28',
    });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('apply_decision_override', {
      p_decision_id: 'dec-1',
      p_selected_option_id: 'opt-7',
      p_consent_method: 'verbal',
      p_consent_evidence: 'Client confirmed by phone 2026-04-28',
    });
    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseClient.from).not.toHaveBeenCalledWith('decision_overrides');
  });
});

describe('useMarkDecisionViewed', () => {
  it('uses the idempotent viewed RPC', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: makeDecision({ id: 'dec-1' }),
      error: null,
    });
    const config = useMarkDecisionViewed() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await expect(config.mutationFn({ decisionId: 'dec-1' })).resolves.toBeTruthy();
    expect(supabaseClient.rpc).toHaveBeenCalledWith('mark_client_decision_viewed', {
      p_decision_id: 'dec-1',
    });
  });

  it('rethrows RPC errors', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });
    const config = useMarkDecisionViewed() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await expect(
      config.mutationFn({ decisionId: 'dec-1' }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('useAllDecisions filters', () => {
  it('applies ilike on title when q filter is non-empty', async () => {
    setTableResult('client_decisions', { data: [], error: null });

    const config = useAllDecisions({ q: 'sofa' }) as unknown as { queryFn: () => Promise<unknown> };
    await config.queryFn();

    const builder = builders['client_decisions'];
    const ilikes = callsTo(builder, 'ilike');
    expect(ilikes).toHaveLength(1);
    expect(ilikes[0].args[0]).toBe('title');
    expect(ilikes[0].args[1]).toBe('%sofa%');
  });

  it('escapes % and _ in the q filter (preventing wildcard injection)', async () => {
    setTableResult('client_decisions', { data: [], error: null });
    const config = useAllDecisions({ q: '50% off_now' }) as unknown as {
      queryFn: () => Promise<unknown>;
    };
    await config.queryFn();
    const builder = builders['client_decisions'];
    const ilikes = callsTo(builder, 'ilike');
    expect(ilikes[0].args[1]).toBe('%50\\% off\\_now%');
  });

  it('skips ilike when q is whitespace-only', async () => {
    setTableResult('client_decisions', { data: [], error: null });
    const config = useAllDecisions({ q: '   ' }) as unknown as { queryFn: () => Promise<unknown> };
    await config.queryFn();
    const builder = builders['client_decisions'];
    expect(callsTo(builder, 'ilike')).toHaveLength(0);
  });

  it('applies isOverdue filter as status=pending + due_date<now', async () => {
    setTableResult('client_decisions', { data: [], error: null });
    const config = useAllDecisions({ isOverdue: true }) as unknown as {
      queryFn: () => Promise<unknown>;
    };
    await config.queryFn();
    const builder = builders['client_decisions'];
    const eqs = callsTo(builder, 'eq');
    const lts = callsTo(builder, 'lt');
    expect(eqs.some((c) => c.args[0] === 'status' && c.args[1] === 'pending')).toBe(true);
    expect(lts).toHaveLength(1);
    expect(lts[0].args[0]).toBe('due_date');
  });

  it('uses .in() when status filter is an array', async () => {
    setTableResult('client_decisions', { data: [], error: null });
    const config = useAllDecisions({ status: ['pending', 'responded'] }) as unknown as {
      queryFn: () => Promise<unknown>;
    };
    await config.queryFn();
    const builder = builders['client_decisions'];
    const ins = callsTo(builder, 'in');
    expect(ins).toHaveLength(1);
    expect(ins[0].args).toEqual(['status', ['pending', 'responded']]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PT-D-1-4 — new spine hooks
// ─────────────────────────────────────────────────────────────────────────────

describe('isValidDecisionTransition', () => {
  it('accepts the legal transitions', () => {
    expect(isValidDecisionTransition('draft', 'pending')).toBe(true);
    expect(isValidDecisionTransition('pending', 'responded')).toBe(true);
    expect(isValidDecisionTransition('pending', 'expired')).toBe(true);
    expect(isValidDecisionTransition('responded', 'pending')).toBe(true);
    expect(isValidDecisionTransition('expired', 'pending')).toBe(true);
    // no-op is always allowed
    expect(isValidDecisionTransition('pending', 'pending')).toBe(true);
  });

  it('rejects illegal transitions', () => {
    expect(isValidDecisionTransition('draft', 'responded')).toBe(false);
    expect(isValidDecisionTransition('draft', 'expired')).toBe(false);
    expect(isValidDecisionTransition('responded', 'expired')).toBe(false);
    expect(isValidDecisionTransition('expired', 'responded')).toBe(false);
  });
});

describe('useUpdateDecisionStatus transition validation', () => {
  it('throws on an illegal transition when currentStatus is provided', async () => {
    const config = useUpdateDecisionStatus() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await expect(
      config.mutationFn({
        decisionId: 'dec-1',
        status: 'responded',
        currentStatus: 'draft',
      }),
    ).rejects.toThrow(/Invalid decision status transition/);
  });

  it('routes draft publishing through its lifecycle RPC', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: { id: 'dec-1', designer_client_id: 'dc-1' },
      error: null,
    });
    const config = useUpdateDecisionStatus() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await config.mutationFn({
      decisionId: 'dec-1',
      status: 'pending',
      currentStatus: 'draft',
    });
    expect(supabaseClient.rpc).toHaveBeenCalledWith('publish_client_decision', {
      p_decision_id: 'dec-1',
    });
  });

  it('skips client-side validation when currentStatus is omitted', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: { id: 'dec-1', designer_client_id: 'dc-1' },
      error: null,
    });
    const config = useUpdateDecisionStatus() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    // No throw even for an otherwise-illegal move — DB guard is the backstop.
    await expect(
      config.mutationFn({ decisionId: 'dec-1', status: 'expired' }),
    ).resolves.toBeTruthy();
    expect(supabaseClient.rpc).toHaveBeenCalledWith('expire_client_decision', {
      p_decision_id: 'dec-1',
    });
  });
});

describe('useUpdateDecision', () => {
  it('patches only provided fields and replaces options when supplied', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: { id: 'dec-1', designer_client_id: 'dc-1', project_id: 'proj-1' },
      error: null,
    });

    const config = useUpdateDecision() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await config.mutationFn({
      decisionId: 'dec-1',
      expectedUpdatedAt: '2026-07-01T12:00:00Z',
      designerClientId: 'dc-1',
      title: 'New title',
      dueDate: '2026-07-01T00:00:00Z',
      options: [{ name: 'Option A', productId: 'prod-9' }],
    });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('update_client_decision', {
      p_decision_id: 'dec-1',
      p_patch: {
        title: 'New title',
        due_date: '2026-07-01T00:00:00Z',
      },
      p_options: [expect.objectContaining({
        name: 'Option A',
        product_id: 'prod-9',
        sort_order: 0,
      })],
      p_expected_updated_at: '2026-07-01T12:00:00Z',
    });
    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });

  it('does not delete/replace options when options is omitted', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: { id: 'dec-1', designer_client_id: 'dc-1', project_id: null },
      error: null,
    });

    const config = useUpdateDecision() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await config.mutationFn({
      decisionId: 'dec-1',
      expectedUpdatedAt: '2026-07-01T12:00:00Z',
      designerClientId: 'dc-1',
      context: 'Updated context',
    });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('update_client_decision', {
      p_decision_id: 'dec-1',
      p_patch: { context: 'Updated context' },
      p_options: null,
      p_expected_updated_at: '2026-07-01T12:00:00Z',
    });
  });

  it('surfaces an atomic update failure without a follow-up read or notice', async () => {
    const updateError = {
      code: '40001',
      message: 'decision changed since it was loaded',
    };
    supabaseClient.rpc.mockResolvedValueOnce({
      data: null,
      error: updateError,
    });
    const config = useUpdateDecision() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await expect(config.mutationFn({
      decisionId: 'dec-1',
      expectedUpdatedAt: '2026-07-01T12:00:00Z',
      designerClientId: 'dc-1',
      title: 'Edited title',
    })).rejects.toBe(updateError);
    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });
});

describe('useExtendAndReopenDecision', () => {
  it('moves the date and reopens through one CAS lifecycle RPC', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: { id: 'dec-1', designer_client_id: 'dc-1', project_id: 'proj-1' },
      error: null,
    });
    const config = useExtendAndReopenDecision() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await config.mutationFn({
      decisionId: 'dec-1',
      dueDate: '2026-08-15',
      expectedUpdatedAt: '2026-08-01T12:00:00Z',
    });
    expect(supabaseClient.rpc).toHaveBeenCalledWith('extend_and_reopen_client_decision', {
      p_decision_id: 'dec-1',
      p_due_date: '2026-08-15',
      p_expected_updated_at: '2026-08-01T12:00:00Z',
    });
    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
  });
});

describe('useDeleteDecision', () => {
  it('uses the checked draft-delete RPC and returns its cache ids', async () => {
    const config = useDeleteDecision() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    const result = await config.mutationFn({
      decisionId: 'dec-1',
      designerClientId: 'dc-1',
      projectId: 'proj-1',
    });
    expect(supabaseClient.rpc).toHaveBeenCalledWith('delete_client_decision_draft', {
      p_decision_id: 'dec-1',
    });
    expect(result).toEqual({
      decisionId: 'dec-1',
      designerClientId: 'dc-1',
      projectId: 'proj-1',
    });
  });
});

describe('usePublishDraftDecision', () => {
  it('publishes through the single notification-owning lifecycle RPC', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: { id: 'dec-1', designer_client_id: 'dc-1', project_id: null },
      error: null,
    });
    const config = usePublishDraftDecision() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await config.mutationFn({ decisionId: 'dec-1' });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('publish_client_decision', {
      p_decision_id: 'dec-1',
    });
    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
  });
});

describe('useDecisionRealtime', () => {
  it('subscribes to the three decision tables and cleans up on unmount', () => {
    useDecisionRealtime('dec-1');

    expect(channelFactory).toHaveBeenCalledWith('decision:dec-1');
    // Three postgres_changes subscriptions: decision row, options, comments.
    expect(channelOn).toHaveBeenCalledTimes(3);
    const tables = channelOn.mock.calls.map(
      (c) => (c[1] as { table: string }).table,
    );
    expect(tables).toEqual([
      'client_decisions',
      'client_decision_options',
      'decision_comments',
    ]);
    expect(channelSubscribe).toHaveBeenCalledTimes(1);

    // Effect cleanup removes the channel.
    expect(typeof lastEffectCleanup).toBe('function');
    (lastEffectCleanup as () => void)();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when decisionId is undefined', () => {
    useDecisionRealtime(undefined);
    expect(channelFactory).not.toHaveBeenCalled();
  });
});
