import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FfeLinePricing } from '@patina/types';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — useQuery/useMutation return their own config, so a test reads the
// query key, runs the queryFn, and calls mutationFn/onSuccess directly.
// ─────────────────────────────────────────────────────────────────────────────

const rpc = vi.fn();
const from = vi.fn();
const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  from,
  rpc,
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries, cancelQueries: vi.fn(), setQueryData: vi.fn() }),
}));

// Import AFTER mocks.
import {
  myPricingSettingsKey,
  projectPricingKey,
  usePricingSettings,
  useProjectPricing,
  useResetFfeLineMarkup,
  useResetProjectMarkups,
  useResolveFfeCostChange,
  useSetFfeLineKind,
  useSetFfeLinePricing,
  useSetPricingSettings,
  useSetProjectPricing,
} from '../use-trade-pricing';

beforeEach(() => {
  vi.clearAllMocks();
});

const invalidatedKeys = () => invalidateQueries.mock.calls.map((c) => c[0].queryKey);

/** invalidateFfeCaches (use-procurement.ts) for project p1. */
const FFE_CACHE_KEYS = [
  ['project-ffe-items', 'p1'],
  ['projects', 'p1'],
  ['procurement-items'],
  ['project-ffe-readiness'],
];

interface MutationConfig<TVars, TResult> {
  mutationFn: (vars: TVars) => Promise<TResult>;
  onSuccess: (result: TResult, vars: TVars) => void;
}

async function runMutation<TVars, TResult>(config: unknown, vars: TVars): Promise<TResult> {
  const mutation = config as MutationConfig<TVars, TResult>;
  const result = await mutation.mutationFn(vars);
  mutation.onSuccess(result, vars);
  return result;
}

function expectFfeCachesInvalidated() {
  const keys = invalidatedKeys();
  for (const key of FFE_CACHE_KEYS) expect(keys).toContainEqual(key);
}

const LINE = {
  selectionId: 'i1',
  projectId: 'p1',
  lineKind: 'goods',
  quantity: 1,
  unitClientPriceCents: 150000,
  unitCostCents: 100000,
  markupPercent: 50,
  lineTotalCents: 150000,
  retailUnitCents: 180000,
  priceBasis: 'markup',
  pendingCostPrevCents: null,
  pendingCostChangedAt: null,
  pendingMarkupHeldPercent: null,
} satisfies FfeLinePricing;

// ─────────────────────────────────────────────────────────────────────────────
// Line writes: each calls its RPC by name and invalidates the FF&E caches
// ─────────────────────────────────────────────────────────────────────────────

describe('line pricing mutations', () => {
  it('useSetFfeLinePricing calls set_ffe_line_pricing with p_item_id, p_field and p_value', async () => {
    rpc.mockResolvedValue({ data: LINE, error: null });
    const result = await runMutation(useSetFfeLinePricing(), {
      projectId: 'p1',
      itemId: 'i1',
      field: 'markup_percent',
      value: 50,
    });
    expect(rpc).toHaveBeenCalledWith('set_ffe_line_pricing', {
      p_item_id: 'i1',
      p_field: 'markup_percent',
      p_value: 50,
    });
    expect(result).toEqual(LINE);
    expectFfeCachesInvalidated();
  });

  it('useSetFfeLinePricing passes a null value through (clears retail)', async () => {
    rpc.mockResolvedValue({ data: { ...LINE, retailUnitCents: null }, error: null });
    await runMutation(useSetFfeLinePricing(), {
      projectId: 'p1',
      itemId: 'i1',
      field: 'retail_unit_cents',
      value: null,
    });
    expect(rpc).toHaveBeenCalledWith('set_ffe_line_pricing', {
      p_item_id: 'i1',
      p_field: 'retail_unit_cents',
      p_value: null,
    });
  });

  it('useSetFfeLinePricing throws the RPC refusal and invalidates nothing', async () => {
    const error = { code: '23514', message: 'Released lines change through Record a change.' };
    rpc.mockResolvedValue({ data: null, error });
    const config = useSetFfeLinePricing() as unknown as MutationConfig<unknown, unknown>;
    await expect(
      config.mutationFn({ projectId: 'p1', itemId: 'i1', field: 'unit_client_price_cents', value: 95000 }),
    ).rejects.toBe(error);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('useSetFfeLineKind calls set_ffe_line_kind with p_item_id and p_line_kind', async () => {
    rpc.mockResolvedValue({ data: { ...LINE, lineKind: 'freight' }, error: null });
    await runMutation(useSetFfeLineKind(), { projectId: 'p1', itemId: 'i1', lineKind: 'freight' });
    expect(rpc).toHaveBeenCalledWith('set_ffe_line_kind', { p_item_id: 'i1', p_line_kind: 'freight' });
    expectFfeCachesInvalidated();
  });

  it('useResolveFfeCostChange calls resolve_ffe_cost_change with p_item_id and p_resolution', async () => {
    rpc.mockResolvedValue({ data: LINE, error: null });
    await runMutation(useResolveFfeCostChange(), { projectId: 'p1', itemId: 'i1', resolution: 'keep_client' });
    expect(rpc).toHaveBeenCalledWith('resolve_ffe_cost_change', { p_item_id: 'i1', p_resolution: 'keep_client' });
    expectFfeCachesInvalidated();
  });

  it('a cost change returns the flagged line with the markup it was priced at held', async () => {
    const flagged = {
      ...LINE,
      unitCostCents: 120000,
      markupPercent: 25,
      pendingCostPrevCents: 100000,
      pendingCostChangedAt: '2026-10-17T00:00:00Z',
      pendingMarkupHeldPercent: 50,
    } satisfies FfeLinePricing;
    rpc.mockResolvedValue({ data: flagged, error: null });
    const result = await runMutation(useSetFfeLinePricing(), {
      projectId: 'p1',
      itemId: 'i1',
      field: 'unit_cost_cents',
      value: 120000,
    });
    expect(result).toMatchObject({ markupPercent: 25, pendingCostPrevCents: 100000, pendingMarkupHeldPercent: 50 });
  });

  it('useResetFfeLineMarkup calls reset_ffe_line_markup with p_item_id', async () => {
    rpc.mockResolvedValue({ data: LINE, error: null });
    await runMutation(useResetFfeLineMarkup(), { projectId: 'p1', itemId: 'i1' });
    expect(rpc).toHaveBeenCalledWith('reset_ffe_line_markup', { p_item_id: 'i1' });
    expectFfeCachesInvalidated();
  });

  it('useResetProjectMarkups calls reset_project_markups with p_project_id and returns the counts', async () => {
    rpc.mockResolvedValue({ data: { projectId: 'p1', resetCount: 12, skippedCount: 2 }, error: null });
    const result = await runMutation(useResetProjectMarkups(), { projectId: 'p1' });
    expect(rpc).toHaveBeenCalledWith('reset_project_markups', { p_project_id: 'p1' });
    expect(result).toEqual({ projectId: 'p1', resetCount: 12, skippedCount: 2 });
    expectFfeCachesInvalidated();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The job's pricing (project_pricing_settings)
// ─────────────────────────────────────────────────────────────────────────────

describe('useProjectPricing', () => {
  interface Config {
    queryKey: unknown[];
    queryFn: () => Promise<unknown>;
    enabled: boolean;
  }

  function maybeSingleChain(result: { data: unknown; error: unknown }) {
    const calls: Array<[string, unknown[]]> = [];
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq']) {
      chain[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      };
    }
    chain.maybeSingle = async () => result;
    return { chain, calls };
  }

  it('keys on ["project-pricing", projectId] and reads the team-only row', async () => {
    const { chain, calls } = maybeSingleChain({
      data: { project_id: 'p1', markup_target_percent: 50, sales_tax_rate: 0.0825, updated_at: '2026-10-17T00:00:00Z' },
      error: null,
    });
    from.mockReturnValue(chain);
    const config = useProjectPricing('p1') as unknown as Config;
    expect(config.queryKey).toEqual(['project-pricing', 'p1']);
    expect(config.queryKey).toEqual(projectPricingKey('p1'));
    await expect(config.queryFn()).resolves.toEqual({
      projectId: 'p1',
      markupTargetPercent: 50,
      salesTaxRate: 0.0825,
      updatedAt: '2026-10-17T00:00:00Z',
    });
    expect(from).toHaveBeenCalledWith('project_pricing_settings');
    expect(calls).toContainEqual(['eq', ['project_id', 'p1']]);
  });

  it('reads an unset job as nulls', async () => {
    const { chain } = maybeSingleChain({ data: null, error: null });
    from.mockReturnValue(chain);
    const config = useProjectPricing('p1') as unknown as Config;
    await expect(config.queryFn()).resolves.toEqual({
      projectId: 'p1',
      markupTargetPercent: null,
      salesTaxRate: null,
      updatedAt: null,
    });
  });
});

describe('useSetProjectPricing', () => {
  it('calls set_project_pricing and invalidates the job pricing and the FF&E caches', async () => {
    rpc.mockResolvedValue({
      data: { projectId: 'p1', markupTargetPercent: 50, salesTaxRate: 0.0825, updatedAt: '2026-10-17T00:00:00Z' },
      error: null,
    });
    await runMutation(useSetProjectPricing(), { projectId: 'p1', markupTargetPercent: 50, salesTaxRate: 0.0825 });
    expect(rpc).toHaveBeenCalledWith('set_project_pricing', {
      p_project_id: 'p1',
      p_markup_target_percent: 50,
      p_sales_tax_rate: 0.0825,
    });
    expect(invalidatedKeys()).toContainEqual(['project-pricing', 'p1']);
    expectFfeCachesInvalidated();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The designer's defaults
// ─────────────────────────────────────────────────────────────────────────────

describe('designer pricing settings', () => {
  const SETTINGS = {
    defaultMarkupPercent: 40,
    freightMarkupPercent: 20,
    deliveryMarkupPercent: 35,
    installMarkupPercent: 35,
    isDefault: false,
    updatedAt: '2026-10-17T00:00:00Z',
  };

  it('usePricingSettings keys on ["my-pricing-settings"] and calls get_my_pricing_settings', async () => {
    rpc.mockResolvedValue({ data: SETTINGS, error: null });
    const config = usePricingSettings() as unknown as { queryKey: unknown[]; queryFn: () => Promise<unknown> };
    expect(config.queryKey).toEqual(['my-pricing-settings']);
    expect(config.queryKey).toEqual(myPricingSettingsKey);
    await expect(config.queryFn()).resolves.toEqual(SETTINGS);
    expect(rpc).toHaveBeenCalledWith('get_my_pricing_settings');
  });

  it('useSetPricingSettings sends null for an omitted value (keep it) and invalidates its key', async () => {
    rpc.mockResolvedValue({ data: SETTINGS, error: null });
    await runMutation(useSetPricingSettings(), { defaultMarkupPercent: 40, freightMarkupPercent: 20 });
    expect(rpc).toHaveBeenCalledWith('set_my_pricing_settings', {
      p_default_markup_percent: 40,
      p_freight_markup_percent: 20,
      p_delivery_markup_percent: null,
      p_install_markup_percent: null,
    });
    expect(invalidatedKeys()).toEqual([['my-pricing-settings']]);
  });
});
