'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, EmptyState } from '@/components/portal';
import { useFulfillmentQueue } from '@/hooks/use-fulfillment-queue';
import { useFulfillmentRealtime } from '@/hooks/use-fulfillment-realtime';
import { useQueueKeyboard } from '@/hooks/use-queue-keyboard';
import { QueueBands, flattenQueueRows } from '@/components/fulfillment/queue/queue-bands';
import { NoteDrawer } from '@/components/fulfillment/queue/note-drawer';
import { OpenExceptionDrawer } from '@/components/fulfillment/exceptions/open-exception-drawer';
import type { FulfillmentQueueRow } from '@patina/fulfillment';

// The Fulfillment Queue — the Back of House home screen (S1, spec §5.1).
// Three bands (Needs Action Now / Watching / Quiet), a next-action verb per
// row, six per-PO stage dots, keyboard j/k/Enter/n/x, realtime live-refresh.
// This page renders EVERY row the API returns — zero client-side filtering or
// band math (QueueBands groups purely for display, by the server-computed
// `band` field; see its header comment).

export default function FulfillmentQueuePage() {
  const router = useRouter();
  const { data, isLoading, error } = useFulfillmentQueue();
  useFulfillmentRealtime();

  const rows = useMemo<FulfillmentQueueRow[]>(() => data?.rows ?? [], [data]);
  const orderedRows = useMemo(() => flattenQueueRows(rows), [rows]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);

  const clampedIndex = orderedRows.length === 0 ? 0 : Math.min(selectedIndex, orderedRows.length - 1);
  const selectedRow: FulfillmentQueueRow | null = orderedRows[clampedIndex] ?? null;

  const openOrder = useCallback(
    (orderId: string) => {
      // The Order Workbench route is S2's — a placeholder page exists so this
      // link (and the typedRoutes build gate) is real today.
      router.push(`/fulfillment/orders/${orderId}` as any);
    },
    [router],
  );

  useQueueKeyboard({
    enabled: !isLoading && orderedRows.length > 0,
    suspended: drawerOpen || exceptionOpen,
    onNext: () =>
      setSelectedIndex((i) => (orderedRows.length === 0 ? 0 : Math.min(i + 1, orderedRows.length - 1))),
    onPrev: () => setSelectedIndex((i) => Math.max(i - 1, 0)),
    onOpen: () => {
      if (selectedRow) openOrder(selectedRow.order_id);
    },
    onNote: () => {
      if (selectedRow) setDrawerOpen(true);
    },
    onException: () => {
      if (selectedRow) setExceptionOpen(true);
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Fulfillment"
        accent="Queue"
        description="Every open Rail-A order, banded by what needs a human right now. j/k moves, Enter opens the Workbench, n drafts a note, x opens an exception."
        meta={
          data ? (
            <span data-testid="queue-total" className="type-meta">
              {data.total} open order{data.total === 1 ? '' : 's'}
            </span>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="space-y-4 py-6" data-testid="queue-loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded bg-[var(--bg-hover)]" />
          ))}
        </div>
      )}

      {error && (
        <div className="py-10 text-center type-body text-[var(--color-error)]">
          Failed to load the fulfillment queue: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && rows.length === 0 && (
        <EmptyState
          label="Fulfillment Queue"
          message="No open Rail-A orders. Seeded orders appear here once fulfillment-intake has run."
        />
      )}

      {!isLoading && !error && rows.length > 0 && (
        <div className="mt-4">
          <QueueBands
            rows={rows}
            selectedOrderId={selectedRow?.order_id ?? null}
            onOpenOrder={openOrder}
          />
        </div>
      )}

      <NoteDrawer row={selectedRow} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <OpenExceptionDrawer row={selectedRow} open={exceptionOpen} onOpenChange={setExceptionOpen} />
    </div>
  );
}
