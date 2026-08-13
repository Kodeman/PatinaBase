/**
 * Desk schedule inputs (R108 / R113) — the resolver, once per project.
 *
 * Mirrors `desk-conflicts.ts`: one batched read of every desk project's phases
 * and milestones goes in, a per-project map comes out. `resolveSchedule` +
 * `selectActivePhase` run exactly once per project id, never once per folder
 * render, and nothing here computes a date or a week itself.
 *
 * Pure: no Supabase, no React, `today` injected.
 */

import {
  mapMilestoneRowToScheduleInput,
  mapPhaseRowToScheduleInput,
} from '@patina/supabase';
import {
  phaseFidelity,
  positionText,
  resolveSchedule,
  selectActivePhase,
  type Fidelity,
  type PhaseStatus,
  type ScheduleSelection,
} from '@patina/utils';

/** The columns the desk feed selects — chain columns only, never `*` (R1 risk). */
export interface DeskPhaseRow {
  id: string;
  project_id: string;
  name: string;
  phase_key: string | null;
  status: string | null;
  sort_order: number | null;
  lane: string | null;
  duration_days: number | null;
  duration_weeks: number | null;
  follows_phase_id: string | null;
  anchor_date: string | null;
  start_date: string | null;
  target_end_date: string | null;
}

export interface DeskMilestoneRow {
  id: string;
  phase_id: string;
  name: string;
  kind: string | null;
  offset_days: number | null;
  anchor_date: string | null;
  status: string | null;
  sort_order: number | null;
}

/** What a desk folder may say about a project's schedule. */
export interface DeskScheduleInput {
  selection: ScheduleSelection;
  fidelity: Fidelity;
  /** 'Week 3' | 'Frame' | 'Band' | 'Committed' — from the resolver, never recomputed. */
  positionText: string | null;
  activePhaseName: string | null;
  /**
   * R113's setup nudge, relocated out of the doc body. `no-phases` = nothing
   * to place at all; `install-unanchored` = an installation phase exists but
   * no anchor holds its week.
   */
  unconfigured: 'no-phases' | 'install-unanchored' | null;
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    const bucket = out.get(k);
    if (bucket) bucket.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/** Per-project Desk schedule inputs from one batched phase + milestone read. */
export function buildDeskSchedule(
  phaseRows: readonly DeskPhaseRow[],
  milestoneRows: readonly DeskMilestoneRow[],
  today: string,
): Map<string, DeskScheduleInput> {
  const phasesByProject = groupBy(phaseRows ?? [], (r) => r.project_id ?? null);
  const projectOfPhase = new Map<string, string>();
  for (const p of phaseRows ?? []) {
    if (p.project_id) projectOfPhase.set(p.id, p.project_id);
  }
  const milestonesByProject = groupBy(
    milestoneRows ?? [],
    (m) => projectOfPhase.get(m.phase_id) ?? null,
  );

  const out = new Map<string, DeskScheduleInput>();
  for (const [projectId, phases] of phasesByProject) {
    const resolved = resolveSchedule(
      phases.map((p) => mapPhaseRowToScheduleInput(p as Parameters<typeof mapPhaseRowToScheduleInput>[0])),
      (milestonesByProject.get(projectId) ?? []).map((m) =>
        mapMilestoneRowToScheduleInput(m as Parameters<typeof mapMilestoneRowToScheduleInput>[0]),
      ),
      { projectStartDate: null, today },
    );
    const statuses = new Map<string, PhaseStatus>(
      phases.map((p) => [p.id, (p.status ?? 'pending') as PhaseStatus]),
    );
    const selection = selectActivePhase(resolved, statuses, today);
    const active = resolved.phases.find((p) => p.id === selection.activePhaseId) ?? null;
    const installPhase = phases.find((p) => p.phase_key === 'installation') ?? null;
    const installResolved = installPhase
      ? (resolved.phases.find((p) => p.id === installPhase.id) ?? null)
      : null;

    out.set(projectId, {
      selection,
      fidelity: active ? phaseFidelity(active, statuses.get(active.id) ?? 'pending') : 'band',
      positionText: positionText(resolved, selection, today),
      activePhaseName: active
        ? (phases.find((p) => p.id === active.id)?.name ?? null)
        : null,
      unconfigured:
        installResolved && installResolved.governingAnchorId === null
          ? 'install-unanchored'
          : null,
    });
  }

  // A project with no phase rows at all never reaches the loop above, so the
  // caller supplies its own "no-phases" reading from the desk row itself.
  return out;
}

/** The reading for a project that returned no phase rows at all. */
export const DESK_SCHEDULE_UNCONFIGURED: DeskScheduleInput = {
  selection: { activePhaseId: null, reason: 'none' },
  fidelity: 'band',
  positionText: null,
  activePhaseName: null,
  unconfigured: 'no-phases',
};
