"use client";

/**
 * REACH & ACCESS — one control, three fixed sections, in this order:
 * Channels, Contact rule, Access grants (direction §5.1). Never merged with
 * Documents or Authority, and never read per engagement: the channels, the
 * rule and the consent belong to the CARD, so every seat the person holds
 * reads the same truth (D-A, PR-b).
 *
 * The three rules this component exists to keep:
 *
 *  1. CONSENT IS ONE RECORD PER STUDIO PER CHANNEL VALUE, printed against the
 *     number with its source, its date and the job it came from — one wording
 *     everywhere (R-Q, `consentSentence`). A null record prints NOTHING; "Not
 *     asked" over a dated refusal is the fail-open word this program removed.
 *  2. A HELD CHANNEL IS NOT A DELETED ONE. A bounced email keeps its row on
 *     the `--rail` ground with a 2px `--terracotta-ink` leading rule and the
 *     reason in words. No dot, no badge, no opacity.
 *  3. A DO-NOT-CONTACT RULE COLLAPSES THE CHANNELS to one line and routes
 *     somewhere reachable — a name is not a channel (C7/C22).
 *
 * Every absent record prints its own sentence rather than dropping its region:
 * a region that vanishes reads as an oversight, a region that says "none on
 * file" reads as a fact (R-V / C32).
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ALL_CONTACT_CHANNEL_STATUSES,
  COMPANY_CHANNEL_KINDS,
  CONTACT_CHANNEL_KIND_LABELS,
  PERSON_CHANNEL_KINDS,
  isContactChannelHeld,
  useAccessGrants,
  useAddStudioContactChannel,
  useChannelConsent,
  useContactRule,
  useCreateFieldLink,
  useRecordChannelConsent,
  useRecordChannelReconsent,
  useSetContactRule,
  useSetStudioContactChannelStatus,
  useStudioContactChannels,
  fieldLinkUrl,
  type ContactChannelKind,
  type ContactChannelStatus,
  type ContactRuleChannel,
  type ConsentSource,
  type StudioContactChannel,
} from "@patina/supabase";
import { peopleEvents } from "@/lib/analytics/people-events";
import {
  contactRuleClause,
  contactRuleIsDoNotContact,
  contactRuleIsHardBlock,
} from "@/lib/document/contact-rule";
import { DocumentAction } from "../document-action";
import { StateWord } from "./state-word";
import { TelLink } from "./tel-link";
import { ContactRuleLine, type ContactRouteTarget } from "./contact-rule-line";
import { AccessGrantList } from "./access-grant-list";
import { consentSentenceForRecord } from "./consent-sentence";
import { formatLongDate } from "./people-format";
import { formatSeatDate } from "./seat-line";

export const REACH_EMPTY_SENTENCE =
  "Nothing on file yet. Add a phone or email to reach them.";
export const NO_RULE_SENTENCE = "No contact rule on file.";
export const NO_SEAT_SENTENCE = "No open seat on this project.";
export const MINT_WITHOUT_SEAT_SENTENCE =
  "A field link ends with a job, so this person needs a seat on one first.";

const PHONE_KINDS: ReadonlySet<string> = new Set([
  "mobile",
  "office",
  "dispatch",
  "after_hours",
]);

export function isPhoneChannel(kind: string): boolean {
  return PHONE_KINDS.has(kind);
}

/** Why a channel is held, in words (direction §5.4). */
export function heldChannelReason(channel: StudioContactChannel): string {
  const when = formatLongDate(channel.status_at?.slice(0, 10));
  const dated = when ? `, ${when}` : "";
  switch (channel.status) {
    case "bounced":
      return `This address bounced back${dated}. Texts and calls still reach them.`;
    case "unsubscribed":
      return `They unsubscribed${dated}. Calls still reach them.`;
    case "dead":
      return `This line is dead${dated}.`;
    default:
      return `This line is held${dated}.`;
  }
}

/** "Mobile · (612) 555-0111 · preferred · verified 12 Oct 2026" */
export function channelRowParts(channel: StudioContactChannel): string[] {
  const parts: string[] = [
    CONTACT_CHANNEL_KIND_LABELS[channel.channel_kind as ContactChannelKind] ??
      String(channel.channel_kind),
  ];
  if (channel.preferred) parts.push("preferred");
  const verified = formatSeatDate(channel.verified_at?.slice(0, 10));
  if (channel.verified && verified) parts.push(`verified ${verified}`);
  return parts;
}

/**
 * CR3-4 — THE HELD STATES, IN THE STUDIO'S OWN WORDS.
 *
 * Direction §5.1 defines the four channel statuses the room MOVES; nothing
 * anywhere could move one, so a bounced address could never be marked bounced.
 * `status` is a schema word and never reaches a face (SPEC §8 #3) — these are
 * the words the control offers.
 */
const CHANNEL_STATUS_WORDS: Record<ContactChannelStatus, string> = {
  active: "In use",
  bounced: "It bounces",
  unsubscribed: "They unsubscribed",
  dead: "The line is dead",
};

const CONSENT_SOURCES: Array<[ConsentSource, string]> = [
  ["verbal", "Verbal agreement"],
  ["written", "Written agreement"],
  ["web_form", "Website or form"],
  ["other", "Other documented consent"],
];

const FIELD_LABEL = "t-head mb-1 block text-[var(--ink-subtle)]";
const FIELD_INPUT =
  "w-full rounded-[2px] border border-[var(--hairline-strong)] border-b-[var(--ink-faint)] bg-[var(--paper-doc)] p-3 text-[16px] leading-[1.55] text-[var(--ink)]";

function ChannelRow({
  channel,
  organizationId,
  projectName,
  originProjectId,
  showConsent,
  onAnnounce,
}: {
  channel: StudioContactChannel;
  organizationId: string | null;
  projectName: string | null;
  originProjectId: string | null;
  /**
   * SPEC §5.3 #9: A FIRM HAS NEITHER CONSENT NOR REACH. A company cannot agree
   * to a text message, so the company variant of this region prints the firm's
   * office / dispatch / AP lines and nothing about consent.
   */
  showConsent: boolean;
  onAnnounce: (message: string) => void;
}) {
  const consentKind = isPhoneChannel(String(channel.channel_kind))
    ? "sms"
    : "email";
  const { data: consent } = useChannelConsent(
    showConsent ? organizationId : null,
    consentKind,
    channel.value,
  );
  const record = useRecordChannelConsent();
  // CR-25: the way back from a refusal is "a fresh recorded consent with
  // source and evidence, OR an inbound START" (direction §5.2). PR-m exists so
  // a studio that heard a verbal stop can write it down — and, symmetrically,
  // write down the verbal restart. `record_channel_consent` REFUSES a grant
  // over a standing opt-out, and the room rendered that refusal as "Only they
  // can rejoin by replying START", which hands the studio's own door to the
  // recipient. `record_channel_reconsent` is that door.
  const reconsent = useRecordChannelReconsent();
  // CR3-4: the room can move a channel's status. Until this, `status` could
  // only ever be written by a migration.
  const setStatus = useSetStudioContactChannelStatus();
  const [recording, setRecording] = useState(false);
  const [source, setSource] = useState<ConsentSource | "">("");
  const [evidence, setEvidence] = useState("");
  const [optOut, setOptOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const [statusDraft, setStatusDraft] = useState<ContactChannelStatus>(
    (channel.status as ContactChannelStatus) ?? "active",
  );
  const [statusError, setStatusError] = useState<string | null>(null);
  const bandId = useId();
  const statusBandId = useId();
  const held = isContactChannelHeld(channel.status);
  const sentence = consentSentenceForRecord(consent?.record, projectName);

  const saveStatus = () => {
    setStatusError(null);
    setStatus.mutate(
      { id: channel.id, ownerId: channel.owner_id, status: statusDraft },
      {
        onSuccess: () => {
          setHolding(false);
          onAnnounce(
            statusDraft === "active"
              ? `${channel.value} is back in use.`
              : `${channel.value} is held: ${CHANNEL_STATUS_WORDS[statusDraft].toLowerCase()}.`,
          );
        },
        onError: (e: unknown) =>
          setStatusError(
            e instanceof Error ? e.message : "Could not change that just now.",
          ),
      },
    );
  };

  const save = () => {
    setError(null);
    if (!organizationId) {
      setError(
        "This project is not attached to a studio yet, so there is nowhere to record it.",
      );
      return;
    }
    if (!source || !evidence.trim()) {
      setError(
        "Record how and where they agreed before this goes on the books.",
      );
      return;
    }
    const status = optOut ? "opted_out" : "granted";
    const refused = consent?.verdict === "opted_out";
    const handlers = {
        onSuccess: () => {
          setRecording(false);
          setSource("");
          setEvidence("");
          setOptOut(false);
          peopleEvents.consentRecorded({
            channel_kind: consentKind,
            status,
            source,
            surface: "person_card",
            manual_opt_out: optOut,
          });
          onAnnounce(
            optOut
              ? `${channel.value} is marked opted out.`
              : `${channel.value} is on the books.`,
          );
        },
        onError: (e: unknown) =>
          setError(
            e instanceof Error ? e.message : "Could not record that just now.",
          ),
    };

    // A grant over a standing refusal is a RECONSENT, not a consent: a
    // different RPC, which keeps the prior refusal as history rather than
    // erasing it.
    if (refused && !optOut) {
      reconsent.mutate(
        {
          organizationId,
          channelKind: consentKind,
          channelValue: channel.value,
          source,
          evidence: evidence.trim(),
          disclosureVersion: "field-sms-v1",
          originProjectId,
        },
        handlers,
      );
      return;
    }

    record.mutate(
      {
        organizationId,
        channelKind: consentKind,
        channelValue: channel.value,
        status,
        source,
        evidence: evidence.trim(),
        disclosureVersion: "field-sms-v1",
        originProjectId,
      },
      handlers,
    );
  };

  return (
    <li
      data-reach-channel={channel.id}
      data-reach-channel-held={held ? "true" : undefined}
      className={`border-t border-[var(--hairline)] py-3 ${
        held
          ? "border-l-2 border-l-[var(--terracotta-ink)] bg-[var(--rail)] pl-[11px]"
          : ""
      }`}
    >
      <p className="t-body-sm flex flex-wrap items-center gap-x-2 text-[var(--ink)]">
        <span>{channelRowParts(channel).join(" · ")}</span>
        {isPhoneChannel(String(channel.channel_kind)) ? (
          <TelLink phone={channel.value} />
        ) : (
          <a
            href={`mailto:${channel.value}`}
            className="underline decoration-[var(--color-clay)] underline-offset-[3px]"
          >
            {channel.value}
          </a>
        )}
        {showConsent && (
          <StateWord family="consent" value={consent?.verdict} />
        )}
      </p>
      {held && (
        <p className="t-body-sm mt-1 text-[var(--ink)]">
          {heldChannelReason(channel)}
        </p>
      )}
      {/* CR3-4: direction §5.1's held states are states the ROOM moves. */}
      <DocumentAction
        actionKey="hold-channel"
        surfaceKey="people"
        regionKey="reach-channels"
        variant="tertiary"
        aria-expanded={holding}
        aria-controls={statusBandId}
        onClick={() => {
          setStatusDraft((channel.status as ContactChannelStatus) ?? "active");
          setHolding((open) => !open);
        }}
      >
        {held ? "Put this line back in use" : "Hold this line"}
      </DocumentAction>
      <div id={statusBandId} hidden={!holding} className="mt-2">
        <label className={FIELD_LABEL} htmlFor={`${statusBandId}-status`}>
          What is true of this line
        </label>
        <select
          id={`${statusBandId}-status`}
          value={statusDraft}
          onChange={(e) =>
            setStatusDraft(e.target.value as ContactChannelStatus)
          }
          className={`${FIELD_INPUT} mb-2`}
        >
          {ALL_CONTACT_CHANNEL_STATUSES.map((value) => (
            <option key={value} value={value}>
              {CHANNEL_STATUS_WORDS[value]}
            </option>
          ))}
        </select>
        <DocumentAction
          actionKey="save-channel-status"
          surfaceKey="people"
          regionKey="reach-channels"
          variant="secondary"
          loading={setStatus.isPending}
          loadingLabel="Writing…"
          onClick={saveStatus}
        >
          Write it down
        </DocumentAction>
        {statusError && (
          <p role="alert" className="t-body-sm mt-1 text-[var(--terracotta-ink)]">
            {statusError}
          </p>
        )}
      </div>
      {showConsent && sentence && (
        <p
          data-consent-sentence
          className="t-body-sm mt-1 text-[var(--ink-subtle)]"
        >
          {sentence}
        </p>
      )}
      {showConsent && (
        <DocumentAction
          actionKey="record-channel-consent"
          surfaceKey="people"
          regionKey="reach-channels"
          variant="tertiary"
          aria-expanded={recording}
          aria-controls={bandId}
          onClick={() => setRecording((open) => !open)}
        >
          {consent?.verdict === "opted_out"
            ? "Record a fresh consent"
            : "Record consent"}
        </DocumentAction>
      )}
      {showConsent && consent?.verdict === "opted_out" && (
        <p className="t-body-sm mt-1 text-[var(--ink-subtle)]">
          They can rejoin by replying START — or the studio can record a fresh
          consent here, with where and when they said so.
        </p>
      )}
      <div id={bandId} hidden={!showConsent || !recording} className="mt-2">
        <label className={FIELD_LABEL} htmlFor={`${bandId}-source`}>
          How consent was given
        </label>
        <select
          id={`${bandId}-source`}
          value={source}
          onChange={(e) => setSource(e.target.value as ConsentSource | "")}
          className={`${FIELD_INPUT} mb-3`}
        >
          <option value="">Choose a method…</option>
          {CONSENT_SOURCES.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <label className={FIELD_LABEL} htmlFor={`${bandId}-evidence`}>
          Where and when they agreed
        </label>
        <textarea
          id={`${bandId}-evidence`}
          rows={3}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          className={`${FIELD_INPUT} mb-2 resize-none`}
        />
        <label className="t-body-sm flex min-h-11 items-center gap-2 text-[var(--ink)]">
          <input
            type="checkbox"
            checked={optOut}
            onChange={(e) => setOptOut(e.target.checked)}
          />
          They told the studio to stop
        </label>
        <DocumentAction
          actionKey="save-channel-consent"
          surfaceKey="people"
          regionKey="reach-channels"
          variant="secondary"
          loading={record.isPending}
          loadingLabel="Recording…"
          onClick={save}
        >
          Put it on the books
        </DocumentAction>
        {error && (
          <p
            role="alert"
            className="t-body-sm mt-1 text-[var(--terracotta-ink)]"
          >
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

export interface ReachAccessProps {
  /** The `studio_contacts` card this reach belongs to. */
  cardId: string | null;
  cardKind: "person" | "company";
  organizationId: string | null;
  /** The seat a field link would end with, when the person holds one. */
  seatId?: string | null;
  seatProjectId?: string | null;
  seatProjectName?: string | null;
  /** PR-d / PR-l: the window the door closes with, and the second option. */
  seatWindowEnd?: string | null;
  warrantyEnd?: string | null;
  /** Who the rule may route to — the studio's other cards, by name. */
  routeCandidates?: ReadonlyArray<{ id: string; name: string }>;
  /** The routed person's own channel, resolved by the caller (R-L). */
  routeTo?: ContactRouteTarget | null;
  /**
   * CR-2: the subjects `v_access_grants` actually keys on. `subject_id` is an
   * ENGAGEMENT id (field_link) or a PROFILE id (client_account, studio_member)
   * — never a rolodex card id — so asking the view for the card id matched
   * nothing for every person alive and the region always read "No grant on
   * file." beside a reach word that already said `Field link`. The caller
   * resolves the identity's seats and profile and hands them over.
   */
  grantSubjectIds?: readonly string[] | null;
  onAnnounce: (message: string) => void;
  now: Date;
}

/**
 * "This opens the Call Sheet and the site access card to <name> until the
 * job's window closes, <date>. It never opens billing or the agreement."
 */
export function mintConsequenceSentence(
  name: string,
  windowEnd: string | null | undefined,
): string {
  const date = formatLongDate(windowEnd?.slice(0, 10));
  const until = date
    ? `until the job's window closes, ${date}`
    : "until the job's window closes";
  return `This opens the Call Sheet and the site access card to ${name} ${until}. It never opens billing or the agreement.`;
}

/**
 * CR3-6 — THE DATE THE DOOR WILL ACTUALLY CARRY.
 *
 * `create_field_link(uuid, timestamptz)` (00627) does NOT take the caller's
 * date when the seat has a live window. It computes
 * `max(on_site_to, warranty_until)` and takes that whenever it is still ahead,
 * falling through to `p_expires_at` only when there is no live window at all,
 * and to ninety days when there is neither. PR-l's two radios therefore chose
 * nothing: on a seat whose warranty outlives its window, "Ends with the job"
 * still minted to the warranty end, the consequence sentence above the act
 * named a date the token did not carry, and `peopleEvents.grantMinted` recorded
 * a choice that never reached the database.
 *
 * So the room states the one date the RPC will use rather than offering a
 * choice it cannot honour. Restoring the choice is a W3 migration — let
 * `p_expires_at` outrank the window when it is supplied — not a second guess
 * on this side of the wire.
 */
export function grantWindowEnd(
  seatWindowEnd: string | null | undefined,
  warrantyEnd: string | null | undefined,
  now: Date,
): string | null {
  const days = [seatWindowEnd, warrantyEnd]
    .map((value) => value?.slice(0, 10))
    .filter((value): value is string => !!value);
  if (days.length === 0) return null;
  const latest = days.sort()[days.length - 1];
  // The RPC reads a window through the END of its last day, and a window that
  // has already closed is the same fact as no window at all.
  const closesAt = new Date(`${latest}T00:00:00Z`);
  closesAt.setUTCDate(closesAt.getUTCDate() + 1);
  return closesAt.getTime() > now.getTime() ? latest : null;
}

/** What the act says when the RPC will fall through to its ninety-day term. */
export const MINT_FALLBACK_SENTENCE =
  "This seat carries no window, so the door runs ninety days from today and " +
  "renews when they use it. It never opens billing or the agreement.";

export function ReachAccess({
  cardId,
  cardKind,
  organizationId,
  seatId,
  seatProjectId,
  seatProjectName,
  seatWindowEnd,
  warrantyEnd,
  routeCandidates,
  routeTo,
  grantSubjectIds,
  onAnnounce,
  now,
  personName,
}: ReachAccessProps & { personName: string }) {
  const isPerson = cardKind === "person";
  const { data: channels } = useStudioContactChannels(cardId);
  const { data: rule } = useContactRule(cardKind, cardId);
  const grantSubjects = useMemo(
    () => [...new Set((grantSubjectIds ?? []).filter(Boolean))],
    [grantSubjectIds],
  );
  const { data: grants } = useAccessGrants({ subjectIds: grantSubjects });
  const setRule = useSetContactRule();
  const createLink = useCreateFieldLink();
  // CR3-4: direction §3.2 R2 names "Add a channel" as one of the card's four
  // controls. `useAddStudioContactChannel` had exactly one call site — the Add
  // sheet — so a phone or an email could only ever be written at the moment a
  // seat was created, and the region's own "Add a phone or email to reach them."
  // named an act that did not exist.
  const addChannel = useAddStudioContactChannel();
  const channelKinds = isPerson ? PERSON_CHANNEL_KINDS : COMPANY_CHANNEL_KINDS;
  const [addingChannel, setAddingChannel] = useState(false);
  const [channelKind, setChannelKind] = useState<ContactChannelKind>(
    channelKinds[0],
  );
  const [channelValue, setChannelValue] = useState("");
  const [channelPreferred, setChannelPreferred] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const channelBandId = useId();

  const [editingRule, setEditingRule] = useState(false);
  const [ruleReason, setRuleReason] = useState("");
  const [forbidSms, setForbidSms] = useState(false);
  const [forbidEmail, setForbidEmail] = useState(false);
  const [routeId, setRouteId] = useState("");
  const [ruleError, setRuleError] = useState<string | null>(null);
  /**
   * CR-3: the channels the two checkboxes DO NOT speak for. Frank Bauer's rule
   * forbids seven channels; the editor offers two. Saving used to send only
   * what the checkboxes knew about, so the other five were dropped on the way
   * out — a full-row upsert erasing facts nothing on this screen ever showed.
   */
  const [otherForbidden, setOtherForbidden] = useState<readonly string[]>([]);
  const [mintedUrl, setMintedUrl] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const ruleBandId = useId();
  const mintBandId = useId();
  const mintReasonId = useId();

  /**
   * QA-R2-4 / CR-5: the ONE clause composer, in `lib/document/contact-rule.ts`.
   * This component used to build its own — unconditionally prepending the raw
   * mechanical channel list ahead of the studio's typed reason, through a label
   * map with no `sms` key, so Frank Bauer's card read "Never mobile, office,
   * dispatch, after hours, email, ap email, sms. No direct contact, at his
   * request…" and Ray Thao's read "Never sms." The studio's own sentence wins,
   * and no schema word reaches a face (SPEC §8 #3).
   */
  const ruleSummary = useMemo(() => {
    const clause = contactRuleClause(rule);
    if (!clause) return null;
    // The card is the rule's home (direction §3.2 R3), so it alone stamps when
    // the rule was set.
    const setOn = formatSeatDate(rule?.set_at?.slice(0, 10));
    return setOn ? `${clause} Set ${setOn}.` : clause;
  }, [rule]);
  const ruleBlocks = contactRuleIsHardBlock(rule);
  const doNotContact = contactRuleIsDoNotContact(rule);

  /**
   * CR-3: SEED THE EDITOR FROM THE RULE IT EDITS.
   *
   * The four fields were declared empty and never read the loaded rule, and
   * `useSetContactRule` is a full-row upsert — so "Edit the rule" → "Save the
   * rule", two clicks and no typing, wrote `channels_allowed = {}`,
   * `channels_forbidden = {}`, `route_to_person_id = NULL`, `reason = NULL`
   * over Frank Bauer's seeded do-not-contact instruction. Seeded once per
   * opening (keyed on the rule's own id) so a background refetch can never
   * clobber what the studio is typing.
   */
  const seededRuleRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editingRule) {
      seededRuleRef.current = null;
      return;
    }
    const key = rule?.id ?? "none";
    if (seededRuleRef.current === key) return;
    seededRuleRef.current = key;
    const forbidden = rule?.channels_forbidden ?? [];
    setForbidSms(forbidden.includes("sms"));
    setForbidEmail(forbidden.includes("email"));
    setOtherForbidden(
      forbidden.filter((channel) => channel !== "sms" && channel !== "email"),
    );
    setRouteId(rule?.route_to_person_id ?? "");
    setRuleReason(rule?.reason ?? "");
  }, [editingRule, rule]);

  // CR3-6: the date the RPC will land on, not a date the room would like.
  const expiresAt = grantWindowEnd(seatWindowEnd, warrantyEnd, now);

  const mint = () => {
    setMintError(null);
    if (!seatId) {
      setMintError(MINT_WITHOUT_SEAT_SENTENCE);
      return;
    }
    createLink.mutate(
      {
        partyId: seatId,
        projectId: seatProjectId ?? undefined,
        expiresAt: expiresAt
          ? `${expiresAt.slice(0, 10)}T23:59:59Z`
          : undefined,
      },
      {
        onSuccess: (minted) => {
          // The raw token is shown ONCE, at mint (00283) — Patina never holds
          // a readable copy of it afterwards.
          setMintedUrl(fieldLinkUrl(minted.token));
          peopleEvents.grantMinted({
            tier: "field_link",
            // The seat's window IS the expiry whenever there is one; there is
            // no third source the RPC can be made to take from here.
            expiry_source: expiresAt ? "engagement_window" : "fallback_90_day",
          });
          onAnnounce(`A field link is open for ${personName}.`);
        },
        onError: (e) =>
          setMintError(
            e instanceof Error
              ? e.message
              : "Could not open that door just now.",
          ),
      },
    );
  };

  const saveChannel = () => {
    setChannelError(null);
    if (!cardId) return;
    const value = channelValue.trim();
    if (!value) {
      setChannelError("Write the number or the address first.");
      return;
    }
    addChannel.mutate(
      {
        ownerType: cardKind,
        ownerId: cardId,
        channelKind,
        value,
        preferred: channelPreferred,
        smsCapable: channelKind === "mobile",
      },
      {
        onSuccess: () => {
          setAddingChannel(false);
          setChannelValue("");
          setChannelPreferred(false);
          onAnnounce(`${value} is on ${personName}'s card.`);
        },
        onError: (e: unknown) =>
          setChannelError(
            e instanceof Error ? e.message : "Could not add that just now.",
          ),
      },
    );
  };

  const saveRule = () => {
    setRuleError(null);
    if (!cardId) return;
    setRule.mutate(
      {
        subjectType: cardKind,
        subjectId: cardId,
        // CR-3: the upsert replaces the whole row, so every column this editor
        // does not own is sent back as it stands.
        channelsAllowed: (rule?.channels_allowed ??
          []) as ContactRuleChannel[],
        channelsForbidden: [
          ...otherForbidden,
          ...(forbidSms ? ["sms"] : []),
          ...(forbidEmail ? ["email"] : []),
        ] as ContactRuleChannel[],
        contactHours: rule?.contact_hours ?? null,
        escalationByClass: rule?.escalation_by_class ?? {},
        routeToPersonId: routeId || null,
        reason: ruleReason.trim() || null,
      },
      {
        onSuccess: () => {
          setEditingRule(false);
          onAnnounce(`The contact rule for ${personName} is saved.`);
        },
        onError: (e) =>
          setRuleError(
            e instanceof Error
              ? e.message
              : "Could not save that rule just now.",
          ),
      },
    );
  };

  return (
    <section data-reach-access className="py-6">
      <h3 className="t-head mb-3 text-[var(--ink-subtle)]">Channels</h3>
      {doNotContact ? (
        <ContactRuleLine
          summary="Do not contact directly."
          blocked
          routeTo={routeTo ?? null}
        />
      ) : !channels || channels.length === 0 ? (
        <p className="t-body-sm text-[var(--ink-subtle)]">
          {REACH_EMPTY_SENTENCE}
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {channels.map((channel) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              organizationId={organizationId}
              projectName={seatProjectName ?? null}
              originProjectId={seatProjectId ?? null}
              showConsent={isPerson}
              onAnnounce={onAnnounce}
            />
          ))}
        </ul>
      )}

      {/* CR3-4 — the act the empty sentence above has always named. Hidden
          under a do-not-contact rule: that region collapses to one line and
          routes elsewhere (direction §5.4), and offering a new channel there
          would contradict it. */}
      {!doNotContact && (
        <>
          <DocumentAction
            actionKey="add-channel"
            surfaceKey="people"
            regionKey="reach-channels"
            variant="tertiary"
            aria-expanded={addingChannel}
            aria-controls={channelBandId}
            onClick={() => setAddingChannel((open) => !open)}
          >
            Add a channel
          </DocumentAction>
          <div id={channelBandId} hidden={!addingChannel} className="mt-2">
            <label className={FIELD_LABEL} htmlFor={`${channelBandId}-kind`}>
              Which line
            </label>
            <select
              id={`${channelBandId}-kind`}
              value={channelKind}
              onChange={(e) =>
                setChannelKind(e.target.value as ContactChannelKind)
              }
              className={`${FIELD_INPUT} mb-3`}
            >
              {channelKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {CONTACT_CHANNEL_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            <label className={FIELD_LABEL} htmlFor={`${channelBandId}-value`}>
              The number or address
            </label>
            <input
              id={`${channelBandId}-value`}
              type="text"
              value={channelValue}
              onChange={(e) => setChannelValue(e.target.value)}
              className={`${FIELD_INPUT} mb-2`}
            />
            <label className="t-body-sm flex min-h-11 items-center gap-2 text-[var(--ink)]">
              <input
                type="checkbox"
                checked={channelPreferred}
                onChange={(e) => setChannelPreferred(e.target.checked)}
              />
              Reach them here first
            </label>
            <DocumentAction
              actionKey="save-channel"
              surfaceKey="people"
              regionKey="reach-channels"
              variant="secondary"
              loading={addChannel.isPending}
              loadingLabel="Writing…"
              onClick={saveChannel}
            >
              Put it on the card
            </DocumentAction>
            {channelError && (
              <p
                role="alert"
                className="t-body-sm mt-1 text-[var(--terracotta-ink)]"
              >
                {channelError}
              </p>
            )}
          </div>
        </>
      )}

      <h3 className="t-head mb-3 mt-6 text-[var(--ink-subtle)]">
        Contact rule
      </h3>
      {ruleSummary ? (
        <ContactRuleLine
          summary={ruleSummary}
          blocked={ruleBlocks}
          routeTo={rule?.route_to_person_id ? (routeTo ?? null) : null}
        />
      ) : (
        <p className="t-body-sm text-[var(--ink-subtle)]">{NO_RULE_SENTENCE}</p>
      )}
      <DocumentAction
        actionKey="edit-contact-rule"
        surfaceKey="people"
        regionKey="contact-rule"
        variant="tertiary"
        aria-expanded={editingRule}
        aria-controls={ruleBandId}
        onClick={() => setEditingRule((open) => !open)}
      >
        Edit the rule
      </DocumentAction>
      <div id={ruleBandId} hidden={!editingRule} className="mt-2">
        <label className="t-body-sm flex min-h-11 items-center gap-2 text-[var(--ink)]">
          <input
            type="checkbox"
            checked={forbidSms}
            onChange={(e) => setForbidSms(e.target.checked)}
          />
          Never text them
        </label>
        <label className="t-body-sm flex min-h-11 items-center gap-2 text-[var(--ink)]">
          <input
            type="checkbox"
            checked={forbidEmail}
            onChange={(e) => setForbidEmail(e.target.checked)}
          />
          Never email them
        </label>
        <label className={FIELD_LABEL} htmlFor={`${ruleBandId}-route`}>
          Write someone else instead
        </label>
        <select
          id={`${ruleBandId}-route`}
          value={routeId}
          onChange={(e) => setRouteId(e.target.value)}
          className={`${FIELD_INPUT} mb-3`}
        >
          <option value="">Nobody — reach them directly</option>
          {(routeCandidates ?? []).map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
        <label className={FIELD_LABEL} htmlFor={`${ruleBandId}-reason`}>
          Why
        </label>
        <input
          id={`${ruleBandId}-reason`}
          type="text"
          value={ruleReason}
          onChange={(e) => setRuleReason(e.target.value)}
          className={`${FIELD_INPUT} mb-2`}
        />
        <DocumentAction
          actionKey="save-contact-rule"
          surfaceKey="people"
          regionKey="contact-rule"
          variant="secondary"
          loading={setRule.isPending}
          loadingLabel="Saving…"
          onClick={saveRule}
        >
          Save the rule
        </DocumentAction>
        {ruleError && (
          <p
            role="alert"
            className="t-body-sm mt-1 text-[var(--terracotta-ink)]"
          >
            {ruleError}
          </p>
        )}
      </div>

      <h3 className="t-head mb-3 mt-6 text-[var(--ink-subtle)]">
        Access grants
      </h3>
      <AccessGrantList grants={grants} now={now} onAnnounce={onAnnounce} />
      {/* SPEC §5.3 #9: no door is minted onto a FIRM. The company variant reads
          the doors its people hold and offers none of its own. */}
      {isPerson && (
        <p
          id={mintReasonId}
          className="t-body-sm mt-3 max-w-[56ch] text-[var(--ink-subtle)]"
        >
          {!seatId
            ? MINT_WITHOUT_SEAT_SENTENCE
            : expiresAt
              ? mintConsequenceSentence(personName, expiresAt)
              : MINT_FALLBACK_SENTENCE}
        </p>
      )}
      {/* CR3-6: where the warranty is the later of the two, the sentence above
          already names the warranty date — because that is the date the token
          carries. Saying it is the reason this band is a statement and not a
          choice. */}
      {isPerson && seatId && expiresAt && expiresAt === warrantyEnd?.slice(0, 10) && (
        <p id={mintBandId} className="t-body-sm mt-1 text-[var(--ink-subtle)]">
          This seat runs out a warranty, so the door ends with the warranty.
        </p>
      )}
      {isPerson && (
        <DocumentAction
          actionKey="mint-access-grant"
          surfaceKey="people"
          regionKey="access-grants"
          variant="secondary"
          held={!seatId}
          disabled={!seatId}
          aria-describedby={mintReasonId}
          loading={createLink.isPending}
          loadingLabel="Opening…"
          onClick={mint}
        >
          Mint access
        </DocumentAction>
      )}
      {mintedUrl && (
        <p className="t-body-sm mt-2 break-all font-mono text-[var(--ink)]">
          {mintedUrl}
        </p>
      )}
      {mintError && (
        <p role="alert" className="t-body-sm mt-1 text-[var(--terracotta-ink)]">
          {mintError}
        </p>
      )}
    </section>
  );
}
