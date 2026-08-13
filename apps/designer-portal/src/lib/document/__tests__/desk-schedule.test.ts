/**
 * R108 — the desk's schedule feed. One batched read of every desk project's
 * phases and milestones in, one entry per project out. `resolveSchedule` runs
 * once per project id, never once per folder render (risk R1).
 */

import {
  buildDeskSchedule,
  DESK_SCHEDULE_UNCONFIGURED,
  type DeskMilestoneRow,
  type DeskPhaseRow,
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
