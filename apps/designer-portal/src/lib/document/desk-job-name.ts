/**
 * The name a job goes by on the Desk (US-28 S0, F7).
 *
 * A lead's `title` is the inquiry's subject ("Consultation"), so a new
 * inquiry landed on the Desk under a word that names no one. A lead takes the
 * person's name; every other job keeps its title. The summary still prints as
 * the line's sentence.
 */

import { householdDisplayName } from './act-names';
import type { DocumentStateRow } from './desk-derivation';

/** The view's own "we don't know the client" fallbacks (desk-derivation's
 *  ROLE_NOUNS, which it keeps module-private). Read off the LAST word, exactly
 *  as `folderTab` reads it: the seed's placeholder is `Client User`, and a
 *  whole-string test lets it through as if it were a family name. */
const PLACEHOLDER_CLIENT_NAMES: ReadonlySet<string> = new Set(['client', 'user']);

type NamedRow = Pick<DocumentStateRow, 'engagement_kind' | 'title' | 'client_name'>;

/** Who the job is for. M1 draws a PLACE here; `document_state` carries no
 *  location column, so the client's name stands in its position — the nearest
 *  true thing, and never a role noun standing in for a name we do not have. */
export function clientOf(row: Pick<DocumentStateRow, 'client_name'>, voice = false): string | null {
  // FR3 F3-13 (`one-voice`) — the seed's ` (no-login household)` never prints.
  const name = (voice ? householdDisplayName(row.client_name) : (row.client_name ?? '')).trim();
  if (!name) return null;
  const last = name.split(/\s+/).filter(Boolean).pop() ?? '';
  return PLACEHOLDER_CLIENT_NAMES.has(last.toLowerCase()) ? null : name;
}

/** F7 — a lead takes the person's name; every other job its title. */
export function deskJobName(row: NamedRow): string {
  if (row.engagement_kind !== 'lead') return row.title;
  return clientOf(row, true) ?? row.title;
}
