'use client';

/**
 * Rule BASELINE layer — the faint CLAY ghosts of the v1 promise (C6 · R100
 * "Memory", Slice 05). Prototype: the Ledger slide's `.bl-ghost` (faint clay
 * ticks + "v1 · <date>" labels beneath the live line — "the promise, in Clay").
 *
 * The clay sibling of RuleGhostLayer: it reuses the SAME dashed-mark primitives
 * (GhostTick / GhostDiamond / GhostLabel, tone="clay") and the SAME committed
 * TimeScale, but its source is a `baselineGhostDiff` (schedule-baseline-
 * derivation) rather than a live `RippleDiff`. It draws ONLY the boundaries and
 * milestones whose current dates differ from the signed baseline — "where the
 * promise stood." `projectBaselineGhosts` (pure, tested) does the placement;
 * this component is dumb paint.
 *
 * Mounted ONLY in the resting (unpinned) canvas and ONLY when no ripple is in
 * flight — terracotta preview ghosts take precedence, and the pinned fold shows
 * committed truth only; the Rule owns both gates and the toggle. aria-hidden +
 * pointer-events-none: a decorative memory layer, never a control. Positions
 * clamp at the scale's edge while each label reads the TRUE baseline date (the
 * honest overflow). Zero shadows (D4).
 */

import { useMemo } from 'react';
import { fmtDay } from '@/lib/document/format';
import { projectBaselineGhosts, type TimeScale } from '@/lib/document/schedule-rule-derivation';
import type { BaselineGhostDiff } from '@/lib/document/schedule-baseline-derivation';
import { GhostTick, GhostDiamond, GhostLabel } from './rule-ghost-layer';

export interface RuleBaselineLayerProps {
  diff: BaselineGhostDiff;
  scale: TimeScale;
}

// Resting-canvas band — mirrors RuleGhostLayer's UNPINNED geometry (this layer
// never renders pinned). The clay date labels sit BELOW the line (the promise
// underneath the live truth), matching the prototype's `.bl-lbl` top.
const BAND = { tickTop: 62, tickH: 16, diTop: 65, labelTop: 88 };

export function RuleBaselineLayer({ diff, scale }: RuleBaselineLayerProps) {
  const ghosts = useMemo(() => projectBaselineGhosts(diff, scale), [diff, scale]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1]">
      {ghosts.ticks.map((t) => (
        <div key={`bl-t-${t.id}`}>
          <GhostTick leftPct={t.xPct} top={BAND.tickTop} height={BAND.tickH} tone="clay" />
          <GhostLabel leftPct={t.xPct} top={BAND.labelTop} marginLeft={4} tone="clay">
            v1 · {fmtDay(t.date)}
          </GhostLabel>
        </div>
      ))}

      {ghosts.diamonds.map((d) => (
        <div key={`bl-d-${d.id}`}>
          <GhostDiamond leftPct={d.xPct} top={BAND.diTop} tone="clay" />
          <GhostLabel leftPct={d.xPct} top={BAND.labelTop} marginLeft={-4} tone="clay">
            v1 · {fmtDay(d.date)}
          </GhostLabel>
        </div>
      ))}
    </div>
  );
}
