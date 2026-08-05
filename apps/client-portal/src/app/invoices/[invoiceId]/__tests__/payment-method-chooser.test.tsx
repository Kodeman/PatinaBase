/**
 * PaymentMethodChooser (migration 00428) — the client invoice detail page's
 * ACH / Card / Check radiogroup + check-intent panel.
 *
 * Covers:
 *   - fee-preview math per option, including the ACH $5 cap and a non-default
 *     card bps, and toggling between options;
 *   - check panel remit-to: studio-configured copy and the CHECK_REMIT_FALLBACK;
 *   - the check-intent button's re-entry guard — a double click (or a click
 *     after success) sends exactly one notification, matching the money-UI
 *     "one click, at most one" rule the Pay button also follows;
 *   - every radio disables while `disabled` (a pay-path mutation in flight).
 */

import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PaymentMethodChooser, type InvoicePaymentUIMethod } from '../payment-method-chooser';

/** Manually-resolvable promise — holds the intent await open mid-interaction. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type HarnessProps = {
  method?: InvoicePaymentUIMethod;
  balanceCents?: number;
  currency?: string;
  /** null models "the studio's card fee is still loading". */
  cardSurchargeBps?: number | null;
  disabled?: boolean;
  designerName?: string;
  invoiceNumber?: string | null;
  checkRemitTo?: string | null;
  onNotifyCheckIntent: () => Promise<unknown>;
  onMethodChange?: (method: InvoicePaymentUIMethod) => void;
};

/** Controlled-component harness — mirrors how the invoice page owns `method`. */
function Harness({
  method,
  balanceCents = 100_000,
  currency = 'USD',
  cardSurchargeBps = 300,
  disabled = false,
  designerName = 'Jordan',
  invoiceNumber = 'INV-1042',
  checkRemitTo = null,
  onNotifyCheckIntent,
  onMethodChange,
}: HarnessProps) {
  const [current, setCurrent] = useState<InvoicePaymentUIMethod>(method ?? 'us_bank_account');
  return (
    <PaymentMethodChooser
      method={current}
      onMethodChange={(next) => {
        setCurrent(next);
        onMethodChange?.(next);
      }}
      balanceCents={balanceCents}
      currency={currency}
      cardSurchargeBps={cardSurchargeBps}
      disabled={disabled}
      designerName={designerName}
      invoiceNumber={invoiceNumber}
      checkRemitTo={checkRemitTo}
      onNotifyCheckIntent={onNotifyCheckIntent}
    />
  );
}

describe('PaymentMethodChooser', () => {
  it('previews the ACH cap and a non-default card bps, and toggling switches the checked option', () => {
    // balance $1,000: ACH formula (0.8%) would be $8.00 — capped to $5.00.
    // Card @ 250bps (non-default 300) = $25.00 exactly.
    render(
      <Harness balanceCents={100_000} cardSurchargeBps={250} onNotifyCheckIntent={jest.fn()} />,
    );

    expect(screen.getByRole('radio', { name: /bank transfer \(ach\)/i })).toBeChecked();
    expect(screen.getByText('+ $5.00 processing fee')).toBeInTheDocument();
    expect(screen.getByText('+ $25.00 processing fee')).toBeInTheDocument();
    expect(screen.getByText('Preferred · lowest fee')).toBeInTheDocument();

    const checkRadio = screen.getByRole('radio', { name: /^mail a check/i });
    expect(screen.getByRole('radio', { name: /^card/i })).not.toBeChecked();
    expect(checkRadio).not.toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: /^card/i }));
    expect(screen.getByRole('radio', { name: /^card/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /bank transfer \(ach\)/i })).not.toBeChecked();

    fireEvent.click(checkRadio);
    expect(checkRadio).toBeChecked();
    // The check panel appears only once "Mail a check" is selected.
    expect(screen.getByText('Mail your payment to')).toBeInTheDocument();
  });

  it('placeholders the card fee while the studio bps is still loading, but not the ACH fee', () => {
    // Quoting the 3% platform default here would over-quote every studio
    // configured lower. The ACH fee is a platform formula, so it is exact
    // immediately and must NOT be placeholdered.
    render(<Harness balanceCents={100_000} cardSurchargeBps={null} onNotifyCheckIntent={jest.fn()} />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('+ $30.00 processing fee')).not.toBeInTheDocument();
    expect(screen.getByText('+ $5.00 processing fee')).toBeInTheDocument();
  });

  it('shows a sub-cap ACH fee computed from the formula, not always the cap', () => {
    // balance $50: ACH 0.8% = 40 cents, well under the $5 cap.
    render(<Harness balanceCents={5_000} onNotifyCheckIntent={jest.fn()} />);
    expect(screen.getByText('+ $0.40 processing fee')).toBeInTheDocument();
  });

  it('shows the platform fallback remit-to copy when the studio has none configured', () => {
    render(
      <Harness method="check" checkRemitTo={null} invoiceNumber="INV-2077" onNotifyCheckIntent={jest.fn()} />,
    );
    expect(screen.getByText('Contact your designer for mailing details')).toBeInTheDocument();
    expect(screen.getByText(/write invoice inv-2077 on the memo line/i)).toBeInTheDocument();
  });

  it('shows the studio-configured remit-to address when one is set', () => {
    render(
      <Harness
        method="check"
        checkRemitTo={'Acme Design Co\n123 Main St\nAustin, TX 78701'}
        onNotifyCheckIntent={jest.fn()}
      />,
    );
    expect(
      screen.getByText('Acme Design Co 123 Main St Austin, TX 78701'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Contact your designer for mailing details')).not.toBeInTheDocument();
  });

  it('falls back to generic memo-line copy when the invoice has no number yet', () => {
    render(<Harness method="check" invoiceNumber={null} onNotifyCheckIntent={jest.fn()} />);
    expect(screen.getByText(/write this invoice on the memo line/i)).toBeInTheDocument();
  });

  it('guards the check-intent button: a double click sends exactly one notification, and a click after success is also a no-op', async () => {
    const { promise, resolve } = deferred<void>();
    const onNotifyCheckIntent = jest.fn(() => promise);
    render(
      <Harness method="check" designerName="Jordan" onNotifyCheckIntent={onNotifyCheckIntent} />,
    );

    const button = screen.getByRole('button', { name: /let jordan know a check is coming/i });
    fireEvent.click(button);
    // Second click lands while the first is still pending — the button is now
    // disabled, so this is a no-op at the DOM level (matches the Pay button's
    // busy-gate re-entry guard).
    fireEvent.click(button);
    expect(onNotifyCheckIntent).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve();
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      /jordan knows a check is on its way/i,
    );

    // A click on the now-"sent" button is also a no-op.
    fireEvent.click(screen.getByRole('button', { name: /jordan has been notified/i }));
    expect(onNotifyCheckIntent).toHaveBeenCalledTimes(1);
  });

  it('surfaces a notify failure without leaving the button stuck disabled', async () => {
    const onNotifyCheckIntent = jest.fn().mockRejectedValue(new Error('Network unreachable'));
    render(<Harness method="check" onNotifyCheckIntent={onNotifyCheckIntent} />);
    const button = screen.getByRole('button', { name: /let .+ know a check is coming/i });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unreachable');
    expect(button).not.toBeDisabled();
  });

  it('disables every radio while a pay-path mutation is in flight', () => {
    render(<Harness disabled onNotifyCheckIntent={jest.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio).toBeDisabled();
    }
  });
});
