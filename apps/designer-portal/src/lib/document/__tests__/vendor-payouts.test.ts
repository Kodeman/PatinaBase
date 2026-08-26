/**
 * Vendor payouts — the only read on the money ladder that knows what has
 * actually left the studio. `Moved` stops equalling `Authorized` because of
 * this file, so what it counts and what it refuses to count is the whole test.
 */
import type { POPayment, PurchaseOrder } from '@patina/supabase';

import {
  selectUndrawnVendorPayments,
  sumPaidVendorPayments,
} from '../vendor-payouts';

function payment(overrides: Partial<POPayment>): POPayment {
  return {
    id: 'payment-1',
    purchase_order_id: 'po-1',
    kind: 'deposit',
    amount_cents: 0,
    due_date: null,
    paid_date: null,
    state: 'pending',
    label: null,
    notes: null,
    sort_order: 0,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function purchaseOrder(
  overrides: Partial<PurchaseOrder> & { payments?: POPayment[] },
): PurchaseOrder {
  return {
    id: 'po-1',
    po_number: null,
    ...overrides,
  } as unknown as PurchaseOrder;
}

describe('sumPaidVendorPayments', () => {
  it('sums only the payments in state paid', () => {
    const pos = [
      purchaseOrder({
        payments: [
          payment({ id: 'a', state: 'paid', amount_cents: 5_000_000 }),
          payment({ id: 'b', state: 'due', amount_cents: 900_000 }),
          payment({ id: 'c', state: 'pending', amount_cents: 400_000 }),
        ],
      }),
      purchaseOrder({
        id: 'po-2',
        payments: [payment({ id: 'd', state: 'paid', amount_cents: 2_890_000 })],
      }),
    ];

    expect(sumPaidVendorPayments(pos)).toBe(7_890_000);
  });

  it('leaves a refunded payment out — that money came back to the studio', () => {
    const pos = [
      purchaseOrder({
        payments: [
          payment({ id: 'a', state: 'paid', amount_cents: 100_000 }),
          payment({ id: 'b', state: 'refunded', amount_cents: 100_000 }),
        ],
      }),
    ];

    expect(sumPaidVendorPayments(pos)).toBe(100_000);
  });

  it('reads an empty, absent or payment-less set of orders as nothing paid out', () => {
    expect(sumPaidVendorPayments([])).toBe(0);
    expect(sumPaidVendorPayments([purchaseOrder({})])).toBe(0);
    expect(sumPaidVendorPayments([purchaseOrder({ payments: [] })])).toBe(0);
  });
});

describe('selectUndrawnVendorPayments', () => {
  it('totals due and pending payments and names the one that comes due first', () => {
    const pos = [
      purchaseOrder({
        po_number: 'PO-2026-0418',
        payments: [
          payment({
            id: 'a',
            state: 'due',
            kind: 'deposit',
            amount_cents: 1_230_000,
            due_date: '2026-09-01',
            label: '50% at release',
          }),
          payment({ id: 'b', state: 'paid', amount_cents: 7_890_000 }),
        ],
      }),
      purchaseOrder({
        id: 'po-2',
        po_number: 'PO-2026-0500',
        payments: [
          payment({
            id: 'c',
            state: 'pending',
            kind: 'balance',
            amount_cents: 500_000,
            due_date: '2026-11-01',
          }),
        ],
      }),
    ];

    expect(selectUndrawnVendorPayments(pos)).toEqual({
      cents: 1_730_000,
      kind: 'deposit',
      poNumber: 'PO-2026-0418',
      label: '50% at release',
    });
  });

  it('sorts an undated payment behind a dated one, then by sort order', () => {
    const pos = [
      purchaseOrder({
        po_number: 'PO-1',
        payments: [
          payment({ id: 'a', state: 'due', amount_cents: 100, due_date: null, sort_order: 0 }),
          payment({
            id: 'b',
            state: 'due',
            kind: 'milestone',
            amount_cents: 200,
            due_date: '2026-10-01',
            sort_order: 5,
          }),
        ],
      }),
    ];

    expect(selectUndrawnVendorPayments(pos).kind).toBe('milestone');
  });

  it('names nothing when every payment is already paid', () => {
    const pos = [
      purchaseOrder({
        po_number: 'PO-1',
        payments: [payment({ id: 'a', state: 'paid', amount_cents: 500_000 })],
      }),
    ];

    expect(selectUndrawnVendorPayments(pos)).toEqual({
      cents: 0,
      kind: null,
      poNumber: null,
      label: null,
    });
  });

  it('reads an empty or payment-less set of orders as nothing undrawn', () => {
    expect(selectUndrawnVendorPayments([]).cents).toBe(0);
    expect(selectUndrawnVendorPayments([purchaseOrder({})]).cents).toBe(0);
  });
});
