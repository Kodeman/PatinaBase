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

let mockEmailDeliveryByRef: Record<string, unknown> = {};

jest.mock('@patina/supabase', () => ({
  useEmailDelivery: () => ({
    byRef: mockEmailDeliveryByRef,
    isLoading: false,
    isError: false,
  }),
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

beforeEach(() => {
  mockEmailDeliveryByRef = {};
});

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

/**
 * 00591 — the delivery word on the two money pages. `mode="attention"`, so a
 * row that is behaving says nothing at all; a row whose mail needs the studio
 * speaks in sentence case, outside the uppercase facts line.
 */
describe('the delivery word on a money row', () => {
  const bounced = (refId: string, recipient: string | null = 'dave@okonkwo.net') => ({
    logId: `log-${refId}`,
    refId,
    recipient,
    state: 'bounced' as const,
    status: 'bounced' as const,
    sentAt: '2026-09-08T14:00:00.000Z',
    deliveredAt: null,
    bouncedAt: '2026-09-09T09:00:00.000Z',
    bounceType: 'permanent',
    bounceReason: 'no such mailbox',
    delayedAt: null,
    lastEvent: 'email.bounced',
    lastEventAt: '2026-09-09T09:00:00.000Z',
    createdAt: '2026-09-08T14:00:00.000Z',
  });

  const delivered = (refId: string) => ({
    ...bounced(refId),
    state: 'delivered' as const,
    status: 'delivered' as const,
    bouncedAt: null,
    bounceType: null,
    bounceReason: null,
    deliveredAt: '2026-09-08T15:00:00.000Z',
    lastEvent: 'email.delivered',
    lastEventAt: '2026-09-08T15:00:00.000Z',
  });

  const aging = (openInvoices: Invoice[]): ArAging =>
    ({
      openInvoices,
      buckets: [],
      totalBalanceCents: openInvoices.reduce((s, i) => s + i.total_cents, 0),
    }) as ArAging;

  it('prints the bounce on the ledger row that owns it, and on no other', () => {
    mockEmailDeliveryByRef = { 'invoice-1': bounced('invoice-1') };

    render(
      <AccountsLedgerPage
        invoices={[houseInvoice, studioInvoice]}
        onOpenDocument={jest.fn()}
      />,
    );

    const bouncedRow = screen.getByText('Invoice INV-0030').closest('li') as HTMLElement;
    expect(within(bouncedRow).getByTestId('delivery-word')).toHaveTextContent(
      "Bounced 9 Sept — didn't reach dave@okonkwo.net",
    );
    const quietRow = screen.getByText('Invoice INV-0031').closest('li') as HTMLElement;
    expect(within(quietRow).queryByTestId('delivery-word')).toBeNull();
  });

  it('keeps a healthy ledger row silent — the word is not a status line', () => {
    mockEmailDeliveryByRef = { 'invoice-1': delivered('invoice-1') };

    render(<AccountsLedgerPage invoices={[houseInvoice]} onOpenDocument={jest.fn()} />);

    expect(screen.queryByTestId('delivery-word')).toBeNull();
  });

  it('puts the receivable\u2019s word BEFORE the facts line, and outside it', () => {
    mockEmailDeliveryByRef = { 'invoice-1': bounced('invoice-1') };

    render(
      <AccountsReceivablesPage
        aging={aging([houseInvoice])}
        highlightInvoiceId={null}
        onOpenDocument={jest.fn()}
      />,
    );

    const word = screen.getByTestId('delivery-word');
    expect(word).toHaveTextContent("Bounced 9 Sept — didn't reach dave@okonkwo.net");

    // The facts line is uppercase and truncating; the word must not inherit
    // either, so it cannot be a string concatenated into that <p>.
    const facts = screen.getByText(/within terms|overdue/).closest('p') as HTMLElement;
    expect(facts).not.toContainElement(word);
    expect(facts.className).toMatch(/uppercase/);
    expect(facts.textContent).not.toMatch(/Bounced/);

    // BEFORE: the word precedes the facts line in document order.
    expect(word.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps a healthy receivable silent too', () => {
    mockEmailDeliveryByRef = { 'invoice-1': delivered('invoice-1') };

    render(
      <AccountsReceivablesPage
        aging={aging([houseInvoice])}
        highlightInvoiceId={null}
        onOpenDocument={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('delivery-word')).toBeNull();
  });
});
