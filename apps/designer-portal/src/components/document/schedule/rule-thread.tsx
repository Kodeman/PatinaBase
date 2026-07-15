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
 * today). Read-only.
 *
 * Lanes (live-walk defect D-4): the prototype drew its single thread at y112;
 * two-plus threads at one y overprint each other's labels mid-line. Each
 * thread now gets its OWN lane row — `laneIndex` (array order, one lane per
 * thread, no packing) offsets the whole block by +20px per lane. 20px is the
 * block's real occupancy (label ~y-15..-6, hairline+caps y-2.5..+3.5), so
 * lane N+1's label clears lane N's caps; the orchestrator grows the canvas by
 * the same pitch per extra lane. Decoration: aria-hidden AND
 * `pointer-events-none` (D-2). Zero shadows (D4).
 */

import { fmtDay } from '@/lib/document/format';

/** First lane's hairline y (prototype `.ma-proc` top) + per-lane pitch. */
export const THREAD_LANE_TOP = 112;
export const THREAD_LANE_PITCH = 20;

export interface RuleThreadProps {
  leftPct: number;
  widthPct: number;
  name: string;
  start: string | null;
  end: string | null;
  /** This thread's lane row (0-based, array order); each lane sits
   *  THREAD_LANE_PITCH below the previous. */
  laneIndex: number;
}

export function RuleThread({ leftPct, widthPct, name, start, end, laneIndex }: RuleThreadProps) {
  const range = start && end ? ` · runs ${fmtDay(start)} – ${fmtDay(end)}` : '';
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: `${leftPct}%`,
        width: `${Math.max(0, widthPct)}%`,
        top: THREAD_LANE_TOP + laneIndex * THREAD_LANE_PITCH,
        height: 1,
      }}
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
