import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { Invoice } from '@patina/supabase';

import { invoiceProjection, type InvoiceRow } from '@/lib/threshold/invoice-rollup';

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

import { Settlement, type SettlementProps } from '../settlement';

const optionsMock = useInvoicePaymentOptions as jest.Mock;
const checkoutMock = useStartCheckout as jest.Mock;
const notifyMock = useNotifyCheckIntent as jest.Mock;

/** 5 August 2026 — the deck's "today"; Invoice No. 4 falls due ten days later. */
const TODAY = new Date(2026, 7, 5);

const INVOICE = {
  id: 'inv-4',
  project_id: 'project-1',
  studio_id: 'studio-1',
  designer_id: 'designer-1',
  invoice_number: 'Invoice No. 4',
  title: null,
  status: 'partially_paid',
  currency: 'USD',
  total_cents: 1_825_000,
  amount_paid_cents: 912_500,
  due_date: '2026-08-15',
  payments: [],
} as unknown as Invoice;

function payableRow(overrides: Partial<Invoice> = {}, today = TODAY): InvoiceRow {
  const [row] = invoiceProjection([{ ...INVOICE, ...overrides }], {
    today,
    read: 'complete',
  }).payable;
  return row;
}

let mutateAsync: jest.Mock;
let refetch: jest.Mock;

function standAtTheTill({
  isPending = false,
  options = { card_surcharge_bps: 300, check_remit_to: 'Quist Interiors, PO Box 4', card_surcharge_resolved: true },
  optionsPending = false,
}: {
  isPending?: boolean;
  options?: Record<string, unknown>;
  optionsPending?: boolean;
} = {}) {
  mutateAsync = jest.fn().mockResolvedValue({
    url: 'https://checkout.stripe.test/session',
    amount_cents: 912_500,
    surcharge_cents: 500,
  });
  refetch = jest.fn().mockResolvedValue(undefined);
  checkoutMock.mockReturnValue({ mutateAsync, isPending });
  notifyMock.mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue({ ok: true }), isPending: false });
  optionsMock.mockReturnValue({
    isPending: optionsPending,
    isFetching: optionsPending,
    isError: false,
    data: optionsPending ? undefined : options,
    refetch,
  });
}

function renderSettlement(props: Partial<SettlementProps> = {}) {
  return render(
    <Settlement row={payableRow()} designerName="Nora" payeeName="Quist Interiors" {...props} />,
  );
}

const continueAct = (name: RegExp | string = /continue to secure payment/i) =>
  screen.getByRole('button', { name });

describe('Settlement — the payment sheet, in place', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    jest.clearAllMocks();
    standAtTheTill();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'https://client.test/projects/p1' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('frames the balance, the real due status, the total and the payee on one card', () => {
    renderSettlement();

    const sheet = screen.getByTestId('spine-toll');
    expect(sheet).toHaveClass('cp-card');
    expect(screen.getByTestId('spine-toll-balance')).toHaveTextContent('$9,125.00');
    expect(screen.getByTestId('spine-toll-due')).toHaveTextContent(
      'Due 15 August 2026 · $9,125.00 paid',
    );
    expect(screen.getByTestId('spine-toll-ledger')).toHaveTextContent('Invoice total$18,250.00');
    expect(screen.getByTestId('spine-toll-payee')).toHaveTextContent('Payable toQuist Interiors');
    expect(document.body).not.toHaveTextContent(/a toll on the line|settle the balance/i);
  });

  it('states a past-due balance as a fact, in the same ink', () => {
    render(
      <Settlement
        row={payableRow({}, new Date(2026, 8, 4))}
        designerName="Nora"
        payeeName="Quist Interiors"
      />,
    );
    expect(screen.getByTestId('spine-toll-due')).toHaveTextContent(
      'Past due · 15 August 2026 · $9,125.00 paid',
    );
  });

  it('carries the verified total on the forest act, under the consequence note', () => {
    renderSettlement();

    // Bank transfer by default: the ACH fee caps at $5.00 on this balance.
    expect(screen.getByTestId('settlement-charge')).toHaveTextContent(
      'Total with bank transfer$9,130.00',
    );
    const act = continueAct('Continue to secure payment · $9,130.00');
    expect(act).toHaveClass('da-terminal');
    expect(screen.getByTestId('settlement-consequence')).toHaveClass('cp-note');
    expect(screen.getByTestId('settlement-consequence')).toHaveTextContent(
      'Nothing is charged until you confirm there. Opening these details or choosing a method doesn’t pay anything.',
    );
  });

  it('claims one Checkout session for the chosen method and goes to the till', async () => {
    renderSettlement();

    await act(async () => {
      fireEvent.click(continueAct());
    });

    expect(mutateAsync).toHaveBeenCalledWith({ invoiceId: 'inv-4', paymentMethod: 'us_bank_account' });
    expect(clientEvents.paymentStarted).toHaveBeenCalledWith({
      invoiceId: 'inv-4',
      amountCents: 912_500,
      paymentMethod: 'us_bank_account',
      surchargeCents: 500,
    });
    expect(window.location.href).toBe('https://checkout.stripe.test/session');
  });

  it('quotes the card total from the rate the server answered, and carries the card', async () => {
    standAtTheTill({ options: { card_surcharge_bps: 250, check_remit_to: null, card_surcharge_resolved: true } });
    renderSettlement();

    fireEvent.click(screen.getByRole('radio', { name: /^card/i }));
    expect(clientEvents.paymentMethodSelected).toHaveBeenCalledWith({ invoiceId: 'inv-4', method: 'card' });
    expect(screen.getByTestId('settlement-charge')).toHaveTextContent('Total with card$9,353.13');

    await act(async () => {
      fireEvent.click(continueAct('Continue to secure payment · $9,353.13'));
    });
    expect(mutateAsync).toHaveBeenCalledWith({ invoiceId: 'inv-4', paymentMethod: 'card' });
  });

  it('never quotes a card total from a rate the server did not answer, and keeps the bank open', async () => {
    standAtTheTill({ options: { card_surcharge_bps: 300, check_remit_to: null, card_surcharge_resolved: false } });
    renderSettlement();

    expect(screen.getByTestId('threshold-method-total-card')).toHaveTextContent('Total not confirmed');
    expect(screen.queryByText('$9,398.75')).not.toBeInTheDocument();
    expect(screen.getByTestId('threshold-card-fee-unconfirmed')).toHaveTextContent(
      'We couldn’t confirm the card fee. Card payment is unavailable until it loads.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('radio', { name: /^card/i }));
    const act1 = continueAct();
    expect(act1).toHaveTextContent(/^Continue to secure payment$/);
    expect(act1).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('toll_settle-unavailable-reason')).toHaveTextContent(
      'Card payment is unavailable until the card fee loads.',
    );
    await act(async () => {
      fireEvent.click(act1);
    });
    expect(mutateAsync).not.toHaveBeenCalled();

    // The bank rail does not depend on the card rate.
    fireEvent.click(screen.getByRole('radio', { name: /bank transfer/i }));
    await act(async () => {
      fireEvent.click(continueAct('Continue to secure payment · $9,130.00'));
    });
    expect(mutateAsync).toHaveBeenCalledWith({ invoiceId: 'inv-4', paymentMethod: 'us_bank_account' });
  });

  it('says the card fee is still loading while the rate is in flight', () => {
    standAtTheTill({ optionsPending: true });
    renderSettlement();

    expect(screen.getByTestId('threshold-method-total-card')).toHaveTextContent('Total not confirmed');
    expect(screen.getByTestId('threshold-card-fee-unconfirmed')).toHaveTextContent(
      'Loading the card fee.',
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('starts one checkout however quickly the act is pressed twice', async () => {
    let finish!: (value: unknown) => void;
    mutateAsync.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderSettlement();

    const act1 = continueAct();
    fireEvent.click(act1);
    fireEvent.click(act1);
    expect(mutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish({ url: 'https://checkout.stripe.test/session', amount_cents: 912_500, surcharge_cents: 500 });
    });
  });

  it('holds a payment already clearing, hands it up, and offers no second charge', async () => {
    const onHold = jest.fn();
    const onRefetch = jest.fn();
    mutateAsync.mockRejectedValue(new InvoiceCheckoutError('payment_processing', 'still clearing'));
    renderSettlement({ onHold, onRefetch });

    await act(async () => {
      fireEvent.click(continueAct());
    });

    const hold = screen.getByTestId('settlement-hold');
    expect(hold).toHaveAttribute('data-hold', 'payment_processing');
    expect(hold).toHaveTextContent(
      'Your payment provider is still processing this payment. The balance updates only when the payment is confirmed. You don’t need to pay again.',
    );
    expect(onHold).toHaveBeenCalledWith('payment_processing');
    expect(onRefetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /continue to secure payment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('holds a payment that needs checking, and points to the designer', async () => {
    const onRefetch = jest.fn();
    mutateAsync.mockRejectedValue(
      new InvoiceCheckoutError('payment_reconciliation_required', 'needs review'),
    );
    renderSettlement({ onRefetch });

    await act(async () => {
      fireEvent.click(continueAct());
    });

    expect(screen.getByTestId('settlement-hold')).toHaveTextContent(
      'It’s on hold until it’s checked, so it can’t be paid again here. Nora can help.',
    );
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  it('keeps a hold the owner already holds, on a sheet opened again', () => {
    renderSettlement({ serverHold: 'payment_processing' });

    expect(screen.getByTestId('settlement-hold')).toBeInTheDocument();
    expect(screen.queryByTestId('threshold-payment-methods')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue to secure payment/i })).not.toBeInTheDocument();
  });

  it('states any other failure in the house’s own words, and lets her try again', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('PGRST116: JSON object requested'));
    renderSettlement();

    await act(async () => {
      fireEvent.click(continueAct());
    });

    expect(screen.getByTestId('settlement-error')).toHaveTextContent('Unable to start payment.');
    expect(screen.getByTestId('settlement-error')).not.toHaveTextContent('PGRST116');
    await act(async () => {
      fireEvent.click(continueAct());
    });
    expect(mutateAsync).toHaveBeenCalledTimes(2);
  });

  it('pauses the act while a return from the till is unconfirmed', async () => {
    renderSettlement({ hold: true });

    const act1 = continueAct();
    expect(act1).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('toll_settle-unavailable-reason')).toHaveTextContent(
      'Do not submit another payment until the status is known.',
    );
    await act(async () => {
      fireEvent.click(act1);
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('will not take a check to the till: the check panel has its own acknowledgement', () => {
    renderSettlement();

    fireEvent.click(screen.getByRole('radio', { name: /mail a check/i }));

    expect(screen.queryByRole('button', { name: /continue to secure payment/i })).not.toBeInTheDocument();
    const panel = screen.getByTestId('threshold-check-panel');
    expect(panel).toHaveTextContent('Mail your check to Quist Interiors');
    expect(panel).toHaveTextContent('Write invoice Invoice No. 4 on the memo line. The amount is $9,125.00, with no fee.');
    expect(within(panel).getByRole('button', { name: 'I’ll mail a check' })).toBeInTheDocument();
  });

  it('records check expected only after the acknowledgement, with the balance standing', async () => {
    const onCheckExpected = jest.fn();
    const notify = jest.fn().mockResolvedValue({ ok: true });
    notifyMock.mockReturnValue({ mutateAsync: notify, isPending: false });
    renderSettlement({ onCheckExpected });

    fireEvent.click(screen.getByRole('radio', { name: /mail a check/i }));
    expect(screen.queryByTestId('threshold-check-expected')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'I’ll mail a check' }));
    });

    expect(clientEvents.checkIntentSubmitted).toHaveBeenCalledWith({ invoiceId: 'inv-4' });
    expect(notify).toHaveBeenCalledWith({ invoiceId: 'inv-4' });
    expect(onCheckExpected).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('threshold-check-expected')).toHaveTextContent(
      'Check expectedNora knows a check is coming. The balance stays $9,125.00 until the check arrives and is recorded. Nothing has been paid yet.',
    );
    expect(screen.getByTestId('spine-toll-balance')).toHaveTextContent('$9,125.00');
  });
});
