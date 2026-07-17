'use client';

import { PageHeader } from '@/components/portal';
import { useFulfillmentShipments } from '@/hooks/use-fulfillment-shipments';
import { useFulfillmentRealtime } from '@/hooks/use-fulfillment-realtime';
import { ShipmentBoard } from '@/components/fulfillment/shipments/shipment-board';
import { AddShipmentForm } from '@/components/fulfillment/shipments/add-shipment-form';

// The Shipment Board (S5, spec §5.4) — replaces the S1 placeholder. Rows are
// shipments, not orders: mode chips lead, promised-vs-current ETA in mono
// with a terracotta slip delta, and an open inspection window's countdown is
// the loudest element on the board (BOH-DECISIONS I5). Live-refreshes off the
// same fulfillment_events realtime channel every other Back of House screen
// uses (use-fulfillment-realtime.ts invalidates fulfillmentKeys.all, which
// shipmentKeys.all() is rooted under).

export default function FulfillmentShipmentsPage() {
  const { data, isLoading, error } = useFulfillmentShipments();
  useFulfillmentRealtime();

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Shipments"
        accent="Board"
        description="Rows are shipments, not orders — mode chips, freight discipline, inspection windows. Open windows pin to the top."
        meta={
          data ? (
            <span data-testid="shipments-total" className="type-meta">
              {data.shipments.length} shipment{data.shipments.length === 1 ? '' : 's'}
            </span>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="space-y-4 py-6" data-testid="shipments-loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-[var(--bg-hover)]" />
          ))}
        </div>
      )}

      {error && (
        <div className="py-10 text-center type-body text-[var(--color-error)]">
          Failed to load the Shipment Board: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && data && (
        <div className="mt-4">
          <AddShipmentForm eligiblePos={data.eligiblePos} />
          <ShipmentBoard rows={data.shipments} />
        </div>
      )}
    </div>
  );
}
