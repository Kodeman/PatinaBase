/**
 * SQ-858 (money-p1, the SQ-834 walk §8) — "Who owes us what?" The Accounts
 * register reads what is owed first: overdue, then owed and not yet due, then
 * drafts, then paid, then void; within each, the book's own order (newest
 * first) holds. Every figure prints to the cent.
 *
 * And money-p2: the folio's money rows keep label and figure apart at every
 * width (WALK §8, "SUBTOTAL$9,200.00" at 390).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import type { Invoice } from '@patina/supabase';
import { AccountsLedgerPage, owedFirst } from '../accounts-ledger-page';

jest.mock('../invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
  openInvoiceFolio: jest.fn(),
}));

jest.mock('@patina/supabase', () => ({
  useEmailDelivery: () => ({ byRef: {}, isLoading: false, isError: false }),
  // Overdue only where the fixture says so.
  invoiceDaysOverdue: (inv: { due_date: string | null }) => (inv.due_date === '2026-09-28' ? 14 : -9),
  useOrganizations: () => ({ data: [], isError: false }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const invoice = (id: string, over: Partial<Invoice>): Invoice =>
  ({
    id,
    project_id: `project-${id}`,
    studio_id: 'studio-1',
    designer_id: 'designer-1',
    client_id: 'client-1',
    invoice_number: id,
    title: null,
    status: 'sent',
    issue_date: '2026-10-01',
    due_date: '2026-10-24',
    payment_terms_days: 14,
    currency: 'USD',
    subtotal_cents: 100_000,
    tax_rate: 0,
    tax_cents: 0,
    total_cents: 100_000,
    amount_paid_cents: 0,
    memo: null,
    internal_notes: null,
    stripe_checkout_session_id: null,
    sent_at: '2026-10-01T12:00:00.000Z',
    paid_at: null,
    voided_at: null,
    void_reason: null,
    reminder_count: 0,
    last_reminder_at: null,
    ar_flagged_at: null,
    ar_last_chased_at: null,
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-01T12:00:00.000Z',
    project: { id: `project-${id}`, name: `House ${id}` },
    ...over,
  }) as Invoice;

// The book as it arrives: newest first.
const BOOK = [
  invoice('INV-0723', { status: 'paid', amount_paid_cents: 920_000, total_cents: 920_000, paid_at: '2026-10-12T10:10:00Z' }),
  invoice('INV-0724', { status: 'draft', total_cents: 482_000 }),
  invoice('INV-0730', { status: 'void', total_cents: 50_000 }),
  invoice('INV-0725', { total_cents: 650_000 }),
  invoice('INV-0726', { total_cents: 340_000, due_date: '2026-10-21' }),
  invoice('INV-0721', { total_cents: 380_000, due_date: '2026-09-28' }),
  invoice('INV-0718', { status: 'paid', amount_paid_cents: 260_000, total_cents: 260_000, paid_at: '2026-10-02T10:00:00Z' }),
];

const ORDER = ['INV-0721', 'INV-0725', 'INV-0726', 'INV-0724', 'INV-0723', 'INV-0718', 'INV-0730'];

describe('Accounts · what is owed first (money-p1)', () => {
  it('orders overdue, owed, drafts, paid, void — newest first within each', () => {
    expect(owedFirst(BOOK).map((inv) => inv.id)).toEqual(ORDER);
  });

  it('renders the register in that order, under its eyebrow', () => {
    render(<AccountsLedgerPage invoices={BOOK} onOpenDocument={jest.fn()} />);
    expect(screen.getByText('Invoices · what is owed first')).toBeInTheDocument();
    const rows = Array.from(document.querySelectorAll('[data-invoice-row]')).map((row) =>
      row.getAttribute('data-invoice-row'),
    );
    expect(rows).toEqual(ORDER);
  });

  it('prints every figure to the cent', () => {
    render(
      <AccountsLedgerPage
        invoices={[
          invoice('INV-0721', { total_cents: 380_000, due_date: '2026-09-28' }),
          invoice('INV-0740', { status: 'partially_paid', total_cents: 1_750_050, amount_paid_cents: 500_000 }),
        ]}
        onOpenDocument={jest.fn()}
      />,
    );
    const figures = Array.from(document.querySelectorAll('.lfig')).map((fig) => fig.textContent);
    expect(figures).toEqual(['$3,800.00', '$17,500.50']);
    // The partly paid row's owed clause is exact too.
    expect(document.querySelector('[data-invoice-row="INV-0740"]')).toHaveTextContent('$12,500.50 owed');
  });

  it('prints an invoice in its own currency', () => {
    render(
      <AccountsLedgerPage
        invoices={[invoice('INV-0750', { total_cents: 380_025, currency: 'EUR' })]}
        onOpenDocument={jest.fn()}
      />,
    );
    expect(document.querySelector('.lfig')).toHaveTextContent('€3,800.25');
  });
});

describe('the folio’s money rows (money-p2)', () => {
  const css = readFileSync(join(__dirname, '../../../../app/globals.css'), 'utf8');
  const block = css.slice(css.indexOf('/* US-28 walk-fix money'), css.indexOf('/* end US-28 walk-fix money */'));

  it('keeps label and figure apart at every width, outside any width query', () => {
    expect(block).not.toBe('');
    expect(block).not.toMatch(/@media/);
    expect(block).toMatch(
      /\.money-folio-sec \.money-rows > \.money-row \{[^}]*display: flex;[^}]*gap: 4px 12px;/,
    );
  });
});
