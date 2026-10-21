/**
 * The letterbox's ACH / Card / Check chooser (migration 00428), cut the way the
 * guest chooser reads (US-45 CPUX-03 §3): each way to pay shows the full amount,
 * with its fee underneath. The arithmetic is the shared helpers', so the cases
 * that guard the money are the same cases.
 */

import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
  clientEvents: {},
}));

import {
  methodQuote,
  PaymentMethodChooser,
  type CardFeeState,
  type InvoicePaymentUIMethod,
} from '../payment-method-chooser';

/** Manually-resolvable promise — holds the intent await open mid-interaction. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

type HarnessProps = {
  method?: InvoicePaymentUIMethod;
  balanceCents?: number;
  cardSurchargeBps?: number | null;
  cardFeeState?: CardFeeState;
  onRetryCardFee?: () => void;
  disabled?: boolean;
  invoiceNumber?: string | null;
  checkRemitTo?: string | null;
  onNotifyCheckIntent: () => Promise<unknown>;
};

function Harness({
  method,
  balanceCents = 100_000,
  cardSurchargeBps = 300,
  cardFeeState = 'resolved',
  onRetryCardFee,
  disabled = false,
  invoiceNumber = 'INV-1042',
  checkRemitTo = null,
  onNotifyCheckIntent,
}: HarnessProps) {
  const [current, setCurrent] = useState<InvoicePaymentUIMethod>(method ?? 'us_bank_account');
  const [expected, setExpected] = useState(false);
  return (
    <PaymentMethodChooser
      method={current}
      onMethodChange={setCurrent}
      balanceCents={balanceCents}
      currency="USD"
      cardSurchargeBps={cardSurchargeBps}
      cardFeeState={cardFeeState}
      onRetryCardFee={onRetryCardFee}
      disabled={disabled}
      designerName="Jordan"
      payeeName="Birchwood Studio"
      invoiceNumber={invoiceNumber}
      checkRemitTo={checkRemitTo}
      checkExpected={expected}
      onNotifyCheckIntent={onNotifyCheckIntent}
      onCheckExpected={() => setExpected(true)}
    />
  );
}

describe('PaymentMethodChooser — in the payment sheet', () => {
  it('shows each full total with its fee underneath, for a non-default card rate', () => {
    render(<Harness balanceCents={100_000} cardSurchargeBps={250} onNotifyCheckIntent={jest.fn()} />);

    expect(screen.getByText('How would you like to pay?').tagName).toBe('LEGEND');
    expect(
      screen.getByText('Each option shows the full amount you would pay, with its fee underneath.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /bank transfer \(ach\)/i })).toBeChecked();
    expect(screen.getByTestId('threshold-method-total-us_bank_account')).toHaveTextContent('$1,005.00');
    expect(screen.getByText('$1,000.00 + $5.00 processing fee')).toBeInTheDocument();
    expect(screen.getByTestId('threshold-method-total-card')).toHaveTextContent('$1,025.00');
    expect(screen.getByText('$1,000.00 + $25.00 processing fee')).toBeInTheDocument();
    expect(screen.getByTestId('threshold-method-total-check')).toHaveTextContent('$1,000.00');
    // G3: check is $0, so "lowest fee" on the bank was never true.
    expect(screen.queryByText(/preferred · lowest fee/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /^card/i }));
    expect(screen.getByRole('radio', { name: /^card/i })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /^mail a check/i }));
    expect(screen.getByTestId('threshold-check-panel')).toBeInTheDocument();
  });

  it('withholds the card total until the rate is answered, and offers to read it again', () => {
    const onRetryCardFee = jest.fn();
    render(
      <Harness
        cardSurchargeBps={null}
        cardFeeState="unavailable"
        onRetryCardFee={onRetryCardFee}
        onNotifyCheckIntent={jest.fn()}
      />,
    );

    expect(screen.getByTestId('threshold-method-total-card')).toHaveTextContent('Total not confirmed');
    expect(screen.getByText('Card fee not confirmed')).toBeInTheDocument();
    expect(screen.queryByText('$1,030.00')).not.toBeInTheDocument();
    // The bank rail is a platform formula and stays quoted.
    expect(screen.getByTestId('threshold-method-total-us_bank_account')).toHaveTextContent('$1,005.00');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetryCardFee).toHaveBeenCalledTimes(1);
  });

  it('never quotes a card total from a rate that is not resolved, whatever number it carries', () => {
    render(
      <Harness cardSurchargeBps={300} cardFeeState="loading" onNotifyCheckIntent={jest.fn()} />,
    );
    expect(screen.getByTestId('threshold-method-total-card')).toHaveTextContent('Total not confirmed');
    expect(methodQuote('card', 100_000, null)).toBeNull();
    expect(methodQuote('card', 100_000, 300)).toEqual({ feeCents: 3_000, totalCents: 103_000 });
  });

  it('computes a sub-cap ACH fee from the formula rather than always the cap', () => {
    render(<Harness balanceCents={5_000} onNotifyCheckIntent={jest.fn()} />);
    expect(screen.getByText('$50.00 + $0.40 processing fee')).toBeInTheDocument();
  });

  it('falls back to the platform remit-to, and names the invoice and the amount on the memo line', () => {
    render(
      <Harness method="check" invoiceNumber="INV-2077" onNotifyCheckIntent={jest.fn()} />,
    );

    expect(screen.getByText('Contact your designer for mailing details')).toBeInTheDocument();
    expect(screen.getByText('Mail your check to').textContent).toBe('Mail your check to Birchwood Studio');
    expect(
      screen.getByText(
        'Write invoice INV-2077 on the memo line. The amount is $1,000.00, with no fee.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Telling Jordan a check is coming doesn’t pay the invoice. The balance stays $1,000.00 until the check arrives.',
      ),
    ).toHaveClass('cp-note');
  });

  it('shows the studio-configured remit-to, and generic memo copy on an unnumbered invoice', () => {
    const { unmount } = render(
      <Harness
        method="check"
        checkRemitTo={'Acme Design Co\n123 Main St\nAustin, TX 78701'}
        onNotifyCheckIntent={jest.fn()}
      />,
    );
    expect(screen.getByText('Acme Design Co 123 Main St Austin, TX 78701')).toBeInTheDocument();
    unmount();

    render(<Harness method="check" invoiceNumber={null} onNotifyCheckIntent={jest.fn()} />);
    expect(screen.getByText(/write this invoice on the memo line/i)).toBeInTheDocument();
  });

  it('sends exactly one check notification, then says check expected and nothing paid', async () => {
    const { promise, resolve } = deferred<void>();
    const onNotifyCheckIntent = jest.fn(() => promise);
    render(<Harness method="check" onNotifyCheckIntent={onNotifyCheckIntent} />);

    const act1 = screen.getByRole('button', { name: 'I’ll mail a check' });
    fireEvent.click(act1);
    fireEvent.click(act1);
    expect(onNotifyCheckIntent).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('threshold-check-expected')).not.toBeInTheDocument();

    await act(async () => {
      resolve();
    });

    const record = await screen.findByTestId('threshold-check-expected');
    expect(record).toHaveClass('cp-record');
    expect(record).toHaveTextContent(
      'Check expectedJordan knows a check is coming. The balance stays $1,000.00 until the check arrives and is recorded. Nothing has been paid yet.',
    );
    expect(screen.queryByRole('button', { name: 'I’ll mail a check' })).not.toBeInTheDocument();
  });

  it('states a notify failure and leaves the act takeable again', async () => {
    const onNotifyCheckIntent = jest.fn().mockRejectedValue(new Error('Network unreachable'));
    render(<Harness method="check" onNotifyCheckIntent={onNotifyCheckIntent} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'I’ll mail a check' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to notify your designer.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Network unreachable');
    expect(screen.queryByTestId('threshold-check-expected')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I’ll mail a check' })).toBeEnabled();
  });

  it('locks every option while a pay-path mutation is in flight', () => {
    render(<Harness disabled onNotifyCheckIntent={jest.fn()} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const radio of radios) expect(radio).toBeDisabled();
  });
});
