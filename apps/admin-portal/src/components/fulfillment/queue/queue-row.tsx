"use client";

import type { ReactNode } from "react";
import type { FulfillmentQueueRow } from "@patina/fulfillment";
import {
  describeNextAction,
  formatStageAge,
  isBreachedAge,
} from "@patina/fulfillment";
import {
  deriveFulfillmentLifecycle,
  FULFILLMENT_LINE_STATES,
} from "@patina/types";
import { ListRow } from "@/components/portal";
import { LineLifecycleGlance } from "../shared/line-lifecycle-glance";

// A single Fulfillment Queue row (S1, spec §5.1): mono order number + client
// name, a meta line (vendor count / designer-sourced / unmapped / exception
// counts), the order's six lifecycle stage dots, and the right-edge
// next-action verb in clay — terracotta when the row is SLA-breached. Renders
// whatever the queue view gives it: an unrecognized next_action_kind still
// renders (describeNextAction falls back to a neutral verb) — this row is
// never dropped for that reason.
//
// WP4 Track 3 adds the R7 lifecycle glance (12px current-position stamp +
// "Next gate") to the meta line, ADDITIVE beside the row's existing
// derived_status/next-action vocabulary — never replacing it (the
// checkpoint's unified-contract ruling). When `derived_status` IS a chain
// word, it's literally the same order_items.line_state value
// `deriveFulfillmentLifecycle` already reads (00353's
// fulfillment_order_status_v), at the order's MIN stage — the same
// "furthest-behind line" the row's own stage dots and next-action verb are
// already derived from, so feeding it to the mapper is not a new fact, just
// the fifteen-step reading of one the queue already carries.
//
// `derived_status` is NOT always a chain word, though: the view overrides it
// to `needs_mapping` (any unmapped line) or `exception` (any open exception)
// BEFORE falling back to the chain lookup — which is exactly the queue's
// highest-priority band, Needs Action Now. Neither override is in
// FULFILLMENT_LINE_STATES, so the glance renders nothing there, which is the
// honest answer: an order sitting on an unmapped line or an open exception
// isn't progressing through the chain at all, so there is no single chain
// position left to report a stamp for — and the row's own unmapped/exception
// chips already carry that signal, so the glance would only repeat it, not
// add to it.

// The order's SIX lifecycle stages (R3.4, C1 fix) — fixed dots on EVERY row
// from intake (all empty) through delivered (all filled), replacing the old
// per-PO dots (which rendered nothing pre-split, drop-1 KNOWN DEVIATION #1,
// and whose count varied 1–6 with the order's vendor count). Mirrors
// fulfillment_order_status_v / _queue_v's stage array (00353):
// ['intake','split','transmitted','acknowledged','in_production','shipped',
// 'delivered','settled'] — index 1 (intake) is the pre-split "nothing filled
// yet" state and isn't itself a dot; 'settled' is excluded because
// fulfillment_queue_v never surfaces settled orders (spec §5.1
// zero-invisibility, scoped to non-settled).
const LIFECYCLE_STAGES: ReadonlyArray<{ key: string; label: string }> = [
  { key: "split", label: "Split" },
  { key: "transmitted", label: "Transmitted" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "in_production", label: "In production" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

/** min_stage_idx 1 (intake) → 0 filled … 7 (delivered) → 6 filled; 8
 *  (settled, never actually reaches this row) clamps to 6. */
function filledStageCount(minStageIdx: number | null): number {
  if (minStageIdx == null) return 0;
  return Math.max(0, Math.min(LIFECYCLE_STAGES.length, minStageIdx - 1));
}

function StageDots({ minStageIdx }: { minStageIdx: number | null }) {
  const filled = filledStageCount(minStageIdx);
  return (
    <span className="inline-flex items-center gap-1" data-testid="stage-dots">
      {LIFECYCLE_STAGES.map((stage, i) => {
        const isFilled = i < filled;
        const color = isFilled
          ? "var(--color-sage, var(--color-success))"
          : "var(--border-default)";
        return (
          <span
            key={stage.key}
            data-testid="stage-dot"
            data-stage={stage.key}
            data-filled={isFilled}
            title={stage.label}
            className="inline-block h-1.5 w-1.5 rounded-full border"
            style={{
              borderColor: color,
              backgroundColor: isFilled ? color : "transparent",
            }}
          />
        );
      })}
    </span>
  );
}

export interface QueueRowProps {
  row: FulfillmentQueueRow;
  selected: boolean;
  onOpen: () => void;
}

const RECOGNIZED_LINE_STATES = new Set<string>(FULFILLMENT_LINE_STATES);

export function QueueRow({ row, selected, onOpen }: QueueRowProps) {
  const breached = isBreachedAge(row.breached);
  const verb = describeNextAction({
    kind: row.next_action_kind,
    params: row.next_action_params ?? undefined,
  });
  const age = formatStageAge(row.stage_age_business_hours);

  // `derived_status` is the order's min-stage line_state word WHEN the view
  // has one to give (00353) — it's overridden to `needs_mapping` /
  // `exception` first, ahead of any chain position, on exactly the rows the
  // queue's own unmapped/exception chips already flag. Feed the chain word
  // to Rail A's mapper for the additive glance; skip on anything the chain
  // doesn't recognize (the two overrides included) rather than guessing a
  // position — those rows have no single chain position to report.
  const lifecycleReading = RECOGNIZED_LINE_STATES.has(row.derived_status)
    ? deriveFulfillmentLifecycle({
        line_state: row.derived_status,
        line_state_entered_at: row.stage_entered_at,
      })
    : null;

  const metaParts: Array<string | ReactNode | undefined | false> = [
    row.vendor_count > 0
      ? `${row.vendor_count} vendor${row.vendor_count === 1 ? "" : "s"}`
      : undefined,
    row.designer_attribution ? "designer-sourced" : undefined,
    row.has_unmapped ? `${row.unmapped_count} unmapped` : undefined,
    row.open_exceptions > 0
      ? `${row.open_exceptions} exception${row.open_exceptions === 1 ? "" : "s"}`
      : undefined,
    lifecycleReading ? (
      <LineLifecycleGlance key="lifecycle" reading={lifecycleReading} />
    ) : undefined,
  ];

  return (
    <div
      data-testid="queue-row"
      data-order-id={row.order_id}
      data-band={row.band}
      data-selected={selected}
      className={
        selected
          ? "outline outline-2 outline-offset-[-2px] outline-[var(--color-clay)]"
          : undefined
      }
    >
      <ListRow
        onClick={onOpen}
        title={
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[0.72rem] text-[var(--text-muted)]">
              #{row.order_no}
            </span>
            <span>{row.client_name}</span>
          </span>
        }
        meta={metaParts}
        right={
          <div className="flex items-center gap-4">
            <StageDots minStageIdx={row.min_stage_idx} />
            <div className="text-right">
              <div
                data-testid="queue-row-verb"
                className="text-[0.78rem] font-medium"
                style={{ color: "var(--color-clay)" }}
              >
                {verb}
              </div>
              <div
                data-testid="queue-row-age"
                data-breached={breached}
                className="mt-0.5 font-mono text-[0.66rem]"
                style={{
                  color: breached
                    ? "var(--color-terracotta, var(--color-error))"
                    : "var(--text-subtle)",
                }}
              >
                {age}
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}
