/**
 * C-25: the composer door "Bill N unbilled purchases" reads the unbilled set
 * and opens the composer on it. The bill-at-cost lines themselves are SQ-429's.
 */
import {
  purchaseAtCostCents,
  purchasesBillArgs,
  unbilledPurchases,
  type ComposerPurchase,
} from '@/lib/document/invoice-composer';

const purchase = (id: string, extra: Partial<ComposerPurchase> = {}): ComposerPurchase => ({
  id,
  status: 'recorded',
  billable_to_client: true,
  invoice_line_id: null,
  payee_name: 'CB2',
  purchased_on: '2026-10-03',
  amount_cents: 10000,
  ...extra,
});

describe('the unbilled purchases door', () => {
  it('reads only recorded, billable purchases on no invoice line', () => {
    const rows = [
      purchase('a'),
      purchase('billed', { status: 'billed' }),
      purchase('returned', { status: 'returned' }),
      purchase('void', { status: 'void' }),
      purchase('overhead', { billable_to_client: false }),
      purchase('stamped', { invoice_line_id: 'il-1' }),
      purchase('b'),
    ];
    expect(unbilledPurchases(rows).map((p) => p.id)).toEqual(['a', 'b']);
    expect(unbilledPurchases(undefined)).toEqual([]);
  });

  it('bills at cost: amount, tax, premium and shipping (R-PB7)', () => {
    expect(
      purchaseAtCostCents({ amount_cents: 120050, tax_cents: 9600, buyer_premium_cents: 2400, shipping_cents: 850 }),
    ).toBe(132900);
    expect(purchaseAtCostCents({ amount_cents: 5000, tax_cents: null })).toBe(5000);
  });

  it('opens the composer on the project with those purchases asked for', () => {
    expect(purchasesBillArgs('proj-1', [purchase('a'), purchase('b')])).toEqual({
      projectId: 'proj-1',
      initialPurchaseIds: ['a', 'b'],
    });
  });
});
