'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, CreditCard, Loader2, Printer, X } from 'lucide-react';
import {
  useInvoice,
  useStartCheckout,
  useStudioIdentity,
  InvoiceCheckoutError,
  type Invoice,
  type InvoicePayment,
} from '@patina/supabase';
import {
  INVOICE_PAYMENT_METHOD_LABELS,
  formatCurrency,
  formatInvoiceDate,
  invoiceBalanceCents,
  isInvoiceOverdue,
  timeLineHoursLabel,
} from '@patina/shared';
import { clientEvents } from '@/lib/analytics/events';
import { resolveReturnedCheckoutPayment } from './checkout-return';

// Client-facing invoice detail. RLS only exposes issued (non-draft) invoices
// on the client's own projects, with their lines and payments. Online payment
// goes through Stripe Checkout: the Pay button calls the
// create-checkout-session edge function and redirects to the returned URL;
// Stripe sends the client back here with ?checkout=success|cancelled, and the
// stripe-webhook function settles the payment row server-side.

const CONFIRM_POLL_INTERVAL_MS = 3_000;
const CONFIRM_POLL_TIMEOUT_MS = 30_000;

function statusHeadline(invoice: Invoice, overdue: boolean): string {
  if (invoice.status === 'paid') return 'Paid in full';
  if (invoice.status === 'void') return 'Voided by your designer';
  if (overdue) return 'Past due';
  if (invoice.status === 'partially_paid') return 'Partially paid';
  return 'Awaiting payment';
}

type ConfirmState =
  | 'confirming'
  | 'confirmed'
  | 'processing'
  | 'unconfirmed'
  | 'failed'
  | 'refunded'
  | 'requires_refund'
  | null;

type CheckoutReturn = {
  outcome: 'success' | 'cancelled';
  sessionId: string | null;
  checkoutAttemptId: string | null;
  paymentId: string | null;
};

export default function ClientInvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = use(params);
  const { data: invoice, isLoading, isError, error: invoiceError, refetch } = useInvoice(invoiceId);
  const startCheckout = useStartCheckout();
  // Studio brand identity (Designer Studios). projectId path; disabled until the
  // invoice resolves. name is nullable — fall back to the designer join below.
  const { data: identity } = useStudioIdentity({
    projectId: invoice?.project_id,
  });

  // client_invoice_view — fires once, the first time the invoice resolves.
  const invoiceViewCaptured = useRef(false);
  useEffect(() => {
    if (!invoice || invoiceViewCaptured.current) return;
    invoiceViewCaptured.current = true;
    clientEvents.invoiceView({ invoiceId: invoice.id, status: invoice.status });
  }, [invoice]);

  // ── Checkout return handling (?checkout=success|cancelled) ───────────────
  // Read from window.location in an effect (not useSearchParams) so the page
  // needs no Suspense boundary; strip the params so a refresh doesn't replay.
  const [payError, setPayError] = useState<string | null>(null);
  const [checkoutReturn, setCheckoutReturn] = useState<CheckoutReturn | null>(null);
  const [cancelDismissed, setCancelDismissed] = useState(false);
  const [confirmTimedOut, setConfirmTimedOut] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const checkout = url.searchParams.get('checkout');
    if (!checkout) return;
    if (checkout === 'success') {
      // Reading the browser return URL is an external-system synchronization.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCheckoutReturn({
        outcome: 'success',
        sessionId: url.searchParams.get('session_id'),
        checkoutAttemptId: url.searchParams.get('checkout_attempt_id'),
        paymentId: url.searchParams.get('payment_id'),
      });
    }
    if (checkout === 'cancelled') {
      setCheckoutReturn({
        outcome: 'cancelled',
        sessionId: null,
        checkoutAttemptId: url.searchParams.get('checkout_attempt_id'),
        paymentId: url.searchParams.get('payment_id'),
      });
    }
    url.searchParams.delete('checkout');
    url.searchParams.delete('session_id');
    url.searchParams.delete('checkout_attempt_id');
    url.searchParams.delete('payment_id');
    window.history.replaceState({}, '', url.pathname + url.search);
  }, []);

  const returnedCheckout = useMemo(
    () =>
      resolveReturnedCheckoutPayment(invoice?.payments, {
        sessionId: checkoutReturn?.sessionId ?? null,
        checkoutAttemptId: checkoutReturn?.checkoutAttemptId ?? null,
        paymentId: checkoutReturn?.paymentId ?? null,
      }),
    [invoice?.payments, checkoutReturn],
  );

  // A return URL says only that Checkout handed the browser back. Derive the
  // display directly from the exact webhook-backed payment row instead of
  // copying query state into component state.
  const confirmState: ConfirmState = useMemo(() => {
    if (checkoutReturn?.outcome !== 'success') return null;
    if (returnedCheckout.state === 'waiting') {
      return confirmTimedOut ? 'unconfirmed' : 'confirming';
    }
    return returnedCheckout.state;
  }, [checkoutReturn?.outcome, confirmTimedOut, returnedCheckout.state]);

  // client_payment_completed fires only after the exact returned Checkout
  // payment is settled. Cancellation uses the exact claimed payment amount.
  const paymentOutcomeCaptured = useRef(false);
  const cancelRefetchAttempted = useRef(false);
  useEffect(() => {
    if (!checkoutReturn || paymentOutcomeCaptured.current || isLoading) return;
    if (checkoutReturn.outcome === 'cancelled') {
      const captureCancellation = (
        exact: ReturnType<typeof resolveReturnedCheckoutPayment>,
      ) => {
        if (paymentOutcomeCaptured.current) return;
        paymentOutcomeCaptured.current = true;
        if (exact.state === 'confirmed' && exact.payment) {
          clientEvents.paymentCompleted({
            invoiceId,
            amountCents: exact.payment.amount_cents,
          });
          return;
        }
        clientEvents.paymentCancelled({
          invoiceId,
          // Only exact attempt evidence is authoritative. A legacy cancellation
          // without it intentionally omits amount instead of sampling a balance
          // that another payment may already have changed.
          amountCents: exact.payment?.amount_cents,
        });
      };
      const hasExactIdentity = Boolean(
        checkoutReturn.checkoutAttemptId || checkoutReturn.paymentId,
      );
      if (hasExactIdentity && !returnedCheckout.payment && !cancelRefetchAttempted.current) {
        cancelRefetchAttempted.current = true;
        void refetch().then(({ data }) => {
          captureCancellation(
            resolveReturnedCheckoutPayment(data?.payments, {
              sessionId: checkoutReturn.sessionId,
              checkoutAttemptId: checkoutReturn.checkoutAttemptId,
              paymentId: checkoutReturn.paymentId,
            }),
          );
        });
        return;
      }
      captureCancellation(returnedCheckout);
      return;
    }
    if (returnedCheckout.state === 'confirmed' && returnedCheckout.payment) {
      paymentOutcomeCaptured.current = true;
      clientEvents.paymentCompleted({
        invoiceId,
        amountCents: returnedCheckout.payment.amount_cents,
      });
    }
  }, [checkoutReturn, isLoading, invoiceId, refetch, returnedCheckout]);

  // Poll briefly for webhook truth. A timeout is explicitly unconfirmed; it
  // does not imply a bank transfer or a successful payment.
  useEffect(() => {
    if (confirmState !== 'confirming') return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt >= CONFIRM_POLL_TIMEOUT_MS) {
        setConfirmTimedOut(true);
        clearInterval(timer);
        return;
      }
      void refetch();
    }, CONFIRM_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [confirmState, refetch]);

  const handlePay = async () => {
    if (!invoice) return;
    setPayError(null);
    try {
      const receipt = await startCheckout.mutateAsync({
        invoiceId: invoice.id,
      });
      clientEvents.paymentStarted({
        invoiceId: invoice.id,
        amountCents: receipt.amount_cents,
      });
      window.location.href = receipt.url;
    } catch (err) {
      if (err instanceof InvoiceCheckoutError && err.code === 'payment_processing') {
        setCheckoutReturn({
          outcome: 'success',
          sessionId: err.sessionId ?? null,
          checkoutAttemptId: err.checkoutAttemptId ?? null,
          paymentId: err.paymentId ?? null,
        });
        setConfirmTimedOut(false);
        await refetch();
        return;
      }
      if (err instanceof InvoiceCheckoutError && err.code === 'payment_reconciliation_required') {
        setPayError(
          'This invoice has a payment that needs review. Do not submit another payment; your designer will follow up.',
        );
        await refetch();
        return;
      }
      setPayError(err instanceof Error ? err.message : 'Unable to start payment.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="type-body-small" role="alert">
          We couldn&rsquo;t load this invoice.{' '}
          {invoiceError instanceof Error ? invoiceError.message : 'Please try again.'}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="type-meta mt-4 text-[var(--accent-primary)] underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!invoice || invoice.status === 'draft') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="type-body-small">Invoice not found.</p>
        <Link
          href="/invoices"
          className="type-meta mt-4 inline-flex items-center gap-1 text-[var(--accent-primary)] no-underline hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to invoices
        </Link>
      </div>
    );
  }

  const overdue = isInvoiceOverdue(invoice);
  const balance = invoiceBalanceCents(invoice);
  const succeededPayments = (invoice.payments ?? []).filter((p) => p.status === 'succeeded');
  const pendingPayments = (invoice.payments ?? []).filter((p) => p.status === 'pending');
  // A pending Stripe row only counts as "processing" once Checkout completed
  // and stamped the payment intent (ACH debit in flight). A pending row with
  // no PI is just an abandoned/unfinished checkout session — ignore it.
  const processingPayments = pendingPayments.filter(
    (p) => p.method !== 'stripe' || !!p.stripe_payment_intent_id,
  );
  const exceptionPayments = (invoice.payments ?? []).filter(
    (p) => p.status === 'refunded' || p.status === 'requires_refund',
  );
  const hasProcessingStripe = processingPayments.some((p) => p.method === 'stripe');
  const hasReconciliationRequired = exceptionPayments.some(
    (p) => p.status === 'requires_refund',
  );
  const designerName =
    identity?.name ??
    (invoice.designer?.full_name?.trim() ||
      invoice.designer?.business_name?.trim() ||
      'your designer');
  const taxPercent = (Number(invoice.tax_rate) * 100).toFixed(2).replace(/\.?0+$/, '');

  const canPay =
    (invoice.status === 'sent' || invoice.status === 'partially_paid') &&
    balance > 0 &&
    !hasProcessingStripe &&
    !hasReconciliationRequired &&
    confirmState !== 'confirming' &&
    confirmState !== 'processing' &&
    confirmState !== 'unconfirmed';

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/invoices"
        className="type-meta inline-flex items-center gap-1 text-[var(--accent-primary)] no-underline hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to invoices
      </Link>

      {/* Checkout return states */}
      {confirmState === 'confirming' && (
        <div
          className="type-body-small mt-6 flex items-center gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--text-muted)]" aria-hidden />
          <span>Confirming payment&hellip; This usually takes a few seconds.</span>
        </div>
      )}
      {confirmState === 'confirmed' && (
        <div
          className="type-body-small mt-6 flex items-center gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--accent-primary)]" aria-hidden />
          <span>Payment confirmed — thank you. Your invoice has been updated.</span>
        </div>
      )}
      {confirmState === 'processing' && (
        <div
          className="type-body-small mt-6 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
          role="status"
          aria-live="polite"
        >
          Your payment provider is still processing this payment. The balance will update after
          Patina receives confirmation.
        </div>
      )}
      {confirmState === 'unconfirmed' && (
        <div
          className="type-body-small mt-6 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
          role="status"
          aria-live="polite"
        >
          <p>
            Checkout returned, but Patina has not confirmed a payment yet. Do not submit another
            payment until the status is known.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="type-meta mt-2 text-[var(--accent-primary)] underline"
          >
            Check payment status
          </button>
        </div>
      )}
      {confirmState === 'failed' && (
        <div
          className="type-body-small mt-6 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
          style={{ color: 'var(--color-terracotta, #C77B6E)' }}
          role="alert"
        >
          This payment was not completed. No confirmed payment was applied; you can try again.
        </div>
      )}
      {confirmState === 'refunded' && (
        <div
          className="type-body-small mt-6 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
          role="status"
          aria-live="polite"
        >
          This payment was refunded. It is not counted toward the invoice balance.
        </div>
      )}
      {confirmState === 'requires_refund' && (
        <div
          className="type-body-small mt-6 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
          style={{ color: 'var(--color-terracotta, #C77B6E)' }}
          role="alert"
        >
          This payment needs manual review and refund reconciliation. Do not submit another
          payment; your designer will follow up.
        </div>
      )}
      {checkoutReturn?.outcome === 'cancelled' && !cancelDismissed && (
        <div
          className="type-body-small mt-6 flex items-start justify-between gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
          role="status"
          aria-live="polite"
        >
          <span>
            {returnedCheckout.state === 'confirmed'
              ? 'Checkout was closed, but this payment is confirmed and your invoice is updated.'
              : returnedCheckout.state === 'processing'
                ? 'Checkout was closed, but this payment is still processing. Do not submit another payment.'
                : returnedCheckout.state === 'requires_refund'
                  ? 'Checkout was closed, but this payment needs review and refund reconciliation.'
                  : returnedCheckout.state === 'refunded'
                    ? 'Checkout was closed and this payment was refunded.'
                    : 'Checkout was cancelled. No completed payment is confirmed; you can pay whenever you\u2019re ready.'}
          </span>
          <button
            type="button"
            onClick={() => setCancelDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p
            className="type-meta"
            style={{
              color: overdue ? 'var(--color-terracotta, #C77B6E)' : 'var(--text-muted)',
            }}
          >
            {statusHeadline(invoice, overdue)}
          </p>
          <h1 className="type-page-title mt-1">{invoice.invoice_number ?? 'Invoice'}</h1>
          {invoice.project?.name && (
            <p className="type-body-small mt-1 text-[var(--text-muted)]">
              {invoice.project.name} · from {designerName}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canPay && (
            <button
              type="button"
              onClick={handlePay}
              disabled={startCheckout.isPending}
              className="type-meta inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[var(--text-primary)] px-5 text-[var(--bg-page,#fff)] transition hover:opacity-90 disabled:opacity-60"
            >
              {startCheckout.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <CreditCard className="h-3.5 w-3.5" aria-hidden />
              )}
              Pay {formatCurrency(balance, invoice.currency)}
            </button>
          )}
          <Link
            href={`/invoices/${invoice.id}/print`}
            className="type-meta inline-flex min-h-[44px] items-center gap-2 rounded-md border border-[var(--border-default)] px-4 no-underline transition hover:bg-[var(--bg-surface)]"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden />
            Print / save PDF
          </Link>
        </div>
      </div>

      {payError && (
        <p
          className="type-body-small mt-4 rounded-md border border-[var(--border-default)] p-3"
          style={{ color: 'var(--color-terracotta, #C77B6E)' }}
          role="alert"
        >
          {payError}
        </p>
      )}

      {/* Amount summary */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">Total</p>
          <p className="type-data-large mt-1">
            {formatCurrency(invoice.total_cents, invoice.currency)}
          </p>
        </div>
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">Paid</p>
          <p className="type-data-large mt-1">
            {formatCurrency(invoice.amount_paid_cents, invoice.currency)}
          </p>
        </div>
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">{invoice.status === 'void' ? 'Status' : 'Balance'}</p>
          <p className="type-data-large mt-1">
            {invoice.status === 'void' ? 'Void' : formatCurrency(balance, invoice.currency)}
          </p>
          {invoice.due_date && balance > 0 && invoice.status !== 'void' && (
            <p
              className="type-meta-small mt-1"
              style={{
                color: overdue ? 'var(--color-terracotta, #C77B6E)' : 'var(--text-muted)',
              }}
            >
              Due {formatInvoiceDate(invoice.due_date)}
            </p>
          )}
        </div>
      </div>

      {processingPayments.length > 0 && confirmState !== 'confirming' && (
        <p className="type-body-small mt-4 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-muted)]">
          A payment of{' '}
          {formatCurrency(
            processingPayments.reduce((sum, p) => sum + p.amount_cents, 0),
            invoice.currency,
          )}{' '}
          is processing. The balance above will update once it clears.
          {hasProcessingStripe && ' Patina will confirm it as soon as the provider settles it.'}
        </p>
      )}

      {/* Line items */}
      <section className="mt-10">
        <h2 className="type-section-head">What&rsquo;s included</h2>
        <div className="mt-4">
          {(invoice.line_items ?? []).map((line) => (
            <div
              key={line.id}
              className="flex items-baseline justify-between gap-4 border-b border-[var(--border-subtle,var(--border-default))] py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--text-primary)]">{line.description}</p>
                {line.kind === 'time' ? (
                  // Rolled-up design time: annotate with the logged hours from
                  // the line metadata (quantity is a synthetic 1 — no qty math).
                  <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
                    Design time logged by your designer
                    {timeLineHoursLabel(line.metadata)
                      ? ` · ${timeLineHoursLabel(line.metadata)}`
                      : ''}
                  </p>
                ) : (
                  Number(line.quantity) !== 1 && (
                    <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
                      {Number(line.quantity)} ×{' '}
                      {formatCurrency(line.unit_amount_cents, invoice.currency)}
                    </p>
                  )
                )}
              </div>
              <span className="type-label text-[var(--text-primary)]">
                {formatCurrency(line.amount_cents, invoice.currency)}
              </span>
            </div>
          ))}

          <div className="ml-auto mt-4 max-w-xs">
            <div className="flex justify-between py-0.5">
              <span className="type-meta-small">Subtotal</span>
              <span className="type-label">
                {formatCurrency(invoice.subtotal_cents, invoice.currency)}
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="type-meta-small">Tax{taxPercent ? ` (${taxPercent}%)` : ''}</span>
              <span className="type-label">
                {formatCurrency(invoice.tax_cents, invoice.currency)}
              </span>
            </div>
            <div className="flex justify-between border-t border-[var(--border-default)] py-1.5">
              <span className="type-label">Total</span>
              <span className="font-heading text-base font-semibold text-[var(--text-primary)]">
                {formatCurrency(invoice.total_cents, invoice.currency)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Note from the designer + how to pay */}
      {invoice.memo && (
        <section className="mt-10">
          <h2 className="type-section-head">A note from {designerName}</h2>
          <p className="type-body mt-3 whitespace-pre-line">{invoice.memo}</p>
          {balance > 0 && invoice.status !== 'void' && (
            <p className="type-body-small mt-3 text-[var(--text-muted)]">
              You can pay online with the Pay button above (card or bank transfer); your designer
              also accepts payment by check or wire — details are on the invoice.
            </p>
          )}
        </section>
      )}

      {/* Payments received */}
      <section className="mt-10">
        <h2 className="type-section-head">Payments</h2>
        {succeededPayments.length > 0 || processingPayments.length > 0 || exceptionPayments.length > 0 ? (
          <div className="mt-4">
            {[...succeededPayments, ...processingPayments, ...exceptionPayments].map((payment) => (
              <PaymentRow key={payment.id} payment={payment} currency={invoice.currency} />
            ))}
          </div>
        ) : (
          <p className="type-body-small mt-3 text-[var(--text-muted)]">No payments recorded yet.</p>
        )}
      </section>

      {invoice.status === 'void' && (
        <p className="type-body-small mt-10 text-[var(--text-muted)]">
          This invoice was voided
          {invoice.voided_at ? ` on ${formatInvoiceDate(invoice.voided_at)}` : ''} — nothing is owed
          on it. Reach out to {designerName} with any questions.
        </p>
      )}
    </div>
  );
}

function PaymentRow({ payment, currency }: { payment: InvoicePayment; currency: string }) {
  const statusCopy =
    payment.status === 'pending'
      ? 'Payment processing'
      : payment.status === 'refunded'
        ? `Refunded ${formatInvoiceDate(payment.updated_at)}`
        : payment.status === 'requires_refund'
          ? 'Refund review required'
          : `Received ${formatInvoiceDate(payment.received_at ?? payment.created_at)}`;
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border-subtle,var(--border-default))] py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--text-primary)]">
          {INVOICE_PAYMENT_METHOD_LABELS[payment.method]}
          {payment.reference ? ` · ${payment.reference}` : ''}
        </p>
        <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
          {statusCopy}
        </p>
      </div>
      <span className="type-label text-[var(--text-primary)]">
        {formatCurrency(payment.amount_cents, currency)}
      </span>
    </div>
  );
}
