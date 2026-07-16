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
 *
 * R105: dashes are exclusive to this file's TERRACOTTA ripple preview — a
 * pending, not-yet-committed edit. The `clay` tone (rule-baseline-layer.tsx's
 * v1-baseline "Memory" ghosts) renders SOLID: a thin solid tick, a
 * solid-outline diamond, a plain label — the marks share geometry with the
 * terracotta ones but never borrow the "in flight" dashed read for a
 * standing, already-signed fact. The terracotta path below is unchanged byte
 * for byte; only the tone branch is new.
 */

import { useMemo, type ReactNode } from 'react';
import { fmtDay } from '@/lib/document/format';
import { projectGhosts, type TimeScale } from '@/lib/document/schedule-rule-derivation';
import type { RippleDiff } from '@/lib/document/schedule-ripple-derivation';

// ─────────────────────────────────────────────────────────────────────────────
// Ghost paint primitives — the dashed marks the ripple's TERRACOTTA preview
// (this file) and Slice 05's CLAY baseline layer (rule-baseline-layer.tsx) both
// draw, differing only in TONE. Extracted + exported so the two layers share
// ONE mark implementation rather than duplicating the dash gradients / diamond
// / label geometry (the tone variant the S5 plan calls for). Zero shadows (D4).
// ─────────────────────────────────────────────────────────────────────────────

export type GhostTone = 'terracotta' | 'clay';

const TONE_COLOR: Record<GhostTone, string> = {
  terracotta: 'var(--color-terracotta)',
  clay: 'var(--color-clay)',
};

/** dashed vertical (tick) — the prototype's `.gh-tick` gradient. TERRACOTTA
 *  ONLY (R105): `clay` renders a plain solid fill instead — the baseline
 *  layer's standing mark, never the ripple's "in flight" dash. */
const dashV = (tone: GhostTone) =>
  tone === 'clay'
    ? TONE_COLOR.clay
    : `repeating-linear-gradient(to bottom, ${TONE_COLOR[tone]} 0 3px, transparent 3px 6px)`;
/** dashed horizontal (arrow) — the prototype's `.gh-arrow` gradient. The Rule
 *  never draws a `clay` arrow (a baseline is a standing mark, not a from→to
 *  vector — schedule-rule-derivation's `projectBaselineGhosts` emits no
 *  arrow), so this stays terracotta-only in practice; unchanged by R105. */
const dashH = (tone: GhostTone) =>
  `repeating-linear-gradient(to right, ${TONE_COLOR[tone]} 0 4px, transparent 4px 7px)`;

/** 1.5px vertical at a moved boundary — dashed for `terracotta` (the ripple
 *  preview), solid for `clay` (R105 — the baseline's standing mark). `leftPct`
 *  is pre-clamped by the caller. */
export function GhostTick({ leftPct, top, height, tone }: { leftPct: number; top: number; height: number; tone: GhostTone }) {
  return (
    <span
      className="absolute"
      style={{ left: `${leftPct}%`, top, width: 1.5, height, marginLeft: -0.75, background: dashV(tone) }}
    />
  );
}

/** 8px rotate-45 diamond, no fill, at a moved milestone — dashed-border for
 *  `terracotta`, solid-border for `clay` (R105). */
export function GhostDiamond({ leftPct, top, tone }: { leftPct: number; top: number; tone: GhostTone }) {
  const borderStyle = tone === 'clay' ? 'solid' : 'dashed';
  return (
    <span
      className="absolute rotate-45"
      style={{ left: `${leftPct}%`, top, width: 8, height: 8, marginLeft: -4, background: 'none', border: `1.5px ${borderStyle} ${TONE_COLOR[tone]}` }}
    />
  );
}

/** DM-Mono .54rem uppercase toned date/name beside a ghost mark. */
export function GhostLabel({
  leftPct,
  top,
  marginLeft,
  tone,
  children,
}: {
  leftPct: number;
  top: number;
  marginLeft: number;
  tone: GhostTone;
  children: ReactNode;
}) {
  return (
    <span
      className="absolute whitespace-nowrap font-mono text-[0.54rem] uppercase tracking-[0.06em]"
      style={{ left: `${leftPct}%`, top, marginLeft, color: TONE_COLOR[tone] }}
    >
      {children}
    </span>
  );
}

export interface RuleGhostLayerProps {
  diff: RippleDiff;
  scale: TimeScale;
  pinned: boolean;
}

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
            background: dashH('terracotta'),
          }}
        />
      )}

      {ghosts.ticks.map((t) => (
        <div key={`t-${t.id}`}>
          <GhostTick leftPct={clampLeft(t.xPct)} top={g.tickTop} height={g.tickH} tone="terracotta" />
          {!pinned && t.date && (
            <GhostLabel leftPct={clampLeft(t.xPct)} top={g.tickLabelTop} marginLeft={4} tone="terracotta">
              {fmtDay(t.date)}
            </GhostLabel>
          )}
        </div>
      ))}

      {ghosts.diamonds.map((d) => (
        <div key={`d-${d.id}`}>
          <GhostDiamond leftPct={clampLeft(d.xPct)} top={g.diTop} tone="terracotta" />
          {!pinned && d.date && (
            <GhostLabel leftPct={clampLeft(d.xPct)} top={g.diLabelTop} marginLeft={-4} tone="terracotta">
              {d.name} → {fmtDay(d.date)}
            </GhostLabel>
          )}
        </div>
      ))}
    </div>
  );
}
