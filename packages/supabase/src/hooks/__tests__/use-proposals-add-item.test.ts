import { beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn();
const productLookup = vi.fn();
const productEq = vi.fn();

// A thenable query builder: every filter returns itself; awaiting it resolves
// to `result`. Enough for the position read and the product vendor lookup.
function builder(result: unknown, onMaybeSingle?: () => unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) {
    chain[method] = (...args: unknown[]) => {
      if (method === 'eq' && onMaybeSingle) productEq(...args);
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(onMaybeSingle ? onMaybeSingle() : result);
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

const from = vi.fn((table: string) => {
  if (table === 'products') return builder(null, () => productLookup());
  const read = builder({ data: [] });
  return {
    ...read,
    insert: (payload: unknown) => {
      insert(payload);
      return {
        select: () => ({ single: () => Promise.resolve({ data: { id: 'line-1' }, error: null }) }),
      };
    },
  };
});

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from, rpc: vi.fn() }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('../../lib/proposal-total', () => ({
  updateProposalTotal: vi.fn(() => Promise.resolve(0)),
}));

import { useAddProposalItem } from '../use-proposals';

type AddInput = Record<string, unknown> & {
  proposalId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

const mutationFn = (useAddProposalItem() as unknown as {
  mutationFn: (input: AddInput) => Promise<{ id: string }>;
}).mutationFn;

const inserted = () => insert.mock.calls[0]?.[0] as Record<string, unknown>;

describe('useAddProposalItem price basis and vendor', () => {
  beforeEach(() => {
    insert.mockClear();
    from.mockClear();
    productEq.mockClear();
    productLookup.mockReset();
    productLookup.mockReturnValue({ data: { vendor_id: 'vendor-from-product' }, error: null });
  });

  it('keeps the historical behaviour when no basis is given: trade = sell = unitPrice', async () => {
    await mutationFn({ proposalId: 'p1', productId: 'prod-1', name: 'Chair', quantity: 2, unitPrice: 5000 });
    expect(inserted()).toMatchObject({ unit_price: 5000, unit_sell_price: 5000, line_total_cents: 10000 });
    expect(inserted()).not.toHaveProperty('vendor_id');
    expect(from).not.toHaveBeenCalledWith('products');
  });

  it('retail basis writes the price to sell only and leaves trade at 0', async () => {
    await mutationFn({
      proposalId: 'p1',
      name: 'Rattan lounge',
      quantity: 1,
      unitPrice: 89900,
      priceBasis: 'retail',
    });
    expect(inserted()).toMatchObject({ unit_price: 0, unit_sell_price: 89900, line_total_cents: 89900 });
  });

  it('an explicit unitTradePrice wins over the basis default', async () => {
    await mutationFn({
      proposalId: 'p1',
      name: 'Chair',
      quantity: 1,
      unitPrice: 89900,
      unitTradePrice: 54000,
      priceBasis: 'retail',
    });
    expect(inserted()).toMatchObject({ unit_price: 54000, unit_sell_price: 89900 });
  });

  it('carries vendor id, vendor name and custom_fields.source_url', async () => {
    await mutationFn({
      proposalId: 'p1',
      name: 'Rattan lounge',
      quantity: 1,
      unitPrice: 89900,
      priceBasis: 'retail',
      vendorId: 'vendor-9',
      vendorName: 'Marlow & Co',
      customFields: { source_url: 'https://maker.example/lounge' },
    });
    expect(inserted()).toMatchObject({
      vendor_id: 'vendor-9',
      vendor_name: 'Marlow & Co',
      custom_fields: { source_url: 'https://maker.example/lounge' },
    });
    expect(from).not.toHaveBeenCalledWith('products');
  });

  it('retail basis resolves a product line vendor from the product when none is given', async () => {
    await mutationFn({
      proposalId: 'p1',
      productId: 'prod-1',
      name: 'Chair',
      quantity: 1,
      unitPrice: 120000,
      priceBasis: 'retail',
    });
    expect(productEq).toHaveBeenCalledWith('id', 'prod-1');
    expect(inserted()).toMatchObject({ vendor_id: 'vendor-from-product' });
  });

  it('a failed product vendor lookup still adds the line without a vendor', async () => {
    productLookup.mockReturnValue({ data: null, error: { message: 'denied' } });
    const line = await mutationFn({
      proposalId: 'p1',
      productId: 'prod-1',
      name: 'Chair',
      quantity: 1,
      unitPrice: 120000,
      priceBasis: 'retail',
    });
    expect(line).toEqual({ id: 'line-1' });
    expect(inserted()).not.toHaveProperty('vendor_id');
  });
});
