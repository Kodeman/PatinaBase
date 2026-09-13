/**
 * THE CONTACT RULE, DERIVED ONCE (R-S · CR-5 · CR-6 · CR-14 · CR-22).
 *
 * Four faces print a contact rule — the Directory row, the roster row, the
 * person card and the company card's crew line — and until now each read
 * `contact_rule_summary()` (a mechanical clause list in raw `channel_kind`
 * tokens, with the studio's own typed sentence nowhere in it) and each decided
 * the hard block by running its own regex over that prose. Two regexes already
 * disagreed. R-S asks for ONE clause, everywhere.
 *
 * So this module is the single derivation, and it reads the RULE ROW:
 *
 *   · the clause  — the studio's `reason` when it typed one (SPEC §5.1 #8/#10);
 *                   otherwise the mechanical clauses in house words, never
 *                   `after_hours` or `ap_email` (SPEC §8 #3).
 *   · the block   — `channels_forbidden` leaves no channel open. NOT a regex,
 *                   and not "any forbidden channel": a rule that forbids text
 *                   and names email is a preference, not a wall.
 *   · the route   — `route_to_person_id`, resolved to a person AND a way to
 *                   reach them. R-L/C22: a routing instruction with no channel
 *                   attached sends the reader nowhere.
 */

import type {
  StudioContactChannel,
  StudioContactRule,
} from "@patina/supabase";
import type { ContactRouteTarget } from "@/components/document/people/contact-rule-line";

/** A rule row, indexed by the subject it sits on. */
export type ContactRuleIndex = ReadonlyMap<string, StudioContactRule>;

export function indexContactRules(
  rules: readonly StudioContactRule[] | undefined,
): ContactRuleIndex {
  const index = new Map<string, StudioContactRule>();
  for (const rule of rules ?? []) index.set(rule.subject_id, rule);
  return index;
}

/**
 * The house word for one channel, in SENTENCE voice.
 *
 * `CONTACT_CHANNEL_KIND_LABELS` is the COLUMN-HEAD voice ("After hours", "AP
 * email") and lower-casing it mangles the initialism, so the sentence keeps
 * its own list. `after_hours`, `ap_email` and `portal_311` are schema words and
 * must never reach a face (SPEC §8 #3).
 */
const CHANNEL_WORD: Record<string, string> = {
  sms: "text",
  mobile: "mobile",
  office: "office",
  dispatch: "dispatch",
  after_hours: "after hours",
  email: "email",
  ap_email: "AP email",
  portal_311: "the 311 portal",
};

export function contactChannelWord(token: string): string {
  return CHANNEL_WORD[token] ?? token.replace(/_/g, " ");
}

/**
 * TWO FACTS, NOT ONE (CR-4 / CR-16).
 *
 *  · A HARD BLOCK is a rule that FORBIDS A CHANNEL OUTRIGHT. It earns the 2px
 *    terracotta leading rule, and nothing else. SPEC §5.1 #11 names Ray Thao's
 *    row — `forbidden={sms}`, office and the 311 portal wide open — as carrying
 *    that rule, and SPEC §3's fixture marks F-15, F-26 and F-27 `block: true`.
 *    The narrower reading (a rule that leaves NO channel open) painted only
 *    Frank Bauer and contradicted the visual contract.
 *  · DO NOT CONTACT is the Channels-region STATE direction §5.4 describes:
 *    "`channels_forbidden` covers every channel", so the region collapses to
 *    one line and routes somewhere reachable. It also takes the person's own
 *    number off every row (SPEC §5.1 #10) — which a mere preference must not.
 *
 * Both answers are computed HERE, from `channels_forbidden`, so the Directory
 * row, the roster row, the person card, the company card's crew line and the
 * picker's mini row all read the same two facts (R-S / C29).
 */
export function contactRuleIsHardBlock(
  rule: StudioContactRule | null | undefined,
): boolean {
  return (rule?.channels_forbidden ?? []).length > 0;
}

/**
 * The four channels a studio actually reaches a PERSON on. `dispatch`,
 * `after_hours` and `ap_email` are a FIRM's lines and `portal_311` is a
 * municipal scheduling portal, so a rule bars nothing left by naming them — and
 * requiring them would mean a rule saying "no text, no email, no mobile, no
 * office" still read as reachable.
 */
const DIRECT_CONTACT_CHANNELS: readonly string[] = [
  "sms",
  "mobile",
  "office",
  "email",
];

/** Direction §5.4's "Do not contact" state: no direct channel left open. */
export function contactRuleIsDoNotContact(
  rule: StudioContactRule | null | undefined,
): boolean {
  const forbidden = rule?.channels_forbidden ?? [];
  if (forbidden.length === 0) return false;
  return DIRECT_CONTACT_CHANNELS.every((channel) =>
    forbidden.includes(channel),
  );
}

/** Ends a clause with a stop, without doubling one the studio already typed. */
function asSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * The clause the faces print. The studio's own sentence wins: the mechanical
 * list is the machine-readable half of the rule and prints only where the
 * studio wrote no sentence of its own.
 */
export function contactRuleClause(
  rule: StudioContactRule | null | undefined,
): string | null {
  if (!rule) return null;
  const clauses: string[] = [];
  const reason = rule.reason?.trim();
  if (reason) {
    clauses.push(asSentence(reason));
  } else {
    const forbidden = [...(rule.channels_forbidden ?? [])].sort();
    const allowed = [...(rule.channels_allowed ?? [])].sort();
    if (forbidden.includes("sms")) clauses.push("Never text.");
    const others = forbidden.filter((channel) => channel !== "sms");
    if (others.length > 0) {
      clauses.push(`Do not use: ${others.map(contactChannelWord).join(", ")}.`);
    }
    if (allowed.length > 0) {
      clauses.push(`Use: ${allowed.map(contactChannelWord).join(", ")}.`);
    }
  }
  const hours = rule.contact_hours?.trim();
  if (hours) clauses.push(`Hours: ${hours.replace(/\.+$/, "")}.`);
  return clauses.join(" ") || null;
}

/** What a face needs to know about the person a rule routes to. */
export interface RoutedPersonFacts {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

/**
 * The routed person AND a way to reach them. R-L names the typed `office`
 * channel, so that is read first and `studio_contacts.phone` is the fallback —
 * a card's phone column is whatever was typed into it first, which is not the
 * same fact.
 */
export function contactRouteTarget(
  rule: StudioContactRule | null | undefined,
  peopleById: ReadonlyMap<string, RoutedPersonFacts>,
  channelsByOwner?: ReadonlyMap<string, readonly StudioContactChannel[]>,
): ContactRouteTarget | null {
  const routedId = rule?.route_to_person_id;
  if (!routedId) return null;
  const person = peopleById.get(routedId);
  if (!person) return null;

  const channels = channelsByOwner?.get(routedId) ?? [];
  const live = channels.filter((channel) => channel.status === "active");
  const typedOffice = live.find((channel) => channel.channel_kind === "office");
  const typedEmail = live.find((channel) => channel.channel_kind === "email");

  return {
    name: person.name,
    email: typedEmail?.value ?? person.email ?? null,
    officePhone: typedOffice?.value ?? person.phone ?? null,
  };
}

/** Owner → their channels, for `contactRouteTarget`. */
export function indexChannelsByOwner(
  channels: readonly StudioContactChannel[] | undefined,
): ReadonlyMap<string, StudioContactChannel[]> {
  const index = new Map<string, StudioContactChannel[]>();
  for (const channel of channels ?? []) {
    const bucket = index.get(channel.owner_id);
    if (bucket) bucket.push(channel);
    else index.set(channel.owner_id, [channel]);
  }
  return index;
}
