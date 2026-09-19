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

const MESSAGES: Record<string, string> = {
  revoked: "This letter’s gone stale.",
  not_found: "This letter’s gone stale.",
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
      <button
        type="button"
        onClick={() => void acknowledge()}
        disabled={busy}
        className="inline-flex min-h-11 items-center rounded-[7px] border border-[#8A6A30] bg-[#B08A46] px-8 py-3.5 text-[15px] font-semibold text-[#F5F0E6] disabled:opacity-70"
      >
        Let them know I have it
      </button>
      {error ? <p className="mt-3 text-[13px] text-[#A24E2E]">{error}</p> : null}
    </div>
  );
}
