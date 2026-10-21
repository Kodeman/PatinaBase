'use client';

/**
 * R10 — the lapsed invitation. One tap, sent by the system, and nothing lands
 * in the designer's queue for a thing she did not do wrong.
 *
 * NO ORACLE, NO PROMISE (CPUX-05). The refresh route answers `{ ok: true }`
 * whether or not the token ever existed and whether or not the upstream send
 * worked, so an answer is acknowledged in words that promise nothing: "If a new
 * invitation can be sent…". Only a request that never got an answer at all — a
 * dropped connection, or a non-success status the route itself never sends —
 * says it could not be asked, and that failure is the same for every token, so
 * it reveals nothing about which tokens are real. The in-flight guard resets
 * on failure so "Try again" actually asks again.
 */

import { useCallback, useRef, useState } from 'react';

import { ScoredAction } from '@/components/threshold/instruments/scored-action';

const EXPIRED_COPY = 'This invitation link has expired.';
const ACKNOWLEDGED_COPY = 'If a new invitation can be sent, you’ll receive an email.';
const REQUEST_FAILED_COPY =
  'We couldn’t request a new link. Try again or contact your designer.';

type RequestState = 'idle' | 'busy' | 'acknowledged' | 'failed';

export function StaleLetterForm({ token }: { token: string }) {
  const [state, setState] = useState<RequestState>('idle');
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState('busy');
    try {
      const res = await fetch('/api/auth/invite/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error(`refresh answered ${res.status}`);
      setState('acknowledged');
    } catch {
      inFlight.current = false;
      setState('failed');
    }
  }, [token]);

  return (
    <div>
      <p className="font-heading text-[1.15rem] text-[#1F1B16]">{EXPIRED_COPY}</p>
      <div aria-live="polite">
        {state === 'acknowledged' ? (
          <p data-testid="invite-refresh-acknowledged" className="mt-3 text-[15px] text-[#4B463E]">
            {ACKNOWLEDGED_COPY}
          </p>
        ) : null}
        {state === 'failed' ? (
          <p data-testid="invite-refresh-failed" className="mt-3 text-[15px] text-[#4B463E]">
            {REQUEST_FAILED_COPY}
          </p>
        ) : null}
      </div>
      {state === 'acknowledged' ? null : (
        <div className="mt-4">
          <ScoredAction
            actionKey={state === 'failed' ? 'invite_refresh_retry' : 'invite_refresh'}
            surfaceKey="invitation"
            regionKey="letter"
            variant="terminal"
            loading={state === 'busy'}
            loadingLabel="Requesting a new link"
            disabled={state === 'busy'}
            onClick={() => void refresh()}
          >
            {state === 'failed' ? 'Try again' : 'Send a new invitation link'}
          </ScoredAction>
        </div>
      )}
    </div>
  );
}
