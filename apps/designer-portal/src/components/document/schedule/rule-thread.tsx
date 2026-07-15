'use client';

/**
 * Rule thread — the parallel hairline for a thread-lane phase (C6 · R99,
 * Slice 02). Prototype: `.ma-proc` (+ its `::before`/`::after` end-caps and
 * `span` label) in the-document-schedule-master-direction.html.
 *
 * Procurement is the canonical thread: work that runs ALONGSIDE the main line,
 * never forced into it. It draws as one quiet aged-oak hairline (70% ink) with
 * short end-caps, beneath the main rule, its mono label naming the span. Folds
 * away when pinned (foldedLayers.thread — the fold keeps only line, diamonds,
 * today). Read-only. Zero shadows (D4).
 */

import { fmtDay } from '@/lib/document/format';

export interface RuleThreadProps {
  leftPct: number;
  widthPct: number;
  name: string;
  start: string | null;
  end: string | null;
}

export function RuleThread({ leftPct, widthPct, name, start, end }: RuleThreadProps) {
  const range = start && end ? ` · runs ${fmtDay(start)} – ${fmtDay(end)}` : '';
  return (
    <div
      aria-hidden
      className="absolute"
      style={{ left: `${leftPct}%`, width: `${Math.max(0, widthPct)}%`, top: 112, height: 1 }}
    >
      {/* the hairline + its two end-caps (the prototype's ::before/::after) */}
      <span
        className="absolute inset-x-0"
        style={{ top: 0, height: 1, background: 'var(--color-aged-oak)', opacity: 0.7 }}
      />
      <span
        className="absolute left-0"
        style={{ top: -2.5, width: 1, height: 6, background: 'var(--color-aged-oak)', opacity: 0.7 }}
      />
      <span
        className="absolute right-0"
        style={{ top: -2.5, width: 1, height: 6, background: 'var(--color-aged-oak)', opacity: 0.7 }}
      />
      <span className="absolute left-0 top-[-15px] whitespace-nowrap font-mono text-[0.56rem] uppercase tracking-[0.07em] text-[var(--color-aged-oak)]">
        {name} runs alongside{range}
      </span>
    </div>
  );
}
