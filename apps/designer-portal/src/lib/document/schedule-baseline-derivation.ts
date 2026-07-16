/**
 * Schedule BASELINE derivation (Slice 05 — R100 "Memory"). Pure planning
 * logic that sits in front of the one time engine (`resolveSchedule`,
 * `@patina/utils`) — mirrors `schedule-ripple-derivation.ts`'s conventions
 * (React-free, dependency-light, TOTAL: malformed input degrades, never
 * throws).
 *
 * `schedule_revisions.phase_snapshots` (migration 00326, `cut_schedule_revision`)
 * freezes the RESOLVER-INPUT field set at signature (v1) and every committed
 * ripple edit (v2+) as a jsonb ARRAY of phase objects, each embedding its
 * milestones array:
 *   { id, name, phase_key, duration_days, duration_weeks, follows_phase_id,
 *     anchor_date, lane, start_date, target_end_date, sort_order, status,
 *     milestones: [{ id, name, kind, offset_days, anchor_date, status,
 *     sort_order }] }
 * This module never computes a date itself — it only reshapes that snapshot
 * back into `SchedulePhaseInput[]` / `ScheduleMilestoneInput[]` so the SAME
 * `resolveSchedule` can re-derive the baseline's positions (R100: "ONE
 * engine"), and diffs the baseline's resolved positions against the current
 * schedule's for the clay ghost layer (S5-3).
 *
 * Two exports:
 *   - `snapshotToResolverInputs` — jsonb snapshot → resolver inputs. TOTAL:
 *     a non-array snapshot (or anything malformed) degrades to empty arrays;
 *     per-entry field coercion mirrors `use-schedule.ts`'s row-mapper
 *     narrowing style (defensive `narrow()` against free-text enum columns,
 *     never throwing on an unexpected shape) — except the source here is
 *     untyped `unknown` JSON, not a typed DB row, so every field is coerced
 *     rather than merely defaulted.
 *   - `baselineGhostDiff` — given the CURRENT resolved schedule and the
 *     BASELINE's resolved schedule (both produced by the same
 *     `resolveSchedule`), returns only the phases/milestones whose dates
 *     differ, matched by id. A phase/milestone added after the baseline was
 *     cut has no baseline counterpart and is skipped (it never made a
 *     baseline promise to ghost); one deleted since the baseline is included
 *     with null current dates (render treatment decided in S5-3).
 */

import {
  type SchedulePhaseInput,
  type ScheduleMilestoneInput,
  type ResolvedSchedule,
  type PhaseStatus,
  type MilestoneKind,
  type MilestoneStatus,
} from '@patina/utils';

// ═══════════════════════════════════════════════════════════════════════════
// Defensive coercion helpers — the snapshot is `unknown` jsonb, not a typed
// DB row, so every field needs a runtime type check (not just a `?? null`).
// ═══════════════════════════════════════════════════════════════════════════

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strOr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function finiteNumOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function intOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Mirrors `use-schedule.ts`'s `narrow()` — defensive against free-text enum
 *  columns (no CHECK constraint mirrors the resolver's closed unions 1:1). */
function narrow<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

const PHASE_STATUSES: readonly PhaseStatus[] = ['pending', 'in_progress', 'active', 'completed', 'delayed'];
const MILESTONE_KINDS: readonly MilestoneKind[] = ['signoff', 'decision', 'delivery', 'event'];
const MILESTONE_STATUSES: readonly MilestoneStatus[] = ['upcoming', 'due', 'signed', 'slipped'];

// ═══════════════════════════════════════════════════════════════════════════
// snapshotToResolverInputs
// ═══════════════════════════════════════════════════════════════════════════

export interface ScheduleResolverInputs {
  phases: SchedulePhaseInput[];
  milestones: ScheduleMilestoneInput[];
}

/**
 * Reshapes a `schedule_revisions.phase_snapshots` value (jsonb, typed `unknown`
 * at this boundary) back into `resolveSchedule`'s pinned input shapes. TOTAL:
 * a non-array top level, or any malformed entry within it, degrades rather
 * than throwing —
 *   - `snapshot` not an array ⇒ `{ phases: [], milestones: [] }`.
 *   - a phase entry that isn't an object, or whose `id` isn't a string, is
 *     dropped (mirrors `resolveSchedule`'s own `phases.filter(p => p &&
 *     typeof p.id === 'string')` totality guard).
 *   - a milestone entry (nested under a valid phase's `milestones` array)
 *     that isn't an object, or whose `id` isn't a string, is dropped the
 *     same way. Its `phaseId` is NOT read off the milestone object (the
 *     snapshot doesn't carry one — milestones are embedded under their
 *     parent phase) — it is the enclosing phase's own `id`.
 *   - every other field is individually coerced to the resolver input's
 *     type, falling back to the resolver's safe default on a type mismatch
 *     (same defaults `mapPhaseRowToScheduleInput` / `mapMilestoneRowToScheduleInput`,
 *     packages/supabase/src/hooks/use-schedule.ts, use for a missing DB
 *     column) — never a thrown exception.
 */
export function snapshotToResolverInputs(snapshot: unknown): ScheduleResolverInputs {
  if (!Array.isArray(snapshot)) return { phases: [], milestones: [] };

  const phases: SchedulePhaseInput[] = [];
  const milestones: ScheduleMilestoneInput[] = [];

  for (const rawPhase of snapshot) {
    if (!isPlainObject(rawPhase) || typeof rawPhase.id !== 'string') continue;
    const phaseId = rawPhase.id;

    phases.push({
      id: phaseId,
      name: strOr(rawPhase.name, ''),
      durationDays: finiteNumOrNull(rawPhase.duration_days),
      durationWeeks: finiteNumOrNull(rawPhase.duration_weeks),
      followsPhaseId: strOrNull(rawPhase.follows_phase_id),
      anchorDate: strOrNull(rawPhase.anchor_date),
      lane: rawPhase.lane === 'thread' ? 'thread' : 'main',
      startDate: strOrNull(rawPhase.start_date),
      targetEndDate: strOrNull(rawPhase.target_end_date),
      sortOrder: intOr(rawPhase.sort_order, 0),
      status: narrow(rawPhase.status, PHASE_STATUSES, 'pending'),
    });

    const rawMilestones = Array.isArray(rawPhase.milestones) ? rawPhase.milestones : [];
    for (const rawMilestone of rawMilestones) {
      if (!isPlainObject(rawMilestone) || typeof rawMilestone.id !== 'string') continue;

      milestones.push({
        id: rawMilestone.id,
        phaseId,
        name: strOr(rawMilestone.name, ''),
        kind: narrow(rawMilestone.kind, MILESTONE_KINDS, 'event'),
        offsetDays: finiteNumOrNull(rawMilestone.offset_days),
        anchorDate: strOrNull(rawMilestone.anchor_date),
        status: narrow(rawMilestone.status, MILESTONE_STATUSES, 'upcoming'),
        sortOrder: intOr(rawMilestone.sort_order, 0),
      });
    }
  }

  return { phases, milestones };
}

// ═══════════════════════════════════════════════════════════════════════════
// baselineGhostDiff
// ═══════════════════════════════════════════════════════════════════════════

/** One phase's baseline vs current position — only emitted when they differ. */
export interface BaselinePhaseGhost {
  id: string;
  baselineStart: string | null;
  baselineEnd: string | null;
  currentStart: string | null;
  currentEnd: string | null;
}

/** One milestone's baseline vs current date — only emitted when they differ. */
export interface BaselineMilestoneGhost {
  id: string;
  baselineDate: string | null;
  currentDate: string | null;
}

export interface BaselineGhostDiff {
  phases: BaselinePhaseGhost[];
  milestones: BaselineMilestoneGhost[];
}

/**
 * Diffs a baseline's resolved schedule against the current one — the clay
 * ghost layer's source data (S5-3). Both arguments MUST come from the same
 * `resolveSchedule` (R100: "ONE engine") — this function does no date math of
 * its own, it only compares the two resolutions' output strings.
 *
 * Matched by id. Iterates the BASELINE's phases/milestones only, so:
 *   - a phase/milestone present in `current` but absent from `baseline` (added
 *     after the baseline was cut) is never visited — it has no baseline
 *     promise to ghost, so it is silently excluded, not "included with a null
 *     baseline."
 *   - a phase/milestone present in `baseline` but absent from `current`
 *     (deleted since) resolves its current side to `null`/`null` — included
 *     whenever that differs from the baseline's own dates (i.e. whenever the
 *     baseline actually had a date to lose; a baseline entry that itself
 *     resolved to `null`/`null` produces no diff either way).
 *   - a phase/milestone present in both is included only when at least one of
 *     its dates differs between the two resolutions.
 */
export function baselineGhostDiff(current: ResolvedSchedule, baseline: ResolvedSchedule): BaselineGhostDiff {
  const currentPhaseById = new Map(current.phases.map((p) => [p.id, p]));
  const phases: BaselinePhaseGhost[] = [];
  for (const baselinePhase of baseline.phases) {
    const currentPhase = currentPhaseById.get(baselinePhase.id);
    const currentStart = currentPhase ? currentPhase.start : null;
    const currentEnd = currentPhase ? currentPhase.end : null;
    if (currentStart !== baselinePhase.start || currentEnd !== baselinePhase.end) {
      phases.push({
        id: baselinePhase.id,
        baselineStart: baselinePhase.start,
        baselineEnd: baselinePhase.end,
        currentStart,
        currentEnd,
      });
    }
  }

  const currentMilestoneById = new Map(current.milestones.map((m) => [m.id, m]));
  const milestones: BaselineMilestoneGhost[] = [];
  for (const baselineMilestone of baseline.milestones) {
    const currentMilestone = currentMilestoneById.get(baselineMilestone.id);
    const currentDate = currentMilestone ? currentMilestone.date : null;
    if (currentDate !== baselineMilestone.date) {
      milestones.push({
        id: baselineMilestone.id,
        baselineDate: baselineMilestone.date,
        currentDate,
      });
    }
  }

  return { phases, milestones };
}
