'use client';

/**
 * Rule ghost layer — the ripple's dashed-terracotta preview on the line (C6 ·
 * R100 "Editing: the ripple", Slice 04 T8). Prototype: the Ripple slide's
 * `.gh-tick` / `.gh-di` / `.gh-arrow` / `.gh-label` (dashed terracotta ghosts
 * over the still-solid committed schedule).
 *
 * Reads the ONE `RippleDiff` from the ripple context (via the parent) and draws
 * the previewed consequences — for BOTH origins: a spine-originated edit ghosts
 * on the Rule identically to a rule drag, because both feed the same diff.
 * `projectGhosts` (pure, tested) does the placement; this component is dumb
 * paint:
 *   · GhostTick    — 1.5px dashed-terracotta vertical at each moved boundary.
 *   · GhostDiamond — 8px rotate-45, dashed terracotta border, NO fill, at each
 *                    moved milestone.
 *   · GhostArrow   — dashed-terracotta horizontal, the edit's old→new vector.
 *   · GhostLabel   — DM-Mono .54rem uppercase terracotta date (name for a
 *                    diamond) beside each ghost.
 *
 * Layered AFTER the solid committed layers inside the SAME TimeScale — the
 * scale stays pinned to committed, so a ghost past the scale's edge CLAMPS its
 * position to the edge while the label still reads the TRUE date (the honest
 * overflow). The whole layer is `pointer-events-none` — it never intercepts a
 * drag or a reveal click. Zero shadows (D4).
 */

import { useMemo } from 'react';
import { fmtDay } from '@/lib/document/format';
import { projectGhosts, type TimeScale } from '@/lib/document/schedule-rule-derivation';
import type { RippleDiff } from '@/lib/document/schedule-ripple-derivation';

const TERRACOTTA = 'var(--color-terracotta)';
/** dashed vertical (tick) — the prototype's `.gh-tick` gradient. */
const DASH_V = `repeating-linear-gradient(to bottom, ${TERRACOTTA} 0 3px, transparent 3px 6px)`;
/** dashed horizontal (arrow) — the prototype's `.gh-arrow` gradient. */
const DASH_H = `repeating-linear-gradient(to right, ${TERRACOTTA} 0 4px, transparent 4px 7px)`;

export interface RuleGhostLayerProps {
  diff: RippleDiff;
  scale: TimeScale;
  pinned: boolean;
}

const LABEL_CLASS =
  'absolute whitespace-nowrap font-mono text-[0.54rem] uppercase tracking-[0.06em] text-[var(--color-terracotta)]';

function clampLeft(xPct: number): number {
  return Math.max(0, Math.min(100, xPct));
}

export function RuleGhostLayer({ diff, scale, pinned }: RuleGhostLayerProps) {
  const ghosts = useMemo(() => projectGhosts(diff, scale), [diff, scale]);

  // Geometry bands — resting canvas (line ≈ y70) vs the ~22px pin (line ≈ y12).
  // Ghost labels fold away when pinned (the 22px band has no room), exactly as
  // the today/thread labels do; the ghost marks themselves survive the fold.
  // Both bands carry the same keys (the label tops are unused when pinned —
  // labels fold away there — but kept so `g` is one shape, not a union).
  const g = pinned
    ? { tickTop: 5, tickH: 12, diTop: 7, arrowTop: 11, tickLabelTop: 0, diLabelTop: 0 }
    : { tickTop: 62, tickH: 16, diTop: 65, arrowTop: 69, tickLabelTop: 54, diLabelTop: 88 };

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1]">
      {ghosts.arrow && (
        <span
          className="absolute"
          style={{
            left: `${ghosts.arrow.leftPct}%`,
            width: `${ghosts.arrow.widthPct}%`,
            top: g.arrowTop,
            height: 2,
            background: DASH_H,
          }}
        />
      )}

      {ghosts.ticks.map((t) => (
        <div key={`t-${t.id}`}>
          <span
            className="absolute"
            style={{ left: `${clampLeft(t.xPct)}%`, top: g.tickTop, width: 1.5, height: g.tickH, marginLeft: -0.75, background: DASH_V }}
          />
          {!pinned && t.date && (
            <span className={LABEL_CLASS} style={{ left: `${clampLeft(t.xPct)}%`, top: g.tickLabelTop, marginLeft: 4 }}>
              {fmtDay(t.date)}
            </span>
          )}
        </div>
      ))}

      {ghosts.diamonds.map((d) => (
        <div key={`d-${d.id}`}>
          <span
            className="absolute rotate-45"
            style={{
              left: `${clampLeft(d.xPct)}%`,
              top: g.diTop,
              width: 8,
              height: 8,
              marginLeft: -4,
              background: 'none',
              border: `1.5px dashed ${TERRACOTTA}`,
            }}
          />
          {!pinned && d.date && (
            <span className={LABEL_CLASS} style={{ left: `${clampLeft(d.xPct)}%`, top: g.diLabelTop, marginLeft: -4 }}>
              {d.name} → {fmtDay(d.date)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
