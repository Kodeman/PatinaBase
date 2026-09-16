"use client";

/**
 * ACCESS GRANTS — every door open onto one person (E9, direction §5.3).
 *
 * One row per grant: the tier word, what it opens, when it was minted, when it
 * was last used, and when it ENDS — in words, never a countdown. PR-d retired
 * the flat 90-day clock: a grant ends with the engagement's window and renews
 * on use, so the row says so. Remaining days print only inside 14 days, when
 * the number is the fact rather than the noise.
 *
 * Revoke is a TWO-STEP INLINE CONFIRM with an optional reason, never a modal
 * (direction §5.3). A tier with no revoke door here says so in words rather
 * than offering a control that cannot close anything.
 *
 * R-V: an absent grant is a FACT. The list prints "No grant on file." rather
 * than vanishing, so the studio can tell a missing record from a missing
 * region.
 */

import { useId, useState } from "react";
import {
  ACCESS_GRANT_NOT_REVOKABLE_SENTENCE,
  ACCESS_GRANT_TIER_LABELS,
  ACCESS_GRANT_TIER_OPENS,
  accessGrantRevokeRoute,
  isAccessGrantRevokable,
  touchInstantDay,
  useRevokeAccessGrant,
  type AccessGrant,
} from "@patina/supabase";
import { peopleEvents } from "@/lib/analytics/people-events";
import { DocumentAction } from "../document-action";
import { formatLongDate, lastOpenDay } from "./people-format";

export const NO_GRANT_SENTENCE = "No grant on file.";
export const REVOKE_REASON_PROMPT =
  "Say why the door closes. Optional, kept with the record.";
/**
 * CR5-2 — the prompt for a route whose RPC REQUIRES a reason. The one route
 * that sets `reasonRequired` (`revoke_project_review_access`) raises on a
 * reason under five characters, so the surface asked for something "optional"
 * that the database then refused.
 */
export const REVOKE_REASON_REQUIRED_PROMPT =
  "Say why the door closes. Required, at least five characters, kept with the record.";
/** CR5-2 — the shortest reason the reason-taking RPC accepts. */
export const REVOKE_REASON_MIN_LENGTH = 5;
export const REVOKE_REASON_TOO_SHORT =
  "Write at least five characters saying why it closes.";

/**
 * CR5-2 — WHAT THIS REVOKE ACTUALLY CLOSES, before the act.
 *
 * `revoke_project_review_access` updates every `project_review_access` row on
 * the edition, so a Revoke pressed on ONE reviewer's row — and the row is
 * reachable from an ordinary person card — closes the review for all of them.
 * `ACCESS_GRANT_REVOKE_ROUTES.revokesWholeScope` has declared that fact, and
 * its own docblock has asked the surface to say it, since the table was
 * written; nothing printed it.
 */
export function grantRevokeConsequence(
  tier: string | null | undefined,
  subjectName?: string | null,
): string | null {
  const route = accessGrantRevokeRoute(tier);
  if (!route?.revokesWholeScope) return null;
  const who = (subjectName ?? "").trim();
  return who
    ? `This closes the review for everyone on this edition, not only ${who}.`
    : "This closes the review for everyone on this edition, not only this person.";
}

/** The tier's own word, or the raw token where a base table drifted. */
function tierLabel(tier: string): string {
  return (
    ACCESS_GRANT_TIER_LABELS[tier as keyof typeof ACCESS_GRANT_TIER_LABELS] ??
    tier
  );
}

function tierOpens(tier: string): string | null {
  return (
    ACCESS_GRANT_TIER_OPENS[tier as keyof typeof ACCESS_GRANT_TIER_OPENS] ??
    null
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * An ACCOUNT is not a link (CR-13). PR-d's "ends with the job, renews when they
 * use it" is the FIELD LINK's clock and nobody else's: a studio membership or a
 * client account carries no expiry and is ended by removing the account (SPEC
 * §3's grants fixture, F-04 / F-16), and a document share or an invoice pay
 * link simply expires on its date. Eleven tiers, three sentences.
 */
const ACCOUNT_TIERS: ReadonlySet<string> = new Set([
  "studio_member",
  "client_account",
]);

/** "13 days left." — printed only inside fourteen days, when the number is
 *  the fact rather than the noise. */
function daysLeftClause(expiresAt: string, now: Date): string {
  const days = Math.ceil((Date.parse(expiresAt) - now.getTime()) / DAY_MS);
  if (!Number.isFinite(days) || days < 0 || days > 14) return "";
  if (days === 0) return " Ends today.";
  if (days === 1) return " One day left.";
  return ` ${days} days left.`;
}

/**
 * The tiers whose `expires_at` is an EXCLUSIVE whole-day boundary, and whose
 * end date therefore has to be backed off an instant before it is printed:
 * the field link (`create_field_link`, 00627:578-585) and the firm's paperwork
 * door (`mint_paperwork_link`, 00637:470-475). `lastOpenDay` carries the whole
 * reckoning; `people-format.ts` states it once so the mint band's before- and
 * after-sentences cannot disagree by a day again (W4 r3 MAJOR-1).
 *
 * No other tier stores one — a document share or an invoice pay link simply
 * dies at the instant it carries.
 */
const WHOLE_DAY_BOUNDARY_TIERS: ReadonlySet<string> = new Set([
  "field_link",
  "paperwork_link",
]);

/**
 * "Ends with the job, 13 August 2027. Renews when they use it." — the end date
 * in words, in the wording its own tier earns.
 */
export function grantEndsSentence(
  expiresAt: string | null | undefined,
  now: Date,
  tier?: string | null,
): string {
  if (tier && ACCOUNT_TIERS.has(tier)) {
    return "No end date. Revoked by removing the account.";
  }
  const fieldLink = !tier || tier === "field_link";
  // The WORDING is the field link's ("renews when they use it"); the DATE
  // rule is every whole-day boundary tier's.
  const wholeDayBoundary = fieldLink || WHOLE_DAY_BOUNDARY_TIERS.has(tier ?? "");
  const endsOn = expiresAt
    ? wholeDayBoundary
      ? lastOpenDay(expiresAt)
      : expiresAt.slice(0, 10)
    : null;
  const long = endsOn ? formatLongDate(endsOn) : null;
  if (!long) {
    return fieldLink
      ? "Ends with the job. Renews when they use it."
      : "No end date on file.";
  }
  const close = daysLeftClause(expiresAt as string, now);
  return fieldLink
    ? `Ends with the job, ${long}. Renews when they use it.${close}`
    : `Ends ${long}.${close}`;
}

/** The row's own facts, in the order the studio reads them. */
export function grantRowParts(grant: AccessGrant): string[] {
  const parts: string[] = [tierLabel(String(grant.tier))];
  const opens = tierOpens(String(grant.tier));
  if (opens) parts.push(opens);
  // THE STUDIO'S OWN CALENDAR, NOT UTC'S (W4 r4 F1). `granted_at` and
  // `last_used_at` are timestamptz; PostgREST answers them as a UTC instant,
  // and slicing that string printed the UTC day — so a link minted at 19:09
  // CDT on 15 September read "minted 16 Sep 2026" three rows above an inbound
  // document from the same evening that correctly read "15 Sep". `touchDate`
  // and `inboundDocumentLine` were fixed for exactly this in r3; the grant row
  // was not. `formatSeatDate` stays where it belongs — a zoneless DATE column.
  const minted = touchInstantDay(grant.granted_at);
  if (minted) parts.push(`minted ${minted}`);
  const used = touchInstantDay(grant.last_used_at);
  if (used) parts.push(`used ${used}`);
  return parts;
}

function GrantRow({
  grant,
  now,
  onAnnounce,
  subjectName,
}: {
  grant: AccessGrant;
  now: Date;
  onAnnounce: (message: string) => void;
  /** CR5-2 — whose card this row is being read on, for the consequence
   *  sentence a whole-scope revoke owes the studio. */
  subjectName?: string | null;
}) {
  const revoke = useRevokeAccessGrant();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const confirmId = useId();
  const reasonId = useId();
  const revokable = isAccessGrantRevokable(grant.tier);
  const label = tierLabel(String(grant.tier));
  const route = accessGrantRevokeRoute(grant.tier);
  const reasonRequired = route?.reasonRequired === true;
  const consequence = grantRevokeConsequence(grant.tier, subjectName);

  const close = () => {
    setError(null);
    // CR5-2: the RPC raises under five characters. Say so here rather than
    // letting Postgres answer.
    if (reasonRequired && reason.trim().length < REVOKE_REASON_MIN_LENGTH) {
      setError(REVOKE_REASON_TOO_SHORT);
      return;
    }
    revoke.mutate(
      {
        grantId: grant.grant_id,
        tier: grant.tier,
        reason: reason.trim() || null,
      },
      {
        onSuccess: () => {
          setConfirming(false);
          setReason("");
          peopleEvents.grantRevoked({
            tier: String(grant.tier),
            with_reason: !!reason.trim(),
          });
          onAnnounce(`${label} closed.`);
        },
        onError: (e) =>
          setError(
            e instanceof Error
              ? e.message
              : "Could not close that door just now.",
          ),
      },
    );
  };

  return (
    <li
      data-access-grant={grant.grant_id}
      className="border-t border-[var(--hairline-strong)] py-3"
    >
      <p className="t-body-sm text-[var(--ink)]">
        {grantRowParts(grant).join(" · ")}
      </p>
      <p className="t-body-sm mt-1 text-[var(--ink-subtle)]">
        {grantEndsSentence(grant.expires_at, now, String(grant.tier))}
      </p>
      {revokable ? (
        <>
          <DocumentAction
            actionKey="revoke-access-grant"
            surfaceKey="people"
            regionKey="access-grants"
            variant="tertiary"
            aria-expanded={confirming}
            aria-controls={confirmId}
            onClick={() => setConfirming((open) => !open)}
          >
            Revoke
          </DocumentAction>
          <div id={confirmId} hidden={!confirming} className="mt-2">
            {consequence && (
              <p className="t-body-sm mb-2 text-[var(--ink)]">{consequence}</p>
            )}
            <label
              htmlFor={reasonId}
              className="t-head block text-[var(--ink-subtle)]"
            >
              Why it closes
            </label>
            <p className="t-body-sm mt-1 text-[var(--ink-subtle)]">
              {reasonRequired
                ? REVOKE_REASON_REQUIRED_PROMPT
                : REVOKE_REASON_PROMPT}
            </p>
            <input
              id={reasonId}
              type="text"
              value={reason}
              required={reasonRequired}
              minLength={reasonRequired ? REVOKE_REASON_MIN_LENGTH : undefined}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-[2px] border border-[var(--hairline-strong)] border-b-[var(--ink-faint)] bg-[var(--paper-doc)] p-3 text-[16px] leading-[1.55]"
            />
            <DocumentAction
              actionKey="confirm-revoke-access-grant"
              surfaceKey="people"
              regionKey="access-grants"
              variant="secondary"
              loading={revoke.isPending}
              loadingLabel="Closing…"
              onClick={close}
            >
              Close this door
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
        </>
      ) : (
        <p className="t-body-sm mt-1 text-[var(--ink-faint)]">
          {ACCESS_GRANT_NOT_REVOKABLE_SENTENCE}
        </p>
      )}
    </li>
  );
}

export function AccessGrantList({
  grants,
  now,
  onAnnounce,
  subjectName,
}: {
  grants: readonly AccessGrant[] | undefined;
  now: Date;
  onAnnounce: (message: string) => void;
  /** CR5-2 — the name the whole-scope consequence sentence uses. */
  subjectName?: string | null;
}) {
  if (!grants || grants.length === 0) {
    return (
      <p className="t-body-sm text-[var(--ink-subtle)]">{NO_GRANT_SENTENCE}</p>
    );
  }
  return (
    <ul data-access-grant-list className="m-0 list-none p-0">
      {grants.map((grant) => (
        <GrantRow
          key={grant.grant_id}
          grant={grant}
          now={now}
          onAnnounce={onAnnounce}
          subjectName={subjectName}
        />
      ))}
    </ul>
  );
}
