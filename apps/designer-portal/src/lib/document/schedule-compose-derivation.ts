/**
 * Schedule COMPOSE derivation (Slice 03 §3 — R100/R101 the Schedule Spine's
 * write paths). Pure presentation/planning logic that sits in front of the
 * one time engine (`resolveSchedule`, `@patina/utils`) — mirrors
 * `schedule-spine-derivation.ts`'s conventions (React-free, dependency-light,
 * total: malformed input degrades, it never throws).
 *
 * Two helpers:
 *   - `relinkOnDelete` — the follows-chain patch a phase delete needs so the
 *     chain closes over the gap instead of breaking (phase-delete-confirm).
 *   - `composePreview` — the ghost-add / inline-edit "compute line": resolve
 *     a hypothetical chain (committed phases + ONE pending add/edit) and
 *     report the affected phase's start/end/slack/conflicts. Passive display
 *     only — resolveSchedule stays the only engine, nothing here writes
 *     anything or reimplements the ripple (that's Slice 04).
 */

import {
  resolveSchedule,
  type SchedulePhaseInput,
  type ScheduleMilestoneInput,
  type ScheduleConflict,
} from '@patina/utils';

// ═══════════════════════════════════════════════════════════════════════════
// relinkOnDelete
// ═══════════════════════════════════════════════════════════════════════════

export interface RelinkPhase {
  id: string;
  followsPhaseId: string | null;
}

export interface RelinkUpdate {
  id: string;
  followsPhaseId: string | null;
}

/**
 * The follows-chain patch needed when deleting a phase: every phase that
 * currently follows `deletedId` should instead follow whatever `deletedId`
 * itself followed, so the chain closes over the gap rather than breaking
 * into two disconnected pieces. (The deleted phase's own milestones move
 * with it via the DB's ON DELETE CASCADE — this function only computes the
 * phase relink, per its name.)
 *
 * Total: an unknown `deletedId` (nothing in `phases` has that id) returns an
 * empty list — there is nothing to delete, so nothing to relink. A
 * self-referential `followsPhaseId` on the deleted phase (defensive only —
 * the DB CHECK constraint blocks this) never repoints a follower at the very
 * phase being deleted; it falls back to null (a new root) instead.
 */
export function relinkOnDelete(phases: readonly RelinkPhase[], deletedId: string): RelinkUpdate[] {
  if (!Array.isArray(phases) || typeof deletedId !== 'string' || deletedId === '') return [];

  const deleted = phases.find((p) => p && p.id === deletedId);
  if (!deleted) return [];

  const newFollows = deleted.followsPhaseId === deletedId ? null : deleted.followsPhaseId;

  return phases
    .filter((p) => p && p.id !== deletedId && p.followsPhaseId === deletedId)
    .map((p) => ({ id: p.id, followsPhaseId: newFollows }));
}

// ═══════════════════════════════════════════════════════════════════════════
// composePreview
// ═══════════════════════════════════════════════════════════════════════════

export type PendingEdit =
  | { kind: 'add-phase'; name: string; durationDays: number | null; followsPhaseId: string | null }
  | { kind: 'edit-phase'; id: string; patch: Partial<Omit<SchedulePhaseInput, 'id'>> };

export interface ComposePreview {
  start: string | null;
  end: string | null;
  slackDays: number | null;
  conflicts: ScheduleConflict[];
}

const EMPTY_PREVIEW: ComposePreview = { start: null, end: null, slackDays: null, conflicts: [] };

/** A sentinel id for a not-yet-persisted phase-add preview. */
const PENDING_PHASE_ID = '__pending-phase__';

/**
 * The ghost-add / inline-edit "compute line": resolve the hypothetical chain
 * — every committed phase, plus ONE pending add or edit — and hand back the
 * affected phase's start/end/slack, plus every conflict the edit is
 * implicated in. Passive display only (R100 stands: `resolveSchedule` is
 * still the only engine, and this never persists anything) — NOT the
 * ripple-commit (Slice 04).
 *
 * Conflict scope: the resolver tags `chain_does_not_fit` with the ANCHORED
 * phase's id (both `phaseId` and `anchorId` name the anchor that holds), so
 * a pending edit that overruns a DOWNSTREAM anchor produces a conflict that
 * never names the edited phase itself. The compute line's whole job is to
 * warn about exactly that, so conflicts are matched against the affected
 * phase PLUS everything downstream of it in the hypothetical follows graph
 * (walked forward, cycle-safe). `slackDays` needs no equivalent widening —
 * the resolver's per-phase `slackDays` already carries the affected phase's
 * own room (an anchored phase's absorbed float at its pin, an unanchored
 * phase's float to its nearest downstream anchor).
 *
 * Total: an `edit-phase` pending edit whose `id` isn't among
 * `committedPhases`, or a malformed `pendingEdit`, degrades to the empty
 * preview rather than throwing.
 */
export function composePreview(
  committedPhases: readonly SchedulePhaseInput[],
  committedMilestones: readonly ScheduleMilestoneInput[],
  pendingEdit: PendingEdit,
  today: string,
): ComposePreview {
  const phases = Array.isArray(committedPhases) ? committedPhases.filter((p): p is SchedulePhaseInput => p != null) : [];
  const milestones = Array.isArray(committedMilestones)
    ? committedMilestones.filter((m): m is ScheduleMilestoneInput => m != null)
    : [];

  if (!pendingEdit || typeof pendingEdit !== 'object') return EMPTY_PREVIEW;

  let affectedId: string;
  let hypothetical: SchedulePhaseInput[];

  if (pendingEdit.kind === 'add-phase') {
    affectedId = PENDING_PHASE_ID;
    const newPhase: SchedulePhaseInput = {
      id: PENDING_PHASE_ID,
      name: typeof pendingEdit.name === 'string' ? pendingEdit.name : '',
      durationDays: typeof pendingEdit.durationDays === 'number' ? pendingEdit.durationDays : null,
      durationWeeks: null,
      followsPhaseId: typeof pendingEdit.followsPhaseId === 'string' ? pendingEdit.followsPhaseId : null,
      anchorDate: null,
      lane: 'main',
      startDate: null,
      targetEndDate: null,
      sortOrder: phases.length,
      status: 'pending',
    };
    hypothetical = [...phases, newPhase];
  } else if (pendingEdit.kind === 'edit-phase') {
    if (typeof pendingEdit.id !== 'string') return EMPTY_PREVIEW;
    affectedId = pendingEdit.id;
    const idx = phases.findIndex((p) => p.id === pendingEdit.id);
    if (idx === -1) return EMPTY_PREVIEW;
    hypothetical = phases.slice();
    hypothetical[idx] = { ...hypothetical[idx], ...(pendingEdit.patch ?? {}) };
  } else {
    return EMPTY_PREVIEW;
  }

  const resolved = resolveSchedule(hypothetical, milestones, { today });
  const phase = resolved.phases.find((p) => p.id === affectedId);
  if (!phase) return EMPTY_PREVIEW;

  // The affected phase plus everything downstream of it in the hypothetical
  // follows graph — a chain_does_not_fit conflict is tagged with the anchored
  // (downstream) phase's id, not the edited phase's. Iterative DFS with a
  // seen-set: total and cycle-safe (self-links skipped when building the map).
  const followers = new Map<string, string[]>();
  for (const p of hypothetical) {
    if (p.followsPhaseId != null && p.followsPhaseId !== p.id) {
      const arr = followers.get(p.followsPhaseId);
      if (arr) arr.push(p.id);
      else followers.set(p.followsPhaseId, [p.id]);
    }
  }
  const implicated = new Set<string>();
  const stack = [affectedId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (implicated.has(cur)) continue;
    implicated.add(cur);
    for (const f of followers.get(cur) ?? []) stack.push(f);
  }

  const conflicts = resolved.conflicts.filter(
    (c) => (c.phaseId != null && implicated.has(c.phaseId)) || (c.anchorId != null && implicated.has(c.anchorId)),
  );

  // slackDays needs no downstream widening: the resolver's per-phase value
  // already carries the affected phase's own room (anchored → float absorbed
  // at its own pin; unanchored → float to the nearest downstream anchor).
  return { start: phase.start, end: phase.end, slackDays: phase.slackDays, conflicts };
}
