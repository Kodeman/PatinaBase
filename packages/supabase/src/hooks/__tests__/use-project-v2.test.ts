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
import { useUpdateFFEItemPricing, useProjectFinancials } from '../use-project-v2';
import type { UpdateFFEItemPricingInput } from '../use-project-v2';

beforeEach(() => {
  Object.keys(builders).forEach((k) => delete builders[k]);
  invalidateQueries.mockReset();
  supabaseClient.auth.getUser.mockReset();
  supabaseClient.auth.getSession.mockReset();
  supabaseClient.from.mockClear();
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
});
