'use client';

/**
 * R10 — the lapsed letter. One tap, sent by the system, and nothing lands in
 * the designer's queue for a thing she did not do wrong. The response is always
 * ok, whether or not the token ever existed, so this page cannot be used to
 * learn which tokens are real.
 */

import { useCallback, useRef, useState } from 'react';

export function StaleLetterForm({ token }: { token: string }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await fetch('/api/auth/invite/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    } catch {
      // She is told the same thing either way — a transport failure must not
      // become the one signal that says whether this token was real.
    } finally {
      setSent(true);
      setBusy(false);
    }
  }, [token]);

  return (
    <div>
      <p className="font-heading text-[1.15rem] text-[#1F1B16]">This letter&rsquo;s gone stale.</p>
      {sent ? (
        <p className="mt-3 text-[15px] text-[#4B463E]">A fresh letter is on its way.</p>
      ) : (
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          className="mt-4 inline-flex min-h-11 items-center rounded-[7px] border border-[#8A6A30] bg-[#B08A46] px-8 py-3.5 text-[15px] font-semibold text-[#F5F0E6] disabled:opacity-70"
        >
          Send a fresh letter
        </button>
      )}
    </div>
  );
}
