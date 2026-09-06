import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Invoice } from '@patina/supabase';

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

// Each line's only act is its own address (00574 · K1); the settle-in-place
// ceremony this used to unfold is retired (W3b).
jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useInvoiceLink: jest.fn(),
}));

// `prefetch` is a Next `Link` prop, not a DOM attribute, so it leaves no trace
// on the rendered anchor without this — surfaced as `data-prefetch` so M3's
// guarantee (never warm N pay-page links at once by scrolling past the
// disclosure) is assertable at all.
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    prefetch,
    ...rest
  }: {
    children: ReactNode;
    href: string;
    prefetch?: boolean;
  } & Record<string, unknown>) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));

import { useInvoiceLink } from '@patina/supabase';

import { EarlierInvoices } from '../earlier-invoices';

/** The 64-hex shape ensure_invoice_link (00574) emits. */
const LINK_TOKEN = 'a'.repeat(64);

/** 5 August 2026 — the deck's "today". */
const TODAY = new Date(2026, 7, 5);

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-3',
    project_id: 'project-1',
    studio_id: 'studio-1',
    designer_id: 'designer-1',
    client_id: 'client-1',
    invoice_number: 'Invoice No. 3',
    status: 'paid',
    issue_date: '2026-06-01',
    due_date: '2026-06-15',
    payment_terms_days: 14,
    currency: 'USD',
    subtotal_cents: 912_500,
    tax_rate: 0,
    tax_cents: 0,
    total_cents: 912_500,
    amount_paid_cents: 912_500,
    memo: null,
    internal_notes: null,
    stripe_checkout_session_id: null,
    sent_at: '2026-06-01T10:00:00Z',
    paid_at: '2026-06-12T10:00:00Z',
    voided_at: null,
    void_reason: null,
    reminder_count: 0,
    last_reminder_at: null,
    ar_flagged_at: null,
    ar_last_chased_at: null,
    created_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-12T10:00:00Z',
    ...overrides,
  } as Invoice;
}

describe('EarlierInvoices — what is kept behind the one letter', () => {
  beforeEach(() => {
    (useInvoiceLink as jest.Mock).mockReturnValue({ data: { token: LINK_TOKEN, status: 'active' } });
  });

  it('says nothing when the letterbox holds the only invoice', () => {
    const { container } = render(
      <EarlierInvoices invoices={[invoice({ id: 'inv-4' })]} exceptId="inv-4" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('folds the receipts away until they are asked for', () => {
    render(<EarlierInvoices invoices={[invoice()]} today={TODAY} />);

    expect(screen.queryByText(/Invoice No. 3/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));

    expect(screen.getByText('Invoice No. 3 · $9,125 · paid June 12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close earlier invoices' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('dates an open invoice by what it is waiting for, and a part-paid one by what is left', () => {
    render(
      <EarlierInvoices
        invoices={[
          invoice({ id: 'inv-5', invoice_number: 'Invoice No. 5', status: 'sent', paid_at: null }),
          invoice({
            id: 'inv-6',
            invoice_number: 'Invoice No. 6',
            status: 'partially_paid',
            amount_paid_cents: 412_500,
            paid_at: null,
          }),
        ]}
        today={TODAY}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));

    expect(screen.getByText('Invoice No. 5 · $9,125 · due June 15')).toBeInTheDocument();
    expect(
      screen.getByText('Invoice No. 6 · $9,125 · $5,000 outstanding, due June 15'),
    ).toBeInTheDocument();
  });

  it('keeps drafts and voids out of the record, as /budget does', () => {
    render(
      <EarlierInvoices
        invoices={[
          invoice({ id: 'inv-d', invoice_number: 'Draft', status: 'draft' }),
          invoice({ id: 'inv-v', invoice_number: 'Voided', status: 'void' }),
          invoice(),
        ]}
        today={TODAY}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));

    expect(screen.queryByText(/Draft/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Voided/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open the invoice' })).toHaveLength(1);
  });

  it('opens an invoice from its own address', () => {
    render(<EarlierInvoices invoices={[invoice()]} today={TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));

    const open = screen.getByRole('link', { name: 'Open the invoice' });
    expect(open).toHaveAttribute('href', `/pay/${LINK_TOKEN}`);
  });

  /* M3: expanding "Earlier invoices" puts every row's `/pay/<token>` in the
     viewport at once — a prefetch that ever renders would record a view and
     spend the pay page's rate-limit budget on every row nobody opened. */
  it('never warms a folded invoice by scrolling past it', () => {
    render(<EarlierInvoices invoices={[invoice()]} today={TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));

    expect(screen.getByRole('link', { name: 'Open the invoice' })).toHaveAttribute(
      'data-prefetch',
      'false',
    );
  });

  it('says nothing about an address a line does not have', () => {
    (useInvoiceLink as jest.Mock).mockReturnValue({ data: null });

    render(<EarlierInvoices invoices={[invoice()]} today={TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));

    expect(screen.queryByRole('link', { name: 'Open the invoice' })).not.toBeInTheDocument();
    expect(screen.getByText(/Invoice No\. 3/)).toBeInTheDocument();
  });

  // A studio invoice reaches the adopted house's letterbox alongside that
  // house's own letters, so an open one has to keep its own act here for the
  // same reason a second house invoice does — and, carrying that act, it may
  // not read as one of this house's own letters.
  it('keeps a studio letter behind the slot, with its own address still offered', () => {
    render(
      <EarlierInvoices
        invoices={[
          invoice({
            id: 'inv-31',
            invoice_number: 'Invoice No. 31',
            project_id: null,
            title: 'Design consultation',
            status: 'sent',
            total_cents: 45_000,
            amount_paid_cents: 0,
            due_date: '2026-08-20',
            paid_at: null,
          }),
        ]}
        today={TODAY}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));

    expect(
      screen.getByText(
        'Invoice No. 31 · $450 · due August 20 · from the studio · not for a house',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the invoice' })).toBeInTheDocument();
  });

  it('says nothing about the studio on a line this house was billed for', () => {
    render(
      <EarlierInvoices
        invoices={[invoice({ id: 'inv-3', invoice_number: 'Invoice No. 3' })]}
        today={TODAY}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));

    const line = screen.getByText(/^Invoice No\. 3 ·/);
    expect(line).toHaveTextContent('Invoice No. 3 · $9,125 · paid June 12');
    expect(line).not.toHaveTextContent('from the studio');
  });

  it('offers a settled line its record and its own address too', () => {
    render(<EarlierInvoices invoices={[invoice()]} today={TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));

    expect(screen.queryByRole('button', { name: 'Settle this balance' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the invoice' })).toBeInTheDocument();
  });

  it('spells the year out on a receipt from another one, newest first', () => {
    render(
      <EarlierInvoices
        invoices={[
          invoice({
            id: 'inv-1',
            invoice_number: 'Invoice No. 1',
            paid_at: '2025-11-02T10:00:00Z',
            sent_at: '2025-11-01T10:00:00Z',
            created_at: '2025-11-01T10:00:00Z',
          }),
          invoice(),
        ]}
        today={TODAY}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));

    expect(screen.getByText('Invoice No. 1 · $9,125 · paid November 2, 2025')).toBeInTheDocument();

    const lines = screen.getAllByText(/^Invoice No\./);
    expect(lines[0]).toHaveTextContent('Invoice No. 3');
  });
});
