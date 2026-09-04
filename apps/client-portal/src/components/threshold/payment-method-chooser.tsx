'use client';

import { useState } from 'react';

import {
  achSurchargeCents,
  cardSurchargeCents,
  formatCurrency,
  CHECK_REMIT_FALLBACK,
} from '@patina/shared';

import { ScoredAction } from '@/components/threshold/instruments/scored-action';
import { refusalSentence } from '@/lib/threshold/refusal';

/* ── HOW SHE WOULD LIKE TO PAY ───────────────────────────────────────────────
   The invoice page's chooser (migration 00428), brought inside the letterbox:
   the same three ways to pay, the same fee arithmetic, the same check panel and
   the same words. What changed is the chrome — hairlines and typography instead
   of plates and rounded borders — because it now stands on the house's own
   paper.

   The card fee is `null`, and draws as an em dash, only while the studio's
   configured rate is still coming. A placeholder is honest where the platform
   default would quote a number the studio never set. ─────────────────────── */

export type InvoicePaymentUIMethod = 'us_bank_account' | 'card' | 'check';

type NotifyState = 'idle' | 'pending' | 'sent' | 'error';

interface PaymentOption {
  value: InvoicePaymentUIMethod;
  label: string;
  aside?: string;
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
   * or null while it is still loading. On a hard failure the caller passes the
   * 300 fallback: over-quoting is survivable, under-quoting is not.
   */
  cardSurchargeBps: number | null;
  /** Another pay-path mutation is in flight — locks every option. */
  disabled?: boolean;
  designerName: string;
  invoiceNumber: string | null;
  /** Studio's check_remit_to; falls back to CHECK_REMIT_FALLBACK when unset. */
  checkRemitTo: string | null;
  /** Resolves/rejects the check-intent notification; guarded to fire once. */
  onNotifyCheckIntent: () => Promise<unknown>;
}

function feeLabel(cents: number | null, currency: string): string {
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
      aside: 'Preferred · lowest fee',
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

  // Guarded re-entry: a second press while pending, or after it has been sent,
  // is a no-op — a double-click can only ever send one notification.
  const handleCheckIntent = async () => {
    if (notifyState === 'pending' || notifyState === 'sent') return;
    setNotifyState('pending');
    setNotifyError(null);
    try {
      await onNotifyCheckIntent();
      setNotifyState('sent');
    } catch (err) {
      setNotifyState('error');
      setNotifyError(refusalSentence(err, 'Unable to notify your designer.'));
    }
  };

  const remitTo = checkRemitTo?.trim() || CHECK_REMIT_FALLBACK;
  const notifyBusy = notifyState === 'pending' || notifyState === 'sent';

  return (
    <div className="mt-4" data-testid="threshold-payment-methods">
      <p
        id="threshold-payment-method-label"
        className="mb-1.5 font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]"
      >
        How would you like to pay?
      </p>

      <div role="radiogroup" aria-labelledby="threshold-payment-method-label">
        {options.map((option) => {
          const checked = method === option.value;
          return (
            <label
              key={option.value}
              data-method={option.value}
              data-checked={checked ? 'true' : undefined}
              className="flex min-h-[44px] cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-[var(--border-subtle)] py-2.5 last:border-b"
              style={{ opacity: disabled ? 0.6 : 1 }}
            >
              <input
                type="radio"
                name="threshold-payment-method"
                value={option.value}
                checked={checked}
                disabled={disabled}
                onChange={() => onMethodChange(option.value)}
                className="h-3.5 w-3.5 self-center"
              />
              <span className="text-[15px] leading-[1.62] text-[var(--text-primary)]">
                {option.label}
              </span>
              {option.aside && (
                <span className="text-[15px] leading-[1.62] text-[var(--text-body)]">
                  {option.aside}
                </span>
              )}
              <span
                className="ml-auto font-mono text-[11.5px] tracking-[0.04em] text-[var(--text-muted)]"
                aria-live={option.feeCents === null ? 'polite' : undefined}
              >
                {option.value === 'check' ? 'No fee' : feeLabel(option.feeCents, currency)}
              </span>
            </label>
          );
        })}
      </div>

      {method === 'check' && (
        <div className="mt-3.5" data-testid="threshold-check-panel">
          <p className="font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]">
            Mail your payment to
          </p>
          <p className="mt-1 whitespace-pre-line text-[15px] leading-[1.62] text-[var(--text-body)]">
            {remitTo}
          </p>
          <p className="mt-1.5 text-[15px] leading-[1.62] text-[var(--text-body)]">
            Write {invoiceNumber ? `invoice ${invoiceNumber}` : 'this invoice'} on the memo line.
          </p>

          <div className="mt-2">
            <ScoredAction
              actionKey="check_intent"
              regionKey="letterbox"
              surfaceKey="the_threshold"
              variant="secondary"
              disabled={notifyBusy}
              loading={notifyState === 'pending'}
              onClick={() => void handleCheckIntent()}
            >
              {notifyState === 'sent'
                ? `${designerName} has been notified`
                : `Let ${designerName} know a check is coming`}
            </ScoredAction>
          </div>

          {notifyState === 'sent' && (
            <p
              role="status"
              className="mt-1.5 text-[15px] leading-[1.62] text-[var(--text-body)]"
            >
              Thanks — {designerName} knows a check is on its way.
            </p>
          )}
          {notifyState === 'error' && notifyError && (
            <p role="alert" className="mt-1.5 text-[15px] leading-[1.62] text-[var(--text-body)]">
              {notifyError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
