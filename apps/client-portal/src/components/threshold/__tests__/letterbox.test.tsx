import type { ReactNode } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Invoice } from '@patina/supabase';

import type { InvoiceModel } from '@/lib/threshold/derive';
import { resetCheckoutReturn } from '@/lib/threshold/checkout-return';

// ── Boundaries ──────────────────────────────────────────────────────────────
// Opening the letterbox now unfolds the settlement, which owns the pay path's
// three hooks. Mock the module they come from; the ceremony itself is covered
// in settlement.test.tsx.

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  InvoiceCheckoutError: class InvoiceCheckoutError extends Error {},
  useInvoicePaymentOptions: jest.fn(),
  useStartCheckout: jest.fn(),
  useNotifyCheckIntent: jest.fn(),
  useStudioIdentity: jest.fn(),
  useInvoiceLink: jest.fn(),
}));

// `prefetch` is a Next `Link` prop, not a DOM attribute, so it leaves no trace
// on the rendered anchor. It is surfaced as `data-prefetch` here so the
// guarantee below can be asserted at all — the pay-link e2e CANNOT assert it,
// because `next dev` disables prefetching outright and the suite would pass
// just as green with the prop deleted.
//
// J30(b): scoped to the one link that cares. Omitting `data-prefetch`
// entirely when `prefetch` is undefined keeps every OTHER `next/link` usage
// in the tree free of a stray `data-prefetch="undefined"` attribute nobody
// asserts on.
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
    <a
      href={href}
      {...(prefetch !== undefined ? { 'data-prefetch': String(prefetch) } : {})}
      {...rest}
    >
      {children}
    </a>
  ),
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  clientEvents: {
    paymentCompleted: jest.fn(),
    paymentCancelled: jest.fn(),
    paymentMethodSelected: jest.fn(),
    checkIntentSubmitted: jest.fn(),
    paymentStarted: jest.fn(),
  },
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import {
  useInvoiceLink,
  useInvoicePaymentOptions,
  useNotifyCheckIntent,
  useStartCheckout,
  useStudioIdentity,
} from '@patina/supabase';
import { clientEvents } from '@/lib/analytics/events';

import { Letterbox } from '../letterbox';

/** The 64-hex shape ensure_invoice_link (00574) emits. */
const LINK_TOKEN = 'a'.repeat(64);

/** 5 August 2026 — the deck's "today". */
const TODAY = new Date(2026, 7, 5);

/** Two studios, one designer — Kody's own shape. */
const STUDIO_NAMES: Record<string, string> = {
  'studio-1': 'Alder & Fox',
  'studio-b': 'Bramwell Fox',
};

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
    (useInvoicePaymentOptions as jest.Mock).mockReturnValue({
      isPending: false,
      data: { card_surcharge_bps: 300, check_remit_to: null },
    });
    (useStartCheckout as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    (useNotifyCheckIntent as jest.Mock).mockReturnValue({ mutateAsync: jest.fn() });
    (useInvoiceLink as jest.Mock).mockReturnValue({ data: { token: LINK_TOKEN, status: 'active' } });
    // The brand resolver, keyed the way 00571 keys it: the studio the row
    // names itself wins, and each studio answers with its own name.
    (useStudioIdentity as jest.Mock).mockImplementation(
      ({ studioId }: { studioId?: string | null }) => ({
        isPending: false,
        data: { name: STUDIO_NAMES[studioId ?? ''] ?? null },
      }),
    );
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

  /* ── Whose name is on the check ──────────────────────────────────────────
     A studio letter stands in the ADOPTED house's letterbox, and the adopted
     house may belong to a different studio than the one that drew the letter.
     The payee has to come off the letter. ──────────────────────────────── */

  it("makes the check out to the letter's own studio, not the house's", async () => {
    render(
      <Letterbox
        invoice={invoice({ id: 'inv-31', number: 'Invoice No. 31' })}
        invoices={[
          invoiceRow({
            id: 'inv-31',
            status: 'sent',
            project_id: null,
            studio_id: 'studio-b',
            title: 'Design consultation',
          }),
        ]}
        // The adopted house's studio — what the house page hands down.
        designerName="Alder & Fox"
        today={TODAY}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /open the letterbox/i }));
    await userEvent.click(screen.getByRole('radio', { name: /check/i }));

    expect(
      screen.getByRole('button', { name: 'Let Bramwell Fox know a check is coming' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Alder & Fox/ }),
    ).not.toBeInTheDocument();
  });

  it("resolves a folded letter's payee from that letter, not from the slot", async () => {
    render(
      <Letterbox
        invoice={invoice({ id: 'inv-31', number: 'Invoice No. 31' })}
        invoices={[
          invoiceRow({
            id: 'inv-31',
            status: 'sent',
            project_id: null,
            studio_id: 'studio-b',
          }),
          invoiceRow({
            id: 'inv-5',
            invoice_number: 'Invoice No. 5',
            status: 'sent',
            studio_id: 'studio-1',
            amount_paid_cents: 0,
            paid_at: null,
          }),
        ]}
        today={TODAY}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));
    await userEvent.click(screen.getByRole('button', { name: 'Settle this balance' }));
    await userEvent.click(screen.getByRole('radio', { name: /check/i }));

    expect(
      screen.getByRole('button', { name: 'Let Alder & Fox know a check is coming' }),
    ).toBeInTheDocument();
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

  it('states the letter in words and figures before it is opened', () => {
    render(<Letterbox invoice={invoice()} today={TODAY} />);

    const body = screen.getByTestId('letterbox-body');
    expect(body).toHaveTextContent('Invoice No. 4');
    expect(body).toHaveTextContent('$18,250');
    expect(body).toHaveTextContent('$9,125');
    expect(body).toHaveTextContent('due August 15');
  });

  it('spells the year out once the letter falls in another one', async () => {
    render(<Letterbox invoice={invoice({ dueDate: '2027-01-15' })} today={TODAY} />);

    expect(screen.getByTestId('letterbox-body')).toHaveTextContent('due January 15, 2027');

    await userEvent.click(screen.getByRole('button', { name: /open the letterbox/i }));
    expect(within(screen.getByTestId('spine-toll')).getByTestId('spine-toll-due')).toHaveTextContent(
      'due January 15, 2027',
    );
  });

  it('names an unnumbered letter, and omits a due date it does not have', () => {
    render(<Letterbox invoice={invoice({ number: null, dueDate: null })} today={TODAY} />);

    const body = screen.getByTestId('letterbox-body');
    expect(body).toHaveTextContent('Invoice · $18,250 total');
    expect(body).not.toHaveTextContent('due');
  });

  it('unfolds to the settlement when the letterbox is opened, and folds back', async () => {
    render(<Letterbox invoice={invoice()} today={TODAY} />);

    expect(screen.queryByTestId('settlement')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /open the letterbox/i }));

    expect(screen.getByTestId('settlement')).toBeInTheDocument();
    const toll = screen.getByTestId('spine-toll');
    expect(toll).toHaveAttribute('data-invoice-id', 'b0000000-0000-0000-0000-0000000000i4');
    expect(screen.getByTestId('threshold-payment-methods')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /close the letterbox/i }),
    ).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(screen.getByRole('button', { name: /close the letterbox/i }));

    expect(screen.queryByTestId('settlement')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /open the letterbox/i }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('stands empty, and says so, when nothing has come', () => {
    render(<Letterbox invoice={null} />);

    expect(screen.getByTestId('letterbox-body')).toHaveTextContent('Nothing in the letterbox.');
    expect(
      screen.queryByRole('button', { name: /open the letterbox/i }),
    ).not.toBeInTheDocument();
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

  it('reads a settled return once the invoice’s own row says it is paid', () => {
    standAt('?invoice=inv-4&checkout=success&session_id=cs_1');

    render(
      <Letterbox
        invoice={null}
        invoices={[invoiceRow({ id: 'inv-4', status: 'paid' })]}
        today={new Date(2026, 8, 4)}
      />,
    );

    // The retired invoice detail page's own confirmed sentence, and the letter
    // it is about — the receipt used to stand unlabelled over a different one.
    expect(screen.getByTestId('letterbox-receipt')).toHaveTextContent(
      'Invoice No. 3 · Payment confirmed — thank you. Your invoice has been updated.',
    );
    expect(clientEvents.paymentCompleted).toHaveBeenCalledTimes(1);
    expect(clientEvents.paymentCompleted).toHaveBeenCalledWith({ invoiceId: 'inv-4' });
  });

  it('will not say a letter is paid while it is still open, and counts nothing', () => {
    standAt('?invoice=inv-4&checkout=success&session_id=cs_1');

    render(
      <Letterbox
        invoice={invoice({ id: 'inv-4' })}
        invoices={[
          invoiceRow({
            id: 'inv-4',
            status: 'sent',
            amount_paid_cents: 912_500,
            total_cents: 1_825_000,
            paid_at: null,
          }),
        ]}
        today={new Date(2026, 8, 4)}
      />,
    );

    const receipt = screen.getByTestId('letterbox-receipt');
    expect(receipt).toHaveTextContent('Confirming payment… This usually takes a few seconds.');
    expect(receipt).not.toHaveTextContent('Payment confirmed');
    expect(clientEvents.paymentCompleted).not.toHaveBeenCalled();
  });

  it('says plainly that nothing is confirmed once the wait runs out', () => {
    jest.useFakeTimers();
    try {
      standAt('?invoice=inv-4&checkout=success');

      render(
        <Letterbox
          invoice={invoice({ id: 'inv-4' })}
          invoices={[
            invoiceRow({
              id: 'inv-4',
              status: 'sent',
              amount_paid_cents: 0,
              total_cents: 1_825_000,
              paid_at: null,
            }),
          ]}
          today={new Date(2026, 8, 4)}
        />,
      );

      act(() => {
        jest.advanceTimersByTime(31_000);
      });

      expect(screen.getByTestId('letterbox-receipt')).toHaveTextContent(
        'Checkout returned, but Patina has not confirmed a payment yet. Do not submit another payment until the status is known.',
      );
      expect(clientEvents.paymentCompleted).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('says nothing about a letter this house is not holding', () => {
    standAt('?invoice=inv-elsewhere&checkout=success');

    render(<Letterbox invoice={invoice()} invoices={[invoiceRow()]} today={TODAY} />);

    expect(screen.queryByTestId('letterbox-receipt')).not.toBeInTheDocument();
    expect(clientEvents.paymentCompleted).not.toHaveBeenCalled();
  });

  it('says nothing changed when she came back from a cancelled till', () => {
    standAt('?invoice=inv-4&checkout=cancelled');

    render(
      <Letterbox
        invoice={invoice({ id: 'inv-4' })}
        invoices={[invoiceRow({ id: 'inv-4', status: 'sent' })]}
        today={TODAY}
      />,
    );

    expect(screen.getByTestId('letterbox-receipt')).toHaveTextContent('Nothing changed.');
    expect(clientEvents.paymentCancelled).toHaveBeenCalledWith({ invoiceId: 'inv-4' });
  });

  it('keeps the letter in the slot printable too', () => {
    render(<Letterbox invoice={invoice()} today={TODAY} />);

    expect(screen.getByRole('link', { name: /print/i })).toHaveAttribute(
      'href',
      '/invoices/b0000000-0000-0000-0000-0000000000i4/print',
    );
  });

  it('leaves an order’s return to the road', () => {
    standAt('?order=ord-1&checkout=success');

    render(<Letterbox invoice={invoice()} today={TODAY} />);

    expect(screen.queryByTestId('letterbox-receipt')).not.toBeInTheDocument();
  });

  it('says nothing about a till it was never sent to', () => {
    render(<Letterbox invoice={invoice()} today={TODAY} />);

    expect(screen.queryByTestId('letterbox-receipt')).not.toBeInTheDocument();
  });

  /* ── The letter's own address (00574 · K1) ───────────────────────────────
     Additive: the settle-in-place and the print sheet both stay until W3b.
     ─────────────────────────────────────────────────────────────────────── */

  it('offers the invoice its own address, above the settle-in-place', () => {
    render(<Letterbox invoice={invoice()} today={TODAY} />);

    const open = screen.getByRole('link', { name: 'Open the invoice' });
    expect(open).toHaveAttribute('href', `/pay/${LINK_TOKEN}`);
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

  it('keeps the letterbox, the print sheet and the settle-in-place beside it', async () => {
    const user = userEvent.setup();
    render(<Letterbox invoice={invoice()} today={TODAY} />);

    expect(screen.getByRole('link', { name: 'Open the invoice' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Print' })).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Open the letterbox' });
    await act(async () => {
      await user.click(toggle);
    });
    expect(screen.getByRole('button', { name: 'Close the letterbox' })).toBeInTheDocument();
  });

  it('says nothing about an address the invoice does not have', () => {
    (useInvoiceLink as jest.Mock).mockReturnValue({ data: null });

    render(<Letterbox invoice={invoice()} today={TODAY} />);

    expect(screen.queryByRole('link', { name: 'Open the invoice' })).not.toBeInTheDocument();
    // The existing acts are untouched by a missing link.
    expect(screen.getByRole('link', { name: 'Print' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open the letterbox' })).toBeInTheDocument();
  });
});
