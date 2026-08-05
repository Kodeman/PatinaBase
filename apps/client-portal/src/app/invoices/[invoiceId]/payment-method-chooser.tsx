'use client';

/**
 * Payment-method chooser for the client invoice detail page (migration
 * 00428). A 3-option accessible radiogroup — ACH (preferred), Card, Check —
 * plus the check panel's remit-to instructions and "let the designer know"
 * notification. Extracted so it's RTL-testable without the whole invoice
 * page; the page owns the `method` state and passes it down (controlled).
 *
 * Raw-element + CSS-var idiom to match the page it's colocated with — no
 * @patina/design-system import on this surface.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { achSurchargeCents, cardSurchargeCents, formatCurrency, CHECK_REMIT_FALLBACK } from '@patina/shared';

export type InvoicePaymentUIMethod = 'us_bank_account' | 'card' | 'check';

type NotifyState = 'idle' | 'pending' | 'sent' | 'error';

interface PaymentOption {
  value: InvoicePaymentUIMethod;
  label: string;
  badge?: string;
  /** null = not knowable yet (the studio's card fee is still loading). */
  feeCents: number | null;
}

export interface PaymentMethodChooserProps {
  method: InvoicePaymentUIMethod;
  onMethodChange: (method: InvoicePaymentUIMethod) => void;
  /** Invoice balance before any surcharge — the fee preview base. */
  balanceCents: number;
  currency: string;
  /**
   * The studio's configured card_surcharge_bps (get_invoice_payment_options),
   * or **null while it is still loading**. A null renders the card fee as a
   * placeholder rather than quoting the 3% platform default at a studio that
   * charges less. On a hard failure the caller passes the 300 fallback.
   */
  cardSurchargeBps: number | null;
  /** Any other pay-path mutation (Checkout, notify) is in flight — locks every option. */
  disabled?: boolean;
  designerName: string;
  invoiceNumber: string | null;
  /** Studio's check_remit_to; falls back to CHECK_REMIT_FALLBACK when unset. */
  checkRemitTo: string | null;
  /** Resolves/rejects the check-intent notification. Guarded below so a
   *  double-click can only ever invoke this once. */
  onNotifyCheckIntent: () => Promise<unknown>;
}

function feeLabel(cents: number | null, currency: string): string {
  // An em-dash, not a number: the fee is unknown, and a placeholder is honest
  // where a default would be a quote the studio never set.
  if (cents === null) return '—';
  return cents > 0 ? `+ ${formatCurrency(cents, currency)} processing fee` : 'No fee';
}

export function PaymentMethodChooser({
  method,
  onMethodChange,
  balanceCents,
  currency,
  cardSurchargeBps,
  disabled = false,
  designerName,
  invoiceNumber,
  checkRemitTo,
  onNotifyCheckIntent,
}: PaymentMethodChooserProps) {
  const [notifyState, setNotifyState] = useState<NotifyState>('idle');
  const [notifyError, setNotifyError] = useState<string | null>(null);

  const options: PaymentOption[] = [
    {
      value: 'us_bank_account',
      label: 'Bank transfer (ACH)',
      badge: 'Preferred · lowest fee',
      feeCents: achSurchargeCents(balanceCents),
    },
    {
      value: 'card',
      label: 'Card',
      feeCents:
        cardSurchargeBps === null ? null : cardSurchargeCents(balanceCents, cardSurchargeBps),
    },
    { value: 'check', label: 'Mail a check', feeCents: 0 },
  ];

  // Guarded re-entry: a second click while pending or after success is a
  // no-op, so a double-click can only ever send one notification.
  const handleCheckIntent = async () => {
    if (notifyState === 'pending' || notifyState === 'sent') return;
    setNotifyState('pending');
    setNotifyError(null);
    try {
      await onNotifyCheckIntent();
      setNotifyState('sent');
    } catch (err) {
      setNotifyState('error');
      setNotifyError(err instanceof Error ? err.message : 'Unable to notify your designer.');
    }
  };

  const remitTo = checkRemitTo?.trim() || CHECK_REMIT_FALLBACK;
  const notifyBusy = notifyState === 'pending' || notifyState === 'sent';

  return (
    <div className="mt-6">
      <p className="type-meta" id="invoice-payment-method-label">
        How would you like to pay?
      </p>
      <div
        role="radiogroup"
        aria-labelledby="invoice-payment-method-label"
        className="mt-3 grid gap-2 sm:grid-cols-3"
      >
        {options.map((option) => {
          const checked = method === option.value;
          return (
            <label
              key={option.value}
              className="flex min-h-[44px] cursor-pointer flex-col gap-1 rounded-md border p-3 transition"
              style={{
                borderColor: checked ? 'var(--accent-primary)' : 'var(--border-default)',
                background: checked ? 'var(--bg-surface)' : 'transparent',
                opacity: disabled ? 0.6 : 1,
              }}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="invoice-payment-method"
                  value={option.value}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onMethodChange(option.value)}
                  className="h-4 w-4"
                />
                <span className="type-label text-[var(--text-primary)]">{option.label}</span>
              </span>
              {option.badge && (
                <span className="type-meta-small text-[var(--accent-primary)]">
                  {option.badge}
                </span>
              )}
              <span
                className="type-meta-small text-[var(--text-muted)]"
                aria-live={option.feeCents === null ? 'polite' : undefined}
              >
                {option.value === 'check' ? 'No fee' : feeLabel(option.feeCents, currency)}
              </span>
            </label>
          );
        })}
      </div>

      {method === 'check' && (
        <div className="mt-4 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
          <p className="type-meta">Mail your payment to</p>
          <p className="type-body-small mt-1 whitespace-pre-line">{remitTo}</p>
          <p className="type-meta-small mt-2 text-[var(--text-muted)]">
            Write {invoiceNumber ? `invoice ${invoiceNumber}` : 'this invoice'} on the memo line.
          </p>
          <button
            type="button"
            onClick={() => void handleCheckIntent()}
            disabled={notifyBusy}
            className="type-meta mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-md border border-[var(--border-default)] px-4 transition hover:bg-[var(--bg-page,#fff)] disabled:opacity-60"
          >
            {notifyState === 'pending' && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            )}
            {notifyState === 'sent'
              ? `${designerName} has been notified`
              : `Let ${designerName} know a check is coming`}
          </button>
          {notifyState === 'sent' && (
            <p className="type-meta-small mt-2 text-[var(--text-muted)]" role="status">
              Thanks — {designerName} knows a check is on its way.
            </p>
          )}
          {notifyState === 'error' && notifyError && (
            <p
              className="type-meta-small mt-2"
              style={{ color: 'var(--color-terracotta, #C77B6E)' }}
              role="alert"
            >
              {notifyError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
