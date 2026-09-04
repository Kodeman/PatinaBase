'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/* ── Since yesterday ────────────────────────────────────────────────────────
   The house quieted down to what moved. Not a filter and not a feed: nothing
   is removed, nothing is re-ordered, and every room stays exactly where it
   was — the ink simply drops away from parts she has already read, and a brass
   tick stands in the margin beside the parts she has not.

   ── THE CROSS-LANE CONTRACT (Lanes 3A, 3B, 4 all write to it) ──────────────

   · `data-threshold-unit="<id>"` — makes a section a UNIT. Units are what
     `deriveThreshold`'s `changed` set names, and what earns a change tick.
   · `data-dimmable` — DIMMING IS OPT-IN. This wrapper dims ONLY elements
     carrying this attribute, and NEVER anything else. A section that does not
     ask to be dimmed keeps its ink in every state.
   · `data-never-dim` — belt and braces. A dimmable element carrying it is
     still never dimmed. Put it on anything holding an open gate or the toll.
   · `data-changed` / `data-dimmed` are NOT props: this wrapper writes them
     onto the DOM. No leaf takes a `changed` prop, because the `changed` set
     from `deriveThreshold` must stay the single source of truth about what
     moved, and threading it through a dozen files across three lanes would
     make a second one.

   Opt-in is the load-bearing half. CSS `opacity` cascades to a whole subtree
   and cannot be undone by a descendant, so a dimmed letterbox would dim the
   open toll inside it whatever the toll asked for. The doorplate, the
   doorstep, the story pole, the letterbox and the gates therefore never carry
   `data-dimmable` — including the very button that gets her back out of this
   reading. ──────────────────────────────────────────────────────────────── */

/** SSR renders client components too; the browser hook only exists in a browser. */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** The deck's own dim, the tick beside it, and the narrow reading's rule. */
const SHEET = `
.threshold-since [data-dimmable] { transition: opacity 300ms ease; }
.threshold-since [data-dimmable][data-dimmed] { opacity: 0.3; }
.threshold-since [data-threshold-unit][data-changed] { position: relative; }
.threshold-since [data-threshold-unit][data-changed]::before {
  content: "";
  position: absolute;
  left: -15px;
  top: 14px;
  width: 2px;
  height: 30px;
  background: var(--threshold-accent, #8A5F19);
}
@media (max-width: 860px) {
  .threshold-since [data-dimmable][data-dimmed] {
    opacity: 1;
    border-left: 1px solid var(--border-subtle);
    padding-left: 12px;
  }
  .threshold-since [data-threshold-unit][data-changed] {
    border-left: 2px solid var(--text-primary);
    padding-left: 12px;
  }
  .threshold-since [data-threshold-unit][data-changed]::before { left: -9px; }
}
@media (max-width: 600px) {
  .threshold-since [data-threshold-unit][data-changed]::before { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .threshold-since [data-dimmable] { transition: none; }
}
`;

export interface SinceYesterdayProps {
  /** True while the client is reading the house as it moved. */
  active: boolean;
  /** Unit ids that moved since her last reading. */
  changed: Set<string>;
  children?: ReactNode;
}

export function SinceYesterday({ active, changed, children }: SinceYesterdayProps) {
  const host = useRef<HTMLDivElement>(null);

  // `changed` is a fresh Set and `children` a fresh ReactNode every render, so
  // this re-runs constantly — and that is load-bearing: it is how a unit that
  // mounts later (a room band arriving with its selections) gets marked. Do
  // not narrow the deps to [active].
  useBrowserLayoutEffect(() => {
    const root = host.current;
    if (!root) return;

    for (const unit of Array.from(root.querySelectorAll('[data-threshold-unit]'))) {
      const id = unit.getAttribute('data-threshold-unit') ?? '';
      if (active && changed.has(id)) unit.setAttribute('data-changed', 'true');
      else unit.removeAttribute('data-changed');
    }

    for (const candidate of Array.from(root.querySelectorAll('[data-dimmable]'))) {
      // A dimmable that is not itself a unit (a ledger row) answers to the
      // unit it sits in, so one changed unit un-dims everything inside it.
      const unit = candidate.closest('[data-threshold-unit]');
      const id = unit?.getAttribute('data-threshold-unit') ?? '';
      const spared = candidate.hasAttribute('data-never-dim') || changed.has(id);

      if (active && !spared) candidate.setAttribute('data-dimmed', 'true');
      else candidate.removeAttribute('data-dimmed');
    }
  }, [active, changed, children]);

  return (
    <div ref={host} className="threshold-since" data-testid="since-yesterday">
      <style href="threshold-since" precedence="default">
        {SHEET}
      </style>
      {children}
    </div>
  );
}
