"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatCurrency, onlineSurchargeCents } from "@patina/shared";

import { payLinkEvents } from "@/lib/analytics/events";
import { refusalSentence } from "@/lib/threshold/refusal";
import {
  useCheckoutConfirmation,
  useCheckoutReturn,
} from "@/lib/threshold/checkout-return";

import {
  PaymentMethodChooser,
  type InvoicePaymentUIMethod,
} from "./payment-method-chooser";
import type {
  InvoiceLinkPayload,
  InvoiceLinkPayment,
  InvoiceLinkStatus,
} from "./invoice-link";

/* ── THE STATEMENT ───────────────────────────────────────────────────────────
   One sheet: the record on the left, the money in a column beside it, and a
   single hairline rule between them doing the only structural work on the page
   — it is the line between the record and the till.

   DOM order is the PHONE's — title, money, record — and the desktop grid only
   places the column to the right. So tab order and screen-reader order always
   run money-first and never disagree with what a phone reader sees.

   Status is said, never coloured. Overdue reads "Past due · 22 days" in the
   same ink as everything else (Vision §6 bans red/green status).

   The surcharge never prints on an unpaid sheet: a fee that depends on a
   choice the reader has not made is not part of what is owed. A PAID sheet
   prints the charged figure on the payment row, because that is a fact.
   ───────────────────────────────────────────────────────────────────────── */

const SHEET_RULES = `
/* D-1 — the act's inks, as tokens rather than a literal. The mockup's
   --btn-bg-hover is #1F1D1A in light and #FFFAF0 in dark; the hardcoded
   literal was the light value, which would have gone dark-on-dark the moment
   dark mode was exercised on the page's only payment control. Keyed on the
   portal's own darkMode strategy (tailwind.config.ts: darkMode: ['class']),
   NOT on prefers-color-scheme — nothing in this portal defines dark values for
   --text-primary and friends yet, so flipping the button alone on a system
   preference would be the regression, not the fix. */
[data-pay-sheet] {
  --pay-act-bg: var(--color-charcoal);
  --pay-act-fg: var(--color-off-white);
  --pay-act-bg-hover: #1F1D1A;
}
.dark [data-pay-sheet] {
  --pay-act-bg: #F0E9DD;
  --pay-act-fg: #1D1914;
  --pay-act-bg-hover: #FFFAF0;
}
[data-pay-print="only"] { display: none; }
@media print {
  @page { size: letter; margin: 0.5in; }
  [data-pay-desk] { padding: 0; display: block; }
  [data-pay-sheet] { max-width: none; border: 0; padding: 0; gap: 20px; }
  [data-pay-grid] { display: block; }
  [data-pay-money], [data-pay-record] {
    border-left: 0; padding-left: 0; padding-right: 0; display: block;
  }
  [data-pay-money] > * + *, [data-pay-record] > * + * { margin-top: 22px; }
  [data-pay-print="hide"] { display: none !important; }
  [data-pay-print="only"] { display: block !important; }
  [data-pay-line], [data-pay-payment] { break-inside: avoid; }
}
`;

const longDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function formatLongDate(value: string): string {
  const parsed = Date.parse(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(parsed)) return value;
  return longDate.format(new Date(parsed));
}

function formatShortDate(value: string): string {
  const parsed = Date.parse(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(parsed)) return value;
  return shortDate.format(new Date(parsed));
}

/** Whole days since the due date passed, or null while it has not. */
export function daysPastDue(
  dueDate: string | null,
  now: number = Date.now(),
): number | null {
  if (!dueDate) return null;
  const due = Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(due)) return null;
  const days = Math.floor((now - due) / 86_400_000);
  return days >= 1 ? days : null;
}

const PAYMENT_METHOD_WORDS: Record<string, string> = {
  ach: "Bank transfer",
  bank_transfer: "Bank transfer",
  card: "Card",
  stripe: "Card",
  check: "Check",
  cash: "Cash",
  wire: "Wire transfer",
};

function paymentLabel(payment: InvoiceLinkPayment): string {
  if (payment.rail === "us_bank_account") return "Bank transfer";
  if (payment.rail === "card") return "Card";
  const method = payment.method?.toLowerCase() ?? "";
  return PAYMENT_METHOD_WORDS[method] ?? "Payment";
}

/** What the sheet re-reads from `state` while it waits for a return to settle. */
interface PayLinkLiveState {
  status: InvoiceLinkStatus;
  amount_paid_cents: number;
  balance_cents: number;
  payments: InvoiceLinkPayment[];
}

function readLiveState(value: unknown): PayLinkLiveState | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const { status, amount_paid_cents, balance_cents, payments } = record;
  if (status !== "sent" && status !== "partially_paid" && status !== "paid")
    return null;
  if (
    typeof amount_paid_cents !== "number" ||
    typeof balance_cents !== "number"
  )
    return null;
  if (!Array.isArray(payments)) return null;
  return {
    status,
    amount_paid_cents,
    balance_cents,
    payments: payments as InvoiceLinkPayment[],
  };
}

export interface InvoiceSheetProps {
  token: string;
  payload: InvoiceLinkPayload;
}

export function InvoiceSheet({ token, payload }: InvoiceSheetProps) {
  const { invoice, studio, payment_options: paymentOptions } = payload;

  const [method, setMethod] =
    useState<InvoicePaymentUIMethod>("us_bank_account");
  const [live, setLive] = useState<PayLinkLiveState | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [checkNotified, setCheckNotified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  const status = live?.status ?? invoice.status;
  const amountPaidCents = live?.amount_paid_cents ?? invoice.amount_paid_cents;
  const balanceCents = live?.balance_cents ?? invoice.balance_cents;
  const payments = live?.payments ?? payload.payments;
  const processing = live
    ? live.payments.some((entry) => entry.status === "pending")
    : payload.pay.processing;

  const currency = invoice.currency;
  // M-5: a $0.00 invoice that was never paid would otherwise read "Paid in
  // full" with a null paid_at and an empty payments list.
  const paid = balanceCents <= 0 && invoice.total_cents > 0;
  const overdueDays = daysPastDue(invoice.due_date);

  // The sheet's own re-read, polled while a return waits to be confirmed. It
  // never records a view (`p_record_view=false` server-side), so a poll cannot
  // inflate the link's view count.
  const refetchState = useCallback(async () => {
    try {
      const response = await fetch(`/pay/${token}/state`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      setLive(readLiveState(await response.json()));
    } catch {
      // A failed poll is not news; the next tick tries again.
    }
  }, [token]);

  // `''` — this page is one sheet with no sections, so the cleaned address
  // keeps no anchor. The house's two-section default belongs to the house.
  const checkoutReturn = useCheckoutReturn("");
  const returnedSettled = checkoutReturn?.outcome === "settled";
  const returnedCancelled = checkoutReturn?.outcome === "unchanged";
  // Money moved when the balance is gone OR a row is pending: an ACH debit in
  // flight is the studio's evidence, days before it clears.
  const confirmState = useCheckoutConfirmation(
    returnedSettled,
    paid || processing,
    refetchState,
  );

  const surchargeCents =
    method === "check"
      ? 0
      : onlineSurchargeCents(
          method,
          balanceCents,
          paymentOptions.card_surcharge_bps,
        );
  const totalToPayCents = balanceCents + surchargeCents;

  // While Checkout's answer is still coming, the page must not offer a second
  // one — "don't send another one until this settles" is the whole point of
  // the sentence it is showing.
  const showChooser = !paid && !processing && confirmState === null;

  const designerName = payload.designer_display_name?.trim() ?? "";
  const designerFirst = designerName.split(/\s+/)[0] || "your designer";
  const studioName = studio.name?.trim() || "the studio";
  const invoiceLabel = invoice.number
    ? `Invoice No. ${invoice.number}`
    : "Invoice";

  const subject = useMemo(() => {
    const head = invoice.is_studio_invoice
      ? invoice.title
      : (invoice.project_name ?? invoice.title);
    const parts: string[] = [];
    if (head?.trim()) parts.push(head.trim());
    if (designerName) parts.push(`from ${designerName}`);
    return parts.join(" · ");
  }, [
    invoice.is_studio_invoice,
    invoice.project_name,
    invoice.title,
    designerName,
  ]);

  /* M-6 — the precedence ladder, recorded so it is not silently reordered:
     paid > processing > past due > partly paid > awaiting. A part-paid overdue
     invoice therefore reads "Past due · 22 days" and loses the "Partly paid"
     word, because lateness is the louder fact and the money already received
     is still standing in the figures immediately below. */
  const eyebrow = useMemo(() => {
    const dueSuffix = invoice.due_date
      ? ` · due ${formatShortDate(invoice.due_date)}`
      : "";
    if (paid) {
      return invoice.paid_at
        ? `Paid in full · ${formatShortDate(invoice.paid_at)}`
        : "Paid in full";
    }
    if (processing) return `Payment on its way${dueSuffix}`;
    if (overdueDays !== null) {
      return `Past due · ${overdueDays} ${overdueDays === 1 ? "day" : "days"}`;
    }
    if (amountPaidCents > 0) return `Partly paid${dueSuffix}`;
    return `Awaiting payment${dueSuffix}`;
  }, [
    amountPaidCents,
    invoice.due_date,
    invoice.paid_at,
    overdueDays,
    paid,
    processing,
  ]);

  useEffect(() => {
    payLinkEvents.view({
      status: invoice.status,
      isStudioInvoice: invoice.is_studio_invoice,
      hasBalance: invoice.balance_cents > 0,
      currency: invoice.currency,
    });
  }, [
    invoice.balance_cents,
    invoice.currency,
    invoice.is_studio_invoice,
    invoice.status,
  ]);

  useEffect(() => {
    if (returnedCancelled) payLinkEvents.paymentCancelled({ currency });
  }, [returnedCancelled, currency]);

  useEffect(() => {
    if (confirmState !== "confirmed") return;
    payLinkEvents.paymentCompleted({
      status,
      amountCents: amountPaidCents,
      currency,
    });
  }, [confirmState, status, amountPaidCents, currency]);

  /* The ONE live region. The fee row, the total and the act label all move
     together; marking three of them live would triple-announce. It says the
     figure that moved and nothing else — and it says it once on mount too, so
     a screen-reader user who never touches the chooser still hears what the
     pre-selected row charges.

     A-2: the check branch adds one clause, because choosing "Mail a check"
     reveals a payee, an address and a memo-line instruction that a sighted
     reader can see appear and a screen-reader user otherwise cannot. It stays
     ONE region — a second permanent live node would double-announce.

     M-2: an aria-live node only speaks when its text CHANGES, so two methods
     quoting an identical total (a studio at card_surcharge_bps = 0, or a
     balance small enough that the ACH formula rounds to zero) would announce
     the first and stay silent on the second. The trailing NBSP alternates to
     force a change; it is whitespace and is not spoken. */
  useEffect(() => {
    if (!showChooser) return;
    const timer = setTimeout(() => {
      const sentence =
        method === "check"
          ? `Total to pay ${formatCurrency(totalToPayCents, currency)}. Mailing details below.`
          : `Total to pay ${formatCurrency(totalToPayCents, currency)}`;
      setLiveMessage((previous) =>
        previous.replace(/\u00A0$/, "") === sentence
          ? `${sentence}\u00A0`
          : sentence,
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [showChooser, totalToPayCents, currency, method]);

  const handleMethodChange = (next: InvoicePaymentUIMethod) => {
    setMethod(next);
    setCheckNotified(false);
    setRefusal(null);
    payLinkEvents.methodSelected({
      method: next,
      amountCents: balanceCents,
      surchargeCents:
        next === "check"
          ? 0
          : onlineSurchargeCents(
              next,
              balanceCents,
              paymentOptions.card_surcharge_bps,
            ),
      currency,
    });
  };

  const handleAct = async () => {
    if (submitting || (method === "check" && checkNotified)) return;
    setSubmitting(true);
    setRefusal(null);
    try {
      // M-3: `paymentStarted` fires BEFORE the POST on purpose — it precedes a
      // navigation away and rides `sendBeacon`, so it counts attempts, not
      // redirects. `checkIntent` navigates nowhere and has no such excuse, so
      // it fires only once the studio has actually been told.
      if (method !== "check") {
        payLinkEvents.paymentStarted({
          method,
          amountCents: balanceCents,
          surchargeCents,
          currency,
        });
      }
      const response = await fetch(`/pay/${token}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ method }),
      });
      const body = (await response.json().catch(() => null)) as {
        url?: string;
        ok?: boolean;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(body?.error ?? "checkout_failed");
      if (method === "check") {
        setCheckNotified(true);
        payLinkEvents.checkIntent({ amountCents: balanceCents, currency });
        return;
      }
      if (!body?.url) throw new Error("checkout_failed");
      window.location.assign(body.url);
    } catch (error) {
      setRefusal(
        refusalSentence(
          error,
          method === "check"
            ? "Unable to let the studio know just now. Try again in a moment."
            : "Unable to open the payment page just now. Try again in a moment.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const showReturnNotice = returnedCancelled && !noticeDismissed;
  const returnNoticeText =
    confirmState === "confirming"
      ? "Confirming your payment…"
      : confirmState === "unconfirmed"
        ? "Checkout came back, but Patina hasn't confirmed a payment yet. Don't send another one until this settles — refresh this page in a minute to check again."
        : showReturnNotice
          ? "You left before paying. Nothing was charged."
          : null;

  const showTaxLadder = invoice.tax_cents > 0;

  return (
    <div
      data-pay-desk
      className="flex justify-center px-5 pb-[120px] pt-10"
      data-testid="pay-sheet"
    >
      <style>{SHEET_RULES}</style>

      <main
        data-pay-sheet
        className="flex w-full max-w-[1060px] flex-col gap-7 border border-[var(--border-subtle)] px-8 pb-9 pt-10 min-[920px]:px-11"
      >
        {/* ── Letterhead: studio first, designer second, Patina last ── */}
        <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5 border-b border-[var(--border-default)] pb-[18px]">
          <div className="min-w-0">
            <div className="font-heading text-[25px] font-medium leading-[1.15] text-[var(--text-primary)]">
              {studioName}
            </div>
            {designerName && (
              <div className="font-mono text-[12px] leading-[1.5] text-[var(--text-muted)]">
                prepared by {designerName}
              </div>
            )}
          </div>
          {studio.website && (
            <div className="font-mono text-[12px] text-[var(--color-quiet-ink)]">
              {studio.website}
            </div>
          )}
        </header>

        <p className="font-mono text-[12px] tracking-[0.05em] text-[var(--text-muted)]">
          {eyebrow}
        </p>

        <div
          data-pay-grid
          className="flex flex-col gap-[34px] min-[920px]:grid min-[920px]:grid-cols-[minmax(0,1fr)_328px] min-[920px]:items-start min-[920px]:gap-x-0 min-[920px]:gap-y-[30px]"
        >
          <div className="flex flex-col gap-1.5 min-[920px]:col-start-1 min-[920px]:row-start-1 min-[920px]:pr-10">
            <h1 className="type-section-head text-balance">{invoiceLabel}</h1>
            {subject && (
              <p className="text-[16px] text-[var(--text-body)]">{subject}</p>
            )}
            {invoice.is_studio_invoice && (
              <p className="font-mono text-[12px] text-[var(--color-quiet-ink)]">
                from the studio
              </p>
            )}
          </div>

          {/* ── The money column ── */}
          <div
            data-pay-money
            className="flex min-w-0 flex-col gap-[26px] min-[920px]:col-start-2 min-[920px]:row-span-2 min-[920px]:row-start-1 min-[920px]:self-stretch min-[920px]:border-l min-[920px]:border-[var(--border-default)] min-[920px]:pl-9"
          >
            {returnNoticeText && (
              <div
                data-pay-print="hide"
                data-testid="pay-return-notice"
                className="flex items-start gap-3 border border-[var(--border-subtle)] bg-[var(--bg-warm)] px-3.5 py-3 text-[14px] leading-[1.5] text-[var(--text-body)]"
              >
                <p className="min-w-0">{returnNoticeText}</p>
                {showReturnNotice && confirmState === null && (
                  <button
                    type="button"
                    aria-label="Dismiss this message"
                    onClick={() => setNoticeDismissed(true)}
                    className="-my-3 -mr-3.5 h-11 w-11 flex-none font-mono text-[15px] text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--color-clay-ink)]"
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            {/* The three figures */}
            <div className="flex flex-col gap-[9px]">
              <div className="flex items-baseline justify-between gap-4">
                <span className="type-meta">Total</span>
                <span className="font-mono text-[14px] tabular-nums text-[var(--text-primary)]">
                  {formatCurrency(invoice.total_cents, currency)}
                </span>
              </div>
              {amountPaidCents > 0 && (
                <div className="flex items-baseline justify-between gap-4">
                  <span className="type-meta">Received</span>
                  <span className="font-mono text-[14px] tabular-nums text-[var(--text-primary)]">
                    {formatCurrency(amountPaidCents, currency)}
                  </span>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-4 border-t border-[var(--border-default)] pt-[9px]">
                <span className="type-meta !text-[var(--text-primary)]">
                  {paid ? "Balance" : "Balance due"}
                </span>
                <span className="font-mono text-[25px] tracking-[-0.01em] tabular-nums text-[var(--text-primary)]">
                  {formatCurrency(balanceCents, currency)}
                </span>
              </div>
              {invoice.due_date && !paid && (
                <p className="font-mono text-[12px] text-[var(--text-muted)]">
                  due {formatLongDate(invoice.due_date)}
                </p>
              )}
            </div>

            {processing && (
              <p
                data-pay-print="hide"
                data-testid="pay-processing-notice"
                className="border border-[var(--border-subtle)] bg-[var(--bg-warm)] px-3.5 py-3 text-[14px] leading-[1.5] text-[var(--text-body)]"
              >
                Your bank transfer is on its way — it usually settles in 3–5
                business days.
              </p>
            )}

            {showChooser && (
              <div data-pay-print="hide">
                <PaymentMethodChooser
                  method={method}
                  onMethodChange={handleMethodChange}
                  balanceCents={balanceCents}
                  currency={currency}
                  cardSurchargeBps={paymentOptions.card_surcharge_bps}
                  rails={payload.pay.rails}
                  disabled={submitting}
                  payeeName={studioName}
                  invoiceLabel={invoiceLabel}
                  checkRemitTo={paymentOptions.check_remit_to}
                />
              </div>
            )}

            {/* Totals */}
            <section
              className="flex flex-col gap-2"
              aria-label="What this comes to"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[13.5px] text-[var(--text-body)]">
                  Subtotal
                </span>
                <span className="font-mono text-[14px] tabular-nums text-[var(--text-primary)]">
                  {formatCurrency(invoice.subtotal_cents, currency)}
                </span>
              </div>
              {showTaxLadder && (
                <>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[13.5px] text-[var(--text-body)]">
                      Tax
                    </span>
                    <span className="font-mono text-[14px] tabular-nums text-[var(--text-primary)]">
                      {formatCurrency(invoice.tax_cents, currency)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[13.5px] text-[var(--text-body)]">
                      Total
                    </span>
                    <span className="font-mono text-[14px] tabular-nums text-[var(--text-primary)]">
                      {formatCurrency(invoice.total_cents, currency)}
                    </span>
                  </div>
                </>
              )}
              {amountPaidCents > 0 && (
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[13.5px] text-[var(--text-body)]">
                    Received
                  </span>
                  <span className="font-mono text-[14px] tabular-nums text-[var(--text-primary)]">
                    −{formatCurrency(amountPaidCents, currency)}
                  </span>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[13.5px] text-[var(--text-body)]">
                  Balance
                </span>
                <span className="font-mono text-[14px] tabular-nums text-[var(--text-primary)]">
                  {formatCurrency(balanceCents, currency)}
                </span>
              </div>
              {showChooser && method !== "check" && (
                <div
                  data-pay-print="hide"
                  data-testid="pay-fee-row"
                  className="flex items-baseline justify-between gap-4"
                >
                  <span className="text-[13.5px] text-[var(--text-body)]">
                    {method === "card"
                      ? "Card processing fee"
                      : "Bank transfer fee"}
                  </span>
                  <span className="font-mono text-[14px] tabular-nums text-[var(--text-primary)]">
                    {formatCurrency(surchargeCents, currency)}
                  </span>
                </div>
              )}
              {showChooser && (
                <div
                  data-pay-print="hide"
                  data-testid="pay-total-row"
                  className="mt-1 flex items-baseline justify-between gap-4 border-t border-[var(--border-default)] pt-3"
                >
                  <span className="text-[13.5px] text-[var(--text-primary)]">
                    Total to pay
                  </span>
                  <span className="font-heading text-[29px] tracking-[-0.005em] tabular-nums text-[var(--text-primary)]">
                    {formatCurrency(totalToPayCents, currency)}
                  </span>
                </div>
              )}
            </section>

            {showChooser && (
              <div data-pay-print="hide">
                {method === "check" && checkNotified ? (
                  <p className="flex min-h-[50px] items-center text-[14px] text-[var(--text-muted)]">
                    {designerFirst} has been notified.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleAct()}
                    disabled={submitting}
                    data-testid="pay-act"
                    className="block min-h-[50px] w-full border border-[var(--pay-act-bg)] bg-[var(--pay-act-bg)] px-[18px] py-3.5 text-[15px] font-medium text-[var(--pay-act-fg)] transition-colors hover:border-[var(--pay-act-bg-hover)] hover:bg-[var(--pay-act-bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--color-clay-ink)] disabled:opacity-70"
                  >
                    {method === "check"
                      ? `Let ${designerFirst} know a check is coming`
                      : `Pay ${formatCurrency(totalToPayCents, currency)}`}
                  </button>
                )}
                {refusal && (
                  <p
                    role="alert"
                    className="mt-2 text-[14px] leading-[1.5] text-[var(--text-body)]"
                  >
                    {refusal}
                  </p>
                )}
              </div>
            )}

            <p
              className="sr-only"
              aria-live="polite"
              data-testid="pay-live-region"
            >
              {liveMessage}
            </p>
          </div>

          {/* ── The record ── */}
          <div
            data-pay-record
            className="flex min-w-0 flex-col gap-[34px] min-[920px]:col-start-1 min-[920px]:row-start-2 min-[920px]:pr-10"
          >
            <section className="flex flex-col gap-3.5">
              <h2 className="type-meta border-b border-[var(--border-default)] pb-2.5">
                What&rsquo;s included
              </h2>
              <div className="flex flex-col">
                {payload.line_items.map((line, index) => (
                  <div
                    key={`${line.description ?? "line"}-${index}`}
                    data-pay-line
                    className="grid grid-cols-[minmax(0,1fr)_3rem_6.5rem] items-baseline gap-x-3 gap-y-1 border-b border-[var(--border-subtle)] py-3.5"
                  >
                    <span className="break-words text-[15.5px] text-[var(--text-primary)]">
                      {line.description ?? "—"}
                    </span>
                    <span className="text-right font-mono text-[12px] text-[var(--color-quiet-ink)]">
                      {line.quantity ?? ""}
                    </span>
                    <span className="text-right font-mono text-[14px] tabular-nums text-[var(--text-primary)]">
                      {formatCurrency(line.amount_cents, currency)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {invoice.memo && (
              <section className="flex flex-col gap-3.5">
                <h2 className="type-meta border-b border-[var(--border-default)] pb-2.5">
                  A note from {designerFirst}
                </h2>
                <p className="max-w-[62ch] text-[16px] leading-[1.7] text-[var(--text-body)]">
                  {invoice.memo}
                </p>
              </section>
            )}

            <section className="flex flex-col gap-3.5">
              <h2 className="type-meta border-b border-[var(--border-default)] pb-2.5">
                Payments
              </h2>
              <div>
                {payments.length === 0 && (
                  <p className="text-[13px] leading-[1.55] text-[var(--color-quiet-ink)]">
                    No payments recorded yet.
                  </p>
                )}
                {payments.map((payment, index) => (
                  <div
                    key={`${payment.received_at ?? "payment"}-${index}`}
                    data-pay-payment
                    className="flex items-baseline justify-between gap-4 border-b border-[var(--border-subtle)] py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[14.5px] text-[var(--text-primary)]">
                        {paymentLabel(payment)}
                        {payment.surcharge_cents > 0 &&
                          ` · + ${formatCurrency(payment.surcharge_cents, currency)} processing fee (${formatCurrency(
                            payment.amount_cents + payment.surcharge_cents,
                            currency,
                          )} charged)`}
                      </p>
                      <p className="mt-0.5 font-mono text-[11.5px] text-[var(--color-quiet-ink)]">
                        {payment.status === "pending"
                          ? "Payment processing"
                          : payment.received_at
                            ? `Received ${formatLongDate(payment.received_at)}`
                            : "Received"}
                      </p>
                    </div>
                    <span className="font-mono text-[14px] tabular-nums text-[var(--text-primary)]">
                      {formatCurrency(payment.amount_cents, currency)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <button
              type="button"
              data-pay-print="hide"
              onClick={() => window.print()}
              className="min-h-[44px] self-start py-3 text-[14px] text-[var(--color-clay-ink)] underline underline-offset-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--color-clay-ink)]"
            >
              Print / save PDF
            </button>
          </div>
        </div>

        <footer className="flex flex-col gap-1.5 border-t border-[var(--border-default)] pt-[18px] font-mono text-[11.5px] tracking-[0.03em] text-[var(--color-quiet-ink)]">
          <span>Prepared by {studioName} · Sent through Patina</span>
          {/* S18: a browser stamps the URL into the print header and no
              stylesheet can suppress it. Say so in the studio's voice. */}
          <span data-pay-print="only">
            This sheet carries a payment link. Treat it like a check.
          </span>
        </footer>
      </main>
    </div>
  );
}
