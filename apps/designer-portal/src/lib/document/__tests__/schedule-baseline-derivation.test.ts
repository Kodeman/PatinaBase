/**
 * Slice 05 · baseline derivation (R100 "Memory"). Pins `snapshotToResolverInputs`
 * (jsonb `phase_snapshots` → resolver inputs, TOTAL over malformed/unknown
 * shapes) and `baselineGhostDiff` (baseline-vs-current resolved-schedule diff,
 * matched by id) against a frozen contract — the clay ghost layer (S5-3) and
 * the revision-cut telemetry (S5-2/S5-3) are both built against these exact
 * shapes.
 */

import { snapshotToResolverInputs, baselineGhostDiff } from '../schedule-baseline-derivation';
import type {
  SchedulePhaseInput,
  ScheduleMilestoneInput,
  ResolvedSchedule,
  ResolvedPhase,
  ResolvedMilestone,
} from '@patina/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Factories — every field defaulted (mirrors schedule-ripple-derivation.test.ts
// conventions, which itself mirrors schedule.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

function resolvedPhase(over: Partial<ResolvedPhase> & { id: string }): ResolvedPhase {
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

function resolvedMilestone(over: Partial<ResolvedMilestone> & { id: string; phaseId: string }): ResolvedMilestone {
  return {
    id: over.id,
    phaseId: over.phaseId,
    date: over.date ?? null,
    anchored: over.anchored ?? false,
    derivedStatus: over.derivedStatus ?? 'upcoming',
  };
}

function schedule(phases: ResolvedPhase[], milestones: ResolvedMilestone[] = []): ResolvedSchedule {
  return { phases, milestones, conflicts: [], slackDays: null };
}

// Raw snapshot phase/milestone builders — deliberately snake_case + `unknown`
// so tests exercise the same untyped-jsonb boundary the function does.
function rawPhase(over: Record<string, unknown> & { id: string }): Record<string, unknown> {
  return { milestones: [], ...over };
}

function rawMilestone(over: Record<string, unknown> & { id: string }): Record<string, unknown> {
  return { ...over };
}

// ═══════════════════════════════════════════════════════════════════════════
// snapshotToResolverInputs
// ═══════════════════════════════════════════════════════════════════════════

describe('snapshotToResolverInputs', () => {
  it('degrades non-array snapshots to empty arrays (totality)', () => {
    for (const bad of [null, undefined, {}, 'oops', 42, true, { phases: [] }]) {
      expect(snapshotToResolverInputs(bad)).toEqual({ phases: [], milestones: [] });
    }
  });

  it('returns empty arrays for an empty snapshot array', () => {
    expect(snapshotToResolverInputs([])).toEqual({ phases: [], milestones: [] });
  });

  it('maps a full, well-formed phase + embedded milestones snake_case → camelCase', () => {
    const snapshot = [
      rawPhase({
        id: 'ph-1',
        name: 'Design',
        phase_key: 'design',
        duration_days: 14,
        duration_weeks: null,
        follows_phase_id: null,
        anchor_date: '2026-01-05',
        lane: 'main',
        start_date: '2026-01-01',
        target_end_date: '2026-01-15',
        sort_order: 0,
        status: 'in_progress',
        milestones: [
          rawMilestone({
            id: 'ms-1',
            name: 'Kickoff signed',
            kind: 'signoff',
            offset_days: null,
            anchor_date: '2026-01-05',
            status: 'due',
            sort_order: 0,
          }),
        ],
      }),
    ];

    const result = snapshotToResolverInputs(snapshot);

    const expectedPhase: SchedulePhaseInput = {
      id: 'ph-1',
      name: 'Design',
      durationDays: 14,
      durationWeeks: null,
      followsPhaseId: null,
      anchorDate: '2026-01-05',
      lane: 'main',
      startDate: '2026-01-01',
      targetEndDate: '2026-01-15',
      sortOrder: 0,
      status: 'in_progress',
    };
    const expectedMilestone: ScheduleMilestoneInput = {
      id: 'ms-1',
      phaseId: 'ph-1',
      name: 'Kickoff signed',
      kind: 'signoff',
      offsetDays: null,
      anchorDate: '2026-01-05',
      status: 'due',
      sortOrder: 0,
    };

    expect(result.phases).toEqual([expectedPhase]);
    expect(result.milestones).toEqual([expectedMilestone]);
  });

  it('injects the enclosing phase id as milestone phaseId (the snapshot carries none)', () => {
    const snapshot = [
      rawPhase({
        id: 'ph-A',
        milestones: [rawMilestone({ id: 'ms-A1' }), rawMilestone({ id: 'ms-A2' })],
      }),
      rawPhase({ id: 'ph-B', milestones: [rawMilestone({ id: 'ms-B1' })] }),
    ];

    const { milestones } = snapshotToResolverInputs(snapshot);

    expect(milestones.map((m) => [m.id, m.phaseId])).toEqual([
      ['ms-A1', 'ph-A'],
      ['ms-A2', 'ph-A'],
      ['ms-B1', 'ph-B'],
    ]);
  });

  it('drops malformed phase entries (non-object, or missing/non-string id) without throwing', () => {
    const snapshot = [null, undefined, 'not-a-phase', 42, [], {}, { id: 7 }, rawPhase({ id: 'ph-ok' })];

    expect(() => snapshotToResolverInputs(snapshot)).not.toThrow();
    const { phases } = snapshotToResolverInputs(snapshot);
    expect(phases.map((p) => p.id)).toEqual(['ph-ok']);
  });

  it('drops malformed milestone entries the same way, keeping valid siblings', () => {
    const snapshot = [
      rawPhase({
        id: 'ph-1',
        milestones: [null, 'nope', {}, { id: 3 }, rawMilestone({ id: 'ms-ok' })],
      }),
    ];

    const { milestones } = snapshotToResolverInputs(snapshot);
    expect(milestones.map((m) => m.id)).toEqual(['ms-ok']);
  });

  it('treats a non-array `milestones` field as no milestones (never throws)', () => {
    const snapshot = [rawPhase({ id: 'ph-1', milestones: 'not-an-array' }), rawPhase({ id: 'ph-2' })];
    // ph-2's rawPhase() default already supplies milestones: [] — override to omit it entirely too.
    delete (snapshot[1] as Record<string, unknown>).milestones;

    const { phases, milestones } = snapshotToResolverInputs(snapshot);
    expect(phases.map((p) => p.id)).toEqual(['ph-1', 'ph-2']);
    expect(milestones).toEqual([]);
  });

  it('coerces missing/mistyped phase fields to the resolver-input defaults', () => {
    const snapshot = [
      rawPhase({
        id: 'ph-1',
        name: 42, // not a string
        duration_days: 'ten', // not a number
        duration_weeks: NaN, // not finite
        follows_phase_id: 99, // not a string
        anchor_date: {}, // not a string
        lane: 'sideways', // not a recognized lane
        start_date: null,
        target_end_date: undefined,
        sort_order: 'zero', // not a number
        status: 'not-a-real-status',
      }),
    ];

    const { phases } = snapshotToResolverInputs(snapshot);
    expect(phases).toEqual([
      {
        id: 'ph-1',
        name: '',
        durationDays: null,
        durationWeeks: null,
        followsPhaseId: null,
        anchorDate: null,
        lane: 'main',
        startDate: null,
        targetEndDate: null,
        sortOrder: 0,
        status: 'pending',
      },
    ]);
  });

  it('coerces missing/mistyped milestone fields to the resolver-input defaults', () => {
    const snapshot = [
      rawPhase({
        id: 'ph-1',
        milestones: [
          rawMilestone({
            id: 'ms-1',
            name: null,
            kind: 'not-a-kind',
            offset_days: 'three',
            anchor_date: 5,
            status: 'not-a-status',
            sort_order: null,
          }),
        ],
      }),
    ];

    const { milestones } = snapshotToResolverInputs(snapshot);
    expect(milestones).toEqual([
      {
        id: 'ms-1',
        phaseId: 'ph-1',
        name: '',
        kind: 'event',
        offsetDays: null,
        anchorDate: null,
        status: 'upcoming',
        sortOrder: 0,
      },
    ]);
  });

  it('preserves multi-phase, multi-milestone ordering as given (no re-sort — resolveSchedule owns ordering)', () => {
    const snapshot = [
      rawPhase({ id: 'ph-2', sort_order: 1 }),
      rawPhase({ id: 'ph-1', sort_order: 0 }),
    ];
    const { phases } = snapshotToResolverInputs(snapshot);
    expect(phases.map((p) => p.id)).toEqual(['ph-2', 'ph-1']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// baselineGhostDiff
// ═══════════════════════════════════════════════════════════════════════════

describe('baselineGhostDiff', () => {
  it('returns empty diffs for two empty schedules', () => {
    expect(baselineGhostDiff(schedule([]), schedule([]))).toEqual({ phases: [], milestones: [] });
  });

  it('excludes a phase present in both with identical dates', () => {
    const baseline = schedule([resolvedPhase({ id: 'ph-1', start: '2026-01-01', end: '2026-01-15' })]);
    const current = schedule([resolvedPhase({ id: 'ph-1', start: '2026-01-01', end: '2026-01-15' })]);
    expect(baselineGhostDiff(current, baseline).phases).toEqual([]);
  });

  it('includes a phase present in both whose dates moved', () => {
    const baseline = schedule([resolvedPhase({ id: 'ph-1', start: '2026-01-01', end: '2026-01-15' })]);
    const current = schedule([resolvedPhase({ id: 'ph-1', start: '2026-01-08', end: '2026-01-22' })]);
    expect(baselineGhostDiff(current, baseline).phases).toEqual([
      { id: 'ph-1', baselineStart: '2026-01-01', baselineEnd: '2026-01-15', currentStart: '2026-01-08', currentEnd: '2026-01-22' },
    ]);
  });

  it('includes a phase whose end alone moved (start held)', () => {
    const baseline = schedule([resolvedPhase({ id: 'ph-1', start: '2026-01-01', end: '2026-01-15' })]);
    const current = schedule([resolvedPhase({ id: 'ph-1', start: '2026-01-01', end: '2026-01-20' })]);
    expect(baselineGhostDiff(current, baseline).phases).toEqual([
      { id: 'ph-1', baselineStart: '2026-01-01', baselineEnd: '2026-01-15', currentStart: '2026-01-01', currentEnd: '2026-01-20' },
    ]);
  });

  it('skips a phase added after the baseline (present only in current)', () => {
    const baseline = schedule([resolvedPhase({ id: 'ph-1', start: '2026-01-01', end: '2026-01-15' })]);
    const current = schedule([
      resolvedPhase({ id: 'ph-1', start: '2026-01-01', end: '2026-01-15' }),
      resolvedPhase({ id: 'ph-new', start: '2026-02-01', end: '2026-02-10' }),
    ]);
    expect(baselineGhostDiff(current, baseline).phases).toEqual([]);
  });

  it('includes a phase deleted since the baseline with null current dates', () => {
    const baseline = schedule([resolvedPhase({ id: 'ph-gone', start: '2026-01-01', end: '2026-01-15' })]);
    const current = schedule([]);
    expect(baselineGhostDiff(current, baseline).phases).toEqual([
      { id: 'ph-gone', baselineStart: '2026-01-01', baselineEnd: '2026-01-15', currentStart: null, currentEnd: null },
    ]);
  });

  it('excludes a deleted phase whose baseline dates were already null/null (nothing to ghost)', () => {
    const baseline = schedule([resolvedPhase({ id: 'ph-gone', start: null, end: null })]);
    const current = schedule([]);
    expect(baselineGhostDiff(current, baseline).phases).toEqual([]);
  });

  it('includes a milestone present in both whose date moved, excludes one unchanged', () => {
    const baseline = schedule(
      [],
      [
        resolvedMilestone({ id: 'ms-moved', phaseId: 'ph-1', date: '2026-01-05' }),
        resolvedMilestone({ id: 'ms-same', phaseId: 'ph-1', date: '2026-01-10' }),
      ],
    );
    const current = schedule(
      [],
      [
        resolvedMilestone({ id: 'ms-moved', phaseId: 'ph-1', date: '2026-01-12' }),
        resolvedMilestone({ id: 'ms-same', phaseId: 'ph-1', date: '2026-01-10' }),
      ],
    );
    expect(baselineGhostDiff(current, baseline).milestones).toEqual([
      { id: 'ms-moved', baselineDate: '2026-01-05', currentDate: '2026-01-12' },
    ]);
  });

  it('skips a milestone added after the baseline', () => {
    const baseline = schedule([], [resolvedMilestone({ id: 'ms-1', phaseId: 'ph-1', date: '2026-01-05' })]);
    const current = schedule(
      [],
      [
        resolvedMilestone({ id: 'ms-1', phaseId: 'ph-1', date: '2026-01-05' }),
        resolvedMilestone({ id: 'ms-new', phaseId: 'ph-1', date: '2026-02-01' }),
      ],
    );
    expect(baselineGhostDiff(current, baseline).milestones).toEqual([]);
  });

  it('includes a milestone deleted since the baseline with a null current date', () => {
    const baseline = schedule([], [resolvedMilestone({ id: 'ms-gone', phaseId: 'ph-1', date: '2026-01-05' })]);
    const current = schedule([]);
    expect(baselineGhostDiff(current, baseline).milestones).toEqual([
      { id: 'ms-gone', baselineDate: '2026-01-05', currentDate: null },
    ]);
  });

  it('handles a mixed multi-phase, multi-milestone diff in one call', () => {
    const baseline = schedule(
      [
        resolvedPhase({ id: 'ph-held', start: '2026-01-01', end: '2026-01-08' }),
        resolvedPhase({ id: 'ph-moved', start: '2026-01-08', end: '2026-01-22' }),
        resolvedPhase({ id: 'ph-deleted', start: '2026-02-01', end: '2026-02-10' }),
      ],
      [
        resolvedMilestone({ id: 'ms-held', phaseId: 'ph-held', date: '2026-01-08' }),
        resolvedMilestone({ id: 'ms-moved', phaseId: 'ph-moved', date: '2026-01-22' }),
      ],
    );
    const current = schedule(
      [
        resolvedPhase({ id: 'ph-held', start: '2026-01-01', end: '2026-01-08' }),
        resolvedPhase({ id: 'ph-moved', start: '2026-01-15', end: '2026-01-29' }),
        resolvedPhase({ id: 'ph-added', start: '2026-03-01', end: '2026-03-10' }),
      ],
      [
        resolvedMilestone({ id: 'ms-held', phaseId: 'ph-held', date: '2026-01-08' }),
        resolvedMilestone({ id: 'ms-moved', phaseId: 'ph-moved', date: '2026-01-29' }),
      ],
    );

    const diff = baselineGhostDiff(current, baseline);

    expect(diff.phases).toEqual([
      { id: 'ph-moved', baselineStart: '2026-01-08', baselineEnd: '2026-01-22', currentStart: '2026-01-15', currentEnd: '2026-01-29' },
      { id: 'ph-deleted', baselineStart: '2026-02-01', baselineEnd: '2026-02-10', currentStart: null, currentEnd: null },
    ]);
    expect(diff.milestones).toEqual([
      { id: 'ms-moved', baselineDate: '2026-01-22', currentDate: '2026-01-29' },
    ]);
  });
});
