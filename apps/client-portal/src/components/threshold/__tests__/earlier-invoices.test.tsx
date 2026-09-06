import { fireEvent, render, screen } from '@testing-library/react';
import type { Invoice } from '@patina/supabase';

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
  clientEvents: {
    paymentStarted: jest.fn(),
    paymentMethodSelected: jest.fn(),
    checkIntentSubmitted: jest.fn(),
  },
}));

// An open line unfolds the same settlement the letterbox does, so the pay
// path's three hooks are a boundary here as well.
jest.mock('@patina/supabase', () => ({
  __esModule: true,
  InvoiceCheckoutError: class InvoiceCheckoutError extends Error {},
  useInvoicePaymentOptions: jest.fn(),
  useStartCheckout: jest.fn(),
  useNotifyCheckIntent: jest.fn(),
  useStudioIdentity: jest.fn(),
}));

import {
  useInvoicePaymentOptions,
  useNotifyCheckIntent,
  useStartCheckout,
  useStudioIdentity,
} from '@patina/supabase';

import { EarlierInvoices } from '../earlier-invoices';

/** 5 August 2026 — the deck's "today". */
const TODAY = new Date(2026, 7, 5);

/** Two studios, one designer — Kody's own shape. */
const STUDIO_NAMES: Record<string, string> = {
  'studio-1': 'Alder & Fox',
  'studio-b': 'Bramwell Fox',
};

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
    (useInvoicePaymentOptions as jest.Mock).mockReturnValue({
      isPending: false,
      data: { card_surcharge_bps: 300, check_remit_to: null },
    });
    (useStartCheckout as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    (useNotifyCheckIntent as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    // The brand resolver, keyed the way 00571 keys it: the studio the row
    // names itself wins, and each studio answers with its own name.
    (useStudioIdentity as jest.Mock).mockImplementation(
      ({ studioId }: { studioId?: string | null }) => ({
        isPending: false,
        data: { name: STUDIO_NAMES[studioId ?? ''] ?? null },
      }),
    );
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
    expect(screen.getAllByRole('link', { name: 'Print' })).toHaveLength(1);
  });

  it('prints an invoice from its own sheet, in a new tab', () => {
    render(<EarlierInvoices invoices={[invoice()]} today={TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));

    const print = screen.getByRole('link', { name: 'Print' });
    expect(print).toHaveAttribute('href', '/invoices/inv-3/print');
    expect(print).toHaveAttribute('target', '_blank');
    expect(print).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('settles a second open balance on its own line, in place', () => {
    render(
      <EarlierInvoices
        invoices={[
          invoice({
            id: 'inv-5',
            invoice_number: 'Invoice No. 5',
            status: 'sent',
            amount_paid_cents: 0,
            paid_at: null,
          }),
        ]}
        designerName="Quist Interiors"
        today={TODAY}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));
    expect(screen.queryByTestId('settlement')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Settle this balance' }));

    expect(screen.getByTestId('settlement')).toBeInTheDocument();
    expect(screen.getByTestId('spine-toll')).toHaveAttribute('data-invoice-id', 'inv-5');
    expect(screen.getByTestId('threshold-payment-methods')).toBeInTheDocument();
  });

  it("makes each folded letter's check out to that letter's own studio", () => {
    render(
      <EarlierInvoices
        invoices={[
          invoice({
            id: 'inv-31',
            invoice_number: 'Invoice No. 31',
            project_id: null,
            studio_id: 'studio-b',
            title: 'Design consultation',
            status: 'sent',
            amount_paid_cents: 0,
            paid_at: null,
          }),
        ]}
        // The slot letter's studio, handed down as the last resort.
        designerName="Alder & Fox"
        today={TODAY}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settle this balance' }));
    fireEvent.click(screen.getByRole('radio', { name: /check/i }));

    expect(
      screen.getByRole('button', { name: 'Let Bramwell Fox know a check is coming' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Alder & Fox/ })).not.toBeInTheDocument();
  });

  it('withholds the act on the line whose own return is not confirmed', () => {
    // The letter taken to the till may be one of THESE, not the one in the
    // slot; the same refusal has to reach the line that carries its act.
    render(
      <EarlierInvoices
        invoices={[
          invoice({
            id: 'inv-5',
            invoice_number: 'Invoice No. 5',
            status: 'sent',
            amount_paid_cents: 0,
            paid_at: null,
          }),
        ]}
        heldInvoiceId="inv-5"
        today={TODAY}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settle this balance' }));

    expect(screen.getByRole('button', { name: 'Settle the balance' })).toBeDisabled();
  });

  // A studio invoice reaches the adopted house's letterbox alongside that
  // house's own letters, so an open one has to keep its settle act here for
  // the same reason a second house invoice does — and, carrying a settle act,
  // it may not read as one of this house's own letters.
  it('keeps a studio letter behind the slot, with its balance still settleable', () => {
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
    expect(screen.getByRole('button', { name: 'Settle this balance' })).toBeInTheDocument();
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

  it('offers a settled line its record and nothing to pay', () => {
    render(<EarlierInvoices invoices={[invoice()]} today={TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));

    expect(screen.queryByRole('button', { name: 'Settle this balance' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Print' })).toBeInTheDocument();
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
