/**
 * R28 — schedule conflicts on the Desk. A collision needs her hand (folder,
 * ranked just under awaiting-inspection, above task_due — R33's blessed
 * ordering holds); drift rides an in-motion chip. Inputs arrive as a
 * project_id → DeskConflictInput map (built from delivery_events client-side).
 */

import {
  deriveNeed,
  deriveMotion,
  partitionDesk,
  type DeskConflictInput,
  type DocumentStateRow,
} from '../desk-derivation';
import type { DeskScheduleInput } from '../desk-schedule';

const NOW = new Date('2026-06-12T16:00:00Z');

function projectRow(over: Partial<DocumentStateRow> = {}): DocumentStateRow {
  return {
    engagement_kind: 'project',
    engagement_id: 'p1',
    project_id: 'p1',
    proposal_id: null,
    lead_id: null,
    designer_id: 'd1',
    client_profile_id: 'c1',
    client_name: 'Sarah Whitfield',
    title: 'Whitfield Residence',
    project_status: 'active',
    current_phase: 'install',
    active_section: 'install',
    is_paused: false,
    is_archived: false,
    proposal_status: null,
    proposal_sent_at: null,
    proposal_viewed_at: null,
    lead_response_deadline: null,
    lead_status: null,
    overdue_decision_count: 0,
    earliest_overdue_due: null,
    awaiting_inspection_count: 0,
    blocked_item_count: 0,
    in_flight_count: 0,
    installed_count: 0,
    item_count: 4,
    updated_at: '2026-06-10T00:00:00Z',
    open_claim_count: 0,
    open_claim_po: null,
    unsent_pulse_count: 0,
    pulse_week_of: null,
    draft_unsent_po_count: 0,
    oldest_draft_po_created_at: null,
    draft_po_label: null,
    unacked_po_count: 0,
    oldest_unacked_sent_at: null,
    unacked_po_label: null,
    due_task_count: 0,
    earliest_task_due: null,
    due_task_title: null,
    ...over,
  };
}

const collision: DeskConflictInput = {
  collision: { text: 'Two installs collide — week of Jul 13', label: 'COLLISION', date: '2026-07-13' },
  drift: null,
};
const drift: DeskConflictInput = { collision: null, drift: 'delivery 5d before install' };

describe('schedule_conflict need (R28)', () => {
  it('a collision becomes the folder need line', () => {
    const need = deriveNeed(projectRow(), NOW, collision);
    expect(need?.kind).toBe('schedule_conflict');
    expect(need?.text).toBe('Two installs collide — week of Jul 13');
    expect(need?.stamp.label).toBe('COLLISION');
    expect(need?.urgent).toBe(false);
  });

  it('drift does not raise a need line — it stays a motion chip', () => {
    expect(deriveNeed(projectRow(), NOW, drift)).toBeNull();
    // deriveMotion carries the drift as a structured in-motion chip
    // ({ kind, text }) — the same return shape the rest of the suite and
    // partitionDesk read. Drift rides the 'drift' chip kind, never a need line.
    expect(deriveMotion(projectRow(), NOW, drift)).toEqual({
      kind: 'drift',
      text: 'delivery 5d before install',
    });
  });

  it('no conflict input → no conflict need', () => {
    expect(deriveNeed(projectRow(), NOW, null)).toBeNull();
    expect(deriveNeed(projectRow(), NOW)).toBeNull();
  });

  it('a real overdue decision still outranks a collision (R33 ordering holds)', () => {
    const need = deriveNeed(
      projectRow({ overdue_decision_count: 1, earliest_overdue_due: '2026-06-10' }),
      NOW,
      collision,
    );
    expect(need?.kind).toBe('overdue_decision');
  });

  it('a collision outranks a dued task on the same engagement', () => {
    const need = deriveNeed(
      projectRow({ due_task_count: 1, earliest_task_due: '2026-06-12', due_task_title: 'x' }),
      NOW,
      collision,
    );
    expect(need?.kind).toBe('schedule_conflict');
  });
});

describe('partitionDesk threads conflicts by project_id (R28)', () => {
  it('routes the collision to its project folder and drift to its chip', () => {
    const rows = [projectRow({ project_id: 'p1' }), projectRow({ engagement_id: 'p2', project_id: 'p2' })];
    const conflicts = new Map<string, DeskConflictInput>([
      ['p1', collision],
      ['p2', drift],
    ]);
    const { folders, chips } = partitionDesk(rows, NOW, conflicts);
    expect(folders).toHaveLength(1);
    expect(folders[0].row.project_id).toBe('p1');
    expect(folders[0].need.kind).toBe('schedule_conflict');
    expect(chips.some((c) => c.row.project_id === 'p2' && c.text === 'delivery 5d before install')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R113 + R6 — the setup nudges relocated out of the doc body. Setup, not a live
// obstruction: they sort under the collision they might one day cause and under
// a task the designer already committed to. Drift stays a chip and never
// becomes a need — the discipline this file already pins.
// ─────────────────────────────────────────────────────────────────────────────

const unconfigured = (over: Partial<DeskScheduleInput> = {}): DeskScheduleInput => ({
  selection: { activePhaseId: null, reason: 'none' },
  fidelity: 'band',
  positionText: null,
  activePhaseName: null,
  unconfigured: 'no-phases',
  ...over,
});

describe('schedule_unconfigured need (R113 / R6)', () => {
  it('a project with no phases asks for them by name', () => {
    const need = deriveNeed(projectRow(), NOW, null, null, null, null, unconfigured());
    expect(need?.kind).toBe('schedule_unconfigured');
    expect(need?.text).toBe('Name the phases for this project');
    expect(need?.urgent).toBe(false);
  });

  it('an unanchored install week asks for the anchor', () => {
    const need = deriveNeed(
      projectRow(),
      NOW,
      null,
      null,
      null,
      null,
      unconfigured({ unconfigured: 'install-unanchored' }),
    );
    expect(need?.text).toBe('Anchor the install week');
  });

  it('a configured schedule raises no need at all', () => {
    expect(
      deriveNeed(projectRow(), NOW, null, null, null, null, unconfigured({ unconfigured: null })),
    ).toBeNull();
  });

  it('a degraded feed (no schedule input) never nags', () => {
    expect(deriveNeed(projectRow(), NOW, null, null, null, null, null)).toBeNull();
  });

  it('R6 gate: it fires only in the sections where composing a schedule is the act', () => {
    for (const section of ['project', 'install'] as const) {
      expect(
        deriveNeed(
          projectRow({ active_section: section }),
          NOW,
          null,
          null,
          null,
          null,
          unconfigured(),
        )?.kind,
      ).toBe('schedule_unconfigured');
    }
    for (const section of ['brief', 'discovery', 'direction', 'proposal', 'care'] as const) {
      expect(
        deriveNeed(
          projectRow({ active_section: section }),
          NOW,
          null,
          null,
          null,
          null,
          unconfigured(),
        ),
      ).toBeNull();
    }
  });

  it('a collision outranks it — a live obstruction beats setup work', () => {
    expect(deriveNeed(projectRow(), NOW, collision, null, null, null, unconfigured())?.kind).toBe(
      'schedule_conflict',
    );
  });

  it('a dued task outranks it — a committed act beats setup work', () => {
    expect(
      deriveNeed(
        projectRow({ due_task_count: 1, earliest_task_due: '2026-06-12', due_task_title: 'x' }),
        NOW,
        null,
        null,
        null,
        null,
        unconfigured(),
      )?.kind,
    ).toBe('task_due');
  });

  it('it outranks the send weave beneath it', () => {
    expect(
      deriveNeed(
        projectRow({ draft_unsent_po_count: 1, oldest_draft_po_created_at: '2026-05-01' }),
        NOW,
        null,
        null,
        null,
        null,
        unconfigured(),
      )?.kind,
    ).toBe('schedule_unconfigured');
  });

  it('drift still stays a chip and never becomes this need', () => {
    expect(
      deriveNeed(projectRow(), NOW, drift, null, null, null, unconfigured({ unconfigured: null })),
    ).toBeNull();
    expect(deriveMotion(projectRow(), NOW, drift, null, unconfigured())).toEqual({
      kind: 'drift',
      text: 'delivery 5d before install',
    });
  });
});

describe('schedule_position motion (R108)', () => {
  const positioned = unconfigured({
    selection: { activePhaseId: 'ph1', reason: 'today-in-window' },
    fidelity: 'committed',
    positionText: 'Week 3',
    activePhaseName: 'Design Development',
    unconfigured: null,
  });

  it('states the phase and its position', () => {
    expect(deriveMotion(projectRow(), NOW, null, null, positioned)).toEqual({
      kind: 'schedule_position',
      text: 'Design Development · Week 3',
    });
  });

  it('a frame says Frame, never a week', () => {
    const motion = deriveMotion(
      projectRow(),
      NOW,
      null,
      null,
      unconfigured({ ...positioned, fidelity: 'frame', positionText: 'Frame' }),
    );
    expect(motion?.text).toBe('Design Development · Frame');
    expect(motion?.text).not.toMatch(/Week/);
  });

  it('a band never states a date — it states that it is a band', () => {
    const motion = deriveMotion(
      projectRow(),
      NOW,
      null,
      null,
      unconfigured({ ...positioned, fidelity: 'band', positionText: 'Band' }),
    );
    expect(motion).toEqual({ kind: 'schedule_position', text: 'Band — no anchor yet' });
  });

  it('drift outranks it — an existing R22 chip beats a statement of position', () => {
    expect(deriveMotion(projectRow(), NOW, drift, null, positioned)?.kind).toBe('drift');
  });

  it('it outranks the in-flight chip beneath it', () => {
    expect(
      deriveMotion(projectRow({ in_flight_count: 3 }), NOW, null, null, positioned)?.kind,
    ).toBe('schedule_position');
    expect(deriveMotion(projectRow({ in_flight_count: 3 }), NOW, null, null, null)?.kind).toBe(
      'in_flight',
    );
  });
});

describe('partitionDesk threads schedules by project_id', () => {
  it('reads a project absent from a PRESENT map as having no phases at all', () => {
    const { folders } = partitionDesk(
      [projectRow({ project_id: 'p1' })],
      NOW,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new Map<string, DeskScheduleInput>(),
    );
    expect(folders[0]?.need.kind).toBe('schedule_unconfigured');
  });

  it('reads an ABSENT map as unanswered, never as an unconfigured schedule', () => {
    const { folders } = partitionDesk([projectRow({ project_id: 'p1' })], NOW);
    expect(folders).toHaveLength(0);
  });
});
