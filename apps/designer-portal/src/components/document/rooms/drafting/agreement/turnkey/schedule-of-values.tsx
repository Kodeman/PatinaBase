"use client";

/**
 * The schedule of values, exactly as the homeowner will read it.
 *
 * There is no separate schedule-of-values PART, on purpose: whichever mode is
 * elected, one total lives on the pricing basis and the homeowner cannot read
 * a second one that drifted from it.
 *
 * Two modes, elected by the sub-disclosure clause (R13, RC-4, R43):
 *
 *   · closed-book — the studio's OWN lines, written on the pricing basis
 *     above. Nothing here is derived from the cost lines, because a derived
 *     table is a uniform multiple of them and divides straight back into a
 *     trade's bid;
 *   · open-book — the trades stand at cost and the fee is its own line.
 *
 * Read-only by construction: this is the display, and the editor above is
 * where a closed-book line is typed.
 */

import type {
  DesignBuildPricingBasisPayload,
  SubDisclosureMode,
} from "@patina/types";
import {
  contractSumCents,
  contractSumLabel,
  scheduleOfValues,
} from "@/lib/document/design-build";
import { turnkeyMoney } from "./money";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export const CLOSED_BOOK_NOTE =
  "Closed-book — your client reads the lines you wrote, not the trades' costs.";
export const OPEN_BOOK_NOTE =
  "Open-book — the trades stand at cost and the fee is its own line.";

export const UNWRITTEN_NOTE =
  "The schedule of values appears once the contract sum, the open-book or closed-book choice, and the lines beneath them are written.";

export function ScheduleOfValues({
  basis,
  mode,
  currency = "USD",
}: {
  basis: DesignBuildPricingBasisPayload;
  /** Null until the sub-disclosure clause elects one. Pro-rating IS the
   *  closed-book presentation, so there is no table to draw until it does. */
  mode: SubDisclosureMode | null;
  currency?: string;
}) {
  const lines = scheduleOfValues(basis, mode);
  const sum = contractSumCents(basis);

  if (lines.length === 0 || sum === null || mode === null) {
    return (
      <p className="text-[11.5px] italic text-[var(--text-muted)]">
        {UNWRITTEN_NOTE}
      </p>
    );
  }

  return (
    <section aria-label="Schedule of values" className="space-y-2">
      <p className={LABEL}>Schedule of values</p>
      <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
        {mode === "open_book" ? OPEN_BOOK_NOTE : CLOSED_BOOK_NOTE}
      </p>
      <div className="divide-y divide-[var(--doc-ink-border)] border-y border-[var(--doc-ink-border)]">
        {lines.map((line) => (
          <div
            key={line.id}
            data-sov-line={line.id}
            className="flex items-baseline justify-between gap-4 py-2"
          >
            <span className="text-[12px] text-[var(--text-body)]">
              {line.label}
            </span>
            <strong className="font-mono text-[11px] font-medium text-[var(--color-charcoal)]">
              {turnkeyMoney(line.cents, currency)}
            </strong>
          </div>
        ))}
      </div>
      <div className="flex items-baseline justify-between gap-4 pt-1">
        <span className={LABEL}>{contractSumLabel(basis.basis)}</span>
        <strong className="font-mono text-[12px] font-medium text-[var(--color-charcoal)]">
          {turnkeyMoney(sum, currency)}
        </strong>
      </div>
    </section>
  );
}
