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
 */

import type { RuleSegment, RuleWeight } from '@/lib/document/schedule-rule-derivation';

export interface RuleTrackProps {
  segments: RuleSegment[];
  pinned: boolean;
}

/** Ink + thickness per weight (`.ma-rule-past` mocha 2px, `.ma-rule-future`
 *  pearl 1px; active is the heaviest read). */
const WEIGHT_INK: Record<RuleWeight, string> = {
  closed: 'var(--color-mocha)',
  active: 'var(--color-charcoal)',
  ahead: 'var(--color-pearl)',
};
const WEIGHT_THICK: Record<RuleWeight, number> = { closed: 2, active: 2, ahead: 1 };

export function RuleTrack({ segments, pinned }: RuleTrackProps) {
  // Baseline center of the line within the track, and the tick geometry —
  // the two numbers that differ between the resting canvas and the pin.
  const baseline = pinned ? 12 : 70; // px from the track top the line centers on
  const tickTop = pinned ? 7 : 64;
  const tickHeight = pinned ? 10 : 12;

  // Boundary ticks: the unique set of every segment start and end, so shared
  // boundaries between adjacent phases draw a single tick, not two.
  const tickXs = Array.from(
    new Set(
      segments.flatMap((s) => [round(s.leftPct), round(s.leftPct + s.widthPct)]),
    ),
  );

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

      {/* Per-phase weighted segments. */}
      {segments.map((s) => {
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
