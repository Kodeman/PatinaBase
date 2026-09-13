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

import { useId, useMemo, useState } from "react";
import {
  CONTACT_CHANNEL_KIND_LABELS,
  isContactChannelHeld,
  useAccessGrants,
  useChannelConsent,
  useContactRule,
  useCreateFieldLink,
  useRecordChannelConsent,
  useSetContactRule,
  useStudioContactChannels,
  fieldLinkUrl,
  type ContactChannelKind,
  type ConsentSource,
  type StudioContactChannel,
} from "@patina/supabase";
import { peopleEvents } from "@/lib/analytics/people-events";
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
  onAnnounce,
}: {
  channel: StudioContactChannel;
  organizationId: string | null;
  projectName: string | null;
  originProjectId: string | null;
  onAnnounce: (message: string) => void;
}) {
  const consentKind = isPhoneChannel(String(channel.channel_kind))
    ? "sms"
    : "email";
  const { data: consent } = useChannelConsent(
    organizationId,
    consentKind,
    channel.value,
  );
  const record = useRecordChannelConsent();
  const [recording, setRecording] = useState(false);
  const [source, setSource] = useState<ConsentSource | "">("");
  const [evidence, setEvidence] = useState("");
  const [optOut, setOptOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bandId = useId();
  const held = isContactChannelHeld(channel.status);
  const sentence = consentSentenceForRecord(consent?.record, projectName);

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
      {
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
        onError: (e) =>
          setError(
            e instanceof Error ? e.message : "Could not record that just now.",
          ),
      },
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
        <StateWord family="consent" value={consent?.verdict} />
      </p>
      {held && (
        <p className="t-body-sm mt-1 text-[var(--ink)]">
          {heldChannelReason(channel)}
        </p>
      )}
      {sentence && (
        <p
          data-consent-sentence
          className="t-body-sm mt-1 text-[var(--ink-subtle)]"
        >
          {sentence}
        </p>
      )}
      <DocumentAction
        actionKey="record-channel-consent"
        surfaceKey="people"
        regionKey="reach-channels"
        variant="tertiary"
        aria-expanded={recording}
        aria-controls={bandId}
        onClick={() => setRecording((open) => !open)}
      >
        Record consent
      </DocumentAction>
      <div id={bandId} hidden={!recording} className="mt-2">
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
  onAnnounce,
  now,
  personName,
}: ReachAccessProps & { personName: string }) {
  const { data: channels } = useStudioContactChannels(cardId);
  const { data: rule } = useContactRule(cardKind, cardId);
  const { data: grants } = useAccessGrants({ subjectId: cardId });
  const setRule = useSetContactRule();
  const createLink = useCreateFieldLink();

  const [editingRule, setEditingRule] = useState(false);
  const [ruleReason, setRuleReason] = useState("");
  const [forbidSms, setForbidSms] = useState(false);
  const [forbidEmail, setForbidEmail] = useState(false);
  const [routeId, setRouteId] = useState("");
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [mintChoice, setMintChoice] = useState<"window" | "warranty">("window");
  const [mintedUrl, setMintedUrl] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const ruleBandId = useId();
  const mintBandId = useId();
  const mintReasonId = useId();

  const forbidden = useMemo(() => rule?.channels_forbidden ?? [], [rule]);
  const doNotContact = forbidden.includes("sms") && forbidden.includes("email");
  const ruleSummary = useMemo(() => {
    if (!rule) return null;
    const clauses: string[] = [];
    if (rule.channels_allowed.length > 0) {
      clauses.push(
        `Only ${rule.channels_allowed
          .map((c) => CONTACT_CHANNEL_KIND_LABELS[c as ContactChannelKind] ?? c)
          .join(", ")
          .toLowerCase()}.`,
      );
    }
    if (forbidden.length > 0) {
      clauses.push(
        `Never ${forbidden
          .map((c) => CONTACT_CHANNEL_KIND_LABELS[c as ContactChannelKind] ?? c)
          .join(", ")
          .toLowerCase()}.`,
      );
    }
    if (rule.reason) clauses.push(rule.reason);
    const setOn = formatSeatDate(rule.set_at?.slice(0, 10));
    if (setOn) clauses.push(`Set ${setOn}.`);
    return clauses.join(" ");
  }, [rule, forbidden]);

  const expiresAt = mintChoice === "warranty" ? warrantyEnd : seatWindowEnd;

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
            expiry_source: expiresAt
              ? mintChoice === "warranty"
                ? "warranty"
                : "engagement_window"
              : "fallback_90_day",
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

  const saveRule = () => {
    setRuleError(null);
    if (!cardId) return;
    setRule.mutate(
      {
        subjectType: cardKind,
        subjectId: cardId,
        channelsForbidden: [
          ...(forbidSms ? (["sms"] as const) : []),
          ...(forbidEmail ? (["email"] as const) : []),
        ],
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
              onAnnounce={onAnnounce}
            />
          ))}
        </ul>
      )}

      <h3 className="t-head mb-3 mt-6 text-[var(--ink-subtle)]">
        Contact rule
      </h3>
      {ruleSummary ? (
        <ContactRuleLine
          summary={ruleSummary}
          blocked={forbidden.length > 0}
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
      <p
        id={mintReasonId}
        className="t-body-sm mt-3 max-w-[56ch] text-[var(--ink-subtle)]"
      >
        {seatId
          ? mintConsequenceSentence(personName, expiresAt)
          : MINT_WITHOUT_SEAT_SENTENCE}
      </p>
      {warrantyEnd && seatId && (
        <div id={mintBandId} className="mt-2">
          <label className="t-body-sm flex min-h-11 items-center gap-2 text-[var(--ink)]">
            <input
              type="radio"
              name={`${mintBandId}-clock`}
              checked={mintChoice === "window"}
              onChange={() => setMintChoice("window")}
            />
            Ends with the job
          </label>
          <label className="t-body-sm flex min-h-11 items-center gap-2 text-[var(--ink)]">
            <input
              type="radio"
              name={`${mintBandId}-clock`}
              checked={mintChoice === "warranty"}
              onChange={() => setMintChoice("warranty")}
            />
            Ends with the warranty, {formatLongDate(warrantyEnd.slice(0, 10))}
          </label>
        </div>
      )}
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
