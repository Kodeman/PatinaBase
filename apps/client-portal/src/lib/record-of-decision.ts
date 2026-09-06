import type { ProjectApprovalOutcome } from '@patina/supabase';

import { wholeNumberInWords } from '@/components/threshold/instruments/standing-sentence';

/* ── THE RECORD OF DECISION — the words on the keepsake ───────────────────────
   P-26. The sheet she keeps is a printed one, so everything on it has to read
   as prose rather than as a row out of a table: the consent method is a
   sentence, the released work is counted in words, and the checksum is a
   maker's mark at the plate's edge rather than a compliance string.

   NEVER THE IP ADDRESS. The signing routes record one
   (`/api/proposals/[id]/sign`, `/api/trade-scopes/[id]/accept` read
   `cf-connecting-ip`), and it is a fact about the evening she signed, not
   about the agreement. It has no place on a sheet that goes in a drawer, and
   no function here composes one — the omission is the rule, and the sheet's
   own test holds it.

   This module is pure: facts in, sentences out, no React and no clock, so the
   wording is testable without rendering a page.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * The vocabulary `client_decisions.client_consent_method` allows (00117, with
 * 00569's check constraint), plus the review leg's own spelling — which lives
 * on a different column (`review_method`) and reaches this sheet only if a
 * caller hands it over by mistake. Both say the same thing in prose.
 */
export type ConsentMethod =
  | 'electronic_signature'
  | 'click_through'
  | 'portal_clickthrough'
  | 'paper';

/**
 * How she agreed, said as a sentence.
 *
 * The raw token is a database word — `electronic_signature` on a keepsake is
 * the schema leaking onto paper. An unknown token says nothing at all rather
 * than printing itself: a record that cannot name the method honestly is a
 * record with one fewer line, not a record with a wrong one.
 */
export function consentSentence(
  method: ConsentMethod | string | null | undefined,
): string | null {
  switch (method) {
    case 'electronic_signature':
      return 'Signed electronically by typed name.';
    case 'click_through':
    case 'portal_clickthrough':
      return 'Confirmed by click-through.';
    case 'paper':
      return 'Signed on paper.';
    default:
      return null;
  }
}

/**
 * Which method an approval outcome was recorded under.
 *
 * Ruled 2026-09-05: only an Approve is signed — it writes the typed legal name
 * and `electronic_signature`. Return and Hold are a press and hold, which is a
 * click-through, and they record `click_through` (the schema's own word) and
 * never NULL. The projection does not carry the column, so the sheet reads the
 * outcome, which is the same fact from the other side.
 */
export function consentMethodForOutcome(
  outcome: ProjectApprovalOutcome | null | undefined,
): ConsentMethod | null {
  if (outcome === 'approved') return 'electronic_signature';
  if (outcome === 'changes_requested' || outcome === 'needs_discussion') {
    return 'click_through';
  }
  return null;
}

/** How many characters of the hash the record carries (R6). */
export const CHECKSUM_MARK_LENGTH = 12;

/**
 * The maker's mark: twelve characters of the artifact's checksum, lower case.
 *
 * R6 took the SHA-256 out of the email body and off the on-screen plate and
 * kept exactly this much of it, here, as provenance — the way a stamp on the
 * back of a chair is provenance. It is never presented as something she is
 * meant to check, and a hash too short to trim is not padded into looking
 * like one.
 */
export function checksumMark(checksum: string | null | undefined): string | null {
  const trimmed = checksum?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, CHECKSUM_MARK_LENGTH).toLowerCase();
}

/**
 * What the act let go, in words.
 *
 * The same grammar `_project_approval_release_sentence` speaks on the receipt
 * (00569), kept in step deliberately so the letter, the bell and the keepsake
 * cannot disagree about one act: a single piece is NAMED when its catalogue
 * name carries no comma — "Built-in shelving, north wall" is an ordinary one,
 * and two of those joined with "and" read as three things — and everything
 * else is counted in words.
 *
 * Null when the data supports no claim. A keepsake that says "It releases
 * nothing" about work it simply cannot see is a keepsake that lies quietly.
 */
export function releasedWorkSentence(
  names: readonly string[] | null | undefined,
): string | null {
  const pieces = (names ?? [])
    .map((name) => name?.trim())
    .filter((name): name is string => !!name);
  if (pieces.length === 0) return null;
  if (pieces.length === 1 && !pieces[0].includes(',')) {
    return `It releases ${pieces[0]}.`;
  }
  const counted = wholeNumberInWords(pieces.length);
  return pieces.length === 1
    ? `It releases ${counted} piece that was waiting on it.`
    : `It releases ${counted} pieces that were waiting on it.`;
}

/**
 * Which mark the KEEPSAKE presses.
 *
 * The doorstep's rule (`stampStateForApproval`) puts disposition ahead of
 * outcome, so a superseded edition never reads plainly RETURNED beside the
 * live one that replaced it. On paper that precedence is wrong: the sheet is
 * the record of HER act, and stamping SUPERSEDED over her typed name tells her
 * the answer she gave was undone — which it was not, and which P-27 forbids
 * the copy from ever implying. So here the outcome wins, and the supersession,
 * which is a fact about the edition rather than about her answer, becomes a
 * line of prose under the mark.
 *
 * Disposition still decides for a record with no outcome — a request the
 * studio withdrew before she answered has nothing else to say.
 */
export function recordStampStateForApproval(approval: {
  disposition: string;
  outcome: string | null;
}): RecordStampState {
  if (approval.outcome === 'approved') return 'approved';
  if (approval.outcome === 'changes_requested') return 'returned';
  if (approval.outcome === 'needs_discussion') return 'held';
  if (approval.disposition === 'withdrawn') return 'withdrawn';
  if (approval.disposition === 'superseded') return 'superseded';
  return 'awaiting';
}

/** The subset of the stamp vocabulary a Stage-2 record can print. */
export type RecordStampState =
  | 'approved'
  | 'returned'
  | 'held'
  | 'withdrawn'
  | 'superseded'
  | 'awaiting';

/**
 * The supersession, said as prose under her mark.
 *
 * Never "undone", never "reopened", never "no longer valid" (P-27): a later
 * edition exists, and that is the whole of the claim. The date is the day the
 * successor was issued, read off the successor's own row — the projection
 * carries no `supersededAt`, and a keepsake does not invent timing, so a
 * successor the read cannot see or date gets the sentence without a day.
 */
export function supersededNoteSentence(
  replacedOn: string | null | undefined,
): string {
  const day = replacedOn?.trim();
  return day
    ? `A later edition replaced this one on ${day}.`
    : 'A later edition has since replaced this one.';
}
