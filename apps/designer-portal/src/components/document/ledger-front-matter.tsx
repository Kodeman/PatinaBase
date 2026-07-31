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

export interface FrontMatterStat {
  label: string;
  value: string;
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
