import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { createServerClient } from '@patina/supabase/server';

import { fetchClientOrders, type OrderStatus } from '@/lib/data/orders';

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string }>;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Awaiting payment',
  processing: 'Processing',
  paid: 'Paid',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const PAYABLE_STATUSES = new Set<OrderStatus>(['pending', 'processing']);

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function OrderDetailPage({ params, searchParams }: OrderDetailPageProps) {
  const { id } = await params;
  const search = await searchParams;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createServerClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/signin?callbackUrl=/orders/${id}`);

  const orders = await fetchClientOrders();
  const order = orders.find((o) => o.id === id);
  if (!order) notFound();

  const paymentSuccess = search.payment === 'success';

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 type-meta no-underline transition hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All orders
      </Link>

      {paymentSuccess && (
        <div
          className="mt-6 rounded-md border border-patina-sage/30 px-4 py-3"
          style={{ background: 'rgba(122, 155, 118, 0.06)' }}
          data-testid="order-payment-success"
        >
          <p className="type-body-small text-[var(--text-primary)]">
            Payment received — thank you. We&rsquo;ll update this page as your order moves to
            production and shipping.
          </p>
        </div>
      )}

      <header className="mt-6">
        <p className="type-meta text-[var(--text-muted)]">
          {order.orderNumber ?? `Order ${order.id.slice(0, 8)}`} ·{' '}
          {formatDate(order.createdAt)}
        </p>
        <h1 className="type-page-title mt-1">{STATUS_LABEL[order.status]}</h1>
        <p className="type-body mt-2">
          {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'} ·{' '}
          <strong>{formatCurrency(order.totalCents, order.currency)}</strong>
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-[var(--border-default)] bg-white p-5">
        <h2 className="font-heading text-base text-[var(--text-primary)] mb-3">Items</h2>
        <p className="type-body-small text-[var(--text-muted)]">
          <Loader2 className="inline h-3.5 w-3.5 animate-pulse" /> Item-level details will appear
          here once the orders service exposes itemized lines for clients. For now, your
          designer can answer questions in your project thread.
        </p>
      </section>

      {PAYABLE_STATUSES.has(order.status) && (
        <section className="mt-6 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
          <h2 className="font-heading text-base text-[var(--text-primary)]">Payment due</h2>
          <p className="type-body-small mt-1 text-[var(--text-muted)]">
            Pay your balance to release this order to production.
          </p>
          <div className="mt-3">
            <Link
              href={`/orders/${order.id}/checkout`}
              className="inline-flex items-center gap-2 rounded-[3px] bg-patina-charcoal px-5 py-2.5 text-sm font-medium text-white no-underline transition hover:opacity-90"
              data-testid="order-pay-cta"
            >
              Pay {formatCurrency(order.totalCents, order.currency)}
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
