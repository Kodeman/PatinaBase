'use client';

import type { FulfillmentQueueRow } from '@patina/fulfillment';
import { QueueRow } from './queue-row';

// The Fulfillment Queue's three bands (S1, spec §5.1) rendered as Strata
// sections — a hairline rule + count, never a tab. Band PLACEMENT is entirely
// server-computed (`fulfillment_queue_v.band`, 00353); this component does
// ZERO band math — it only groups the rows it's handed by the `band` string
// the API already returned, for display. Every row the API returns renders
// somewhere on this page: the three known bands are grouped explicitly, and
// anything with a `band` value outside that set (which the current SQL CASE
// cannot produce, but this is the UI half of the zero-invisibility invariant)
// still surfaces in a catch-all "Other" section rather than vanishing.

const BAND_LABELS: Record<string, string> = {
  needs_action_now: 'Needs Action Now',
  watching: 'Watching',
  quiet: 'Quiet',
};
const BAND_ORDER = ['needs_action_now', 'watching', 'quiet'] as const;

/**
 * The same top-to-bottom order QueueBands renders in: known bands first (in
 * BAND_ORDER), then any row whose `band` falls outside that set (the "Other"
 * catch-all). Exported so the page's j/k keyboard traversal visits rows in
 * exactly the order they appear on screen — one source of truth for ordering,
 * shared between the renderer and the keyboard handler.
 */
export function flattenQueueRows(rows: FulfillmentQueueRow[]): FulfillmentQueueRow[] {
  const known = BAND_ORDER.flatMap((band) => rows.filter((r) => r.band === band));
  const other = rows.filter((r) => !(BAND_ORDER as readonly string[]).includes(r.band));
  return [...known, ...other];
}

export interface QueueBandsProps {
  rows: FulfillmentQueueRow[];
  selectedOrderId: string | null;
  onOpenOrder: (orderId: string) => void;
}

export function QueueBands({ rows, selectedOrderId, onOpenOrder }: QueueBandsProps) {
  const grouped = BAND_ORDER.map((band) => ({
    band,
    label: BAND_LABELS[band],
    rows: rows.filter((r) => r.band === band),
  }));
  const otherRows = rows.filter((r) => !(BAND_ORDER as readonly string[]).includes(r.band));

  return (
    <div className="flex flex-col gap-10" data-testid="queue-bands">
      {grouped.map(({ band, label, rows: bandRows }) => (
        <section key={band} data-testid={`queue-band-${band}`}>
          <div className="flex items-baseline justify-between border-b border-[var(--border-default)] pb-2">
            <h2
              className="type-section-head"
              style={
                band === 'needs_action_now'
                  ? { color: 'var(--color-terracotta, var(--color-error))' }
                  : undefined
              }
            >
              {label}
            </h2>
            <span className="type-meta-small" data-testid={`queue-band-count-${band}`}>
              {bandRows.length}
            </span>
          </div>
          {bandRows.length === 0 ? (
            <p className="type-body-small py-6 italic text-[var(--text-subtle)]">
              Nothing here.
            </p>
          ) : (
            <div>
              {bandRows.map((row) => (
                <QueueRow
                  key={row.order_id}
                  row={row}
                  selected={row.order_id === selectedOrderId}
                  onOpen={() => onOpenOrder(row.order_id)}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      {otherRows.length > 0 && (
        <section data-testid="queue-band-other">
          <div className="flex items-baseline justify-between border-b border-[var(--border-default)] pb-2">
            <h2 className="type-section-head">Other</h2>
            <span className="type-meta-small" data-testid="queue-band-count-other">
              {otherRows.length}
            </span>
          </div>
          <div>
            {otherRows.map((row) => (
              <QueueRow
                key={row.order_id}
                row={row}
                selected={row.order_id === selectedOrderId}
                onOpen={() => onOpenOrder(row.order_id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
