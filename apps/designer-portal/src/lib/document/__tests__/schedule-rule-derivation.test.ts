import type { ResolvedPhase, ResolvedMilestone } from '@patina/utils';
import { epochDayFromISO, isoFromEpochDay } from '@patina/utils';
import {
  buildTimeScale,
  xToEpochDay,
  clientXToPct,
  assignLabelRows,
  ruleWeightForStatus,
  ruleSegments,
  splitActiveSegmentAtToday,
  ruleTrackPaintSegments,
  ruleDiamonds,
  ruleThreads,
  ruleBoundaries,
  ruleBars,
  ruleLanes,
  monthColumns,
  weekGridlines,
  projectGhostBars,
  MAIN_LANE_H,
  THREAD_LANE_H,
  barCanResize,
  barMoveStartEpoch,
  barNudgeEpochDay,
  clampBarEpochDay,
  boundaryDurationDays,
  milestoneOffsetDays,
  projectGhosts,
  projectBaselineGhosts,
  unplacedPhases,
  foldedLayers,
  type TimeScale,
  type LabelInput,
} from '../schedule-rule-derivation';
import type { BaselineGhostDiff } from '../schedule-baseline-derivation';
import type {
  RippleDiff,
  RipplePendingEdit,
  RipplePhaseChange,
  RippleMilestoneMove,
} from '../schedule-ripple-derivation';

// ─────────────────────────────────────────────────────────────────────────────
// Factories — every field defaulted so a case declares only what it exercises.
// ─────────────────────────────────────────────────────────────────────────────

function rphase(over: Partial<ResolvedPhase> & { id: string }): ResolvedPhase {
  return {
    id: over.id,
    start: over.start ?? null,
    end: over.end ?? null,
    lane: over.lane ?? 'main',
    anchored: over.anchored ?? false,
    source: over.source ?? 'chain',
    slackDays: over.slackDays ?? null,
  };
}

function rmilestone(over: Partial<ResolvedMilestone> & { id: string; phaseId: string }): ResolvedMilestone {
  return {
    id: over.id,
    phaseId: over.phaseId,
    date: over.date ?? null,
    anchored: over.anchored ?? false,
    derivedStatus: over.derivedStatus ?? 'upcoming',
  };
}

function label(over: Partial<LabelInput> & { id: string }): LabelInput {
  return {
    id: over.id,
    xPct: over.xPct ?? 0,
    widthPx: over.widthPx ?? 50,
    anchor: over.anchor ?? 'start',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// buildTimeScale
// ═══════════════════════════════════════════════════════════════════════════

describe('buildTimeScale', () => {
  it('proportional midpoint: the raw range midpoint lands at 50% (pad is symmetric)', () => {
    const scale = buildTimeScale(
      [{ start: '2026-01-01', end: '2026-04-11' }], // day 0..100
      '2026-02-20', // today inside the range — doesn't move the midpoint
    )!;
    expect(scale).not.toBeNull();
    expect(scale.toX('2026-02-20')).toBeCloseTo(50, 5); // day 50 = midpoint of day0..day100
  });

  it('today before all phase dates still lands in-span (never negative, never clipped to the edge)', () => {
    const scale = buildTimeScale([{ start: '2026-06-01', end: '2026-09-01' }], '2026-01-01')!;
    expect(scale).not.toBeNull();
    const x = scale.toX('2026-01-01')!;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(5); // near the padded left edge, not past it
  });

  it('today after all phase dates still lands in-span (never over 100, never clipped to the edge)', () => {
    const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-03-01' }], '2026-12-01')!;
    expect(scale).not.toBeNull();
    const x = scale.toX('2026-12-01')!;
    expect(x).toBeLessThanOrEqual(100);
    expect(x).toBeGreaterThan(95); // near the padded right edge, not past it
  });

  it('applies ~4% pad on both sides of the raw dated range', () => {
    // Raw range is exactly 100 days (2026-01-01..2026-04-11), today inside it
    // so it doesn't perturb the domain. pad = 100 * 0.04 = 4 epoch days on
    // each side → span 108; the raw start lands at 4/108 ≈ 3.70%, the raw
    // end at 104/108 ≈ 96.30%.
    const rawMin = epochDayFromISO('2026-01-01')!;
    const rawMax = epochDayFromISO('2026-04-11')!;
    expect(rawMax - rawMin).toBe(100);

    const scale: TimeScale = buildTimeScale([{ start: '2026-01-01', end: '2026-04-11' }], '2026-02-20')!;
    expect(scale.minEpoch).toBeCloseTo(rawMin - 4, 5);
    expect(scale.maxEpoch).toBeCloseTo(rawMax + 4, 5);
    expect(scale.toX('2026-01-01')).toBeCloseTo((4 / 108) * 100, 5); // ≈ 3.70%
    expect(scale.toX('2026-04-11')).toBeCloseTo((104 / 108) * 100, 5); // ≈ 96.30%
  });

  it('a single-day span (one dated phase, today the same day) never produces NaN', () => {
    const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-01-01' }], '2026-01-01')!;
    expect(scale).not.toBeNull();
    const x = scale.toX('2026-01-01')!;
    expect(Number.isNaN(x)).toBe(false);
    expect(Number.isFinite(x)).toBe(true);
  });

  it('returns null when nothing in the phase list is dated, regardless of today', () => {
    expect(buildTimeScale([{ start: null, end: null }, { start: null, end: null }], '2026-01-01')).toBeNull();
    expect(buildTimeScale([], '2026-01-01')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// assignLabelRows
// ═══════════════════════════════════════════════════════════════════════════

describe('assignLabelRows', () => {
  it('no collisions: three widely spaced labels all land on row 0', () => {
    const labels = [
      label({ id: 'a', xPct: 0, widthPx: 50 }),
      label({ id: 'b', xPct: 50, widthPx: 50 }),
      label({ id: 'c', xPct: 100, widthPx: 50 }),
    ];
    const { rows, rowCount, overflowBeyondTwo } = assignLabelRows(labels, 1000);
    expect(rows.get('a')).toBe(0);
    expect(rows.get('b')).toBe(0);
    expect(rows.get('c')).toBe(0);
    expect(rowCount).toBe(1);
    expect(overflowBeyondTwo).toBe(false);
  });

  it('one collision: two overlapping labels split into row 0 / row 1', () => {
    const labels = [label({ id: 'a', xPct: 0, widthPx: 200 }), label({ id: 'b', xPct: 1, widthPx: 200 })];
    const { rows, rowCount } = assignLabelRows(labels, 1000);
    expect(rows.get('a')).toBe(0);
    expect(rows.get('b')).toBe(1);
    expect(rowCount).toBe(2);
  });

  it('chained across 3: three labels all at the same x force three separate rows', () => {
    const labels = [
      label({ id: 'a', xPct: 0, widthPx: 100 }),
      label({ id: 'b', xPct: 0, widthPx: 100 }),
      label({ id: 'c', xPct: 0, widthPx: 100 }),
    ];
    const { rows, rowCount, overflowBeyondTwo } = assignLabelRows(labels, 1000);
    expect(rows.get('a')).toBe(0);
    expect(rows.get('b')).toBe(1);
    expect(rows.get('c')).toBe(2);
    expect(rowCount).toBe(3);
    expect(overflowBeyondTwo).toBe(true);
  });

  it('7 long-named labels, evenly spaced, width 200px on a 1000px container: fits exactly 2 rows', () => {
    // 7 points at i/6*100%, container 1000px → spacing ≈166.67px. width 200px
    // collides with the immediate neighbor but not the one two over, so the
    // greedy lowest-free-row packing alternates cleanly into 2 rows.
    const labels = Array.from({ length: 7 }, (_, i) => label({ id: `p${i}`, xPct: (i * 100) / 6, widthPx: 200 }));
    const { rowCount, overflowBeyondTwo } = assignLabelRows(labels, 1000);
    expect(rowCount).toBe(2);
    expect(overflowBeyondTwo).toBe(false);
  });

  it('7 long-named labels, evenly spaced, width 340px on a 1000px container: needs a 3rd row', () => {
    // Same 7 points, wider labels (340px > 2×spacing − gap) — the 2-row
    // alternating pattern can no longer absorb every label; a 3rd row opens.
    const labels = Array.from({ length: 7 }, (_, i) => label({ id: `p${i}`, xPct: (i * 100) / 6, widthPx: 340 }));
    const { rowCount, overflowBeyondTwo } = assignLabelRows(labels, 1000);
    expect(rowCount).toBe(3);
    expect(overflowBeyondTwo).toBe(true);
  });

  it('end-anchored label grows LEFTWARD from its x — correctly detects a collision an anchor-point read would miss', () => {
    // A spans px 600..900 (start-anchored at 60%, width 300, container 1000).
    // B is the rule's last label, end-anchored at 100% (px 1000), width 300
    // → its true span is 700..1000, which genuinely overlaps A (600..900).
    // A buggy implementation using the anchor point (1000) as B's left edge
    // would miss this collision and wrongly co-place both on row 0.
    const labels = [
      label({ id: 'a', xPct: 60, widthPx: 300, anchor: 'start' }),
      label({ id: 'last', xPct: 100, widthPx: 300, anchor: 'end' }),
    ];
    const { rows } = assignLabelRows(labels, 1000);
    expect(rows.get('a')).toBe(0);
    expect(rows.get('last')).toBe(1);
  });

  it('gap is respected at the exact boundary: right+gap<=left shares a row, right+gap>left does not', () => {
    const gapPx = 8;
    // label 'a': px 0..100. A follower whose left edge is exactly 108 shares row 0.
    const sharesRow = assignLabelRows(
      [label({ id: 'a', xPct: 0, widthPx: 100 }), label({ id: 'b', xPct: 10.8, widthPx: 50 })],
      1000,
      gapPx,
    );
    expect(sharesRow.rows.get('b')).toBe(0);

    // A follower one pixel short of the gap (left edge 107) must NOT share.
    const doesNotShare = assignLabelRows(
      [label({ id: 'a', xPct: 0, widthPx: 100 }), label({ id: 'b', xPct: 10.7, widthPx: 50 })],
      1000,
      gapPx,
    );
    expect(doesNotShare.rows.get('b')).toBe(1);
  });

  it('deterministic x-order: input order never changes the assignment, only x position does', () => {
    const inOrder = [
      label({ id: 'a', xPct: 0, widthPx: 200 }),
      label({ id: 'b', xPct: 10, widthPx: 200 }),
      label({ id: 'c', xPct: 80, widthPx: 200 }),
    ];
    const shuffled = [inOrder[2], inOrder[0], inOrder[1]];

    const r1 = assignLabelRows(inOrder, 1000);
    const r2 = assignLabelRows(shuffled, 1000);
    expect(Object.fromEntries(r2.rows)).toEqual(Object.fromEntries(r1.rows));
    expect(r2.rowCount).toBe(r1.rowCount);
  });

  it('empty input never throws — zero rows, no overflow', () => {
    const { rows, rowCount, overflowBeyondTwo } = assignLabelRows([], 1000);
    expect(rows.size).toBe(0);
    expect(rowCount).toBe(0);
    expect(overflowBeyondTwo).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ruleWeightForStatus (the RuleWeight adapter over schedule-spine's phaseState)
// ═══════════════════════════════════════════════════════════════════════════

describe('ruleWeightForStatus', () => {
  it('completed → closed (reuses phaseState)', () => {
    expect(ruleWeightForStatus('completed')).toBe('closed');
  });
  it('in_progress/active → active (reuses phaseState)', () => {
    expect(ruleWeightForStatus('in_progress')).toBe('active');
    expect(ruleWeightForStatus('active')).toBe('active');
  });
  it('pending/delayed/unknown/null → ahead (the Rule’s remap of phaseState’s "future")', () => {
    expect(ruleWeightForStatus('pending')).toBe('ahead');
    expect(ruleWeightForStatus('delayed')).toBe('ahead');
    expect(ruleWeightForStatus('something-unexpected')).toBe('ahead');
    expect(ruleWeightForStatus(null)).toBe('ahead');
    expect(ruleWeightForStatus(undefined)).toBe('ahead');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ruleSegments
// ═══════════════════════════════════════════════════════════════════════════

describe('ruleSegments', () => {
  // Shared scale: day0..day100, ~4% pad → domain -4..104, span 108.
  const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-04-11' }], '2026-02-20')!;
  const statusById = (id: string) => (({ a: 'closed', b: 'active' })[id] ?? 'ahead') as ReturnType<
    typeof ruleWeightForStatus
  >;

  it('weight is supplied by statusById (built from phaseState), not recomputed here', () => {
    const phases = [
      rphase({ id: 'a', start: '2026-01-01', end: '2026-01-15', lane: 'main' }),
      rphase({ id: 'b', start: '2026-01-15', end: '2026-02-01', lane: 'main' }),
    ];
    const segs = ruleSegments(phases, statusById, scale);
    expect(segs.find((s) => s.id === 'a')?.weight).toBe('closed');
    expect(segs.find((s) => s.id === 'b')?.weight).toBe('active');
  });

  it('thread-lane phases are excluded from the main-lane rule segments', () => {
    const phases = [
      rphase({ id: 'a', start: '2026-01-01', end: '2026-01-15', lane: 'main' }),
      rphase({ id: 't', start: '2026-01-01', end: '2026-02-01', lane: 'thread' }),
    ];
    const segs = ruleSegments(phases, statusById, scale);
    expect(segs.map((s) => s.id)).toEqual(['a']);
  });

  it('computes leftPct/widthPct proportionally from the scale', () => {
    const phases = [rphase({ id: 'a', start: '2026-01-15', end: '2026-02-01', lane: 'main' })];
    const segs = ruleSegments(phases, statusById, scale);
    expect(segs[0].leftPct).toBeCloseTo(scale.toX('2026-01-15')!, 10);
    expect(segs[0].widthPct).toBeCloseTo(scale.toX('2026-02-01')! - scale.toX('2026-01-15')!, 10);
  });

  it('a main-lane phase missing a start or end is excluded (unplaced, not a zero-width segment)', () => {
    const phases = [
      rphase({ id: 'a', start: null, end: '2026-01-15', lane: 'main' }),
      rphase({ id: 'b', start: '2026-01-01', end: null, lane: 'main' }),
      rphase({ id: 'c', start: null, end: null, lane: 'main', source: 'unresolved' }),
    ];
    expect(ruleSegments(phases, statusById, scale)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// splitActiveSegmentAtToday / ruleTrackPaintSegments (R105 ink hybrid)
// ═══════════════════════════════════════════════════════════════════════════

describe('splitActiveSegmentAtToday', () => {
  const activeSeg = { id: 'a', leftPct: 20, widthPct: 40, weight: 'active' as const }; // span 20..60
  const closedSeg = { id: 'c', leftPct: 0, widthPct: 20, weight: 'closed' as const };
  const aheadSeg = { id: 'ah', leftPct: 60, widthPct: 20, weight: 'ahead' as const };

  it('non-active weights pass through untouched, regardless of todayXPct', () => {
    expect(splitActiveSegmentAtToday(closedSeg, 40)).toEqual([closedSeg]);
    expect(splitActiveSegmentAtToday(aheadSeg, 40)).toEqual([aheadSeg]);
  });

  it('today strictly inside the span: elapsed active + remaining ahead, split exactly at today', () => {
    const out = splitActiveSegmentAtToday(activeSeg, 35);
    expect(out).toEqual([
      { id: 'a', leftPct: 20, widthPct: 15, weight: 'active' },
      { id: 'a:ahead', leftPct: 35, widthPct: 25, weight: 'ahead' },
    ]);
    // the two pieces reassemble the original span exactly.
    const last = out[out.length - 1];
    expect(out[0].leftPct).toBe(activeSeg.leftPct);
    expect(last.leftPct + last.widthPct).toBeCloseTo(activeSeg.leftPct + activeSeg.widthPct, 10);
  });

  it('today at or before the span start: the WHOLE span draws light (ahead), no elapsed piece', () => {
    expect(splitActiveSegmentAtToday(activeSeg, 20)).toEqual([
      { id: 'a:ahead', leftPct: 20, widthPct: 40, weight: 'ahead' },
    ]);
    // before the start entirely — clamped to the same result, not a negative cut.
    expect(splitActiveSegmentAtToday(activeSeg, 5)).toEqual([
      { id: 'a:ahead', leftPct: 20, widthPct: 40, weight: 'ahead' },
    ]);
  });

  it('today at or after the span end: the WHOLE span stays bold (active), no remaining piece', () => {
    expect(splitActiveSegmentAtToday(activeSeg, 60)).toEqual([
      { id: 'a', leftPct: 20, widthPct: 40, weight: 'active' },
    ]);
    // past the end entirely (slipped, still open) — clamped, still fully bold.
    expect(splitActiveSegmentAtToday(activeSeg, 95)).toEqual([
      { id: 'a', leftPct: 20, widthPct: 40, weight: 'active' },
    ]);
  });

  it('null todayXPct degrades to the unsplit segment (defensive — the Rule never mounts without a scale)', () => {
    expect(splitActiveSegmentAtToday(activeSeg, null)).toEqual([activeSeg]);
  });

  it('a degenerate zero-width active segment never vanishes', () => {
    const zero = { id: 'z', leftPct: 50, widthPct: 0, weight: 'active' as const };
    expect(splitActiveSegmentAtToday(zero, 50)).toEqual([zero]);
  });
});

describe('ruleTrackPaintSegments', () => {
  it('splits only the active segment in a mixed list, preserving the others', () => {
    const segments = [
      { id: 'closed', leftPct: 0, widthPct: 20, weight: 'closed' as const },
      { id: 'active', leftPct: 20, widthPct: 40, weight: 'active' as const },
      { id: 'ahead', leftPct: 60, widthPct: 20, weight: 'ahead' as const },
    ];
    const painted = ruleTrackPaintSegments(segments, 35);
    expect(painted.map((s) => s.id)).toEqual(['closed', 'active', 'active:ahead', 'ahead']);
    expect(painted.map((s) => s.weight)).toEqual(['closed', 'active', 'ahead', 'ahead']);
  });

  it('a fully-closed/ahead list (no active phase) passes through unchanged', () => {
    const segments = [
      { id: 'closed', leftPct: 0, widthPct: 50, weight: 'closed' as const },
      { id: 'ahead', leftPct: 50, widthPct: 50, weight: 'ahead' as const },
    ];
    expect(ruleTrackPaintSegments(segments, 30)).toEqual(segments);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ruleDiamonds
// ═══════════════════════════════════════════════════════════════════════════

describe('ruleDiamonds', () => {
  const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-04-11' }], '2026-02-20')!;

  it('all 4 MilestoneStatus values pass through unchanged', () => {
    const ms = [
      rmilestone({ id: 'm1', phaseId: 'a', date: '2026-01-10', derivedStatus: 'signed' }),
      rmilestone({ id: 'm2', phaseId: 'a', date: '2026-01-20', derivedStatus: 'due' }),
      rmilestone({ id: 'm3', phaseId: 'a', date: '2026-02-01', derivedStatus: 'upcoming' }),
      rmilestone({ id: 'm4', phaseId: 'a', date: '2026-02-10', derivedStatus: 'slipped' }),
    ];
    const diamonds = ruleDiamonds(ms, scale);
    expect(diamonds.map((d) => d.status)).toEqual(['signed', 'due', 'upcoming', 'slipped']);
  });

  it('a null-date milestone is omitted — no diamond at x:0 or NaN', () => {
    const ms = [
      rmilestone({ id: 'm1', phaseId: 'a', date: '2026-01-10', derivedStatus: 'due' }),
      rmilestone({ id: 'm2', phaseId: 'a', date: null, derivedStatus: 'upcoming' }),
    ];
    const diamonds = ruleDiamonds(ms, scale);
    expect(diamonds.map((d) => d.id)).toEqual(['m1']);
  });

  it('an anchored milestone and a phase-end-derived milestone both project onto x correctly (no special-casing)', () => {
    const ms = [
      rmilestone({ id: 'anchored', phaseId: 'a', date: '2026-01-10', anchored: true, derivedStatus: 'signed' }),
      rmilestone({ id: 'derived', phaseId: 'a', date: '2026-01-10', anchored: false, derivedStatus: 'signed' }),
    ];
    const diamonds = ruleDiamonds(ms, scale);
    // Same date → same x, regardless of anchored — status/anchored are not
    // consulted for positioning, only `date` is.
    expect(diamonds[0].xPct).toBeCloseTo(diamonds[1].xPct, 10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ruleThreads
// ═══════════════════════════════════════════════════════════════════════════

describe('ruleThreads', () => {
  const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-04-11' }], '2026-02-20')!;

  it('a thread-lane phase with both dates gets a true start→end span', () => {
    const phases = [rphase({ id: 't', start: '2026-01-01', end: '2026-02-01', lane: 'thread' })];
    const threads = ruleThreads(phases, scale);
    expect(threads).toHaveLength(1);
    expect(threads[0].leftPct).toBeCloseTo(scale.toX('2026-01-01')!, 10);
    expect(threads[0].widthPct).toBeCloseTo(scale.toX('2026-02-01')! - scale.toX('2026-01-01')!, 10);
  });

  it('a thread-lane phase missing either date is omitted', () => {
    const phases = [
      rphase({ id: 't1', start: null, end: '2026-02-01', lane: 'thread' }),
      rphase({ id: 't2', start: '2026-01-01', end: null, lane: 'thread' }),
    ];
    expect(ruleThreads(phases, scale)).toEqual([]);
  });

  it('main-lane phases are excluded from thread hairlines', () => {
    const phases = [rphase({ id: 'a', start: '2026-01-01', end: '2026-02-01', lane: 'main' })];
    expect(ruleThreads(phases, scale)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// unplacedPhases
// ═══════════════════════════════════════════════════════════════════════════

describe('unplacedPhases', () => {
  it('captures an unresolved phase (both dates null) and a legacy-partial phase (one date null)', () => {
    const phases = [
      rphase({ id: 'unresolved', start: null, end: null, source: 'unresolved' }),
      rphase({ id: 'half', start: '2026-01-01', end: null, source: 'legacy-dates' }),
      rphase({ id: 'half2', start: null, end: '2026-01-01', source: 'legacy-dates' }),
    ];
    expect(unplacedPhases(phases).map((p) => p.id)).toEqual(['unresolved', 'half', 'half2']);
  });

  it('excludes fully-dated phases regardless of lane', () => {
    const phases = [
      rphase({ id: 'a', start: '2026-01-01', end: '2026-01-15', lane: 'main' }),
      rphase({ id: 't', start: '2026-01-01', end: '2026-01-15', lane: 'thread' }),
    ];
    expect(unplacedPhases(phases)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// foldedLayers
// ═══════════════════════════════════════════════════════════════════════════

describe('foldedLayers', () => {
  it('pinned: labels and thread fold away; diamonds/today/line stay', () => {
    expect(foldedLayers(true)).toEqual({
      labels: false,
      thread: false,
      diamonds: true,
      today: true,
      line: true,
    });
  });

  it('unpinned: everything renders', () => {
    expect(foldedLayers(false)).toEqual({
      labels: true,
      thread: true,
      diamonds: true,
      today: true,
      line: true,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// xToEpochDay — the INVERSE of buildTimeScale.toX (day-snapped, clamped)
// ═══════════════════════════════════════════════════════════════════════════

describe('xToEpochDay', () => {
  // A scale over day 0..100 (2026-01-01 .. 2026-04-11), today inside the range.
  const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-04-11' }], '2026-02-20')!;

  it('round-trips every dated point in range: xToEpochDay(scale, toX(iso)) === epochDayFromISO(iso)', () => {
    const base = epochDayFromISO('2026-01-01')!;
    for (let d = 0; d <= 100; d++) {
      const iso = isoFromEpochDay(base + d)!;
      const x = scale.toX(iso)!;
      expect(xToEpochDay(scale, x)).toBe(base + d);
    }
  });

  it('round-trips through toX for every whole-day x it produces (toX ∘ xToEpochDay stable on days)', () => {
    const base = epochDayFromISO('2026-01-01')!;
    for (let d = 0; d <= 100; d += 7) {
      const iso = isoFromEpochDay(base + d)!;
      const x = scale.toX(iso)!;
      // The snapped epoch feeds back through toX to (approximately) the same x,
      // and re-snaps to the identical day — the inverse is stable.
      const epoch = xToEpochDay(scale, x);
      const x2 = scale.toX(isoFromEpochDay(epoch))!;
      expect(xToEpochDay(scale, x2)).toBe(epoch);
    }
  });

  it('clamps at both ends: x below 0 → the min day, x above 100 → the max day', () => {
    const loEpoch = xToEpochDay(scale, -50);
    const hiEpoch = xToEpochDay(scale, 150);
    expect(loEpoch).toBe(Math.round(scale.minEpoch));
    expect(hiEpoch).toBe(Math.round(scale.maxEpoch));
    // And they bracket the whole dated range.
    expect(loEpoch).toBeLessThanOrEqual(epochDayFromISO('2026-01-01')!);
    expect(hiEpoch).toBeGreaterThanOrEqual(epochDayFromISO('2026-04-11')!);
  });

  it('x=0 and x=100 land on the padded domain edges (rounded to whole days)', () => {
    expect(xToEpochDay(scale, 0)).toBe(Math.round(scale.minEpoch));
    expect(xToEpochDay(scale, 100)).toBe(Math.round(scale.maxEpoch));
  });

  it('snaps a fractional x to the nearest whole day', () => {
    const base = epochDayFromISO('2026-01-01')!;
    const dayX = scale.toX('2026-02-15')!;
    const nextX = scale.toX('2026-02-16')!;
    const target = epochDayFromISO('2026-02-15')!;
    // A point 40% of the way from one day to the next snaps back to the day.
    expect(xToEpochDay(scale, dayX + (nextX - dayX) * 0.4)).toBe(target);
    // 60% of the way snaps forward to the next day.
    expect(xToEpochDay(scale, dayX + (nextX - dayX) * 0.6)).toBe(target + 1);
    expect(target).toBe(base + 45);
  });

  it('single-day scale never divides by zero (span guard mirrors buildTimeScale)', () => {
    const oneDay = buildTimeScale([{ start: '2026-05-01', end: '2026-05-01' }], '2026-05-01')!;
    const epoch = xToEpochDay(oneDay, 50);
    expect(Number.isFinite(epoch)).toBe(true);
    expect(epoch).toBe(epochDayFromISO('2026-05-01')!);
  });

  it('non-finite x reads as the left edge; never NaN', () => {
    expect(xToEpochDay(scale, Number.NaN)).toBe(Math.round(scale.minEpoch));
    expect(Number.isFinite(xToEpochDay(scale, Number.POSITIVE_INFINITY))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ruleDiamonds — anchored flag pass-through (Slice 04 T7)
// ═══════════════════════════════════════════════════════════════════════════

describe('ruleDiamonds — anchored flag', () => {
  const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-04-11' }], '2026-02-20')!;

  it('carries the resolver anchored flag onto each diamond (drag-refuse source)', () => {
    const ms = [
      rmilestone({ id: 'held', phaseId: 'a', date: '2026-01-10', anchored: true, derivedStatus: 'signed' }),
      rmilestone({ id: 'rides', phaseId: 'a', date: '2026-01-20', anchored: false, derivedStatus: 'due' }),
    ];
    const diamonds = ruleDiamonds(ms, scale);
    expect(diamonds.map((d) => [d.id, d.anchored])).toEqual([
      ['held', true],
      ['rides', false],
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// clientXToPct — pointer clientX → x% within a track rect
// ═══════════════════════════════════════════════════════════════════════════

describe('clientXToPct', () => {
  it('maps clientX to a proportional percentage of the rect width', () => {
    const rect = { left: 100, width: 400 };
    expect(clientXToPct(100, rect)).toBe(0);
    expect(clientXToPct(300, rect)).toBe(50);
    expect(clientXToPct(500, rect)).toBe(100);
  });

  it('is NOT clamped (a drag past the edge overflows; xToEpochDay does the clamp)', () => {
    const rect = { left: 0, width: 100 };
    expect(clientXToPct(-20, rect)).toBe(-20);
    expect(clientXToPct(150, rect)).toBe(150);
  });

  it('a zero/negative-width rect reads as the left edge (0), never NaN/Infinity', () => {
    expect(clientXToPct(500, { left: 0, width: 0 })).toBe(0);
    expect(clientXToPct(500, { left: 0, width: -10 })).toBe(0);
    // composed with a real rect, x=left always reads 0.
    expect(Number.isFinite(clientXToPct(42, { left: 42, width: 1 }))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// boundaryDurationDays / milestoneOffsetDays — pure drag→edit mappers
// ═══════════════════════════════════════════════════════════════════════════

describe('boundaryDurationDays', () => {
  it('duration = dragged day − upstream start', () => {
    const start = epochDayFromISO('2026-01-01')!;
    const dragged = epochDayFromISO('2026-01-15')!;
    expect(boundaryDurationDays(start, dragged)).toBe(14);
  });

  it('clamps to ≥ 1 — a boundary dragged to/behind the start is a one-day phase', () => {
    const start = epochDayFromISO('2026-01-10')!;
    expect(boundaryDurationDays(start, start)).toBe(1); // onto the start
    expect(boundaryDurationDays(start, start - 5)).toBe(1); // behind the start
    expect(boundaryDurationDays(start, start + 1)).toBe(1); // exactly one day
  });
});

describe('milestoneOffsetDays', () => {
  it('offset = dragged day − host phase end (sign convention: negative = before)', () => {
    const end = epochDayFromISO('2026-03-01')!;
    expect(milestoneOffsetDays(end, epochDayFromISO('2026-03-11')!)).toBe(10);
    expect(milestoneOffsetDays(end, epochDayFromISO('2026-02-19')!)).toBe(-10);
    expect(milestoneOffsetDays(end, end)).toBe(0); // exactly at the end
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ruleBoundaries — internal-boundary drag handles
// ═══════════════════════════════════════════════════════════════════════════

function link(id: string, followsPhaseId: string | null, name = id) {
  return { id, followsPhaseId, name };
}

describe('ruleBoundaries', () => {
  const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-04-11' }], '2026-02-20')!;

  it('one boundary per chain edge, at the UPSTREAM end, editing the upstream duration', () => {
    const phases = [
      rphase({ id: 'a', start: '2026-01-01', end: '2026-01-31' }),
      rphase({ id: 'b', start: '2026-01-31', end: '2026-02-28' }),
      rphase({ id: 'c', start: '2026-02-28', end: '2026-03-31' }),
    ];
    const chain = [link('a', null), link('b', 'a'), link('c', 'b')];
    const bounds = ruleBoundaries(phases, chain, scale);
    // Two internal boundaries (a→b at a.end, b→c at b.end); root 'a' start absent.
    expect(bounds.map((x) => x.upstreamPhaseId)).toEqual(['a', 'b']);
    const ab = bounds.find((x) => x.upstreamPhaseId === 'a')!;
    expect(ab.xPct).toBeCloseTo(scale.toX('2026-01-31')!, 10);
    expect(ab.upstreamStartEpoch).toBe(epochDayFromISO('2026-01-01')!);
    expect(ab.downstreamPhaseId).toBe('b');
    expect(ab.locked).toBe(false);
  });

  it('root start is never a boundary (the root has no predecessor)', () => {
    const phases = [rphase({ id: 'a', start: '2026-01-01', end: '2026-01-31' })];
    // 'a' follows nobody → no boundary at its start; no successor → none at its end.
    expect(ruleBoundaries(phases, [link('a', null)], scale)).toEqual([]);
  });

  it('locks the boundary when the DOWNSTREAM phase is anchored (refuse source)', () => {
    const phases = [
      rphase({ id: 'a', start: '2026-01-01', end: '2026-01-31' }),
      rphase({ id: 'install', start: '2026-02-15', end: '2026-03-15', anchored: true }),
    ];
    const bounds = ruleBoundaries(phases, [link('a', null), link('install', 'a', 'Installation')], scale);
    expect(bounds).toHaveLength(1);
    expect(bounds[0].locked).toBe(true);
    expect(bounds[0].downstreamName).toBe('Installation');
  });

  it('omits a boundary whose upstream is not placed (no end on the scale)', () => {
    const phases = [
      rphase({ id: 'a', start: null, end: null, source: 'unresolved' }),
      rphase({ id: 'b', start: '2026-02-01', end: '2026-03-01' }),
    ];
    expect(ruleBoundaries(phases, [link('a', null), link('b', 'a')], scale)).toEqual([]);
  });

  it('a fork collapses to one handle; locks if ANY successor is anchored and names it', () => {
    const phases = [
      rphase({ id: 'a', start: '2026-01-01', end: '2026-01-31' }),
      rphase({ id: 'b', start: '2026-01-31', end: '2026-02-15' }),
      rphase({ id: 'c', start: '2026-02-20', end: '2026-03-10', anchored: true }),
    ];
    const chain = [link('a', null), link('b', 'a', 'B'), link('c', 'a', 'C-anchored')];
    const bounds = ruleBoundaries(phases, chain, scale);
    expect(bounds.map((x) => x.upstreamPhaseId)).toEqual(['a']);
    expect(bounds[0].locked).toBe(true);
    expect(bounds[0].downstreamName).toBe('C-anchored');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// projectGhosts — ripple diff → dashed-terracotta ghost layer
// ═══════════════════════════════════════════════════════════════════════════

function pchange(over: Partial<RipplePhaseChange> & { phaseId: string }): RipplePhaseChange {
  return {
    phaseId: over.phaseId,
    name: over.name ?? over.phaseId,
    fromStart: over.fromStart ?? null,
    toStart: over.toStart ?? null,
    fromEnd: over.fromEnd ?? null,
    toEnd: over.toEnd ?? null,
    moved: over.moved ?? false,
    anchored: over.anchored ?? false,
    holds: over.holds ?? false,
  };
}

function mmove(over: Partial<RippleMilestoneMove> & { milestoneId: string; phaseId: string }): RippleMilestoneMove {
  return {
    milestoneId: over.milestoneId,
    phaseId: over.phaseId,
    name: over.name ?? over.milestoneId,
    fromDate: over.fromDate ?? null,
    toDate: over.toDate ?? null,
    moved: over.moved ?? false,
    anchored: over.anchored ?? false,
  };
}

function rdiff(over: Partial<RippleDiff> & { edit: RipplePendingEdit }): RippleDiff {
  return {
    edit: over.edit,
    editedName: over.editedName ?? '',
    phaseChanges: over.phaseChanges ?? [],
    milestoneMoves: over.milestoneMoves ?? [],
    followerCount: over.followerCount ?? 0,
    heldAnchors: over.heldAnchors ?? [],
    slackBefore: over.slackBefore ?? null,
    slackAfter: over.slackAfter ?? null,
    slackDelta: over.slackDelta ?? null,
    conflicts: over.conflicts ?? [],
    anchorViolation: over.anchorViolation ?? false,
    rippleSize: over.rippleSize ?? 0,
    durationDelta: over.durationDelta ?? null,
  };
}

describe('projectGhosts', () => {
  const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-04-11' }], '2026-02-20')!;

  it('phase-duration: edited tick at the new END, arrow old→new END, ticks for followers at their new START', () => {
    const diff = rdiff({
      edit: { kind: 'phase-duration', phaseId: 'a', durationDays: 40 },
      phaseChanges: [
        pchange({ phaseId: 'a', fromEnd: '2026-01-31', toEnd: '2026-02-10', moved: true }),
        pchange({ phaseId: 'b', fromStart: '2026-01-31', toStart: '2026-02-10', toEnd: '2026-03-01', moved: true }),
      ],
    });
    const g = projectGhosts(diff, scale);
    // edited 'a' tick at its new END; follower 'b' tick at its new START.
    const tickA = g.ticks.find((t) => t.id === 'a')!;
    const tickB = g.ticks.find((t) => t.id === 'b')!;
    expect(tickA.date).toBe('2026-02-10');
    expect(tickA.xPct).toBeCloseTo(scale.toX('2026-02-10')!, 10);
    expect(tickB.date).toBe('2026-02-10'); // b's new start
    // arrow spans old end (Jan 31) → new end (Feb 10).
    expect(g.arrow).not.toBeNull();
    expect(g.arrow!.leftPct).toBeCloseTo(scale.toX('2026-01-31')!, 10);
    expect(g.arrow!.widthPct).toBeCloseTo(scale.toX('2026-02-10')! - scale.toX('2026-01-31')!, 10);
  });

  it('phase-anchor: the edited tick sits at the new START (not the end)', () => {
    const diff = rdiff({
      edit: { kind: 'phase-anchor', phaseId: 'a', anchorDate: '2026-02-05' },
      phaseChanges: [pchange({ phaseId: 'a', fromStart: '2026-01-01', toStart: '2026-02-05', toEnd: '2026-03-01', moved: true, anchored: true })],
    });
    const g = projectGhosts(diff, scale);
    expect(g.ticks).toHaveLength(1);
    expect(g.ticks[0].date).toBe('2026-02-05');
  });

  it('milestone-offset: a dashed diamond at the new date + an arrow old→new; no phase tick', () => {
    const diff = rdiff({
      edit: { kind: 'milestone-offset', milestoneId: 'm', phaseId: 'a', offsetDays: 3 },
      milestoneMoves: [mmove({ milestoneId: 'm', phaseId: 'a', name: 'Sofa', fromDate: '2026-02-01', toDate: '2026-02-14', moved: true })],
    });
    const g = projectGhosts(diff, scale);
    expect(g.ticks).toEqual([]);
    expect(g.diamonds).toHaveLength(1);
    expect(g.diamonds[0]).toMatchObject({ id: 'm', name: 'Sofa', date: '2026-02-14' });
    expect(g.arrow).not.toBeNull();
  });

  it('an unmoved phase/milestone contributes no ghost', () => {
    const diff = rdiff({
      edit: { kind: 'phase-duration', phaseId: 'a', durationDays: 30 },
      phaseChanges: [
        pchange({ phaseId: 'a', fromEnd: '2026-01-31', toEnd: '2026-01-31', moved: false }),
        pchange({ phaseId: 'held', toStart: '2026-03-01', moved: false, anchored: true, holds: true }),
      ],
      milestoneMoves: [mmove({ milestoneId: 'm', phaseId: 'a', fromDate: '2026-02-01', toDate: '2026-02-01', moved: false })],
    });
    const g = projectGhosts(diff, scale);
    expect(g.ticks).toEqual([]);
    expect(g.diamonds).toEqual([]);
  });

  it('a null/unplaceable to-date drops that ghost — never a ghost at x:0/NaN', () => {
    const diff = rdiff({
      edit: { kind: 'phase-duration', phaseId: 'a', durationDays: 30 },
      phaseChanges: [pchange({ phaseId: 'a', fromEnd: '2026-01-31', toEnd: null, moved: true })],
    });
    const g = projectGhosts(diff, scale);
    expect(g.ticks).toEqual([]);
  });

  it('a ghost past the scale edge overflows in x but keeps the TRUE date on the spec (label clamp)', () => {
    // toEnd is far past the committed scale's max (2026-04-11) → toX > 100.
    const diff = rdiff({
      edit: { kind: 'phase-duration', phaseId: 'a', durationDays: 400 },
      phaseChanges: [pchange({ phaseId: 'a', fromEnd: '2026-01-31', toEnd: '2026-08-01', moved: true })],
    });
    const g = projectGhosts(diff, scale);
    expect(g.ticks).toHaveLength(1);
    expect(g.ticks[0].xPct).toBeGreaterThan(100); // raw overflow — the component clamps position
    expect(g.ticks[0].date).toBe('2026-08-01'); // the true date is preserved for the label
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// projectBaselineGhosts — the clay v1-baseline ghost layer (R100 "Memory", S5)
// ─────────────────────────────────────────────────────────────────────────────

describe('projectBaselineGhosts', () => {
  // A scale over a single dated phase spanning Jun 1 → Sep 1, today mid-range.
  const scale = buildTimeScale([{ start: '2026-06-01', end: '2026-09-01' }], '2026-07-01')!;

  it('ghosts only the boundary that moved — the held boundary makes no mark', () => {
    const diff: BaselineGhostDiff = {
      phases: [
        // end moved (Jul 10 → Jul 20); start held (Jun 15)
        { id: 'p1', baselineStart: '2026-06-15', currentStart: '2026-06-15', baselineEnd: '2026-07-10', currentEnd: '2026-07-20' },
      ],
      milestones: [],
    };
    const g = projectBaselineGhosts(diff, scale);
    expect(g.ticks).toHaveLength(1);
    expect(g.ticks[0]).toMatchObject({ id: 'p1:end', date: '2026-07-10' });
    expect(g.ticks[0].xPct).toBeGreaterThanOrEqual(0);
    expect(g.ticks[0].xPct).toBeLessThanOrEqual(100);
  });

  it('ghosts BOTH boundaries of a deleted-in-current entry (null current dates)', () => {
    const diff: BaselineGhostDiff = {
      phases: [
        { id: 'gone', baselineStart: '2026-06-15', currentStart: null, baselineEnd: '2026-07-10', currentEnd: null },
      ],
      milestones: [],
    };
    const g = projectBaselineGhosts(diff, scale);
    expect(g.ticks.map((t) => t.id).sort()).toEqual(['gone:end', 'gone:start']);
  });

  it('ghosts a moved milestone and CLAMPS an out-of-range position while keeping the true date', () => {
    const diff: BaselineGhostDiff = {
      phases: [],
      milestones: [{ id: 'm1', baselineDate: '2027-01-01', currentDate: '2026-08-01' }],
    };
    const g = projectBaselineGhosts(diff, scale);
    expect(g.diamonds).toHaveLength(1);
    expect(g.diamonds[0]).toMatchObject({ id: 'm1', date: '2027-01-01' });
    expect(g.diamonds[0].xPct).toBe(100); // clamped to the scale's edge
  });

  it('skips a boundary/milestone with a null baseline date — no promise to mark', () => {
    const diff: BaselineGhostDiff = {
      phases: [{ id: 'p', baselineStart: null, currentStart: '2026-06-20', baselineEnd: null, currentEnd: '2026-07-20' }],
      milestones: [{ id: 'm', baselineDate: null, currentDate: '2026-07-01' }],
    };
    const g = projectBaselineGhosts(diff, scale);
    expect(g.ticks).toHaveLength(0);
    expect(g.diamonds).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ruleBars — the Drafting Line's draggable phase bars (B1)
// ═══════════════════════════════════════════════════════════════════════════

describe('ruleBars', () => {
  const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-04-11' }], '2026-02-20')!;

  it('spans exactly the phase start→end, carrying the start epoch and the day duration', () => {
    const phases = [rphase({ id: 'a', start: '2026-01-01', end: '2026-01-31' })];
    const [bar] = ruleBars(phases, [link('a', null, 'Design')], scale);
    expect(bar.id).toBe('a');
    expect(bar.name).toBe('Design');
    expect(bar.leftPct).toBeCloseTo(scale.toX('2026-01-01')!, 10);
    expect(bar.widthPct).toBeCloseTo(scale.toX('2026-01-31')! - scale.toX('2026-01-01')!, 10);
    expect(bar.startEpoch).toBe(epochDayFromISO('2026-01-01')!);
    expect(bar.durationDays).toBe(30);
  });

  it('a same-day phase reports a 1-day duration (the same ≥1 clamp a boundary drag applies)', () => {
    const phases = [rphase({ id: 'a', start: '2026-02-02', end: '2026-02-02' })];
    expect(ruleBars(phases, [link('a', null)], scale)[0].durationDays).toBe(1);
  });

  it('carries the resolver anchored flag — unanchored and anchored bars both get one', () => {
    const phases = [
      rphase({ id: 'free', start: '2026-01-01', end: '2026-01-31' }),
      rphase({ id: 'pinned', start: '2026-02-01', end: '2026-03-01', anchored: true, source: 'anchor' }),
    ];
    const bars = ruleBars(phases, [link('free', null), link('pinned', null)], scale);
    expect(bars.map((b) => [b.id, b.anchored])).toEqual([
      ['free', false],
      ['pinned', true],
    ]);
  });

  it('thread-lane phases are excluded (they draw hairlines, not bars)', () => {
    const phases = [
      rphase({ id: 'main', start: '2026-01-01', end: '2026-01-31' }),
      rphase({ id: 'thr', start: '2026-01-05', end: '2026-02-05', lane: 'thread' }),
    ];
    expect(ruleBars(phases, [link('main', null), link('thr', null)], scale).map((b) => b.id)).toEqual([
      'main',
    ]);
  });

  it('an unplaced phase (missing either date) gets no bar — never a bar at x:0/NaN', () => {
    const phases = [
      rphase({ id: 'nodates', start: null, end: null, source: 'unresolved' }),
      rphase({ id: 'halfdated', start: '2026-01-01', end: null, source: 'legacy-dates' }),
    ];
    expect(ruleBars(phases, [link('nodates', null), link('halfdated', null)], scale)).toEqual([]);
  });

  it('hasInternalEndBoundary: true where a boundary handle owns the end, false on the TERMINAL phase', () => {
    const phases = [
      rphase({ id: 'a', start: '2026-01-01', end: '2026-01-31' }),
      rphase({ id: 'b', start: '2026-01-31', end: '2026-02-28' }),
      rphase({ id: 'c', start: '2026-02-28', end: '2026-03-31' }),
    ];
    const chain = [link('a', null), link('b', 'a'), link('c', 'b')];
    const bars = ruleBars(phases, chain, scale);
    expect(bars.map((b) => [b.id, b.hasInternalEndBoundary])).toEqual([
      ['a', true], // a→b boundary handle stands on a's end
      ['b', true], // b→c boundary handle stands on b's end
      ['c', false], // terminal — nothing follows, so the bar owns its own end
    ]);
  });

  it('hasInternalEndBoundary agrees with ruleBoundaries exactly, including a LOCKED boundary', () => {
    const phases = [
      rphase({ id: 'a', start: '2026-01-01', end: '2026-01-31' }),
      rphase({ id: 'install', start: '2026-02-15', end: '2026-03-15', anchored: true }),
    ];
    const chain = [link('a', null), link('install', 'a', 'Installation')];
    const bounded = new Set(ruleBoundaries(phases, chain, scale).map((x) => x.upstreamPhaseId));
    const bars = ruleBars(phases, chain, scale);
    for (const bar of bars) expect(bar.hasInternalEndBoundary).toBe(bounded.has(bar.id));
    // 'a' is locked-but-bounded; the anchored terminal 'install' still resizes.
    expect(bars.find((b) => b.id === 'a')!.hasInternalEndBoundary).toBe(true);
    expect(bars.find((b) => b.id === 'install')!.hasInternalEndBoundary).toBe(false);
  });

  it('a standalone phase (no chain at all) owns its end', () => {
    const phases = [rphase({ id: 'solo', start: '2026-01-10', end: '2026-02-10' })];
    expect(ruleBars(phases, [link('solo', null)], scale)[0].hasInternalEndBoundary).toBe(false);
  });

  it('a phase absent from the chain lookup gets an empty name, never undefined', () => {
    const phases = [rphase({ id: 'ghost', start: '2026-01-01', end: '2026-01-31' })];
    expect(ruleBars(phases, [], scale)[0].name).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// barMoveStartEpoch / barNudgeEpochDay — the bar's pure drag + keyboard math
// ═══════════════════════════════════════════════════════════════════════════

describe('barMoveStartEpoch', () => {
  it('new start = dragged day − the offset the pointer held into the bar', () => {
    const start = epochDayFromISO('2026-01-01')!;
    const grabOffset = 4; // grabbed 4 days into the bar
    expect(barMoveStartEpoch(grabOffset, start + 10)).toBe(start + 6);
  });

  it('the SAME subtraction yields the grab offset at drag begin', () => {
    const start = epochDayFromISO('2026-01-01')!;
    const grabbedOn = epochDayFromISO('2026-01-05')!;
    const grabOffset = barMoveStartEpoch(start, grabbedOn);
    expect(grabOffset).toBe(4);
    // dragging back onto the same day reproduces the untouched start.
    expect(barMoveStartEpoch(grabOffset, grabbedOn)).toBe(start);
  });

  it('a grab at the bar’s left edge snaps the start straight to the dragged day', () => {
    const start = epochDayFromISO('2026-03-01')!;
    expect(barMoveStartEpoch(0, start - 3)).toBe(start - 3);
  });

  it('rounds both inputs to whole days (day math is integer-only)', () => {
    expect(barMoveStartEpoch(2.4, 100.6)).toBe(99);
  });
});

describe('barNudgeEpochDay', () => {
  it('shifts an epoch day forward and backward by whole days', () => {
    const day = epochDayFromISO('2026-05-10')!;
    expect(isoFromEpochDay(barNudgeEpochDay(day, 1))).toBe('2026-05-11');
    expect(isoFromEpochDay(barNudgeEpochDay(day, -1))).toBe('2026-05-09');
    expect(isoFromEpochDay(barNudgeEpochDay(day, 7))).toBe('2026-05-17');
    expect(isoFromEpochDay(barNudgeEpochDay(day, -7))).toBe('2026-05-03');
  });

  it('a zero nudge is the identity; it crosses a month boundary correctly', () => {
    const day = epochDayFromISO('2026-01-30')!;
    expect(barNudgeEpochDay(day, 0)).toBe(day);
    expect(isoFromEpochDay(barNudgeEpochDay(day, 7))).toBe('2026-02-06');
  });

  it('composes with boundaryDurationDays for the RESIZE nudge (clamped ≥ 1)', () => {
    const start = epochDayFromISO('2026-01-01')!;
    // a 3-day phase nudged −1 → 2 days; nudged −7 → clamped to 1.
    expect(boundaryDurationDays(start, barNudgeEpochDay(start, 3 - 1))).toBe(2);
    expect(boundaryDurationDays(start, barNudgeEpochDay(start, 3 - 7))).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// projectGhosts — follower delta chips (B1)
// ═══════════════════════════════════════════════════════════════════════════

describe('projectGhosts — deltaDays chips', () => {
  const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-04-11' }], '2026-02-20')!;

  it('a follower carries its own start slide in days; the EDITED phase carries null', () => {
    const diff = rdiff({
      edit: { kind: 'phase-duration', phaseId: 'a', durationDays: 40 },
      phaseChanges: [
        pchange({ phaseId: 'a', fromStart: '2026-01-01', toStart: '2026-01-01', fromEnd: '2026-01-31', toEnd: '2026-02-10', moved: true }),
        pchange({ phaseId: 'b', fromStart: '2026-01-31', toStart: '2026-02-10', toEnd: '2026-03-01', moved: true }),
      ],
    });
    const g = projectGhosts(diff, scale);
    expect(g.ticks.find((t) => t.id === 'a')!.deltaDays).toBeNull();
    expect(g.ticks.find((t) => t.id === 'b')!.deltaDays).toBe(10);
  });

  it('a follower pulled EARLIER carries a negative delta (the chip’s U+2212 case)', () => {
    const diff = rdiff({
      edit: { kind: 'phase-duration', phaseId: 'a', durationDays: 20 },
      phaseChanges: [
        pchange({ phaseId: 'a', fromEnd: '2026-01-31', toEnd: '2026-01-21', moved: true }),
        pchange({ phaseId: 'b', fromStart: '2026-01-31', toStart: '2026-01-29', moved: true }),
      ],
    });
    expect(projectGhosts(diff, scale).ticks.find((t) => t.id === 'b')!.deltaDays).toBe(-2);
  });

  it('a bar MOVE (phase-anchor) still reports the follower delta, and null on the dragged bar', () => {
    const diff = rdiff({
      edit: { kind: 'phase-anchor', phaseId: 'a', anchorDate: '2026-01-04' },
      phaseChanges: [
        pchange({ phaseId: 'a', fromStart: '2026-01-01', toStart: '2026-01-04', moved: true, anchored: true }),
        pchange({ phaseId: 'b', fromStart: '2026-01-31', toStart: '2026-02-03', moved: true }),
      ],
    });
    const g = projectGhosts(diff, scale);
    expect(g.ticks.find((t) => t.id === 'a')!.deltaDays).toBeNull();
    expect(g.ticks.find((t) => t.id === 'b')!.deltaDays).toBe(3);
  });

  it('an unplaceable from/to start leaves the delta null — the tick still draws', () => {
    const diff = rdiff({
      edit: { kind: 'phase-duration', phaseId: 'a', durationDays: 40 },
      phaseChanges: [
        pchange({ phaseId: 'a', fromEnd: '2026-01-31', toEnd: '2026-02-10', moved: true }),
        // a follower that had no committed start (newly placeable) — nothing to subtract.
        pchange({ phaseId: 'b', fromStart: null, toStart: '2026-02-10', moved: true }),
      ],
    });
    const g = projectGhosts(diff, scale);
    const tickB = g.ticks.find((t) => t.id === 'b')!;
    expect(tickB.date).toBe('2026-02-10');
    expect(tickB.deltaDays).toBeNull();
  });

  it('a follower that slid zero days reports 0 (the layer suppresses the chip, not the tick)', () => {
    const diff = rdiff({
      edit: { kind: 'phase-duration', phaseId: 'a', durationDays: 40 },
      phaseChanges: [
        pchange({ phaseId: 'a', fromEnd: '2026-01-31', toEnd: '2026-02-10', moved: true }),
        pchange({ phaseId: 'b', fromStart: '2026-02-10', toStart: '2026-02-10', fromEnd: '2026-03-01', toEnd: '2026-03-05', moved: true }),
      ],
    });
    expect(projectGhosts(diff, scale).ticks.find((t) => t.id === 'b')!.deltaDays).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// endBoundaryLocked + barCanResize — a locked boundary must not strand a
// phase's duration (review fix 2)
// ═══════════════════════════════════════════════════════════════════════════

describe('ruleBars — endBoundaryLocked', () => {
  const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-04-11' }], '2026-02-20')!;

  it('mirrors the boundary handle’s own locked flag onto the upstream bar', () => {
    const phases = [
      rphase({ id: 'a', start: '2026-01-01', end: '2026-01-31' }),
      rphase({ id: 'install', start: '2026-02-15', end: '2026-03-15', anchored: true }),
    ];
    const chain = [link('a', null), link('install', 'a', 'Installation')];
    const bars = ruleBars(phases, chain, scale);
    const boundary = ruleBoundaries(phases, chain, scale)[0];
    expect(boundary.locked).toBe(true);
    expect(bars.find((b) => b.id === 'a')!.endBoundaryLocked).toBe(true);
  });

  it('an UNLOCKED boundary leaves the flag false', () => {
    const phases = [
      rphase({ id: 'a', start: '2026-01-01', end: '2026-01-31' }),
      rphase({ id: 'b', start: '2026-01-31', end: '2026-02-28' }),
    ];
    const bars = ruleBars(phases, [link('a', null), link('b', 'a')], scale);
    expect(bars.find((b) => b.id === 'a')!).toMatchObject({
      hasInternalEndBoundary: true,
      endBoundaryLocked: false,
    });
  });

  it('a phase with NO boundary on its end is never “locked”', () => {
    const phases = [rphase({ id: 'solo', start: '2026-01-10', end: '2026-02-10' })];
    expect(ruleBars(phases, [link('solo', null)], scale)[0]).toMatchObject({
      hasInternalEndBoundary: false,
      endBoundaryLocked: false,
    });
  });
});

describe('barCanResize — the truth table', () => {
  it('covers all four (hasInternalEndBoundary × endBoundaryLocked) combinations', () => {
    // no boundary → the bar owns its end, locked flag irrelevant.
    expect(barCanResize({ hasInternalEndBoundary: false, endBoundaryLocked: false })).toBe(true);
    expect(barCanResize({ hasInternalEndBoundary: false, endBoundaryLocked: true })).toBe(true);
    // a live boundary handle owns the end — the bar stays out of it.
    expect(barCanResize({ hasInternalEndBoundary: true, endBoundaryLocked: false })).toBe(false);
    // the handle is there but refuses every drag — the bar is the only way left.
    expect(barCanResize({ hasInternalEndBoundary: true, endBoundaryLocked: true })).toBe(true);
  });

  it('holds against real derived bars: chained · locked-downstream · terminal', () => {
    const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-04-11' }], '2026-02-20')!;
    const phases = [
      rphase({ id: 'a', start: '2026-01-01', end: '2026-01-31' }),
      rphase({ id: 'b', start: '2026-01-31', end: '2026-02-14' }),
      rphase({ id: 'install', start: '2026-02-20', end: '2026-03-20', anchored: true }),
    ];
    // a→b is an ordinary edge; b→install locks (install is anchored); install is terminal.
    const chain = [link('a', null), link('b', 'a', 'B'), link('install', 'b', 'Installation')];
    const bars = ruleBars(phases, chain, scale);
    expect(bars.map((b) => [b.id, barCanResize(b)])).toEqual([
      ['a', false], // ordinary boundary handle owns a's end
      ['b', true], // locked handle refuses — the bar must carry the duration
      ['install', true], // terminal — nothing follows
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// clampBarEpochDay — the domain clamp a bar applies after its own math
// ═══════════════════════════════════════════════════════════════════════════

describe('clampBarEpochDay', () => {
  const lo = epochDayFromISO('2026-01-01')!;
  const hi = epochDayFromISO('2026-06-01')!;

  it('passes an in-domain day through untouched', () => {
    const mid = epochDayFromISO('2026-03-01')!;
    expect(clampBarEpochDay(mid, lo, hi)).toBe(mid);
  });

  it('clamps below the minimum and above the maximum to the edges', () => {
    expect(clampBarEpochDay(lo - 40, lo, hi)).toBe(lo);
    expect(clampBarEpochDay(hi + 40, lo, hi)).toBe(hi);
    expect(clampBarEpochDay(lo, lo, hi)).toBe(lo); // the edges themselves are in-domain
    expect(clampBarEpochDay(hi, lo, hi)).toBe(hi);
  });

  it('rounds to a whole day (day math is integer-only)', () => {
    expect(clampBarEpochDay(lo + 5.6, lo, hi)).toBe(lo + 6);
  });

  it('tolerates reversed bounds rather than inverting the clamp', () => {
    expect(clampBarEpochDay(lo - 40, hi, lo)).toBe(lo);
    expect(clampBarEpochDay(hi + 40, hi, lo)).toBe(hi);
  });

  it('composes with barMoveStartEpoch: a grab-offset subtraction can never leave the domain', () => {
    // grabbed 10 days into the bar, dragged onto the domain's first day.
    const staged = clampBarEpochDay(barMoveStartEpoch(10, lo), lo, hi);
    expect(staged).toBe(lo);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ruleLanes — the drafting strip's one-lane-per-phase vertical layout
// ═══════════════════════════════════════════════════════════════════════════

describe('ruleLanes', () => {
  const dated = (id: string, over: Partial<ResolvedPhase> = {}) =>
    rphase({ id, start: '2026-01-01', end: '2026-02-01', ...over });

  it('one lane per placed phase, stacked top to bottom with no gaps', () => {
    const { lanes, totalHeightPx } = ruleLanes([dated('a'), dated('b'), dated('c')], ['a', 'b', 'c']);
    expect(lanes.map((l) => [l.id, l.index, l.topPx])).toEqual([
      ['a', 0, 0],
      ['b', 1, MAIN_LANE_H],
      ['c', 2, MAIN_LANE_H * 2],
    ]);
    expect(lanes.every((l) => l.heightPx === MAIN_LANE_H)).toBe(true);
    expect(totalHeightPx).toBe(MAIN_LANE_H * 3);
  });

  it('follows the ledger order it is given, not the resolver’s array order', () => {
    // resolver hands them back c, a, b; the ledger sorts a, b, c.
    const { lanes } = ruleLanes([dated('c'), dated('a'), dated('b')], ['a', 'b', 'c']);
    expect(lanes.map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('threads come AFTER every main lane and sit shorter', () => {
    const phases = [
      dated('thread-1', { lane: 'thread' }),
      dated('main-1'),
      dated('thread-2', { lane: 'thread' }),
      dated('main-2'),
    ];
    const { lanes, totalHeightPx } = ruleLanes(phases, ['thread-1', 'main-1', 'thread-2', 'main-2']);
    expect(lanes.map((l) => [l.id, l.lane])).toEqual([
      ['main-1', 'main'],
      ['main-2', 'main'],
      ['thread-1', 'thread'],
      ['thread-2', 'thread'],
    ]);
    expect(lanes[2].topPx).toBe(MAIN_LANE_H * 2);
    expect(lanes[3].topPx).toBe(MAIN_LANE_H * 2 + THREAD_LANE_H);
    expect(totalHeightPx).toBe(MAIN_LANE_H * 2 + THREAD_LANE_H * 2);
  });

  it('an unplaced phase gets NO lane (it cannot be drawn against a date scale)', () => {
    const phases = [
      dated('placed'),
      rphase({ id: 'nodates', start: null, end: null, source: 'unresolved' }),
      rphase({ id: 'halfdated', start: '2026-01-01', end: null, source: 'legacy-dates' }),
    ];
    const { lanes } = ruleLanes(phases, ['placed', 'nodates', 'halfdated']);
    expect(lanes.map((l) => l.id)).toEqual(['placed']);
  });

  it('a phase absent from the order sorts last within its group, deterministically', () => {
    const { lanes } = ruleLanes([dated('zz'), dated('aa'), dated('known')], ['known']);
    expect(lanes.map((l) => l.id)).toEqual(['known', 'aa', 'zz']);
  });

  it('is stable: the same inputs always produce the same layout', () => {
    const phases = [dated('b'), dated('a'), dated('t', { lane: 'thread' })];
    const first = ruleLanes(phases, ['a', 'b', 't']);
    const second = ruleLanes(phases, ['a', 'b', 't']);
    expect(second).toEqual(first);
  });

  it('honours height overrides (the strip owns its own rhythm)', () => {
    const { lanes, totalHeightPx } = ruleLanes(
      [dated('m'), dated('t', { lane: 'thread' })],
      ['m', 't'],
      { mainHeightPx: 50, threadHeightPx: 20 },
    );
    expect(lanes.map((l) => l.heightPx)).toEqual([50, 20]);
    expect(totalHeightPx).toBe(70);
  });

  it('empty input is an empty, zero-height layout — never throws', () => {
    expect(ruleLanes([], [])).toEqual({ lanes: [], totalHeightPx: 0 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// monthColumns / weekGridlines — the strip's graph paper
// ═══════════════════════════════════════════════════════════════════════════

describe('monthColumns', () => {
  it('names every first-of-month inside the PADDED domain, in order, upper-cased', () => {
    // Aug 5 → Nov 20 is 107 days; the scale's symmetric 4% pad reaches back past
    // Aug 1, so August's own column is legitimately inside the domain.
    const scale = buildTimeScale([{ start: '2026-08-05', end: '2026-11-20' }], '2026-09-01')!;
    expect(epochDayFromISO('2026-08-01')!).toBeGreaterThanOrEqual(scale.minEpoch);
    const cols = monthColumns(scale);
    expect(cols.map((c) => c.label)).toEqual(['AUG', 'SEP', 'OCT', 'NOV']);
    expect(cols.map((c) => c.key)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
  });

  it('places each column where the scale places that date', () => {
    const scale = buildTimeScale([{ start: '2026-08-05', end: '2026-11-20' }], '2026-09-01')!;
    for (const col of monthColumns(scale)) {
      expect(col.xPct).toBeCloseTo(scale.toX(`${col.key}-01`)!, 10);
    }
  });

  it('crosses a year boundary correctly', () => {
    const scale = buildTimeScale([{ start: '2026-11-10', end: '2027-02-10' }], '2026-12-01')!;
    expect(monthColumns(scale).map((c) => c.key)).toEqual([
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  it('a domain narrower than one month boundary yields no columns', () => {
    const scale = buildTimeScale([{ start: '2026-03-05', end: '2026-03-20' }], '2026-03-10')!;
    expect(monthColumns(scale)).toEqual([]);
  });
});

describe('weekGridlines', () => {
  it('every line lands on a Monday', () => {
    const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-03-01' }], '2026-02-01')!;
    const span = scale.maxEpoch - scale.minEpoch;
    for (const x of weekGridlines(scale)) {
      const epoch = Math.round(scale.minEpoch + (x / 100) * span);
      const iso = isoFromEpochDay(epoch)!;
      // Jan 5 2026 is a Monday; every line must be a whole number of weeks off it.
      expect((epoch - epochDayFromISO('2026-01-05')!) % 7).toBe(0);
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('lines are 7 days apart and stay inside the domain', () => {
    const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-03-01' }], '2026-02-01')!;
    const xs = weekGridlines(scale);
    expect(xs.length).toBeGreaterThan(5);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(100);
    const span = scale.maxEpoch - scale.minEpoch;
    const days = xs.map((x) => Math.round(scale.minEpoch + (x / 100) * span));
    for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBe(7);
  });

  it('a single-day domain never loops or divides by zero', () => {
    const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-01-01' }], '2026-01-01')!;
    expect(Array.isArray(weekGridlines(scale))).toBe(true);
    expect(weekGridlines(scale).every((x) => Number.isFinite(x))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// projectGhostBars — the ripple diff → one ghost bar per moved lane
// ═══════════════════════════════════════════════════════════════════════════

describe('projectGhostBars', () => {
  const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-04-11' }], '2026-02-20')!;

  it('a moved phase ghosts its WHOLE new span, not just a boundary tick', () => {
    const diff = rdiff({
      edit: { kind: 'phase-anchor', phaseId: 'a', anchorDate: '2026-01-11' },
      phaseChanges: [
        pchange({
          phaseId: 'a',
          fromStart: '2026-01-01',
          toStart: '2026-01-11',
          fromEnd: '2026-01-31',
          toEnd: '2026-02-10',
          moved: true,
        }),
      ],
    });
    const [bar] = projectGhostBars(diff, scale);
    expect(bar.leftPct).toBeCloseTo(scale.toX('2026-01-11')!, 10);
    expect(bar.widthPct).toBeCloseTo(scale.toX('2026-02-10')! - scale.toX('2026-01-11')!, 10);
    expect(bar.edited).toBe(true);
    expect(bar.deltaDays).toBeNull(); // the cause carries no consequence chip
  });

  it('followers carry their slide as a signed delta; the edited phase does not', () => {
    const diff = rdiff({
      edit: { kind: 'phase-duration', phaseId: 'a', durationDays: 40 },
      phaseChanges: [
        pchange({ phaseId: 'a', fromStart: '2026-01-01', toStart: '2026-01-01', fromEnd: '2026-01-31', toEnd: '2026-02-10', moved: true }),
        pchange({ phaseId: 'b', fromStart: '2026-01-31', toStart: '2026-02-10', toEnd: '2026-03-01', moved: true }),
      ],
    });
    const bars = projectGhostBars(diff, scale);
    expect(bars.find((b) => b.id === 'a')).toMatchObject({ edited: true, deltaDays: null });
    expect(bars.find((b) => b.id === 'b')).toMatchObject({ edited: false, deltaDays: 10 });
  });

  it('a follower pulled earlier reports a negative delta', () => {
    const diff = rdiff({
      edit: { kind: 'phase-duration', phaseId: 'a', durationDays: 20 },
      phaseChanges: [
        pchange({ phaseId: 'b', fromStart: '2026-01-31', toStart: '2026-01-29', toEnd: '2026-02-20', moved: true }),
      ],
    });
    expect(projectGhostBars(diff, scale)[0].deltaDays).toBe(-2);
  });

  it('an unmoved phase ghosts nothing', () => {
    const diff = rdiff({
      edit: { kind: 'phase-duration', phaseId: 'a', durationDays: 30 },
      phaseChanges: [
        pchange({ phaseId: 'held', toStart: '2026-03-01', toEnd: '2026-03-20', moved: false, anchored: true, holds: true }),
      ],
    });
    expect(projectGhostBars(diff, scale)).toEqual([]);
  });

  it('an unplaceable endpoint drops that ghost — never a NaN-width bar', () => {
    const diff = rdiff({
      edit: { kind: 'phase-duration', phaseId: 'a', durationDays: 30 },
      phaseChanges: [pchange({ phaseId: 'a', toStart: '2026-02-01', toEnd: null, moved: true })],
    });
    expect(projectGhostBars(diff, scale)).toEqual([]);
  });

  it('a milestone-only edit moves no phase, so no lane ghosts a bar', () => {
    const diff = rdiff({
      edit: { kind: 'milestone-offset', milestoneId: 'm', phaseId: 'a', offsetDays: 3 },
      milestoneMoves: [mmove({ milestoneId: 'm', phaseId: 'a', toDate: '2026-02-14', moved: true })],
    });
    expect(projectGhostBars(diff, scale)).toEqual([]);
  });
});

describe('projectGhosts — diamonds carry their host phase (lane placement)', () => {
  const scale = buildTimeScale([{ start: '2026-01-01', end: '2026-04-11' }], '2026-02-20')!;

  it('a ghost diamond names the phase whose lane hosts it', () => {
    const diff = rdiff({
      edit: { kind: 'milestone-offset', milestoneId: 'm', phaseId: 'host', offsetDays: 3 },
      milestoneMoves: [
        mmove({ milestoneId: 'm', phaseId: 'host', name: 'Sofa', fromDate: '2026-02-01', toDate: '2026-02-14', moved: true }),
      ],
    });
    expect(projectGhosts(diff, scale).diamonds[0]).toMatchObject({ id: 'm', phaseId: 'host' });
  });
});
