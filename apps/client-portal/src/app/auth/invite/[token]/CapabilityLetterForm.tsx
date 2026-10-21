'use client';

/**
 * P21 — ONE BUTTON, AND NO ACCOUNT BEHIND IT.
 *
 * `OpenLetterForm` is the email letter's button: it POSTs, gets a freshly
 * minted magic link back, and navigates her into a session. A homeowner reached
 * by text has no account for a session to belong to, and minting one off a
 * link she was texted would be inventing an identity she never asked for. So
 * this button records one fact — that she has the letter — and stays put.
 *
 * It posts to the SAME route the email button posts to. The edge function
 * behind it tries the mailed token first and falls through to the capability,
 * so there is one accept door, not two.
 */

import { useCallback, useRef, useState } from 'react';

import { ScoredAction } from '@/components/threshold/instruments/scored-action';

const MESSAGES: Record<string, string> = {
  revoked: 'This invitation link has expired.',
  not_found: 'This invitation link has expired.',
};

export function CapabilityLetterForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One in flight, whatever the button is asked to do.
  const inFlight = useRef(false);

  const acknowledge = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        accepted?: boolean;
        error?: string;
      };
      if (!res.ok || !payload.accepted) {
        setError(MESSAGES[payload.error ?? ''] ?? 'That link did not work just now.');
        inFlight.current = false;
        setBusy(false);
        return;
      }
      setDone(true);
      setBusy(false);
    } catch {
      setError('That link did not work just now.');
      inFlight.current = false;
      setBusy(false);
    }
  }, [token]);

  if (done) {
    return <p className="font-heading text-[1.15rem]">Noted — thank you.</p>;
  }

  return (
    <div>
      <ScoredAction
        actionKey="invite_acknowledge"
        surfaceKey="invitation"
        regionKey="letter"
        variant="terminal"
        onClick={() => void acknowledge()}
        disabled={busy}
      >
        Let them know I have it
      </ScoredAction>
      <div aria-live="polite">
        {error ? <p className="mt-3 text-[15px] text-[#A24E2E]">{error}</p> : null}
      </div>
    </div>
  );
}
