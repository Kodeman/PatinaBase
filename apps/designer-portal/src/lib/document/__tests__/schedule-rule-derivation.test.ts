import type { ResolvedPhase, ResolvedMilestone } from '@patina/utils';
import { epochDayFromISO } from '@patina/utils';
import {
  buildTimeScale,
  assignLabelRows,
  ruleWeightForStatus,
  ruleSegments,
  ruleDiamonds,
  ruleThreads,
  unplacedPhases,
  foldedLayers,
  type TimeScale,
  type LabelInput,
} from '../schedule-rule-derivation';

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
