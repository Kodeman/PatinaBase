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
  isAccessGrantRevokable,
  useRevokeAccessGrant,
  type AccessGrant,
} from "@patina/supabase";
import { peopleEvents } from "@/lib/analytics/people-events";
import { DocumentAction } from "../document-action";
import { formatSeatDate } from "./seat-line";
import { formatLongDate } from "./people-format";

export const NO_GRANT_SENTENCE = "No grant on file.";
export const REVOKE_REASON_PROMPT =
  "Say why the door closes. Optional, kept with the record.";

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
 * "Ends with the job, 13 August 2027. Renews when they use it." — the end date
 * in words. Inside fourteen days the row adds the count, because that is when
 * the number is the fact.
 */
export function grantEndsSentence(
  expiresAt: string | null | undefined,
  now: Date,
): string {
  if (!expiresAt) return "Ends with the job. Renews when they use it.";
  const long = formatLongDate(expiresAt.slice(0, 10));
  if (!long) return "Ends with the job. Renews when they use it.";
  const days = Math.ceil((Date.parse(expiresAt) - now.getTime()) / DAY_MS);
  const close =
    Number.isFinite(days) && days >= 0 && days <= 14
      ? ` ${days === 0 ? "Ends today." : days === 1 ? "One day left." : `${days} days left.`}`
      : "";
  return `Ends with the job, ${long}. Renews when they use it.${close}`;
}

/** The row's own facts, in the order the studio reads them. */
export function grantRowParts(grant: AccessGrant): string[] {
  const parts: string[] = [tierLabel(String(grant.tier))];
  const opens = tierOpens(String(grant.tier));
  if (opens) parts.push(opens);
  const minted = formatSeatDate(grant.granted_at?.slice(0, 10));
  if (minted) parts.push(`minted ${minted}`);
  const used = formatSeatDate(grant.last_used_at?.slice(0, 10));
  if (used) parts.push(`used ${used}`);
  return parts;
}

function GrantRow({
  grant,
  now,
  onAnnounce,
}: {
  grant: AccessGrant;
  now: Date;
  onAnnounce: (message: string) => void;
}) {
  const revoke = useRevokeAccessGrant();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const confirmId = useId();
  const reasonId = useId();
  const revokable = isAccessGrantRevokable(grant.tier);
  const label = tierLabel(String(grant.tier));

  const close = () => {
    setError(null);
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
      className="border-t border-[var(--hairline)] py-3"
    >
      <p className="t-body-sm text-[var(--ink)]">
        {grantRowParts(grant).join(" · ")}
      </p>
      <p className="t-body-sm mt-1 text-[var(--ink-subtle)]">
        {grantEndsSentence(grant.expires_at, now)}
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
            <label
              htmlFor={reasonId}
              className="t-head block text-[var(--ink-subtle)]"
            >
              Why it closes
            </label>
            <p className="t-body-sm mt-1 text-[var(--ink-subtle)]">
              {REVOKE_REASON_PROMPT}
            </p>
            <input
              id={reasonId}
              type="text"
              value={reason}
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
}: {
  grants: readonly AccessGrant[] | undefined;
  now: Date;
  onAnnounce: (message: string) => void;
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
        />
      ))}
    </ul>
  );
}
