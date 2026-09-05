/**
 * R136 — how a studio invoice reads on the two Accounts pages that list money:
 * the house column carries the regarding line with a small mono `studio` stamp,
 * and the quiet `document ↗` doorway does not render, because there is no house
 * to walk into. House rows are untouched.
 */

import { render, screen, within } from '@testing-library/react';
import type { ArAging, Invoice } from '@patina/supabase';
import { AccountsLedgerPage } from '../accounts-ledger-page';
import { AccountsReceivablesPage } from '../accounts-receivables-page';

jest.mock('../invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
  openInvoiceFolio: jest.fn(),
}));

jest.mock('@patina/supabase', () => ({
  useSendInvoice: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useChaseInvoice: () => ({ mutateAsync: jest.fn(), isPending: false }),
  invoiceDaysOverdue: (inv: { due_date: string | null }) =>
    inv.due_date === '2026-08-18' ? 18 : -9,
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const base = (over: Partial<Invoice>): Invoice =>
  ({
    id: 'invoice-1',
    project_id: 'project-1',
    studio_id: 'studio-1',
    designer_id: 'designer-1',
    client_id: 'client-1',
    invoice_number: 'INV-0030',
    title: null,
    status: 'sent',
    issue_date: '2026-09-01',
    due_date: '2026-09-14',
    payment_terms_days: 14,
    currency: 'USD',
    subtotal_cents: 912_500,
    tax_rate: 0,
    tax_cents: 0,
    total_cents: 912_500,
    amount_paid_cents: 0,
    memo: null,
    internal_notes: null,
    stripe_checkout_session_id: null,
    sent_at: '2026-09-01T12:00:00.000Z',
    paid_at: null,
    voided_at: null,
    void_reason: null,
    reminder_count: 0,
    last_reminder_at: null,
    ar_flagged_at: null,
    ar_last_chased_at: null,
    created_at: '2026-09-01T12:00:00.000Z',
    updated_at: '2026-09-01T12:00:00.000Z',
    project: { id: 'project-1', name: 'Hollis House' },
    ...over,
  }) as Invoice;

const houseInvoice = base({});
const studioInvoice = base({
  id: 'invoice-2',
  invoice_number: 'INV-0031',
  project_id: null,
  project: undefined,
  title: 'Design consultation',
  total_cents: 45_000,
});

describe('AccountsLedgerPage · a studio row beside the houses', () => {
  it('reads the regarding line with a studio stamp, and offers no document doorway', () => {
    render(
      <AccountsLedgerPage
        invoices={[studioInvoice, houseInvoice]}
        onOpenDocument={jest.fn()}
      />,
    );

    const studioRow = screen.getByText('Invoice INV-0031').closest('li') as HTMLElement;
    expect(studioRow.textContent).toContain('Design consultation');
    expect(within(studioRow).getByText('studio')).toBeInTheDocument();
    expect(within(studioRow).queryByRole('button', { name: /document/ })).toBeNull();

    const houseRow = screen.getByText('Invoice INV-0030').closest('li') as HTMLElement;
    expect(houseRow.textContent).toContain('Hollis House');
    expect(within(houseRow).queryByText('studio')).toBeNull();
    expect(within(houseRow).getByRole('button', { name: 'document ↗' })).toBeInTheDocument();
  });
});

describe('AccountsReceivablesPage · a studio row ages like any other', () => {
  const aging = (openInvoices: Invoice[]): ArAging =>
    ({
      openInvoices,
      buckets: [],
      totalBalanceCents: openInvoices.reduce((s, i) => s + i.total_cents, 0),
    }) as ArAging;

  it('stamps the overdue studio row, keeps its chase, and drops the doorway', () => {
    const overdueStudio = base({
      id: 'invoice-3',
      invoice_number: 'INV-0026',
      project_id: null,
      project: undefined,
      title: 'Paid design review',
      due_date: '2026-08-18',
      total_cents: 120_000,
    });

    render(
      <AccountsReceivablesPage
        aging={aging([overdueStudio])}
        highlightInvoiceId={null}
        onOpenDocument={jest.fn()}
      />,
    );

    const row = screen.getByText(/Invoice INV-0026/).closest('li') as HTMLElement;
    expect(row.textContent).toContain('Paid design review');
    expect(within(row).getByText('studio')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Send reminder' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /document/ })).toBeNull();
  });

  it('leaves a house receivable with its doorway and no stamp', () => {
    render(
      <AccountsReceivablesPage
        aging={aging([houseInvoice])}
        highlightInvoiceId={null}
        onOpenDocument={jest.fn()}
      />,
    );

    const row = screen.getByText(/Invoice INV-0030/).closest('li') as HTMLElement;
    expect(row.textContent).toContain('Hollis House');
    expect(within(row).queryByText('studio')).toBeNull();
    expect(within(row).getByRole('button', { name: 'document ↗' })).toBeInTheDocument();
  });
});
