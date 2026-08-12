import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
//
// Mirror the use-procurement.test.ts rig: a per-table chainable builder whose
// terminal calls (.single() / await) drain a result queue, so a single hook
// performing multiple operations against the same table (e.g.
// useUpdateFFEItemPricing's quantity read followed by its UPDATE) can receive
// distinct responses per call.
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eq: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  in: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  is: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  limit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  single: any;
  then: (resolve: (value: BuilderResult) => unknown) => Promise<unknown>;
  __chain: Array<{ method: string; args: unknown[] }>;
  __resultQueue: BuilderResult[];
  __defaultResult: BuilderResult;
}

function makeBuilder(initial: BuilderResult = { data: null, error: null }): MockBuilder {
  const builder = {
    __chain: [] as Array<{ method: string; args: unknown[] }>,
    __resultQueue: [] as BuilderResult[],
    __defaultResult: initial,
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
  builder.in = record('in');
  builder.is = record('is');
  builder.order = record('order');
  builder.limit = record('limit');

  const takeResult = (): BuilderResult =>
    builder.__resultQueue.length > 0
      ? (builder.__resultQueue.shift() as BuilderResult)
      : builder.__defaultResult;

  builder.single = vi.fn(() => {
    builder.__chain.push({ method: 'single', args: [] });
    return Promise.resolve(takeResult());
  });

  builder.then = (resolve) => Promise.resolve(takeResult()).then(resolve);

  return builder;
}

const builders: Record<string, MockBuilder> = {};

function getBuilder(table: string): MockBuilder {
  if (!builders[table]) builders[table] = makeBuilder();
  return builders[table];
}

function queueTableResults(table: string, ...results: BuilderResult[]): MockBuilder {
  const b = getBuilder(table);
  b.__resultQueue.push(...results);
  return b;
}

function setTableDefault(table: string, result: BuilderResult): MockBuilder {
  const b = getBuilder(table);
  b.__defaultResult = result;
  return b;
}

const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  from: vi.fn((table: string) => getBuilder(table)),
  rpc: vi.fn(),
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

// Import AFTER mocks.
import {
  useUpdateFFEItemPricing,
  useProjectFinancials,
  useUpdateFFEItemStatus,
  useProjectFFEItems,
  useBulkReassignFfeVendor,
  useCreateProjectPhase,
  useUpdateProjectPhaseStatus,
} from '../use-project-v2';
import {
  useDeletePhaseWithRelink,
  useUpdateProjectPhaseChain,
} from '../use-schedule-compose';
import type {
  UpdateFFEItemPricingInput,
  BulkReassignFfeVendorInput,
  BulkReassignFfeVendorResult,
  CreateProjectPhaseInput,
  ProjectPhaseTransitionInput,
  ProjectPhaseTransitionReceipt,
} from '../use-project-v2';

beforeEach(() => {
  Object.keys(builders).forEach((k) => delete builders[k]);
  invalidateQueries.mockReset();
  supabaseClient.auth.getUser.mockReset();
  supabaseClient.auth.getSession.mockReset();
  supabaseClient.from.mockClear();
  supabaseClient.rpc.mockReset();
});

describe('useProjectFFEItems configuration handoff', () => {
  it('joins the frozen project spec snapshot used by RFQ and PO review', async () => {
    const builder = setTableDefault('project_ffe_items', {
      data: [],
      error: null,
    });
    const config = useProjectFFEItems('project-1') as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown[]>;
    };

    expect(config.queryKey).toEqual([
      'project-ffe-items',
      'project-1',
      undefined,
      { withLifecycle: false },
    ]);
    await config.queryFn();

    const select = builder.__chain.find((call) => call.method === 'select');
    const selection = String(select?.args[0]);
    expect(selection).toContain('spec:project_ffe_specs');
    expect(selection).toContain('configuration_snapshot');
    expect(selection).toContain('configuration_snapshot_hash');
    expect(selection).toContain('configuration_locked_at');
  });

  // R7 / WP4: the lifecycle evidence is designer-portal-only. The client
  // portal's FF&E surfaces must not pay for a second-level embed they never
  // read (and the flag is in the query key, so the two shapes cannot collide).
  it('omits the lifecycle evidence by default', async () => {
    const builder = setTableDefault('project_ffe_items', {
      data: [],
      error: null,
    });
    const config = useProjectFFEItems('project-1') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    await config.queryFn();

    const selection = String(
      builder.__chain.find((call) => call.method === 'select')?.args[0],
    );
    expect(selection).not.toContain('po_payments');
    expect(selection).not.toContain('delivered_date');
  });

  it('adds delivered_date and the payment rows only when asked', async () => {
    const builder = setTableDefault('project_ffe_items', {
      data: [],
      error: null,
    });
    const config = useProjectFFEItems('project-1', undefined, {
      withLifecycle: true,
    }) as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown[]>;
    };

    expect(config.queryKey).toEqual([
      'project-ffe-items',
      'project-1',
      undefined,
      { withLifecycle: true },
    ]);
    await config.queryFn();

    const selection = String(
      builder.__chain.find((call) => call.method === 'select')?.args[0],
    );
    expect(selection).toContain('delivered_date');
    expect(selection).toContain('payments:po_payments(');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useCreateProjectPhase — pending-only lifecycle birth
// ─────────────────────────────────────────────────────────────────────────────

type CreatePhaseMutationConfig = {
  mutationFn: (input: CreateProjectPhaseInput) => Promise<unknown>;
};

describe('useCreateProjectPhase', () => {
  it('calls the server-derived create boundary and validates pending lifecycle', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: {
        id: 'phase-new',
        project_id: 'project-1',
        status: 'pending',
        progress: 0,
        completed_at: null,
        updated_at: '2026-08-01T12:00:00.000Z',
      },
      error: null,
    });

    const config = useCreateProjectPhase() as unknown as CreatePhaseMutationConfig;
    await config.mutationFn({
      projectId: 'project-1',
      phaseKey: 'install',
      name: 'Installation',
      durationDays: 5,
    });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('create_project_phase', {
      p_project_id: 'project-1',
      p_phase_key: 'install',
      p_name: 'Installation',
      p_duration_days: 5,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateProjectPhaseChain — exact project/phase repair scope
// ─────────────────────────────────────────────────────────────────────────────

type UpdatePhaseChainMutationConfig = {
  mutationFn: (input: {
    phaseId: string;
    projectId: string;
    expectedUpdatedAt: string;
    followsPhaseId?: string | null;
    lane?: 'main' | 'thread';
  }) => Promise<unknown>;
  onSuccess: (result: unknown, variables: {
    phaseId: string;
    projectId: string;
    expectedUpdatedAt: string;
  }) => void;
};

describe('useUpdateProjectPhaseChain', () => {
  it('passes the caller-observed CAS token and exact topology patch', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: {
        id: 'phase-2',
        project_id: 'project-1',
        updated_at: '2026-08-01T12:00:01.000Z',
      },
      error: null,
    });

    const config = useUpdateProjectPhaseChain() as unknown as UpdatePhaseChainMutationConfig;
    await config.mutationFn({
      phaseId: 'phase-2',
      projectId: 'project-1',
      expectedUpdatedAt: '2026-08-01T12:00:00.000Z',
      followsPhaseId: 'phase-1',
      lane: 'main',
    });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('update_project_phase', {
      p_project_id: 'project-1',
      p_phase_id: 'phase-2',
      p_expected_updated_at: '2026-08-01T12:00:00.000Z',
      p_patch: { follows_phase_id: 'phase-1', lane: 'main' },
    });

    config.onSuccess({}, {
      phaseId: 'phase-2',
      projectId: 'project-1',
      expectedUpdatedAt: '2026-08-01T12:00:00.000Z',
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['project-workflow', 'project-1'],
    });
  });
});

describe('useDeletePhaseWithRelink', () => {
  it('sends no browser-derived follower list and validates the exact receipt', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: {
        deleted_phase_id: 'phase-2',
        predecessor_phase_id: 'phase-1',
        relinked_phase_ids: ['phase-3', 'phase-4'],
      },
      error: null,
    });

    const config = useDeletePhaseWithRelink() as unknown as {
      mutationFn: (input: { projectId: string; phaseId: string }) => Promise<unknown>;
    };
    await expect(
      config.mutationFn({ projectId: 'project-1', phaseId: 'phase-2' }),
    ).resolves.toEqual({
      deleted_phase_id: 'phase-2',
      predecessor_phase_id: 'phase-1',
      relinked_phase_ids: ['phase-3', 'phase-4'],
    });
    expect(supabaseClient.rpc).toHaveBeenCalledWith('delete_project_phase', {
      p_project_id: 'project-1',
      p_phase_id: 'phase-2',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateProjectPhaseStatus — 00393 atomic phase CAS
// ─────────────────────────────────────────────────────────────────────────────

type PhaseTransitionMutationConfig = {
  mutationFn: (input: ProjectPhaseTransitionInput) => Promise<ProjectPhaseTransitionReceipt>;
  onSuccess: (
    result: ProjectPhaseTransitionReceipt,
    variables: ProjectPhaseTransitionInput,
  ) => void;
};

describe('useUpdateProjectPhaseStatus', () => {
  it('completes through one RPC with the in_progress CAS token and returns the safe receipt', async () => {
    const receipt: ProjectPhaseTransitionReceipt = {
      completed_phase_id: 'phase-1',
      next_phase_ids: ['phase-2', 'phase-thread'],
      terminal: false,
    };
    supabaseClient.rpc.mockResolvedValue({ data: receipt, error: null });

    const config = useUpdateProjectPhaseStatus() as unknown as PhaseTransitionMutationConfig;
    await expect(
      config.mutationFn({
        projectId: 'project-1',
        phaseId: 'phase-1',
        status: 'completed',
        progress: 100,
      }),
    ).resolves.toEqual(receipt);

    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseClient.rpc).toHaveBeenCalledWith('advance_project_phase', {
      p_project_id: 'project-1',
      p_phase_id: 'phase-1',
      p_expected_status: 'in_progress',
    });
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });

  it('resumes a delayed phase through the same RPC and exposes the exact resume receipt', async () => {
    const receipt: ProjectPhaseTransitionReceipt = {
      completed_phase_id: null,
      next_phase_ids: ['phase-delayed'],
      terminal: true,
    };
    supabaseClient.rpc.mockResolvedValue({ data: receipt, error: null });

    const config = useUpdateProjectPhaseStatus() as unknown as PhaseTransitionMutationConfig;
    await expect(
      config.mutationFn({
        projectId: 'project-1',
        phaseId: 'phase-delayed',
        status: 'in_progress',
      }),
    ).resolves.toEqual(receipt);

    expect(supabaseClient.rpc).toHaveBeenCalledWith('advance_project_phase', {
      p_project_id: 'project-1',
      p_phase_id: 'phase-delayed',
      p_expected_status: 'delayed',
    });
  });

  it('propagates the Supabase RPC error unchanged', async () => {
    const rpcError = { code: '40001', message: 'phase status changed' };
    supabaseClient.rpc.mockResolvedValue({ data: null, error: rpcError });

    const config = useUpdateProjectPhaseStatus() as unknown as PhaseTransitionMutationConfig;
    await expect(
      config.mutationFn({
        projectId: 'project-1',
        phaseId: 'phase-1',
        status: 'completed',
      }),
    ).rejects.toBe(rpcError);
  });

  it('rejects unsupported local call shapes before invoking the RPC', async () => {
    const config = useUpdateProjectPhaseStatus() as unknown as PhaseTransitionMutationConfig;

    await expect(
      config.mutationFn({
        projectId: 'project-1',
        phaseId: 'phase-1',
        status: 'completed',
        progress: 75,
      }),
    ).rejects.toThrow(/completion progress must be 100/);
    await expect(
      config.mutationFn({
        projectId: 'project-1',
        phaseId: 'phase-1',
        status: 'in_progress',
        progress: 25,
      }),
    ).rejects.toThrow(/resume does not accept progress/);
    await expect(
      config.mutationFn({
        projectId: 'project-1',
        phaseId: 'phase-1',
        status: 'pending',
      } as unknown as ProjectPhaseTransitionInput),
    ).rejects.toThrow(/status must be completed or in_progress/);

    expect(supabaseClient.rpc).not.toHaveBeenCalled();
  });

  it('rejects a malformed or expanded receipt instead of trusting unsafe JSON', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: {
        completed_phase_id: 'phase-1',
        next_phase_ids: [],
        terminal: true,
        project_id: 'must-not-leak',
      },
      error: null,
    });

    const config = useUpdateProjectPhaseStatus() as unknown as PhaseTransitionMutationConfig;
    await expect(
      config.mutationFn({
        projectId: 'project-1',
        phaseId: 'phase-1',
        status: 'completed',
      }),
    ).rejects.toThrow(/invalid transition receipt/);
  });

  it('invalidates phase, project detail, project list, and document-state readers', () => {
    const config = useUpdateProjectPhaseStatus() as unknown as PhaseTransitionMutationConfig;
    const receipt: ProjectPhaseTransitionReceipt = {
      completed_phase_id: 'phase-1',
      next_phase_ids: [],
      terminal: true,
    };

    config.onSuccess(receipt, {
      projectId: 'project-7',
      phaseId: 'phase-1',
      status: 'completed',
    });

    const invalidatedKeys = invalidateQueries.mock.calls.map((call) => call[0].queryKey);
    expect(invalidatedKeys).toEqual([
      ['project-phases', 'project-7'],
      ['project-v2', 'project-7'],
      ['projects'],
      ['document-state'],
      ['project-workflow', 'project-7'],
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateFFEItemPricing  (W2-T2 — dual pricing, 00185)
// ─────────────────────────────────────────────────────────────────────────────

type PricingMutationConfig = {
  mutationFn: (input: UpdateFFEItemPricingInput) => Promise<unknown>;
  onSuccess: (result: unknown, variables: UpdateFFEItemPricingInput) => void;
};

describe('useUpdateFFEItemPricing', () => {
  it('writes only trade_price_cents when only tradePriceCents is provided (no quantity read)', async () => {
    queueTableResults('project_ffe_items', {
      data: { id: 'ffe-1', trade_price_cents: 120000 },
      error: null,
    });

    const config = useUpdateFFEItemPricing() as unknown as PricingMutationConfig;
    await config.mutationFn({ itemId: 'ffe-1', projectId: 'proj-1', tradePriceCents: 120000 });

    const builder = builders.project_ffe_items;
    const updates = builder.__chain.filter((c) => c.method === 'update');
    expect(updates).toHaveLength(1);
    // ONLY the trade column — no unit price, no markup, no line_total.
    expect(updates[0].args[0]).toEqual({ trade_price_cents: 120000 });

    // Scoped to the item id.
    const eqArgs = builder.__chain.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqArgs).toEqual([['id', 'ffe-1']]);

    // No quantity read: exactly one terminal .single() (the UPDATE's), and the
    // only select is the post-update row select (no args / no 'quantity').
    const selects = builder.__chain.filter((c) => c.method === 'select');
    expect(selects).toHaveLength(1);
    expect(selects[0].args).toEqual([]);
  });

  it('clears trade + markup back to NULL when explicit nulls are passed (partial update semantics)', async () => {
    queueTableResults('project_ffe_items', {
      data: { id: 'ffe-1', trade_price_cents: null, markup_percent: null },
      error: null,
    });

    const config = useUpdateFFEItemPricing() as unknown as PricingMutationConfig;
    await config.mutationFn({
      itemId: 'ffe-1',
      projectId: 'proj-1',
      tradePriceCents: null,
      markupPercent: null,
    });

    const builder = builders.project_ffe_items;
    const update = builder.__chain.find((c) => c.method === 'update');
    expect(update?.args[0]).toEqual({ trade_price_cents: null, markup_percent: null });
  });

  it('writes markup_percent alone when only markupPercent is provided', async () => {
    queueTableResults('project_ffe_items', {
      data: { id: 'ffe-1', markup_percent: 22.5 },
      error: null,
    });

    const config = useUpdateFFEItemPricing() as unknown as PricingMutationConfig;
    await config.mutationFn({ itemId: 'ffe-1', projectId: 'proj-1', markupPercent: 22.5 });

    const builder = builders.project_ffe_items;
    const update = builder.__chain.find((c) => c.method === 'update');
    expect(update?.args[0]).toEqual({ markup_percent: 22.5 });
  });

  it('reads the row quantity and recomputes line_total_cents when unitPriceCents is provided', async () => {
    queueTableResults(
      'project_ffe_items',
      // 1. quantity read (select-then-update — same approach as useUpdateFFEItemStatus)
      { data: { quantity: 3 }, error: null },
      // 2. the UPDATE itself
      { data: { id: 'ffe-1', unit_price_cents: 45000, line_total_cents: 135000 }, error: null },
    );

    const config = useUpdateFFEItemPricing() as unknown as PricingMutationConfig;
    await config.mutationFn({
      itemId: 'ffe-1',
      projectId: 'proj-1',
      unitPriceCents: 45000,
      tradePriceCents: 30000,
    });

    const builder = builders.project_ffe_items;

    // Quantity read happened: select('quantity') before the update.
    const selectQty = builder.__chain.find(
      (c) => c.method === 'select' && c.args[0] === 'quantity',
    );
    expect(selectQty).toBeDefined();
    const selectIdx = builder.__chain.findIndex(
      (c) => c.method === 'select' && c.args[0] === 'quantity',
    );
    const updateIdx = builder.__chain.findIndex((c) => c.method === 'update');
    expect(selectIdx).toBeLessThan(updateIdx);

    // Payload carries client price + recomputed line total + trade price.
    const update = builder.__chain.find((c) => c.method === 'update');
    expect(update?.args[0]).toEqual({
      unit_price_cents: 45000,
      line_total_cents: 45000 * 3,
      trade_price_cents: 30000,
    });
  });

  it('throws (and never UPDATEs) when the quantity read fails — a stale line total must not survive a price change', async () => {
    queueTableResults('project_ffe_items', {
      data: null,
      error: { message: 'rls denied' },
    });

    const config = useUpdateFFEItemPricing() as unknown as PricingMutationConfig;
    await expect(
      config.mutationFn({ itemId: 'ffe-x', projectId: 'proj-1', unitPriceCents: 1000 }),
    ).rejects.toThrow(/failed to read quantity.*rls denied/);

    const builder = builders.project_ffe_items;
    expect(builder.__chain.find((c) => c.method === 'update')).toBeUndefined();
  });

  it('throws when no pricing fields are provided', async () => {
    const config = useUpdateFFEItemPricing() as unknown as PricingMutationConfig;
    await expect(
      config.mutationFn({ itemId: 'ffe-1', projectId: 'proj-1' }),
    ).rejects.toThrow(/no pricing fields provided/);

    // Nothing was written.
    expect(builders.project_ffe_items).toBeUndefined();
  });

  it('throws when the UPDATE itself fails', async () => {
    queueTableResults('project_ffe_items', {
      data: null,
      error: new Error('check constraint violated'),
    });

    const config = useUpdateFFEItemPricing() as unknown as PricingMutationConfig;
    await expect(
      config.mutationFn({ itemId: 'ffe-1', projectId: 'proj-1', tradePriceCents: -1 }),
    ).rejects.toThrow('check constraint violated');
  });

  it('onSuccess invalidates the FF&E trio (via invalidateFfeCaches) plus the package financials key', () => {
    const config = useUpdateFFEItemPricing() as unknown as PricingMutationConfig;

    config.onSuccess({}, { itemId: 'ffe-1', projectId: 'proj-7', tradePriceCents: 100 });

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    // Same trio as useUpdateFFEItemStatus / invalidateFfeCaches:
    expect(invalidatedKeys).toContainEqual(['project-ffe-items', 'proj-7']);
    expect(invalidatedKeys).toContainEqual(['projects', 'proj-7']);
    expect(invalidatedKeys).toContainEqual(['procurement-items']);
    // Plus the package financials namespace whose margin rollup reads pricing.
    expect(invalidatedKeys).toContainEqual(['project-financials', 'proj-7']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useProjectFinancials  (W2-T2 — margin-aware rollup, 00185)
// ─────────────────────────────────────────────────────────────────────────────

type FinancialsConfig = {
  queryKey: unknown[];
  queryFn: () => Promise<{
    budgetCents: number;
    totalAmountCents: number;
    tradeTotalCents: number | null;
    marginCents: number | null;
    itemsWithTradeCount: number;
    totalItemCount: number;
    byRoom: Array<{
      roomId: string;
      roomName: string;
      budgetCents: number;
      committedCents: number;
      actualCents: number;
    }>;
    byCategory: Array<{
      category: string;
      budgetCents: number;
      committedCents: number;
      actualCents: number;
      marginCents: number | null;
      itemsWithTradeCount: number;
    }>;
  }>;
  enabled: boolean;
};

const PROJECT_ROW = {
  budget_cents: 500000,
  total_amount_cents: 600000,
  committed_cents: 250000,
  actual_cents: 100000,
  design_fee_cents: 50000,
};

function seedFinancialsTables(items: unknown[]) {
  setTableDefault('projects', { data: PROJECT_ROW, error: null });
  setTableDefault('project_rooms', { data: [], error: null });
  setTableDefault('project_ffe_items', { data: items, error: null });
}

describe('useProjectFinancials (margin math)', () => {
  it('keys by ["project-financials", id] and selects the 00185 pricing columns off the items', async () => {
    seedFinancialsTables([]);

    const config = useProjectFinancials('proj-1') as unknown as FinancialsConfig;
    expect(config.queryKey).toEqual(['project-financials', 'proj-1']);
    expect(config.enabled).toBe(true);

    await config.queryFn();

    const itemsBuilder = builders.project_ffe_items;
    const select = itemsBuilder.__chain.find((c) => c.method === 'select');
    const selectStr = String(select?.args[0]);
    expect(selectStr).toContain('trade_price_cents');
    expect(selectStr).toContain('quantity');
    expect(selectStr).toContain('line_total_cents');
  });

  it('computes marginCents/tradeTotalCents over ONLY the items with trade data, with coverage counts', async () => {
    seedFinancialsTables([
      // trade set: tradeLine = 30000×2 = 60000, margin = 100000−60000 = 40000
      {
        ffe_category: 'Lighting',
        line_total_cents: 100000,
        status: 'specified',
        trade_price_cents: 30000,
        quantity: 2,
      },
      // NULL trade — contributes to budget but NOT to margin/tradeTotal
      {
        ffe_category: 'Lighting',
        line_total_cents: 50000,
        status: 'ordered',
        trade_price_cents: null,
        quantity: 1,
      },
      // trade set: tradeLine = 80000×2 = 160000, margin = 200000−160000 = 40000
      {
        ffe_category: 'Seating',
        line_total_cents: 200000,
        status: 'delivered',
        trade_price_cents: 80000,
        quantity: 2,
      },
    ]);

    const config = useProjectFinancials('proj-1') as unknown as FinancialsConfig;
    const result = await config.queryFn();

    expect(result.tradeTotalCents).toBe(60000 + 160000);
    expect(result.marginCents).toBe(40000 + 40000);
    expect(result.itemsWithTradeCount).toBe(2);
    expect(result.totalItemCount).toBe(3);

    // Per-category: margin only over the category's trade-priced items.
    const lighting = result.byCategory.find((c) => c.category === 'Lighting');
    expect(lighting).toEqual(
      expect.objectContaining({
        budgetCents: 150000, // both items count toward budget
        committedCents: 50000, // only the 'ordered' one
        marginCents: 40000, // only the trade-priced one
        itemsWithTradeCount: 1,
      }),
    );
    const seating = result.byCategory.find((c) => c.category === 'Seating');
    expect(seating).toEqual(
      expect.objectContaining({
        budgetCents: 200000,
        committedCents: 200000,
        actualCents: 200000,
        marginCents: 40000,
        itemsWithTradeCount: 1,
      }),
    );
  });

  it('returns NULL (not 0) margin/tradeTotal when NO item has trade data', async () => {
    seedFinancialsTables([
      {
        ffe_category: 'Rugs',
        line_total_cents: 90000,
        status: 'specified',
        trade_price_cents: null,
        quantity: 1,
      },
      {
        ffe_category: 'Rugs',
        line_total_cents: 30000,
        status: 'specified',
        trade_price_cents: null,
        quantity: 2,
      },
    ]);

    const config = useProjectFinancials('proj-1') as unknown as FinancialsConfig;
    const result = await config.queryFn();

    expect(result.marginCents).toBeNull();
    expect(result.tradeTotalCents).toBeNull();
    expect(result.itemsWithTradeCount).toBe(0);
    expect(result.totalItemCount).toBe(2);
    // Per-category margin is null too — unknown, never "zero margin".
    expect(result.byCategory[0].marginCents).toBeNull();
    expect(result.byCategory[0].itemsWithTradeCount).toBe(0);
    // Budget rollup is unaffected by missing trade data.
    expect(result.byCategory[0].budgetCents).toBe(120000);
  });

  it('handles NULL line_total and missing quantity defensively (trade-set item with no client price)', async () => {
    seedFinancialsTables([
      // line_total NULL → treated as 0 → margin contribution = 0 − 10000×1
      {
        ffe_category: null, // → 'Uncategorized'
        line_total_cents: null,
        status: 'specified',
        trade_price_cents: 10000,
        quantity: 1,
      },
      // quantity missing → defaults to 1
      {
        ffe_category: null,
        line_total_cents: 20000,
        status: 'specified',
        trade_price_cents: 15000,
        quantity: undefined,
      },
    ]);

    const config = useProjectFinancials('proj-1') as unknown as FinancialsConfig;
    const result = await config.queryFn();

    expect(result.tradeTotalCents).toBe(10000 + 15000);
    expect(result.marginCents).toBe(0 - 10000 + (20000 - 15000));
    expect(result.itemsWithTradeCount).toBe(2);

    const uncategorized = result.byCategory.find((c) => c.category === 'Uncategorized');
    expect(uncategorized?.marginCents).toBe(-5000);
  });

  it('zero is a real margin: a single zero-margin item yields 0, not null', async () => {
    seedFinancialsTables([
      // tier-c backfill shape: trade = client price, markup 0
      {
        ffe_category: 'Decor',
        line_total_cents: 40000,
        status: 'specified',
        trade_price_cents: 20000,
        quantity: 2,
      },
    ]);

    const config = useProjectFinancials('proj-1') as unknown as FinancialsConfig;
    const result = await config.queryFn();

    expect(result.marginCents).toBe(0);
    expect(result.tradeTotalCents).toBe(40000);
    expect(result.itemsWithTradeCount).toBe(1);
  });

  it('is disabled for an empty projectId', () => {
    const config = useProjectFinancials('') as unknown as FinancialsConfig;
    expect(config.enabled).toBe(false);
  });

  it('byRoom coalesces null budget_cents to 0', async () => {
    setTableDefault('projects', { data: PROJECT_ROW, error: null });
    setTableDefault('project_rooms', {
      data: [
        { id: 'room-1', name: 'Living Room', budget_cents: null, committed_cents: null, actual_cents: null },
        { id: 'room-2', name: 'Bedroom', budget_cents: 80000, committed_cents: 20000, actual_cents: 10000 },
      ],
      error: null,
    });
    setTableDefault('project_ffe_items', { data: [], error: null });

    const config = useProjectFinancials('proj-1') as unknown as FinancialsConfig;
    const result = await config.queryFn();

    const living = result.byRoom.find((r) => r.roomId === 'room-1');
    expect(living?.budgetCents).toBe(0);
    expect(living?.committedCents).toBe(0);
    expect(living?.actualCents).toBe(0);

    const bedroom = result.byRoom.find((r) => r.roomId === 'room-2');
    expect(bedroom?.budgetCents).toBe(80000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateFFEItemStatus — onSuccess invalidation
// ─────────────────────────────────────────────────────────────────────────────

type StatusMutationConfig = {
  mutationFn: (input: {
    itemId: string;
    projectId: string;
    status: string;
    unitPriceCents?: number;
  }) => Promise<unknown>;
  onSuccess: (
    result: unknown,
    variables: { itemId: string; projectId: string; status: string; unitPriceCents?: number },
  ) => void;
};

describe('useUpdateFFEItemStatus', () => {
  it('onSuccess invalidates the FF&E keys plus project-financials (price param may change line_total_cents)', () => {
    const config = useUpdateFFEItemStatus() as unknown as StatusMutationConfig;

    config.onSuccess({}, { itemId: 'ffe-1', projectId: 'proj-5', status: 'ordered' });

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['project-ffe-items', 'proj-5']);
    expect(invalidatedKeys).toContainEqual(['project-v2', 'proj-5']);
    expect(invalidatedKeys).toContainEqual(['projects', 'proj-5']);
    expect(invalidatedKeys).toContainEqual(['procurement-items']);
    expect(invalidatedKeys).toContainEqual(['project-financials', 'proj-5']);
    expect(invalidatedKeys).toContainEqual(['project-workflow', 'proj-5']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useBulkReassignFfeVendor  (Schedule & Boards Wave 0B — B-07)
// ─────────────────────────────────────────────────────────────────────────────

type ReassignMutationConfig = {
  mutationFn: (input: BulkReassignFfeVendorInput) => Promise<BulkReassignFfeVendorResult>;
  onSuccess: (result: unknown, variables: BulkReassignFfeVendorInput) => void;
};

describe('useBulkReassignFfeVendor', () => {
  it('updates vendor_id + vendor_name over the ids, scoped to the project, guarded to unordered lines', async () => {
    queueTableResults('project_ffe_items', {
      data: [{ id: 'ffe-1' }, { id: 'ffe-2' }],
      error: null,
    });

    const config = useBulkReassignFfeVendor() as unknown as ReassignMutationConfig;
    const result = await config.mutationFn({
      projectId: 'proj-1',
      itemIds: ['ffe-1', 'ffe-2'],
      vendorId: 'v-9',
      vendorName: 'Hewn Woodworks',
    });

    const builder = builders.project_ffe_items;
    const update = builder.__chain.find((c) => c.method === 'update');
    expect(update?.args[0]).toEqual({ vendor_id: 'v-9', vendor_name: 'Hewn Woodworks' });

    // One write, addressed to exactly the selected ids…
    const inCall = builder.__chain.find((c) => c.method === 'in');
    expect(inCall?.args).toEqual(['id', ['ffe-1', 'ffe-2']]);
    // …defense-in-depth scoped to the project (useAssignProductToFfeSlot pattern)…
    const eqCall = builder.__chain.find((c) => c.method === 'eq');
    expect(eqCall?.args).toEqual(['project_id', 'proj-1']);
    // …and the PO guard: an ordered line is never bulk-reassigned.
    const isCall = builder.__chain.find((c) => c.method === 'is');
    expect(isCall?.args).toEqual(['purchase_order_id', null]);

    expect(result).toEqual({ updatedIds: ['ffe-1', 'ffe-2'], skippedIds: [] });
  });

  it('reports ids the guarded UPDATE did not reach as skipped (stale client raced an order)', async () => {
    // ffe-2 got PO-linked since the board loaded — the .is() guard drops it.
    queueTableResults('project_ffe_items', { data: [{ id: 'ffe-1' }], error: null });

    const config = useBulkReassignFfeVendor() as unknown as ReassignMutationConfig;
    const result = await config.mutationFn({
      projectId: 'proj-1',
      itemIds: ['ffe-1', 'ffe-2'],
      vendorId: 'v-9',
      vendorName: 'Hewn Woodworks',
    });

    expect(result).toEqual({ updatedIds: ['ffe-1'], skippedIds: ['ffe-2'] });
  });

  it('throws (and never writes) on an empty selection', async () => {
    const config = useBulkReassignFfeVendor() as unknown as ReassignMutationConfig;
    await expect(
      config.mutationFn({
        projectId: 'proj-1',
        itemIds: [],
        vendorId: 'v-9',
        vendorName: 'Hewn Woodworks',
      }),
    ).rejects.toThrow(/no items selected/);
    expect(builders.project_ffe_items).toBeUndefined();
  });

  it('throws when the UPDATE fails', async () => {
    queueTableResults('project_ffe_items', {
      data: null,
      error: new Error('rls denied'),
    });

    const config = useBulkReassignFfeVendor() as unknown as ReassignMutationConfig;
    await expect(
      config.mutationFn({
        projectId: 'proj-1',
        itemIds: ['ffe-1'],
        vendorId: 'v-9',
        vendorName: 'Hewn Woodworks',
      }),
    ).rejects.toThrow('rls denied');
  });

  it('onSuccess invalidates the FF&E trio (invalidateFfeCaches)', () => {
    const config = useBulkReassignFfeVendor() as unknown as ReassignMutationConfig;

    config.onSuccess({}, {
      projectId: 'proj-7',
      itemIds: ['ffe-1'],
      vendorId: 'v-9',
      vendorName: 'Hewn Woodworks',
    });

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['project-ffe-items', 'proj-7']);
    expect(invalidatedKeys).toContainEqual(['projects', 'proj-7']);
    expect(invalidatedKeys).toContainEqual(['procurement-items']);
  });
});
