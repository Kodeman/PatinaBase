"use client";

/**
 * The schedule of values — DERIVED from the cost lines, never authored.
 *
 * There is no separate schedule-of-values part, on purpose: an authored total
 * and a derived total drift, and the homeowner reads whichever one the page
 * happened to print. The cost lines are the one authored thing; this table is
 * what they come to.
 *
 * Two display modes, elected by the sub-disclosure clause (R13, RC-4):
 *
 *   · closed-book — every line carries its share of the fee, so no line
 *     divided by (1 + fee) hands the homeowner a trade's bid;
 *   · open-book — the trades stand at cost and the fee is its own line.
 *
 * Read-only by construction. Nothing on this table is typed.
 */

import type {
  DesignBuildPricingBasisPayload,
  SubDisclosureMode,
} from "@patina/types";
import {
  contractSumCents,
  CONTRACT_SUM_LABELS,
  scheduleOfValues,
} from "@/lib/document/design-build";
import { turnkeyMoney } from "./money";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export const CLOSED_BOOK_NOTE =
  "Closed-book — each line carries its share of the fee.";
export const OPEN_BOOK_NOTE =
  "Open-book — the trades stand at cost and the fee is its own line.";

export function ScheduleOfValues({
  basis,
  mode,
  currency = "USD",
}: {
  basis: DesignBuildPricingBasisPayload;
  mode: SubDisclosureMode;
  currency?: string;
}) {
  const lines = scheduleOfValues(basis, mode);
  const sum = contractSumCents(basis);

  if (lines.length === 0 || sum === null) {
    return (
      <p className="text-[11.5px] italic text-[var(--text-muted)]">
        The schedule of values appears once the cost lines and the contract sum
        are written.
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
        <span className={LABEL}>{CONTRACT_SUM_LABELS[basis.basis]}</span>
        <strong className="font-mono text-[12px] font-medium text-[var(--color-charcoal)]">
          {turnkeyMoney(sum, currency)}
        </strong>
      </div>
    </section>
  );
}
