/**
 * THE EXPIRY NOTICE, IN WORDS (00630, direction §8 P2, PR-h).
 *
 * The nightly sweep (`sweep_compliance_expiries()`) writes one
 * `studio_compliance_notices` row per (document, state) and tells the studio's
 * owners and admins once. Three surfaces read those rows and say the same
 * sentence about them — the company card's Paper region, the roster row's held
 * clause, and the picker's mini row — so a lapse announces itself in one
 * wording wherever the studio meets it.
 *
 * ONE FORMULA, THREE CALL SITES. A paper WORD says where the paper stands; a
 * notice says the studio has already been told, and about what. The two are
 * different facts: a certificate can read `Lapses in 30 days` on the day it
 * crosses the line, before any sweep has run, and the clause must not claim
 * the studio was told when it was not.
 */

import type {
  ComplianceNotice,
  StudioComplianceDocument,
} from "@patina/supabase";
import { heldClausePaperNoun, rosterLongDate } from "./roster-derivation";

/**
 * ONE NOUN MAP, not a second one. `heldClausePaperNoun` (CR8-1) already turns
 * a `doc_type` into the plain word a studio says out loud — "insurance", not
 * the company card's "COI, general liability" column head — and a notice
 * clause naming the same certificate must name it the same way.
 */
export function noticePaperNoun(
  docType: string | null | undefined,
  fallback: string,
): string {
  return heldClausePaperNoun(docType, fallback);
}

export interface ExpiryNoticeClauseInput {
  /** Who holds the paper — the firm, or the sole proprietor. */
  holderName: string | null | undefined;
  /** The plain noun: "insurance", "licence". */
  paperNoun: string;
  /** `studio_compliance_documents.expires_on`. */
  expiresOn: string | null | undefined;
  /** The notice's own state, which is what decides the tense. */
  state: "lapses_soon" | "lapsed" | string;
}

/**
 * "Northgate Electric’s insurance lapses on 6 October 2026."
 * "Northgate Electric’s insurance lapsed 31 March 2026."
 *
 * M2R-1 — THE SENTENCE SAYS WHAT THE RECORD SAYS, AND NOTHING IT DOES NOT.
 *
 * This clause used to read "lapses in 30 days, on 6 October 2026", taking
 * direction §3.8's paper WORD ("Lapses in 30 days") and spelling it out beside
 * a real date. But `lapses_soon` is a 30-day WINDOW, not a 30-day distance —
 * `compliance-table.tsx` sets it for `expires - now <= 30 days`, and 00630
 * writes the notice once, on the night the paper enters the window — so the
 * two halves of one sentence disagreed for the whole window. Measured on the
 * shipped fixture: Lakeshore Painting Co.'s coi_gl expires 2026-10-06, 23 days
 * out, and the face read "lapses in 30 days, on 6 October 2026." An interval
 * beside a date is arithmetic, and arithmetic on a face has to be right; the
 * date alone is the fact the record holds. The state WORD stays a word
 * (`packages/types/src/studio-config.ts`) — a label may name a window, a
 * sentence carrying a date may not.
 */
export function expiryNoticeClause(input: ExpiryNoticeClauseInput): string {
  const owner = (input.holderName ?? "").trim();
  const possessive = owner ? `${owner}’s ` : "The ";
  const when = rosterLongDate(input.expiresOn);
  if (input.state === "lapsed") {
    return when
      ? `${possessive}${input.paperNoun} lapsed ${when}.`
      : `${possessive}${input.paperNoun} has lapsed.`;
  }
  return when
    ? `${possessive}${input.paperNoun} lapses on ${when}.`
    : `${possessive}${input.paperNoun} lapses soon.`;
}

/**
 * The clause a holder's paper earns, or null.
 *
 * Reads the NOTICES first: a document with no notice row is one the sweep has
 * not spoken about, and this sentence is the sweep's sentence. Where a holder
 * carries several noticed papers the worst one speaks — `lapsed` outranks
 * `lapses_soon`, then the soonest date.
 *
 * `holderName` MAY BE A RESOLVER (r10 MAJOR-2). A caller that asks about two
 * holders at once — a person's own card and their firm, which is what R-BA's
 * paper word reduces over — cannot name them both with one string, and naming
 * the firm for a licence the PERSON holds is r9 B-1 over again, on a face this
 * time. 00630:368-375 already branches the notification's holder name on
 * `holder_type`; a caller passing a function gets the same branch here. A
 * plain string still works and still means "this is the holder", which is what
 * the company card and the roster row each have.
 */
export function noticedPaperClause(
  holderIds: readonly (string | null | undefined)[],
  holderName:
    | string
    | null
    | undefined
    | ((doc: StudioComplianceDocument) => string | null | undefined),
  documents: readonly StudioComplianceDocument[] | undefined,
  notices: ReadonlyMap<string, ComplianceNotice>,
  docTypeLabels: Record<string, string>,
): string | null {
  const holders = new Set(holderIds.filter((id): id is string => !!id));
  if (holders.size === 0) return null;
  const candidates = (documents ?? [])
    .filter((doc) => holders.has(doc.holder_id))
    .map((doc) => ({ doc, notice: notices.get(doc.id) }))
    .filter(
      (
        pair,
      ): pair is { doc: StudioComplianceDocument; notice: ComplianceNotice } =>
        !!pair.notice,
    );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const rank = (state: string) => (state === "lapsed" ? 0 : 1);
    const byState = rank(a.notice.state) - rank(b.notice.state);
    if (byState !== 0) return byState;
    return (a.doc.expires_on ?? "").localeCompare(b.doc.expires_on ?? "");
  });
  const { doc, notice } = candidates[0];
  return expiryNoticeClause({
    holderName:
      typeof holderName === "function" ? holderName(doc) : holderName,
    paperNoun: noticePaperNoun(
      doc.doc_type,
      docTypeLabels[doc.doc_type] ?? doc.doc_label ?? doc.doc_type,
    ),
    expiresOn: doc.expires_on,
    state: notice.state,
  });
}
