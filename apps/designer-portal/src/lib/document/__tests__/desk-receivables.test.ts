/**
 * The Desk hangs a receivable need on a folder, and a folder is a house. A
 * studio invoice (00571, ruling S1) has no house, so it is chased from the
 * Accounts Receivables page instead of the Desk (ruling S9) — it must not
 * crash the map and must not invent a folder.
 */

import type { Invoice } from '@patina/supabase';
import { buildDeskReceivables } from '../desk-receivables';

const NOW = new Date('2026-09-05T09:00:00.000Z');

const invoice = (overrides: Partial<Invoice>): Invoice =>
  ({
    id: 'invoice-1',
    project_id: 'project-1',
    studio_id: 'studio-1',
    designer_id: 'designer-1',
    client_id: 'client-1',
    invoice_number: 'INV-0001',
    title: null,
    status: 'sent',
    issue_date: '2026-07-01',
    due_date: '2026-07-15',
    payment_terms_days: 14,
    currency: 'USD',
    subtotal_cents: 25_000,
    tax_rate: 0,
    tax_cents: 0,
    total_cents: 25_000,
    amount_paid_cents: 0,
    memo: null,
    internal_notes: null,
    stripe_checkout_session_id: null,
    sent_at: '2026-07-01T12:00:00.000Z',
    paid_at: null,
    voided_at: null,
    void_reason: null,
    reminder_count: 0,
    last_reminder_at: null,
    ar_flagged_at: null,
    ar_last_chased_at: null,
    created_at: '2026-07-01T12:00:00.000Z',
    updated_at: '2026-07-01T12:00:00.000Z',
    ...overrides,
  }) as Invoice;

describe('buildDeskReceivables', () => {
  it('keys an overdue project invoice on its house', () => {
    const map = buildDeskReceivables([invoice({})], NOW);
    expect([...map.keys()]).toEqual(['project-1']);
    expect(map.get('project-1')).toMatchObject({
      count: 1,
      invoiceId: 'invoice-1',
      totalBalanceCents: 25_000,
    });
  });

  it('leaves an overdue studio invoice off the Desk entirely', () => {
    const map = buildDeskReceivables(
      [
        invoice({
          id: 'studio-invoice-1',
          project_id: null,
          title: 'Design consultation, September',
        }),
      ],
      NOW,
    );
    expect(map.size).toBe(0);
  });

  it('still files the house invoices when a studio invoice sits beside them', () => {
    const map = buildDeskReceivables(
      [
        invoice({ id: 'studio-invoice-1', project_id: null, title: 'Site visit' }),
        invoice({}),
      ],
      NOW,
    );
    expect([...map.keys()]).toEqual(['project-1']);
    expect(map.get('project-1')?.count).toBe(1);
  });
});
