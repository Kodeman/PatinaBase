/**
 * R107/R108/R111 contract — the fidelity ladder, the one selector, and the
 * Week-N gate.
 *
 * The headline assertion of this suite: a legacy-dates project must never say
 * "Week N". That is the T1 kill R108 exists for, and it is pinned structurally
 * — `positionText` cannot emit a week without a `governingAnchorId`.
 */

import {
  resolveSchedule,
  type PhaseStatus,
  type ResolvedPhase,
  type ResolvedSchedule,
  type SchedulePhaseInput,
} from './schedule';
import {
  phaseFidelity,
  positionText,
  selectActivePhase,
  targetEnd,
  type Fidelity,
} from './schedule-fidelity';

function phase(over: Partial<SchedulePhaseInput> & { id: string }): SchedulePhaseInput {
  return {
    id: over.id,
    name: over.name ?? over.id,
    durationDays: over.durationDays ?? null,
    durationWeeks: over.durationWeeks ?? null,
    followsPhaseId: over.followsPhaseId ?? null,
    anchorDate: over.anchorDate ?? null,
    lane: over.lane ?? 'main',
    startDate: over.startDate ?? null,
    targetEndDate: over.targetEndDate ?? null,
    sortOrder: over.sortOrder ?? 0,
    status: over.status ?? 'pending',
  };
}

function resolved(over: Partial<ResolvedPhase> & { id: string }): ResolvedPhase {
  return {
    id: over.id,
    start: over.start ?? null,
    end: over.end ?? null,
    lane: over.lane ?? 'main',
    anchored: over.anchored ?? false,
    source: over.source ?? 'chain',
    slackDays: over.slackDays ?? null,
    governingAnchorId: over.governingAnchorId ?? null,
    origin: over.origin ?? 'none',
  };
}

function schedule(phases: ResolvedPhase[]): ResolvedSchedule {
  return { phases, milestones: [], conflicts: [], slackDays: null };
}

const statuses = (entries: Array<[string, PhaseStatus]> = []) => new Map<string, PhaseStatus>(entries);

// ─────────────────────────────────────────────────────────────────────────────
// R107 — the fidelity table, one row per mapping rule.
// ─────────────────────────────────────────────────────────────────────────────

describe('phaseFidelity — R107 ladder', () => {
  const cases: Array<[string, ResolvedPhase, PhaseStatus, Fidelity]> = [
    [
      'completed anchor is a record',
      resolved({ id: 'p', source: 'anchor', anchored: true, governingAnchorId: 'p', origin: 'anchor' }),
      'completed',
      'record',
    ],
    [
      'completed legacy phase is still a record',
      resolved({ id: 'p', source: 'legacy-dates', origin: 'legacy' }),
      'completed',
      'record',
    ],
    [
      'source anchor is committed',
      resolved({ id: 'p', source: 'anchor', anchored: true, governingAnchorId: 'p', origin: 'anchor' }),
      'in_progress',
      'committed',
    ],
    [
      'chain rooted at an anchor is committed',
      resolved({ id: 'p', source: 'chain', governingAnchorId: 'a', origin: 'anchor' }),
      'pending',
      'committed',
    ],
    [
      'chain rooted at the project start is a frame',
      resolved({ id: 'p', source: 'chain', origin: 'project-start' }),
      'pending',
      'frame',
    ],
    [
      'legacy stored dates are a band',
      resolved({ id: 'p', source: 'legacy-dates', origin: 'legacy' }),
      'pending',
      'band',
    ],
    [
      'unresolved is a band',
      resolved({ id: 'p', source: 'unresolved', origin: 'none' }),
      'pending',
      'band',
    ],
  ];

  it.each(cases)('%s', (_name, p, status, expected) => {
    expect(phaseFidelity(p, status)).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R111 — the selection matrix.
// ─────────────────────────────────────────────────────────────────────────────

describe('selectActivePhase — R111', () => {
  it('picks the phase whose window contains today', () => {
    const s = schedule([
      resolved({ id: 'a', start: '2026-01-01', end: '2026-01-10' }),
      resolved({ id: 'b', start: '2026-01-10', end: '2026-02-01' }),
    ]);
    expect(selectActivePhase(s, statuses(), '2026-01-20')).toEqual({
      activePhaseId: 'b',
      reason: 'today-in-window',
    });
  });

  it('excludes completed phases from the window match', () => {
    const s = schedule([
      resolved({ id: 'a', start: '2026-01-01', end: '2026-02-01' }),
      resolved({ id: 'b', start: '2026-01-15', end: '2026-02-01', lane: 'thread' }),
    ]);
    expect(selectActivePhase(s, statuses([['a', 'completed']]), '2026-01-20')).toEqual({
      activePhaseId: 'b',
      reason: 'today-in-window',
    });
  });

  it('breaks a window tie on the main lane before a thread', () => {
    const s = schedule([
      resolved({ id: 'thread', start: '2026-01-01', end: '2026-02-01', lane: 'thread' }),
      resolved({ id: 'main', start: '2026-01-02', end: '2026-02-01', lane: 'main' }),
    ]);
    expect(selectActivePhase(s, statuses(), '2026-01-20').activePhaseId).toBe('main');
  });

  it('breaks a same-lane tie on the resolver’s own output order', () => {
    const s = schedule([
      resolved({ id: 'first', start: '2026-01-01', end: '2026-02-01' }),
      resolved({ id: 'second', start: '2026-01-02', end: '2026-02-01' }),
    ]);
    expect(selectActivePhase(s, statuses(), '2026-01-20').activePhaseId).toBe('first');
  });

  it('falls back to the single in_progress phase when no window contains today', () => {
    const s = schedule([
      resolved({ id: 'a', start: '2026-01-01', end: '2026-01-10' }),
      resolved({ id: 'b', start: null, end: null, source: 'unresolved', origin: 'none' }),
    ]);
    expect(selectActivePhase(s, statuses([['b', 'in_progress']]), '2026-03-01')).toEqual({
      activePhaseId: 'b',
      reason: 'status-in-progress',
    });
  });

  it('treats a delayed phase as the running phase', () => {
    const s = schedule([resolved({ id: 'b', start: null, end: null, source: 'unresolved', origin: 'none' })]);
    expect(selectActivePhase(s, statuses([['b', 'delayed']]), '2026-03-01').reason).toBe('status-in-progress');
  });

  it('refuses the status fallback when two phases are running', () => {
    const s = schedule([
      resolved({ id: 'a', start: null, end: null, source: 'unresolved', origin: 'none' }),
      resolved({ id: 'b', start: null, end: null, source: 'unresolved', origin: 'none' }),
    ]);
    expect(selectActivePhase(s, statuses([['a', 'in_progress'], ['b', 'delayed']]), '2026-03-01')).toEqual({
      activePhaseId: null,
      reason: 'none',
    });
  });

  it('falls back to the earliest phase starting after today', () => {
    const s = schedule([
      resolved({ id: 'a', start: '2026-01-01', end: '2026-01-10' }),
      resolved({ id: 'b', start: '2026-04-01', end: '2026-05-01' }),
      resolved({ id: 'c', start: '2026-06-01', end: '2026-07-01' }),
    ]);
    expect(selectActivePhase(s, statuses(), '2026-03-01')).toEqual({
      activePhaseId: 'b',
      reason: 'next-upcoming',
    });
  });

  it('selects nothing when a schedule is empty or wholly complete', () => {
    expect(selectActivePhase(schedule([]), statuses(), '2026-03-01')).toEqual({
      activePhaseId: null,
      reason: 'none',
    });
    const s = schedule([resolved({ id: 'a', start: '2026-01-01', end: '2026-12-01' })]);
    expect(selectActivePhase(s, statuses([['a', 'completed']]), '2026-03-01')).toEqual({
      activePhaseId: null,
      reason: 'none',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R108 — the Week-N gate.
// ─────────────────────────────────────────────────────────────────────────────

describe('positionText — R108 Week-N gate', () => {
  it('HEADLINE: a legacy-dates project never says Week N — it says Band', () => {
    // The exact shape the old WEEK_MS arithmetic lied about: stored dates, no
    // chain, no anchor, a project that started fourteen weeks ago.
    const r = resolveSchedule(
      [
        phase({ id: 'p1', startDate: '2026-01-05', targetEndDate: '2026-03-01', sortOrder: 1 }),
        phase({ id: 'p2', startDate: '2026-03-01', targetEndDate: '2026-06-01', sortOrder: 2 }),
      ],
      [],
      { projectStartDate: null, today: '2026-04-10' },
    );
    const selection = selectActivePhase(r, statuses(), '2026-04-10');

    expect(selection.activePhaseId).toBe('p2');
    expect(positionText(r, selection, '2026-04-10')).toBe('Band');
    expect(positionText(r, selection, '2026-04-10')).not.toMatch(/Week/);
  });

  it('a project-start-rooted chain says Frame, never a week', () => {
    const r = resolveSchedule(
      [
        phase({ id: 'a', durationDays: 30, sortOrder: 1 }),
        phase({ id: 'b', durationDays: 30, followsPhaseId: 'a', sortOrder: 2 }),
      ],
      [],
      { projectStartDate: '2026-01-01', today: '2026-02-10' },
    );
    const selection = selectActivePhase(r, statuses(), '2026-02-10');

    expect(selection.activePhaseId).toBe('b');
    expect(positionText(r, selection, '2026-02-10')).toBe('Frame');
  });

  it('counts the week from the governing anchor’s pinned start', () => {
    const r = resolveSchedule(
      [
        phase({ id: 'a', durationDays: 60, anchorDate: '2026-01-01', sortOrder: 1 }),
      ],
      [],
      { projectStartDate: null, today: '2026-01-15' },
    );
    const selection = selectActivePhase(r, statuses(), '2026-01-15');

    // 14 days after the pin ⇒ floor(14/7)+1 = week 3.
    expect(positionText(r, selection, '2026-01-15')).toBe('Week 3');
  });

  it('a downstream chain phase counts weeks from the anchor it traces to', () => {
    const r = resolveSchedule(
      [
        phase({ id: 'a', durationDays: 10, anchorDate: '2026-01-01', sortOrder: 1 }),
        phase({ id: 'b', durationDays: 30, followsPhaseId: 'a', sortOrder: 2 }),
      ],
      [],
      { projectStartDate: null, today: '2026-01-20' },
    );
    const selection = selectActivePhase(r, statuses(), '2026-01-20');

    expect(selection.activePhaseId).toBe('b');
    // 19 days after 'a''s pin ⇒ week 3, not week 2 counted from b's own start.
    expect(positionText(r, selection, '2026-01-20')).toBe('Week 3');
  });

  it('refuses a week for an anchored run that has not begun', () => {
    const r = resolveSchedule(
      [phase({ id: 'a', durationDays: 10, anchorDate: '2026-06-01', sortOrder: 1 })],
      [],
      { projectStartDate: null, today: '2026-01-01' },
    );
    const selection = selectActivePhase(r, statuses(), '2026-01-01');

    expect(selection.reason).toBe('next-upcoming');
    expect(positionText(r, selection, '2026-01-01')).toBe('Committed');
  });

  it('returns null when nothing is selected', () => {
    expect(positionText(schedule([]), { activePhaseId: null, reason: 'none' }, '2026-01-01')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// targetEnd
// ─────────────────────────────────────────────────────────────────────────────

describe('targetEnd', () => {
  it('reports the latest end with that phase’s register', () => {
    const r = resolveSchedule(
      [
        phase({ id: 'a', durationDays: 10, sortOrder: 1 }),
        phase({ id: 'b', durationDays: 20, followsPhaseId: 'a', sortOrder: 2 }),
      ],
      [],
      { projectStartDate: '2026-01-01', today: '2026-01-01' },
    );
    expect(targetEnd(r)).toEqual({ date: '2026-01-31', fidelity: 'frame' });
  });

  it('reports committed when the last phase traces to an anchor', () => {
    const r = resolveSchedule(
      [
        phase({ id: 'a', durationDays: 10, sortOrder: 1 }),
        phase({ id: 'b', durationDays: 20, followsPhaseId: 'a', anchorDate: '2026-03-01', sortOrder: 2 }),
      ],
      [],
      { projectStartDate: '2026-01-01', today: '2026-01-01' },
    );
    expect(targetEnd(r)).toEqual({ date: '2026-03-21', fidelity: 'committed' });
  });

  it('reports band for a legacy-dates schedule', () => {
    const r = resolveSchedule(
      [phase({ id: 'a', startDate: '2026-01-05', targetEndDate: '2026-06-01', sortOrder: 1 })],
      [],
      { projectStartDate: null, today: '2026-01-01' },
    );
    expect(targetEnd(r)).toEqual({ date: '2026-06-01', fidelity: 'band' });
  });

  it('has no target and stays in band when nothing is placed', () => {
    const r = resolveSchedule([phase({ id: 'a', sortOrder: 1 })], [], {
      projectStartDate: null,
      today: '2026-01-01',
    });
    expect(targetEnd(r)).toEqual({ date: null, fidelity: 'band' });
  });
});
