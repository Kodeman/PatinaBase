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
  conflicts_with_committed?: boolean | null;
  created_at?: string | null;
}

/** What the desk knows about a project's live proposals. */
export interface DeskProposalSignal {
  count: number;
  /** The newest proposal's source event — it decides which line is honest. */
  latestSourceEvent: string | null;
  /** How many of them contradict an anchor already committed (R109 class 3). */
  conflicting: number;
}

/**
 * The resolver's contradiction, said to a person. `ScheduleConflict.message` is
 * an engine diagnostic carrying raw ids (packages/utils/src/schedule.ts) — R113
 * killed exactly that class of leak from the doc body, so it never reaches a
 * desk folder either.
 */
export function chainConflictText(
  phaseName: string | null,
  overrunDays: number | null | undefined,
): string {
  const name = phaseName?.trim() || 'an anchored phase';
  const days = overrunDays ?? 0;
  if (days <= 0) return `The chain no longer fits ${name}`;
  return `The chain no longer fits ${name} — ${days} day${days === 1 ? '' : 's'} past its anchor`;
}

/** Source events raised by a signed act rather than a recorded operational one. */
const CEREMONY_SOURCE_EVENTS: ReadonlySet<string> = new Set([
  'design-services-executed',
  'furnishings-authorization-executed',
  'trade-scope-engaged',
  'trade-scope-accepted',
  'install-window-confirmed',
  'install-window-released',
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
  /**
   * The chain-does-not-fit contradiction, already said in designer-facing
   * words. Built here because this is where the phase NAMES are; `conflicts`
   * above carries engine diagnostics that must never reach a surface.
   */
  contradictionText?: string | null;
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

  // Newest-first is the caller's contract, but a pure function should not
  // depend on it: sort defensively so `latestSourceEvent` is genuinely latest.
  const sortedProposals = [...(proposalRows ?? [])].sort((a, b) =>
    String(b?.created_at ?? '').localeCompare(String(a?.created_at ?? '')),
  );
  const proposalsByProject = new Map<string, DeskProposalSignal>();
  for (const p of sortedProposals) {
    if (!p?.project_id) continue;
    const existing = proposalsByProject.get(p.project_id);
    if (existing) {
      existing.count += 1;
      if (p.conflicts_with_committed) existing.conflicting += 1;
    } else {
      proposalsByProject.set(p.project_id, {
        count: 1,
        latestSourceEvent: p.source_event ?? null,
        conflicting: p.conflicts_with_committed ? 1 : 0,
      });
    }
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
      contradictionText: (() => {
        const c = resolved.conflicts.find((x) => x.kind === 'chain_does_not_fit');
        if (!c) return null;
        const anchored = phases.find((p) => p.id === (c.anchorId ?? c.phaseId));
        return chainConflictText(anchored?.name ?? null, c.overrunDays);
      })(),
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

/**
 * The proposals alone, when the phase read failed or truncated. A proposal is
 * true without a chain, so it still speaks — but this map says NOTHING about
 * configuration (an unanswered chain is not an unconfigured one) and nothing
 * about position.
 */
export function buildDeskProposalSignals(
  proposalRows: readonly DeskProposalRow[],
): Map<string, DeskScheduleInput> {
  const out = new Map<string, DeskScheduleInput>();
  const sorted = [...proposalRows].sort((a, b) =>
    String(b?.created_at ?? '').localeCompare(String(a?.created_at ?? '')),
  );
  for (const p of sorted) {
    if (!p?.project_id) continue;
    const existing = out.get(p.project_id);
    if (existing?.proposals) {
      existing.proposals.count += 1;
      if (p.conflicts_with_committed) existing.proposals.conflicting += 1;
      continue;
    }
    out.set(p.project_id, {
      selection: { activePhaseId: null, reason: 'none' },
      fidelity: 'band',
      positionText: null,
      activePhaseName: null,
      unconfigured: null,
      conflicts: [],
      contradictionText: null,
      proposals: {
        count: 1,
        latestSourceEvent: p.source_event ?? null,
        conflicting: p.conflicts_with_committed ? 1 : 0,
      },
    });
  }
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
  contradictionText: null,
};
