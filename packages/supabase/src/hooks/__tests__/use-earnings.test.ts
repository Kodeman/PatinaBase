import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — mirrors the use-direct-orders / use-invoices rig (repo gotcha:
// `jest.mock('@patina/supabase')` no-ops under paths+SWC; mock the concrete
// `@supabase/ssr` module that `createBrowserClient()` actually calls).
// ─────────────────────────────────────────────────────────────────────────────

const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  from: vi.fn(),
  rpc: vi.fn(),
  functions: { invoke: vi.fn() },
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
import { useEarningsStats } from '../use-earnings';

beforeEach(() => {
  vi.clearAllMocks();
});

interface StatsConfig {
  queryKey: unknown[];
  queryFn: () => Promise<{
    totalEarnings: number;
    confirmedEarnings: number;
    paidEarnings: number;
    bySource: { design_fee: number; product_commission: number };
    transactionCount: number;
  }>;
}

// `.select(...)` is awaited directly (no `.order()`), so the select mock itself
// resolves to { data, error }.
function mockEarnings(rows: unknown[]) {
  const selectMock = vi.fn().mockResolvedValue({ data: rows, error: null });
  supabaseClient.from.mockReturnValue({ select: selectMock });
  return selectMock;
}

const NOW = new Date().toISOString();

describe('useEarningsStats — refund contra rows (00277)', () => {
  it('fetches reverses_invoice_payment_id so contra rows can be identified', async () => {
    const selectMock = mockEarnings([]);
    const config = useEarningsStats() as unknown as StatsConfig;
    await config.queryFn();

    expect(supabaseClient.from).toHaveBeenCalledWith('designer_earnings');
    expect(selectMock).toHaveBeenCalledWith(
      'net_amount, status, source_type, created_at, reverses_invoice_payment_id'
    );
  });

  it('excludes contra rows from transactionCount but keeps them in money SUMs', async () => {
    // Three forward credits + one refund reversal of the first $1,000 credit.
    mockEarnings([
      { net_amount: 1000, status: 'confirmed', source_type: 'design_fee', created_at: NOW, reverses_invoice_payment_id: null },
      { net_amount: 500, status: 'confirmed', source_type: 'design_fee', created_at: NOW, reverses_invoice_payment_id: null },
      { net_amount: 200, status: 'paid', source_type: 'product_commission', created_at: NOW, reverses_invoice_payment_id: null },
      // contra: negates the first credit, same status/source bucket, keyed to a payment.
      { net_amount: -1000, status: 'confirmed', source_type: 'design_fee', created_at: NOW, reverses_invoice_payment_id: 'pay-1' },
    ]);

    const config = useEarningsStats() as unknown as StatsConfig;
    const stats = await config.queryFn();

    // COUNT excludes the single contra row (3 real transactions, not 4).
    expect(stats.transactionCount).toBe(3);

    // SUMS still net the refund out (contra included): 1000 + 500 + 200 − 1000.
    expect(stats.totalEarnings).toBe(700);
    // confirmed bucket nets to 1000 + 500 − 1000 = 500.
    expect(stats.confirmedEarnings).toBe(500);
    expect(stats.paidEarnings).toBe(200);
    // by-source design_fee nets the contra too: 1000 + 500 − 1000 = 500.
    expect(stats.bySource.design_fee).toBe(500);
    expect(stats.bySource.product_commission).toBe(200);
  });

  it('counts every row when there are no contra rows', async () => {
    mockEarnings([
      { net_amount: 1000, status: 'confirmed', source_type: 'design_fee', created_at: NOW, reverses_invoice_payment_id: null },
      { net_amount: 200, status: 'paid', source_type: 'product_commission', created_at: NOW, reverses_invoice_payment_id: null },
    ]);

    const config = useEarningsStats() as unknown as StatsConfig;
    const stats = await config.queryFn();

    expect(stats.transactionCount).toBe(2);
    expect(stats.totalEarnings).toBe(1200);
  });
});
