'use client';

import { useEffect } from 'react';

/* ── ONE LOCK, COUNTED ───────────────────────────────────────────────────────
   Two sheets mount inside the same `threshold.tsx` wrapper — the papers and
   the client's details — and each used to capture `body.style.overflow` on
   open and write it back on close. Open both and close them in the other
   order and the second one writes back `"hidden"`: the page behind is locked
   with no overlay on screen and nothing to unlock it.

   So the overflow is captured once, by the first lock, and restored once, by
   the last release. ──────────────────────────────────────────────────────── */

let held = 0;
let restore = '';

/** @internal Test seam: a fresh page has no locks held. */
export function resetScrollLock(): void {
  held = 0;
  restore = '';
}

/** Holds the page behind an overlay still while `active`. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (held === 0) {
      restore = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    held += 1;
    return () => {
      held -= 1;
      if (held === 0) document.body.style.overflow = restore;
    };
  }, [active]);
}
