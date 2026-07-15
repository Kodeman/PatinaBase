'use client';

/**
 * Rule today — the strong vertical "you are here" cut on the line (C6 · R99,
 * Slice 02). Prototype: `.ma-today` (+ its `span` label); pinned geometry from
 * `.pin-rule .td`.
 *
 * A 1.5px charcoal rule at today's x, the one heaviest vertical on the canvas.
 * Its DM-Mono date label sits above-left when at rest and HIDES when pinned
 * (the prototype drops the label in `.pin-rule` — the line alone carries
 * today in the fold). Survives the pin (foldedLayers.today) at reduced height.
 * The line is aria-hidden; the visible label carries the date. Zero shadows
 * (D4).
 */

import { fmtDay } from '@/lib/document/format';

export interface RuleTodayProps {
  xPct: number;
  today: string;
  pinned: boolean;
}

export function RuleToday({ xPct, today, pinned }: RuleTodayProps) {
  const top = pinned ? 3 : 40;
  const height = pinned ? 17 : 62;
  return (
    <div
      aria-hidden
      className="absolute"
      style={{ left: `${xPct}%`, top, height, width: 1.5, background: 'var(--color-charcoal)' }}
    >
      {!pinned && (
        <span className="absolute left-[6px] top-[-16px] whitespace-nowrap font-mono text-[0.58rem] font-medium uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
          Today · {fmtDay(today)}
        </span>
      )}
    </div>
  );
}
