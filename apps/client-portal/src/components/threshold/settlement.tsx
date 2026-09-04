'use client';

import { useState } from 'react';

import {
  InvoiceCheckoutError,
  useInvoicePaymentOptions,
  useNotifyCheckIntent,
  useStartCheckout,
} from '@patina/supabase';
import {
  DEFAULT_CARD_SURCHARGE_BPS,
  formatCurrency,
  onlineSurchargeCents,
} from '@patina/shared';

import { SpineToll } from '@/components/making/spine-toll';
import { clientEvents } from '@/lib/analytics/events';
import type { InvoiceModel } from '@/lib/threshold/derive';

import {
  PaymentMethodChooser,
  type InvoicePaymentUIMethod,
} from './payment-method-chooser';

/* ── SETTLING, IN PLACE ──────────────────────────────────────────────────────
   The letter, opened: the three figures the toll has always drawn, the three
   ways to pay under them, and one act. Nothing leaves the page — the act claims
   a Checkout session and the browser goes to the till, which returns to this
   same address (`?checkout=…`) for the letterbox to read.

   The pay path is the invoice detail page's, verbatim in behaviour: ACH
   preferred, the studio's own card rate where it has one, a check panel that
   only tells the designer a check is coming, and one Checkout session per
   press. A failure is stated in the house's ink — never in red, never as a
   raw error where a sentence will do. ────────────────────────────────────── */

export interface SettlementProps {
  /** The open invoice standing in the letterbox. */
  invoice: InvoiceModel;
  /** The invoice's own currency — the figures are quoted in it. */
  currency: string;
  /** Who the check is coming to, in the client's own words for the studio. */
  designerName: string;
  today?: Date;
}

export function Settlement({ invoice, currency, designerName, today }: SettlementProps) {
  const [method, setMethod] = useState<InvoicePaymentUIMethod>('us_bank_account');
  const [payError, setPayError] = useState<string | null>(null);

  const paymentOptions = useInvoicePaymentOptions(invoice.id);
  const startCheckout = useStartCheckout();
  const notifyCheckIntent = useNotifyCheckIntent();

  // null ONLY while get_invoice_payment_options is in flight: previewing the
  // platform default there over-quotes every studio configured below 3%. A
  // resolved failure keeps the 300 fallback — over-quoting is survivable,
  // under-quoting is not.
  const cardSurchargeBps: number | null = paymentOptions.isPending
    ? null
    : (paymentOptions.data?.card_surcharge_bps ?? DEFAULT_CARD_SURCHARGE_BPS);
  // The ACH fee is a platform formula, so only the card preview is unknown
  // during that window.
  const surchargeKnown = method !== 'card' || cardSurchargeBps !== null;
  const surcharge =
    method === 'check'
      ? 0
      : onlineSurchargeCents(
          method,
          invoice.balanceCents,
          cardSurchargeBps ?? DEFAULT_CARD_SURCHARGE_BPS,
        );
  const chargeTotal = invoice.balanceCents + surcharge;

  const handleMethodChange = (next: InvoicePaymentUIMethod) => {
    setMethod(next);
    clientEvents.paymentMethodSelected({ invoiceId: invoice.id, method: next });
  };

  const handleNotifyCheckIntent = async () => {
    clientEvents.checkIntentSubmitted({ invoiceId: invoice.id });
    await notifyCheckIntent.mutateAsync({ invoiceId: invoice.id });
  };

  const handleSettle = async () => {
    // One press, at most one Checkout session: a second press while the first
    // is still being claimed, or with the check panel open, does nothing.
    if (startCheckout.isPending || method === 'check') return;
    setPayError(null);
    try {
      const receipt = await startCheckout.mutateAsync({
        invoiceId: invoice.id,
        paymentMethod: method,
      });
      clientEvents.paymentStarted({
        invoiceId: invoice.id,
        amountCents: receipt.amount_cents,
        paymentMethod: method,
        surchargeCents: receipt.surcharge_cents,
      });
      window.location.href = receipt.url;
    } catch (err) {
      if (err instanceof InvoiceCheckoutError && err.code === 'payment_reconciliation_required') {
        setPayError(
          'This invoice has a payment that needs review. Do not submit another payment; your designer will follow up.',
        );
        return;
      }
      setPayError(err instanceof Error ? err.message : 'Unable to start payment.');
    }
  };

  return (
    <div data-testid="settlement">
      <SpineToll
        invoiceId={invoice.id}
        invoiceNumber={invoice.number}
        totalCents={invoice.totalCents}
        paidCents={invoice.paidCents}
        dueDate={invoice.dueDate}
        today={today}
        settle={{
          onSettle: () => void handleSettle(),
          pending: startCheckout.isPending,
          disabled: method === 'check' || invoice.balanceCents <= 0 || !surchargeKnown,
        }}
      >
        <PaymentMethodChooser
          method={method}
          onMethodChange={handleMethodChange}
          balanceCents={invoice.balanceCents}
          currency={currency}
          cardSurchargeBps={cardSurchargeBps}
          disabled={startCheckout.isPending}
          designerName={designerName}
          invoiceNumber={invoice.number}
          checkRemitTo={paymentOptions.data?.check_remit_to ?? null}
          onNotifyCheckIntent={handleNotifyCheckIntent}
        />

        {method !== 'check' && surchargeKnown && surcharge > 0 && (
          <p
            data-testid="settlement-charge"
            className="mt-2 text-[15px] leading-[1.62] text-[var(--text-body)]"
          >
            {`You will be charged ${formatCurrency(chargeTotal, currency)} — the balance and a ${formatCurrency(
              surcharge,
              currency,
            )} processing fee.`}
          </p>
        )}
      </SpineToll>

      {payError && (
        <p
          role="alert"
          data-testid="settlement-error"
          className="mt-2 max-w-[46ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          {payError}
        </p>
      )}
    </div>
  );
}
