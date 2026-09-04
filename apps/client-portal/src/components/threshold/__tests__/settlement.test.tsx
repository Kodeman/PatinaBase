import { act, fireEvent, render, screen } from '@testing-library/react';

import type { InvoiceModel } from '@/lib/threshold/derive';

// ── Boundaries ──────────────────────────────────────────────────────────────
// The pay path is three hooks and one typed failure. Mock the module the
// component imports; everything below the mutation is the edge function's.

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
  };
});

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  clientEvents: {
    paymentStarted: jest.fn(),
    paymentMethodSelected: jest.fn(),
    checkIntentSubmitted: jest.fn(),
  },
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import {
  InvoiceCheckoutError,
  useInvoicePaymentOptions,
  useNotifyCheckIntent,
  useStartCheckout,
} from '@patina/supabase';
import { clientEvents } from '@/lib/analytics/events';

import { Settlement } from '../settlement';

const optionsMock = useInvoicePaymentOptions as jest.Mock;
const checkoutMock = useStartCheckout as jest.Mock;
const notifyMock = useNotifyCheckIntent as jest.Mock;

const INVOICE: InvoiceModel = {
  id: 'inv-4',
  number: 'Invoice No. 4',
  totalCents: 1_825_000,
  paidCents: 912_500,
  balanceCents: 912_500,
  dueDate: '2026-08-15',
};

let mutateAsync: jest.Mock;

function standAtTheTill(isPending = false) {
  mutateAsync = jest.fn().mockResolvedValue({
    url: 'https://checkout.stripe.test/session',
    amount_cents: 912_500,
    surcharge_cents: 500,
  });
  checkoutMock.mockReturnValue({ mutateAsync, isPending });
  notifyMock.mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue({ ok: true }) });
  optionsMock.mockReturnValue({
    isPending: false,
    data: { card_surcharge_bps: 300, check_remit_to: 'Quist Interiors, PO Box 4' },
  });
}

function renderSettlement() {
  return render(
    <Settlement invoice={INVOICE} currency="USD" designerName="Quist Interiors" />,
  );
}

describe('Settlement — the balance settled in place', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    standAtTheTill();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'https://client.test/projects/p1' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('draws the toll’s figures, the three ways to pay, and the act', () => {
    renderSettlement();

    expect(screen.getByTestId('spine-toll')).toHaveAttribute('data-invoice-id', 'inv-4');
    expect(screen.getByTestId('threshold-payment-methods')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /settle the balance/i })).toBeEnabled();
    // The act stays inside the page — it is no longer a way out to /invoices.
    expect(screen.queryByRole('link', { name: /settle the balance/i })).not.toBeInTheDocument();
  });

  it('claims one Checkout session for the chosen method and goes to the till', async () => {
    renderSettlement();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /settle the balance/i }));
    });

    expect(mutateAsync).toHaveBeenCalledWith({
      invoiceId: 'inv-4',
      paymentMethod: 'us_bank_account',
    });
    expect(clientEvents.paymentStarted).toHaveBeenCalledWith({
      invoiceId: 'inv-4',
      amountCents: 912_500,
      paymentMethod: 'us_bank_account',
      surchargeCents: 500,
    });
    expect(window.location.href).toBe('https://checkout.stripe.test/session');
  });

  it('carries the card when the card is chosen, and quotes what will be charged', async () => {
    renderSettlement();

    fireEvent.click(screen.getByRole('radio', { name: /^card/i }));
    expect(clientEvents.paymentMethodSelected).toHaveBeenCalledWith({
      invoiceId: 'inv-4',
      method: 'card',
    });
    // $9,125 balance at 300bps = $273.75.
    expect(screen.getByTestId('settlement-charge')).toHaveTextContent(
      'You will be charged $9,398.75 — the balance and a $273.75 processing fee.',
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /settle the balance/i }));
    });

    expect(mutateAsync).toHaveBeenCalledWith({ invoiceId: 'inv-4', paymentMethod: 'card' });
  });

  it('will not take a check to the till', () => {
    renderSettlement();

    fireEvent.click(screen.getByRole('radio', { name: /^mail a check/i }));

    expect(screen.getByRole('button', { name: /settle the balance/i })).toBeDisabled();
    expect(screen.getByTestId('threshold-check-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('settlement-charge')).not.toBeInTheDocument();
  });

  it('holds the client back from a second payment when one needs review', async () => {
    renderSettlement();
    mutateAsync.mockRejectedValue(
      new InvoiceCheckoutError('payment_reconciliation_required', 'needs review'),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /settle the balance/i }));
    });

    expect(screen.getByTestId('settlement-error')).toHaveTextContent(
      'This invoice has a payment that needs review. Do not submit another payment; your designer will follow up.',
    );
  });

  // The two enumerated InvoiceCheckoutError codes keep their own copy, because
  // each says something true and specific about the client's money. Every
  // other cause reads in the house's words — a PostgREST string is never
  // printed to the homeowner as content.
  it('states any other failure in the house’s own words', async () => {
    renderSettlement();
    mutateAsync.mockRejectedValue(new Error('invoices row refused: 42501'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /settle the balance/i }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to start payment.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('42501');
  });

  it('does not go to the till twice while the first session is being claimed', async () => {
    standAtTheTill(true);
    renderSettlement();

    const settle = screen.getByRole('button', { name: /settle the balance/i });
    await act(async () => {
      fireEvent.click(settle);
    });

    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('will not claim a card session at a fee it does not yet know', () => {
    optionsMock.mockReturnValue({ isPending: true, data: undefined });
    renderSettlement();

    fireEvent.click(screen.getByRole('radio', { name: /^card/i }));

    expect(screen.getByRole('button', { name: /settle the balance/i })).toBeDisabled();
    expect(screen.queryByTestId('settlement-charge')).not.toBeInTheDocument();
  });

  it('offers no act on a letter with nothing left to pay', () => {
    render(
      <Settlement
        invoice={{ ...INVOICE, paidCents: 1_825_000, balanceCents: 0 }}
        currency="USD"
        designerName="Quist Interiors"
      />,
    );

    expect(screen.getByRole('button', { name: /settle the balance/i })).toBeDisabled();
  });

  it('states a payment already clearing as a fact, not a failure, and holds the act', async () => {
    const onRefetch = jest.fn();
    render(
      <Settlement
        invoice={INVOICE}
        currency="USD"
        designerName="Quist Interiors"
        onRefetch={onRefetch}
      />,
    );
    mutateAsync.mockRejectedValue(
      new InvoiceCheckoutError(
        'payment_processing',
        'A bank transfer for this invoice is already processing. Bank transfers take 3–5 business days to clear.',
      ),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /settle the balance/i }));
    });

    const standing = screen.getByTestId('settlement-processing');
    expect(standing).toHaveAttribute('role', 'status');
    expect(standing).toHaveTextContent(
      'A bank transfer for this invoice is already processing. Bank transfers take 3–5 business days to clear.',
    );
    expect(screen.queryByTestId('settlement-error')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /settle the balance/i })).toBeDisabled();
    expect(onRefetch).toHaveBeenCalled();
  });

  it('re-reads the invoices after a payment that needs review', async () => {
    const onRefetch = jest.fn();
    render(
      <Settlement
        invoice={INVOICE}
        currency="USD"
        designerName="Quist Interiors"
        onRefetch={onRefetch}
      />,
    );
    mutateAsync.mockRejectedValue(
      new InvoiceCheckoutError('payment_reconciliation_required', 'needs review'),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /settle the balance/i }));
    });

    expect(onRefetch).toHaveBeenCalled();
  });

  it('holds the act while a return from the till is still unconfirmed', () => {
    render(
      <Settlement invoice={INVOICE} currency="USD" designerName="Quist Interiors" hold />,
    );

    expect(screen.getByRole('button', { name: /settle the balance/i })).toBeDisabled();
  });

  it('holds the ways to pay while a check notification is in flight', () => {
    notifyMock.mockReturnValue({ mutateAsync: jest.fn(), isPending: true });
    renderSettlement();

    expect(screen.getByRole('radio', { name: /^card/i })).toBeDisabled();
  });
});
