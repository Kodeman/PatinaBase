import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — useQuery returns its own config, so a test reads the query key and
// runs the queryFn directly.
// ─────────────────────────────────────────────────────────────────────────────

const rpc = vi.fn();
const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  from: vi.fn(),
  rpc,
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// Import AFTER mocks.
import { useFfePricingEvents, useProjectPricingApproval } from '../use-pricing-approval';
import { invalidateFfeCaches } from '../use-procurement';
import { pricingApprovalKeys } from '../../query-keys/pricing';

interface QueryConfig<T> {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
  enabled: boolean;
}

beforeEach(() => {
  vi.clearAllMocks();
});

const APPROVAL = {
  approvalId: 'a1',
  approvalSource: 'project_approval',
  approvalRef: 'd1',
  approvedAt: '2026-10-17T07:00:00Z',
  approvedBy: 'c1',
  approvedTotalCents: 220000,
  lines: [
    { itemId: 'i1', approvedUnitClientPriceCents: 160000, approvedQuantity: 1, approvedLineTotalCents: 160000, differs: false },
  ],
};

describe('useProjectPricingApproval', () => {
  it('reads get_project_pricing_approval for the job', async () => {
    rpc.mockResolvedValueOnce({ data: APPROVAL, error: null });
    const config = useProjectPricingApproval('p1') as unknown as QueryConfig<unknown>;

    expect(config.queryKey).toEqual(['project-pricing-approval', 'p1']);
    expect(config.enabled).toBe(true);
    await expect(config.queryFn()).resolves.toEqual(APPROVAL);
    expect(rpc).toHaveBeenCalledWith('get_project_pricing_approval', { p_project_id: 'p1' });
  });

  it('returns null before any approval', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const config = useProjectPricingApproval('p1') as unknown as QueryConfig<unknown>;
    await expect(config.queryFn()).resolves.toBeNull();
  });

  it('throws the refusal (42501 outside the team)', async () => {
    const refusal = { code: '42501', message: 'project not found or access denied' };
    rpc.mockResolvedValueOnce({ data: null, error: refusal });
    const config = useProjectPricingApproval('p1') as unknown as QueryConfig<unknown>;
    await expect(config.queryFn()).rejects.toBe(refusal);
  });

  it('waits for a project id', () => {
    const config = useProjectPricingApproval(undefined) as unknown as QueryConfig<unknown>;
    expect(config.enabled).toBe(false);
  });
});

describe('useFfePricingEvents', () => {
  const EVENT = {
    id: 'e1', itemId: 'i1', field: 'quantity', oldValue: '2', newValue: '3',
    actorId: 'u1', actorName: 'P810 Designer', at: '2026-10-17T07:01:00Z',
  };

  it('reads the whole job when no item is given', async () => {
    rpc.mockResolvedValueOnce({ data: [EVENT], error: null });
    const config = useFfePricingEvents('p1') as unknown as QueryConfig<unknown>;

    expect(config.queryKey).toEqual(['ffe-pricing-events', 'p1', null]);
    await expect(config.queryFn()).resolves.toEqual([EVENT]);
    expect(rpc).toHaveBeenCalledWith('get_ffe_pricing_events', { p_project_id: 'p1' });
  });

  it('reads one line when an item is given', async () => {
    rpc.mockResolvedValueOnce({ data: [EVENT], error: null });
    const config = useFfePricingEvents('p1', 'i1') as unknown as QueryConfig<unknown>;

    expect(config.queryKey).toEqual(['ffe-pricing-events', 'p1', 'i1']);
    await config.queryFn();
    expect(rpc).toHaveBeenCalledWith('get_ffe_pricing_events', { p_project_id: 'p1', p_item_id: 'i1' });
  });

  it('returns an empty list for a null payload and throws a refusal', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const config = useFfePricingEvents('p1') as unknown as QueryConfig<unknown>;
    await expect(config.queryFn()).resolves.toEqual([]);

    const refusal = { code: '42501', message: 'project not found or access denied' };
    rpc.mockResolvedValueOnce({ data: null, error: refusal });
    await expect(config.queryFn()).rejects.toBe(refusal);
  });
});

describe('invalidateFfeCaches', () => {
  it('refreshes the snapshot and every events query of the job after a line write', () => {
    const invalidateQueries = vi.fn();
    invalidateFfeCaches({ invalidateQueries } as unknown as QueryClient, 'p1');
    const keys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);

    expect(keys).toContainEqual(pricingApprovalKeys.approval('p1'));
    expect(keys).toContainEqual(pricingApprovalKeys.eventsForProject('p1'));
    // The prefix reaches the item-scoped keys.
    expect(pricingApprovalKeys.events('p1', 'i1').slice(0, 2)).toEqual([
      ...pricingApprovalKeys.eventsForProject('p1'),
    ]);
  });
});
