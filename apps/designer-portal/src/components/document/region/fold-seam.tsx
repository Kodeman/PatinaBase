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
 */

import type { ReactNode } from 'react';

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
  bodyId,
  name,
  summary,
  onUnfold,
  surfaceKey,
  regionKey,
}: FoldSeamProps) {
  return (
    <button
      type="button"
      aria-expanded={false}
      aria-controls={bodyId}
      data-fold-seam={headingId}
      data-action-region={regionKey}
      data-surface-key={surfaceKey}
      onClick={onUnfold}
      className="grid min-h-11 w-full grid-cols-[auto_1fr_auto] items-baseline gap-3 px-3 py-2 text-left"
    >
      <span className="font-heading text-[12.5px] font-medium italic text-[var(--color-charcoal)]">
        {name}
      </span>
      <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
        {summary}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay)]">
        unfold ↓
      </span>
    </button>
  );
}
