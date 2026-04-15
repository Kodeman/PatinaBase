'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Eye, Package } from 'lucide-react';
import {
  PageHeader,
  FilterTabs,
  Section,
  EmptyState,
  LoadingStrata,
  StatusDot,
  type StatusVariant,
} from '@/components/portal';
import { ordersService } from '@/services/orders';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { Order } from '@/types';

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'created', label: 'Created' },
  { value: 'paid', label: 'Paid' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'closed', label: 'Closed' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'canceled', label: 'Canceled' },
];

function statusVariant(status: string): StatusVariant {
  if (status === 'paid' || status === 'fulfilled' || status === 'closed') return 'success';
  if (status === 'refunded' || status === 'canceled') return 'error';
  return 'info';
}

export default function OrdersPage() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['orders', { page, status: statusFilter !== 'all' ? statusFilter : undefined }],
    queryFn: () =>
      ordersService.getOrders({
        page,
        pageSize: 20,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
  });

  const orders = data?.data?.data || [];
  const meta = data?.data?.meta;

  return (
    <div>
      <PageHeader title="Orders" description="View and manage customer orders." />

      <div className="mt-8">
        <FilterTabs items={STATUS_TABS} value={statusFilter} onChange={setStatusFilter} />
      </div>

      <Section className="mt-8">
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              placeholder="Search orders by ID, user email..."
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <LoadingStrata />
        ) : orders.length === 0 ? (
          <EmptyState message="No orders found." />
        ) : (
          <div>
            {orders.map((order: Order) => (
              <div
                key={order.id}
                className="group flex items-center gap-4 border-b border-[var(--border-subtle)] py-5 transition-colors hover:bg-[var(--bg-hover)]"
              >
                <Package className="h-8 w-8 flex-shrink-0 text-[var(--text-muted)]" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="type-item-name font-mono text-[0.85rem]">
                      #{order.id.substring(0, 8)}
                    </span>
                    <Badge variant="outline">{order.items?.length || 0} items</Badge>
                  </div>
                  <div className="type-label-secondary mt-0.5">{order.userId}</div>
                  <div className="type-meta-small mt-1">{formatDateTime(order.createdAt)}</div>
                </div>
                <div className="text-right">
                  <div className="type-data-large">
                    {formatCurrency(order.total, order.currency)}
                  </div>
                </div>
                <StatusDot variant={statusVariant(order.status)} label={order.status} />
                <Button variant="ghost" size="icon">
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between border-t border-[var(--border-default)] pt-4">
            <div className="type-meta-small">
              Page {meta.page} of {meta.totalPages} ({meta.total} orders)
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page === meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
