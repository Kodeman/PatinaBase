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

import type { ChannelConsentRecord, ConsentSource } from "@patina/supabase";
import { formatSeatDate } from "./seat-line";

const GRANT_PHRASE: Record<ConsentSource, string> = {
  verbal: "Verbal consent",
  written: "Written consent",
  web_form: "Consent on a form",
  inbound_sms: "Consent by text",
  other: "Recorded consent",
};

const REFUSAL_PHRASE: Record<ConsentSource, string> = {
  verbal: "Opted out in person",
  written: "Opted out in writing",
  web_form: "Opted out on a form",
  inbound_sms: "Opted out by text",
  other: "Opted out",
};

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

/** The same sentence, read straight off a `studio_channel_consent` row. */
export function consentSentenceForRecord(
  record: ChannelConsentRecord | null | undefined,
  projectName?: string | null,
): string | null {
  if (!record) return null;
  return consentSentence({
    status: record.status,
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
