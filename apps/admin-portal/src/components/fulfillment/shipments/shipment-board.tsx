'use client';

import { sortShipmentBoard, type FulfillmentShipmentRow } from '@patina/fulfillment';
import { EmptyState } from '@/components/portal';
import { ShipmentRow } from './shipment-row';

// The Shipment Board's row order (S5, spec §5.4 + package S5 scope): "sorted
// open inspection windows first (countdown rows pinned top), then by current
// ETA." All the ordering math is sortShipmentBoard's (@patina/fulfillment) —
// this component holds zero sort logic, mirroring the S2 money-strip
// constraint (formulas live in the package, components only render).

export interface ShipmentBoardProps {
  rows: FulfillmentShipmentRow[];
  nowMs?: number;
}

export function ShipmentBoard({ rows, nowMs }: ShipmentBoardProps) {
  const now = nowMs ?? Date.now();

  if (rows.length === 0) {
    return (
      <EmptyState
        label="Shipment Board"
        message="No shipments recorded yet. Add tracking for an acknowledged PO above to start one."
      />
    );
  }

  const ordered = sortShipmentBoard(rows, now);

  return (
    <div data-testid="shipment-board" className="flex flex-col">
      {ordered.map((row) => (
        <ShipmentRow key={row.id} row={row} nowMs={now} />
      ))}
    </div>
  );
}
