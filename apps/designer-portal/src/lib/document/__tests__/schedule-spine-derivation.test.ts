import {
  phaseState,
  itemsForPhase,
  todayIndex,
  milestoneStamp,
  phaseMeta,
  phaseGhostLine,
  threadsFor,
  type SpinePhaseState,
} from '../schedule-spine-derivation';

// ═══════════════════════════════════════════════════════════════════════════
// phaseState
// ═══════════════════════════════════════════════════════════════════════════

describe('phaseState', () => {
  it('completed → closed', () => {
    expect(phaseState('completed')).toBe('closed');
  });

  it('in_progress → active', () => {
    expect(phaseState('in_progress')).toBe('active');
  });

  it('active → active', () => {
    expect(phaseState('active')).toBe('active');
  });

  it('pending → future', () => {
    expect(phaseState('pending')).toBe('future');
  });

  it('delayed → future', () => {
    expect(phaseState('delayed')).toBe('future');
  });

  it('an unrecognized status string never throws — defaults to future', () => {
    expect(phaseState('something-unexpected')).toBe('future');
  });

  it('null/undefined never throws — defaults to future', () => {
    expect(phaseState(null)).toBe('future');
    expect(phaseState(undefined)).toBe('future');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// itemsForPhase
// ═══════════════════════════════════════════════════════════════════════════

interface Item {
  id: string;
  phase_id?: string | null;
  status: string;
}

function mkI(partial: Partial<Item>): Item {
  return { id: 'i1', phase_id: 'phase-a', status: 'pending', ...partial };
}

describe('itemsForPhase', () => {
  const validPhaseIds = new Set(['phase-a', 'phase-b']);

  it('returns pending items whose phase_id matches the requested phase', () => {
    const items = [
      mkI({ id: 'a', phase_id: 'phase-a' }),
      mkI({ id: 'b', phase_id: 'phase-b' }),
    ];
    expect(itemsForPhase(items, 'phase-a', 'phase-a', validPhaseIds).map((i) => i.id)).toEqual(['a']);
  });

  it('drops non-open (non-pending) items', () => {
    const items = [
      mkI({ id: 'open', phase_id: 'phase-a', status: 'pending' }),
      mkI({ id: 'done', phase_id: 'phase-a', status: 'responded' }),
    ];
    expect(itemsForPhase(items, 'phase-a', 'phase-a', validPhaseIds).map((i) => i.id)).toEqual(['open']);
  });

  it('a null phase_id lands in the active phase (A0.2)', () => {
    const items = [mkI({ id: 'orphan', phase_id: null })];
    expect(itemsForPhase(items, 'phase-a', 'phase-a', validPhaseIds).map((i) => i.id)).toEqual(['orphan']);
    expect(itemsForPhase(items, 'phase-b', 'phase-a', validPhaseIds)).toEqual([]);
  });

  it('a dangling phase_id (not in validPhaseIds) lands in the active phase (A0.2)', () => {
    const items = [mkI({ id: 'dangling', phase_id: 'deleted-phase' })];
    expect(itemsForPhase(items, 'phase-a', 'phase-a', validPhaseIds).map((i) => i.id)).toEqual(['dangling']);
    expect(itemsForPhase(items, 'phase-b', 'phase-a', validPhaseIds)).toEqual([]);
  });

  it('when there is no active phase, orphaned/dangling items land nowhere', () => {
    const items = [mkI({ id: 'orphan', phase_id: null })];
    expect(itemsForPhase(items, 'phase-a', null, validPhaseIds)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// todayIndex
// ═══════════════════════════════════════════════════════════════════════════

describe('todayIndex', () => {
  const phases = [
    { id: 'p1', start: '2026-06-01' },
    { id: 'p2', start: '2026-06-15' },
    { id: 'p3', start: '2026-07-01' },
  ];

  it('today before all phases → index 0', () => {
    expect(todayIndex(phases, '2026-05-01', 0)).toBe(0);
  });

  it('today after all phases → after the last one', () => {
    expect(todayIndex(phases, '2026-12-01', 0)).toBe(3);
  });

  it('today lands mid-array → after the last phase whose start ≤ today', () => {
    expect(todayIndex(phases, '2026-06-20', 0)).toBe(2);
  });

  it('today exactly matches a phase start → after that phase (inclusive)', () => {
    expect(todayIndex(phases, '2026-06-15', 0)).toBe(2);
  });

  it('no dates at all → after the active phase', () => {
    const noDates = [{ id: 'p1', start: null }, { id: 'p2', start: null }, { id: 'p3', start: null }];
    expect(todayIndex(noDates, '2026-06-20', 1)).toBe(2);
  });

  it('no dates at all + no valid active phase index → fallback 0', () => {
    const noDates = [{ id: 'p1', start: null }];
    expect(todayIndex(noDates, '2026-06-20', -1)).toBe(0);
  });

  it('empty phase list never throws → 0', () => {
    expect(todayIndex([], '2026-06-20', -1)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// milestoneStamp
// ═══════════════════════════════════════════════════════════════════════════

describe('milestoneStamp', () => {
  const today = '2026-07-15';

  it('signed', () => {
    expect(milestoneStamp({ date: '2026-07-09', derivedStatus: 'signed' }, today)).toEqual({
      text: 'Signed · Jul 9',
      late: false,
    });
  });

  it('due, not yet late', () => {
    expect(milestoneStamp({ date: '2026-07-20', derivedStatus: 'due' }, today)).toEqual({
      text: 'Due Jul 20',
      late: false,
    });
  });

  it('due, today exactly — not late', () => {
    expect(milestoneStamp({ date: '2026-07-15', derivedStatus: 'due' }, today)).toEqual({
      text: 'Due Jul 15',
      late: false,
    });
  });

  it('due, in the past — late with days-over arithmetic', () => {
    expect(milestoneStamp({ date: '2026-07-10', derivedStatus: 'due' }, today)).toEqual({
      text: 'Due Jul 10 · 5 days over',
      late: true,
    });
  });

  it('upcoming', () => {
    expect(milestoneStamp({ date: '2026-08-01', derivedStatus: 'upcoming' }, today)).toEqual({
      text: 'Upcoming · Aug 1',
      late: false,
    });
  });

  it('slipped', () => {
    expect(milestoneStamp({ date: '2026-07-01', derivedStatus: 'slipped' }, today)).toEqual({
      text: 'Slipped · Jul 1',
      late: true,
    });
  });

  it('a null date never throws — degenerate dash', () => {
    expect(milestoneStamp({ date: null, derivedStatus: 'due' }, today)).toEqual({ text: '—', late: false });
    expect(milestoneStamp({ date: null, derivedStatus: 'signed' }, today)).toEqual({ text: '—', late: false });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// phaseMeta
// ═══════════════════════════════════════════════════════════════════════════

describe('phaseMeta', () => {
  const base = {
    state: 'closed' as SpinePhaseState,
    start: null as string | null,
    end: null as string | null,
    anchored: false,
    itemCount: 0,
    openCount: 0,
    blockingCount: 0,
    lastSigned: null as { name: string; date: string | null } | null,
    predecessorName: null as string | null,
    durationDays: null as number | null,
    milestoneCount: 0,
  };

  describe('closed', () => {
    it('full: closed date, item count, last signed', () => {
      expect(
        phaseMeta({
          ...base,
          state: 'closed',
          end: '2026-06-01',
          itemCount: 3,
          lastSigned: { name: 'Leah', date: '2026-05-30' },
        }).text,
      ).toBe('Closed Jun 1 · 3 items · Leah signed May 30');
    });

    it('omits item count when zero', () => {
      expect(phaseMeta({ ...base, state: 'closed', end: '2026-06-01', itemCount: 0 }).text).toBe('Closed Jun 1');
    });

    it('omits last-signed when absent', () => {
      expect(
        phaseMeta({ ...base, state: 'closed', end: '2026-06-01', itemCount: 2, lastSigned: null }).text,
      ).toBe('Closed Jun 1 · 2 items');
    });

    it('omits the closed-date segment when end is null', () => {
      expect(phaseMeta({ ...base, state: 'closed', end: null, itemCount: 1 }).text).toBe('1 item');
    });

    it('singularizes item count at exactly 1, pluralizes otherwise', () => {
      expect(phaseMeta({ ...base, state: 'closed', end: '2026-06-01', itemCount: 1 }).text).toBe(
        'Closed Jun 1 · 1 item',
      );
      expect(phaseMeta({ ...base, state: 'closed', end: '2026-06-01', itemCount: 2 }).text).toBe(
        'Closed Jun 1 · 2 items',
      );
    });

    it('a fully empty closed phase renders nothing', () => {
      expect(phaseMeta({ ...base, state: 'closed', end: null, itemCount: 0, lastSigned: null }).text).toBe('');
    });

    it('overrunText is computed independent of state — a real chain conflict at this phase is worth surfacing regardless of its status classification', () => {
      expect(
        phaseMeta({
          ...base,
          state: 'closed',
          end: '2026-06-01',
          overrun: { anchorDate: '2026-09-21', overrunDays: 6 },
        }).overrunText,
      ).toBe('Chain overruns Sep 21 by 6 days');
    });
  });

  describe('active', () => {
    it('full: date range, open count, blocking count', () => {
      expect(
        phaseMeta({
          ...base,
          state: 'active',
          start: '2026-07-09',
          end: '2026-07-23',
          openCount: 4,
          blockingCount: 2,
        }).text,
      ).toBe('Jul 9 – Jul 23 · 4 open · 2 blocking');
    });

    it('omits open/blocking counts when zero', () => {
      expect(
        phaseMeta({ ...base, state: 'active', start: '2026-07-09', end: '2026-07-23', openCount: 0, blockingCount: 0 })
          .text,
      ).toBe('Jul 9 – Jul 23');
    });

    it('omits the date-range segment when either date is null', () => {
      expect(phaseMeta({ ...base, state: 'active', start: null, end: '2026-07-23', openCount: 1 }).text).toBe(
        '1 open',
      );
      expect(phaseMeta({ ...base, state: 'active', start: '2026-07-09', end: null, openCount: 1 }).text).toBe(
        '1 open',
      );
    });
  });

  describe('future, anchored', () => {
    it('full: date range + the two constant segments', () => {
      expect(
        phaseMeta({ ...base, state: 'future', anchored: true, start: '2026-08-01', end: '2026-08-15' }).text,
      ).toBe('Aug 1 – Aug 15 · Anchored · Holds when upstream moves');
    });

    it('omits the date-range segment when dates are null but keeps the constants', () => {
      expect(phaseMeta({ ...base, state: 'future', anchored: true, start: null, end: null }).text).toBe(
        'Anchored · Holds when upstream moves',
      );
    });

    it('slackDays appends "N days slack" after the constants', () => {
      expect(
        phaseMeta({
          ...base,
          state: 'future',
          anchored: true,
          start: '2026-08-01',
          end: '2026-08-15',
          slackDays: 4,
        }).text,
      ).toBe('Aug 1 – Aug 15 · Anchored · Holds when upstream moves · 4 days slack');
    });

    it('slackDays of exactly 0 still renders (a tight fit is honest information)', () => {
      expect(
        phaseMeta({ ...base, state: 'future', anchored: true, start: null, end: null, slackDays: 0 }).text,
      ).toBe('Anchored · Holds when upstream moves · 0 days slack');
    });

    it('omits the slack segment when slackDays is null/undefined', () => {
      expect(
        phaseMeta({ ...base, state: 'future', anchored: true, start: null, end: null, slackDays: null }).text,
      ).toBe('Anchored · Holds when upstream moves');
      expect(phaseMeta({ ...base, state: 'future', anchored: true, start: null, end: null }).text).toBe(
        'Anchored · Holds when upstream moves',
      );
    });

    it('overrun produces a separate overrunText, plural days', () => {
      const result = phaseMeta({
        ...base,
        state: 'future',
        anchored: true,
        start: '2026-09-21',
        end: '2026-09-28',
        overrun: { anchorDate: '2026-09-21', overrunDays: 6 },
      });
      expect(result.text).toBe('Sep 21 – Sep 28 · Anchored · Holds when upstream moves');
      expect(result.overrunText).toBe('Chain overruns Sep 21 by 6 days');
    });

    it('overrun singularizes at exactly 1 day', () => {
      expect(
        phaseMeta({
          ...base,
          state: 'future',
          anchored: true,
          overrun: { anchorDate: '2026-09-21', overrunDays: 1 },
        }).overrunText,
      ).toBe('Chain overruns Sep 21 by 1 day');
    });

    it('overrunText is null when overrun is absent/null', () => {
      expect(
        phaseMeta({ ...base, state: 'future', anchored: true, start: '2026-08-01', end: '2026-08-15' })
          .overrunText,
      ).toBeNull();
      expect(
        phaseMeta({ ...base, state: 'future', anchored: true, start: null, end: null, overrun: null }).overrunText,
      ).toBeNull();
    });
  });

  describe('future, unanchored', () => {
    it('full: predecessor, weeks duration, milestone count', () => {
      expect(
        phaseMeta({
          ...base,
          state: 'future',
          anchored: false,
          predecessorName: 'Framing',
          durationDays: 14,
          milestoneCount: 2,
        }).text,
      ).toBe('Follows Framing · 2w · 2 milestones');
    });

    it('non-multiple-of-7 duration renders as days', () => {
      expect(
        phaseMeta({ ...base, state: 'future', anchored: false, predecessorName: 'Framing', durationDays: 10, milestoneCount: 0 })
          .text,
      ).toBe('Follows Framing · 10d');
    });

    it('omits predecessor when unknown', () => {
      expect(
        phaseMeta({ ...base, state: 'future', anchored: false, predecessorName: null, durationDays: 7, milestoneCount: 1 })
          .text,
      ).toBe('1w · 1 milestone');
    });

    it('singularizes milestone count at exactly 1, pluralizes otherwise', () => {
      expect(
        phaseMeta({ ...base, state: 'future', anchored: false, predecessorName: 'Framing', durationDays: 7, milestoneCount: 1 })
          .text,
      ).toBe('Follows Framing · 1w · 1 milestone');
      expect(
        phaseMeta({ ...base, state: 'future', anchored: false, predecessorName: 'Framing', durationDays: 7, milestoneCount: 2 })
          .text,
      ).toBe('Follows Framing · 1w · 2 milestones');
    });

    it('omits duration when null or zero', () => {
      expect(
        phaseMeta({ ...base, state: 'future', anchored: false, predecessorName: 'Framing', durationDays: null, milestoneCount: 0 })
          .text,
      ).toBe('Follows Framing');
      expect(
        phaseMeta({ ...base, state: 'future', anchored: false, predecessorName: 'Framing', durationDays: 0, milestoneCount: 0 })
          .text,
      ).toBe('Follows Framing');
    });

    it('omits milestone count when zero', () => {
      expect(
        phaseMeta({ ...base, state: 'future', anchored: false, predecessorName: 'Framing', durationDays: 7, milestoneCount: 0 })
          .text,
      ).toBe('Follows Framing · 1w');
    });

    it('a fully empty unanchored future phase renders nothing', () => {
      expect(
        phaseMeta({ ...base, state: 'future', anchored: false, predecessorName: null, durationDays: null, milestoneCount: 0 })
          .text,
      ).toBe('');
    });

    it('slackDays is ignored on the unanchored branch (no segment) — slack is anchored-only', () => {
      expect(
        phaseMeta({
          ...base,
          state: 'future',
          anchored: false,
          predecessorName: 'Framing',
          durationDays: 7,
          milestoneCount: 0,
          slackDays: 3,
        }).text,
      ).toBe('Follows Framing · 1w');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// threadsFor
// ═══════════════════════════════════════════════════════════════════════════

interface P {
  id: string;
  start: string | null;
  end: string | null;
  lane: 'main' | 'thread';
}

describe('threadsFor', () => {
  it('hosts a thread on the main phase whose range contains its start', () => {
    const resolved: P[] = [
      { id: 'main-1', start: '2026-06-01', end: '2026-06-30', lane: 'main' },
      { id: 'main-2', start: '2026-07-01', end: '2026-07-31', lane: 'main' },
      { id: 'thread-1', start: '2026-06-10', end: '2026-06-20', lane: 'thread' },
    ];
    const hosted = threadsFor(resolved, null);
    expect(hosted.get('main-1')).toEqual(['thread-1']);
    expect(hosted.has('main-2')).toBe(false);
  });

  it('prefers the ACTIVE main phase when several qualify', () => {
    const resolved: P[] = [
      { id: 'main-1', start: '2026-06-01', end: '2026-06-30', lane: 'main' },
      { id: 'main-2', start: '2026-06-05', end: '2026-06-25', lane: 'main' }, // overlaps main-1's window too
      { id: 'thread-1', start: '2026-06-10', end: '2026-06-15', lane: 'thread' },
    ];
    const hosted = threadsFor(resolved, 'main-2');
    expect(hosted.get('main-2')).toEqual(['thread-1']);
    expect(hosted.has('main-1')).toBe(false);
  });

  it('falls back to the last main phase with start ≤ thread start when none contains it', () => {
    const resolved: P[] = [
      { id: 'main-1', start: '2026-06-01', end: '2026-06-10', lane: 'main' },
      { id: 'main-2', start: '2026-06-15', end: '2026-06-25', lane: 'main' },
      { id: 'thread-1', start: '2026-06-12', end: '2026-06-13', lane: 'thread' }, // in the gap
    ];
    const hosted = threadsFor(resolved, null);
    expect(hosted.get('main-1')).toEqual(['thread-1']);
  });

  it('falls back to the first main phase when the thread starts before everything', () => {
    const resolved: P[] = [
      { id: 'main-1', start: '2026-06-15', end: '2026-06-25', lane: 'main' },
      { id: 'main-2', start: '2026-07-01', end: '2026-07-10', lane: 'main' },
      { id: 'thread-1', start: '2026-05-01', end: '2026-05-05', lane: 'thread' },
    ];
    const hosted = threadsFor(resolved, null);
    expect(hosted.get('main-1')).toEqual(['thread-1']);
  });

  it('threads land in start order within their host', () => {
    const resolved: P[] = [
      { id: 'main-1', start: '2026-06-01', end: '2026-06-30', lane: 'main' },
      { id: 'thread-2', start: '2026-06-20', end: '2026-06-22', lane: 'thread' },
      { id: 'thread-1', start: '2026-06-05', end: '2026-06-06', lane: 'thread' },
    ];
    const hosted = threadsFor(resolved, null);
    expect(hosted.get('main-1')).toEqual(['thread-1', 'thread-2']);
  });

  it('null dates never throw — a thread with no start falls back to the first main phase', () => {
    const resolved: P[] = [
      { id: 'main-1', start: '2026-06-01', end: '2026-06-30', lane: 'main' },
      { id: 'thread-1', start: null, end: null, lane: 'thread' },
    ];
    expect(() => threadsFor(resolved, null)).not.toThrow();
    expect(threadsFor(resolved, null).get('main-1')).toEqual(['thread-1']);
  });

  it('no main phases at all never throws — returns an empty map', () => {
    const resolved: P[] = [{ id: 'thread-1', start: '2026-06-10', end: '2026-06-11', lane: 'thread' }];
    expect(() => threadsFor(resolved, null)).not.toThrow();
    expect(threadsFor(resolved, null).size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// phaseGhostLine
// ═══════════════════════════════════════════════════════════════════════════

describe('phaseGhostLine', () => {
  it('renders the pending range with an arrow lead when the phase moved', () => {
    expect(
      phaseGhostLine(
        { start: '2026-06-01', end: '2026-06-30' },
        { start: '2026-06-26', end: '2026-07-29' },
      ),
    ).toBe('→ Jun 26 – Jul 29');
  });

  it('null when the phase is unmoved (from equals to)', () => {
    expect(
      phaseGhostLine(
        { start: '2026-06-01', end: '2026-06-30' },
        { start: '2026-06-01', end: '2026-06-30' },
      ),
    ).toBeNull();
  });

  it('null when the pending range has no dates at all', () => {
    expect(
      phaseGhostLine({ start: '2026-06-01', end: '2026-06-30' }, { start: null, end: null }),
    ).toBeNull();
  });

  it('a single null endpoint renders as an em-dash', () => {
    expect(
      phaseGhostLine({ start: null, end: '2026-06-30' }, { start: '2026-06-26', end: null }),
    ).toBe('→ Jun 26 – —');
  });

  it('detects a move even when only the end shifts', () => {
    expect(
      phaseGhostLine(
        { start: '2026-06-01', end: '2026-06-30' },
        { start: '2026-06-01', end: '2026-07-10' },
      ),
    ).toBe('→ Jun 1 – Jul 10');
  });
});
