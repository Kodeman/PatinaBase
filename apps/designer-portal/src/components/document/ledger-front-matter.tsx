'use client';

/**
 * Ledger front-matter band (R5: Insights distributes as each ledger's
 * opening summary — never a dashboard book). A quiet stat row at the top of
 * a ledger sheet: a mono label + a few stat pairs. Charcoal-sheet styling.
 */

export interface FrontMatterStat {
  label: string;
  value: string;
}

export function LedgerFrontMatter({
  caption,
  stats,
}: {
  /** The summary's one-word lens, e.g. "throughput" / "utilization". */
  caption: string;
  stats: FrontMatterStat[];
}) {
  if (stats.length === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-y border-[rgba(250,247,242,0.1)] py-2.5">
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-clay)]">
        {caption}
      </span>
      {stats.map((s) => (
        <span key={s.label} className="flex items-baseline gap-1.5">
          <span className="font-heading text-[15px] text-[var(--color-off-white)]">{s.value}</span>
          <span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[rgba(250,247,242,0.45)]">
            {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}
