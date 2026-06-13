/**
 * Delivery-conflict detection — pure function, no side effects.
 *
 * Spec: `docs/handoffs/procurement-workspace-wave-2.1-architect-dossier.md` §2.
 *
 * Wave 2.1 architect decision: do this client-side (not in a Postgres view).
 * The data set for a 2-month calendar window is small (~60 rows for an active
 * designer), so the SQL self-joins would be brittle and untestable. A pure TS
 * helper is testable with jest and runs over the same `useDeliveryCalendar`
 * payload that already powers the grid.
 *
 * The function consumes the `DeliveryEvent[]` rows returned from the
 * `delivery_events` view (migration 00150) and emits a flat list of
 * `DeliveryConflict` objects. Three conflict shapes are detected:
 *
 *   - `overlap`       — two delivery_expected events for the same project
 *                       within OVERLAP_WINDOW_DAYS (7 days) of each other.
 *   - `late_arrival`  — a delivery_expected event whose event_date is AFTER
 *                       an install_milestone for the same project.
 *   - `drift`         — an install_milestone whose nearest delivery_expected
 *                       lands within DRIFT_BUFFER_DAYS (14) of the install,
 *                       i.e. the install is at risk because the delivery is
 *                       cutting it close to the install date.
 *
 * Conflicts are grouped per-project; we never compare events across projects.
 * The output is sorted by `eventA.event_date` ascending so the conflicts
 * panel in the Calendar view can render in chronological order.
 */
import type { DeliveryEvent } from '@patina/supabase';

// ─── Tuning knobs ───────────────────────────────────────────────────────────

/**
 * Two delivery_expected events for the same project within this window
 * are flagged as an overlap. PRD §8 references a "same week" overlap; we
 * widen to one week (7 days) so deliveries that arrive on adjacent calendar
 * weeks but only 4 days apart still surface.
 */
export const OVERLAP_WINDOW_DAYS = 7;

/**
 * An install_milestone whose nearest delivery_expected lands within this
 * many days is flagged as drift. PRD §8 cites "two weeks of storage" as the
 * implicit safe buffer between delivery and install at Middlewest Studio;
 * 14 days codifies that.
 */
export const DRIFT_BUFFER_DAYS = 14;

// ─── Public types ───────────────────────────────────────────────────────────

export type ConflictType = 'overlap' | 'late_arrival' | 'drift';

export interface DeliveryConflict {
  /** Discriminator for UI rendering (color, label, suggestion list). */
  type: ConflictType;
  /** project_id of both events (always equal — conflicts are per-project). */
  projectId: string;
  /** Display name of the project (denormalized for the panel rendering). */
  projectName: string;
  /** The earlier (or anchor) event in the pair. */
  eventA: DeliveryEvent;
  /** The later (or related) event in the pair. */
  eventB: DeliveryEvent;
  /** Human-readable description suitable for the conflict card body. */
  message: string;
  /** 2–3 resolution options the designer can consider. */
  suggestions: string[];
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Returns the absolute difference between two ISO YYYY-MM-DD dates in whole
 * calendar days. We use UTC parsing so DST shifts can't introduce off-by-one
 * errors when the strings cross a transition.
 *
 * Returns `null` if either input lacks a parseable date — callers should
 * treat null as "skip this pair."
 */
function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) return null;
  const diff = Math.abs(aMs - bMs);
  return Math.round(diff / (24 * 60 * 60 * 1000));
}

/**
 * `event_date` comparator that sorts nulls to the end. The view filter
 * already excludes rows without dates, but we belt-and-brace for safety so
 * a stray null can never trip a NaN comparison.
 */
function compareEventDate(a: DeliveryEvent, b: DeliveryEvent): number {
  if (a.event_date === b.event_date) return 0;
  if (!a.event_date) return 1;
  if (!b.event_date) return -1;
  return a.event_date < b.event_date ? -1 : 1;
}

/**
 * Short pretty-date for messages: "Jun 12, 2026". Falls back to the raw
 * string if parsing fails so the conflict card never blanks out.
 */
function formatEventDate(iso: string | null): string {
  if (!iso) return 'unknown date';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Short vendor label used inside messages. */
function vendorOrFallback(e: DeliveryEvent): string {
  return e.vendor_name ?? 'an unspecified vendor';
}

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Detect delivery conflicts within a delivery_events feed.
 *
 * Pure function. No I/O, no async, deterministic order.
 *
 * Algorithm (dossier §2):
 *
 *   1. Bucket events by `project_id`.
 *   2. For each bucket, sort by `event_date` ascending.
 *   3. Pass 1 (overlap):       O(n^2) pair scan of delivery_expected events;
 *                              if `daysBetween(a,b) <= OVERLAP_WINDOW_DAYS`,
 *                              emit one `overlap` conflict.
 *   4. Pass 2 (late_arrival):  for each delivery_expected D, walk all
 *                              install_milestones I; if D.event_date is AFTER
 *                              I.event_date, emit one `late_arrival` with
 *                              eventA=I and eventB=D.
 *   5. Pass 3 (drift):         for each install_milestone I, find the nearest
 *                              delivery_expected (by absolute days). If the
 *                              gap is ≤ DRIFT_BUFFER_DAYS AND the delivery is
 *                              not already late (filtered by Pass 2), emit
 *                              one `drift` with eventA=I and eventB=D.
 *
 * Output is sorted by `eventA.event_date` ascending for stable rendering.
 */
export function detectDeliveryConflicts(events: DeliveryEvent[]): DeliveryConflict[] {
  if (events.length === 0) return [];

  // ─── Bucket by project_id ───────────────────────────────────────────────
  const buckets = new Map<string, DeliveryEvent[]>();
  for (const e of events) {
    if (!e.event_date) continue; // a row without a date can't conflict
    const list = buckets.get(e.project_id);
    if (list) list.push(e);
    else buckets.set(e.project_id, [e]);
  }

  const conflicts: DeliveryConflict[] = [];

  for (const [, bucket] of buckets) {
    // Sort by date for deterministic pair ordering.
    const sorted = [...bucket].sort(compareEventDate);
    const deliveries = sorted.filter((e) => e.event_type === 'delivery_expected');
    const installs = sorted.filter((e) => e.event_type === 'install_milestone');

    // ── Pass 1: overlap ──────────────────────────────────────────────────
    for (let i = 0; i < deliveries.length; i++) {
      for (let j = i + 1; j < deliveries.length; j++) {
        const a = deliveries[i];
        const b = deliveries[j];
        const gap = daysBetween(a.event_date, b.event_date);
        if (gap === null) continue;
        if (gap > OVERLAP_WINDOW_DAYS) {
          // Pairs sort earliest-first; once we cross the window we can
          // safely stop scanning further forward for this anchor.
          break;
        }
        conflicts.push({
          type: 'overlap',
          projectId: a.project_id,
          projectName: a.project_name,
          eventA: a,
          eventB: b,
          message:
            `Two deliveries arriving within ${gap} day${gap === 1 ? '' : 's'}` +
            ` for ${a.project_name}: ${vendorOrFallback(a)} on ${formatEventDate(a.event_date)}` +
            ` and ${vendorOrFallback(b)} on ${formatEventDate(b.event_date)}.`,
          suggestions: [
            'Request a 1-week ship-delay from one vendor',
            'Stage one delivery in overflow storage',
            'Accept and plan a tight rotation',
          ],
        });
      }
    }

    // ── Pass 2: late_arrival ─────────────────────────────────────────────
    // Track delivery ids that are already late so Pass 3 doesn't double-flag
    // them as "drift" (the late_arrival message is more actionable).
    const lateDeliveryIds = new Set<string>();
    for (const inst of installs) {
      for (const del of deliveries) {
        if (!inst.event_date || !del.event_date) continue;
        if (del.event_date > inst.event_date) {
          lateDeliveryIds.add(del.event_id);
          const gap = daysBetween(inst.event_date, del.event_date);
          const gapText =
            gap !== null
              ? `${gap} day${gap === 1 ? '' : 's'} after`
              : 'after';
          conflicts.push({
            type: 'late_arrival',
            projectId: inst.project_id,
            projectName: inst.project_name,
            eventA: inst,
            eventB: del,
            message:
              `Delivery from ${vendorOrFallback(del)} on ${formatEventDate(del.event_date)}` +
              ` lands ${gapText} the install milestone on ${formatEventDate(inst.event_date)}` +
              ` for ${inst.project_name}.`,
            suggestions: [
              'Escalate with the vendor for an earlier ship date',
              'Push the install milestone back to absorb the slip',
              'Substitute an in-stock alternative to cover the install date',
            ],
          });
        }
      }
    }

    // ── Pass 3: drift ────────────────────────────────────────────────────
    // For each install, find the nearest non-late delivery by absolute days.
    for (const inst of installs) {
      if (!inst.event_date) continue;
      let nearest: { delivery: DeliveryEvent; gap: number } | null = null;
      for (const del of deliveries) {
        if (lateDeliveryIds.has(del.event_id)) continue;
        const gap = daysBetween(inst.event_date, del.event_date);
        if (gap === null) continue;
        if (!nearest || gap < nearest.gap) nearest = { delivery: del, gap };
      }
      if (nearest && nearest.gap <= DRIFT_BUFFER_DAYS) {
        const { delivery: del, gap } = nearest;
        conflicts.push({
          type: 'drift',
          projectId: inst.project_id,
          projectName: inst.project_name,
          eventA: inst,
          eventB: del,
          message:
            `Delivery from ${vendorOrFallback(del)} on ${formatEventDate(del.event_date)}` +
            ` is only ${gap} day${gap === 1 ? '' : 's'} from the install milestone` +
            ` on ${formatEventDate(inst.event_date)} for ${inst.project_name}.` +
            ` That leaves little buffer for inspection or staging.`,
          suggestions: [
            'Confirm tracking and request expedited shipping if needed',
            'Schedule an inspection slot immediately on arrival',
            'Pre-stage adjacent install tasks so the day flexes if delayed',
          ],
        });
      }
    }
  }

  // Final sort: chronological by eventA.event_date for stable rendering.
  conflicts.sort((x, y) => compareEventDate(x.eventA, y.eventA));
  return conflicts;
}

// ─── Install collisions (R28 — The Week's promoted intelligence) ─────────────
//
// The per-project passes above deliberately never compare across projects.
// The one cross-project shape a single designer can't absorb is two INSTALLS
// landing in the same week — she can't be in two homes at once. R28 promotes
// this onto the Desk as a need line ("Two installs collide — week of Jul 13");
// a calendar you must remember to check fails the action test.

export interface InstallCollision {
  /** Monday of the colliding week (ISO YYYY-MM-DD). */
  weekOf: string;
  /** The colliding install_milestone events (one per project, ≥2 projects). */
  events: DeliveryEvent[];
  projectIds: string[];
  /** "Two installs collide — week of Jul 13" (R28's exact grammar). */
  message: string;
}

/** Monday of the ISO date's week (Mon-start, matching date_trunc('week')). */
function mondayOf(iso: string): string | null {
  const ms = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function formatWeekOf(mondayIso: string): string {
  return new Date(`${mondayIso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const COUNT_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five'] as const;

/**
 * Detect cross-project install collisions: install_milestone events from
 * two or more DISTINCT projects landing in the same Mon-start week. Multiple
 * installs inside one project never collide (one home, one crew, one plan).
 * Pure function; output sorted by weekOf ascending.
 */
export function detectInstallCollisions(events: DeliveryEvent[]): InstallCollision[] {
  const byWeek = new Map<string, DeliveryEvent[]>();
  for (const e of events) {
    if (e.event_type !== 'install_milestone' || !e.event_date) continue;
    const week = mondayOf(e.event_date);
    if (!week) continue;
    const list = byWeek.get(week);
    if (list) list.push(e);
    else byWeek.set(week, [e]);
  }

  const collisions: InstallCollision[] = [];
  for (const [weekOf, weekEvents] of byWeek) {
    const projectIds = [...new Set(weekEvents.map((e) => e.project_id))];
    if (projectIds.length < 2) continue;
    const n = projectIds.length;
    collisions.push({
      weekOf,
      events: weekEvents,
      projectIds,
      message: `${COUNT_WORDS[n] ?? String(n)} installs collide — week of ${formatWeekOf(weekOf)}`,
    });
  }

  collisions.sort((a, b) => (a.weekOf < b.weekOf ? -1 : a.weekOf > b.weekOf ? 1 : 0));
  return collisions;
}
