import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
//
// Mirror the use-procurement.test.ts rig: a per-table chainable builder whose
// terminal calls (.single() / await) drain a result queue, so a single hook
// performing multiple operations against the same table can receive distinct
// responses per call.
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
  useUpdateFFEItemStatus,
  useProjectFFEItems,
  useBulkReassignFfeVendor,
  useSetFfeLineCommercials,
  useRecordFfeInstalled,
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
  SetFfeLineCommercialsInput,
  RecordFfeInstalledInput,
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

  // P2-follow: sort_order alone is not a stable key — two lines sharing a
  // sort_order (e.g. right after a line moves onto a PO) would otherwise jump
  // order between renders. created_at then id break the tie deterministically.
  it('orders by sort_order, then created_at, then id so ties are stable', async () => {
    const builder = setTableDefault('project_ffe_items', {
      data: [],
      error: null,
    });
    const config = useProjectFFEItems('project-1') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    await config.queryFn();

    const orderCalls = builder.__chain.filter((call) => call.method === 'order');
    expect(orderCalls.map((call) => call.args)).toEqual([
      ['sort_order', { ascending: true }],
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
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
  it('sends only the trade cost to set_project_ffe_line_commercials, never a direct write', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: { id: 'ffe-1', trade_price_cents: 4200 },
      error: null,
    });
    const config = useUpdateFFEItemPricing() as unknown as PricingMutationConfig;

    const result = await config.mutationFn({ itemId: 'ffe-1', projectId: 'proj-1', tradePriceCents: 4200 });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('set_project_ffe_line_commercials', {
      p_item_id: 'ffe-1',
      p_request: { tradePriceCents: 4200 },
    });
    expect(builders.project_ffe_items).toBeUndefined();
    expect((result as { trade_price_cents: number }).trade_price_cents).toBe(4200);
  });

  it('throws the server refusal (e.g. a line already on a PO)', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'line is on a purchase order' },
    });
    const config = useUpdateFFEItemPricing() as unknown as PricingMutationConfig;

    await expect(
      config.mutationFn({ itemId: 'ffe-1', projectId: 'proj-1', tradePriceCents: 1 }),
    ).rejects.toThrow(/on a purchase order/);
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
  it('fails closed without direct project_ffe_items DML', async () => {
    const config = useUpdateFFEItemStatus() as unknown as StatusMutationConfig;
    await expect(
      config.mutationFn({ itemId: 'ffe-1', projectId: 'proj-5', status: 'ordered' }),
    ).rejects.toThrow(/logistics changes are RPC-only/);

    expect(builders.project_ffe_items).toBeUndefined();
  });

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
  it('calls set_project_ffe_line_commercials once per line and splits updated from refused ids', async () => {
    supabaseClient.rpc
      .mockResolvedValueOnce({ data: { id: 'ffe-1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'line is on a purchase order' } });
    const config = useBulkReassignFfeVendor() as unknown as ReassignMutationConfig;

    const result = await config.mutationFn({
      projectId: 'proj-1',
      itemIds: ['ffe-1', 'ffe-2'],
      vendorId: 'v-9',
    });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('set_project_ffe_line_commercials', {
      p_item_id: 'ffe-1',
      p_request: { vendorId: 'v-9' },
    });
    expect(supabaseClient.rpc).toHaveBeenCalledWith('set_project_ffe_line_commercials', {
      p_item_id: 'ffe-2',
      p_request: { vendorId: 'v-9' },
    });
    expect(result).toEqual({ updatedIds: ['ffe-1'], skippedIds: ['ffe-2'] });
    expect(builders.project_ffe_items).toBeUndefined();
  });

  it('throws the first refusal when no line could be updated', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: null,
      error: { message: 'project not found or access denied' },
    });
    const config = useBulkReassignFfeVendor() as unknown as ReassignMutationConfig;

    await expect(
      config.mutationFn({ projectId: 'proj-1', itemIds: ['ffe-1'], vendorId: 'v-9' }),
    ).rejects.toThrow(/access denied/);
  });

  it('throws (and never calls the server) on an empty selection', async () => {
    const config = useBulkReassignFfeVendor() as unknown as ReassignMutationConfig;
    await expect(
      config.mutationFn({ projectId: 'proj-1', itemIds: [], vendorId: 'v-9' }),
    ).rejects.toThrow(/no items selected/);
    expect(supabaseClient.rpc).not.toHaveBeenCalled();
  });

  it('onSuccess invalidates the FF&E trio (invalidateFfeCaches)', () => {
    const config = useBulkReassignFfeVendor() as unknown as ReassignMutationConfig;

    config.onSuccess({}, { projectId: 'proj-7', itemIds: ['ffe-1'], vendorId: 'v-9' });

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['project-ffe-items', 'proj-7']);
    expect(invalidatedKeys).toContainEqual(['projects', 'proj-7']);
    expect(invalidatedKeys).toContainEqual(['procurement-items']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useSetFfeLineCommercials  (00692 set_project_ffe_line_commercials)
// ─────────────────────────────────────────────────────────────────────────────

type CommercialsMutationConfig = {
  mutationFn: (input: SetFfeLineCommercialsInput) => Promise<unknown>;
  onSuccess: (result: unknown, variables: SetFfeLineCommercialsInput) => void;
};

describe('useSetFfeLineCommercials', () => {
  it('sends vendorId and tradePriceCents only — never a client price', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({ data: { id: 'ffe-1' }, error: null });
    const config = useSetFfeLineCommercials() as unknown as CommercialsMutationConfig;

    await config.mutationFn({ itemId: 'ffe-1', projectId: 'proj-1', vendorId: 'v-2', tradePriceCents: 0 });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('set_project_ffe_line_commercials', {
      p_item_id: 'ffe-1',
      p_request: { vendorId: 'v-2', tradePriceCents: 0 },
    });
    expect(builders.project_ffe_items).toBeUndefined();
  });

  it('omits keys the caller did not supply', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({ data: { id: 'ffe-1' }, error: null });
    const config = useSetFfeLineCommercials() as unknown as CommercialsMutationConfig;

    await config.mutationFn({ itemId: 'ffe-1', projectId: 'proj-1', vendorId: 'v-2' });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('set_project_ffe_line_commercials', {
      p_item_id: 'ffe-1',
      p_request: { vendorId: 'v-2' },
    });
  });

  it('onSuccess invalidates the FF&E trio plus the package financials key', () => {
    const config = useSetFfeLineCommercials() as unknown as CommercialsMutationConfig;

    config.onSuccess({}, { itemId: 'ffe-1', projectId: 'proj-3', tradePriceCents: 5 });

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['project-ffe-items', 'proj-3']);
    expect(invalidatedKeys).toContainEqual(['projects', 'proj-3']);
    expect(invalidatedKeys).toContainEqual(['procurement-items']);
    expect(invalidatedKeys).toContainEqual(['project-financials', 'proj-3']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useRecordFfeInstalled  (00691 record_project_ffe_installed)
// ─────────────────────────────────────────────────────────────────────────────

type InstalledMutationConfig = {
  mutationFn: (input: RecordFfeInstalledInput) => Promise<unknown>;
  onSuccess: (result: unknown, variables: RecordFfeInstalledInput) => void;
};

describe('useRecordFfeInstalled', () => {
  it('calls record_project_ffe_installed with the ids and install day', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: [{ id: 'ffe-1', status: 'installed' }],
      error: null,
    });
    const config = useRecordFfeInstalled() as unknown as InstalledMutationConfig;

    const rows = await config.mutationFn({
      projectId: 'proj-1',
      itemIds: ['ffe-1'],
      installedOn: '2026-10-01',
    });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('record_project_ffe_installed', {
      p_item_ids: ['ffe-1'],
      p_installed_on: '2026-10-01',
    });
    expect(rows).toEqual([{ id: 'ffe-1', status: 'installed' }]);
    expect(builders.project_ffe_items).toBeUndefined();
  });

  it('sends a null install day so the server defaults to today', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({ data: [], error: null });
    const config = useRecordFfeInstalled() as unknown as InstalledMutationConfig;

    await config.mutationFn({ projectId: 'proj-1', itemIds: ['ffe-1'] });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('record_project_ffe_installed', {
      p_item_ids: ['ffe-1'],
      p_installed_on: null,
    });
  });

  it('throws the server refusal for a line that is not delivered', async () => {
    supabaseClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'only delivered lines can be marked installed: Sofa (ordered)' },
    });
    const config = useRecordFfeInstalled() as unknown as InstalledMutationConfig;

    await expect(
      config.mutationFn({ projectId: 'proj-1', itemIds: ['ffe-1'] }),
    ).rejects.toThrow(/only delivered lines/);
  });

  it('throws (and never calls the server) on an empty selection', async () => {
    const config = useRecordFfeInstalled() as unknown as InstalledMutationConfig;
    await expect(config.mutationFn({ projectId: 'proj-1', itemIds: [] })).rejects.toThrow(
      /no items selected/,
    );
    expect(supabaseClient.rpc).not.toHaveBeenCalled();
  });

  it('onSuccess invalidates the FF&E trio and the project workflow', () => {
    const config = useRecordFfeInstalled() as unknown as InstalledMutationConfig;

    config.onSuccess([], { projectId: 'proj-4', itemIds: ['ffe-1'] });

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['project-ffe-items', 'proj-4']);
    expect(invalidatedKeys).toContainEqual(['projects', 'proj-4']);
    expect(invalidatedKeys).toContainEqual(['procurement-items']);
    expect(invalidatedKeys).toContainEqual(['project-workflow', 'proj-4']);
  });
});
