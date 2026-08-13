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
  type ScheduleConflict,
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

/** A live ('proposed') schedule_proposals row, desk-shaped (00475). */
export interface DeskProposalRow {
  id: string;
  project_id: string;
  source_event: string;
}

/** What the desk knows about a project's live proposals. */
export interface DeskProposalSignal {
  count: number;
  /** The newest proposal's source event — it decides which line is honest. */
  latestSourceEvent: string | null;
}

/** Source events raised by a signed act rather than a recorded operational one. */
const CEREMONY_SOURCE_EVENTS: ReadonlySet<string> = new Set([
  'design-services-executed',
  'furnishings-authorization-executed',
  'trade-scope-engaged',
  'trade-scope-accepted',
]);

export function isCeremonySourceEvent(sourceEvent: string | null | undefined): boolean {
  return !!sourceEvent && CEREMONY_SOURCE_EVENTS.has(sourceEvent);
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
  /**
   * The resolver's own contradictions (R4 / "Ruling IV" — one fact, exactly
   * three renderings: the spine row's terracotta stamp, the desk re-sort, the
   * guide sentence). Wave 1 computed these and dropped them; the desk leg needs
   * them. Optional so existing fixtures stay valid — absent reads as "silent".
   */
  conflicts?: ScheduleConflict[];
  /** Live schedule proposals awaiting the designer's one act (R109/R110). */
  proposals?: DeskProposalSignal;
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

/**
 * Per-project Desk schedule inputs from one batched phase + milestone read.
 * `startDates` maps project_id → `projects.start_date`, the resolver's
 * forward-compute origin: without it an unanchored chain can never resolve as
 * a Frame, only as legacy stored dates.
 */
export function buildDeskSchedule(
  phaseRows: readonly DeskPhaseRow[],
  milestoneRows: readonly DeskMilestoneRow[],
  today: string,
  startDates?: ReadonlyMap<string, string | null>,
  proposalRows?: readonly DeskProposalRow[],
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

  // Proposals arrive newest-first from the feed; the first per project wins.
  const proposalsByProject = new Map<string, DeskProposalSignal>();
  for (const p of proposalRows ?? []) {
    if (!p?.project_id) continue;
    const existing = proposalsByProject.get(p.project_id);
    if (existing) existing.count += 1;
    else
      proposalsByProject.set(p.project_id, {
        count: 1,
        latestSourceEvent: p.source_event ?? null,
      });
  }

  const out = new Map<string, DeskScheduleInput>();
  for (const [projectId, phases] of phasesByProject) {
    const resolved = resolveSchedule(
      phases.map((p) => mapPhaseRowToScheduleInput(p as Parameters<typeof mapPhaseRowToScheduleInput>[0])),
      (milestonesByProject.get(projectId) ?? []).map((m) =>
        mapMilestoneRowToScheduleInput(m as Parameters<typeof mapMilestoneRowToScheduleInput>[0]),
      ),
      { projectStartDate: startDates?.get(projectId) ?? null, today },
    );
    const statuses = new Map<string, PhaseStatus>(
      phases.map((p) => [p.id, (p.status ?? 'pending') as PhaseStatus]),
    );
    const sortOrders = new Map<string, number>(phases.map((p) => [p.id, p.sort_order ?? 0]));
    const selection = selectActivePhase(resolved, statuses, today, sortOrders);
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
      conflicts: resolved.conflicts,
      proposals: proposalsByProject.get(projectId),
    });
  }

  // A project with live proposals but no phase rows never reaches the loop
  // above; it still has something to say.
  for (const [projectId, proposals] of proposalsByProject) {
    if (out.has(projectId)) continue;
    out.set(projectId, { ...DESK_SCHEDULE_UNCONFIGURED, proposals });
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
  conflicts: [],
};
