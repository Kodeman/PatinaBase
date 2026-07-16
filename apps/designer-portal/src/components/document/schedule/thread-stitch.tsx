'use client';

/**
 * Thread stitch — a thread-lane phase hosted inside a main-lane entry (C6).
 * Prototype: `.mb-thread` in the-document-schedule-master-direction.html.
 *
 * Parallel work (procurement is the canonical thread) is never forced into
 * sequence — it renders as one quiet running stitch beneath the host phase's
 * rows: a 22px dashed dusty-blue stroke, then the mono line
 * `{name} runs alongside · {fmt(start)} – {fmt(end)}`. Missing dates drop the
 * range segment entirely (never a stray separator). Zero shadows (D4).
 */

import { fmtDay } from '@/lib/document/format';

export interface ThreadStitchProps {
  name: string;
  start: string | null;
  end: string | null;
  /** Optional trailing mono segment (e.g. an FF&E lines-ordered read). */
  meta?: string | null;
}

export function ThreadStitch({ name, start, end, meta }: ThreadStitchProps) {
  const range = start && end ? ` · ${fmtDay(start)} – ${fmtDay(end)}` : '';
  return (
    <div
      className="mt-[0.55rem] inline-flex items-center gap-[0.5rem] font-mono text-[0.6rem] uppercase tracking-[0.07em]"
      // The slide darkens the thread INK below the stitch's dusty-blue for
      // legibility on the paper (#5f7488) — port the rendered ink, not the var.
      style={{ color: '#5f7488' }}
    >
      <span
        aria-hidden
        className="h-px w-[22px] flex-none"
        style={{
          background:
            'repeating-linear-gradient(to right, var(--color-dusty-blue) 0 4px, transparent 4px 8px)',
        }}
      />
      <span>
        {name} runs alongside
        {range}
        {meta ? ` · ${meta}` : ''}
      </span>
    </div>
  );
}
