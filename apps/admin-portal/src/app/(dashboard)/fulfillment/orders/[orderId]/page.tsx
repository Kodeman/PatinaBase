'use client';

import { use } from 'react';
import { PageHeader, EmptyState } from '@/components/portal';
import { useFulfillmentOrder } from '@/hooks/use-fulfillment-order';
import { useFulfillmentRealtime } from '@/hooks/use-fulfillment-realtime';
import { Workbench } from '@/components/fulfillment/workbench/workbench';
import { useBreadcrumbLastLabel } from '@/contexts/breadcrumb-context';

// The Order Workbench (S2, spec §5.2). A thin page — one detail round-trip
// (useFulfillmentOrder) into the Workbench component tree; realtime keeps it
// live (a confirm/assign fired anywhere re-figures it via fulfillmentKeys.all).
// Reached from the Queue's Enter shortcut (S1 → router.push).

export default function FulfillmentOrderWorkbenchPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = use(params);
  const { data: detail, isLoading, error } = useFulfillmentOrder(orderId);
  useFulfillmentRealtime();

  const order = detail?.order;

  // Breadcrumb (R3.6, C1 fix): the raw order UUID in the URL is meaningless
  // on screen — once the order loads, swap the last breadcrumb segment for
  // "Order #{orderNo} · {clientName}". Clears itself on unmount/navigation.
  useBreadcrumbLastLabel(order ? `Order #${order.orderNo} · ${order.clientName}` : null);
  const derived = detail
    ? detail.confirmed
      ? `${detail.pos.length} vendor PO${detail.pos.length === 1 ? '' : 's'} · split confirmed`
      : detail.lines.some((l) => l.mappingState === 'unmapped')
        ? 'Unmapped lines block confirm'
        : 'Proposed split · confirm or drag'
    : '';

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title={order ? order.clientName : 'Order'}
        accent="Workbench"
        description={
          order
            ? `Order #${order.orderNo} · where one becomes six`
            : 'Loading the order…'
        }
        meta={
          detail ? (
            <span data-testid="wb-derived" className="type-meta">
              {derived}
            </span>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="space-y-4 py-6" data-testid="workbench-loading">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded bg-[var(--bg-hover)]" />
          ))}
        </div>
      )}

      {error && (
        <div className="py-10 text-center type-body text-[var(--color-error)]">
          Failed to load the order: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && !detail && (
        <EmptyState label="Order Workbench" message="This order could not be found." />
      )}

      {detail && (
        <div className="mt-4" data-testid="workbench-root">
          <Workbench detail={detail} />
        </div>
      )}
    </div>
  );
}
