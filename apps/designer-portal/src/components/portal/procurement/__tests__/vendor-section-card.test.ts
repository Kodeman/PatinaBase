/**
 * Unit test for the Phase 4 ("Order via Patina" designer-pays-at-order-time)
 * Pay-now visibility rule: payNowPayment(po) — a pure predicate/resolver, no
 * React rendering — exported from vendor-section-card.tsx per the same
 * "cheap, jsdom-free" pattern as po-send-actions.test.ts: the runtime deps
 * (@patina/supabase, toast-provider, analytics) are mocked so importing the
 * module never touches a live hook, even though this test never renders the
 * component itself.
 */

jest.mock('@patina/supabase', () => ({
  useStartPoCheckout: jest.fn(),
}));
jest.mock('@/components/portal/toast-provider', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));
jest.mock('@/lib/analytics/procurement-events', () => ({
  procurementEvents: { poSent: jest.fn() },
}));

import { payNowPayment } from '../vendor-section-card';
import type { POPayment, PurchaseOrder } from '@patina/supabase';

type PoFixture = Pick<PurchaseOrder, 'is_patina_catalog' | 'payments' | 'status'>;

function payment(overrides: Partial<POPayment> = {}): POPayment {
  return {
    id: 'pp-1',
    purchase_order_id: 'po-1',
    kind: 'deposit',
    amount_cents: 50000,
    due_date: null,
    paid_date: null,
    state: 'pending',
    label: null,
    notes: null,
    sort_order: 0,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function po(overrides: Partial<PoFixture> = {}): PoFixture {
  return {
    is_patina_catalog: true,
    status: 'confirmed',
    payments: [payment()],
    ...overrides,
  };
}

describe('payNowPayment', () => {
  it('returns the pending payment for a Patina-catalog PO with a positive amount due', () => {
    const result = payNowPayment(po({ payments: [payment({ state: 'pending', amount_cents: 120000 })] }));
    expect(result?.amount_cents).toBe(120000);
  });

  it('returns a "due" payment too (not just "pending")', () => {
    const result = payNowPayment(po({ payments: [payment({ state: 'due', amount_cents: 75000 })] }));
    expect(result?.state).toBe('due');
  });

  it('returns null for a non-catalog PO even with an unpaid, positive-amount payment', () => {
    const result = payNowPayment(
      po({ is_patina_catalog: false, payments: [payment({ state: 'pending', amount_cents: 50000 })] }),
    );
    expect(result).toBeNull();
  });

  it('returns null once the payment is paid', () => {
    const result = payNowPayment(po({ payments: [payment({ state: 'paid', amount_cents: 50000 })] }));
    expect(result).toBeNull();
  });

  it('returns null when the unpaid row has a zero amount (nothing due)', () => {
    const result = payNowPayment(po({ payments: [payment({ state: 'pending', amount_cents: 0 })] }));
    expect(result).toBeNull();
  });

  it('returns null when the PO has no payment rows at all', () => {
    const result = payNowPayment(po({ payments: [] }));
    expect(result).toBeNull();
  });

  it('returns null for a cancelled catalog PO even with an unpaid payment', () => {
    const result = payNowPayment(
      po({ status: 'cancelled', payments: [payment({ state: 'pending', amount_cents: 50000 })] }),
    );
    expect(result).toBeNull();
  });

  it('picks the lowest sort_order unpaid row when a catalog PO carries a split pattern', () => {
    const result = payNowPayment(
      po({
        payments: [
          payment({ id: 'balance', kind: 'balance', state: 'due', amount_cents: 30000, sort_order: 1 }),
          payment({ id: 'deposit', kind: 'deposit', state: 'due', amount_cents: 20000, sort_order: 0 }),
        ],
      }),
    );
    expect(result?.id).toBe('deposit');
  });
});
