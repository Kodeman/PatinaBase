'use client';

/**
 * Rule track — the drawn line itself (C6 · R99 the folded Rule, Slice 02).
 * Prototype: `.ma-rule-past` / `.ma-rule-future` / `.ma-tick` in
 * the-document-schedule-master-direction.html; pinned geometry from
 * `.pin-rule .ln-p/.ln-f/.tk`.
 *
 * A continuous pearl hairline backs the whole span (unscheduled time reads as
 * a quiet future line), then each main-lane phase paints its span in its
 * status WEIGHT — closed mocha 2px, active charcoal 2px (the heaviest ink,
 * "you are here"), ahead pearl 1px. Boundary ticks (aged-oak) stand at every
 * phase start/end. `pinned` collapses the whole track to ~22px per the
 * prototype's `.pin-rule` — same lines, same ticks, reduced height. Read-only:
 * ticks are hairlines here, never handles (drag is Slice 04). The whole track
 * is `pointer-events-none` decoration — its full-canvas container paints OVER
 * earlier layers (DOM order) and must never swallow a click meant for a label
 * or diamond button (live-walk defect D-2). Zero shadows (D4): the line IS
 * the depth.
 *
 * R105 ink hybrid: the ACTIVE phase's ink splits at today — elapsed
 * (start→today) stays the heaviest `active` weight, remaining (today→end)
 * draws the light `ahead` weight, "you are here" folded into the line itself
 * rather than left to the separate today-cut alone. `ruleTrackPaintSegments`
 * (schedule-rule-derivation) does the split — PURE, tested there; this stays
 * dumb paint. Boundary ticks are computed from the ORIGINAL `segments` prop
 * (never the split paint list), so the mid-phase today cut never grows a
 * phantom third tick at today — that's `RuleToday`'s mark alone.
 */

import type { RuleSegment, RuleWeight } from '@/lib/document/schedule-rule-derivation';
import { ruleTrackPaintSegments } from '@/lib/document/schedule-rule-derivation';

export interface RuleTrackProps {
  segments: RuleSegment[];
  pinned: boolean;
  /** Today's x% within the SAME scale `segments` was built from — the R105
   *  split point for the active phase's ink. null degrades to the pre-R105
   *  solid-active treatment (defensive only; the Rule never mounts without a
   *  scale, and a scale always seeds its domain with today). */
  todayXPct: number | null;
}

/** Ink + thickness per weight (`.ma-rule-past` mocha 2px, `.ma-rule-future`
 *  pearl 1px; active is the heaviest read). */
const WEIGHT_INK: Record<RuleWeight, string> = {
  closed: 'var(--color-mocha)',
  active: 'var(--color-charcoal)',
  ahead: 'var(--color-pearl)',
};
const WEIGHT_THICK: Record<RuleWeight, number> = { closed: 2, active: 2, ahead: 1 };

export function RuleTrack({ segments, pinned, todayXPct }: RuleTrackProps) {
  // Baseline center of the line within the track, and the tick geometry —
  // the two numbers that differ between the resting canvas and the pin.
  const baseline = pinned ? 12 : 70; // px from the track top the line centers on
  const tickTop = pinned ? 7 : 64;
  const tickHeight = pinned ? 10 : 12;

  // Boundary ticks: the unique set of every segment start and end, so shared
  // boundaries between adjacent phases draw a single tick, not two. Computed
  // from the ORIGINAL (unsplit) segments — the R105 today-cut is not a phase
  // boundary and must never grow its own tick.
  const tickXs = Array.from(
    new Set(
      segments.flatMap((s) => [round(s.leftPct), round(s.leftPct + s.widthPct)]),
    ),
  );

  // Paint-time projection: the active phase's segment splits at today
  // (R105); every other segment passes through unchanged.
  const paintSegments = ruleTrackPaintSegments(segments, todayXPct);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0"
      style={{ top: 0, height: pinned ? 22 : 132 }}
    >
      {/* Continuous pearl hairline behind everything — the future/unscheduled
          backing so gaps between phases still read as one line. */}
      <span
        className="absolute inset-x-0"
        style={{ top: baseline - 0.5, height: 1, background: 'var(--color-pearl)' }}
      />

      {/* Per-phase weighted segments — the active phase's ink already split
          at today (R105) by `paintSegments`. */}
      {paintSegments.map((s) => {
        const thick = WEIGHT_THICK[s.weight];
        return (
          <span
            key={s.id}
            className="absolute"
            style={{
              left: `${s.leftPct}%`,
              width: `${Math.max(0, s.widthPct)}%`,
              top: baseline - thick / 2,
              height: thick,
              background: WEIGHT_INK[s.weight],
            }}
          />
        );
      })}

      {/* Boundary ticks. */}
      {tickXs.map((x) => (
        <span
          key={x}
          className="absolute"
          style={{
            left: `${x}%`,
            top: tickTop,
            width: 1,
            height: tickHeight,
            background: 'var(--color-aged-oak)',
            opacity: 0.55,
          }}
        />
      ))}
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
