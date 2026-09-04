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
  useInvoicePaymentOptions,
  useNotifyCheckIntent,
  useStartCheckout,
} from '@patina/supabase';
import { clientEvents } from '@/lib/analytics/events';

import { Letterbox } from '../letterbox';

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
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
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

    expect(screen.getByTestId('letterbox-receipt')).toHaveTextContent(
      'Paid September 4. Receipt in your email.',
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
    expect(receipt).not.toHaveTextContent('Paid September 4');
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
});
