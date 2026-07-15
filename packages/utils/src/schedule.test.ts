/**
 * R100 Schedule resolver contract — the ONE pure engine that turns a chain of
 * phases (+ milestones) into dates, slack, lanes, and conflicts.
 *
 * "Dates are never stored as primary truth on unanchored entries — they are
 *  computed by one pure resolver: chain in; dates, slack, and conflicts out.
 *  Nothing else in the app computes time."
 *
 * This suite pins the ruled behaviors (semantics 1-13 in schedule.ts) with exact
 * dates so a downstream hook/UI can be built against a frozen contract and any
 * future edit that changes a derived date fails here. The resolver must be TOTAL:
 * malformed data degrades to conflicts/fallbacks, never throws.
 */

import {
  resolveSchedule,
  epochDayFromISO,
  type SchedulePhaseInput,
  type ScheduleMilestoneInput,
  type PhaseLane,
  type PhaseStatus,
  type MilestoneKind,
  type MilestoneStatus,
  type ResolveScheduleOptions,
} from './schedule';

// ─────────────────────────────────────────────────────────────────────────────
// Factories — every field defaulted so a case declares only what it exercises.
// ─────────────────────────────────────────────────────────────────────────────

function phase(over: Partial<SchedulePhaseInput> & { id: string }): SchedulePhaseInput {
  return {
    id: over.id,
    name: over.name ?? over.id,
    durationDays: over.durationDays ?? null,
    durationWeeks: over.durationWeeks ?? null,
    followsPhaseId: over.followsPhaseId ?? null,
    anchorDate: over.anchorDate ?? null,
    lane: over.lane ?? ('main' as PhaseLane),
    startDate: over.startDate ?? null,
    targetEndDate: over.targetEndDate ?? null,
    sortOrder: over.sortOrder ?? 0,
    status: over.status ?? ('pending' as PhaseStatus),
  };
}

function milestone(
  over: Partial<ScheduleMilestoneInput> & { id: string; phaseId: string },
): ScheduleMilestoneInput {
  return {
    id: over.id,
    phaseId: over.phaseId,
    name: over.name ?? over.id,
    kind: over.kind ?? ('signoff' as MilestoneKind),
    offsetDays: over.offsetDays ?? null,
    anchorDate: over.anchorDate ?? null,
    status: over.status ?? ('upcoming' as MilestoneStatus),
    sortOrder: over.sortOrder ?? 0,
  };
}

const opts = (o: Partial<ResolveScheduleOptions> & { today: string }): ResolveScheduleOptions => ({
  projectStartDate: o.projectStartDate ?? null,
  today: o.today,
});

const P = (r: { phases: { id: string }[] }, id: string) => r.phases.find((p) => p.id === id)!;
const M = (r: { milestones: { id: string }[] }, id: string) => r.milestones.find((m) => m.id === id)!;

// ─────────────────────────────────────────────────────────────────────────────

describe('resolveSchedule — R100 pure engine', () => {
  // 1 ─────────────────────────────────────────────────────────────────────────
  it('forward chain: 3 linked phases from projectStartDate resolve exact contiguous dates', () => {
    const phases = [
      phase({ id: 'a', durationDays: 10, sortOrder: 1 }),
      phase({ id: 'b', durationDays: 14, followsPhaseId: 'a', sortOrder: 2 }),
      phase({ id: 'c', durationDays: 7, followsPhaseId: 'b', sortOrder: 3 }),
    ];
    const r = resolveSchedule(phases, [], opts({ projectStartDate: '2026-01-01', today: '2026-01-01' }));

    expect(r.phases.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(P(r, 'a')).toMatchObject({ start: '2026-01-01', end: '2026-01-11', source: 'chain', lane: 'main', anchored: false, slackDays: null });
    expect(P(r, 'b')).toMatchObject({ start: '2026-01-11', end: '2026-01-25', source: 'chain', lane: 'main' });
    expect(P(r, 'c')).toMatchObject({ start: '2026-01-25', end: '2026-02-01', source: 'chain', lane: 'main' });
    expect(r.conflicts).toEqual([]);
    expect(r.slackDays).toBeNull();
  });

  // 2 ─────────────────────────────────────────────────────────────────────────
  it('backward pass: anchored terminal install with no forward origin derives upstream backward', () => {
    const phases = [
      phase({ id: 'a', durationDays: 10, sortOrder: 1 }),
      phase({ id: 'b', durationDays: 5, followsPhaseId: 'a', sortOrder: 2 }),
      phase({ id: 'c', durationDays: 7, followsPhaseId: 'b', anchorDate: '2026-03-01', sortOrder: 3 }),
    ];
    const r = resolveSchedule(phases, [], opts({ today: '2026-01-01' }));

    expect(P(r, 'c')).toMatchObject({ start: '2026-03-01', end: '2026-03-08', source: 'anchor', anchored: true });
    expect(P(r, 'b')).toMatchObject({ start: '2026-02-24', end: '2026-03-01', source: 'chain', anchored: false });
    expect(P(r, 'a')).toMatchObject({ start: '2026-02-14', end: '2026-02-24', source: 'chain', anchored: false });
    expect(r.conflicts).toEqual([]);
  });

  // 3 ─────────────────────────────────────────────────────────────────────────
  it('overlap → thread: two phases following one predecessor, the second lands on the thread lane', () => {
    const phases = [
      phase({ id: 'a', durationDays: 10, sortOrder: 1 }),
      phase({ id: 'b', durationDays: 5, followsPhaseId: 'a', sortOrder: 2 }),
      phase({ id: 'c', durationDays: 7, followsPhaseId: 'a', sortOrder: 3 }),
    ];
    const r = resolveSchedule(phases, [], opts({ projectStartDate: '2026-01-01', today: '2026-01-01' }));

    expect(P(r, 'a')).toMatchObject({ start: '2026-01-01', end: '2026-01-11', lane: 'main' });
    expect(P(r, 'b')).toMatchObject({ start: '2026-01-11', end: '2026-01-16', lane: 'main' });
    expect(P(r, 'c')).toMatchObject({ start: '2026-01-11', end: '2026-01-18', lane: 'thread' });
    expect(r.conflicts).toEqual([]);
  });

  // 4 ─────────────────────────────────────────────────────────────────────────
  it('slack: origin + downstream anchor with room yields per-phase slack and a top-level minimum', () => {
    const phases = [
      phase({ id: 'a', durationDays: 10, sortOrder: 1 }),
      phase({ id: 'b', durationDays: 5, followsPhaseId: 'a', anchorDate: '2026-01-20', sortOrder: 2 }),
    ];
    const r = resolveSchedule(phases, [], opts({ projectStartDate: '2026-01-01', today: '2026-01-01' }));

    expect(P(r, 'a')).toMatchObject({ start: '2026-01-01', end: '2026-01-11', source: 'chain', slackDays: 9 });
    expect(P(r, 'b')).toMatchObject({ start: '2026-01-20', end: '2026-01-25', source: 'anchor', anchored: true, slackDays: null });
    expect(r.conflicts).toEqual([]);
    expect(r.slackDays).toBe(9);
  });

  // 5 ─────────────────────────────────────────────────────────────────────────
  it('conflict: chain lands past an anchored install → chain_does_not_fit, anchor unmoved', () => {
    const phases = [
      phase({ id: 'a', durationDays: 30, sortOrder: 1 }),
      phase({ id: 'b', durationDays: 10, followsPhaseId: 'a', anchorDate: '2026-01-15', sortOrder: 2 }),
    ];
    const r = resolveSchedule(phases, [], opts({ projectStartDate: '2026-01-01', today: '2026-01-01' }));

    // A keeps its computed dates so the UI can draw the collision.
    expect(P(r, 'a')).toMatchObject({ start: '2026-01-01', end: '2026-01-31', source: 'chain' });
    // The anchor holds.
    expect(P(r, 'b')).toMatchObject({ start: '2026-01-15', end: '2026-01-25', source: 'anchor', anchored: true, lane: 'thread' });

    const fit = r.conflicts.find((c) => c.kind === 'chain_does_not_fit');
    expect(fit).toBeDefined();
    expect(fit).toMatchObject({ kind: 'chain_does_not_fit', phaseId: 'b', anchorId: 'b', overrunDays: 16 });
    expect(typeof fit!.message).toBe('string');
    expect(fit!.message.length).toBeGreaterThan(0);
    // Negative slack is never expressed as a negative top-level number.
    expect(r.slackDays).toBeNull();
  });

  // 6 ─────────────────────────────────────────────────────────────────────────
  it('anchored mid-chain holds: changing an upstream duration never moves the anchor or anything after it', () => {
    const build = (aDur: number) => [
      phase({ id: 'a', durationDays: aDur, sortOrder: 1 }),
      phase({ id: 'b', durationDays: 5, followsPhaseId: 'a', anchorDate: '2026-02-01', sortOrder: 2 }),
      phase({ id: 'c', durationDays: 7, followsPhaseId: 'b', sortOrder: 3 }),
    ];
    const short = resolveSchedule(build(10), [], opts({ projectStartDate: '2026-01-01', today: '2026-01-01' }));
    const long = resolveSchedule(build(40), [], opts({ projectStartDate: '2026-01-01', today: '2026-01-01' }));

    // The anchor (B) and everything downstream (C) are byte-identical across the change.
    for (const id of ['b', 'c']) {
      expect(P(long, id).start).toBe(P(short, id).start);
      expect(P(long, id).end).toBe(P(short, id).end);
    }
    expect(P(short, 'b')).toMatchObject({ start: '2026-02-01', end: '2026-02-06' });
    expect(P(short, 'c')).toMatchObject({ start: '2026-02-06', end: '2026-02-13' });

    // Only the upstream phase A moved.
    expect(P(short, 'a').end).toBe('2026-01-11');
    expect(P(long, 'a').end).toBe('2026-02-10');

    // The short chain fits (slack); the long chain overruns the anchor.
    expect(short.conflicts.some((c) => c.kind === 'chain_does_not_fit')).toBe(false);
    expect(long.conflicts.find((c) => c.kind === 'chain_does_not_fit')).toMatchObject({ anchorId: 'b', overrunDays: 9 });
  });

  // 7 ─────────────────────────────────────────────────────────────────────────
  it('cycle: A↔B emits one chain_cycle, terminates, and members fall back (legacy or unresolved)', () => {
    const phases = [
      phase({ id: 'a', durationDays: 10, followsPhaseId: 'b', startDate: '2026-05-01', targetEndDate: '2026-05-11', sortOrder: 1 }),
      phase({ id: 'b', durationDays: 5, followsPhaseId: 'a', sortOrder: 2 }),
    ];
    const r = resolveSchedule(phases, [], opts({ today: '2026-01-01' }));

    expect(r.conflicts.filter((c) => c.kind === 'chain_cycle')).toHaveLength(1);
    // A has stored dates → legacy passthrough.
    expect(P(r, 'a')).toMatchObject({ start: '2026-05-01', end: '2026-05-11', source: 'legacy-dates' });
    // B has nothing to fall back to → unresolved.
    expect(P(r, 'b')).toMatchObject({ start: null, end: null, source: 'unresolved' });
    expect(r.conflicts.some((c) => c.kind === 'unresolvable' && c.phaseId === 'b')).toBe(true);
  });

  // 8 ─────────────────────────────────────────────────────────────────────────
  it('orphan link: followsPhaseId outside the set emits orphan_link and treats the phase as a root', () => {
    const phases = [phase({ id: 'a', durationDays: 10, followsPhaseId: 'ghost', sortOrder: 1 })];
    const r = resolveSchedule(phases, [], opts({ projectStartDate: '2026-01-01', today: '2026-01-01' }));

    expect(r.conflicts.find((c) => c.kind === 'orphan_link')).toMatchObject({ kind: 'orphan_link', phaseId: 'a' });
    expect(P(r, 'a')).toMatchObject({ start: '2026-01-01', end: '2026-01-11', source: 'chain' });
  });

  // 9 ─────────────────────────────────────────────────────────────────────────
  it('legacy fallback: undated-chain phases render stored dates as-is, ordered by date not sortOrder', () => {
    const phases = [
      phase({ id: 'p1', startDate: '2026-03-01', targetEndDate: '2026-03-10', sortOrder: 3 }),
      phase({ id: 'p2', startDate: '2026-01-05', targetEndDate: '2026-01-15', sortOrder: 1 }),
      phase({ id: 'p3', startDate: '2026-02-01', targetEndDate: '2026-02-10', sortOrder: 2 }),
    ];
    const r = resolveSchedule(phases, [], opts({ today: '2026-01-01' }));

    for (const id of ['p1', 'p2', 'p3']) {
      expect(P(r, id).source).toBe('legacy-dates');
    }
    expect(P(r, 'p1')).toMatchObject({ start: '2026-03-01', end: '2026-03-10' });
    expect(P(r, 'p2')).toMatchObject({ start: '2026-01-05', end: '2026-01-15' });
    expect(P(r, 'p3')).toMatchObject({ start: '2026-02-01', end: '2026-02-10' });
    // Ordered by date ascending, deliberately NOT by sortOrder.
    expect(r.phases.map((p) => p.id)).toEqual(['p2', 'p3', 'p1']);
    expect(r.conflicts).toEqual([]);
  });

  // 10 ────────────────────────────────────────────────────────────────────────
  it('milestones: offset rides the phase end; an anchored milestone holds when its phase moves', () => {
    const build = (aDur: number) =>
      resolveSchedule(
        [phase({ id: 'a', durationDays: aDur, sortOrder: 1 })],
        [
          milestone({ id: 'm1', phaseId: 'a', offsetDays: -3 }),
          milestone({ id: 'm2', phaseId: 'a' }), // null offset = at end
          milestone({ id: 'm3', phaseId: 'a', anchorDate: '2026-01-10' }),
        ],
        opts({ projectStartDate: '2026-01-01', today: '2026-01-01' }),
      );

    const short = build(20); // A ends 2026-01-21
    expect(M(short, 'm1')).toMatchObject({ date: '2026-01-18', anchored: false }); // -3 before end
    expect(M(short, 'm2')).toMatchObject({ date: '2026-01-21', anchored: false }); // at end
    expect(M(short, 'm3')).toMatchObject({ date: '2026-01-10', anchored: true }); // anchored

    const long = build(40); // A ends 2026-02-10
    expect(M(long, 'm1').date).toBe('2026-02-07'); // rides the later end
    expect(M(long, 'm2').date).toBe('2026-02-10'); // rides the later end
    expect(M(long, 'm3').date).toBe('2026-01-10'); // anchored — unchanged
  });

  // 11 ────────────────────────────────────────────────────────────────────────
  it('duration precedence: durationDays beats durationWeeks; weeks-only multiplies by 7', () => {
    const phases = [
      phase({ id: 'a', durationDays: 10, durationWeeks: 4, sortOrder: 1 }), // 10 days wins, not 28
      phase({ id: 'b', durationDays: null, durationWeeks: 4, followsPhaseId: 'a', sortOrder: 2 }), // 28 days
    ];
    const r = resolveSchedule(phases, [], opts({ projectStartDate: '2026-01-01', today: '2026-01-01' }));

    expect(P(r, 'a')).toMatchObject({ start: '2026-01-01', end: '2026-01-11' }); // +10, not +28
    expect(P(r, 'b')).toMatchObject({ start: '2026-01-11', end: '2026-02-08' }); // +28
  });

  // 12 ────────────────────────────────────────────────────────────────────────
  it('derivedStatus: upcoming flips to due when date ≤ today; signed never flips', () => {
    const r = resolveSchedule(
      [phase({ id: 'a', durationDays: 10, sortOrder: 1 })],
      [
        milestone({ id: 'due', phaseId: 'a', status: 'upcoming' }), // date 2026-01-11 ≤ today
        milestone({ id: 'kept', phaseId: 'a', status: 'signed' }), // signed, date ≤ today, stays signed
        milestone({ id: 'future', phaseId: 'a', anchorDate: '2026-12-01', status: 'upcoming' }), // > today
      ],
      opts({ projectStartDate: '2026-01-01', today: '2026-06-15' }),
    );

    expect(M(r, 'due').derivedStatus).toBe('due');
    expect(M(r, 'kept').derivedStatus).toBe('signed');
    expect(M(r, 'future').derivedStatus).toBe('upcoming');
  });

  // 13 ────────────────────────────────────────────────────────────────────────
  it('degenerate: empty inputs yield empty outputs; a single unlinked phase with duration + origin resolves', () => {
    const empty = resolveSchedule([], [], opts({ today: '2026-01-01' }));
    expect(empty).toEqual({ phases: [], milestones: [], conflicts: [], slackDays: null });

    const one = resolveSchedule(
      [phase({ id: 'solo', durationDays: 5, sortOrder: 1 })],
      [],
      opts({ projectStartDate: '2026-01-01', today: '2026-01-01' }),
    );
    expect(P(one, 'solo')).toMatchObject({ start: '2026-01-01', end: '2026-01-06', source: 'chain', slackDays: null });
    expect(one.conflicts).toEqual([]);
  });

  // ── Edge cases beyond the 13 — the algorithm demands them ────────────────────

  it('diamond: two followers of one predecessor where only the shorter overlaps → exactly one thread', () => {
    const phases = [
      phase({ id: 'a', durationDays: 10, sortOrder: 1 }),
      phase({ id: 'long', durationDays: 20, followsPhaseId: 'a', sortOrder: 2 }),
      phase({ id: 'short', durationDays: 5, followsPhaseId: 'a', sortOrder: 3 }),
    ];
    const r = resolveSchedule(phases, [], opts({ projectStartDate: '2026-01-01', today: '2026-01-01' }));

    expect(P(r, 'a')).toMatchObject({ start: '2026-01-01', end: '2026-01-11', lane: 'main' });
    expect(P(r, 'long')).toMatchObject({ start: '2026-01-11', end: '2026-01-31', lane: 'main' });
    expect(P(r, 'short')).toMatchObject({ start: '2026-01-11', end: '2026-01-16', lane: 'thread' });
    // Exactly one phase promoted to thread.
    expect(r.phases.filter((p) => p.lane === 'thread')).toHaveLength(1);
    expect(r.conflicts).toEqual([]);
  });

  it('backward pass over multiple hops keeps the terminal anchor fixed and derives all predecessors', () => {
    const phases = [
      phase({ id: 'a', durationDays: 3, sortOrder: 1 }),
      phase({ id: 'b', durationDays: 4, followsPhaseId: 'a', sortOrder: 2 }),
      phase({ id: 'c', durationDays: 5, followsPhaseId: 'b', sortOrder: 3 }),
      phase({ id: 'd', durationDays: 6, followsPhaseId: 'c', anchorDate: '2026-04-01', sortOrder: 4 }),
    ];
    const r = resolveSchedule(phases, [], opts({ today: '2026-01-01' }));

    expect(P(r, 'd')).toMatchObject({ start: '2026-04-01', end: '2026-04-07', source: 'anchor' });
    expect(P(r, 'c')).toMatchObject({ start: '2026-03-27', end: '2026-04-01', source: 'chain' }); // -5
    expect(P(r, 'b')).toMatchObject({ start: '2026-03-23', end: '2026-03-27', source: 'chain' }); // -4
    expect(P(r, 'a')).toMatchObject({ start: '2026-03-20', end: '2026-03-23', source: 'chain' }); // -3
    expect(r.conflicts).toEqual([]);
  });

  it('milestone on a thread-lane phase rides that phase end and the phase keeps its stored thread lane', () => {
    const r = resolveSchedule(
      [phase({ id: 'a', durationDays: 10, lane: 'thread', sortOrder: 1 })],
      [milestone({ id: 'm', phaseId: 'a', offsetDays: 2 })],
      opts({ projectStartDate: '2026-01-01', today: '2026-01-01' }),
    );
    expect(P(r, 'a')).toMatchObject({ lane: 'thread', start: '2026-01-01', end: '2026-01-11' });
    expect(M(r, 'm').date).toBe('2026-01-13');
  });

  it('past_anchor: a milestone landing strictly after a downstream anchored entry raises past_anchor', () => {
    const phases = [
      phase({ id: 'a', durationDays: 10, sortOrder: 1 }),
      phase({ id: 'b', durationDays: 5, followsPhaseId: 'a', anchorDate: '2026-01-20', sortOrder: 2 }),
    ];
    const r = resolveSchedule(
      phases,
      [milestone({ id: 'late', phaseId: 'a', offsetDays: 15 })], // 2026-01-11 + 15 = 2026-01-26 > 2026-01-20
      opts({ projectStartDate: '2026-01-01', today: '2026-01-01' }),
    );

    expect(M(r, 'late').date).toBe('2026-01-26');
    const pa = r.conflicts.find((c) => c.kind === 'past_anchor');
    expect(pa).toMatchObject({ kind: 'past_anchor', milestoneId: 'late', anchorId: 'b', overrunDays: 6 });
    // The chain itself fits (arrival 2026-01-11 ≤ anchor 2026-01-20) — no chain_does_not_fit.
    expect(r.conflicts.some((c) => c.kind === 'chain_does_not_fit')).toBe(false);
  });

  it('milestone of an unresolved phase (no anchor) has a null date and does not throw', () => {
    const r = resolveSchedule(
      [phase({ id: 'a', sortOrder: 1 })], // no duration, no anchor, no dates → unresolved
      [milestone({ id: 'm', phaseId: 'a', offsetDays: 3 })],
      opts({ today: '2026-01-01' }),
    );
    expect(P(r, 'a').source).toBe('unresolved');
    expect(M(r, 'm').date).toBeNull();
    expect(r.conflicts.some((c) => c.kind === 'unresolvable' && c.phaseId === 'a')).toBe(true);
  });

  it('is total: malformed dates and a self-link degrade to fallbacks without throwing', () => {
    const phases = [
      phase({ id: 'a', durationDays: 5, anchorDate: 'not-a-date', startDate: '2026-13-40', sortOrder: 1 }),
      phase({ id: 'self', durationDays: 5, followsPhaseId: 'self', sortOrder: 2 }),
    ];
    expect(() => resolveSchedule(phases, [], opts({ today: '2026-01-01' }))).not.toThrow();
    const r = resolveSchedule(phases, [], opts({ today: '2026-01-01' }));
    // Malformed anchor/startDate are ignored; nothing resolvable → unresolved.
    expect(P(r, 'a').source).toBe('unresolved');
    // Self-link is handled defensively as a cycle.
    expect(r.conflicts.some((c) => c.kind === 'chain_cycle')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// epochDayFromISO (Slice 02, packages/utils §4) — additive export reusing the
// resolver's own day math (`parseDate` internally). Pinned cases: round-trip
// vs the resolver's own formatDate (exercised indirectly via resolveSchedule,
// since formatDate itself is not exported — R100's "one date-math impl" means
// there is nothing else to compare against), rejects an impossible calendar
// date, and returns null for anything malformed.
// ─────────────────────────────────────────────────────────────────────────────

describe('epochDayFromISO', () => {
  it('round-trips through the resolver’s own day math: parse → resolve (0-offset legacy dates) → format lands back on the same ISO string', () => {
    const iso = '2026-03-15';
    const epoch = epochDayFromISO(iso);
    expect(epoch).not.toBeNull();

    // A legacy-dates phase with start === end exercises formatDate on exactly
    // the epoch epochDayFromISO produced, with no arithmetic in between.
    const r = resolveSchedule([phase({ id: 'a', startDate: iso, targetEndDate: iso })], [], opts({ today: iso }));
    expect(P(r, 'a').start).toBe(iso);
    expect(P(r, 'a').end).toBe(iso);
  });

  it('consecutive calendar days are exactly 1 epoch day apart (self-consistent day math, incl. a month boundary)', () => {
    expect(epochDayFromISO('2026-01-02')! - epochDayFromISO('2026-01-01')!).toBe(1);
    expect(epochDayFromISO('2026-03-01')! - epochDayFromISO('2026-02-28')!).toBe(1); // 2026 is not a leap year
  });

  it('rejects a calendrically impossible date (2026-02-30) — null, not a clamped/rolled-over date', () => {
    expect(epochDayFromISO('2026-02-30')).toBeNull();
  });

  it('null on malformed input: wrong separators, wrong-length parts, empty string, non-date text', () => {
    expect(epochDayFromISO('2026/01/01')).toBeNull();
    expect(epochDayFromISO('26-01-01')).toBeNull();
    expect(epochDayFromISO('')).toBeNull();
    expect(epochDayFromISO('not-a-date')).toBeNull();
  });

  it('null on null/undefined — never throws', () => {
    expect(epochDayFromISO(null)).toBeNull();
    expect(epochDayFromISO(undefined)).toBeNull();
  });
});
