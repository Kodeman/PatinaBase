'use client';

/**
 * US-34 N12a — the 8 s line (plan §5.1 S2, PQ16). A write says "Still
 * working."; a send says "Still sending.". Neither promises the write will
 * finish. "Nothing is sent twice." is added only for a send proven
 * duplicate-safe end to end (SQ-965 O4): today that is the outbound draft
 * send alone. Never pass `idempotent` for an invoice send: it is not keyed.
 *
 * The status region is always mounted, so the line is announced when it
 * appears; it is empty, and takes no room, until the act turns slow.
 */

import type { ActPhase } from './use-act-feedback';

export const STILL_WORKING = 'Still working.';
export const STILL_SENDING = 'Still sending.';
export const NOTHING_SENT_TWICE = 'Nothing is sent twice.';

export function stillLine(act: 'write' | 'send', idempotent = false): string {
  if (act === 'write') return STILL_WORKING;
  return idempotent ? `${STILL_SENDING} ${NOTHING_SENT_TWICE}` : STILL_SENDING;
}

export function ActStillLine({
  phase,
  act,
  idempotent = false,
  className = '',
}: {
  phase: ActPhase;
  act: 'write' | 'send';
  /** Only for a send SQ-965 O4 proved duplicate-safe (outbound drafts). */
  idempotent?: boolean;
  className?: string;
}) {
  return (
    <p role="status" data-act-still-line className={`text-[13px] text-[var(--text-muted)] ${className}`}>
      {phase === 'slow' ? stillLine(act, idempotent) : null}
    </p>
  );
}
