import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
//
// Mirror the use-phase-deliverables / use-phase-templates rigs but extend the
// builder so a single table-builder can return different results for each
// successive terminal call (.single() / await). useCreatePurchaseOrder and
// useLogPaymentPaid both perform multiple operations against the same
// underlying table and need distinct responses per call.
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
  order: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  limit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gte: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lte: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  in: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  not: any;
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
  builder.order = record('order');
  builder.limit = record('limit');
  builder.gte = record('gte');
  builder.lte = record('lte');
  builder.in = record('in');
  builder.not = record('not');

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
  auth: { getUser: vi.fn() },
  from: vi.fn((table: string) => getBuilder(table)),
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
  usePurchaseOrders,
  usePOPayments,
  useCreatePurchaseOrder,
  useLogPaymentPaid,
  // Sprint 2 — Receiving, damage claims, calendar
  useDeliveryCalendar,
  useTodayProcurementCounts,
  useCreateReceivingInspection,
  useUpdateDamageClaim,
} from '../use-procurement';

beforeEach(() => {
  Object.keys(builders).forEach((k) => delete builders[k]);
  invalidateQueries.mockReset();
  supabaseClient.auth.getUser.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// usePurchaseOrders
// ─────────────────────────────────────────────────────────────────────────────

describe('usePurchaseOrders', () => {
  it('uses the canonical query key for empty filters and selects from purchase_orders', async () => {
    setTableDefault('purchase_orders', { data: [], error: null });

    const config = usePurchaseOrders() as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown>;
    };

    expect(config.queryKey).toEqual(['purchase-orders', undefined]);
    const rows = await config.queryFn();
    expect(rows).toEqual([]);
    expect(supabaseClient.from).toHaveBeenCalledWith('purchase_orders');
  });

  it('applies projectId filter via .eq(project_id, ...) and embeds filters in queryKey', async () => {
    const builder = setTableDefault('purchase_orders', { data: [], error: null });
    const filters = { projectId: 'proj-1' };

    const config = usePurchaseOrders(filters) as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown>;
    };

    expect(config.queryKey).toEqual(['purchase-orders', filters]);
    await config.queryFn();

    const eqCalls = builder.__chain.filter((c) => c.method === 'eq');
    expect(eqCalls).toEqual([{ method: 'eq', args: ['project_id', 'proj-1'] }]);
  });

  it('throws when supabase returns an error', async () => {
    setTableDefault('purchase_orders', { data: null, error: new Error('rls denied') });
    const config = usePurchaseOrders() as unknown as { queryFn: () => Promise<unknown> };
    await expect(config.queryFn()).rejects.toThrow('rls denied');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// usePOPayments
// ─────────────────────────────────────────────────────────────────────────────

describe('usePOPayments', () => {
  it('keys by ["po-payments", purchaseOrderId] and selects payments by purchase_order_id', async () => {
    const builder = setTableDefault('po_payments', {
      data: [
        { id: 'p1', purchase_order_id: 'po1', kind: 'deposit', state: 'paid', sort_order: 0 },
        { id: 'p2', purchase_order_id: 'po1', kind: 'balance', state: 'pending', sort_order: 1 },
      ],
      error: null,
    });

    const config = usePOPayments('po1') as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown[]>;
      enabled: boolean;
    };

    expect(config.queryKey).toEqual(['po-payments', 'po1']);
    expect(config.enabled).toBe(true);

    const rows = await config.queryFn();
    expect(rows).toHaveLength(2);
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual([
      'purchase_order_id',
      'po1',
    ]);
    expect(builder.__chain.find((c) => c.method === 'order')?.args).toEqual([
      'sort_order',
      { ascending: true },
    ]);
  });

  it('does not run the query when purchaseOrderId is empty', () => {
    const config = usePOPayments('') as unknown as { enabled: boolean };
    expect(config.enabled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useCreatePurchaseOrder
// ─────────────────────────────────────────────────────────────────────────────

describe('useCreatePurchaseOrder', () => {
  it('inserts PO header, inserts 2 pending payment rows for fifty_fifty, then updates each ffe item', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    // PO insert → returns the new PO row.
    queueTableResults('purchase_orders', {
      data: {
        id: 'po-new',
        designer_id: 'user-1',
        project_id: 'proj-1',
        vendor_id: 'vendor-1',
        payment_pattern: 'fifty_fifty',
        total_cents: 100000,
        status: 'draft',
      },
      error: null,
    });
    // po_payments insert terminates via await; default suffices.
    setTableDefault('po_payments', { data: null, error: null });
    // project_ffe_items updates now terminate via `.select('id')` (await on
    // the builder) — return a single-row array so linkedCount matches
    // ffeItemIds.length and the success path doesn't warn.
    setTableDefault('project_ffe_items', { data: [{ id: 'placeholder' }], error: null });

    const config = useCreatePurchaseOrder() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      projectId: 'proj-1',
      vendorId: 'vendor-1',
      paymentPattern: 'fifty_fifty',
      totalCents: 100000,
      ffeItemIds: ['ffe-1', 'ffe-2'],
    });

    // 1. purchase_orders insert
    const poBuilder = builders.purchase_orders;
    const poInsert = poBuilder.__chain.find((c) => c.method === 'insert');
    expect(poInsert?.args[0]).toEqual(
      expect.objectContaining({
        designer_id: 'user-1',
        project_id: 'proj-1',
        vendor_id: 'vendor-1',
        payment_pattern: 'fifty_fifty',
        total_cents: 100000,
        status: 'draft',
      })
    );

    // 2. po_payments insert — single call, 2-row array, deposit + balance, pending
    const payBuilder = builders.po_payments;
    const payInsert = payBuilder.__chain.find((c) => c.method === 'insert');
    expect(Array.isArray(payInsert?.args[0])).toBe(true);
    const rows = payInsert?.args[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        kind: 'deposit',
        amount_cents: 50000,
        state: 'pending',
        sort_order: 0,
        purchase_order_id: 'po-new',
      })
    );
    expect(rows[1]).toEqual(
      expect.objectContaining({
        kind: 'balance',
        amount_cents: 50000,
        state: 'pending',
        sort_order: 1,
        purchase_order_id: 'po-new',
      })
    );

    // 3. project_ffe_items update — one update per ffeItemId, each scoped
    //    by both id AND project_id (C-1 defence-in-depth).
    const ffeBuilder = builders.project_ffe_items;
    const ffeUpdates = ffeBuilder.__chain.filter((c) => c.method === 'update');
    expect(ffeUpdates).toHaveLength(2);
    ffeUpdates.forEach((u) => {
      expect(u.args[0]).toEqual({ purchase_order_id: 'po-new' });
    });
    const ffeEqs = ffeBuilder.__chain.filter((c) => c.method === 'eq');
    expect(ffeEqs.map((e) => e.args)).toEqual([
      ['id', 'ffe-1'],
      ['project_id', 'proj-1'],
      ['id', 'ffe-2'],
      ['project_id', 'proj-1'],
    ]);

    // Verify call order across tables: PO → payments → ffe links.
    const fromCalls = (supabaseClient.from as unknown as { mock: { calls: unknown[][] } }).mock
      .calls.map((c) => c[0] as string);
    expect(fromCalls.indexOf('purchase_orders')).toBeLessThan(
      fromCalls.indexOf('po_payments')
    );
    expect(fromCalls.indexOf('po_payments')).toBeLessThan(
      fromCalls.indexOf('project_ffe_items')
    );
  });

  it('inserts a single balance row with no deposit for net_30 pattern', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    queueTableResults('purchase_orders', {
      data: { id: 'po-net30', project_id: 'proj-2' },
      error: null,
    });
    setTableDefault('po_payments', { data: null, error: null });
    setTableDefault('project_ffe_items', { data: null, error: null });

    const config = useCreatePurchaseOrder() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      projectId: 'proj-2',
      vendorId: 'vendor-2',
      paymentPattern: 'net_30',
      totalCents: 420000,
      ffeItemIds: [],
    });

    const payBuilder = builders.po_payments;
    const payInsert = payBuilder.__chain.find((c) => c.method === 'insert');
    const rows = payInsert?.args[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        kind: 'balance',
        amount_cents: 420000,
        state: 'pending',
        sort_order: 0,
        purchase_order_id: 'po-net30',
      })
    );
  });

  it('iterates customMilestones and inserts each with its sort_order, label, and milestone kind', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    queueTableResults('purchase_orders', {
      data: { id: 'po-cm', project_id: 'proj-3' },
      error: null,
    });
    setTableDefault('po_payments', { data: null, error: null });
    setTableDefault('project_ffe_items', { data: null, error: null });

    const config = useCreatePurchaseOrder() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      projectId: 'proj-3',
      vendorId: 'vendor-3',
      paymentPattern: 'custom_milestones',
      totalCents: 960000,
      ffeItemIds: [],
      customMilestones: [
        { label: 'Deposit — 30%', amountCents: 288000, dueDate: '2026-03-15', sortOrder: 0 },
        { label: 'Mid-production — 40%', amountCents: 384000, sortOrder: 1 },
        { label: 'Before ship — 30%', amountCents: 288000, sortOrder: 2 },
      ],
    });

    const payBuilder = builders.po_payments;
    const payInsert = payBuilder.__chain.find((c) => c.method === 'insert');
    const rows = payInsert?.args[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        kind: 'milestone',
        amount_cents: 288000,
        label: 'Deposit — 30%',
        due_date: '2026-03-15',
        sort_order: 0,
        state: 'pending',
        purchase_order_id: 'po-cm',
      })
    );
    expect(rows[1]).toEqual(
      expect.objectContaining({
        kind: 'milestone',
        amount_cents: 384000,
        label: 'Mid-production — 40%',
        sort_order: 1,
      })
    );
    expect(rows[2]).toEqual(
      expect.objectContaining({
        kind: 'milestone',
        amount_cents: 288000,
        label: 'Before ship — 30%',
        sort_order: 2,
      })
    );
  });

  // ───────────────────────────────────────────────────────────────────────
  // C-1: Step 3 FFE link scopes its UPDATE by both id AND project_id.
  // Reviewer flagged that filtering by id alone allows another project's
  // FFE row to be redirected to this PO if RLS ever regresses.
  // ───────────────────────────────────────────────────────────────────────
  it('scopes each project_ffe_items UPDATE by both id and project_id (C-1)', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    queueTableResults('purchase_orders', {
      data: {
        id: 'po-scope',
        designer_id: 'user-1',
        project_id: 'proj-42',
        vendor_id: 'vendor-1',
        payment_pattern: 'full_upfront',
        total_cents: 50000,
      },
      error: null,
    });
    setTableDefault('po_payments', { data: null, error: null });
    // Return a single-row array per FFE update so linkedCount === ffeItemIds.length.
    setTableDefault('project_ffe_items', { data: [{ id: 'placeholder' }], error: null });

    const config = useCreatePurchaseOrder() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      projectId: 'proj-42',
      vendorId: 'vendor-1',
      paymentPattern: 'full_upfront',
      totalCents: 50000,
      ffeItemIds: ['ffe-a', 'ffe-b', 'ffe-c'],
    });

    const ffeBuilder = builders.project_ffe_items;
    const eqArgs = ffeBuilder.__chain.filter((c) => c.method === 'eq').map((c) => c.args);

    // Three FFE items × two eq filters each (id + project_id) = 6 .eq() calls.
    expect(eqArgs).toEqual([
      ['id', 'ffe-a'],
      ['project_id', 'proj-42'],
      ['id', 'ffe-b'],
      ['project_id', 'proj-42'],
      ['id', 'ffe-c'],
      ['project_id', 'proj-42'],
    ]);

    // Every update should also include the select('id') terminator so the
    // hook can count affected rows.
    const selects = ffeBuilder.__chain.filter((c) => c.method === 'select');
    expect(selects).toHaveLength(3);
    selects.forEach((s) => expect(s.args).toEqual(['id']));
  });

  // ───────────────────────────────────────────────────────────────────────
  // H-2: when Step 2 (payment insert) fails, the hook issues a compensating
  // DELETE on purchase_orders so the header isn't orphaned in the DB.
  // ───────────────────────────────────────────────────────────────────────
  it('issues compensating DELETE on purchase_orders when payment-row insert fails (H-2)', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    // Step 1 succeeds → returns the new PO id.
    // Step "compensate" → DELETE on purchase_orders (await, no .single()),
    // returns success.
    queueTableResults(
      'purchase_orders',
      // 1. PO insert
      {
        data: {
          id: 'po-orphan',
          designer_id: 'user-1',
          project_id: 'proj-1',
          vendor_id: 'vendor-1',
          payment_pattern: 'fifty_fifty',
          total_cents: 100000,
        },
        error: null,
      },
      // 2. compensating delete result
      { data: null, error: null }
    );

    // Step 2 fails.
    setTableDefault('po_payments', {
      data: null,
      error: { message: 'simulated payment insert failure' },
    });

    const config = useCreatePurchaseOrder() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({
        projectId: 'proj-1',
        vendorId: 'vendor-1',
        paymentPattern: 'fifty_fifty',
        totalCents: 100000,
        ffeItemIds: ['ffe-1'],
      })
    ).rejects.toThrow(/simulated payment insert failure/);

    // The compensating delete must have been called against purchase_orders
    // and scoped to the orphaned PO id.
    const poBuilder = builders.purchase_orders;
    const deletes = poBuilder.__chain.filter((c) => c.method === 'delete');
    expect(deletes).toHaveLength(1);

    // Walk the chain to confirm the delete was followed by .eq('id', 'po-orphan').
    const deleteIdx = poBuilder.__chain.findIndex((c) => c.method === 'delete');
    const afterDelete = poBuilder.__chain.slice(deleteIdx + 1);
    expect(afterDelete[0]).toEqual({ method: 'eq', args: ['id', 'po-orphan'] });

    // Step 3 should not have run.
    expect(builders.project_ffe_items).toBeUndefined();

    // Re-run with a fresh mock-state to capture the actual Error message and
    // confirm it surfaces both the original failure and the cleanup outcome.
    Object.keys(builders).forEach((k) => delete builders[k]);
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    queueTableResults(
      'purchase_orders',
      { data: { id: 'po-orphan-2', project_id: 'proj-1' }, error: null },
      { data: null, error: null }
    );
    setTableDefault('po_payments', {
      data: null,
      error: { message: 'simulated payment insert failure' },
    });

    let caughtError: Error | undefined;
    try {
      await (
        useCreatePurchaseOrder() as unknown as {
          mutationFn: (input: unknown) => Promise<unknown>;
        }
      ).mutationFn({
        projectId: 'proj-1',
        vendorId: 'vendor-1',
        paymentPattern: 'fifty_fifty',
        totalCents: 100000,
        ffeItemIds: [],
      });
    } catch (e) {
      caughtError = e as Error;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toMatch(/simulated payment insert failure/);
    expect(caughtError?.message).toMatch(/compensating delete succeeded/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useLogPaymentPaid
// ─────────────────────────────────────────────────────────────────────────────

describe('useLogPaymentPaid', () => {
  it('sets state=paid and paid_date when supplied', async () => {
    // Single update: returns a non-deposit row, so no flip logic runs.
    queueTableResults('po_payments', {
      data: {
        id: 'pay-1',
        purchase_order_id: 'po-1',
        kind: 'balance',
        state: 'paid',
        paid_date: '2026-05-01',
      },
      error: null,
    });

    const config = useLogPaymentPaid() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      paymentId: 'pay-1',
      purchaseOrderId: 'po-1',
      paidDate: '2026-05-01',
    });

    const builder = builders.po_payments;
    const update = builder.__chain.find((c) => c.method === 'update');
    expect(update?.args[0]).toEqual(
      expect.objectContaining({ state: 'paid', paid_date: '2026-05-01' })
    );
  });

  it('defaults paid_date to today (ISO yyyy-mm-dd) when not supplied', async () => {
    queueTableResults('po_payments', {
      data: { id: 'pay-1', purchase_order_id: 'po-1', kind: 'balance', state: 'paid' },
      error: null,
    });

    const config = useLogPaymentPaid() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({ paymentId: 'pay-1', purchaseOrderId: 'po-1' });

    const builder = builders.po_payments;
    const update = builder.__chain.find((c) => c.method === 'update');
    const payload = update?.args[0] as { state: string; paid_date: string };
    expect(payload.state).toBe('paid');
    expect(payload.paid_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('flips the sibling balance row to "due" when a deposit is paid on a shipped fifty_fifty PO', async () => {
    // The po_payments table-builder is hit three times in sequence:
    //   1. UPDATE (paying the deposit)  → returns the updated deposit row
    //   2. SELECT siblings              → returns [deposit, balance]
    //   3. UPDATE (flipping balance)    → no data needed
    queueTableResults(
      'po_payments',
      // 1. paid deposit row
      {
        data: {
          id: 'pay-deposit',
          purchase_order_id: 'po-1',
          kind: 'deposit',
          state: 'paid',
          paid_date: '2026-05-01',
        },
        error: null,
      },
      // 2. sibling rows
      {
        data: [
          { id: 'pay-deposit', kind: 'deposit', state: 'paid' },
          { id: 'pay-balance', kind: 'balance', state: 'pending' },
        ],
        error: null,
      },
      // 3. flip result
      { data: null, error: null }
    );

    // PO header lookup happens between calls 1 and 2 on po_payments.
    queueTableResults('purchase_orders', {
      data: { id: 'po-1', payment_pattern: 'fifty_fifty', status: 'shipped' },
      error: null,
    });

    const config = useLogPaymentPaid() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      paymentId: 'pay-deposit',
      purchaseOrderId: 'po-1',
      paidDate: '2026-05-01',
    });

    const builder = builders.po_payments;
    // First op: update to pay deposit.
    // Final op: update to flip balance → 'due'.
    const updates = builder.__chain.filter((c) => c.method === 'update');
    expect(updates).toHaveLength(2);
    expect(updates[0].args[0]).toEqual(
      expect.objectContaining({ state: 'paid', paid_date: '2026-05-01' })
    );
    expect(updates[1].args[0]).toEqual({ state: 'due' });

    // The flip targets the balance row's id.
    const eqArgs = builder.__chain.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqArgs).toContainEqual(['id', 'pay-balance']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SPRINT 2 — RECEIVING + DAMAGE CLAIMS + CALENDAR (migration 00150)
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// useCreateReceivingInspection
// ─────────────────────────────────────────────────────────────────────────────

describe('useCreateReceivingInspection', () => {
  it('clean outcome: INSERTs inspection, UPDATEs delivered_date + status, does NOT insert damage_claim', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    // Step 1: inspection INSERT → returns the new inspection row.
    queueTableResults('receiving_inspections', {
      data: {
        id: 'insp-clean',
        purchase_order_id: 'po-1',
        inspected_at: '2026-05-27T10:30:00.000Z',
        inspected_by: 'user-1',
        outcome: 'clean',
        notes: null,
        photo_asset_ids: [],
      },
      error: null,
    });

    // PO load (single() call).
    queueTableResults('purchase_orders', {
      data: {
        id: 'po-1',
        payment_pattern: 'fifty_fifty',
        status: 'shipped',
        delivered_date: null,
        vendor_po_number: 'WS-188',
        vendor: { id: 'vendor-1', name: 'Woodward Sectional Co.' },
      },
      error: null,
    });

    // PO UPDATE (steps 2/3) terminates via await — default suffices.
    setTableDefault('purchase_orders', { data: null, error: null });

    const config = useCreateReceivingInspection() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      purchaseOrderId: 'po-1',
      outcome: 'clean',
    });

    // 1. INSERT into receiving_inspections.
    const inspBuilder = builders.receiving_inspections;
    const inspInsert = inspBuilder.__chain.find((c) => c.method === 'insert');
    expect(inspInsert?.args[0]).toEqual(
      expect.objectContaining({
        purchase_order_id: 'po-1',
        inspected_by: 'user-1',
        outcome: 'clean',
        notes: null,
        photo_asset_ids: [],
      }),
    );

    // 2/3. UPDATE on purchase_orders with both delivered_date and status.
    const poBuilder = builders.purchase_orders;
    const poUpdate = poBuilder.__chain.find((c) => c.method === 'update');
    expect(poUpdate).toBeDefined();
    expect(poUpdate?.args[0]).toEqual(
      expect.objectContaining({
        delivered_date: '2026-05-27',
        status: 'delivered',
      }),
    );

    // 4. NO insert on damage_claims for a clean outcome.
    expect(builders.damage_claims).toBeUndefined();
  });

  it('damaged outcome: INSERTs inspection, UPDATEs PO, INSERTs drafted damage_claim with auto-drafted description', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    queueTableResults('receiving_inspections', {
      data: {
        id: 'insp-damaged',
        purchase_order_id: 'po-ap',
        inspected_at: '2026-05-26T14:15:00.000Z',
        inspected_by: 'user-1',
        outcome: 'damaged',
        notes: 'Chip on canopy of pendant cluster.',
        photo_asset_ids: [],
      },
      error: null,
    });

    queueTableResults('purchase_orders', {
      data: {
        id: 'po-ap',
        payment_pattern: 'fifty_fifty',
        status: 'shipped',
        delivered_date: null,
        vendor_po_number: 'AP-012',
        vendor: { id: 'vendor-ap', name: 'Apparatus Studio' },
      },
      error: null,
    });
    setTableDefault('purchase_orders', { data: null, error: null });
    setTableDefault('damage_claims', { data: null, error: null });

    const config = useCreateReceivingInspection() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      purchaseOrderId: 'po-ap',
      outcome: 'damaged',
      notes: 'Chip on canopy of pendant cluster.',
    });

    // 1. Inspection INSERT.
    const inspBuilder = builders.receiving_inspections;
    const inspInsert = inspBuilder.__chain.find((c) => c.method === 'insert');
    expect(inspInsert?.args[0]).toEqual(
      expect.objectContaining({
        purchase_order_id: 'po-ap',
        outcome: 'damaged',
        notes: 'Chip on canopy of pendant cluster.',
      }),
    );

    // 2/3. PO UPDATE.
    const poBuilder = builders.purchase_orders;
    const poUpdate = poBuilder.__chain.find((c) => c.method === 'update');
    expect(poUpdate?.args[0]).toEqual(
      expect.objectContaining({
        delivered_date: '2026-05-26',
        status: 'delivered',
      }),
    );

    // 4. damage_claims INSERT with state='drafted' and auto-drafted description.
    const claimBuilder = builders.damage_claims;
    expect(claimBuilder).toBeDefined();
    const claimInsert = claimBuilder.__chain.find((c) => c.method === 'insert');
    expect(claimInsert).toBeDefined();
    const claimRow = claimInsert?.args[0] as Record<string, unknown>;
    expect(claimRow.receiving_inspection_id).toBe('insp-damaged');
    expect(claimRow.state).toBe('drafted');
    // Description must contain vendor name AND PO number.
    expect(claimRow.description).toEqual(expect.stringContaining('Apparatus Studio'));
    expect(claimRow.description).toEqual(expect.stringContaining('PO AP-012'));
    // Inspection notes should be embedded too.
    expect(claimRow.description).toEqual(
      expect.stringContaining('Chip on canopy of pendant cluster.'),
    );
  });

  it('step 4 failure: compensating DELETE on receiving_inspections and combined error message', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    // 1. Inspection INSERT succeeds → returns id 'insp-orphan'.
    // 2. Compensating DELETE result (await, no .single()) → success.
    queueTableResults(
      'receiving_inspections',
      {
        data: {
          id: 'insp-orphan',
          purchase_order_id: 'po-x',
          inspected_at: '2026-05-26T14:15:00.000Z',
          inspected_by: 'user-1',
          outcome: 'damaged',
          notes: null,
          photo_asset_ids: [],
        },
        error: null,
      },
      // Compensating delete return value.
      { data: null, error: null },
    );

    queueTableResults('purchase_orders', {
      data: {
        id: 'po-x',
        payment_pattern: 'fifty_fifty',
        status: 'shipped',
        delivered_date: null,
        vendor_po_number: 'X-1',
        vendor: { id: 'vendor-x', name: 'Vendor X' },
      },
      error: null,
    });
    setTableDefault('purchase_orders', { data: null, error: null });

    // Step 4 (damage_claims INSERT) FAILS.
    setTableDefault('damage_claims', {
      data: null,
      error: { message: 'simulated damage_claim insert failure' },
    });

    const config = useCreateReceivingInspection() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    let caught: Error | undefined;
    try {
      await config.mutationFn({
        purchaseOrderId: 'po-x',
        outcome: 'damaged',
      });
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBeDefined();
    // Error must surface BOTH the original failure and the cleanup outcome.
    expect(caught?.message).toMatch(/simulated damage_claim insert failure/);
    expect(caught?.message).toMatch(/compensating delete succeeded/);

    // Verify the compensating DELETE on receiving_inspections scoped to the
    // orphaned inspection id.
    const inspBuilder = builders.receiving_inspections;
    const deletes = inspBuilder.__chain.filter((c) => c.method === 'delete');
    expect(deletes).toHaveLength(1);
    const deleteIdx = inspBuilder.__chain.findIndex((c) => c.method === 'delete');
    const afterDelete = inspBuilder.__chain.slice(deleteIdx + 1);
    expect(afterDelete[0]).toEqual({ method: 'eq', args: ['id', 'insp-orphan'] });
  });

  it('NET-30 step 6: UPDATEs po_payments due_date scoped to kind=balance AND state=pending', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    queueTableResults('receiving_inspections', {
      data: {
        id: 'insp-net30',
        purchase_order_id: 'po-net',
        inspected_at: '2026-05-27T10:30:00.000Z',
        inspected_by: 'user-1',
        outcome: 'clean',
        notes: null,
        photo_asset_ids: [],
      },
      error: null,
    });

    // PO row: net_30 + delivered_date IS NULL → triggers step 6.
    queueTableResults('purchase_orders', {
      data: {
        id: 'po-net',
        payment_pattern: 'net_30',
        status: 'shipped',
        delivered_date: null,
        vendor_po_number: 'NET-1',
        vendor: { id: 'vendor-net', name: 'NetVendor' },
      },
      error: null,
    });
    setTableDefault('purchase_orders', { data: null, error: null });
    setTableDefault('po_payments', { data: null, error: null });

    const config = useCreateReceivingInspection() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      purchaseOrderId: 'po-net',
      outcome: 'clean',
    });

    const payBuilder = builders.po_payments;
    expect(payBuilder).toBeDefined();

    // The UPDATE must shift due_date to delivered_date + 30 days.
    const update = payBuilder.__chain.find((c) => c.method === 'update');
    expect(update).toBeDefined();
    const updatePayload = update?.args[0] as { due_date: string };
    // inspected_at 2026-05-27 + 30 = 2026-06-26.
    expect(updatePayload.due_date).toBe('2026-06-26');

    // Filter scope must be kind = balance AND state = pending AND PO id.
    const eqArgs = payBuilder.__chain.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqArgs).toContainEqual(['purchase_order_id', 'po-net']);
    expect(eqArgs).toContainEqual(['kind', 'balance']);
    expect(eqArgs).toContainEqual(['state', 'pending']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useDeliveryCalendar
// ─────────────────────────────────────────────────────────────────────────────

describe('useDeliveryCalendar', () => {
  it('keys by both range dates and returns rows for both event_type discriminants', async () => {
    setTableDefault('delivery_events', {
      data: [
        {
          event_id: 'po-1',
          event_type: 'delivery_expected',
          project_id: 'proj-1',
          project_name: 'Project Alpha',
          purchase_order_id: 'po-1',
          vendor_id: 'vendor-1',
          vendor_name: 'Vendor One',
          event_date: '2026-06-01',
          po_status: 'shipped',
          delivered_date: null,
          ffe_item_count: 3,
          line_total_cents: 100000,
          inspection_id: null,
          inspection_outcome: null,
          phase_key: null,
        },
        {
          event_id: 'phase-2',
          event_type: 'install_milestone',
          project_id: 'proj-1',
          project_name: 'Project Alpha',
          purchase_order_id: null,
          vendor_id: null,
          vendor_name: null,
          event_date: '2026-06-05',
          po_status: null,
          delivered_date: null,
          ffe_item_count: null,
          line_total_cents: null,
          inspection_id: null,
          inspection_outcome: null,
          phase_key: 'install_kickoff',
        },
      ],
      error: null,
    });

    const config = useDeliveryCalendar('2026-06-01', '2026-06-30') as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown[]>;
      enabled: boolean;
    };

    // Query key includes BOTH range dates.
    expect(config.queryKey).toEqual(['delivery-calendar', '2026-06-01', '2026-06-30']);
    expect(config.enabled).toBe(true);

    const rows = await config.queryFn();
    expect(rows).toHaveLength(2);

    // The response includes both event types.
    const types = (rows as Array<{ event_type: string }>).map((r) => r.event_type);
    expect(types).toContain('delivery_expected');
    expect(types).toContain('install_milestone');

    // Source table is the delivery_events view.
    expect(supabaseClient.from).toHaveBeenCalledWith('delivery_events');

    // Range filter is applied via gte/lte on event_date.
    const builder = builders.delivery_events;
    const gteArgs = builder.__chain.filter((c) => c.method === 'gte').map((c) => c.args);
    const lteArgs = builder.__chain.filter((c) => c.method === 'lte').map((c) => c.args);
    expect(gteArgs).toContainEqual(['event_date', '2026-06-01']);
    expect(lteArgs).toContainEqual(['event_date', '2026-06-30']);
  });

  it('is disabled when either range bound is empty', () => {
    const configEmpty = useDeliveryCalendar('', '2026-06-30') as unknown as {
      enabled: boolean;
    };
    expect(configEmpty.enabled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useTodayProcurementCounts
// ─────────────────────────────────────────────────────────────────────────────

describe('useTodayProcurementCounts', () => {
  it('fires three independent sub-queries and aggregates their counts', async () => {
    setTableDefault('purchase_orders', { data: null, error: null, count: 4 } as unknown as {
      data: unknown;
      error: unknown;
    });
    setTableDefault('receiving_inspections', {
      data: null,
      error: null,
      count: 2,
    } as unknown as { data: unknown; error: unknown });
    setTableDefault('damage_claims', { data: null, error: null, count: 1 } as unknown as {
      data: unknown;
      error: unknown;
    });

    const config = useTodayProcurementCounts() as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<{ arrivingThisWeek: number; inspectionsPending: number; damageClaimsOpen: number }>;
      staleTime: number;
    };

    expect(config.queryKey).toEqual(['today-procurement-counts']);
    expect(config.staleTime).toBe(5 * 60 * 1000);

    const counts = await config.queryFn();
    expect(counts).toEqual({
      arrivingThisWeek: 4,
      inspectionsPending: 2,
      damageClaimsOpen: 1,
    });

    // Each sub-query must hit its own table — proves independence.
    const fromCalls = (
      supabaseClient.from as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.map((c) => c[0] as string);
    expect(fromCalls).toContain('purchase_orders');
    expect(fromCalls).toContain('receiving_inspections');
    expect(fromCalls).toContain('damage_claims');
  });

  it('returns 0 for the failing sub-query and still resolves the others', async () => {
    // arrivingThisWeek fails; the other two succeed with concrete counts.
    setTableDefault('purchase_orders', {
      data: null,
      error: { message: 'boom' },
    } as unknown as { data: unknown; error: unknown });
    setTableDefault('receiving_inspections', {
      data: null,
      error: null,
      count: 7,
    } as unknown as { data: unknown; error: unknown });
    setTableDefault('damage_claims', { data: null, error: null, count: 3 } as unknown as {
      data: unknown;
      error: unknown;
    });

    const config = useTodayProcurementCounts() as unknown as {
      queryFn: () => Promise<{ arrivingThisWeek: number; inspectionsPending: number; damageClaimsOpen: number }>;
    };

    // The hook must NOT throw — it must surface the partial result with the
    // failing tile zeroed.
    const counts = await config.queryFn();
    expect(counts).toEqual({
      arrivingThisWeek: 0,
      inspectionsPending: 7,
      damageClaimsOpen: 3,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateDamageClaim
// ─────────────────────────────────────────────────────────────────────────────

describe('useUpdateDamageClaim', () => {
  it('drafted → vendor_notified sets vendor_notified_at = now() when not supplied', async () => {
    // Sequential calls to damage_claims:
    //   1. SELECT current state via .single() → returns 'drafted'.
    //   2. UPDATE → returns the updated row via .single().
    queueTableResults(
      'damage_claims',
      // 1. current state
      { data: { id: 'claim-1', state: 'drafted' }, error: null },
      // 2. update result
      {
        data: {
          id: 'claim-1',
          state: 'vendor_notified',
          vendor_notified_at: '2026-05-27T00:00:00.000Z',
        },
        error: null,
      },
    );

    const config = useUpdateDamageClaim() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    const before = Date.now();
    await config.mutationFn({ id: 'claim-1', state: 'vendor_notified' });
    const after = Date.now();

    const builder = builders.damage_claims;
    const updates = builder.__chain.filter((c) => c.method === 'update');
    expect(updates).toHaveLength(1);

    const payload = updates[0].args[0] as {
      state: string;
      vendor_notified_at: string;
      resolved_at?: string;
    };
    expect(payload.state).toBe('vendor_notified');
    expect(payload.vendor_notified_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // The defaulted ISO timestamp must be wall-clock-now (between before/after).
    const ts = Date.parse(payload.vendor_notified_at);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    // Resolved_at must NOT be set on this transition.
    expect(payload.resolved_at).toBeUndefined();
  });

  it('vendor_notified → resolved sets resolved_at = now() when not supplied', async () => {
    queueTableResults(
      'damage_claims',
      // 1. current state
      { data: { id: 'claim-2', state: 'vendor_notified' }, error: null },
      // 2. update result
      {
        data: {
          id: 'claim-2',
          state: 'resolved',
          resolved_at: '2026-05-27T00:00:00.000Z',
        },
        error: null,
      },
    );

    const config = useUpdateDamageClaim() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    const before = Date.now();
    await config.mutationFn({ id: 'claim-2', state: 'resolved' });
    const after = Date.now();

    const builder = builders.damage_claims;
    const updates = builder.__chain.filter((c) => c.method === 'update');
    expect(updates).toHaveLength(1);
    const payload = updates[0].args[0] as {
      state: string;
      resolved_at: string;
      vendor_notified_at?: string;
    };
    expect(payload.state).toBe('resolved');
    expect(payload.resolved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const ts = Date.parse(payload.resolved_at);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    // vendor_notified_at must NOT be re-set on this transition.
    expect(payload.vendor_notified_at).toBeUndefined();
  });

  it('rejects backwards transitions (vendor_notified → drafted)', async () => {
    queueTableResults('damage_claims', {
      data: { id: 'claim-3', state: 'vendor_notified' },
      error: null,
    });

    const config = useUpdateDamageClaim() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({ id: 'claim-3', state: 'drafted' }),
    ).rejects.toThrow(/Invalid damage_claim state transition/);
  });
});
