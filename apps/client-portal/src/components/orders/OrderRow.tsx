import Link from 'next/link';

import type { ClientOrder, OrderStatus } from '@/lib/data/orders';

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  paid: 'Paid',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const STATUS_TONE: Record<OrderStatus, string> = {
  pending: 'bg-amber-50 text-amber-800',
  processing: 'bg-blue-50 text-blue-800',
  paid: 'bg-green-50 text-green-800',
  shipped: 'bg-blue-50 text-blue-800',
  delivered: 'bg-green-50 text-green-800',
  cancelled: 'bg-gray-50 text-gray-600',
  refunded: 'bg-gray-50 text-gray-600',
};

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function OrderRow({ order }: { order: ClientOrder }) {
  return (
    <li>
      <Link
        href={`/orders/${order.id}`}
        className="block border-b border-[var(--border-default)] py-5 no-underline transition hover:bg-[var(--bg-surface)]"
        data-testid="order-row"
      >
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="type-meta text-[var(--text-muted)]">
              {order.orderNumber ?? `Order ${order.id.slice(0, 8)}`} · {formatDate(order.createdAt)}
            </p>
            <p className="font-heading text-base text-[var(--text-primary)]">
              {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
            </p>
          </div>
          <div className="text-right">
            <span
              className={`inline-block rounded-sm px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider ${STATUS_TONE[order.status]}`}
            >
              {STATUS_LABEL[order.status]}
            </span>
            <p className="mt-1 font-heading text-base text-[var(--text-primary)]">
              {formatCurrency(order.totalCents, order.currency)}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}
