'use client';

import { useRef, useState } from 'react';

import {
  InvoiceCheckoutError,
  useInvoicePaymentOptions,
  useNotifyCheckIntent,
  useStartCheckout,
} from '@patina/supabase';
import { formatCurrency } from '@patina/shared';

import { SpineToll } from '@/components/threshold/instruments/spine-toll';
import { clientEvents } from '@/lib/analytics/events';
import type { InvoiceRow, InvoiceServerHold } from '@/lib/threshold/invoice-rollup';
import { refusalSentence } from '@/lib/threshold/refusal';

import {
  METHOD_PHRASE,
  methodQuote,
  PaymentMethodChooser,
  sentenceStart,
  type CardFeeState,
  type InvoicePaymentUIMethod,
} from './payment-method-chooser';

/* ── THE PAYMENT SHEET, IN PLACE (US-45 CPUX-03) ─────────────────────────────
   One payable invoice, opened: its figures on a framed card, the ways to pay
   with their full totals, the consequence sentence in a green note, and one
   forest act carrying the amount. The act claims a Checkout session and the
   browser goes to the till, which returns to this address (`?checkout=…`) for
   the letterbox to read — and confirms nothing by returning.

   The pay path is unchanged in behaviour: bank transfer by default, the
   studio's own card rate only once the server has answered it, a check panel
   that only tells the designer a check is coming, and one Checkout session
   per press. The two holds the boundary can answer are standing facts, not
   failures, and they are handed up by invoice id so closing the sheet cannot
   forget them. ─────────────────────────────────────────────────────────── */

const CONSEQUENCE =
  'The next screen shows the amount and asks you to confirm. Nothing is charged until you confirm there. Opening these details or choosing a method doesn’t pay anything.';

const HELP = 'Contact your designer using the phone number or email you already use.';

/** What a hold returned by the checkout boundary means for her money. */
export function holdSentence(hold: InvoiceServerHold, designerName: string): string {
  if (hold === 'payment_processing') {
    return 'Your payment provider is still processing this payment. The balance updates only when the payment is confirmed. You don’t need to pay again.';
  }
  return `We couldn’t confirm what happened with this invoice’s last payment. It’s on hold until it’s checked, so it can’t be paid again here. ${sentenceStart(designerName)} can help. ${HELP}`;
}

export interface SettlementProps {
  /** The payable invoice, as the projection reads it. */
  row: InvoiceRow;
  /** The designer the check acknowledgement and any hold refer to. */
  designerName: string;
  /** The studio the money is payable to, from this invoice's own row. */
  payeeName: string;
  /**
   * Hold the act. The letterbox raises this while a return from the till is
   * still unconfirmed, so a second attempt cannot start in that window.
   */
  hold?: boolean;
  /** A hold the checkout boundary already returned for this invoice. */
  serverHold?: InvoiceServerHold | null;
  /** Hands a returned hold up, keyed by the owner to this invoice's id. */
  onHold?: (hold: InvoiceServerHold) => void;
  /** The studio already knows a check is coming for this invoice. */
  checkExpected?: boolean;
  onCheckExpected?: () => void;
  /** Re-read the invoices after an attempt that ended in a fact, not a session. */
  onRefetch?: () => void | Promise<unknown>;
}

const HOLD_CODES: readonly InvoiceServerHold[] = [
  'payment_processing',
  'payment_reconciliation_required',
];

function heldCode(err: unknown): InvoiceServerHold | null {
  if (!(err instanceof InvoiceCheckoutError)) return null;
  const code = HOLD_CODES.find(
    (candidate) => candidate === err.code,
  );
  return code ?? null;
}

function cardFeeStateOf(options: ReturnType<typeof useInvoicePaymentOptions>): CardFeeState {
  const resolved = !options.isError && options.data?.card_surcharge_resolved === true;
  if (resolved) return 'resolved';
  return options.isPending || options.isFetching ? 'loading' : 'unavailable';
}

export function Settlement({
  row,
  designerName,
  payeeName,
  hold = false,
  serverHold = null,
  onHold,
  checkExpected = false,
  onCheckExpected,
  onRefetch,
}: SettlementProps) {
  const { invoice, balanceCents, currency } = row;
  const [method, setMethod] = useState<InvoicePaymentUIMethod>('us_bank_account');
  const [payError, setPayError] = useState<string | null>(null);
  // Kept here as well as handed up, so the sheet never offers a second charge
  // while the owner's projection catches up.
  const [localHold, setLocalHold] = useState<InvoiceServerHold | null>(null);
  const [localCheckExpected, setLocalCheckExpected] = useState(false);
  // State lands after the render; the ref closes a second press in the same tick.
  const starting = useRef(false);

  const paymentOptions = useInvoicePaymentOptions(invoice.id);
  const startCheckout = useStartCheckout();
  const notifyCheckIntent = useNotifyCheckIntent();

  const cardFeeState = cardFeeStateOf(paymentOptions);
  const cardSurchargeBps =
    cardFeeState === 'resolved' ? (paymentOptions.data?.card_surcharge_bps ?? null) : null;
  const quote = methodQuote(method, balanceCents, cardSurchargeBps);
  const activeHold = serverHold ?? localHold;
  const expected = checkExpected || localCheckExpected;

  const handleMethodChange = (next: InvoicePaymentUIMethod) => {
    setMethod(next);
    clientEvents.paymentMethodSelected({ invoiceId: invoice.id, method: next });
  };

  const handleNotifyCheckIntent = async () => {
    clientEvents.checkIntentSubmitted({ invoiceId: invoice.id });
    await notifyCheckIntent.mutateAsync({ invoiceId: invoice.id });
  };

  const handleCheckExpected = () => {
    setLocalCheckExpected(true);
    onCheckExpected?.();
  };

  const handleSettle = async () => {
    // One press, at most one Checkout session: a second press while the first
    // is being claimed, with the check panel open, or without a confirmed
    // total, does nothing.
    if (starting.current || startCheckout.isPending || method === 'check' || !quote) return;
    if (hold || activeHold) return;
    starting.current = true;
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
      // The page is leaving for the till; the guard stays closed behind it.
      window.location.href = receipt.url;
    } catch (err) {
      const code = heldCode(err);
      if (code) {
        // A payment already clearing, or one that needs checking, is a
        // standing fact about her money — never the failure voice, and never
        // an invitation to pay again.
        setLocalHold(code);
        onHold?.(code);
        await onRefetch?.();
        return;
      }
      starting.current = false;
      // Every other cause reads in the house's words, never a raw error.
      setPayError(refusalSentence(err, 'Unable to start payment.'));
    }
  };

  if (activeHold) {
    return (
      <div data-testid="settlement">
        <SpineToll
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoice_number}
          totalCents={invoice.total_cents}
          paidCents={invoice.amount_paid_cents}
          dueDate={invoice.due_date}
          dueState={row.dueState}
          currency={currency}
          payee={payeeName}
          settle={null}
        >
          <p
            role="status"
            data-testid="settlement-hold"
            data-hold={activeHold}
            className="cp-note text-[16px] leading-[1.55]"
          >
            {holdSentence(activeHold, designerName)}
          </p>
        </SpineToll>
      </div>
    );
  }

  const online = method !== 'check';
  const total = quote ? formatCurrency(quote.totalCents, currency) : null;

  return (
    <div data-testid="settlement">
      <SpineToll
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoice_number}
        totalCents={invoice.total_cents}
        paidCents={invoice.amount_paid_cents}
        dueDate={invoice.due_date}
        dueState={row.dueState}
        currency={currency}
        payee={payeeName}
        settle={
          online
            ? {
                label: total
                  ? `Continue to secure payment · ${total}`
                  : 'Continue to secure payment',
                onSettle: () => void handleSettle(),
                pending: startCheckout.isPending,
                unavailableReason: unavailableReason(hold, total),
              }
            : null
        }
      >
        <PaymentMethodChooser
          method={method}
          onMethodChange={handleMethodChange}
          balanceCents={balanceCents}
          currency={currency}
          cardSurchargeBps={cardSurchargeBps}
          cardFeeState={cardFeeState}
          onRetryCardFee={() => void paymentOptions.refetch()}
          disabled={startCheckout.isPending || notifyCheckIntent.isPending}
          designerName={designerName}
          payeeName={payeeName}
          invoiceNumber={invoice.invoice_number}
          checkRemitTo={paymentOptions.data?.check_remit_to ?? null}
          checkExpected={expected}
          onNotifyCheckIntent={handleNotifyCheckIntent}
          onCheckExpected={handleCheckExpected}
        />

        {online && total && (
          <p
            data-testid="settlement-charge"
            className="flex flex-wrap items-baseline justify-between gap-x-3 text-[16px] leading-[1.5] text-[var(--text-primary)]"
          >
            <span>Total with {METHOD_PHRASE[method]}</span>
            <span className="font-mono text-[18px] tabular-nums">{total}</span>
          </p>
        )}

        {online && (
          <p data-testid="settlement-consequence" className="cp-note text-[15px] leading-[1.55]">
            {CONSEQUENCE}
          </p>
        )}

        {payError && (
          <p
            role="alert"
            data-testid="settlement-error"
            className="max-w-[56ch] text-[15px] leading-[1.55] text-[var(--text-primary)]"
          >
            {payError}
          </p>
        )}
      </SpineToll>
    </div>
  );
}

function unavailableReason(hold: boolean, total: string | null): string | undefined {
  if (hold) {
    return 'Paying is paused until Patina confirms what happened at checkout. Do not submit another payment until the status is known.';
  }
  if (!total) return 'Card payment is unavailable until the card fee loads.';
  return undefined;
}
