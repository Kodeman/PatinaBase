'use client';

/**
 * A folded region, printed as one seam: its name, what it currently says, and
 * the word that opens it. The whole seam is the control — there is nothing
 * else on the line to click, so a 44px band is the honest target.
 *
 * Focus contract: FoldSeam only calls `onUnfold`. The seam itself unmounts on
 * the caller's re-render, so it cannot move focus after the fact; the caller
 * unfolds and then calls `focusRegionHeading(headingId)` (in the same handler
 * or an effect, once the body is on the page) to land focus on the heading the
 * seam was standing in for.
 *
 * R126 — fold MOTION, without touching fold STATE: the seam still hard-swaps
 * with the region body (nothing height-collapses, nothing stays mounted), but
 * the seam settles in on mount — opacity and a 4px drop — and its arrow flips
 * over from the ↑ the head was wearing a frame ago. The settle is a mount
 * transition rather than a keyframe because the paper's keyframes are all
 * declared in globals.css, which this lane does not own.
 */

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

export interface FoldSeamProps {
  headingId: string;
  bodyId: string;
  name: ReactNode;
  summary: ReactNode;
  onUnfold: () => void;
  surfaceKey: string;
  regionKey: string;
}

/** Land focus on a region's heading after its body has been unfolded. */
export function focusRegionHeading(headingId: string): void {
  if (typeof document === 'undefined') return;
  document.getElementById(headingId)?.focus({ preventScroll: true });
}

export function FoldSeam({
  headingId,
  name,
  summary,
  onUnfold,
  surfaceKey,
  regionKey,
}: FoldSeamProps) {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    // A frame, not a timeout: the first paint has to carry the FROM state or
    // there is nothing to animate away from.
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <button
      type="button"
      aria-expanded={false}
      // No aria-controls: a folded region's body is UNMOUNTED, so the id would
      // point at nothing and assistive tech would offer a jump into a void.
      // `bodyId` stays in the props so the seam and the head it stands in for
      // still name the same body once it is back on the page.
      data-fold-seam={headingId}
      data-fold-settled={settled ? 'true' : 'false'}
      data-action-region={regionKey}
      data-surface-key={surfaceKey}
      onClick={onUnfold}
      className={`grid min-h-11 w-full grid-cols-[auto_1fr_auto] items-baseline gap-3 px-3 py-2 text-left motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-[var(--ease-editorial)] ${
        settled ? '' : 'motion-safe:-translate-y-[4px] motion-safe:opacity-0'
      }`}
    >
      <span className="font-heading text-[12.5px] font-medium italic text-[var(--color-charcoal)]">
        {name}
      </span>
      <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
        {summary}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay-ink)]">
        unfold{' '}
        <span
          data-fold-arrow
          className={`inline-block motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[var(--ease-editorial)] ${
            settled ? '' : 'motion-safe:rotate-180'
          }`}
        >
          ↓
        </span>
      </span>
    </button>
  );
}
