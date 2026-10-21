'use client';

/**
 * R6 — one button, no password. The button POSTs; the server validates the
 * token, marks it accepted, mints a FRESH magic link and hands it back, and the
 * browser follows it. She lands signed in, on her house, having typed nothing.
 *
 * MINT ON POST, NEVER ON GET. Outlook SafeLinks and similar corporate scanners
 * follow links in mail; a page that minted on GET would burn her token before
 * she ever clicked, and her first click would land on "already used".
 */

import { useCallback, useRef, useState } from 'react';

import { ScoredAction } from '@/components/threshold/instruments/scored-action';

const USED = 'This invitation has already been used. Sign in to continue.';
const EXPIRED = 'This invitation link has expired.';

const MESSAGES: Record<string, string> = {
  already_accepted: USED,
  expired: EXPIRED,
  revoked: EXPIRED,
  not_found: EXPIRED,
};

export function OpenLetterForm({
  token,
  label,
  signInHref = '/auth/signin',
}: {
  token: string;
  label: string;
  /** Sign-in that returns to the invited project (the sanitized return path). */
  signInHref?: string;
}) {
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
      <ScoredAction
        actionKey="invite_open"
        surfaceKey="invitation"
        regionKey="letter"
        variant="terminal"
        onClick={() => void open()}
        disabled={busy}
      >
        {label}
      </ScoredAction>
      <p className="mt-2 text-[15px] text-[#4B463E]">
        Opening it signs you in. There&rsquo;s no password to set.
      </p>
      <div aria-live="polite">
        {error ? (
          <p data-testid="invite-open-error" className="mt-3 text-[15px] text-[#A24E2E]">
            {error}
          </p>
        ) : null}
        {error === USED ? (
          <a
            href={signInHref}
            className="mt-2 inline-flex min-h-11 items-center text-[15px] font-semibold underline underline-offset-4"
          >
            Sign in
          </a>
        ) : null}
      </div>
    </div>
  );
}
