/**
 * ONE CONSENT SENTENCE, EVERYWHERE (R-Q / C27).
 *
 * A fact recorded once reads the same wherever it surfaces; three phrasings
 * for one fact reads as three facts. The wording is fixed:
 *
 *    "<Source> consent, <d Mon yyyy>, on the <project>."
 *    "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen."
 *
 * Pure — no React, no I/O. The record supplies the facts; this supplies the
 * one sentence. A record with no date prints no sentence at all: a consent
 * word with a fabricated date is worse than a word standing alone.
 */

import type { ChannelConsentResolution, ConsentSource } from "@patina/supabase";
import { formatSeatDate } from "./seat-line";

/**
 * `kickoff_checkbox` is a source the ledger has held since 00650 but this file
 * had no words for, so a studio that ticked the kickoff box saw the `other`
 * fallback, "Recorded consent" — true, and vague about the one consent whose
 * provenance matters most, because it is the one a studio member recorded on the
 * homeowner's behalf. It is NOT in the `ConsentSource` union (use-consent.ts:35,
 * which this file does not own), so it is named here beside it: the union stays
 * the shape the hooks declare, and this table must still cover every member of
 * it or the compiler says so.
 */
type GrantSource = ConsentSource | "kickoff_checkbox";

const GRANT_PHRASE: Record<GrantSource, string> = {
  verbal: "Verbal consent",
  written: "Written consent",
  web_form: "Consent on a form",
  inbound_sms: "Consent by text",
  other: "Recorded consent",
  // Plain words for the ordinary thing that happened: the studio was with her,
  // showed her the disclosure, and ticked the box at kickoff.
  kickoff_checkbox: "Consent at kickoff",
};

// No kickoff entry, deliberately: 00650's own comment on the column records that
// `opt_out_source` never carries that value, because a kickoff box is never a
// refusal. A refusal arrives some other way, and says so.
const REFUSAL_PHRASE: Record<ConsentSource, string> = {
  verbal: "Opted out in person",
  written: "Opted out in writing",
  web_form: "Opted out on a form",
  inbound_sms: "Opted out by text",
  other: "Opted out",
};

// Takes the narrower table type, which `GRANT_PHRASE` satisfies by carrying one
// more key than it needs. The lookup is by whatever string the record holds, as
// it always was: the ledger's CHECK is the authority on that column's values,
// and an unknown one falls back rather than printing nothing.
function phraseFor(
  source: ConsentSource | string | null | undefined,
  table: Record<ConsentSource, string>,
  fallback: string,
): string {
  if (!source) return fallback;
  return table[source as ConsentSource] ?? fallback;
}

export interface ConsentSentenceFacts {
  status: string | null | undefined;
  source?: ConsentSource | string | null;
  optOutSource?: ConsentSource | string | null;
  consentedAt?: string | null;
  optOutAt?: string | null;
  /** The job the consent came from — "on the Okonkwo residence". */
  projectName?: string | null;
}

/** The sentence, or `null` where the record cannot say one honestly. */
export function consentSentence(facts: ConsentSentenceFacts): string | null {
  const refused = facts.status === "opted_out";
  const date = formatSeatDate(refused ? facts.optOutAt : facts.consentedAt);
  if (!date) return null;
  const phrase = refused
    ? phraseFor(facts.optOutSource, REFUSAL_PHRASE, "Opted out")
    : phraseFor(facts.source, GRANT_PHRASE, "Recorded consent");
  const where = facts.projectName ? `, on the ${facts.projectName}` : "";
  return `${phrase}, ${date}${where}.`;
}

/**
 * The same sentence, read off a resolved consent — THE VERDICT AND THE RECORD
 * TOGETHER (CR-2).
 *
 * ⚠ NEVER `record.status`. `channel_consent_status()` folds
 * `refusal_unanswered` into `opted_out` whatever the row's own `status` says
 * (00594:1062-1063), and 00594's own comment (:655-666) records that `granted`
 * rows carrying that flag are minted ON PURPOSE. Reading `status` here made
 * the word and the clause on the SAME LINE contradict each other: the
 * Directory row printed `Opted out` in terracotta beside "Written consent,
 * 2 May 2025, on the Lindqvist kitchen." The verdict is the only thing that
 * decides which half of the record the sentence reads, so the caller must hand
 * it over — `useChannelConsent`'s resolution, or the identity's own
 * `people_directory.consent_status` paired with the record behind it.
 */
export function consentSentenceForRecord(
  resolved:
    | Pick<ChannelConsentResolution, "verdict" | "record">
    | null
    | undefined,
  projectName?: string | null,
): string | null {
  const record = resolved?.record;
  if (!record) return null;
  return consentSentence({
    status: resolved?.verdict ?? null,
    source: record.source,
    optOutSource: record.opt_out_source,
    consentedAt: record.consented_at,
    optOutAt: record.opt_out_at,
    projectName,
  });
}

/**
 * A consent carried forward onto a new job keeps its origin and says where it
 * landed (SPEC §5.2 #4). Two sentences, never one run-on.
 */
export function carriedForwardSentence(
  projectName: string | null | undefined,
  onDate: string | null | undefined,
): string | null {
  const date = formatSeatDate(onDate);
  if (!projectName || !date) return null;
  return `Carried forward to the ${projectName}, ${date}.`;
}
