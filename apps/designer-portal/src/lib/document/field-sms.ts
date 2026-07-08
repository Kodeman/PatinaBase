/**
 * Field SMS derivation (Field Coordination Wave 5) — pure presentation logic
 * for the Desk triage card + the Post's field_sms branch. No React, no
 * design-system, no @patina/* runtime import beyond field-config labels (stays
 * off the help-system → @portabletext ESM trap, like margin/desk-derivation).
 *
 * The load-bearing piece is `describeFieldEffect`: it turns a parked parse
 * (parsed_intent, shaped like apply_field_effect's p_effect) into the sentence
 * the designer reads before Apply — "Move 'Rough-in plumbing' to Tue Jul 14".
 */

import type { FieldParsedIntent } from '@patina/supabase';

/** The effect kind a parse carries, tolerant of `type` or `intent` naming. */
export function fieldEffectType(parsed: FieldParsedIntent | null | undefined): string | null {
  if (!parsed) return null;
  return (parsed.type ?? parsed.intent ?? null) as string | null;
}

/** Format a bare `YYYY-MM-DD` as "Tue Jul 14" (LOCAL midnight — never slips a
 *  day in negative-offset zones, matching format.ts). */
export function fmtFieldDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/** Whether a parse is a date-bearing delay — the card offers a date editor. */
export function isDelayEffect(parsed: FieldParsedIntent | null | undefined): boolean {
  return fieldEffectType(parsed) === 'report_delay';
}

/**
 * The human sentence for a parked parse. `targetTitle` is the resolved task /
 * coordination-item name (from the review hook); falls back gracefully when the
 * parser didn't pin a target. Returns null only when there is nothing to say.
 */
export function describeFieldEffect(
  parsed: FieldParsedIntent | null | undefined,
  targetTitle: string | null | undefined,
): string | null {
  const type = fieldEffectType(parsed);
  if (!type) return null;
  const title = targetTitle?.trim() || null;
  const quoted = title ? `“${title}”` : 'it';
  const note = (parsed?.note ?? '').trim() || null;
  const date = fmtFieldDate(parsed?.new_date ?? null);

  switch (type) {
    case 'mark_done':
      return `Mark ${quoted} done`;
    case 'report_delay':
      return `Move ${quoted}${date ? ` to ${date}` : ''}`;
    case 'flag_blocker':
      return `Raise a blocker${note ? `: ${note}` : title ? ` on ${quoted}` : ''}`;
    case 'punch_report':
      return `Log a punch item${note ? `: ${note}` : ''}`;
    case 'confirm_delivery':
      return title ? `Confirm delivery — close ${quoted}` : 'Confirm a delivery';
    case 'note':
      return note ? `Note: ${note}` : 'Log a note';
    case 'question':
    case 'unclear':
      return 'Unclear — needs your read';
    default:
      return note ?? `Apply “${type}”`;
  }
}
