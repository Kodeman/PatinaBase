// Pure, side-effect-free helpers for the proposal-nudge edge function.
// Extracted so the cadence branch can be unit-tested with `deno test` without
// a live DB — index.ts calls Deno.serve at module load and cannot be imported.

import { normalizeReminderCadence } from "../_shared/decision-notify.ts";

/**
 * Does this reader's nudge fold into the summary instead of mailing direct?
 *
 * 00572 renamed the cadences — `immediate → right_away`, `daily_digest →
 * daily` — and added `weekly_sunday`. This branch used to test the retired
 * spelling literally, which after the migration could never be true again:
 * every reader on a batching cadence would have gone back to direct nudge
 * mail, and the summary's proposal section (its only writer is this branch)
 * would have emptied (r1 B2).
 *
 * The test is therefore the cadence's SHAPE, not one of its spellings: every
 * cadence but "tell me right away" batches. A reader with no preferences row
 * at all keeps the direct letter she has always had — the column default only
 * governs rows that exist.
 */
export function nudgeRoutesToDigest(
  pref: { reminder_cadence?: string | null } | null | undefined,
): boolean {
  if (!pref) return false;
  return normalizeReminderCadence(pref.reminder_cadence) !== "right_away";
}
