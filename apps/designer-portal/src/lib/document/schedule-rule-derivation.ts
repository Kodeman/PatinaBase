/**
 * Schedule Rule derivation — Track ... (R99 the folded Rule; Slice 02).
 * Prototype: the-document-schedule-master-direction.html (~CSS 115-198),
 * the-document-schedule-four-directions.html.
 *
 * PURE presentation logic over `resolveSchedule`'s output (@patina/utils) —
 * the date→x proportional scale, natural-width label staggering, main-lane
 * rule segments, milestone diamonds, thread hairlines, the unplaced-phase
 * fallback list, and the pinned/unpinned layer toggle. React-free,
 * dependency-free (mirrors schedule-spine-derivation.ts / margin-derivation.
 * ts). The resolver already computed dates/conflicts; these functions only
 * decide how the Rule projects that truth onto a horizontal minimap —
 * nothing here recomputes time (R100 — the ONE date-math impl is
 * `epochDayFromISO`, reused, never duplicated).
 */

import type { ResolvedPhase, ResolvedMilestone, MilestoneStatus } from '@patina/utils';
import { epochDayFromISO } from '@patina/utils';
import { phaseState } from './schedule-spine-derivation';

// ═══════════════════════════════════════════════════════════════════════════
// buildTimeScale — the date→x proportional scale, spanning today
// ═══════════════════════════════════════════════════════════════════════════

export interface TimeScale {
  minEpoch: number;
  maxEpoch: number;
  /** ISO date → x in % [0..100] (padded domain). null for a null/malformed date. */
  toX: (iso: string | null) => number | null;
}

/**
 * Proportional epoch-day scale over every dated phase start/end, extended to
 * always include `today` (so the today rule is never clipped off either
 * edge), with `padFraction` (default 4%) of symmetric padding on both sides.
 * Padding is symmetric so the proportional MIDPOINT of the raw (unpadded)
 * range is unaffected — only the edges breathe. Returns null when nothing in
 * `phases` carries a parseable date at all (there is nothing to scale — a
 * scale spanning only `today` would be a meaningless single point). A
 * single-day raw span (`rawSpan === 0`, e.g. one dated phase, or every dated
 * phase landing on the same day as `today`) is guarded (`span || 1`) so
 * `toX` never divides by zero.
 */
export function buildTimeScale(
  phases: ReadonlyArray<{ start: string | null; end: string | null }>,
  today: string,
  padFraction = 0.04,
): TimeScale | null {
  const datedEpochs: number[] = [];
  for (const p of phases) {
    const s = epochDayFromISO(p.start);
    if (s != null) datedEpochs.push(s);
    const e = epochDayFromISO(p.end);
    if (e != null) datedEpochs.push(e);
  }
  if (datedEpochs.length === 0) return null; // nothing dated — no meaningful scale

  const todayEpoch = epochDayFromISO(today);
  const domainEpochs = todayEpoch != null ? [...datedEpochs, todayEpoch] : datedEpochs;

  const rawMin = Math.min(...domainEpochs);
  const rawMax = Math.max(...domainEpochs);
  const rawSpan = rawMax - rawMin;
  const pad = rawSpan * padFraction;

  const minEpoch = rawMin - pad;
  const maxEpoch = rawMax + pad;
  const span = maxEpoch - minEpoch || 1; // single-day span guard — never NaN/Infinity

  const toX = (iso: string | null): number | null => {
    const e = epochDayFromISO(iso);
    if (e == null) return null;
    return ((e - minEpoch) / span) * 100;
  };

  return { minEpoch, maxEpoch, toX };
}

// ═══════════════════════════════════════════════════════════════════════════
// assignLabelRows — greedy lowest-free-row staggering (never truncates)
// ═══════════════════════════════════════════════════════════════════════════

export interface LabelInput {
  id: string;
  xPct: number;
  widthPx: number;
  anchor: 'start' | 'end';
}

export interface LabelLayout {
  rows: Map<string, number>;
  rowCount: number;
  overflowBeyondTwo: boolean;
}

/**
 * Greedy lowest-free-row bin packing, processed in x-order (ties broken by
 * id for determinism). Each label's pixel span is derived from `xPct` +
 * `containerWidthPx` + `widthPx`: a `'start'`-anchored label grows rightward
 * from its x (the common case); an `'end'`-anchored label grows leftward
 * (the rule's last/rightmost label, kept from overflowing the container's
 * right edge). A label is placed on the lowest-indexed existing row whose
 * last-placed right edge, plus `gapPx` (default 8), is still at or left of
 * this label's left edge; otherwise a NEW row is appended. Rows grow
 * unbounded — labels are never dropped or truncated to fit a row budget.
 * `overflowBeyondTwo` is `rowCount > 2` (the design's 2-row comfortable
 * budget; a 3rd+ row is a review-escalation signal, not a hidden failure).
 */
export function assignLabelRows(
  labels: ReadonlyArray<LabelInput>,
  containerWidthPx: number,
  gapPx = 8,
): LabelLayout {
  const rows = new Map<string, number>();
  if (labels.length === 0) {
    return { rows, rowCount: 0, overflowBeyondTwo: false };
  }

  const ordered = labels.slice().sort((a, b) => a.xPct - b.xPct || a.id.localeCompare(b.id));

  const rowRightEdgePx: number[] = [];

  for (const label of ordered) {
    const anchorPx = (label.xPct / 100) * containerWidthPx;
    const leftPx = label.anchor === 'end' ? anchorPx - label.widthPx : anchorPx;
    const rightPx = label.anchor === 'end' ? anchorPx : anchorPx + label.widthPx;

    let placedRow = -1;
    for (let row = 0; row < rowRightEdgePx.length; row++) {
      if (rowRightEdgePx[row] + gapPx <= leftPx) {
        placedRow = row;
        break;
      }
    }

    if (placedRow === -1) {
      placedRow = rowRightEdgePx.length;
      rowRightEdgePx.push(rightPx);
    } else {
      rowRightEdgePx[placedRow] = rightPx;
    }

    rows.set(label.id, placedRow);
  }

  const rowCount = rowRightEdgePx.length;
  return { rows, rowCount, overflowBeyondTwo: rowCount > 2 };
}

// ═══════════════════════════════════════════════════════════════════════════
// ruleWeightForStatus — RuleWeight adapter over schedule-spine's phaseState
// ═══════════════════════════════════════════════════════════════════════════

export type RuleWeight = 'closed' | 'active' | 'ahead';

/**
 * RuleWeight is a 3-value palette distinct from schedule-spine-derivation's
 * `SpinePhaseState` ('closed'|'active'|'future') — the Rule never shows
 * "future" copy, it shows a forward-leaning line weight ('ahead'). This
 * REUSES `phaseState` (the ONE status→visual-state classifier) rather than
 * re-switching on the raw status string a second time; it only remaps the
 * one label that differs. Callers build `ruleSegments`' `statusById` from
 * this — `ruleSegments` itself stays a pure projection with no knowledge of
 * status strings at all.
 */
export function ruleWeightForStatus(status: string | null | undefined): RuleWeight {
  const state = phaseState(status);
  return state === 'future' ? 'ahead' : state;
}

// ═══════════════════════════════════════════════════════════════════════════
// ruleSegments — main-lane rule segments, weighted
// ═══════════════════════════════════════════════════════════════════════════

export interface RuleSegment {
  id: string;
  leftPct: number;
  widthPct: number;
  weight: RuleWeight;
}

/**
 * Main-lane-only segments of the drawn rule line. Thread-lane phases are
 * excluded entirely (they draw as a separate hairline via `ruleThreads`).
 * A phase whose start or end doesn't land on the scale (null date, or a date
 * the scale can't place) is excluded — it surfaces instead via
 * `unplacedPhases`. `weight` is supplied by the caller's `statusById` (build
 * it with `ruleWeightForStatus`) — this function has no status knowledge of
 * its own.
 */
export function ruleSegments(
  phases: ReadonlyArray<ResolvedPhase>,
  statusById: (id: string) => RuleWeight,
  scale: TimeScale,
): RuleSegment[] {
  const out: RuleSegment[] = [];
  for (const p of phases) {
    if (p.lane !== 'main') continue;
    const left = scale.toX(p.start);
    const right = scale.toX(p.end);
    if (left == null || right == null) continue;
    out.push({ id: p.id, leftPct: left, widthPct: right - left, weight: statusById(p.id) });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ruleDiamonds — milestone diamonds
// ═══════════════════════════════════════════════════════════════════════════

export interface RuleDiamond {
  id: string;
  phaseId: string;
  xPct: number;
  status: MilestoneStatus;
}

/**
 * One diamond per milestone with a placeable date — `ResolvedMilestone.date`
 * already reflects whichever the resolver used (an anchor, or the phase-end
 * derivation), so this projects it onto the scale without caring which. A
 * null date (unresolved phase, or an offset off a phase with no end) omits
 * the diamond entirely — never a diamond at x:0 or NaN. `status` is a
 * straight pass-through of the resolver's `derivedStatus` (the resolver
 * already flips 'upcoming' → 'due' when due; this layer doesn't re-derive
 * it).
 */
export function ruleDiamonds(m: ReadonlyArray<ResolvedMilestone>, scale: TimeScale): RuleDiamond[] {
  const out: RuleDiamond[] = [];
  for (const ms of m) {
    const x = scale.toX(ms.date);
    if (x == null) continue;
    out.push({ id: ms.id, phaseId: ms.phaseId, xPct: x, status: ms.derivedStatus });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ruleThreads — thread-lane hairlines
// ═══════════════════════════════════════════════════════════════════════════

export interface RuleThread {
  id: string;
  leftPct: number;
  widthPct: number;
}

/**
 * One hairline span per thread-lane phase with BOTH a start and an end
 * (a thread with only one end can't span a rule segment — it's unplaced, not
 * a zero-width thread). Main-lane phases are excluded — they're
 * `ruleSegments`' concern.
 */
export function ruleThreads(p: ReadonlyArray<ResolvedPhase>, scale: TimeScale): RuleThread[] {
  const out: RuleThread[] = [];
  for (const phase of p) {
    if (phase.lane !== 'thread') continue;
    if (phase.start == null || phase.end == null) continue;
    const left = scale.toX(phase.start);
    const right = scale.toX(phase.end);
    if (left == null || right == null) continue;
    out.push({ id: phase.id, leftPct: left, widthPct: right - left });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// unplacedPhases — the "Unplaced · N" fallback list
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Phases the rule line structurally cannot draw — anything missing a start
 * OR an end (an unresolved phase, or a legacy-dates phase with only one of
 * the two set), regardless of lane or `source`. This is exactly the
 * complement of what `ruleSegments`/`ruleThreads` place, by construction —
 * every phase in `p` lands in exactly one of "drawn on the rule" or
 * "returned here," never both, never neither.
 */
export function unplacedPhases<T extends { start: string | null; end: string | null; source?: string }>(
  p: T[],
): T[] {
  return p.filter((x) => x.start == null || x.end == null);
}

// ═══════════════════════════════════════════════════════════════════════════
// foldedLayers — pinned vs unpinned layer visibility
// ═══════════════════════════════════════════════════════════════════════════

export interface FoldedLayers {
  labels: boolean;
  thread: boolean;
  diamonds: boolean;
  today: boolean;
  line: boolean;
}

/**
 * Which rule layers render in each mode. Pinned (the sticky, scrolled-past
 * state) folds away the natural-width labels and the thread hairline — the
 * prototype's `.pin-rule` treatment — keeping only the line, the diamonds,
 * and the today marker. Unpinned shows everything.
 */
export function foldedLayers(pinned: boolean): FoldedLayers {
  return {
    labels: !pinned,
    thread: !pinned,
    diamonds: true,
    today: true,
    line: true,
  };
}
