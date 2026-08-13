/**
 * R108 — the desk's schedule feed. One batched read of every desk project's
 * phases and milestones in, one entry per project out. `resolveSchedule` runs
 * once per project id, never once per folder render (risk R1).
 */

import {
  buildDeskProposalSignals,
  buildDeskSchedule,
  chainConflictText,
  DESK_SCHEDULE_UNCONFIGURED,
  type DeskMilestoneRow,
  type DeskPhaseRow,
  type DeskProposalRow,
} from '../desk-schedule';

const TODAY = '2026-06-12';

function phaseRow(over: Partial<DeskPhaseRow> & { id: string; project_id: string }): DeskPhaseRow {
  return {
    name: over.name ?? over.id,
    phase_key: over.phase_key ?? null,
    status: over.status ?? 'pending',
    sort_order: over.sort_order ?? 0,
    lane: over.lane ?? 'main',
    duration_days: over.duration_days ?? null,
    duration_weeks: over.duration_weeks ?? null,
    follows_phase_id: over.follows_phase_id ?? null,
    anchor_date: over.anchor_date ?? null,
    start_date: over.start_date ?? null,
    target_end_date: over.target_end_date ?? null,
    ...over,
  };
}

function milestoneRow(
  over: Partial<DeskMilestoneRow> & { id: string; phase_id: string },
): DeskMilestoneRow {
  return {
    name: over.name ?? over.id,
    kind: over.kind ?? 'event',
    offset_days: over.offset_days ?? null,
    anchor_date: over.anchor_date ?? null,
    status: over.status ?? 'upcoming',
    sort_order: over.sort_order ?? 0,
    ...over,
  };
}

describe('buildDeskSchedule', () => {
  it('groups by project and resolves each independently', () => {
    const map = buildDeskSchedule(
      [
        phaseRow({
          id: 'a1',
          project_id: 'proj-a',
          name: 'Design Development',
          duration_days: 60,
          anchor_date: '2026-06-01',
          status: 'in_progress',
        }),
        phaseRow({
          id: 'b1',
          project_id: 'proj-b',
          name: 'Discovery',
          start_date: '2026-01-05',
          target_end_date: '2026-12-01',
        }),
      ],
      [],
      TODAY,
    );

    expect([...map.keys()].sort()).toEqual(['proj-a', 'proj-b']);
    expect(map.get('proj-a')).toMatchObject({
      fidelity: 'committed',
      positionText: 'Week 2',
      activePhaseName: 'Design Development',
    });
    // A legacy-dates project is a band and never says a week.
    expect(map.get('proj-b')).toMatchObject({
      fidelity: 'band',
      positionText: 'Band',
      activePhaseName: 'Discovery',
    });
  });

  it('routes milestones to their project through the phase, not a project_id column', () => {
    const map = buildDeskSchedule(
      [
        phaseRow({ id: 'a1', project_id: 'proj-a', duration_days: 30, anchor_date: '2026-06-01' }),
        phaseRow({ id: 'b1', project_id: 'proj-b', duration_days: 30, anchor_date: '2026-06-01' }),
      ],
      [
        milestoneRow({ id: 'm1', phase_id: 'a1' }),
        milestoneRow({ id: 'm-orphan', phase_id: 'not-a-phase' }),
      ],
      TODAY,
    );

    // The orphan milestone belongs to no project and simply never lands.
    expect(map.size).toBe(2);
    expect(map.get('proj-a')?.selection.activePhaseId).toBe('a1');
  });

  it('flags an install phase that no anchor governs', () => {
    const map = buildDeskSchedule(
      [
        phaseRow({ id: 'p1', project_id: 'proj-a', duration_days: 30, start_date: '2026-05-01' }),
        phaseRow({
          id: 'p2',
          project_id: 'proj-a',
          phase_key: 'installation',
          follows_phase_id: 'p1',
          duration_days: 7,
        }),
      ],
      [],
      TODAY,
    );

    expect(map.get('proj-a')?.unconfigured).toBe('install-unanchored');
  });

  it('leaves an anchored install alone', () => {
    const map = buildDeskSchedule(
      [
        phaseRow({
          id: 'p2',
          project_id: 'proj-a',
          phase_key: 'installation',
          anchor_date: '2026-09-01',
          duration_days: 7,
        }),
      ],
      [],
      TODAY,
    );

    expect(map.get('proj-a')?.unconfigured).toBeNull();
  });

  it('a project with no phase rows never appears in the map', () => {
    expect(buildDeskSchedule([], [], TODAY).size).toBe(0);
    // …and the caller reads that absence through this constant.
    expect(DESK_SCHEDULE_UNCONFIGURED.unconfigured).toBe('no-phases');
    expect(DESK_SCHEDULE_UNCONFIGURED.positionText).toBeNull();
  });

  it('is total on empty and malformed input', () => {
    expect(buildDeskSchedule([], [], TODAY)).toEqual(new Map());
    expect(
      buildDeskSchedule([phaseRow({ id: 'x', project_id: 'proj-a' })], [], TODAY).get('proj-a'),
    ).toMatchObject({ fidelity: 'band', activePhaseName: null });
  });

  it('threads each project’s own start_date as the forward-compute origin (the Frame register)', () => {
    const phases = [
      phaseRow({ id: 'a1', project_id: 'proj-a', name: 'Discovery', duration_days: 90 }),
      phaseRow({ id: 'b1', project_id: 'proj-b', name: 'Discovery', duration_days: 90 }),
    ];
    const withStarts = buildDeskSchedule(
      phases,
      [],
      TODAY,
      new Map([['proj-a', '2026-05-01']]),
    );

    // proj-a has an origin, so its unanchored chain is a Frame…
    expect(withStarts.get('proj-a')).toMatchObject({
      fidelity: 'frame',
      positionText: 'Frame',
    });
    // …and proj-b, with no start date, has nothing to place at all.
    expect(withStarts.get('proj-b')?.fidelity).toBe('band');

    // Omitting the map entirely is the pre-fix behavior: Frame unreachable.
    const withoutStarts = buildDeskSchedule(phases, [], TODAY);
    for (const entry of withoutStarts.values()) {
      expect(entry.fidelity).not.toBe('frame');
    }
  });

  it('the 50-project shape: one entry per project, each resolved once', () => {
    const phases: DeskPhaseRow[] = [];
    const milestones: DeskMilestoneRow[] = [];
    for (let p = 0; p < 50; p++) {
      for (let i = 0; i < 6; i++) {
        phases.push(
          phaseRow({
            id: `p${p}-${i}`,
            project_id: `proj-${p}`,
            duration_days: 14,
            sort_order: i,
            anchor_date: i === 0 ? '2026-06-01' : null,
            follows_phase_id: i === 0 ? null : `p${p}-${i - 1}`,
          }),
        );
      }
      milestones.push(milestoneRow({ id: `m${p}`, phase_id: `p${p}-5` }));
    }

    const map = buildDeskSchedule(phases, milestones, TODAY);
    expect(map.size).toBe(50);
    for (const entry of map.values()) {
      expect(entry.fidelity).toBe('committed');
      expect(entry.positionText).toBe('Week 2');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wave 2 (R109/R110) — the proposal signal and the contradiction's WORDS.
// ─────────────────────────────────────────────────────────────────────────────

function proposalRow(
  over: Partial<DeskProposalRow> & { id: string; project_id: string },
): DeskProposalRow {
  return {
    source_event: over.source_event ?? 'po-sent',
    conflicts_with_committed: over.conflicts_with_committed ?? false,
    created_at: over.created_at ?? '2026-06-01T00:00:00Z',
    ...over,
  };
}

describe('the proposal signal', () => {
  it('collapses many proposals per project into one signal, newest event first', () => {
    const map = buildDeskSchedule(
      [phaseRow({ id: 'a', project_id: 'proj-1', duration_days: 7 })],
      [],
      TODAY,
      undefined,
      [
        proposalRow({ id: 'r1', project_id: 'proj-1', source_event: 'po-sent', created_at: '2026-06-01T00:00:00Z' }),
        proposalRow({
          id: 'r2',
          project_id: 'proj-1',
          source_event: 'trade-scope-accepted',
          created_at: '2026-06-05T00:00:00Z',
        }),
      ],
    );
    expect(map.get('proj-1')?.proposals).toEqual({
      count: 2,
      latestSourceEvent: 'trade-scope-accepted',
      conflicting: 0,
    });
  });

  it('does not depend on the caller ordering the rows', () => {
    const rows = [
      proposalRow({ id: 'r1', project_id: 'proj-1', source_event: 'po-sent', created_at: '2026-06-01T00:00:00Z' }),
      proposalRow({
        id: 'r2',
        project_id: 'proj-1',
        source_event: 'trade-scope-engaged',
        created_at: '2026-06-09T00:00:00Z',
      }),
    ];
    const map = buildDeskSchedule(
      [phaseRow({ id: 'a', project_id: 'proj-1', duration_days: 7 })],
      [],
      TODAY,
      undefined,
      rows,
    );
    expect(map.get('proj-1')?.proposals?.latestSourceEvent).toBe('trade-scope-engaged');
  });

  it('counts the contradictions separately (R109 class 3)', () => {
    const map = buildDeskSchedule(
      [phaseRow({ id: 'a', project_id: 'proj-1', duration_days: 7 })],
      [],
      TODAY,
      undefined,
      [
        proposalRow({ id: 'r1', project_id: 'proj-1', conflicts_with_committed: true }),
        proposalRow({
          id: 'r2',
          project_id: 'proj-1',
          source_event: 'trade-scope-engaged',
          created_at: '2026-06-02T00:00:00Z',
        }),
      ],
    );
    expect(map.get('proj-1')?.proposals?.conflicting).toBe(1);
  });

  it('a project with proposals and no phase rows still reaches the desk', () => {
    const map = buildDeskSchedule([], [], TODAY, undefined, [
      proposalRow({ id: 'r1', project_id: 'proj-9' }),
    ]);
    expect(map.get('proj-9')?.unconfigured).toBe('no-phases');
    expect(map.get('proj-9')?.proposals?.count).toBe(1);
  });

  it('the proposals-only map says nothing about configuration', () => {
    const map = buildDeskProposalSignals([
      proposalRow({ id: 'r1', project_id: 'proj-9' }),
      proposalRow({ id: 'r2', project_id: 'proj-9', conflicts_with_committed: true, created_at: '2026-06-02T00:00:00Z' }),
    ]);
    // An unanswered chain is not an unconfigured one — this map must never
    // fabricate the "name the phases" nudge.
    expect(map.get('proj-9')?.unconfigured).toBeNull();
    expect(map.get('proj-9')?.proposals).toEqual({
      count: 2,
      latestSourceEvent: 'po-sent',
      conflicting: 1,
    });
  });
});

describe('the contradiction is said in words, never ids (R113)', () => {
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  it('names the phase and the overrun', () => {
    expect(chainConflictText('Installation', 6)).toBe(
      'The chain no longer fits Installation \u2014 6 days past its anchor',
    );
    expect(chainConflictText('Installation', 1)).toContain('1 day past');
  });

  it('degrades without a name rather than printing an id', () => {
    expect(chainConflictText(null, 3)).toBe(
      'The chain no longer fits an anchored phase \u2014 3 days past its anchor',
    );
    expect(chainConflictText(null, null)).not.toMatch(UUID_RE);
  });

  it('buildDeskSchedule resolves the contradiction into desk copy', () => {
    // Two 30d phases feeding an install anchored earlier than they can finish.
    const map = buildDeskSchedule(
      [
        phaseRow({ id: 'a', project_id: 'proj-1', duration_days: 30, start_date: '2026-06-01' }),
        phaseRow({
          id: 'install',
          project_id: 'proj-1',
          name: 'Installation',
          follows_phase_id: 'a',
          duration_days: 7,
          anchor_date: '2026-06-10',
        }),
      ],
      [],
      TODAY,
    );
    const entry = map.get('proj-1');
    expect(entry?.contradictionText).toContain('Installation');
    expect(entry?.contradictionText).not.toMatch(UUID_RE);
  });
});
