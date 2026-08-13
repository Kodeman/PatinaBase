/**
 * The Document · Schedule — R107/R108/R111 fidelity + selection.
 *
 * R107: Band / Frame / Committed / record is the schedule's official vocabulary,
 * derived per phase from the resolver's output — no new column, no new query.
 * R108: no surface renders a date firmer than its source supports; "Week N"
 * exists only downstream of a hard anchor.
 * R111: the resolver selects the active phase; the classifier only names it.
 *
 * Pure and clock-injected exactly like `resolveSchedule` — `today` is a
 * parameter, never `Date.now()`. Lives beside the resolver rather than in a
 * portal lib because the desk, the doc, and the proposal composer all read it.
 */

import {
  epochDayFromISO,
  type PhaseStatus,
  type ResolvedPhase,
  type ResolvedSchedule,
} from './schedule';

export type Fidelity = 'band' | 'frame' | 'committed' | 'record';

export interface ScheduleSelection {
  activePhaseId: string | null;
  reason: 'today-in-window' | 'status-in-progress' | 'next-upcoming' | 'none';
}

/** The one place the fidelity vocabulary is spelled. Every mouth reads this. */
export const FIDELITY_WORD: Readonly<Record<Fidelity, string>> = Object.freeze({
  band: 'Band',
  frame: 'Frame',
  committed: 'Committed',
  record: 'Record',
});

/** The register a phase's dates may be spoken in, ignoring its status (R107). */
function sourceFidelity(phase: ResolvedPhase): Fidelity {
  if (phase.source === 'anchor' || phase.origin === 'anchor') return 'committed';
  if (phase.origin === 'project-start') return 'frame';
  return 'band'; // 'legacy' origin, 'unresolved' source, and dateless 'none'
}

/**
 * R107's mapping, spelled so it is testable. A completed phase is a record of
 * what happened regardless of how its dates were derived.
 */
export function phaseFidelity(phase: ResolvedPhase, status: PhaseStatus): Fidelity {
  if (status === 'completed') return 'record';
  return sourceFidelity(phase);
}

/**
 * R111 — the one selector. Active = the date window containing today
 * (completed excluded; ties main lane before thread, then the resolver's own
 * deterministic output order, which is start → sortOrder → id). Falling back:
 * the single in_progress/delayed phase when exactly one exists, else the
 * earliest phase starting after today, else nothing.
 */
export function selectActivePhase(
  resolved: ResolvedSchedule,
  statuses: Map<string, PhaseStatus>,
  today: string,
  /**
   * phase id → `sort_order`. I126 breaks a window tie on the main lane and
   * then on sort order, which the resolver's output array cannot express (it
   * orders by start first). Omitted, ties fall back to that output order.
   */
  sortOrders?: ReadonlyMap<string, number>,
): ScheduleSelection {
  const phases = resolved?.phases ?? [];
  const candidates = phases.filter((p) => statuses.get(p.id) !== 'completed');

  const inWindow = candidates.filter(
    (p) => p.start != null && p.end != null && p.start <= today && today <= p.end,
  );
  if (inWindow.length > 0) {
    const rank = (p: ResolvedPhase, index: number): [number, number] => [
      p.lane === 'main' ? 0 : 1,
      sortOrders?.get(p.id) ?? index,
    ];
    const ordered = inWindow
      .map((p, index) => ({ p, key: rank(p, index) }))
      .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1]);
    return { activePhaseId: ordered[0].p.id, reason: 'today-in-window' };
  }

  const running = candidates.filter((p) => {
    const s = statuses.get(p.id);
    return s === 'in_progress' || s === 'delayed';
  });
  if (running.length === 1) {
    return { activePhaseId: running[0].id, reason: 'status-in-progress' };
  }

  const upcoming = candidates.find((p) => p.start != null && p.start > today);
  if (upcoming) return { activePhaseId: upcoming.id, reason: 'next-upcoming' };

  return { activePhaseId: null, reason: 'none' };
}

/**
 * R108, the T1 kill. A week number is only utterable downstream of a hard
 * anchor: `governingAnchorId` non-null AND today at or after that anchor's
 * pinned start. Every other case answers with the fidelity word, so a
 * legacy-dates project reads "Band" and never "Week 14".
 */
export function positionText(
  resolved: ResolvedSchedule,
  selection: ScheduleSelection,
  today: string,
): string | null {
  const id = selection?.activePhaseId ?? null;
  if (id == null) return null;
  const phase = (resolved?.phases ?? []).find((p) => p.id === id);
  if (!phase) return null;

  const word = FIDELITY_WORD[sourceFidelity(phase)];
  if (phase.governingAnchorId == null) return word;

  const anchor = (resolved?.phases ?? []).find((p) => p.id === phase.governingAnchorId);
  const anchorEpoch = epochDayFromISO(anchor?.start ?? null);
  const todayEpoch = epochDayFromISO(today);
  if (anchorEpoch == null || todayEpoch == null) return word;

  const week = Math.floor((todayEpoch - anchorEpoch) / 7) + 1;
  if (week < 1) return word; // the anchored run has not begun; no week to claim
  return `Week ${week}`;
}

/**
 * The schedule's own end date and the register it may be spoken in: the latest
 * resolved end across the phases, carrying that phase's fidelity. A schedule
 * with nothing placed has no target, and says so in band.
 */
export function targetEnd(resolved: ResolvedSchedule): { date: string | null; fidelity: Fidelity } {
  let last: ResolvedPhase | null = null;
  for (const p of resolved?.phases ?? []) {
    if (p.end == null) continue;
    if (last == null || p.end >= last.end!) last = p;
  }
  if (!last) return { date: null, fidelity: 'band' };
  return { date: last.end, fidelity: sourceFidelity(last) };
}
