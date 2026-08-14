import {
  computeThreadPlacement,
  deriveThreadAnchors,
  threadConsequence,
  type ThreadMilestone,
  type ThreadPhase,
  type ThreadResolvedSchedule,
} from '../schedule-thread';

// ─────────────────────────────────────────────────────────────────────────────
// Factories — every field defaulted so a case declares only what it exercises.
// ─────────────────────────────────────────────────────────────────────────────

function tphase(over: Partial<ThreadPhase> & { id: string; name: string }): ThreadPhase {
  return {
    id: over.id,
    name: over.name,
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

function tmilestone(over: Partial<ThreadMilestone> & { id: string; phaseId: string; name: string }): ThreadMilestone {
  return {
    id: over.id,
    phaseId: over.phaseId,
    name: over.name,
    date: over.date ?? null,
    anchored: over.anchored ?? false,
    derivedStatus: over.derivedStatus ?? 'upcoming',
  };
}

function schedule(phases: ThreadPhase[], milestones: ThreadMilestone[] = []): ThreadResolvedSchedule {
  return { phases, milestones };
}

// ═══════════════════════════════════════════════════════════════════════════
// deriveThreadAnchors
// ═══════════════════════════════════════════════════════════════════════════

describe('deriveThreadAnchors', () => {
  it('always includes Today', () => {
    const anchors = deriveThreadAnchors(schedule([]), null, '2026-08-14');
    expect(anchors).toEqual([{ key: 'today', label: 'Today', date: '2026-08-14' }]);
  });

  it('names a main-lane phase begins/ends off its own name', () => {
    const anchors = deriveThreadAnchors(
      schedule([
        tphase({ id: 'p1', name: 'Schematic Design', start: '2026-08-20', end: '2026-08-28' }),
      ]),
      null,
      '2026-08-14',
    );
    expect(anchors).toContainEqual({ key: 'phase-start-p1', label: 'Schematic Design begins', date: '2026-08-20' });
    expect(anchors).toContainEqual({ key: 'phase-end-p1', label: 'Schematic Design ends', date: '2026-08-28' });
  });

  it('excludes thread-lane phases entirely — they have no place of their own on the spine', () => {
    const anchors = deriveThreadAnchors(
      schedule([
        tphase({ id: 'p1', name: 'Sourcing', start: '2026-08-20', end: '2026-08-28', lane: 'thread' }),
      ]),
      null,
      '2026-08-14',
    );
    expect(anchors).toEqual([{ key: 'today', label: 'Today', date: '2026-08-14' }]);
  });

  it('includes every resolved milestone by its own name', () => {
    const anchors = deriveThreadAnchors(
      schedule([], [tmilestone({ id: 'm1', phaseId: 'p1', name: 'Client sign-off', date: '2026-09-02' })]),
      null,
      '2026-08-14',
    );
    expect(anchors).toContainEqual({ key: 'milestone-m1', label: 'Client sign-off', date: '2026-09-02' });
  });

  it('includes the install window start when one is held or confirmed', () => {
    const anchors = deriveThreadAnchors(schedule([]), { starts_on: '2026-10-26' }, '2026-08-14');
    expect(anchors).toContainEqual({ key: 'install-start', label: 'Install begins', date: '2026-10-26' });
  });

  it('omits the install anchor entirely when there is no live window', () => {
    const anchors = deriveThreadAnchors(schedule([]), null, '2026-08-14');
    expect(anchors.some((a) => a.key === 'install-start')).toBe(false);
  });

  it('filters null-dated phase boundaries and milestones rather than surfacing broken chips', () => {
    const anchors = deriveThreadAnchors(
      schedule(
        [
          // Started but not yet ended (still in progress) — start-only.
          tphase({ id: 'p1', name: 'Procurement', start: '2026-08-20', end: null }),
          // Neither date resolved yet — contributes nothing.
          tphase({ id: 'p2', name: 'Install prep', start: null, end: null }),
        ],
        [tmilestone({ id: 'm1', phaseId: 'p1', name: 'Undated milestone', date: null })],
      ),
      null,
      '2026-08-14',
    );
    expect(anchors).toEqual([
      { key: 'today', label: 'Today', date: '2026-08-14' },
      { key: 'phase-start-p1', label: 'Procurement begins', date: '2026-08-20' },
    ]);
  });

  it('sorts chronologically regardless of input order, ties keeping insertion order', () => {
    const anchors = deriveThreadAnchors(
      schedule(
        [tphase({ id: 'p1', name: 'Install', start: '2026-10-26', end: '2026-11-10' })],
        [tmilestone({ id: 'm1', phaseId: 'p1', name: 'Final walkthrough', date: '2026-09-02' })],
      ),
      { starts_on: '2026-10-26' },
      '2026-08-14',
    );
    expect(anchors.map((a) => a.date)).toEqual(['2026-08-14', '2026-09-02', '2026-10-26', '2026-10-26', '2026-11-10']);
    // The install window shares Oct 26 with the phase's own start — the
    // phase (declared first, in resolved.phases order) keeps its place ahead
    // of the install anchor (declared last), a stable-sort tie.
    expect(anchors[2]).toEqual({ key: 'phase-start-p1', label: 'Install begins', date: '2026-10-26' });
    expect(anchors[3]).toEqual({ key: 'install-start', label: 'Install begins', date: '2026-10-26' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// computeThreadPlacement
// ═══════════════════════════════════════════════════════════════════════════

describe('computeThreadPlacement', () => {
  it('by=0 on a workday anchor starts the same day; lasts=1 finishes the same day', () => {
    // 2026-08-17 is a Monday (calendar.test.ts's own pinned example).
    expect(computeThreadPlacement('2026-08-17', 0, 1)).toEqual({
      startsOn: '2026-08-17',
      dueDate: '2026-08-17',
    });
  });

  it('by=0 on a weekend anchor rolls forward to the next workday', () => {
    // 2026-08-15 is a Saturday.
    expect(computeThreadPlacement('2026-08-15', 0, 1)).toEqual({
      startsOn: '2026-08-17',
      dueDate: '2026-08-17',
    });
  });

  it('steps across a weekend for both `by` and `lasts` (hand-computed 2026 dates)', () => {
    // Fri Oct 9 2026 + 2 workdays = Tue Oct 13 (Sat 10/Sun 11 skipped, lands
    // Mon 12 then Tue 13). Lasting 4 workdays from Tue 13 = Wed 14, Thu 15,
    // Fri 16 — due Fri Oct 16.
    expect(computeThreadPlacement('2026-10-09', 2, 4)).toEqual({
      startsOn: '2026-10-13',
      dueDate: '2026-10-16',
    });
  });

  it('floors lasts at 1 and by at 0 rather than producing a reversed or negative window', () => {
    expect(computeThreadPlacement('2026-08-17', -3, -5)).toEqual({
      startsOn: '2026-08-17',
      dueDate: '2026-08-17',
    });
  });

  it('is total: a malformed anchor date returns null, not a half-built placement', () => {
    expect(computeThreadPlacement('not-a-date', 2, 4)).toBeNull();
    expect(computeThreadPlacement('2026-02-30', 0, 1)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// threadConsequence
// ═══════════════════════════════════════════════════════════════════════════

describe('threadConsequence', () => {
  const placement = { startsOn: '2026-10-13', dueDate: '2026-10-16' }; // Tue → Fri

  it('is empty for a null placement', () => {
    expect(threadConsequence(null, '2026-10-26', '2026-08-14')).toBe('');
  });

  it('states the plain start/finish sentence, with no clause when there is no install window', () => {
    // No install window held or confirmed at all — nothing to disclose, so
    // the sentence stops after finish. (Ruled 2026: the earlier contract
    // appended "· after install begins" here too, which read as a warning
    // about an install date that doesn't exist.)
    expect(threadConsequence(placement, null, '2026-08-14')).toBe('Starts Tue, Oct 13 · finishes Fri, Oct 16');
  });

  it('appends no clause when installStart fails to parse either', () => {
    expect(threadConsequence(placement, 'not-a-date', '2026-08-14')).toBe(
      'Starts Tue, Oct 13 · finishes Fri, Oct 16',
    );
  });

  it('counts full workdays strictly between dueDate and installStart, excluding both endpoints', () => {
    // dueDate Fri Oct 16 → installStart Mon Oct 26: Sat17,Sun18,Mon19,Tue20,
    // Wed21,Thu22,Fri23,Sat24,Sun25 strictly between — 5 workdays (19–23).
    expect(threadConsequence(placement, '2026-10-26', '2026-08-14')).toBe(
      'Starts Tue, Oct 13 · finishes Fri, Oct 16 · leaves 5 working days before install',
    );
  });

  it('singularizes "day" at N=1', () => {
    // Strictly between Oct 16 and Oct 20: Sat17, Sun18, Mon19 — one workday.
    expect(threadConsequence(placement, '2026-10-20', '2026-08-14')).toBe(
      'Starts Tue, Oct 13 · finishes Fri, Oct 16 · leaves 1 working day before install',
    );
  });

  it('reads N=0 for a dueDate immediately (across a weekend) before installStart — never N=1', () => {
    // Strictly between Oct 16 (Fri) and Oct 19 (Mon) is only the weekend.
    expect(threadConsequence(placement, '2026-10-19', '2026-08-14')).toBe(
      'Starts Tue, Oct 13 · finishes Fri, Oct 16 · leaves 0 working days before install',
    );
  });

  it('warns "after install begins" when installStart lands on or before dueDate', () => {
    expect(threadConsequence(placement, '2026-10-16', '2026-08-14')).toBe(
      'Starts Tue, Oct 13 · finishes Fri, Oct 16 · after install begins',
    );
    expect(threadConsequence(placement, '2026-10-01', '2026-08-14')).toBe(
      'Starts Tue, Oct 13 · finishes Fri, Oct 16 · after install begins',
    );
  });

  it('does not read `today` — the sentence never changes with it', () => {
    const a = threadConsequence(placement, '2026-10-26', '2026-01-01');
    const b = threadConsequence(placement, '2026-10-26', '2026-12-31');
    expect(a).toBe(b);
  });
});
