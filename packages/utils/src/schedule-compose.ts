/**
 * The Document · Schedule — pure TS mirror of `copy_schedule_as_built`'s
 * as-built duration rule (migration 00324 §1d), used to preview a past
 * project's schedule before the RPC actually clones it onto a new proposal
 * or project (the past-project picker, Slice 03 §3/§4). Total,
 * dependency-free, React-free — no clock is needed, because the SQL rule
 * only ever compares two already-stored dates.
 *
 * SQL (`copy_schedule_as_built`, 00324):
 *   IF start_date IS NOT NULL
 *      AND COALESCE(completed_at::date, target_end_date) IS NOT NULL THEN
 *     duration := GREATEST(1, COALESCE(completed_at::date, target_end_date) - start_date)
 *   ELSE
 *     duration := COALESCE(duration_days, duration_weeks * 7, 14)
 *   END IF;
 *
 * This mirrors that exactly — actual elapsed days when the source phase
 * carries real dates, else the planned fallback — using `epochDayFromISO`
 * (the resolver's own day math, this package's `schedule.ts`) for the date
 * subtraction instead of a second date-math implementation (R100: one date
 * engine). `completedAt` may be a bare date or a full timestamp; only its
 * first 10 characters ('YYYY-MM-DD') are used, mirroring Postgres's
 * `::date` cast.
 */

import { epochDayFromISO } from './schedule';

export interface AsBuiltSourcePhase {
  name: string;
  phaseKey: string | null;
  startDate: string | null;
  completedAt: string | null; // timestamp or bare date; only the date portion is used
  targetEndDate: string | null;
  durationDays: number | null;
  durationWeeks: number | null;
  lane: 'main' | 'thread' | null;
  sortOrder: number;
}

export interface AsBuiltChainPhase {
  name: string;
  phaseKey: string | null;
  durationDays: number;
  lane: 'main' | 'thread';
}

/** First 10 characters of a timestamp/date string, or null. Mirrors Postgres `::date`. */
function dateOnly(s: string | null | undefined): string | null {
  if (typeof s !== 'string' || s.length < 10) return null;
  return s.slice(0, 10);
}

/**
 * `copy_schedule_as_built`'s per-phase duration rule, in TS. Phases are
 * sorted by `sortOrder` first (mirrors the RPC's `ORDER BY sort_order`) —
 * ties keep their relative input order (a stable sort). Total: malformed or
 * missing dates fall straight through to the planned fallback exactly as the
 * SQL `COALESCE` would; the "actual elapsed" branch is always `>= 1`
 * (`GREATEST(1, …)`), but the planned-fallback branch is NOT floored —
 * `duration_days`/`duration_weeks` can carry an unusual stored value (0 or
 * negative) straight through, exactly as `COALESCE` would.
 */
export function deriveAsBuiltChain(sourcePhases: readonly AsBuiltSourcePhase[]): AsBuiltChainPhase[] {
  if (!Array.isArray(sourcePhases)) return [];

  const ordered = sourcePhases
    .filter((p): p is AsBuiltSourcePhase => p != null && typeof p.name === 'string')
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return ordered.map((p) => {
    const startEpoch = epochDayFromISO(p.startDate);
    const endEpoch = epochDayFromISO(dateOnly(p.completedAt) ?? p.targetEndDate ?? null);

    let durationDays: number;
    if (startEpoch != null && endEpoch != null) {
      durationDays = Math.max(1, endEpoch - startEpoch);
    } else if (p.durationDays != null && Number.isFinite(p.durationDays)) {
      durationDays = p.durationDays;
    } else if (p.durationWeeks != null && Number.isFinite(p.durationWeeks)) {
      durationDays = p.durationWeeks * 7;
    } else {
      durationDays = 14;
    }

    return {
      name: p.name,
      phaseKey: p.phaseKey ?? null,
      durationDays,
      lane: p.lane === 'thread' ? 'thread' : 'main',
    };
  });
}
