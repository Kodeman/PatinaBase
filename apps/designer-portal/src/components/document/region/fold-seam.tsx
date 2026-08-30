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
 * over from the ↑ the head was wearing a frame ago.
 *
 * C1 — the settle is a CSS KEYFRAME (`.fold-settle` / `.fold-arrow-settle`,
 * globals.css, both inside a `prefers-reduced-motion: no-preference` block),
 * not a hydration-gated opacity. A folded region's only control must never be
 * invisible while it waits for JS: the server-rendered seam paints visible on
 * the first frame, and `animation-fill-mode: both` holds the from-state for
 * exactly the one frame before the animation starts. Nothing here is state, so
 * there is nothing to hydrate and nothing to mismatch.
 */

import type { ReactNode } from 'react';

export interface FoldSeamProps {
  headingId: string;
  bodyId: string;
  name: ReactNode;
  summary: ReactNode;
  /** Why the region stands folded. `'CLOSED BY YOU'` only ever comes from an
   *  explicit choice (`useRegionFold`), so a derived-default fold prints
   *  nothing here. */
  cause?: 'CLOSED BY YOU' | null;
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
  cause = null,
  onUnfold,
  surfaceKey,
  regionKey,
}: FoldSeamProps) {
  return (
    <button
      type="button"
      aria-expanded={false}
      // No aria-controls: a folded region's body is UNMOUNTED, so the id would
      // point at nothing and assistive tech would offer a jump into a void.
      // `bodyId` stays in the props so the seam and the head it stands in for
      // still name the same body once it is back on the page.
      data-fold-seam={headingId}
      data-action-region={regionKey}
      data-surface-key={surfaceKey}
      onClick={onUnfold}
      className="fold-settle grid min-h-11 w-full grid-cols-[auto_1fr_auto] items-baseline gap-3 px-3 py-2 text-left"
    >
      <span className="font-heading text-[12.5px] font-medium italic text-[var(--color-charcoal)]">
        {name}
      </span>
      {/* One cell, so the cause rides the summary's own line: a fourth grid
          column would open an implicit row and the seam would stop being the
          44px one-line control its target size rests on. */}
      <span className="flex min-w-0 items-baseline gap-2 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
        <span className="truncate">{summary}</span>
        {cause ? (
          <span data-fold-cause className="shrink-0">
            {cause}
          </span>
        ) : null}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-clay-ink)]">
        unfold{' '}
        <span data-fold-arrow className="fold-arrow-settle inline-block">
          ↓
        </span>
      </span>
    </button>
  );
}
