'use client';

/**
 * R6 — one button, no password. The button POSTs; the server validates the
 * token, marks it accepted, mints a FRESH magic link and hands it back, and the
 * browser follows it. She lands signed in, on her house, having typed nothing.
 *
 * MINT ON POST, NEVER ON GET. Outlook SafeLinks and similar corporate scanners
 * follow links in mail; a page that minted on GET would burn her token before
 * she ever clicked, and her first click would land on "already opened".
 */

import { useCallback, useRef, useState } from 'react';

const MESSAGES: Record<string, string> = {
  already_accepted: 'This letter has already been opened.',
  expired: "This letter’s gone stale.",
  revoked: "This letter’s gone stale.",
  not_found: "This letter’s gone stale.",
};

export function OpenLetterForm({ token, label }: { token: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One in flight, whatever the button is asked to do.
  const inFlight = useRef(false);

  const open = useCallback(async () => {
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
        actionLink?: string;
        error?: string;
      };
      if (!res.ok || !payload.actionLink) {
        setError(MESSAGES[payload.error ?? ''] ?? 'That link did not work just now.');
        inFlight.current = false;
        setBusy(false);
        return;
      }
      // A hard navigation, not a router push: the link is GoTrue's, on another
      // origin, and the session lands on the way through.
      window.location.assign(payload.actionLink);
    } catch {
      setError('That link did not work just now.');
      inFlight.current = false;
      setBusy(false);
    }
  }, [token]);

  return (
    <div>
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className="inline-flex min-h-11 items-center rounded-[7px] border border-[#8A6A30] bg-[#B08A46] px-8 py-3.5 text-[15px] font-semibold text-[#F5F0E6] disabled:opacity-70"
      >
        {label}
      </button>
      {error ? <p className="mt-3 text-[13px] text-[#A24E2E]">{error}</p> : null}
    </div>
  );
}
