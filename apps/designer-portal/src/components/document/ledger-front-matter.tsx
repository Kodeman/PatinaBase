'use client';

/**
 * Ledger front-matter band (R5: Insights distributes as each ledger's
 * opening summary — never a dashboard book). A quiet stat row at the top of
 * a ledger sheet: a mono label + a few stat pairs. Ink-on-paper (R96).
 *
 * help-desk Wave 1 — an optional `helpKey` renders the shared `?` doorway
 * right after the stat caption, opening the contextual panel scoped to that
 * key with source 'front-matter'.
 */

import { HelpGlyph } from './overlays/doc-sheet';
import { fmtUsd } from '@/lib/document/format';

export interface FrontMatterStat {
  label: string;
  value: string;
}

/**
 * The bill run (D2 §M5.6, D1-11): one total over exactly the orders the
 * `payment · due` lens shows — the sum of their scheduled rows in state
 * `due`, and how many orders carry one. V11: a total over the rows that
 * produced it; no tile, no chart, no red/green. Empty when nothing is due.
 */
export function dueToMakers(
  orders: ReadonlyArray<{
    payments?: ReadonlyArray<{ state: string; amount_cents?: number | null }> | null;
  }>,
): FrontMatterStat[] {
  let cents = 0;
  let count = 0;
  for (const o of orders) {
    const due = (o.payments ?? []).filter((p) => p.state === 'due');
    if (due.length === 0) continue;
    count += 1;
    cents += due.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
  }
  if (count === 0) return [];
  return [
    {
      value: fmtUsd(cents),
      label: `across ${count} ${count === 1 ? 'order' : 'orders'}`,
    },
  ];
}

export function LedgerFrontMatter({
  caption,
  stats,
  helpKey,
}: {
  /** The summary's one-word lens, e.g. "throughput" / "utilization". */
  caption: string;
  stats: FrontMatterStat[];
  /** When set, the caption carries the `?` doorway → openHelp({ source:
   *  'front-matter', surfaceKey: helpKey }). Always a DOCUMENT_SURFACE_KEYS
   *  constant, never a string literal. */
  helpKey?: string;
}) {
  if (stats.length === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-y border-[var(--color-pearl)] py-2.5">
      <span className="flex items-baseline gap-1">
        <span className="doc-type-meta font-semibold uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
          {caption}
        </span>
        {helpKey ? (
          <HelpGlyph
            helpKey={helpKey}
            source="front-matter"
            label="About this ledger"
          />
        ) : null}
      </span>
      {stats.map((s) => (
        <span key={s.label} className="flex items-baseline gap-1.5">
          <span className="font-heading text-[15px] text-[var(--color-charcoal)]">
            {s.value}
          </span>
          <span className="doc-type-meta uppercase tracking-[0.06em] text-[var(--color-quiet-ink)]">
            {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}
