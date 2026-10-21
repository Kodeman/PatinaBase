import type { ReactNode } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Invoice } from '@patina/supabase';

import { resetCheckoutReturn } from '@/lib/threshold/checkout-return';
import { invoiceProjection, type InvoiceReadState } from '@/lib/threshold/invoice-rollup';

// ── Boundaries ──────────────────────────────────────────────────────────────
// Opening a payable row lays in the payment sheet, which owns the pay path's
// three hooks. Mock the module they come from; the sheet itself is covered in
// settlement.test.tsx.

jest.mock('@patina/supabase', () => {
  class InvoiceCheckoutError extends Error {
    code: string;
    constructor(code: string, detail: string) {
      super(detail);
      this.code = code;
    }
  }
  return {
    __esModule: true,
    InvoiceCheckoutError,
    useInvoicePaymentOptions: jest.fn(),
    useStartCheckout: jest.fn(),
    useNotifyCheckIntent: jest.fn(),
    useStudioIdentity: jest.fn(),
  };
});

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...rest}>
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
  InvoiceCheckoutError,
  useInvoicePaymentOptions,
  useNotifyCheckIntent,
  useStartCheckout,
  useStudioIdentity,
} from '@patina/supabase';
import { clientEvents } from '@/lib/analytics/events';

import { Letterbox } from '../letterbox';

/** 5 August 2026 — the deck's "today". */
const TODAY = new Date(2026, 7, 5);

const STUDIO_NAMES: Record<string, string> = {
  'studio-1': 'Birchwood Studio',
  'studio-b': 'Bramwell Fox',
};

function invoiceRow(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-3',
    project_id: 'project-1',
    studio_id: 'studio-1',
    designer_id: 'designer-1',
    client_id: 'client-1',
    invoice_number: 'Invoice No. 3',
    title: null,
    status: 'sent',
    issue_date: '2026-06-01',
    due_date: '2026-08-20',
    payment_terms_days: 14,
    currency: 'USD',
    subtotal_cents: 30_000,
    tax_rate: 0,
    tax_cents: 0,
    total_cents: 30_000,
    amount_paid_cents: 0,
    memo: null,
    internal_notes: null,
    stripe_checkout_session_id: null,
    sent_at: '2026-06-01T10:00:00Z',
    paid_at: null,
    voided_at: null,
    void_reason: null,
    reminder_count: 0,
    last_reminder_at: null,
    ar_flagged_at: null,
    ar_last_chased_at: null,
    created_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:00:00Z',
    payments: [],
    ...overrides,
  } as Invoice;
}

/* The §10 mixed-invoice fixture: six outstanding, a zero-balance sent row,
   and two paid ones. Only the outstanding six may be counted to pay. */
const MIXED: Invoice[] = [
  invoiceRow({ id: 'inv-f', invoice_number: 'INV-2026-019', due_date: '2026-10-01', total_cents: 50_000 }),
  invoiceRow({ id: 'inv-d', invoice_number: 'INV-2026-021', due_date: null, total_cents: 12_500 }),
  invoiceRow({
    id: 'inv-c',
    invoice_number: 'INV-2026-017',
    status: 'partially_paid',
    due_date: '2026-09-02',
    total_cents: 80_000,
    amount_paid_cents: 50_000,
  }),
  invoiceRow({ id: 'inv-a', invoice_number: 'INV-2026-014', due_date: '2026-07-25', total_cents: 60_000 }),
  invoiceRow({
    id: 'inv-e',
    project_id: null,
    invoice_number: 'INV-2026-022',
    title: 'Design fee, September',
    due_date: '2026-08-20',
    total_cents: 25_000,
  }),
  invoiceRow({ id: 'inv-b', invoice_number: 'INV-2026-016', due_date: '2026-08-05', total_cents: 20_000 }),
  invoiceRow({
    id: 'inv-z',
    invoice_number: 'INV-2026-023',
    total_cents: 0,
    amount_paid_cents: 0,
    sent_at: '2026-07-12T10:00:00Z',
  }),
  invoiceRow({
    id: 'inv-p1',
    invoice_number: 'INV-2026-008',
    status: 'paid',
    amount_paid_cents: 30_000,
    paid_at: '2026-06-12T10:00:00Z',
  }),
  invoiceRow({
    id: 'inv-p2',
    invoice_number: 'INV-2026-011',
    status: 'paid',
    amount_paid_cents: 30_000,
    paid_at: '2026-07-22T10:00:00Z',
  }),
];

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

let checkout: jest.Mock;
let notify: jest.Mock;

const row = (id: string) => {
  const element = document.querySelector<HTMLElement>(`[data-testid="invoice-row"][data-invoice-id="${id}"]`);
  if (!element) throw new Error(`no row ${id}`);
  return element;
};
const viewInvoice = (id: string) => within(row(id)).getByRole('button', { name: 'View invoice' });
const rowIds = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByTestId('invoice-row')
    .map((element) => element.dataset.invoiceId);

describe('Letterbox — every invoice in plain view (US-45 CPUX-02, CPUX-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetCheckoutReturn();
    standAt('');
    jest.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    (useInvoicePaymentOptions as jest.Mock).mockReturnValue({
      isPending: false,
      isFetching: false,
      isError: false,
      data: { card_surcharge_bps: 300, check_remit_to: null, card_surcharge_resolved: true },
      refetch: jest.fn(),
    });
    checkout = jest.fn();
    (useStartCheckout as jest.Mock).mockReturnValue({ mutateAsync: checkout, isPending: false });
    notify = jest.fn().mockResolvedValue({ ok: true });
    (useNotifyCheckIntent as jest.Mock).mockReturnValue({ mutateAsync: notify, isPending: false });
    (useStudioIdentity as jest.Mock).mockImplementation(({ studioId }: { studioId?: string | null }) => ({
      isPending: false,
      data: { name: STUDIO_NAMES[studioId ?? ''] ?? null },
    }));
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('A01 · lists all six outstanding invoices, soonest due first, with nothing expanded', () => {
    render(<Letterbox invoices={MIXED} today={TODAY} projectName="Elm Street House" designerName="Maren Holt" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Invoices' })).toBeInTheDocument();
    expect(screen.getByTestId('letterbox-eyebrow')).toHaveTextContent('Elm Street House and studio');
    const toPay = screen.getByTestId('invoices-to-pay');
    expect(within(toPay).getByRole('heading', { level: 3, name: 'Invoices to pay' })).toBeInTheDocument();
    expect(toPay).toHaveTextContent('Six invoices, soonest due first.');
    expect(rowIds('invoices-to-pay')).toEqual(['inv-a', 'inv-b', 'inv-e', 'inv-c', 'inv-f', 'inv-d']);
    // No row is open, and history is folded.
    for (const toggle of screen.getAllByRole('button', { name: 'View invoice' })) {
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
    expect(screen.getByRole('button', { name: 'Payment history' })).toHaveAttribute('aria-expanded', 'false');
    expect(document.body).not.toHaveTextContent(/a toll on the line|settle the balance|earlier invoices/i);
  });

  it('A02 · a zero-balance sent invoice stands in history, never in the count to pay', async () => {
    render(<Letterbox invoices={MIXED} today={TODAY} />);

    expect(rowIds('invoices-to-pay')).not.toContain('inv-z');
    await userEvent.click(screen.getByRole('button', { name: 'Payment history' }));
    // Newest first: a paid date, else the sent date.
    expect(rowIds('payment-history')).toEqual(['inv-p2', 'inv-z', 'inv-p1']);
    expect(within(row('inv-z')).getByTestId('invoice-row-status')).toHaveTextContent(
      'No balance due · sent 12 July 2026',
    );
    expect(within(row('inv-p2')).getByTestId('invoice-row-status')).toHaveTextContent('Paid 22 July 2026');
    expect(screen.getByTestId('payment-history')).toHaveTextContent('Three invoices, newest first.');
  });

  it('writes each row’s real due status and origin, at reading size', () => {
    render(<Letterbox invoices={MIXED} today={TODAY} projectName="Elm Street House" />);

    expect(within(row('inv-a')).getByTestId('invoice-row-status')).toHaveTextContent('Past due · 25 July 2026');
    expect(within(row('inv-b')).getByTestId('invoice-row-status')).toHaveTextContent('Due today · 5 August 2026');
    expect(within(row('inv-c')).getByTestId('invoice-row-status')).toHaveTextContent(
      'Due 2 September 2026 · $500.00 paid',
    );
    expect(row('inv-c')).toHaveTextContent('of $800.00');
    expect(within(row('inv-c')).getByTestId('invoice-row-amount')).toHaveTextContent('$300.00');
    expect(within(row('inv-d')).getByTestId('invoice-row-status')).toHaveTextContent('No due date');
    // A studio invoice names itself by its title, and its origin is its studio.
    expect(within(row('inv-e')).getByTestId('invoice-row-name')).toHaveTextContent('Design fee, September');
    expect(within(row('inv-e')).getByTestId('invoice-row-reference')).toHaveTextContent(
      'INV-2026-022 · Birchwood Studio',
    );
    expect(within(row('inv-a')).getByTestId('invoice-row-reference')).toHaveTextContent('Elm Street House');
  });

  it('totals what is outstanding, once per invoice, across the house and the studio', () => {
    render(<Letterbox invoices={MIXED} today={TODAY} projectName="Elm Street House" />);

    const total = screen.getByTestId('letterbox-total');
    expect(total).toHaveTextContent('Total outstanding');
    expect(within(total).getByTestId('letterbox-total-amount')).toHaveTextContent('$1,975.00');
    expect(total).toHaveTextContent(
      '$1,975.00 across Elm Street House and your studio invoices. It counts only the invoices shown here.',
    );
  });

  it('A04 · totals each currency on its own and never converts', () => {
    render(
      <Letterbox
        invoices={[
          invoiceRow({ id: 'inv-u', total_cents: 60_000, due_date: '2026-07-25' }),
          invoiceRow({ id: 'inv-k', currency: 'CAD', total_cents: 12_000, due_date: null }),
        ]}
        today={TODAY}
        projectName="Elm Street House"
      />,
    );

    expect(within(row('inv-u')).getByTestId('invoice-row-amount')).toHaveTextContent('USD $600.00');
    expect(within(row('inv-k')).getByTestId('invoice-row-amount')).toHaveTextContent('CAD $120.00');
    const amounts = within(screen.getByTestId('letterbox-total')).getAllByTestId('letterbox-total-amount');
    expect(amounts.map((element) => element.textContent)).toEqual(['CAD $120.00', 'USD $600.00']);
    expect(screen.getByTestId('letterbox-total')).toHaveTextContent(
      'Across Elm Street House. Each currency is totalled on its own.',
    );
  });

  it('A05 · keeps in-flight and review invoices visible in their own groups, and pending without an intent payable', () => {
    render(
      <Letterbox
        invoices={[
          invoiceRow({
            id: 'inv-pi',
            invoice_number: 'INV-2026-030',
            payments: [
              {
                status: 'pending',
                stripe_payment_intent_id: 'pi_1',
                created_at: '2026-08-03T15:00:00Z',
              },
            ] as Invoice['payments'],
          }),
          invoiceRow({
            id: 'inv-cs',
            invoice_number: 'INV-2026-031',
            payments: [{ status: 'pending', stripe_payment_intent_id: null, created_at: '2026-08-03T15:00:00Z' }] as Invoice['payments'],
          }),
          invoiceRow({
            id: 'inv-rr',
            invoice_number: 'INV-2026-032',
            payments: [{ status: 'requires_refund', stripe_payment_intent_id: 'pi_2', created_at: '2026-08-01T15:00:00Z' }] as Invoice['payments'],
          }),
        ]}
        today={TODAY}
        designerName="Maren Holt"
      />,
    );

    expect(rowIds('invoices-to-pay')).toEqual(['inv-cs']);
    expect(rowIds('invoices-in-progress')).toEqual(['inv-pi']);
    expect(within(row('inv-pi')).getByTestId('invoice-row-note')).toHaveTextContent(
      'Payment started 3 August 2026. Confirmation is pending. You don’t need to pay again.',
    );
    expect(rowIds('invoices-under-review')).toEqual(['inv-rr']);
    expect(within(row('inv-rr')).getByTestId('invoice-row-note')).toHaveTextContent(
      'This payment needs a closer look. Birchwood Studio will follow up. You don’t need to do anything now.',
    );
    expect(screen.getByTestId('letterbox-total')).toHaveTextContent(
      'Each invoice is counted once, including payments in progress and under review.',
    );
  });

  it('withholds the total while an invoice’s paid status contradicts its balance', async () => {
    render(
      <Letterbox
        invoices={[invoiceRow({ id: 'inv-x', invoice_number: 'INV-2026-040', status: 'paid', amount_paid_cents: 5_000 })]}
        today={TODAY}
      />,
    );

    expect(within(row('inv-x')).getByTestId('invoice-row-note')).toHaveTextContent(
      'We can’t confirm this invoice’s payment status.',
    );
    expect(screen.getByTestId('letterbox-total')).toHaveTextContent(
      'The total is hidden until every invoice’s payment status is confirmed.',
    );
    await userEvent.click(viewInvoice('inv-x'));
    expect(screen.getByTestId('invoice-standing')).toHaveTextContent(
      'Its record says paid, but $250.00 still shows as due. Until the two agree, it isn’t shown as paid and can’t be paid here.',
    );
    expect(screen.queryByRole('button', { name: /continue to secure payment/i })).not.toBeInTheDocument();
  });

  it.each<[InvoiceReadState, string]>([
    ['loading', 'Loading your invoices.'],
    ['failed', 'We couldn’t load your invoices.'],
    ['partial', 'Some invoices didn’t load, so this list may be incomplete. The total is hidden until everything loads.'],
    ['stale', 'We couldn’t refresh your invoices. These may be out of date.'],
  ])('A06 · says what the %s read can and cannot stand behind', async (read, sentence) => {
    const onRefetch = jest.fn();
    const rows = read === 'loading' || read === 'failed' ? [] : [MIXED[0]];
    render(
      <Letterbox
        projection={invoiceProjection(rows, { today: TODAY, read })}
        onRefetch={onRefetch}
      />,
    );

    expect(screen.getByTestId('letterbox-read-notice')).toHaveTextContent(sentence);
    expect(screen.queryByText('No invoices to pay.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('letterbox-total-amount')).not.toBeInTheDocument();
    if (read === 'loading') {
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
      return;
    }
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  it('R3 · keeps a row read without its payments in view, withholds its act with the reason, and offers Retry', async () => {
    const onRefetch = jest.fn();
    render(
      <Letterbox
        invoices={[invoiceRow({ id: 'inv-u', invoice_number: 'INV-2026-050', payments: undefined })]}
        today={TODAY}
        onRefetch={onRefetch}
      />,
    );

    expect(rowIds('invoices-to-pay')).toEqual(['inv-u']);
    expect(within(row('inv-u')).getByTestId('invoice-row-amount')).toHaveTextContent('$300.00');

    await userEvent.click(viewInvoice('inv-u'));
    const settle = screen.getByRole('button', { name: /continue to secure payment/i });
    expect(settle).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('toll_settle-unavailable-reason')).toHaveTextContent(
      'Paying is paused until this invoice’s payment status loads.',
    );
    await act(async () => {
      await userEvent.click(settle);
    });
    expect(checkout).not.toHaveBeenCalled();

    expect(screen.getByTestId('letterbox-read-notice')).toHaveTextContent(
      'We couldn’t load the payment status of every invoice. An invoice whose status didn’t load can’t be paid here yet.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  it('A06 · says there is nothing to pay only on a complete read, and keeps the history', () => {
    render(<Letterbox invoices={[MIXED[7]]} today={TODAY} />);

    expect(screen.getByTestId('invoices-none')).toHaveTextContent('No invoices to pay.');
    expect(screen.getByRole('button', { name: 'Payment history' })).toBeInTheDocument();
    expect(screen.queryByTestId('letterbox-total')).not.toBeInTheDocument();
  });

  it('opens one row in place, moves focus into it, and changes nothing on the server', async () => {
    render(<Letterbox invoices={MIXED} today={TODAY} />);

    await userEvent.click(viewInvoice('inv-c'));

    expect(viewInvoice('inv-c')).toHaveAttribute('aria-expanded', 'true');
    const region = screen.getByRole('region', { name: 'Payment details for INV-2026-017' });
    expect(within(region).getByRole('heading', { level: 4 })).toHaveFocus();
    expect(within(region).getByTestId('spine-toll-balance')).toHaveTextContent('$300.00');
    expect(within(region).getByRole('button', { name: 'Continue to secure payment · $302.40' })).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'Print invoice' })).toHaveAttribute(
      'href',
      '/invoices/inv-c/print',
    );
    expect(checkout).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();

    // Opening another closes the first, without submitting anything.
    await userEvent.click(viewInvoice('inv-a'));
    expect(viewInvoice('inv-c')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByTestId('spine-toll')).toHaveLength(1);
    expect(checkout).not.toHaveBeenCalled();
  });

  it('returns focus to the row’s own control when its details close', async () => {
    render(<Letterbox invoices={MIXED} today={TODAY} />);

    await userEvent.click(viewInvoice('inv-b'));
    await userEvent.click(screen.getByRole('button', { name: 'Close payment details' }));

    expect(viewInvoice('inv-b')).toHaveAttribute('aria-expanded', 'false');
    expect(viewInvoice('inv-b')).toHaveFocus();
  });

  it('A07 · opens the invoice the address named, even one in history', () => {
    standAt('?invoice=inv-p1');
    render(<Letterbox invoices={MIXED} today={TODAY} />);

    expect(screen.getByRole('button', { name: 'Payment history' })).toHaveAttribute('aria-expanded', 'true');
    expect(viewInvoice('inv-p1')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Invoice details for INV-2026-008' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invoice details for INV-2026-008' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Close invoice details' })).toBeInTheDocument();
  });

  it('A07 · names nothing for an address this house is not holding, or one under a return', () => {
    standAt('?invoice=inv-nowhere');
    const { unmount } = render(<Letterbox invoices={MIXED} today={TODAY} />);
    for (const toggle of screen.getAllByRole('button', { name: 'View invoice' })) {
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
    unmount();

    resetCheckoutReturn();
    standAt('?invoice=inv-a&checkout=cancel');
    render(<Letterbox invoices={MIXED} today={TODAY} />);
    expect(viewInvoice('inv-a')).toHaveAttribute('aria-expanded', 'false');
  });

  it('A08 · keeps a returned processing hold across closing and reopening, and hands it up', async () => {
    const onHold = jest.fn();
    checkout.mockRejectedValue(new InvoiceCheckoutError('payment_processing', 'clearing'));
    render(<Letterbox invoices={MIXED} today={TODAY} onHold={onHold} />);

    await userEvent.click(viewInvoice('inv-c'));
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /continue to secure payment/i }));
    });

    expect(onHold).toHaveBeenCalledWith('inv-c', 'payment_processing');
    expect(rowIds('invoices-in-progress')).toEqual(['inv-c']);
    expect(within(row('inv-c')).getByTestId('invoice-row-note')).toHaveTextContent(
      'Your payment is still processing. You don’t need to pay again.',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close payment details' }));
    await userEvent.click(viewInvoice('inv-c'));
    expect(screen.getByTestId('invoice-standing')).toHaveTextContent(
      'Your payment provider is still processing this payment. The balance updates only when the payment is confirmed. You don’t need to pay again.',
    );
    expect(screen.queryByRole('button', { name: /continue to secure payment/i })).not.toBeInTheDocument();
    expect(checkout).toHaveBeenCalledTimes(1);
  });

  it('R8a · drops a processing hold once a complete read proves it paid, so a same-visit refund reopen is payable', async () => {
    checkout.mockRejectedValue(new InvoiceCheckoutError('payment_processing', 'clearing'));
    const open = invoiceRow({ id: 'inv-r', invoice_number: 'INV-2026-030', total_cents: 20_000 });
    const { rerender } = render(<Letterbox invoices={[open]} today={TODAY} />);

    await userEvent.click(viewInvoice('inv-r'));
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /continue to secure payment/i }));
    });
    expect(rowIds('invoices-in-progress')).toEqual(['inv-r']);

    // The open read stands behind the hold until a complete read proves it settled.
    rerender(<Letterbox invoices={[{ ...open }]} today={TODAY} />);
    expect(rowIds('invoices-in-progress')).toEqual(['inv-r']);

    const paidPayment = {
      id: 'pay-r',
      invoice_id: 'inv-r',
      amount_cents: 20_000,
      status: 'succeeded',
      stripe_payment_intent_id: 'pi_r',
    } as NonNullable<Invoice['payments']>[number];
    rerender(
      <Letterbox
        invoices={[{ ...open, status: 'paid', amount_paid_cents: 20_000, paid_at: '2026-08-04T10:00:00Z', payments: [paidPayment] }]}
        today={TODAY}
      />,
    );
    expect(screen.queryByTestId('invoices-in-progress')).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-history')).toBeInTheDocument();

    // A full refund reopens it in the same visit: judged on its own read, it can be paid again.
    rerender(
      <Letterbox invoices={[{ ...open, payments: [{ ...paidPayment, status: 'refunded' }] }]} today={TODAY} />,
    );
    expect(screen.queryByTestId('invoices-in-progress')).not.toBeInTheDocument();
    expect(rowIds('invoices-to-pay')).toEqual(['inv-r']);
    expect(within(row('inv-r')).queryByTestId('invoice-row-note')).not.toBeInTheDocument();
    // Its details stayed open under the same id; the act is offered again.
    expect(screen.getByRole('button', { name: /continue to secure payment/i })).toBeEnabled();
  });

  it('A08 · keeps a reconciliation hold under review after switching away and back', async () => {
    checkout.mockRejectedValue(new InvoiceCheckoutError('payment_reconciliation_required', 'review'));
    render(<Letterbox invoices={MIXED} today={TODAY} />);

    await userEvent.click(viewInvoice('inv-f'));
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /continue to secure payment/i }));
    });
    expect(rowIds('invoices-under-review')).toEqual(['inv-f']);

    await userEvent.click(viewInvoice('inv-a'));
    await userEvent.click(viewInvoice('inv-f'));
    expect(screen.getByTestId('invoice-standing')).toHaveTextContent(
      'It’s on hold until it’s checked, so it can’t be paid again here.',
    );
    expect(screen.queryByRole('button', { name: /continue to secure payment/i })).not.toBeInTheDocument();
  });

  it('A09 · says check expected after the acknowledgement, with the balance still due', async () => {
    render(<Letterbox invoices={MIXED} today={TODAY} />);

    await userEvent.click(viewInvoice('inv-c'));
    await userEvent.click(screen.getByRole('radio', { name: /mail a check/i }));
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'I’ll mail a check' }));
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(within(row('inv-c')).getByTestId('invoice-row-note')).toHaveTextContent(
      'Check expected. The balance stays $300.00 until the check arrives and is recorded.',
    );
    expect(rowIds('invoices-to-pay')).toContain('inv-c');
    expect(within(row('inv-c')).getByTestId('invoice-row-amount')).toHaveTextContent('$300.00');

    await userEvent.click(screen.getByRole('button', { name: 'Close payment details' }));
    await userEvent.click(viewInvoice('inv-c'));
    await userEvent.click(screen.getByRole('radio', { name: /mail a check/i }));
    expect(screen.getByTestId('threshold-check-expected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'I’ll mail a check' })).not.toBeInTheDocument();
  });

  it('makes each row’s check out to that invoice’s own studio', async () => {
    render(
      <Letterbox
        invoices={[invoiceRow({ id: 'inv-b2', invoice_number: 'Invoice No. 9', studio_id: 'studio-b' })]}
        today={TODAY}
        designerName="Maren Holt"
      />,
    );

    await userEvent.click(viewInvoice('inv-b2'));
    await userEvent.click(screen.getByRole('radio', { name: /mail a check/i }));
    expect(screen.getByTestId('threshold-check-panel')).toHaveTextContent('Mail your check to Bramwell Fox');
    expect(screen.getByTestId('spine-toll-payee')).toHaveTextContent('Payable toBramwell Fox');
  });

  /* ── The return from the till ─────────────────────────────────────────── */

  it('reads a settled return once the invoice’s own row says it is paid', () => {
    standAt('?invoice=inv-4&checkout=success&session_id=cs_1');
    render(
      <Letterbox
        invoices={[invoiceRow({ id: 'inv-4', status: 'paid', amount_paid_cents: 30_000 })]}
        today={TODAY}
      />,
    );

    expect(screen.getByTestId('letterbox-receipt')).toHaveTextContent(
      'Invoice No. 3 · Payment confirmed — thank you. Your invoice has been updated.',
    );
    expect(clientEvents.paymentCompleted).toHaveBeenCalledWith({ invoiceId: 'inv-4' });
  });

  it('will not say an invoice is paid while it is still open, and pauses its act', async () => {
    standAt('?invoice=inv-4&checkout=success&session_id=cs_1');
    render(<Letterbox invoices={[invoiceRow({ id: 'inv-4' })]} today={TODAY} />);

    expect(screen.getByTestId('letterbox-receipt')).toHaveTextContent(
      'Confirming payment… This usually takes a few seconds.',
    );
    expect(clientEvents.paymentCompleted).not.toHaveBeenCalled();
    await userEvent.click(viewInvoice('inv-4'));
    expect(screen.getByRole('button', { name: /continue to secure payment/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('says plainly that nothing is confirmed once the wait runs out', () => {
    jest.useFakeTimers();
    try {
      standAt('?invoice=inv-4&checkout=success');
      render(<Letterbox invoices={[invoiceRow({ id: 'inv-4' })]} today={TODAY} />);
      act(() => {
        jest.advanceTimersByTime(31_000);
      });
      expect(screen.getByTestId('letterbox-receipt')).toHaveTextContent(
        'Checkout returned, but Patina has not confirmed a payment yet. Do not submit another payment until the status is known.',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('says nothing changed after a cancelled till, and nothing about invoices it is not holding', () => {
    standAt('?invoice=inv-4&checkout=cancelled');
    const { unmount } = render(<Letterbox invoices={[invoiceRow({ id: 'inv-4' })]} today={TODAY} />);
    expect(screen.getByTestId('letterbox-receipt')).toHaveTextContent('Nothing changed.');
    expect(clientEvents.paymentCancelled).toHaveBeenCalledWith({ invoiceId: 'inv-4' });
    unmount();

    resetCheckoutReturn();
    standAt('?invoice=inv-elsewhere&checkout=success');
    render(<Letterbox invoices={[invoiceRow({ id: 'inv-4' })]} today={TODAY} />);
    expect(screen.queryByTestId('letterbox-receipt')).not.toBeInTheDocument();
  });

  it('leaves an order’s return to the road', () => {
    standAt('?order=ord-1&checkout=success');
    render(<Letterbox invoices={[invoiceRow({ id: 'inv-4' })]} today={TODAY} />);
    expect(screen.queryByTestId('letterbox-receipt')).not.toBeInTheDocument();
  });

  it('carries the anchor and the unit, and never opts into dimming', () => {
    render(<Letterbox invoices={[]} today={TODAY} />);

    const letterbox = screen.getByTestId('letterbox');
    expect(letterbox).toHaveAttribute('id', 'letterbox');
    expect(letterbox).toHaveAttribute('data-threshold-unit', 'letterbox');
    expect(letterbox).toHaveAttribute('data-never-dim');
    expect(letterbox).not.toHaveAttribute('data-dimmable');
  });
});
