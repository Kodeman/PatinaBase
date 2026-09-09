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
import { useQueryClient } from '@tanstack/react-query';
import {
  useClientInvitationStatus,
  useInviteAndLinkClient,
  clientInvitationStatusKeys,
  peopleKeys,
  type ClientInvitationStatus,
} from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { LetterLineField, sendButtonLabel } from './letter-line-field';

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
  clientEmail = null,
}: {
  designerClientId: string;
  clientName: string | null;
  /** Shown in the field's facts line; the send resolves it server-side from
   *  the roster row, so a missing one costs the facts line, not the letter. */
  clientEmail?: string | null;
}) {
  const { value: letterOn, isLoading: flagLoading } = useFeatureFlag('client-invite-letter');
  const { data: status, isLoading, isError } = useClientInvitationStatus(
    letterOn ? designerClientId : undefined,
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  // R73 — the same invite-and-link mutation the ClientPicker's armed row uses,
  // carrying designerClientId so the EXISTING roster row is reused.
  const inviteAndLink = useInviteAndLinkClient();
  const [composing, setComposing] = useState(false);
  const [note, setNote] = useState('');
  // One in flight, mirroring the studio-member resend guard
  // (account-studio-page.tsx:490-520).
  const inFlight = useRef(false);
  const queryClient = useQueryClient();

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
          void queryClient.invalidateQueries({
            queryKey: clientInvitationStatusKeys.one(designerClientId),
          });
        }
      } catch {
        setFeedback('Could not send it just now.');
      } finally {
        inFlight.current = false;
      }
    },
    [designerClientId, queryClient],
  );

  const writeTo = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setFeedback(null);
    try {
      await inviteAndLink.mutateAsync({
        designerClientId,
        letter: true,
        note: note.trim() || undefined,
      });
      setComposing(false);
      setNote('');
      setFeedback('Your letter is on its way.');
      void queryClient.invalidateQueries({
        queryKey: clientInvitationStatusKeys.one(designerClientId),
      });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    } catch {
      setFeedback('Could not send it just now.');
    } finally {
      inFlight.current = false;
    }
  }, [designerClientId, inviteAndLink, note, queryClient]);

  // Fail-closed: nothing renders until the flag resolves, so a non-pilot studio
  // never sees a letter line flash past. A read that errored is not the same
  // state as "no letter was ever written" — surfacing "Write to X" over a
  // transient RPC failure could prompt a duplicate letter, so we say nothing.
  if (flagLoading || !letterOn || isLoading || isError) return null;

  const { text, action } = rowCopy(status ?? null);
  const given = (clientName ?? '').trim().split(/\s+/)[0] || null;

  return (
    <>
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
        {action === 'write-to' ? (
          <>
            {' · '}
            {/* An act, not a label: it unfolds the same LetterLineField the
                add-person sheet uses, and sends through the same route. */}
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="min-h-11 text-[var(--color-mocha)] underline underline-offset-4"
            >
              {given ? `Write to ${given}` : 'Write the letter'}
            </button>
          </>
        ) : null}
        {feedback ? <span className="ml-2 text-[var(--color-mocha)]">{feedback}</span> : null}
      </p>
      {/* Sibling of the <p>, never inside it: the field is block content and a
          <p> may not carry a <div>. */}
      {action === 'write-to' && composing ? (
        <div data-testid="client-letter-compose" className="pl-[3.25rem]">
          <LetterLineField
            facts={{
              clientName,
              clientEmail: (clientEmail ?? '').trim(),
              projectName: null,
            }}
            value={note}
            onChange={setNote}
            disabled={inviteAndLink.isPending}
          />
          <div className="mt-3 flex items-center gap-4">
            <button
              type="button"
              onClick={() => void writeTo()}
              disabled={inviteAndLink.isPending}
              className="min-h-11 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-clay-ink)] underline underline-offset-4 disabled:opacity-60"
            >
              {sendButtonLabel(true)}
            </button>
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setNote('');
              }}
              className="min-h-11 text-[0.74rem] text-[var(--color-aged-oak)] underline underline-offset-4"
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
