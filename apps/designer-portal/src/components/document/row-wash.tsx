'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

/** The nine pigments a washed row can wear: the six stage tabs a roster line
 *  takes from its movement, and the three state pigments an FF&E line takes
 *  from its own state (clay where a line has no state). */
export type RowWashTone =
  | 'brief'
  | 'discovery'
  | 'direction'
  | 'proposal'
  | 'project'
  | 'install'
  | 'clay'
  | 'golden'
  | 'terracotta';

/* The ink knows where it was touched: park the contact point on the row as
   --ink-x/--ink-y so the wash's clip-path circle opens from exactly there.
   This is DocumentAction's markInkPoint, which is module-private there. */
function markInkPoint(event: ReactPointerEvent<HTMLElement>) {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  target.style.setProperty('--ink-x', `${event.clientX - rect.left}px`);
  target.style.setProperty('--ink-y', `${event.clientY - rect.top}px`);
}

/** Handlers for the row that HOSTS the wash — the element carrying
 *  `.has-wash`. onPointerEnter places the point before the first frame of the
 *  sweep, so a fast pointer never opens the circle from the stale centre. */
export function useRowWash() {
  return { onPointerMove: markInkPoint, onPointerEnter: markInkPoint };
}

/** The wash itself: a sibling inside the row's own stacking context, painting
 *  over the ground and under every word. Decorative — it carries no meaning a
 *  screen reader needs, and the row's own words carry all of it. */
export function RowWash({ tone }: { tone: RowWashTone }) {
  return (
    <span
      aria-hidden
      className="row-wash"
      style={
        {
          '--wash': `var(--wash-${tone})`,
          '--wash-still': `var(--wash-${tone}-still)`,
        } as CSSProperties
      }
    />
  );
}
