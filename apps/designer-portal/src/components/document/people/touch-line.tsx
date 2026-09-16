"use client";

/**
 * THE LAST TOUCH, IN PLAIN TEXT (E13, direction §7 P3).
 *
 * "The room can say who was told what, on which channel, and whether the
 *  person who said yes had the authority to."
 *
 * One line, on the History region of the person card and the company card. It
 * reads `studio_touches` — the record of what the rails ACTUALLY did — rather
 * than `people_directory.last_touch_at`, which is the rolodex's own
 * `COALESCE(last_contacted_at, last_project_at, updated_at)` (00626:1478) and
 * answers a coarser question. Where E13 holds nothing for this subject the
 * coarse date still prints, so the legacy population keeps the fact it had.
 *
 * NEVER A STATE WORD. An authority check is a FACT about a message — direction
 * §3.8 keeps facts as plain uncoloured text, the way authority itself prints
 * on a seat line. A failed check is not an error the studio caused and must
 * not wear an error's colour.
 *
 * PD-8: derived onto the card, never read to decide anything. Nothing in this
 * build gates on a touch.
 */

import {
  touchSentence,
  useLastTouch,
  type TouchSubjectType,
} from "@patina/supabase";

export function LastTouchLine({
  subjectIds,
  subjectType,
  fallback = null,
}: {
  /** Every subject this face answers for: the card, and its seats. */
  subjectIds: readonly string[];
  subjectType?: TouchSubjectType | null;
  /** What the region says where no touch is on the record — the coarse
   *  rolodex date, or nothing at all. */
  fallback?: string | null;
}) {
  const { data: touch } = useLastTouch(subjectIds, subjectType ?? null);
  if (!touch) {
    return fallback ? (
      <span data-last-touch-fallback>{fallback}</span>
    ) : null;
  }
  return <span data-last-touch>{touchSentence(touch)}</span>;
}
