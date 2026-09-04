/**
 * The letterbox's copy of the ACH / Card / Check chooser (migration 00428).
 * The arithmetic and the words are the invoice page's; only the chrome moved,
 * so the cases that guard the money are the same cases.
 */

import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
  clientEvents: {},
}));

import {
  PaymentMethodChooser,
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
  disabled?: boolean;
  designerName?: string;
  invoiceNumber?: string | null;
  checkRemitTo?: string | null;
  onNotifyCheckIntent: () => Promise<unknown>;
};

function Harness({
  method,
  balanceCents = 100_000,
  cardSurchargeBps = 300,
  disabled = false,
  designerName = 'Jordan',
  invoiceNumber = 'INV-1042',
  checkRemitTo = null,
  onNotifyCheckIntent,
}: HarnessProps) {
  const [current, setCurrent] = useState<InvoicePaymentUIMethod>(method ?? 'us_bank_account');
  return (
    <PaymentMethodChooser
      method={current}
      onMethodChange={setCurrent}
      balanceCents={balanceCents}
      currency="USD"
      cardSurchargeBps={cardSurchargeBps}
      disabled={disabled}
      designerName={designerName}
      invoiceNumber={invoiceNumber}
      checkRemitTo={checkRemitTo}
      onNotifyCheckIntent={onNotifyCheckIntent}
    />
  );
}

describe('PaymentMethodChooser — in the letterbox', () => {
  it('previews the ACH cap and a non-default card bps, and toggling switches the checked option', () => {
    render(
      <Harness balanceCents={100_000} cardSurchargeBps={250} onNotifyCheckIntent={jest.fn()} />,
    );

    expect(screen.getByRole('radio', { name: /bank transfer \(ach\)/i })).toBeChecked();
    expect(screen.getByText('+ $5.00 processing fee')).toBeInTheDocument();
    expect(screen.getByText('+ $25.00 processing fee')).toBeInTheDocument();
    expect(screen.getByText('Preferred · lowest fee')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /^card/i }));
    expect(screen.getByRole('radio', { name: /^card/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /bank transfer \(ach\)/i })).not.toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: /^mail a check/i }));
    expect(screen.getByTestId('threshold-check-panel')).toBeInTheDocument();
  });

  it('placeholders the card fee while the studio bps is still coming, but not the ACH fee', () => {
    render(
      <Harness balanceCents={100_000} cardSurchargeBps={null} onNotifyCheckIntent={jest.fn()} />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('+ $30.00 processing fee')).not.toBeInTheDocument();
    expect(screen.getByText('+ $5.00 processing fee')).toBeInTheDocument();
  });

  it('computes a sub-cap ACH fee from the formula rather than always the cap', () => {
    render(<Harness balanceCents={5_000} onNotifyCheckIntent={jest.fn()} />);
    expect(screen.getByText('+ $0.40 processing fee')).toBeInTheDocument();
  });

  it('falls back to the platform remit-to, and names the invoice on the memo line', () => {
    render(
      <Harness
        method="check"
        checkRemitTo={null}
        invoiceNumber="INV-2077"
        onNotifyCheckIntent={jest.fn()}
      />,
    );

    expect(screen.getByText('Contact your designer for mailing details')).toBeInTheDocument();
    expect(screen.getByText(/write invoice inv-2077 on the memo line/i)).toBeInTheDocument();
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

  it('sends exactly one check notification, however many times it is pressed', async () => {
    const { promise, resolve } = deferred<void>();
    const onNotifyCheckIntent = jest.fn(() => promise);
    render(
      <Harness method="check" designerName="Jordan" onNotifyCheckIntent={onNotifyCheckIntent} />,
    );

    const act1 = screen.getByRole('button', { name: /let jordan know a check is coming/i });
    fireEvent.click(act1);
    fireEvent.click(act1);
    expect(onNotifyCheckIntent).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve();
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      /jordan knows a check is on its way/i,
    );

    fireEvent.click(screen.getByRole('button', { name: /jordan has been notified/i }));
    expect(onNotifyCheckIntent).toHaveBeenCalledTimes(1);
  });

  it('states a notify failure and leaves the act takeable again', async () => {
    const onNotifyCheckIntent = jest.fn().mockRejectedValue(new Error('Network unreachable'));
    render(<Harness method="check" onNotifyCheckIntent={onNotifyCheckIntent} />);

    const notify = screen.getByRole('button', { name: /let .+ know a check is coming/i });
    await act(async () => {
      fireEvent.click(notify);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Network unreachable');
    expect(screen.getByRole('button', { name: /let .+ know a check is coming/i })).not.toBeDisabled();
  });

  it('locks every option while a pay-path mutation is in flight', () => {
    render(<Harness disabled onNotifyCheckIntent={jest.fn()} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const radio of radios) expect(radio).toBeDisabled();
  });
});
