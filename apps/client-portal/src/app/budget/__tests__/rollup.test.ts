/**
 * Rollup math for the client Budget page — pure functions, no hooks/mocks
 * required. Mirrors the paid/outstanding math already established in
 * project-invoices-summary.tsx, extracted here so it's independently
 * testable per-project.
 */

import { computeInvoiceRollup, visibleInvoices } from '../rollup';
import type { Invoice } from '@patina/supabase';

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    project_id: 'proj-1',
    designer_id: 'designer-1',
    client_id: 'client-1',
    invoice_number: 'INV-0001',
    status: 'sent',
    issue_date: '2026-01-01',
    due_date: '2026-02-01',
    payment_terms_days: 15,
    currency: 'USD',
    subtotal_cents: 100000,
    tax_rate: 0,
    tax_cents: 0,
    total_cents: 100000,
    amount_paid_cents: 0,
    memo: null,
    internal_notes: null,
    stripe_checkout_session_id: null,
    sent_at: '2026-01-01T00:00:00Z',
    paid_at: null,
    voided_at: null,
    void_reason: null,
    reminder_count: 0,
    last_reminder_at: null,
    ar_flagged_at: null,
    ar_last_chased_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('visibleInvoices', () => {
  it('excludes draft and void invoices, keeps everything else', () => {
    const invoices = [
      makeInvoice({ id: 'a', status: 'draft' }),
      makeInvoice({ id: 'b', status: 'sent' }),
      makeInvoice({ id: 'c', status: 'partially_paid' }),
      makeInvoice({ id: 'd', status: 'paid' }),
      makeInvoice({ id: 'e', status: 'void' }),
    ];

    const result = visibleInvoices(invoices).map((i) => i.id);

    expect(result).toEqual(['b', 'c', 'd']);
  });
});

describe('computeInvoiceRollup', () => {
  it('returns zeros for an empty list', () => {
    expect(computeInvoiceRollup([])).toEqual({ paidCents: 0, outstandingCents: 0 });
  });

  it('sums amount_paid_cents across visible invoices for paidCents', () => {
    const invoices = [
      makeInvoice({ id: 'a', status: 'paid', total_cents: 50000, amount_paid_cents: 50000 }),
      makeInvoice({
        id: 'b',
        status: 'partially_paid',
        total_cents: 100000,
        amount_paid_cents: 30000,
      }),
    ];

    expect(computeInvoiceRollup(invoices).paidCents).toBe(80000);
  });

  it('sums remaining balance (total - paid) across visible invoices for outstandingCents', () => {
    const invoices = [
      makeInvoice({ id: 'a', status: 'sent', total_cents: 100000, amount_paid_cents: 0 }),
      makeInvoice({
        id: 'b',
        status: 'partially_paid',
        total_cents: 40000,
        amount_paid_cents: 15000,
      }),
    ];

    // (100000 - 0) + (40000 - 15000) = 125000
    expect(computeInvoiceRollup(invoices).outstandingCents).toBe(125000);
  });

  it('treats a fully paid invoice as zero outstanding', () => {
    const invoices = [
      makeInvoice({ id: 'a', status: 'paid', total_cents: 50000, amount_paid_cents: 50000 }),
    ];

    expect(computeInvoiceRollup(invoices).outstandingCents).toBe(0);
  });

  it('excludes draft invoices from both sums', () => {
    const invoices = [
      makeInvoice({ id: 'a', status: 'draft', total_cents: 999999, amount_paid_cents: 0 }),
    ];

    expect(computeInvoiceRollup(invoices)).toEqual({ paidCents: 0, outstandingCents: 0 });
  });

  it('excludes void invoices from both sums even if they carry a stale balance', () => {
    const invoices = [
      makeInvoice({ id: 'a', status: 'void', total_cents: 100000, amount_paid_cents: 0 }),
    ];

    expect(computeInvoiceRollup(invoices)).toEqual({ paidCents: 0, outstandingCents: 0 });
  });
});
