import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import type { Invoice } from '@patina/supabase';

import type { InvoiceModel } from '@/lib/threshold/derive';
import { resetCheckoutReturn } from '@/lib/threshold/checkout-return';

// ── Boundaries ──────────────────────────────────────────────────────────────
// The letterbox's only act is the invoice's own address (00574 · K1); the
// settle-in-place ceremony this used to unfold is retired (W3b). The pay path
// itself is `/pay/[token]`'s own boundary now.

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useInvoiceLink: jest.fn(),
}));

// `prefetch` is a Next `Link` prop, not a DOM attribute, so it leaves no trace
// on the rendered anchor. It is surfaced as `data-prefetch` here so the
// guarantee below can be asserted at all — the pay-link e2e CANNOT assert it,
// because `next dev` disables prefetching outright and the suite would pass
// just as green with the prop deleted.
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

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import { useInvoiceLink } from '@patina/supabase';

import { Letterbox } from '../letterbox';

/** The 64-hex shape ensure_invoice_link (00574) emits. */
const LINK_TOKEN = 'a'.repeat(64);

/** 5 August 2026 — the deck's "today". */
const TODAY = new Date(2026, 7, 5);

function invoice(overrides: Partial<InvoiceModel> = {}): InvoiceModel {
  return {
    id: 'b0000000-0000-0000-0000-0000000000i4',
    number: 'Invoice No. 4',
    totalCents: 1_825_000,
    paidCents: 912_500,
    balanceCents: 912_500,
    dueDate: '2026-08-15',
    ...overrides,
  };
}

function invoiceRow(overrides: Partial<Invoice> = {}): Invoice {
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

const originalLocation = window.location;

function standAt(search: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      search,
      href: `https://client.test/projects/p1${search}`,
      pathname: '/projects/p1',
      origin: 'https://client.test',
    },
  });
}

describe('Letterbox — one letter, half out of the slot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetCheckoutReturn();
    standAt('');
    jest.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    (useInvoiceLink as jest.Mock).mockReturnValue({ data: { token: LINK_TOKEN, status: 'active' } });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  /* ── The letter the address named ────────────────────────────────────────
     `/invoices/<id>` still goes out in the studio's mail and folds to
     `?invoice=<id>`. The slot holds one letter, chosen by due date, so
     without this the client who followed a link about one invoice reads
     another and is never told which. ─────────────────────────────────────── */

  it('stands the letter the address named in the slot, not the soonest-due one', () => {
    standAt('?invoice=inv-9');

    render(
      <Letterbox
        invoice={invoice({ id: 'inv-4', number: 'Invoice No. 4' })}
        invoices={[
          invoiceRow({ id: 'inv-9', invoice_number: 'Invoice No. 9', status: 'sent' }),
        ]}
        today={TODAY}
      />,
    );

    expect(screen.getByTestId('letterbox-body')).toHaveTextContent('Invoice No. 9');
    expect(screen.getByTestId('letterbox-body')).not.toHaveTextContent('Invoice No. 4');
  });

  it('says nothing new when the address names a letter this house is not holding', () => {
    standAt('?invoice=inv-nowhere');

    render(
      <Letterbox
        invoice={invoice({ id: 'inv-4', number: 'Invoice No. 4' })}
        invoices={[invoiceRow({ id: 'inv-9', invoice_number: 'Invoice No. 9' })]}
        today={TODAY}
      />,
    );

    expect(screen.getByTestId('letterbox-body')).toHaveTextContent('Invoice No. 4');
  });

  it('leaves the till the return: `?invoice=` under `?checkout=` names a receipt, not a letter', () => {
    standAt('?invoice=inv-9&checkout=cancel');

    render(
      <Letterbox
        invoice={invoice({ id: 'inv-4', number: 'Invoice No. 4' })}
        invoices={[invoiceRow({ id: 'inv-9', invoice_number: 'Invoice No. 9' })]}
        today={TODAY}
      />,
    );

    expect(screen.getByTestId('letterbox-body')).toHaveTextContent('Invoice No. 4');
  });

  /* ── A letter for no house ───────────────────────────────────────────────
     A studio invoice stands in the letterbox of the adopted house, which is
     not the house the work is in — the envelope has to say so on its own
     line, and name itself by the regarding line that stands where a house
     name would. ────────────────────────────────────────────────────────── */

  it('says a studio letter is not for a house, and names it by its regarding line', () => {
    render(
      <Letterbox
        invoice={invoice({
          id: 'inv-31',
          number: 'Invoice No. 31',
          totalCents: 45_000,
          paidCents: 0,
          balanceCents: 45_000,
          dueDate: '2026-09-20',
        })}
        invoices={[
          invoiceRow({
            id: 'inv-31',
            invoice_number: 'Invoice No. 31',
            status: 'sent',
            project_id: null,
            title: 'Design consultation · 12 September 2026',
          }),
        ]}
        today={TODAY}
      />,
    );

    expect(screen.getByTestId('letterbox-from-studio')).toHaveTextContent(
      'From the studio · not for a house',
    );
    expect(screen.getByTestId('letterbox-regarding')).toHaveTextContent(
      'Design consultation · 12 September 2026',
    );
    expect(screen.getByTestId('letterbox-body')).toHaveTextContent('Invoice No. 31');
  });

  it('says nothing of the studio for a letter this house holds', () => {
    render(
      <Letterbox
        invoice={invoice({ id: 'inv-3', number: 'Invoice No. 3' })}
        invoices={[invoiceRow({ id: 'inv-3', status: 'sent' })]}
        today={TODAY}
      />,
    );

    expect(screen.queryByTestId('letterbox-from-studio')).not.toBeInTheDocument();
    expect(screen.queryByTestId('letterbox-regarding')).not.toBeInTheDocument();
  });

  it('states the studio line for a letter with no regarding line to print', () => {
    render(
      <Letterbox
        invoice={invoice({ id: 'inv-31', number: 'Invoice No. 31' })}
        invoices={[
          invoiceRow({ id: 'inv-31', status: 'sent', project_id: null, title: null }),
        ]}
        today={TODAY}
      />,
    );

    expect(screen.getByTestId('letterbox-from-studio')).toBeInTheDocument();
    expect(screen.queryByTestId('letterbox-regarding')).not.toBeInTheDocument();
  });

  it('carries the anchor, the unit, and never opts into dimming', () => {
    render(<Letterbox invoice={invoice()} />);

    const root = screen.getByTestId('letterbox');
    expect(root).toHaveAttribute('id', 'letterbox');
    expect(root).toHaveAttribute('data-threshold-unit', 'letterbox');
    expect(root).not.toHaveAttribute('data-dimmable');
    expect(root).toHaveAttribute('data-never-dim');
  });

  it('draws the letterbox with the letter standing out of it', () => {
    render(<Letterbox invoice={invoice()} />);

    expect(
      screen.getByRole('img', {
        name: 'A letterbox with an invoice standing half out of the slot',
      }),
    ).toBeInTheDocument();
  });

  it('states the letter in words and figures', () => {
    render(<Letterbox invoice={invoice()} today={TODAY} />);

    const body = screen.getByTestId('letterbox-body');
    expect(body).toHaveTextContent('Invoice No. 4');
    expect(body).toHaveTextContent('$18,250');
    expect(body).toHaveTextContent('$9,125');
    expect(body).toHaveTextContent('due August 15');
  });

  it('spells the year out once the letter falls in another one', () => {
    render(<Letterbox invoice={invoice({ dueDate: '2027-01-15' })} today={TODAY} />);

    expect(screen.getByTestId('letterbox-body')).toHaveTextContent('due January 15, 2027');
  });

  it('names an unnumbered letter, and omits a due date it does not have', () => {
    render(<Letterbox invoice={invoice({ number: null, dueDate: null })} today={TODAY} />);

    const body = screen.getByTestId('letterbox-body');
    expect(body).toHaveTextContent('Invoice · $18,250 total');
    expect(body).not.toHaveTextContent('due');
  });

  it('stands empty, and says so, when nothing has come', () => {
    render(<Letterbox invoice={null} />);

    expect(screen.getByTestId('letterbox-body')).toHaveTextContent('Nothing in the letterbox.');
    expect(screen.queryByRole('link', { name: 'Open the invoice' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'An empty letterbox' }),
    ).toBeInTheDocument();
  });

  it('keeps the earlier invoices behind the one letter, even when the slot is empty', () => {
    render(<Letterbox invoice={null} invoices={[invoiceRow()]} today={TODAY} />);

    expect(screen.getByTestId('earlier-invoices')).toBeInTheDocument();
  });

  it('does not keep the letter it is already holding', () => {
    render(
      <Letterbox
        invoice={invoice({ id: 'inv-3' })}
        invoices={[invoiceRow({ id: 'inv-3' })]}
        today={TODAY}
      />,
    );

    expect(screen.queryByTestId('earlier-invoices')).not.toBeInTheDocument();
  });

  /* ── The letter's own address (00574 · K1) ───────────────────────────────
     W3b: this is the letter's only act. Settle-in-place and the print sheet
     are retired; the standalone page carries both now. ────────────────────── */

  it("offers the invoice its own address, as the letter's only act", () => {
    render(<Letterbox invoice={invoice()} today={TODAY} />);

    const open = screen.getByRole('link', { name: 'Open the invoice' });
    expect(open).toHaveAttribute('href', `/pay/${LINK_TOKEN}`);
    expect(screen.queryByRole('button', { name: /open the letterbox/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Print' })).not.toBeInTheDocument();
  });

  /* F6: Next prefetches a `Link` as it scrolls into view, and the pay page
     records a view and spends its rate-limit budget on every render. Scrolling
     past the letterbox must therefore cost the link nothing, which `prefetch`
     being explicitly false is the whole of. */
  it('never warms the pay page by scrolling past it', () => {
    render(<Letterbox invoice={invoice()} today={TODAY} />);

    expect(screen.getByRole('link', { name: 'Open the invoice' })).toHaveAttribute(
      'data-prefetch',
      'false',
    );
  });

  it('says nothing about an address the invoice does not have', () => {
    (useInvoiceLink as jest.Mock).mockReturnValue({ data: null });

    render(<Letterbox invoice={invoice()} today={TODAY} />);

    expect(screen.queryByRole('link', { name: 'Open the invoice' })).not.toBeInTheDocument();
    // The letter still states its own facts even with no address to offer.
    expect(screen.getByTestId('letterbox-body')).toHaveTextContent('Invoice No. 4');
  });
});
