import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
//
// Mirror the use-phase-deliverables / use-phase-templates rigs but extend the
// builder so a single table-builder can return different results for each
// successive terminal call (.single() / await). useUpdateDamageClaim and
// useUpdatePurchaseOrderETA both perform a read-then-update against the same
// underlying table and need distinct responses per call. RPC-backed hooks
// (useCreatePurchaseOrder / useLogPOAcknowledgment, 00186) go through
// supabaseClient.rpc instead.
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
  is: any;
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
  builder.is = record('is');

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
  // RPC mock — W3-T1 (00186): create_purchase_order / log_po_acknowledgment.
  rpc: vi.fn(),
  // Phase 4 — Stripe Checkout dispatch (useStartPoCheckout).
  functions: { invoke: vi.fn() },
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
  // W1-T5 — cross-project FF&E items (rows-per-item By Status view)
  useProcurementItems,
  usePOPayments,
  fetchPOPayments,
  useCreatePurchaseOrder,
  // Phase 4 — Stripe Checkout, designer pays at order time (Order via Patina)
  useStartPoCheckout,
  // W3-T1 — atomic create RPC + vendor acknowledgment (migration 00186)
  useLogPOAcknowledgment,
  useLogPaymentPaid,
  // Sprint 2 — Receiving, damage claims, calendar
  useDeliveryCalendar,
  useTodayProcurementCounts,
  useCreateReceivingInspection,
  useUpdateDamageClaim,
  useUpdatePurchaseOrderETA,
  // Wave 1 procurement overhaul — DB triggers (00184) own state propagation
  useAdvancePaymentToDue,
  useUpdatePurchaseOrderStatus,
  invalidateFfeCaches,
  // Sprint 3 — QBO export
  useQboExport,
  useQboExportPreview,
  // Wave 4 / W4-T3 — po-send edge function
  useSendPurchaseOrder,
  // Sprint 3 / Wave 3.2 — Procurement notifications
  useProcurementNotifications,
  useProcurementUnreadCount,
  useMarkProcurementNotificationRead,
  // Sprint 3 / Wave 3.3 — Capture-to-slot integration
  useAssignProductToFfeSlot,
} from '../use-procurement';
import type { QboExportInput, SendPurchaseOrderInput } from '../use-procurement';

beforeEach(() => {
  Object.keys(builders).forEach((k) => delete builders[k]);
  invalidateQueries.mockReset();
  supabaseClient.auth.getUser.mockReset();
  supabaseClient.auth.getSession.mockReset();
  supabaseClient.rpc.mockReset();
  supabaseClient.functions.invoke.mockReset();
  // Clear the table-call log so cross-table ordering assertions (which use
  // indexOf over from.mock.calls) never see calls from earlier tests.
  supabaseClient.from.mockClear();
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
// useProcurementItems  (W1-T5 — rows-per-item By Status view)
// ─────────────────────────────────────────────────────────────────────────────

describe('useProcurementItems', () => {
  it('uses the canonical query key (filters default to {}) and selects from project_ffe_items with the PO/project/room joins', async () => {
    const builder = setTableDefault('project_ffe_items', { data: [], error: null });

    const config = useProcurementItems() as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown[]>;
    };

    expect(config.queryKey).toEqual(['procurement-items', {}]);

    const rows = await config.queryFn();
    expect(rows).toEqual([]);
    expect(supabaseClient.from).toHaveBeenCalledWith('project_ffe_items');

    // The select must embed the joined PO (with vendor + payments), project,
    // and room so the By Status view can render per-item rows without N+1s.
    const selectCalls = builder.__chain.filter((c) => c.method === 'select');
    expect(selectCalls).toHaveLength(1);
    const selectStr = String(selectCalls[0].args[0]);
    expect(selectStr).toContain('purchase_order:purchase_orders');
    expect(selectStr).toContain('vendor:vendors');
    expect(selectStr).toContain('payments:po_payments(*)');
    expect(selectStr).toContain('project:projects');
    expect(selectStr).toContain('room:project_rooms');
    // W5-T2 — expediting columns: the By Status view reads our outbound PO
    // number plus the Ordered / Ack / no-ack-flag timestamps off the join.
    expect(selectStr).toContain('po_number');
    expect(selectStr).toContain('sent_at');
    expect(selectStr).toContain('acknowledged_at');
    expect(selectStr).toContain('created_at');

    // No filters supplied → no .eq calls.
    expect(builder.__chain.filter((c) => c.method === 'eq')).toEqual([]);
  });

  it('orders by sort_order then created_at (both ascending), matching the FF&E board hooks', async () => {
    const builder = setTableDefault('project_ffe_items', { data: [], error: null });

    const config = useProcurementItems() as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    await config.queryFn();

    const orderArgs = builder.__chain.filter((c) => c.method === 'order').map((c) => c.args);
    expect(orderArgs).toEqual([
      ['sort_order', { ascending: true }],
      ['created_at', { ascending: true }],
    ]);
  });

  it('applies projectId/vendorId/purchaseOrderId filters server-side via .eq and embeds them in the queryKey', async () => {
    const builder = setTableDefault('project_ffe_items', { data: [], error: null });
    const filters = {
      projectId: 'proj-1',
      vendorId: 'vendor-1',
      purchaseOrderId: 'po-1',
    };

    const config = useProcurementItems(filters) as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown[]>;
    };

    expect(config.queryKey).toEqual(['procurement-items', filters]);
    await config.queryFn();

    const eqArgs = builder.__chain.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqArgs).toEqual([
      ['project_id', 'proj-1'],
      ['vendor_id', 'vendor-1'],
      ['purchase_order_id', 'po-1'],
    ]);
  });

  it('returns the joined rows as-is (no client-side reshaping)', async () => {
    const row = {
      id: 'ffe-1',
      project_id: 'proj-1',
      project_room_id: 'room-1',
      purchase_order_id: 'po-1',
      name: 'Cloud Pendant Cluster 19',
      status: 'shipped',
      line_total_cents: 420000,
      sort_order: 0,
      purchase_order: {
        id: 'po-1',
        status: 'shipped',
        vendor_po_number: 'AP-012',
        confirmed_eta: '2026-06-20',
        total_cents: 420000,
        payment_pattern: 'fifty_fifty',
        is_patina_catalog: false,
        vendor: { id: 'vendor-ap', name: 'Apparatus' },
        payments: [
          { id: 'pay-1', purchase_order_id: 'po-1', kind: 'deposit', state: 'paid', sort_order: 0 },
        ],
      },
      project: { id: 'proj-1', name: 'Olsen Lake House' },
      room: { id: 'room-1', name: 'Great Room' },
    };
    setTableDefault('project_ffe_items', { data: [row], error: null });

    const config = useProcurementItems() as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    const rows = await config.queryFn();
    expect(rows).toEqual([row]);
  });

  it('throws when supabase returns an error', async () => {
    setTableDefault('project_ffe_items', { data: null, error: new Error('rls denied') });
    const config = useProcurementItems() as unknown as { queryFn: () => Promise<unknown> };
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
// fetchPOPayments  (Phase 4 — one-shot resolver behind OrderViaPatina's
// checkout handoff; extracted so usePOPayments and the imperative caller
// share one query.)
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchPOPayments', () => {
  it('selects po_payments by purchase_order_id ordered by sort_order ascending', async () => {
    const builder = setTableDefault('po_payments', {
      data: [{ id: 'p1', purchase_order_id: 'po1', kind: 'deposit', state: 'pending', sort_order: 0 }],
      error: null,
    });

    const rows = await fetchPOPayments('po1');

    expect(rows).toEqual([
      { id: 'p1', purchase_order_id: 'po1', kind: 'deposit', state: 'pending', sort_order: 0 },
    ]);
    expect(supabaseClient.from).toHaveBeenCalledWith('po_payments');
    expect(builder.__chain.find((c) => c.method === 'eq')?.args).toEqual([
      'purchase_order_id',
      'po1',
    ]);
  });

  it('returns [] when data is null and throws on a query error', async () => {
    setTableDefault('po_payments', { data: null, error: null });
    await expect(fetchPOPayments('po1')).resolves.toEqual([]);

    setTableDefault('po_payments', { data: null, error: new Error('rls denied') });
    await expect(fetchPOPayments('po1')).rejects.toThrow('rls denied');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useStartPoCheckout  (Phase 4 — Stripe Checkout, designer pays at order
// time. Dispatches { po_payment_id } on the shared create-checkout-session
// edge function; mirrors useStartCheckout's error-surfacing exactly.)
// ─────────────────────────────────────────────────────────────────────────────

describe('useStartPoCheckout', () => {
  it('invokes create-checkout-session with { po_payment_id } and resolves { url }', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: { url: 'https://checkout.stripe.com/session-abc' },
      error: null,
    });

    const config = useStartPoCheckout() as unknown as {
      mutationFn: (input: { poPaymentId: string }) => Promise<{ url: string }>;
    };

    const result = await config.mutationFn({ poPaymentId: 'pp-1' });

    expect(supabaseClient.functions.invoke).toHaveBeenCalledWith('create-checkout-session', {
      body: { po_payment_id: 'pp-1' },
    });
    expect(result).toEqual({ url: 'https://checkout.stripe.com/session-abc' });
  });

  it('omits meta when no errorSurface option is given (default global toast)', () => {
    const config = useStartPoCheckout() as unknown as { meta: unknown };
    expect(config.meta).toBeUndefined();
  });

  it('sets meta.errorSurface = "inline" when requested (R83 — caller renders its own failure state)', () => {
    const config = useStartPoCheckout({ errorSurface: 'inline' }) as unknown as {
      meta: { errorSurface?: string };
    };
    expect(config.meta).toEqual({ errorSurface: 'inline' });
  });

  it('surfaces the edge function JSON detail over the generic error message (e.g. 409 already paid)', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({
            error: 'po_payment_already_paid',
            detail: 'This purchase-order payment has already been paid.',
          }),
        },
      },
    });

    const config = useStartPoCheckout() as unknown as {
      mutationFn: (input: { poPaymentId: string }) => Promise<unknown>;
    };

    await expect(config.mutationFn({ poPaymentId: 'pp-paid' })).rejects.toThrow(
      'This purchase-order payment has already been paid.',
    );
  });

  it('falls back to the error code when the JSON body has no detail (e.g. 404 not found)', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'po_payment_not_found' }) },
      },
    });

    const config = useStartPoCheckout() as unknown as {
      mutationFn: (input: { poPaymentId: string }) => Promise<unknown>;
    };

    await expect(config.mutationFn({ poPaymentId: 'pp-missing' })).rejects.toThrow(
      'po_payment_not_found',
    );
  });

  it('falls back to the generic FunctionsHttpError message when the body cannot be parsed', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Failed to fetch', context: undefined },
    });

    const config = useStartPoCheckout() as unknown as {
      mutationFn: (input: { poPaymentId: string }) => Promise<unknown>;
    };

    await expect(config.mutationFn({ poPaymentId: 'pp-x' })).rejects.toThrow('Failed to fetch');
  });

  it('throws data.detail ?? data.error when the function returns 200 with a soft error body', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: { error: 'po_not_patina_catalog', detail: 'This purchase order is paid directly with the vendor, not through Patina.' },
      error: null,
    });

    const config = useStartPoCheckout() as unknown as {
      mutationFn: (input: { poPaymentId: string }) => Promise<unknown>;
    };

    await expect(config.mutationFn({ poPaymentId: 'pp-noncatalog' })).rejects.toThrow(
      'This purchase order is paid directly with the vendor, not through Patina.',
    );
  });

  it('throws "No checkout URL returned" when the function resolves without a url', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({ data: {}, error: null });

    const config = useStartPoCheckout() as unknown as {
      mutationFn: (input: { poPaymentId: string }) => Promise<unknown>;
    };

    await expect(config.mutationFn({ poPaymentId: 'pp-y' })).rejects.toThrow(
      'No checkout URL returned',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useCreatePurchaseOrder
// ─────────────────────────────────────────────────────────────────────────────

describe('useCreatePurchaseOrder', () => {
  const createdPo = {
    id: 'po-new',
    designer_id: 'user-1',
    project_id: 'proj-1',
    vendor_id: 'vendor-1',
    payment_pattern: 'fifty_fifty',
    // Server-computed TRADE total (00186) — the client no longer sends one.
    total_cents: 210000,
    status: 'draft',
    sidemark: null,
    acknowledged_at: null,
  };

  it('calls the create_purchase_order RPC with the item ids and NO client-computed total', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: createdPo, error: null });

    const config = useCreatePurchaseOrder() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    const result = await config.mutationFn({
      projectId: 'proj-1',
      vendorId: 'vendor-1',
      paymentPattern: 'fifty_fifty',
      ffeItemIds: ['ffe-1', 'ffe-2'],
      depositDueDate: '2026-07-01',
      depositAmountCents: 100000,
    });

    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
    const [fnName, payload] = supabaseClient.rpc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(fnName).toBe('create_purchase_order');
    expect(payload).toEqual({
      p_project_id: 'proj-1',
      p_vendor_id: 'vendor-1',
      p_payment_pattern: 'fifty_fifty',
      p_ffe_item_ids: ['ffe-1', 'ffe-2'],
      p_vendor_po_number: null,
      p_confirmed_eta: null,
      p_is_patina_catalog: false,
      p_deposit_due_date: '2026-07-01',
      p_deposit_amount_cents: 100000,
      p_custom_milestones: [],
      p_sidemark: null,
      p_notes: null,
    });

    // The total is server-computed — no totalCents key may leak into the
    // payload under any name.
    expect(Object.keys(payload)).not.toContain('totalCents');
    expect(Object.keys(payload)).not.toContain('p_total_cents');

    // The mutation resolves with the RPC's purchase_orders row as-is —
    // onSuccess consumers read .id and .project_id off it.
    expect(result).toEqual(createdPo);

    // The atomic RPC owns header + payments + linking — the hook must not
    // touch any table directly (no compensating-delete machinery left).
    expect(supabaseClient.from).not.toHaveBeenCalled();
    expect(supabaseClient.auth.getUser).not.toHaveBeenCalled();
  });

  it('maps optional fields (vendor PO number, ETA, catalog flag, sidemark, notes) onto the RPC payload', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: { ...createdPo, id: 'po-opt', sidemark: 'Middlewest / Olsen / Lake House / Great Room' },
      error: null,
    });

    const config = useCreatePurchaseOrder() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      projectId: 'proj-1',
      vendorId: 'vendor-1',
      vendorPoNumber: 'NA-2026-001',
      confirmedEta: '2026-08-15',
      paymentPattern: 'net_30',
      isPatinaCatalog: true,
      ffeItemIds: ['ffe-1'],
      sidemark: 'Middlewest / Olsen / Lake House / Great Room',
      notes: 'White-glove delivery only.',
    });

    const [, payload] = supabaseClient.rpc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(payload).toEqual(
      expect.objectContaining({
        p_vendor_po_number: 'NA-2026-001',
        p_confirmed_eta: '2026-08-15',
        p_payment_pattern: 'net_30',
        p_is_patina_catalog: true,
        p_sidemark: 'Middlewest / Olsen / Lake House / Great Room',
        p_notes: 'White-glove delivery only.',
      })
    );
  });

  it('maps customMilestones to the snake_case JSONB shape the RPC consumes', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: { ...createdPo, id: 'po-cm', payment_pattern: 'custom_milestones' },
      error: null,
    });

    const config = useCreatePurchaseOrder() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      projectId: 'proj-3',
      vendorId: 'vendor-3',
      paymentPattern: 'custom_milestones',
      ffeItemIds: ['ffe-9'],
      customMilestones: [
        { label: 'Deposit — 30%', amountCents: 288000, dueDate: '2026-03-15', sortOrder: 0 },
        { label: 'Mid-production — 40%', amountCents: 384000, sortOrder: 1 },
        { label: 'Before ship — 30%', amountCents: 288000, sortOrder: 2 },
      ],
    });

    const [, payload] = supabaseClient.rpc.mock.calls[0] as [
      string,
      { p_custom_milestones: Array<Record<string, unknown>> },
    ];
    expect(payload.p_custom_milestones).toEqual([
      { label: 'Deposit — 30%', amount_cents: 288000, due_date: '2026-03-15', sort_order: 0 },
      { label: 'Mid-production — 40%', amount_cents: 384000, due_date: null, sort_order: 1 },
      { label: 'Before ship — 30%', amount_cents: 288000, due_date: null, sort_order: 2 },
    ]);
  });

  it('throws a contextual error when the RPC rejects (server-side guard raised)', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: null,
      error: {
        message:
          'create_purchase_order: 1 FF&E item(s) are blocked pending a client decision',
      },
    });

    const config = useCreatePurchaseOrder() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({
        projectId: 'proj-1',
        vendorId: 'vendor-1',
        paymentPattern: 'fifty_fifty',
        ffeItemIds: ['ffe-blocked'],
      })
    ).rejects.toThrow(/blocked pending a client decision/);
  });

  it('onSuccess invalidates PO keys AND both FF&E namespaces (00184 ratchet trigger advances items)', () => {
    const config = useCreatePurchaseOrder() as unknown as {
      onSuccess: (po: { id: string; project_id: string }) => void;
    };

    config.onSuccess({ id: 'po-new', project_id: 'proj-1' });

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['purchase-orders']);
    expect(invalidatedKeys).toContainEqual(['purchase-order', 'po-new']);
    expect(invalidatedKeys).toContainEqual(['po-payments', 'po-new']);
    // invalidateFfeCaches: package namespace + portal namespace + cross-project view.
    expect(invalidatedKeys).toContainEqual(['project-ffe-items', 'proj-1']);
    expect(invalidatedKeys).toContainEqual(['projects', 'proj-1']);
    expect(invalidatedKeys).toContainEqual(['procurement-items']);
    // W3-T2 (00187): ordering changes what the invoice soft-gate shows next.
    expect(invalidatedKeys).toContainEqual(['ffe-invoice-coverage', 'proj-1']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useLogPOAcknowledgment  (W3-T1 — migration 00186)
// ─────────────────────────────────────────────────────────────────────────────

describe('useLogPOAcknowledgment', () => {
  const ackedPo = {
    id: 'po-ack',
    project_id: 'proj-1',
    status: 'confirmed',
    vendor_po_number: 'ACK-123',
    confirmed_eta: '2026-08-01',
    acknowledged_at: '2026-06-11T10:00:00.000Z',
  };

  it('calls the log_po_acknowledgment RPC with coalesce-safe NULLs for omitted fields', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: ackedPo, error: null });

    const config = useLogPOAcknowledgment() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    const result = await config.mutationFn({ purchaseOrderId: 'po-ack' });

    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
    const [fnName, payload] = supabaseClient.rpc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(fnName).toBe('log_po_acknowledgment');
    // NULL args tell the RPC to preserve the existing vendor_po_number /
    // confirmed_eta (COALESCE server-side).
    expect(payload).toEqual({
      p_po_id: 'po-ack',
      p_vendor_po_number: null,
      p_confirmed_eta: null,
    });

    expect(result).toEqual(ackedPo);
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });

  it('passes vendorPoNumber and confirmedEta through when supplied', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: ackedPo, error: null });

    const config = useLogPOAcknowledgment() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      purchaseOrderId: 'po-ack',
      vendorPoNumber: 'ACK-123',
      confirmedEta: '2026-08-01',
    });

    const [, payload] = supabaseClient.rpc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(payload).toEqual({
      p_po_id: 'po-ack',
      p_vendor_po_number: 'ACK-123',
      p_confirmed_eta: '2026-08-01',
    });
  });

  it('throws a contextual error when the RPC rejects (wrong status / non-owner)', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: null,
      error: {
        message:
          'log_po_acknowledgment: purchase order po-shipped is shipped, expected draft or confirmed',
      },
    });

    const config = useLogPOAcknowledgment() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({ purchaseOrderId: 'po-shipped' })
    ).rejects.toThrow(/expected draft or confirmed/);
  });

  it('onSuccess invalidates the PO list, the single-PO key, and the By Status item rows', () => {
    const config = useLogPOAcknowledgment() as unknown as {
      onSuccess: (po: { id: string }) => void;
    };

    config.onSuccess({ id: 'po-ack' });

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['purchase-orders']);
    expect(invalidatedKeys).toContainEqual(['purchase-order', 'po-ack']);
    expect(invalidatedKeys).toContainEqual(['procurement-items']);
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

  it('performs exactly ONE update (the paid row) — the sibling balance flip is owned by DB trigger 00184', async () => {
    // A deposit paid on a shipped split-pattern PO used to make the hook
    // read the PO + siblings and flip the balance row client-side. Trigger D
    // (trg_deposit_paid_flips_balance, migration 00184) owns that flip now —
    // the hook must issue a single UPDATE and touch nothing else.
    queueTableResults('po_payments', {
      data: {
        id: 'pay-deposit',
        purchase_order_id: 'po-1',
        kind: 'deposit',
        state: 'paid',
        paid_date: '2026-05-01',
      },
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

    // Exactly one UPDATE on po_payments, scoped to the paid row's id.
    const builder = builders.po_payments;
    const updates = builder.__chain.filter((c) => c.method === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toEqual(
      expect.objectContaining({ state: 'paid', paid_date: '2026-05-01' })
    );
    const eqArgs = builder.__chain.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqArgs).toEqual([['id', 'pay-deposit']]);

    // No PO read and no sibling read/flip — purchase_orders is never touched.
    expect(builders.purchase_orders).toBeUndefined();
  });

  it('keeps the po-payments / purchase-orders invalidations on success', () => {
    const config = useLogPaymentPaid() as unknown as {
      onSuccess: (result: unknown, input: { purchaseOrderId: string }) => void;
    };

    config.onSuccess({}, { purchaseOrderId: 'po-1' });

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['po-payments', 'po-1']);
    expect(invalidatedKeys).toContainEqual(['purchase-orders']);
    expect(invalidatedKeys).toContainEqual(['purchase-order', 'po-1']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SPRINT 2 — RECEIVING + DAMAGE CLAIMS + CALENDAR (migration 00150)
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// useCreateReceivingInspection
// ─────────────────────────────────────────────────────────────────────────────

describe('useCreateReceivingInspection', () => {
  it('clean outcome: INSERTs the inspection and NOTHING else — PO/payment/item side effects are owned by DB trigger 00184', async () => {
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

    const config = useCreateReceivingInspection() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    const result = (await config.mutationFn({
      purchaseOrderId: 'po-1',
      outcome: 'clean',
    })) as { inspection: { id: string }; damageClaimCreated: boolean };

    // W3.5.5 HIGH-1: clean outcome → no damage_claim INSERT → false.
    expect(result.damageClaimCreated).toBe(false);
    expect(result.inspection.id).toBe('insp-clean');

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

    // Trigger C (trg_receiving_inspection_side_effects) owns the
    // delivered_date stamp, status advance, net-30 shift, and
    // received_quantity stamping — the hook must never touch these tables.
    expect(builders.purchase_orders).toBeUndefined();
    expect(builders.po_payments).toBeUndefined();
    expect(builders.project_ffe_items).toBeUndefined();

    // NO insert on damage_claims for a clean outcome.
    expect(builders.damage_claims).toBeUndefined();
  });

  it('damaged outcome: INSERTs inspection, reads (never writes) the PO, INSERTs drafted damage_claim with auto-drafted description', async () => {
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

    // PO read — only to source vendor name + PO number for the description.
    queueTableResults('purchase_orders', {
      data: {
        id: 'po-ap',
        vendor_po_number: 'AP-012',
        vendor: { id: 'vendor-ap', name: 'Apparatus Studio' },
      },
      error: null,
    });
    setTableDefault('damage_claims', { data: null, error: null });

    const config = useCreateReceivingInspection() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    const result = (await config.mutationFn({
      purchaseOrderId: 'po-ap',
      outcome: 'damaged',
      notes: 'Chip on canopy of pendant cluster.',
    })) as { inspection: { id: string }; damageClaimCreated: boolean };

    // W3.5.5 HIGH-1: the resolved value must expose damageClaimCreated=true
    // when the claim INSERT succeeded, so callers can gate the
    // procurement_damage_claim_created analytics event accurately.
    expect(result.damageClaimCreated).toBe(true);
    expect(result.inspection.id).toBe('insp-damaged');

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

    // The PO is read (for the description) but never UPDATEd — the
    // delivered_date stamp belongs to trigger 00184 now.
    const poBuilder = builders.purchase_orders;
    expect(poBuilder.__chain.find((c) => c.method === 'update')).toBeUndefined();
    expect(poBuilder.__chain.find((c) => c.method === 'select')).toBeDefined();

    // 2. damage_claims INSERT with state='drafted' and auto-drafted description.
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

  it('damage-claim INSERT failure: compensating DELETE on receiving_inspections and combined error message', async () => {
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

    // PO read (description sourcing only).
    queueTableResults('purchase_orders', {
      data: {
        id: 'po-x',
        vendor_po_number: 'X-1',
        vendor: { id: 'vendor-x', name: 'Vendor X' },
      },
      error: null,
    });

    // Step 2 (damage_claims INSERT) FAILS.
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

  it('onSuccess invalidates the procurement keys plus FF&E namespaces when projectId is supplied', () => {
    const config = useCreateReceivingInspection() as unknown as {
      onSuccess: (
        result: { inspection: { purchase_order_id: string } },
        variables: { purchaseOrderId: string; outcome: string; projectId?: string },
      ) => void;
    };

    config.onSuccess(
      { inspection: { purchase_order_id: 'po-1' } },
      { purchaseOrderId: 'po-1', outcome: 'clean', projectId: 'proj-1' },
    );

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['receiving-inspections']);
    expect(invalidatedKeys).toContainEqual(['damage-claims']);
    expect(invalidatedKeys).toContainEqual(['purchase-orders']);
    expect(invalidatedKeys).toContainEqual(['purchase-order', 'po-1']);
    // The 00184 triggers may shift/flip the balance payment row.
    expect(invalidatedKeys).toContainEqual(['po-payments', 'po-1']);
    expect(invalidatedKeys).toContainEqual(['today-procurement-counts']);
    // FF&E dual-namespace bridge — the trigger advances item rows server-side.
    expect(invalidatedKeys).toContainEqual(['project-ffe-items', 'proj-1']);
    expect(invalidatedKeys).toContainEqual(['projects', 'proj-1']);
  });

  it('onSuccess skips the FF&E invalidations when projectId is absent', () => {
    const config = useCreateReceivingInspection() as unknown as {
      onSuccess: (
        result: { inspection: { purchase_order_id: string } },
        variables: { purchaseOrderId: string; outcome: string; projectId?: string },
      ) => void;
    };

    config.onSuccess(
      { inspection: { purchase_order_id: 'po-1' } },
      { purchaseOrderId: 'po-1', outcome: 'clean' },
    );

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['receiving-inspections']);
    expect(
      invalidatedKeys.filter(
        (k) => (k as unknown[])[0] === 'project-ffe-items' || (k as unknown[])[0] === 'projects',
      ),
    ).toEqual([]);
  });

  // ─── W5-T2 — per-item received quantities (partial receiving) ─────────────

  it('partial outcome with items[]: UPDATEs project_ffe_items.received_quantity per row, scoped by id', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    queueTableResults('receiving_inspections', {
      data: {
        id: 'insp-partial',
        purchase_order_id: 'po-1',
        inspected_at: '2026-06-12T10:00:00.000Z',
        inspected_by: 'user-1',
        outcome: 'partial',
        notes: null,
        photo_asset_ids: [],
      },
      error: null,
    });
    // PO read for the damage-claim description (partial != clean → claim).
    queueTableResults('purchase_orders', {
      data: {
        id: 'po-1',
        vendor_po_number: 'AP-012',
        vendor: { id: 'vendor-ap', name: 'Apparatus' },
      },
      error: null,
    });
    setTableDefault('damage_claims', { data: null, error: null });
    setTableDefault('project_ffe_items', { data: null, error: null });

    const config = useCreateReceivingInspection() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    const result = (await config.mutationFn({
      purchaseOrderId: 'po-1',
      outcome: 'partial',
      items: [
        { ffeItemId: 'ffe-1', receivedQuantity: 2, orderedQuantity: 3 },
        { ffeItemId: 'ffe-2', receivedQuantity: 1, orderedQuantity: 1 },
      ],
    })) as { itemUpdateFailures: string[] };

    // Non-clean outcome → Trigger C does nothing → EVERY supplied row is
    // written client-side, including the at-full-quantity one.
    const itemBuilder = builders.project_ffe_items;
    const updates = itemBuilder.__chain.filter((c) => c.method === 'update');
    expect(updates.map((c) => c.args[0])).toEqual([
      { received_quantity: 2 },
      { received_quantity: 1 },
    ]);
    const eqArgs = itemBuilder.__chain.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqArgs).toContainEqual(['id', 'ffe-1']);
    expect(eqArgs).toContainEqual(['id', 'ffe-2']);
    expect(result.itemUpdateFailures).toEqual([]);
  });

  it('clean outcome with all items at full quantity: skips the redundant updates (Trigger C already stamped them)', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    queueTableResults('receiving_inspections', {
      data: {
        id: 'insp-clean-full',
        purchase_order_id: 'po-1',
        inspected_at: '2026-06-12T10:00:00.000Z',
        inspected_by: 'user-1',
        outcome: 'clean',
        notes: null,
        photo_asset_ids: [],
      },
      error: null,
    });

    const config = useCreateReceivingInspection() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    const result = (await config.mutationFn({
      purchaseOrderId: 'po-1',
      outcome: 'clean',
      items: [
        { ffeItemId: 'ffe-1', receivedQuantity: 3, orderedQuantity: 3 },
        { ffeItemId: 'ffe-2', receivedQuantity: 1, orderedQuantity: 1 },
      ],
    })) as { itemUpdateFailures: string[] };

    // No project_ffe_items writes at all — 00184 Trigger C set
    // received_quantity = quantity for clean outcomes inside step 1.
    expect(builders.project_ffe_items).toBeUndefined();
    expect(result.itemUpdateFailures).toEqual([]);
  });

  it('clean outcome with a short row: writes ONLY the short row (client count wins over the trigger stamp)', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    queueTableResults('receiving_inspections', {
      data: {
        id: 'insp-clean-short',
        purchase_order_id: 'po-1',
        inspected_at: '2026-06-12T10:00:00.000Z',
        inspected_by: 'user-1',
        outcome: 'clean',
        notes: null,
        photo_asset_ids: [],
      },
      error: null,
    });
    setTableDefault('project_ffe_items', { data: null, error: null });

    const config = useCreateReceivingInspection() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      purchaseOrderId: 'po-1',
      outcome: 'clean',
      items: [
        { ffeItemId: 'ffe-1', receivedQuantity: 2, orderedQuantity: 3 },
        { ffeItemId: 'ffe-2', receivedQuantity: 1, orderedQuantity: 1 },
      ],
    });

    const itemBuilder = builders.project_ffe_items;
    const updates = itemBuilder.__chain.filter((c) => c.method === 'update');
    expect(updates.map((c) => c.args[0])).toEqual([{ received_quantity: 2 }]);
    const eqArgs = itemBuilder.__chain.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqArgs).toEqual([['id', 'ffe-1']]);
  });

  it('item-update failure is NON-critical: resolves with the failed id in itemUpdateFailures, no compensating delete', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    queueTableResults('receiving_inspections', {
      data: {
        id: 'insp-itemfail',
        purchase_order_id: 'po-1',
        inspected_at: '2026-06-12T10:00:00.000Z',
        inspected_by: 'user-1',
        outcome: 'partial',
        notes: null,
        photo_asset_ids: [],
      },
      error: null,
    });
    queueTableResults('purchase_orders', {
      data: {
        id: 'po-1',
        vendor_po_number: 'AP-012',
        vendor: { id: 'vendor-ap', name: 'Apparatus' },
      },
      error: null,
    });
    setTableDefault('damage_claims', { data: null, error: null });
    setTableDefault('project_ffe_items', {
      data: null,
      error: { message: 'simulated item update failure' },
    });

    const config = useCreateReceivingInspection() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    const result = (await config.mutationFn({
      purchaseOrderId: 'po-1',
      outcome: 'partial',
      items: [{ ffeItemId: 'ffe-1', receivedQuantity: 1, orderedQuantity: 2 }],
    })) as { inspection: { id: string }; itemUpdateFailures: string[] };

    // Mutation still resolves — the inspection + claim are committed.
    expect(result.inspection.id).toBe('insp-itemfail');
    expect(result.itemUpdateFailures).toEqual(['ffe-1']);
    // No compensating DELETE on the inspection for this path.
    const inspBuilder = builders.receiving_inspections;
    expect(inspBuilder.__chain.find((c) => c.method === 'delete')).toBeUndefined();
  });

  it('onSuccess sweeps the procurement-items cache when items[] were written without a projectId', () => {
    const config = useCreateReceivingInspection() as unknown as {
      onSuccess: (
        result: { inspection: { purchase_order_id: string } },
        variables: {
          purchaseOrderId: string;
          outcome: string;
          projectId?: string;
          items?: Array<{ ffeItemId: string; receivedQuantity: number }>;
        },
      ) => void;
    };

    config.onSuccess(
      { inspection: { purchase_order_id: 'po-1' } },
      {
        purchaseOrderId: 'po-1',
        outcome: 'partial',
        items: [{ ffeItemId: 'ffe-1', receivedQuantity: 1 }],
      },
    );

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['procurement-items']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUpdatePurchaseOrderStatus  (Wave 1 procurement overhaul — triggers 00184)
// ─────────────────────────────────────────────────────────────────────────────

describe('useUpdatePurchaseOrderStatus', () => {
  it('issues a plain status UPDATE on purchase_orders scoped to id and returns the row', async () => {
    queueTableResults('purchase_orders', {
      data: { id: 'po-status-1', status: 'shipped', project_id: 'proj-1' },
      error: null,
    });

    const config = useUpdatePurchaseOrderStatus() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    const result = await config.mutationFn({
      purchaseOrderId: 'po-status-1',
      status: 'shipped',
    });

    const builder = builders.purchase_orders;
    const updates = builder.__chain.filter((c) => c.method === 'update');
    expect(updates).toHaveLength(1);
    // Exactly the status column — every side effect (item ratchet, balance
    // flip, cancellation detach) is owned by trigger 00184.
    expect(updates[0].args[0]).toEqual({ status: 'shipped' });

    const eqArgs = builder.__chain.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqArgs).toEqual([['id', 'po-status-1']]);

    // No other table is touched.
    expect(builders.project_ffe_items).toBeUndefined();
    expect(builders.po_payments).toBeUndefined();

    expect((result as { id: string }).id).toBe('po-status-1');
  });

  it('throws when supabase returns an error', async () => {
    queueTableResults('purchase_orders', {
      data: null,
      error: { message: 'rls denied' },
    });

    const config = useUpdatePurchaseOrderStatus() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({ purchaseOrderId: 'po-x', status: 'cancelled' }),
    ).rejects.toThrow(/rls denied/);
  });

  it('onSuccess invalidates PO/payment/calendar/count keys, plus FF&E namespaces when projectId is supplied', () => {
    const config = useUpdatePurchaseOrderStatus() as unknown as {
      onSuccess: (
        result: unknown,
        variables: { purchaseOrderId: string; status: string; projectId?: string },
      ) => void;
    };

    config.onSuccess({}, { purchaseOrderId: 'po-1', status: 'shipped', projectId: 'proj-1' });

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['purchase-orders']);
    expect(invalidatedKeys).toContainEqual(['purchase-order', 'po-1']);
    // The trigger may flip the pending balance to due.
    expect(invalidatedKeys).toContainEqual(['po-payments', 'po-1']);
    expect(invalidatedKeys).toContainEqual(['delivery-calendar']);
    expect(invalidatedKeys).toContainEqual(['today-procurement-counts']);
    // FF&E dual-namespace bridge.
    expect(invalidatedKeys).toContainEqual(['project-ffe-items', 'proj-1']);
    expect(invalidatedKeys).toContainEqual(['projects', 'proj-1']);
  });

  it('onSuccess skips the FF&E invalidations when projectId is absent', () => {
    const config = useUpdatePurchaseOrderStatus() as unknown as {
      onSuccess: (
        result: unknown,
        variables: { purchaseOrderId: string; status: string; projectId?: string },
      ) => void;
    };

    config.onSuccess({}, { purchaseOrderId: 'po-1', status: 'confirmed' });

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['purchase-orders']);
    expect(
      invalidatedKeys.filter(
        (k) => (k as unknown[])[0] === 'project-ffe-items' || (k as unknown[])[0] === 'projects',
      ),
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// invalidateFfeCaches  (dual query-key namespace bridge)
// ─────────────────────────────────────────────────────────────────────────────

describe('invalidateFfeCaches', () => {
  it('invalidates the package/portal FF&E namespaces and the cross-project view', () => {
    const queryClient = { invalidateQueries };

    invalidateFfeCaches(
      queryClient as unknown as Parameters<typeof invalidateFfeCaches>[0],
      'proj-9',
    );

    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toEqual([
      ['project-ffe-items', 'proj-9'],
      ['projects', 'proj-9'],
      ['procurement-items'],
    ]);
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
  it('fires the three independent rollups (arriving count, inspections set-difference, damage claims count)', async () => {
    // Reset the module-scoped `from` mock so this test's call-count assertions
    // are not polluted by previous tests in the file.
    (supabaseClient.from as unknown as { mockClear: () => void }).mockClear();

    // purchase_orders is hit TWICE:
    //   1. arrivingThisWeek — uses `count` (head: true).
    //   2. inspectionsPending delivered query — uses `data` (rows).
    queueTableResults(
      'purchase_orders',
      // 1. arriving count
      { data: null, error: null, count: 4 } as unknown as {
        data: unknown;
        error: unknown;
      },
      // 2. delivered POs — three rows; two of them are already inspected
      // (see receiving_inspections below), so pending = 1.
      {
        data: [{ id: 'po-a' }, { id: 'po-b' }, { id: 'po-c' }],
        error: null,
      },
    );
    setTableDefault('receiving_inspections', {
      data: [{ purchase_order_id: 'po-a' }, { purchase_order_id: 'po-b' }],
      error: null,
    });
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
      // 3 delivered POs minus 2 already inspected = 1 still pending.
      inspectionsPending: 1,
      damageClaimsOpen: 1,
    });

    // Both queries inside `inspectionsPendingP` must fire — set-difference is
    // computed client-side from these two collections.
    const fromCalls = (
      supabaseClient.from as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.map((c) => c[0] as string);
    expect(fromCalls).toContain('purchase_orders');
    expect(fromCalls).toContain('receiving_inspections');
    expect(fromCalls).toContain('damage_claims');
    // purchase_orders hit twice — once for arriving, once for delivered.
    expect(fromCalls.filter((t) => t === 'purchase_orders').length).toBe(2);

    // The delivered-PO query must filter on status='delivered' AND cap the
    // result set (Today tile is a counter, not a list).
    const poBuilder = builders.purchase_orders;
    const eqCalls = poBuilder.__chain.filter((c) => c.method === 'eq');
    expect(eqCalls.some((c) => c.args[0] === 'status' && c.args[1] === 'delivered')).toBe(true);
    const limitCalls = poBuilder.__chain.filter((c) => c.method === 'limit');
    expect(limitCalls.length).toBeGreaterThan(0);
  });

  it('returns 0 for the failing sub-query and still resolves the others', async () => {
    // arrivingThisWeek fails AND the delivered-PO query also fails — both
    // sub-queries are scoped to the same builder, so the same default applies
    // to both. The damage_claims tile still resolves normally.
    setTableDefault('purchase_orders', {
      data: null,
      error: { message: 'boom' },
    } as unknown as { data: unknown; error: unknown });
    setTableDefault('receiving_inspections', {
      data: [],
      error: null,
    });
    setTableDefault('damage_claims', { data: null, error: null, count: 3 } as unknown as {
      data: unknown;
      error: unknown;
    });

    const config = useTodayProcurementCounts() as unknown as {
      queryFn: () => Promise<{ arrivingThisWeek: number; inspectionsPending: number; damageClaimsOpen: number }>;
    };

    // The hook must NOT throw — it must surface the partial result with the
    // failing tiles zeroed.
    const counts = await config.queryFn();
    expect(counts).toEqual({
      arrivingThisWeek: 0,
      inspectionsPending: 0,
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

  it('same-state edit: drafted → drafted with description update writes state + description but NOT vendor_notified_at or resolved_at', async () => {
    // Sequential calls to damage_claims:
    //   1. SELECT current state via .single() → returns 'drafted' (same as input).
    //   2. UPDATE → returns the updated row via .single().
    queueTableResults(
      'damage_claims',
      // 1. current state read
      { data: { id: 'claim-4', state: 'drafted' }, error: null },
      // 2. update result
      {
        data: {
          id: 'claim-4',
          state: 'drafted',
          description: 'Updated description',
          vendor_notified_at: null,
          resolved_at: null,
        },
        error: null,
      },
    );

    const config = useUpdateDamageClaim() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      id: 'claim-4',
      state: 'drafted',
      description: 'Updated description',
    });

    const builder = builders.damage_claims;
    const updates = builder.__chain.filter((c) => c.method === 'update');
    expect(updates).toHaveLength(1);

    const payload = updates[0].args[0] as Record<string, unknown>;
    // state is preserved as-is
    expect(payload.state).toBe('drafted');
    // description is included
    expect(payload.description).toBe('Updated description');
    // timestamp columns must NOT be set — neither transition branch applies
    expect(payload.vendor_notified_at).toBeUndefined();
    expect(payload.resolved_at).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useAdvancePaymentToDue  (Wave 1 procurement overhaul — migration 00184)
// ─────────────────────────────────────────────────────────────────────────────

describe('useAdvancePaymentToDue', () => {
  it('happy path: single UPDATE on po_payments with state=due and correct eq scoping; no writes to purchase_orders or project_ffe_items', async () => {
    // A single round-trip: UPDATE + .select().single().
    queueTableResults('po_payments', {
      data: {
        id: 'pay-balance',
        purchase_order_id: 'po-2',
        kind: 'balance',
        state: 'due',
        due_date: '2026-07-01',
        sort_order: 1,
      },
      error: null,
    });

    const config = useAdvancePaymentToDue() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
      onSuccess: (result: unknown, input: { purchaseOrderId: string }) => void;
    };

    const result = await config.mutationFn({
      paymentId: 'pay-balance',
      purchaseOrderId: 'po-2',
      dueDate: '2026-07-01',
    });

    // Exactly one UPDATE on po_payments.
    const builder = builders.po_payments;
    const updates = builder.__chain.filter((c) => c.method === 'update');
    expect(updates).toHaveLength(1);

    // Payload must contain state='due' and the supplied dueDate.
    const payload = updates[0].args[0] as Record<string, unknown>;
    expect(payload.state).toBe('due');
    expect(payload.due_date).toBe('2026-07-01');

    // Scope: filtered by paymentId only.
    const eqArgs = builder.__chain.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqArgs).toEqual([['id', 'pay-balance']]);

    // The returned row is the updated payment.
    expect((result as { id: string }).id).toBe('pay-balance');

    // DB triggers (00184) own all PO/FFE side effects after this — the hook
    // must NOT write to purchase_orders or project_ffe_items.
    expect(builders.purchase_orders).toBeUndefined();
    expect(builders.project_ffe_items).toBeUndefined();

    // onSuccess: invalidates the PO's payment list and both PO namespaces.
    config.onSuccess(result, { purchaseOrderId: 'po-2' });
    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['po-payments', 'po-2']);
    expect(invalidatedKeys).toContainEqual(['purchase-orders']);
    expect(invalidatedKeys).toContainEqual(['purchase-order', 'po-2']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUpdatePurchaseOrderETA  (Wave 2.4 — manual ETA quick-edit drawer)
// ─────────────────────────────────────────────────────────────────────────────

describe('useUpdatePurchaseOrderETA', () => {
  it('issues an UPDATE on purchase_orders with confirmed_eta scoped to id and returns the row', async () => {
    // Only one round-trip: the UPDATE + .select().single().
    queueTableResults('purchase_orders', {
      data: {
        id: 'po-eta-1',
        confirmed_eta: '2026-07-15',
        notes: null,
      },
      error: null,
    });

    const config = useUpdatePurchaseOrderETA() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    const result = await config.mutationFn({
      purchaseOrderId: 'po-eta-1',
      newEta: '2026-07-15',
    });

    const builder = builders.purchase_orders;
    const update = builder.__chain.find((c) => c.method === 'update');
    expect(update).toBeDefined();
    const payload = update?.args[0] as { confirmed_eta: string; notes?: string };
    expect(payload.confirmed_eta).toBe('2026-07-15');
    // No notes supplied → must NOT touch the notes column.
    expect(payload.notes).toBeUndefined();

    // Scope: filter by id.
    const eqArgs = builder.__chain.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqArgs).toContainEqual(['id', 'po-eta-1']);

    expect((result as { id: string }).id).toBe('po-eta-1');
  });

  it('appends a timestamped notes line when notes are supplied', async () => {
    // 1. SELECT current notes for the append.
    // 2. UPDATE returning the new row.
    queueTableResults(
      'purchase_orders',
      // Existing notes
      { data: { notes: 'Vendor said L8W ETA' }, error: null },
      // Update result
      {
        data: {
          id: 'po-eta-2',
          confirmed_eta: '2026-08-01',
          notes: 'Vendor said L8W ETA\n[2026-05-27 ETA update]: Vendor pushed by 2 weeks',
        },
        error: null,
      },
    );

    const config = useUpdatePurchaseOrderETA() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      purchaseOrderId: 'po-eta-2',
      newEta: '2026-08-01',
      notes: 'Vendor pushed by 2 weeks',
    });

    const builder = builders.purchase_orders;
    const update = builder.__chain.find((c) => c.method === 'update');
    expect(update).toBeDefined();
    const payload = update?.args[0] as { confirmed_eta: string; notes: string };
    expect(payload.confirmed_eta).toBe('2026-08-01');
    // The appended line must contain the supplied notes and the [YYYY-MM-DD ETA update] tag.
    expect(payload.notes).toMatch(/\[\d{4}-\d{2}-\d{2} ETA update\]: Vendor pushed by 2 weeks/);
    // The existing notes must be preserved (no destructive overwrite).
    expect(payload.notes).toContain('Vendor said L8W ETA');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 3 / Wave 3.2 — useQboExport / useQboExportPreview
//
// These tests stub the global fetch + supabase.auth.getSession to verify the
// hook composes the right POST shape against the qbo-export edge function.
// ─────────────────────────────────────────────────────────────────────────────

describe('useQboExport', () => {
  const ORIGINAL_FETCH = globalThis.fetch;
  const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ORIGINAL_URL = (globalThis as any).URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    // jsdom / node doesn't always expose URL.createObjectURL/revokeObjectURL;
    // patch them so triggerCsvDownload doesn't throw. The mutation runs in
    // a non-window/document environment by default (vitest node pool), so
    // triggerCsvDownload is a no-op anyway — but we patch for safety.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).URL = {
      ...ORIGINAL_URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    };
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).URL = ORIGINAL_URL;
  });

  it('POSTs to /functions/v1/qbo-export with bearer JWT + correct body, then returns parsed preview headers', async () => {
    supabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'jwt-token-abc' } },
      error: null,
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Vendor,Bill Date\n"Woodward & Sons","2026-04-08"\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition':
            'attachment; filename="patina-vendor-bills-2026-04-01.csv"',
          'X-Patina-Transaction-Count': '23',
          'X-Patina-Vendor-Count': '8',
          'X-Patina-Total-Cents': '4280000',
          'X-Patina-Paid-Count': '10',
          'X-Patina-Paid-Cents': '2000000',
          'X-Patina-Outstanding-Count': '13',
          'X-Patina-Outstanding-Cents': '2280000',
        },
      })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const input: QboExportInput = {
      dateStart: '2026-04-01',
      dateEnd: '2026-04-30',
      includePaid: true,
      includeOutstanding: true,
      includePatinaCatalog: false,
      projectIds: ['proj-1'],
      vendorIds: ['vendor-1'],
    };

    const config = useQboExport() as unknown as {
      mutationFn: (input: QboExportInput) => Promise<unknown>;
    };

    const stats = await config.mutationFn(input);

    // 1. fetch called with the right URL.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('http://localhost:54321/functions/v1/qbo-export');
    expect(init.method).toBe('POST');

    // 2. Authorization header carries the Supabase JWT.
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-token-abc');
    expect(headers['Content-Type']).toBe('application/json');

    // 3. Body contains all the input flags, preview:false.
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody).toMatchObject({
      dateStart: '2026-04-01',
      dateEnd: '2026-04-30',
      includePaid: true,
      includeOutstanding: true,
      includePatinaCatalog: false,
      projectIds: ['proj-1'],
      vendorIds: ['vendor-1'],
      preview: false,
    });

    // 4. The returned preview stats are parsed from the X-Patina-* headers.
    expect(stats).toEqual({
      transactionCount: 23,
      vendorCount: 8,
      totalCents: 4280000,
      paidCount: 10,
      paidCents: 2000000,
      outstandingCount: 13,
      outstandingCents: 2280000,
    });
  });

  it('throws when the user is not authenticated (no session)', async () => {
    supabaseClient.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const config = useQboExport() as unknown as {
      mutationFn: (input: QboExportInput) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({
        dateStart: '2026-04-01',
        dateEnd: '2026-04-30',
        includePaid: true,
        includeOutstanding: true,
        includePatinaCatalog: false,
      }),
    ).rejects.toThrow(/not authenticated/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preview hook is disabled until both dates are valid and at least one include-flag is true', () => {
    const config = useQboExportPreview({
      dateStart: '',
      dateEnd: '',
      includePaid: false,
      includeOutstanding: false,
      includePatinaCatalog: false,
    }) as unknown as { enabled: boolean; queryKey: unknown[] };

    expect(config.enabled).toBe(false);
    expect(config.queryKey[0]).toBe('qbo-export-preview');

    const ready = useQboExportPreview({
      dateStart: '2026-04-01',
      dateEnd: '2026-04-30',
      includePaid: true,
      includeOutstanding: false,
      includePatinaCatalog: false,
    }) as unknown as { enabled: boolean };

    expect(ready.enabled).toBe(true);
  });

  it('preview hook is disabled when opts.enabled is false, even with fully valid input', () => {
    // Simulates the modal mounted for a non-studio-owner (open=false or isStudioOwner=false).
    // The shared hook must not fire so the global QueryCache onError never turns a 403
    // into an error toast for designers who lack the studio_owner role.
    const validInput: QboExportInput = {
      dateStart: '2026-04-01',
      dateEnd: '2026-04-30',
      includePaid: true,
      includeOutstanding: true,
      includePatinaCatalog: false,
    };

    const disabled = useQboExportPreview(validInput, { enabled: false }) as unknown as {
      enabled: boolean;
      queryKey: unknown[];
    };

    expect(disabled.enabled).toBe(false);
    // Query key is still set so React Query can identify/deduplicate the entry.
    expect(disabled.queryKey[0]).toBe('qbo-export-preview');
  });

  it('preview hook is enabled when opts.enabled is true and input is valid', () => {
    const validInput: QboExportInput = {
      dateStart: '2026-04-01',
      dateEnd: '2026-04-30',
      includePaid: true,
      includeOutstanding: false,
      includePatinaCatalog: false,
    };

    const enabled = useQboExportPreview(validInput, { enabled: true }) as unknown as {
      enabled: boolean;
    };

    expect(enabled.enabled).toBe(true);
  });

  it('preview hook is disabled when opts.enabled is true but input is invalid (gates AND together)', () => {
    const invalidInput: QboExportInput = {
      dateStart: '',
      dateEnd: '2026-04-30',
      includePaid: false,
      includeOutstanding: false,
      includePatinaCatalog: false,
    };

    const result = useQboExportPreview(invalidInput, { enabled: true }) as unknown as {
      enabled: boolean;
    };

    // Both conditions must be true: opts.enabled=true AND isValidExportInput.
    // Invalid input means the overall enabled must be false.
    expect(result.enabled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wave 4 / W4-T3 — useSendPurchaseOrder (po-send edge function)
//
// Same rig as useQboExport: stub global fetch + supabase.auth.getSession and
// verify the POST shape, response handling, invalidations, and error path.
// ─────────────────────────────────────────────────────────────────────────────

describe('useSendPurchaseOrder', () => {
  const ORIGINAL_FETCH = globalThis.fetch;
  const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  });

  const successBody = {
    ok: true,
    poId: 'po-1',
    poNumber: 'PO-0001',
    recipient: 'orders@vendor.test',
    documentPath: 'project-1/po-PO-0001.pdf',
    emailSent: true,
    signedUrl: 'http://localhost:54321/storage/v1/object/sign/abc',
  };

  it('POSTs to /functions/v1/po-send with bearer JWT + full payload and returns the response json', async () => {
    supabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'jwt-token-abc' } },
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(successBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const config = useSendPurchaseOrder() as unknown as {
      mutationFn: (input: SendPurchaseOrderInput) => Promise<unknown>;
    };

    const result = await config.mutationFn({
      purchaseOrderId: 'po-1',
      mode: 'send',
      recipientEmail: 'override@vendor.test',
      message: 'Please rush this one.',
      ccDesigner: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('http://localhost:54321/functions/v1/po-send');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-token-abc');
    expect(headers['Content-Type']).toBe('application/json');

    const sentBody = JSON.parse(init.body as string);
    expect(sentBody).toEqual({
      purchaseOrderId: 'po-1',
      mode: 'send',
      recipientEmail: 'override@vendor.test',
      message: 'Please rush this one.',
      ccDesigner: true,
    });

    expect(result).toEqual(successBody);
  });

  it('defaults ccDesigner to false and omits optional fields from the payload values', async () => {
    supabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'jwt-token-abc' } },
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...successBody, emailSent: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const config = useSendPurchaseOrder() as unknown as {
      mutationFn: (input: SendPurchaseOrderInput) => Promise<unknown>;
    };
    await config.mutationFn({ purchaseOrderId: 'po-1', mode: 'preview' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody).toEqual({
      purchaseOrderId: 'po-1',
      mode: 'preview',
      ccDesigner: false,
      // recipientEmail / message are undefined → dropped by JSON.stringify.
    });
    expect('recipientEmail' in sentBody).toBe(false);
    expect('message' in sentBody).toBe(false);
  });

  it('invalidates purchase-orders, the single PO, and procurement-items on success', () => {
    const config = useSendPurchaseOrder() as unknown as {
      onSuccess: (data: unknown, vars: SendPurchaseOrderInput) => void;
    };

    config.onSuccess(successBody, { purchaseOrderId: 'po-1', mode: 'send' });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['purchase-orders'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['purchase-order', 'po-1'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['procurement-items'] });
  });

  it('throws when the user is not authenticated (no session)', async () => {
    supabaseClient.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const config = useSendPurchaseOrder() as unknown as {
      mutationFn: (input: SendPurchaseOrderInput) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({ purchaseOrderId: 'po-1', mode: 'send' }),
    ).rejects.toThrow(/not authenticated/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects with the edge function error code on non-2xx responses', async () => {
    supabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'jwt-token-abc' } },
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'no_recipient' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const config = useSendPurchaseOrder() as unknown as {
      mutationFn: (input: SendPurchaseOrderInput) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({ purchaseOrderId: 'po-1', mode: 'send' }),
    ).rejects.toThrow('no_recipient');
  });

  it('falls back to a status-based message when the error body is not JSON', async () => {
    supabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'jwt-token-abc' } },
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const config = useSendPurchaseOrder() as unknown as {
      mutationFn: (input: SendPurchaseOrderInput) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({ purchaseOrderId: 'po-1', mode: 'mark_sent' }),
    ).rejects.toThrow(/PO send failed: 502/);
  });
});

// useProcurementNotifications  (Sprint 3 / Wave 3.2 — migration 00151)
// ─────────────────────────────────────────────────────────────────────────────

describe('useProcurementNotifications', () => {
  it('queries procurement_notifications scoped to auth.uid() and DOES NOT apply .is(read_at, null) by default', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    setTableDefault('procurement_notifications', {
      data: [
        {
          id: 'n1',
          user_id: 'user-1',
          kind: 'balance_due',
          subject_payment_id: 'p1',
          subject_purchase_order_id: 'po1',
          subject_inspection_id: null,
          read_at: null,
          created_at: '2026-05-27T00:00:00Z',
        },
        {
          id: 'n2',
          user_id: 'user-1',
          kind: 'damage_claim_drafted',
          subject_payment_id: null,
          subject_purchase_order_id: 'po2',
          subject_inspection_id: 'i2',
          read_at: '2026-05-26T18:00:00Z',
          created_at: '2026-05-26T17:55:00Z',
        },
      ],
      error: null,
    });

    const config = useProcurementNotifications() as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown[]>;
      staleTime: number;
    };

    expect(config.queryKey).toEqual(['procurement-notifications', { unreadOnly: false }]);
    expect(config.staleTime).toBe(60 * 1000);

    const rows = await config.queryFn();
    expect(rows).toHaveLength(2);

    const builder = builders.procurement_notifications;
    // Must scope to the authenticated user via .eq('user_id', ...).
    const eqCalls = builder.__chain.filter((c) => c.method === 'eq');
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    // Order by created_at DESC.
    const orderCalls = builder.__chain.filter((c) => c.method === 'order');
    expect(orderCalls).toContainEqual({
      method: 'order',
      args: ['created_at', { ascending: false }],
    });
    // unreadOnly default is false → no .is('read_at', null) filter.
    const isCalls = builder.__chain.filter((c) => c.method === 'is');
    expect(isCalls).toEqual([]);
    // Select must request the joined purchase_order/vendor/project.
    const selectCalls = builder.__chain.filter((c) => c.method === 'select');
    expect(selectCalls).toHaveLength(1);
    const selectStr = String(selectCalls[0].args[0]);
    expect(selectStr).toContain('purchase_order:purchase_orders');
    expect(selectStr).toContain('vendor:vendors');
    expect(selectStr).toContain('project:projects');
  });

  it('applies .is(read_at, null) when unreadOnly: true and embeds the filter in the queryKey', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    setTableDefault('procurement_notifications', { data: [], error: null });

    const config = useProcurementNotifications({ unreadOnly: true }) as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown[]>;
    };

    expect(config.queryKey).toEqual(['procurement-notifications', { unreadOnly: true }]);

    await config.queryFn();

    const builder = builders.procurement_notifications;
    const isCalls = builder.__chain.filter((c) => c.method === 'is');
    expect(isCalls).toEqual([{ method: 'is', args: ['read_at', null] }]);
  });

  it('throws when not authenticated', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } });
    const config = useProcurementNotifications() as unknown as {
      queryFn: () => Promise<unknown>;
    };
    await expect(config.queryFn()).rejects.toThrow('Not authenticated');
  });

  it('throws when supabase returns an error', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    setTableDefault('procurement_notifications', {
      data: null,
      error: new Error('rls denied'),
    });
    const config = useProcurementNotifications() as unknown as {
      queryFn: () => Promise<unknown>;
    };
    await expect(config.queryFn()).rejects.toThrow('rls denied');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useProcurementUnreadCount  (Sprint 3 / Wave 3.2)
// ─────────────────────────────────────────────────────────────────────────────

describe('useProcurementUnreadCount', () => {
  it('queries with head:true count and .is(read_at, null), scoped to auth.uid()', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    setTableDefault('procurement_notifications', {
      data: null,
      error: null,
      count: 7,
    } as unknown as { data: unknown; error: unknown });

    const config = useProcurementUnreadCount() as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<number>;
      staleTime: number;
    };

    expect(config.queryKey).toEqual(['procurement-unread-count']);
    expect(config.staleTime).toBe(30 * 1000);

    const count = await config.queryFn();
    expect(count).toBe(7);

    const builder = builders.procurement_notifications;
    // Select with head/count options.
    const selectCalls = builder.__chain.filter((c) => c.method === 'select');
    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0].args[0]).toBe('id');
    expect(selectCalls[0].args[1]).toEqual({ count: 'exact', head: true });
    // Scoped by user_id.
    const eqCalls = builder.__chain.filter((c) => c.method === 'eq');
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    // .is('read_at', null) — only unread rows count.
    const isCalls = builder.__chain.filter((c) => c.method === 'is');
    expect(isCalls).toEqual([{ method: 'is', args: ['read_at', null] }]);
  });

  it('returns 0 when supabase returns an error (never throws — nav badge must not break shell)', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    setTableDefault('procurement_notifications', {
      data: null,
      error: { message: 'boom' },
      count: null,
    } as unknown as { data: unknown; error: unknown });

    const config = useProcurementUnreadCount() as unknown as {
      queryFn: () => Promise<number>;
    };
    await expect(config.queryFn()).resolves.toBe(0);
  });

  it('returns 0 when the caller is not authenticated', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } });
    const config = useProcurementUnreadCount() as unknown as {
      queryFn: () => Promise<number>;
    };
    await expect(config.queryFn()).resolves.toBe(0);
  });

  it('returns 0 when getUser throws (catch-all fail-soft)', async () => {
    supabaseClient.auth.getUser.mockRejectedValueOnce(new Error('network down'));
    const config = useProcurementUnreadCount() as unknown as {
      queryFn: () => Promise<number>;
    };
    await expect(config.queryFn()).resolves.toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useMarkProcurementNotificationRead  (Sprint 3 / Wave 3.2)
// ─────────────────────────────────────────────────────────────────────────────

describe('useMarkProcurementNotificationRead', () => {
  it('UPDATEs procurement_notifications with read_at = now(), scoped by id + user_id, and invalidates the right query keys', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    queueTableResults('procurement_notifications', {
      data: {
        id: 'n-1',
        user_id: 'user-1',
        kind: 'balance_due',
        read_at: '2026-05-27T12:00:00.000Z',
        created_at: '2026-05-27T11:00:00.000Z',
      },
      error: null,
    });

    const config = useMarkProcurementNotificationRead() as unknown as {
      mutationFn: (input: { notificationId: string }) => Promise<unknown>;
      onSuccess: () => void;
    };

    const result = await config.mutationFn({ notificationId: 'n-1' });
    expect((result as { id: string }).id).toBe('n-1');

    const builder = builders.procurement_notifications;
    const update = builder.__chain.find((c) => c.method === 'update');
    expect(update).toBeDefined();
    const payload = update?.args[0] as { read_at: string };
    expect(payload.read_at).toBeDefined();
    // ISO 8601 string for read_at = now()
    expect(payload.read_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // Scope: by id AND by user_id (defense in depth on top of RLS).
    const eqArgs = builder.__chain.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqArgs).toContainEqual(['id', 'n-1']);
    expect(eqArgs).toContainEqual(['user_id', 'user-1']);

    // Trigger onSuccess and verify the right invalidations fire.
    config.onSuccess();
    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['procurement-notifications']);
    expect(invalidatedKeys).toContainEqual(['procurement-unread-count']);
  });

  it('throws when not authenticated', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } });

    const config = useMarkProcurementNotificationRead() as unknown as {
      mutationFn: (input: { notificationId: string }) => Promise<unknown>;
    };
    await expect(config.mutationFn({ notificationId: 'n-1' })).rejects.toThrow(
      'Not authenticated'
    );
  });

  it('throws when supabase returns an error', async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    queueTableResults('procurement_notifications', {
      data: null,
      error: new Error('rls denied'),
    });

    const config = useMarkProcurementNotificationRead() as unknown as {
      mutationFn: (input: { notificationId: string }) => Promise<unknown>;
    };
    await expect(config.mutationFn({ notificationId: 'n-1' })).rejects.toThrow('rls denied');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useAssignProductToFfeSlot  (Sprint 3 / Wave 3.3 — capture-to-slot)
// ─────────────────────────────────────────────────────────────────────────────

describe('useAssignProductToFfeSlot', () => {
  it('UPDATEs project_ffe_items.product_id scoped by both id and project_id, then invalidates the slot + PO query keys', async () => {
    queueTableResults('project_ffe_items', {
      data: { id: 'ffe-1', product_id: 'prod-1' },
      error: null,
    });

    const config = useAssignProductToFfeSlot() as unknown as {
      mutationFn: (input: {
        productId: string;
        ffeItemId: string;
        projectId: string;
      }) => Promise<{ id: string; product_id: string }>;
      onSuccess: (
        result: unknown,
        input: { productId: string; ffeItemId: string; projectId: string }
      ) => void;
    };

    const result = await config.mutationFn({
      productId: 'prod-1',
      ffeItemId: 'ffe-1',
      projectId: 'proj-1',
    });
    expect(result.id).toBe('ffe-1');
    expect(result.product_id).toBe('prod-1');

    const builder = builders.project_ffe_items;
    // Update payload sets product_id
    const update = builder.__chain.find((c) => c.method === 'update');
    expect(update?.args[0]).toEqual({ product_id: 'prod-1' });

    // Both filters are present — defense in depth on RLS + W1.2.6 pattern.
    const eqArgs = builder.__chain.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqArgs).toContainEqual(['id', 'ffe-1']);
    expect(eqArgs).toContainEqual(['project_id', 'proj-1']);

    // Trigger onSuccess and verify cache invalidations.
    config.onSuccess(result, {
      productId: 'prod-1',
      ffeItemId: 'ffe-1',
      projectId: 'proj-1',
    });
    const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['project-ffe-items', 'proj-1']);
    expect(invalidatedKeys).toContainEqual(['purchase-orders']);
  });

  it('throws when supabase returns an error (e.g. RLS denies cross-designer FFE update)', async () => {
    queueTableResults('project_ffe_items', {
      data: null,
      error: new Error('row level security policy denied'),
    });

    const config = useAssignProductToFfeSlot() as unknown as {
      mutationFn: (input: {
        productId: string;
        ffeItemId: string;
        projectId: string;
      }) => Promise<unknown>;
    };

    await expect(
      config.mutationFn({
        productId: 'prod-1',
        ffeItemId: 'ffe-1',
        projectId: 'proj-other',
      })
    ).rejects.toThrow('row level security policy denied');
  });
});
