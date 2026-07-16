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
// Type-only — the ghost projector reads a `RippleDiff` (schedule-ripple-
// derivation imports NOTHING from this file, so this stays acyclic).
import type { RippleDiff } from './schedule-ripple-derivation';

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
// xToEpochDay — the INVERSE of TimeScale.toX (day-snapped, clamped)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Invert a `TimeScale`: an x-position in % [0..100] → the epoch day it names,
 * snapped to a whole day and clamped to the scale's padded domain. This is the
 * drag reader's other half of `buildTimeScale.toX` (Slice 04 — a boundary
 * handle / diamond dragged to `xPct` reads its intended date here). Recomputes
 * `span` from the scale's own `minEpoch`/`maxEpoch` with the SAME single-day
 * guard `toX` used (`|| 1`), so a degenerate one-day scale never divides by
 * zero — it is the exact algebraic inverse of `toX`, not a second scale.
 *
 * - `xPct` is first clamped to [0, 100] (a drag past either edge reads as the
 *   edge, never off-scale); a non-finite `xPct` reads as the left edge (0).
 * - The raw epoch (`minEpoch + x/100·span`) is `Math.round`ed — a fractional x
 *   snaps to the nearest whole day, so the handle always lands ON a day.
 * - The snapped day is clamped to the rounded padded bounds
 *   [round(minEpoch), round(maxEpoch)] so it can never fall a rounding step
 *   outside the domain. Round-trips with `toX` for any dated point in range:
 *   `xToEpochDay(scale, scale.toX(iso)!) === epochDayFromISO(iso)`.
 *
 * Total: returns a finite integer for every input; never throws, never NaN.
 */
export function xToEpochDay(scale: TimeScale, xPct: number): number {
  const span = scale.maxEpoch - scale.minEpoch || 1; // single-day guard, mirrors buildTimeScale
  const clampedX = Math.max(0, Math.min(100, Number.isFinite(xPct) ? xPct : 0));
  const snapped = Math.round(scale.minEpoch + (clampedX / 100) * span);
  const lo = Math.round(scale.minEpoch);
  const hi = Math.round(scale.maxEpoch);
  return Math.max(lo, Math.min(hi, snapped));
}

/**
 * Turn a pointer's `clientX` into an x-position in % within a track's bounding
 * rect — the drag surfaces' first step (clientX → `xPct`, then `xToEpochDay`
 * snaps it to a day). Pure + total: a zero/negative-width rect (a hidden or
 * unmeasured track) reads as the left edge (0), never NaN/Infinity. The result
 * is NOT clamped here — `xToEpochDay` does the [0,100] clamp against the padded
 * domain, so a drag a hair past the edge still reads as the edge day.
 */
export function clientXToPct(clientX: number, rect: { left: number; width: number }): number {
  if (!rect || !Number.isFinite(rect.width) || rect.width <= 0) return 0;
  const pct = ((clientX - rect.left) / rect.width) * 100;
  return Number.isFinite(pct) ? pct : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// ruleBoundaries — internal-boundary drag handles (upstream phase-duration)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * One draggable boundary per CHAIN EDGE (a phase D that `followsPhaseId` an
 * upstream phase U). The handle sits at U's resolved END (the shared boundary
 * tick); a drag edits U's `phase-duration` (Slice 04 T7 — the ripple's
 * `phase-duration` kind). The ROOT start is never a boundary (the root has no
 * predecessor, so it never appears as a downstream `D`), satisfying "root start
 * not draggable" by construction. A boundary is `locked` when the DOWNSTREAM
 * phase is anchored: its start is pinned, so the boundary can't move — the drag
 * surface refuses with a firm nudge naming `downstreamName` and begins no
 * session ("anchored phase's own start refuses" is the same tick, since the
 * boundary IS the downstream's start).
 */
export interface RuleBoundary {
  /** Stable key + the UPSTREAM phase whose duration a drag edits. */
  upstreamPhaseId: string;
  downstreamPhaseId: string;
  /** The downstream phase's name — the refuse nudge's `{name}`. */
  downstreamName: string;
  /** x% of the boundary tick — the upstream phase's resolved END. */
  xPct: number;
  /** Epoch day of the upstream phase's resolved START — the duration base
   *  (a drag's new duration = draggedEpochDay − upstreamStartEpoch, clamped). */
  upstreamStartEpoch: number;
  /** Downstream anchored ⇒ locked: a drag refuses (nudge), begins no session. */
  locked: boolean;
}

export function ruleBoundaries(
  resolvedPhases: ReadonlyArray<ResolvedPhase>,
  chain: ReadonlyArray<{ id: string; followsPhaseId: string | null; name: string }>,
  scale: TimeScale,
): RuleBoundary[] {
  const byId = new Map(resolvedPhases.map((p) => [p.id, p]));
  // Keyed by upstream so a fork (two phases following one) yields ONE handle at
  // that boundary; it locks if ANY successor is anchored, and names the anchored
  // one (the successor that actually blocks the drag).
  const byUpstream = new Map<string, RuleBoundary>();

  for (const d of chain) {
    if (!d || d.followsPhaseId == null) continue; // root / unchained — no boundary
    const down = byId.get(d.id);
    const up = byId.get(d.followsPhaseId);
    if (!down || !up) continue;
    if (up.lane !== 'main') continue; // a thread upstream draws no main-lane boundary
    const x = scale.toX(up.end);
    const startEpoch = epochDayFromISO(up.start);
    if (x == null || startEpoch == null) continue; // upstream not placed — no handle

    const existing = byUpstream.get(up.id);
    if (existing) {
      if (down.anchored && !existing.locked) {
        existing.locked = true;
        existing.downstreamPhaseId = down.id;
        existing.downstreamName = d.name;
      }
      continue;
    }
    byUpstream.set(up.id, {
      upstreamPhaseId: up.id,
      downstreamPhaseId: down.id,
      downstreamName: d.name,
      xPct: x,
      upstreamStartEpoch: startEpoch,
      locked: down.anchored,
    });
  }
  return [...byUpstream.values()];
}

/**
 * A boundary drag → the UPSTREAM phase's new effective duration in whole days,
 * clamped to ≥ 1 (a phase can never shrink below a single day). `draggedEpochDay`
 * is the day the handle was dragged to (`xToEpochDay`'s output). Pure — the
 * `phase-duration` edit's `durationDays` value.
 */
export function boundaryDurationDays(upstreamStartEpoch: number, draggedEpochDay: number): number {
  return Math.max(1, Math.round(draggedEpochDay) - Math.round(upstreamStartEpoch));
}

/**
 * A diamond drag → the milestone's new offset from its host phase END in whole
 * days (negative = before the end, matching `offsetDays`' sign convention).
 * `phaseEndEpoch` is the host phase's resolved END; `draggedEpochDay` the day the
 * diamond was dragged to. Pure — the `milestone-offset` edit's `offsetDays`.
 */
export function milestoneOffsetDays(phaseEndEpoch: number, draggedEpochDay: number): number {
  return Math.round(draggedEpochDay) - Math.round(phaseEndEpoch);
}

// ═══════════════════════════════════════════════════════════════════════════
// projectGhosts — the ripple diff → the Rule's dashed-terracotta ghost layer
// ═══════════════════════════════════════════════════════════════════════════

/** A dashed ghost tick at a moved phase boundary's NEW date. `date` carries the
 *  TRUE date so the label reads honestly even when `xPct` overflows the scale
 *  (the component clamps the position, never the date). */
export interface GhostTickSpec {
  id: string;
  xPct: number;
  date: string | null;
}
/** A dashed ghost diamond at a moved milestone's NEW date (name for the label). */
export interface GhostDiamondSpec {
  id: string;
  xPct: number;
  name: string;
  date: string | null;
}
/** The edit's old→new vector along the line (already clamped to [0,100]). */
export interface GhostArrowSpec {
  leftPct: number;
  widthPct: number;
}
export interface RuleGhosts {
  ticks: GhostTickSpec[];
  diamonds: GhostDiamondSpec[];
  arrow: GhostArrowSpec | null;
}

function clampPct(x: number): number {
  return Math.max(0, Math.min(100, x));
}

/**
 * Project a `RippleDiff` onto the Rule's ghost layer (Slice 04 T8). Positions
 * are the diff's TO-dates run through `scale.toX` (the SAME committed scale the
 * solid layers use — the ghosts pin to committed and overflow past its edge
 * rather than rescaling). Works for BOTH origins: a spine-originated session's
 * diff ghosts on the Rule identically to a rule drag's, because both read the
 * same diff. Pure + total: a null/unplaceable date drops that one ghost, never
 * a ghost at x:0/NaN.
 *
 *  - ticks    — one per MOVED phase, at the boundary the ripple moved: the
 *               edited phase at its own dragged boundary (END for a duration
 *               edit, START for an anchor edit), every follower at its shifted
 *               START. This is "every downstream consequence" the prototype's
 *               dashed ticks promise.
 *  - diamonds — one per MOVED milestone (the dragged one AND any that rode a
 *               moved phase), at its new date.
 *  - arrow    — the single edit vector: the edited entity's old position → new
 *               position along the line (duration=end, anchor=start,
 *               milestone=date). Omitted when it wouldn't move or can't place.
 */
export function projectGhosts(diff: RippleDiff, scale: TimeScale): RuleGhosts {
  const ticks: GhostTickSpec[] = [];
  const diamonds: GhostDiamondSpec[] = [];
  let arrow: GhostArrowSpec | null = null;

  const edit = diff.edit;
  const editedPhaseId = edit.kind === 'milestone-offset' ? null : edit.phaseId;

  for (const pc of diff.phaseChanges) {
    if (!pc.moved) continue;
    const dateIso =
      pc.phaseId === editedPhaseId && edit.kind === 'phase-anchor' ? pc.toStart : pc.phaseId === editedPhaseId ? pc.toEnd : pc.toStart;
    const x = scale.toX(dateIso);
    if (x == null) continue;
    ticks.push({ id: pc.phaseId, xPct: x, date: dateIso });
  }

  for (const mm of diff.milestoneMoves) {
    if (!mm.moved) continue;
    const x = scale.toX(mm.toDate);
    if (x == null) continue;
    diamonds.push({ id: mm.milestoneId, xPct: x, name: mm.name, date: mm.toDate });
  }

  let fromIso: string | null = null;
  let toIso: string | null = null;
  if (edit.kind === 'phase-duration') {
    const pc = diff.phaseChanges.find((p) => p.phaseId === edit.phaseId);
    fromIso = pc?.fromEnd ?? null;
    toIso = pc?.toEnd ?? null;
  } else if (edit.kind === 'phase-anchor') {
    const pc = diff.phaseChanges.find((p) => p.phaseId === edit.phaseId);
    fromIso = pc?.fromStart ?? null;
    toIso = pc?.toStart ?? null;
  } else if (edit.kind === 'milestone-offset') {
    const mm = diff.milestoneMoves.find((m) => m.milestoneId === edit.milestoneId);
    fromIso = mm?.fromDate ?? null;
    toIso = mm?.toDate ?? null;
  }
  const fromX = scale.toX(fromIso);
  const toX = scale.toX(toIso);
  if (fromX != null && toX != null && Math.abs(toX - fromX) > 0.01) {
    const lo = clampPct(Math.min(fromX, toX));
    const hi = clampPct(Math.max(fromX, toX));
    if (hi - lo > 0.01) arrow = { leftPct: lo, widthPct: hi - lo };
  }

  return { ticks, diamonds, arrow };
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
  /** The resolver's own `anchored` flag — an anchored milestone HOLDS its date
   *  (it does not ride the phase), so the drag surface refuses to slide it
   *  (Slice 04 T7): anchored diamonds nudge, they don't begin a session. */
  anchored: boolean;
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
    out.push({ id: ms.id, phaseId: ms.phaseId, xPct: x, status: ms.derivedStatus, anchored: ms.anchored });
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
