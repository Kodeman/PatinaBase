'use client';

/**
 * Rule today — the strong vertical "you are here" cut on the line (C6 · R99,
 * Slice 02). Prototype: `.ma-today` (+ its `span` label); pinned geometry from
 * `.pin-rule .td`.
 *
 * A 1.5px charcoal rule at today's x, the one heaviest vertical on the canvas.
 * Its DM-Mono date label rides the rule BELOW the line (y≈82, the canvas's
 * one deterministically clear band — see below) and HIDES when pinned (the
 * prototype drops the label in `.pin-rule` — the line alone carries today in
 * the fold). Survives the pin (foldedLayers.today) at reduced height.
 *
 * Label placement (live-walk defect D-3): the prototype hung the date at
 * y≈24 (`.ma-today span`, top:-16 off a y-40 line) — inside the staggered
 * labels' row-1 band (y 26..~54), so any phase label crossing today's x
 * overprinted it. Within the ≤2-row design budget the label bands span
 * y 0..~54, ticks+line+diamonds y 64..76, and thread lane labels start y≈97 —
 * leaving y ~78..96 as the widest band nothing else ever occupies. The date
 * now sits there (top:42 within the y-40 line → y≈82), still visually
 * attached to its rule — the boring fix: fixed geometry, no measurement.
 * (Beyond-two-row stagger overflow may enter this band; that mode is already
 * an accepted degradation + review escalation.)
 *
 * The whole element is decoration: aria-hidden AND `pointer-events-none`
 * (D-2 — it must never swallow a click meant for a label/diamond button).
 * Zero shadows (D4).
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
      className="pointer-events-none absolute"
      style={{ left: `${xPct}%`, top, height, width: 1.5, background: 'var(--color-charcoal)' }}
    >
      {!pinned && (
        <span className="absolute left-[6px] top-[42px] whitespace-nowrap font-mono text-[0.58rem] font-medium uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
          Today · {fmtDay(today)}
        </span>
      )}
    </div>
  );
}
