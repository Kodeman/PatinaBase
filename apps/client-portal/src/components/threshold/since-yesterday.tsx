'use client';

import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/* ── Since yesterday ────────────────────────────────────────────────────────
   The whole house, quieted down to what moved. Not a filter and not a feed:
   nothing is removed, nothing is re-ordered, and every room stays exactly
   where it was — the ink simply drops away from the parts she has already
   read, and a brass tick stands in the margin beside the parts she has not.

   Two rules make it safe to walk in this state:

   · An open gate and the toll never dim. Whatever else has gone quiet, the
     things that are actually asking for her hand keep their ink — a section
     says so by carrying [data-never-dim].
   · The marking is done on the DOM rather than through props, because the
     units are composed by Lanes 3A, 3B and 4 across a dozen files and a
     prop threaded through all of them would be a second source of truth
     about what moved. The `changed` set from `deriveThreshold` is the only
     one. ────────────────────────────────────────────────────────────────── */

/** Quarter ink — the deck's own dim, and the tick that stands beside it. */
const SHEET = `
.threshold-since [data-threshold-unit][data-dimmed] { opacity: 0.25; }
.threshold-since [data-threshold-unit] { transition: opacity 300ms ease; }
.threshold-since [data-threshold-unit][data-changed] { position: relative; }
.threshold-since [data-threshold-unit][data-changed]::before {
  content: "";
  position: absolute;
  left: -15px;
  top: 14px;
  width: 2px;
  height: 30px;
  background: var(--threshold-accent, var(--color-gold));
}
@media (max-width: 860px) {
  .threshold-since [data-threshold-unit][data-changed]::before { left: -9px; }
}
@media (prefers-reduced-motion: reduce) {
  .threshold-since [data-threshold-unit] { transition: none; }
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

  useLayoutEffect(() => {
    const root = host.current;
    if (!root) return;

    for (const unit of Array.from(root.querySelectorAll('[data-threshold-unit]'))) {
      const id = unit.getAttribute('data-threshold-unit') ?? '';
      const moved = changed.has(id);

      if (active && moved) unit.setAttribute('data-changed', 'true');
      else unit.removeAttribute('data-changed');

      if (active && !moved && !unit.hasAttribute('data-never-dim')) {
        unit.setAttribute('data-dimmed', 'true');
      } else {
        unit.removeAttribute('data-dimmed');
      }
    }
  }, [active, changed, children]);

  return (
    <div ref={host} className="threshold-since" data-testid="since-yesterday">
      <style>{SHEET}</style>
      {children}
    </div>
  );
}
