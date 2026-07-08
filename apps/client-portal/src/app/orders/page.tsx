'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Loader2, X } from 'lucide-react';
import { useDirectOrders, useStartDirectOrderCheckout, type DirectOrder } from '@patina/supabase';
import { formatCurrency, formatInvoiceDate } from '@patina/shared';

// Client "buy now" orders — the direct_orders rail (migration 00267). Every
// row here was minted by create_direct_order from the quiz-results Buy
// button; there is no cart and no separate detail page for v1. Mirrors the
// invoice detail page's ?checkout= poll/ACH-fallback pattern
// (apps/client-portal/src/app/invoices/[invoiceId]/page.tsx): the Buy /
// Complete-payment button calls create-checkout-session and redirects to the
// returned URL; Stripe sends the client back here with
// ?order=<id>&checkout=success|cancelled, and the stripe-webhook function
// settles the row server-side. Reads window.location in an effect (not
// useSearchParams) so the page needs no Suspense boundary.

const CONFIRM_POLL_INTERVAL_MS = 3_000;
const CONFIRM_POLL_TIMEOUT_MS = 30_000;

type ConfirmState = 'confirming' | 'confirmed' | 'ach_pending' | null;

function statusLabel(order: DirectOrder): string {
  if (order.status === 'paid') return 'Paid';
  if (order.status === 'refunded') return 'Refunded';
  if (order.status === 'canceled') return 'Canceled';
  // pending_payment with a stamped PaymentIntent means Checkout completed and
  // an ACH debit is in flight (settles in 3–5 business days) — the same
  // "processing" read as the invoice page's processingPayments filter.
  if (order.stripe_payment_intent_id) return 'Processing (bank transfer pending)';
  return 'Awaiting payment';
}

export default function ClientOrdersPage() {
  const { data, isLoading, refetch } = useDirectOrders();
  const startCheckout = useStartDirectOrderCheckout();
  const orders = data ?? [];

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const orderId = url.searchParams.get('order');
    const checkout = url.searchParams.get('checkout');
    if (orderId) setHighlightId(orderId);
    if (checkout === 'success') setConfirmState('confirming');
    if (checkout === 'cancelled') setShowCancelled(true);
    if (orderId || checkout) {
      url.searchParams.delete('order');
      url.searchParams.delete('checkout');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  // A settled (paid) highlighted order resolves confirmation.
  const highlighted = highlightId ? orders.find((o) => o.id === highlightId) : undefined;
  const settled = highlighted?.status === 'paid';

  useEffect(() => {
    if (confirmState === 'confirming' && settled) setConfirmState('confirmed');
  }, [confirmState, settled]);

  // Poll while confirming: every 3s, up to 30s; then assume ACH (3–5 days).
  useEffect(() => {
    if (confirmState !== 'confirming') return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt >= CONFIRM_POLL_TIMEOUT_MS) {
        setConfirmState((s) => (s === 'confirming' ? 'ach_pending' : s));
        clearInterval(timer);
        return;
      }
      void refetch();
    }, CONFIRM_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [confirmState, refetch]);

  const handlePay = async (order: DirectOrder) => {
    setPayError(null);
    setPayingId(order.id);
    try {
      const { url } = await startCheckout.mutateAsync({ directOrderId: order.id });
      window.location.href = url;
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Unable to start payment.');
      setPayingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="type-page-title">Your Orders</h1>
      <p className="type-body mt-2">Pieces you&rsquo;ve bought directly from the catalog.</p>

      {confirmState === 'confirming' && (
        <div className="type-body-small mt-6 flex items-center gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--text-muted)]" aria-hidden />
          <span>Confirming payment&hellip; This usually takes a few seconds.</span>
        </div>
      )}
      {confirmState === 'confirmed' && (
        <div className="type-body-small mt-6 flex items-center gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--accent-primary)]" aria-hidden />
          <span>Payment received — thank you! A receipt is on its way to your inbox.</span>
        </div>
      )}
      {confirmState === 'ach_pending' && (
        <div className="type-body-small mt-6 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
          Your bank transfer has been started. Bank transfers take 3&ndash;5 business days to
          clear &mdash; we&rsquo;ll email your receipt as soon as it lands.
        </div>
      )}
      {showCancelled && (
        <div className="type-body-small mt-6 flex items-start justify-between gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
          <span>
            Checkout was cancelled &mdash; no payment was made. You can pay whenever you&rsquo;re
            ready.
          </span>
          <button
            type="button"
            onClick={() => setShowCancelled(false)}
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {payError && (
        <p
          className="type-body-small mt-4 rounded-md border border-[var(--border-default)] p-3"
          style={{ color: 'var(--color-terracotta, #C77B6E)' }}
          role="alert"
        >
          {payError}
        </p>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      )}

      {!isLoading && orders.length === 0 && (
        <div className="py-16 text-center">
          <p className="type-body-small">
            Nothing here yet. When you buy a piece from your matches, it will show up here.
          </p>
        </div>
      )}

      {orders.length > 0 && (
        <ul className="mt-8 space-y-0">
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              highlighted={order.id === highlightId}
              onPay={() => void handlePay(order)}
              paying={payingId === order.id && startCheckout.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderRow({
  order,
  highlighted,
  onPay,
  paying,
}: {
  order: DirectOrder;
  highlighted: boolean;
  onPay: () => void;
  paying: boolean;
}) {
  // Only an order that never opened a Checkout session (no PaymentIntent
  // stamped yet) is payable here — one already in flight (ACH pending) has
  // no "failed" status to retry from; Pay-now would just orphan a second
  // session. See stripe-webhook's direct_order settle-branch header comment.
  const canPay = order.status === 'pending_payment' && !order.stripe_payment_intent_id;

  return (
    <li
      className="border-b border-[var(--border-default)] py-5"
      style={highlighted ? { background: 'var(--bg-surface)' } : undefined}
      data-order-row
      data-highlighted={highlighted ? 'true' : undefined}
    >
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="type-meta text-[var(--text-muted)]">
            {statusLabel(order)} · {formatInvoiceDate(order.created_at)}
          </p>
          <h3 className="font-heading text-lg text-[var(--text-primary)]">{order.product_name}</h3>
          {order.quantity !== 1 && (
            <p className="type-body-small mt-1 text-[var(--text-muted)]">Qty {order.quantity}</p>
          )}
        </div>
        <div className="text-right">
          <p className="font-heading text-base text-[var(--text-primary)]">
            {formatCurrency(order.amount_cents, order.currency)}
          </p>
          {canPay && (
            <button
              type="button"
              onClick={onPay}
              disabled={paying}
              className="type-meta mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-[var(--text-primary)] px-4 text-[var(--bg-page,#fff)] transition hover:opacity-90 disabled:opacity-60"
            >
              {paying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <CreditCard className="h-3.5 w-3.5" aria-hidden />
              )}
              Complete payment
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
