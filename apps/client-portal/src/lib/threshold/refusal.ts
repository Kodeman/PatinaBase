/* ── A REFUSED ACT, IN THE HOUSE'S WORDS ─────────────────────────────────────
   An act that is refused says so in a sentence this surface authored. The
   cause's own text is a PostgREST or edge-function string — a developer's
   message, in a developer's voice, sometimes naming a table or a constraint —
   and it is never printed to the homeowner as content.

   In development the cause is carried in parentheses, because the sentence on
   its own tells the person fixing it nothing. ─────────────────────────────── */

/**
 * Whether the cause is a REFUSAL rather than a bad moment.
 *
 * `W3W-R1-04`. PostgREST answers an RPC that raised `insufficient_privilege`
 * with 403 and SQLSTATE `42501` — the shape `/api/trade-scopes/[id]/accept`
 * and `/api/proposals/[id]/decline` already read. Nothing about a refusal
 * improves by being retried or refreshed, and a surface that offers either is
 * promising a reader access she does not have.
 */
export function isPermissionRefusal(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const error = cause as { code?: unknown; status?: unknown };
  return error.code === '42501' || error.status === 403;
}

/**
 * `W3R1-n1`. 00572's refusal of a snooze on an approval past its date. The
 * server raises it as a `check_violation` whose message is the token, so the
 * one sentence both surfaces already draw in the act's place can answer it.
 */
export function isPastDueRefusal(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const message = (cause as { message?: unknown }).message;
  return typeof message === 'string' && message.includes('decision_past_due');
}

/**
 * React Query's own three tries, minus the case a retry cannot fix.
 *
 * A refused read is refused every time, and the retries are not free: the
 * paper record sat blank for about five seconds before it said anything at
 * all, which read as a slow page rather than as a closed door.
 */
export function retryUnlessRefused(failureCount: number, error: unknown): boolean {
  return !isPermissionRefusal(error) && failureCount < 3;
}

export function refusalSentence(cause: unknown, sentence: string): string {
  if (
    process.env.NODE_ENV === 'development' &&
    cause instanceof Error &&
    cause.message
  ) {
    return `${sentence} (${cause.message})`;
  }
  return sentence;
}
