'use client';

/**
 * R9 — the four row states, as dated prose.
 *
 * This is a SIBLING of PersonRow inside the directory's <li>, never a child of
 * it: PersonRow is a <button>, and "Write again" is a second button, which no
 * browser will nest. It also keeps person-row.tsx presentational, as its own
 * docblock requires.
 *
 * The constraints, from R9 and the portal-polish DECLINE table: never phrased
 * as an absence ("hasn't opened it yet"), never as a duration ("3 days ago"),
 * never on a client surface, and no pills, dots, colour fills or ✓ glyphs.
 * Where we do not know, the row says nothing rather than guessing — the
 * ambiguous-send gap (an unreadable 2xx writes status='failed' with a NULL
 * provider_id, which the Resend webhook can never match) means some sends are
 * genuinely unknowable, and "Delivered ✓" on one of those would be a lie.
 */

import { useCallback, useRef, useState } from 'react';
import {
  useClientInvitationStatus,
  type ClientInvitationStatus,
} from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'June',
  'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
];

/** "8 Sept" — the date it happened, in the studio's own shorthand. */
export function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

export function rowCopy(status: ClientInvitationStatus | null): {
  text: string;
  action: 'write-again' | 'write-to' | null;
} {
  if (!status) {
    return { text: 'On your roster · no letter sent', action: 'write-to' };
  }
  const when = shortDate(status.at);
  switch (status.state) {
    case 'opened':
      return { text: `Opened ${when}`, action: null };
    // "Signed in", not "Accepted": accepting is a system's word for a thing a
    // person experienced as opening her own house.
    case 'accepted':
      return { text: `Signed in ${when}`, action: null };
    // "Lapsed", not "Expired" or "Failed" — nothing failed, and the remedy sits
    // next to it.
    case 'lapsed':
      return { text: `Link lapsed ${when}`, action: 'write-again' };
    case 'sent':
    default:
      return { text: `Letter sent ${when}`, action: null };
  }
}

export function ClientLetterLine({
  designerClientId,
  clientName,
}: {
  designerClientId: string;
  clientName: string | null;
}) {
  const { value: letterOn, isLoading: flagLoading } = useFeatureFlag('client-invite-letter');
  const { data: status, isLoading } = useClientInvitationStatus(
    letterOn ? designerClientId : undefined,
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  // One in flight, mirroring the studio-member resend guard
  // (account-studio-page.tsx:490-520).
  const inFlight = useRef(false);

  const writeAgain = useCallback(
    async (invitationId: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setFeedback(null);
      try {
        const res = await fetch('/api/clients/invite/resend', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invitationId }),
        });
        if (res.status === 429) {
          setFeedback('A letter went out within the hour. You can write again after that.');
        } else if (!res.ok) {
          setFeedback('Could not send it just now.');
        } else {
          setFeedback('A fresh letter is on its way.');
        }
      } catch {
        setFeedback('Could not send it just now.');
      } finally {
        inFlight.current = false;
      }
    },
    [],
  );

  // Fail-closed: nothing renders until the flag resolves, so a non-pilot studio
  // never sees a letter line flash past.
  if (flagLoading || !letterOn || isLoading) return null;

  const { text, action } = rowCopy(status ?? null);
  const given = (clientName ?? '').trim().split(/\s+/)[0] || null;

  return (
    <p
      data-testid="client-letter-line"
      className="mt-1 pl-[3.25rem] text-[0.7rem] leading-snug text-[var(--color-aged-oak)]"
    >
      {text}
      {action === 'write-again' && status ? (
        <>
          {' · '}
          <button
            type="button"
            onClick={() => void writeAgain(status.invitationId)}
            className="min-h-11 underline underline-offset-4"
          >
            Write again
          </button>
        </>
      ) : null}
      {action === 'write-to' && given ? (
        <>
          {' · '}
          <span className="text-[var(--color-mocha)]">{`Write to ${given}`}</span>
        </>
      ) : null}
      {feedback ? <span className="ml-2 text-[var(--color-mocha)]">{feedback}</span> : null}
    </p>
  );
}
