/**
 * Global error handling utilities
 */

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  traceId?: string;
}

export class AppError extends Error {
  code: string;
  details?: unknown;
  requestId?: string;
  traceId?: string;
  statusCode?: number;

  constructor(error: ApiError | string, statusCode?: number) {
    if (typeof error === 'string') {
      super(error);
      this.code = 'UNKNOWN_ERROR';
    } else {
      super(error.message);
      this.code = error.code;
      this.details = error.details;
      this.requestId = error.requestId;
      this.traceId = error.traceId;
    }
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * Convert error to user-friendly message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return getUserFriendlyMessage(error.code, error.message);
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An unexpected error occurred';
}

/**
 * Get user-friendly error messages based on error codes
 */
function getUserFriendlyMessage(code: string, fallback: string): string {
  const messages: Record<string, string> = {
    // Auth errors
    UNAUTHORIZED: 'Please sign in to continue',
    FORBIDDEN: 'You do not have permission to perform this action',
    TOKEN_EXPIRED: 'Your session has expired. Please sign in again',
    AUTHENTICATION_REQUIRED: 'Please sign in to continue',

    // Validation errors
    VALIDATION_ERROR: 'Please check your input and try again',
    INVALID_INPUT: 'The information provided is invalid',
    REQUIRED_FIELD: 'Please fill in all required fields',

    // Resource errors
    NOT_FOUND: 'The requested resource was not found',
    ALREADY_EXISTS: 'This resource already exists',
    CONFLICT: 'This action conflicts with existing data',

    // Network and service errors
    NETWORK_ERROR: 'Network error. Please check your connection',
    SERVICE_UNAVAILABLE: 'Service temporarily unavailable. Please try again later',
    TIMEOUT: 'Request timed out. Please try again',
    SERVER_ERROR: 'Server error. Please try again later',

    // Cart/Order errors
    CART_EMPTY: 'Your cart is empty',
    INSUFFICIENT_STOCK: 'Some items are out of stock',
    INVALID_DISCOUNT_CODE: 'This discount code is invalid or expired',
    PAYMENT_FAILED: 'Payment failed. Please try another payment method',

    // File upload errors
    FILE_TOO_LARGE: 'File size exceeds the maximum allowed',
    INVALID_FILE_TYPE: 'This file type is not supported',
    UPLOAD_FAILED: 'File upload failed. Please try again',

    // Rate limiting
    RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later',

    // An expiry-*shaped* error whose session turned out to be alive (see
    // `toLiveSessionError`). Telling this user to sign in again would be a lie
    // and a loop — middleware honours the good cookie and bounces them right
    // back. Say what is actually true: the request failed, the session didn't.
    REQUEST_FAILED_SESSION_ALIVE:
      "That didn't go through. You're still signed in — try again.",

    // Generic
    UNKNOWN_ERROR: 'An unexpected error occurred',
  };

  return messages[code] || fallback;
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('network') ||
      error.message.includes('fetch') ||
      error.message.includes('timeout')
    );
  }
  return false;
}

/**
 * Supabase error fingerprints that mean "the caller's session is no longer
 * valid" — an expired/absent JWT, a refresh-token failure, or a PostgREST
 * 401/JWT rejection. Supabase surfaces these as plain `PostgrestError` /
 * `AuthError` objects (NOT Axios-shaped), so `handleApiError` never saw them
 * as auth errors and the dashboard fell back to "0 open / 100%" instead of an
 * honest "your session expired" state. Centralised here so the query cache,
 * mutation cache, and any page-level guard agree on what counts as expiry.
 */
const SUPABASE_SESSION_EXPIRED_CODES = new Set([
  'PGRST301', // PostgREST: JWT expired / invalid
  'PGRST302', // PostgREST: anonymous access disallowed (no/expired token)
  'session_not_found',
  'session_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'bad_jwt',
  'no_authorization',
]);

const SESSION_EXPIRED_MESSAGE_FRAGMENTS = [
  'jwt expired',
  'jwt is expired',
  'invalid jwt',
  'token is expired',
  'session expired',
  'session not found',
  'session from session_id claim in jwt does not exist',
  'refresh token not found',
  'refresh_token_not_found',
];

/**
 * Extract a normalized `{ code, status, message }` triple from the many error
 * shapes we encounter: our own `AppError`, Supabase `PostgrestError` /
 * `AuthError` plain objects, Axios errors, and bare `Error`s.
 */
function readErrorParts(error: unknown): {
  code?: string;
  status?: number;
  message: string;
} {
  if (error instanceof AppError) {
    return { code: error.code, status: error.statusCode, message: error.message };
  }
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    // Supabase AuthError uses `status`; PostgrestError uses `code` (PGRST*).
    // Axios uses `response.status`. Cover all three.
    const response = e.response as { status?: number } | undefined;
    const status =
      typeof e.status === 'number'
        ? e.status
        : typeof e.statusCode === 'number'
          ? (e.statusCode as number)
          : typeof response?.status === 'number'
            ? response.status
            : undefined;
    return {
      code: typeof e.code === 'string' ? e.code : undefined,
      status,
      message: typeof e.message === 'string' ? e.message : String(error),
    };
  }
  if (typeof error === 'string') return { message: error };
  return { message: 'An unexpected error occurred' };
}

/**
 * Check if an error is *expiry-shaped* — a 401, a PostgREST JWT rejection, a
 * missing refresh token. These are candidates, not verdicts: a server-side JWT
 * misconfiguration answers 401 too while the browser still holds a perfectly
 * good session. Distinct from a generic 403 "you lack permission", which is
 * never a candidate. `handleAuthExpiry` arbitrates a candidate against the live
 * session before anyone is sent to sign-in.
 */
export function isSessionExpiredError(error: unknown): boolean {
  const { code, status, message } = readErrorParts(error);

  if (status === 401) return true;
  if (code && SUPABASE_SESSION_EXPIRED_CODES.has(code)) return true;

  const lower = message.toLowerCase();
  return SESSION_EXPIRED_MESSAGE_FRAGMENTS.some((fragment) =>
    lower.includes(fragment)
  );
}

/**
 * GoTrue error codes that are the server's *verdict on the session* rather than
 * a transport hiccup. Used only by the liveness probe — an error carrying one
 * of these is the auth server saying "this session is not valid", which is the
 * one thing that may end in a hard redirect.
 */
const AUTHORITATIVE_AUTH_ERROR_CODES = new Set([
  'session_not_found',
  'session_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'bad_jwt',
  'no_authorization',
  'user_not_found',
  'invalid_claim',
]);

/**
 * Message fingerprints of a request that never reached an answer. Offline, DNS
 * flap, aborted fetch, dead socket — the session's validity is simply unknown.
 */
const TRANSPORT_ERROR_MESSAGE_FRAGMENTS = [
  'failed to fetch',
  'network request failed',
  'networkerror',
  'load failed', // Safari's wording for a fetch that never landed
  'network error',
  'econnrefused',
  'econnreset',
  'enotfound',
  'etimedout',
  'socket hang up',
  'timed out',
  'timeout',
  'aborted',
];

type AuthProbeErrorClass = 'authoritative' | 'transport';

/**
 * Decide whether an error handed back by `getSession()` / `getUser()` is the
 * auth server *rejecting the session* or merely a failure to ask it.
 *
 * This distinction is load-bearing: auth-js RETURNS its errors on
 * `{ data, error }` rather than throwing, so an offline `getUser()` resolves
 * with `{ user: null, error: AuthRetryableFetchError }` — indistinguishable
 * from a real rejection unless you look. Treating that as death hard-redirects
 * a perfectly live session the moment the network hiccups.
 *
 * Detection is duck-typed rather than importing `isAuthRetryableFetchError`
 * from `@supabase/supabase-js`: this module is loaded from plain utility paths
 * and deliberately pulls the Supabase SDK in only via dynamic import (see
 * `probeSessionLiveness`). The marker is the SDK's own public contract —
 * `isAuthRetryableFetchError` is itself just `error.name ===
 * 'AuthRetryableFetchError'`.
 *
 * Unknown shapes classify as `transport`. Surfacing an error over a live
 * session is a nuisance; booting a live session loses the user's work.
 */
function classifyAuthProbeError(error: unknown): AuthProbeErrorClass {
  const name =
    error && typeof error === 'object'
      ? (error as { name?: unknown }).name
      : undefined;

  // auth-js already decided this one was retryable transport.
  if (name === 'AuthRetryableFetchError') return 'transport';

  const { code, status, message } = readErrorParts(error);

  // The server declining to answer (rate limit, outage, gateway) says nothing
  // about the session. `status: 0` is auth-js's stand-in for "fetch never
  // landed".
  if (typeof status === 'number') {
    if (status === 0 || status === 429 || status >= 500) return 'transport';
    // 4xx with auth semantics: the server looked at the token and said no.
    if (status === 400 || status === 401 || status === 403) {
      return 'authoritative';
    }
  }

  if (code && AUTHORITATIVE_AUTH_ERROR_CODES.has(code)) return 'authoritative';

  const lower = message.toLowerCase();
  if (TRANSPORT_ERROR_MESSAGE_FRAGMENTS.some((fragment) => lower.includes(fragment))) {
    return 'transport';
  }
  if (SESSION_EXPIRED_MESSAGE_FRAGMENTS.some((fragment) => lower.includes(fragment))) {
    return 'authoritative';
  }

  return 'transport';
}

/**
 * Check if error is an auth error (expired session, missing token, or a
 * forbidden/401 response). Now also recognizes Supabase-shaped errors so the
 * query cache can route an expired session to sign-in rather than swallowing
 * it and rendering a misleading empty/zeroed dashboard.
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof AppError) {
    if (
      error.code === 'UNAUTHORIZED' ||
      error.code === 'TOKEN_EXPIRED' ||
      error.code === 'AUTHENTICATION_REQUIRED' ||
      error.statusCode === 401
    ) {
      return true;
    }
  }
  return isSessionExpiredError(error);
}

/**
 * Route the browser to the sign-in page, preserving the current path as a
 * `callbackUrl` so the user lands back where they were after re-authenticating.
 * Matches the canonical redirect shape used by `useRequireAuth` /
 * `middleware.ts` (`/auth/signin?callbackUrl=…`).
 *
 * Guards:
 *  - no-op on the server (no `window`),
 *  - no-op if we're already on an `/auth/*` page (prevents redirect loops),
 *  - de-duped via a module-level flag so a burst of failing queries triggers
 *    exactly one navigation,
 *  - rate-limited by a `sessionStorage` stamp. The module flag dies with the
 *    page, so a bounce back from middleware (valid cookie, misconfigured
 *    verifier) would otherwise reload forever. The stamp survives the reload
 *    and bounds any pathological bounce to one navigation per 30s per tab.
 *
 * Returns `true` when the page is being replaced (navigation fired, or one is
 * already in flight) and `false` when a guard declined. Callers must read it:
 * "we redirected" is the only justification for throwing away a pending error
 * surface, and every guard above is a way for that justification to be false.
 */
let signInRedirectInFlight = false;

const AUTH_REDIRECT_STAMP_KEY = 'patina:auth-redirect-at';
const AUTH_REDIRECT_MIN_INTERVAL_MS = 30_000;

function readAuthRedirectStamp(): number | null {
  try {
    const raw = window.sessionStorage.getItem(AUTH_REDIRECT_STAMP_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    // Private mode / storage disabled — fall back to the module-level flag,
    // which still de-dupes within a single page load.
    return null;
  }
}

function writeAuthRedirectStamp(at: number): void {
  try {
    window.sessionStorage.setItem(AUTH_REDIRECT_STAMP_KEY, String(at));
  } catch {
    // See readAuthRedirectStamp — storage being unavailable is not fatal.
  }
}

export function redirectToSignIn(reason?: string): boolean {
  if (typeof window === 'undefined') return false;
  // Already on the sign-in surface — nothing to navigate to. Note that
  // `/auth/accept-invite` is an *authenticated* page under this prefix, so this
  // branch is reached by real working pages, not just the sign-in form.
  if (window.location.pathname.startsWith('/auth')) return false;
  // A navigation is already scheduled from this page load; the document is on
  // its way out either way.
  if (signInRedirectInFlight) return true;

  const now = Date.now();
  const lastRedirectAt = readAuthRedirectStamp();
  if (
    lastRedirectAt !== null &&
    now - lastRedirectAt < AUTH_REDIRECT_MIN_INTERVAL_MS
  ) {
    console.warn(
      '[auth] Suppressing sign-in redirect — one already fired within the last 30s (possible redirect loop)'
    );
    return false;
  }
  writeAuthRedirectStamp(now);

  signInRedirectInFlight = true;

  if (reason) {
    console.warn(`[auth] Redirecting to sign-in: ${reason}`);
  }

  const callbackUrl = `${window.location.pathname}${window.location.search}`;
  window.location.assign(
    `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`
  );
  return true;
}

/**
 * Ask Supabase whether the session is actually dead before booting the user.
 *
 * An expiry-shaped error is only a nomination: a server-side JWT verification
 * misconfiguration answers 401 with the browser's session perfectly alive, and
 * hard-navigating on that produces a reload loop (middleware bounces the valid
 * cookie straight back, and the module-level de-dupe flag resets on reload).
 *
 * De-duped via an in-flight promise so a burst of 401s runs exactly one probe.
 */
let sessionLivenessProbe: Promise<void> | null = null;

/**
 * The surfaces folded into the current in-flight probe. A burst of 401s is a
 * burst of *distinct* surfaces (one query, one mutation, two pages), and each
 * one gave up its own error display on the strength of `handleAuthExpiry`
 * returning `true`. Unless the page is actually being replaced, every one of
 * them is owed its surface back — not just the first. Drained when the probe
 * settles, with the verdict, so each surface can say something true.
 */
let pendingSurfaceRestorers: Array<(outcome: SessionLivenessVerdict) => void> =
  [];

/** How long the whole probe may take before we stop waiting on it. */
const SESSION_LIVENESS_PROBE_TIMEOUT_MS = 6_000;

export type SessionLivenessVerdict = 'dead' | 'alive' | 'inconclusive';

function restorePendingSurfaces(outcome: SessionLivenessVerdict): void {
  const restorers = pendingSurfaceRestorers;
  pendingSurfaceRestorers = [];
  for (const restore of restorers) {
    try {
      restore(outcome);
    } catch (callbackError) {
      // One surface throwing must not rob the others of theirs.
      console.error('[auth] restoring an error surface failed', callbackError);
    }
  }
}

/**
 * Turn an error returned/thrown by a probe call into a verdict. Only an
 * authoritative rejection is death; everything else leaves the question open,
 * and an open question never navigates.
 */
function verdictFromProbeError(error: unknown): SessionLivenessVerdict {
  return classifyAuthProbeError(error) === 'authoritative'
    ? 'dead'
    : 'inconclusive';
}

async function probeSessionLiveness(): Promise<SessionLivenessVerdict> {
  // Dynamic import: this module is deliberately non-React and imported from
  // plain utility paths, so it must not pull the Supabase client in at load
  // time (or risk an import cycle). `createBrowserClient` is a singleton —
  // same precedent as `src/hooks/use-auth.ts`.
  const { createBrowserClient } = await import('@patina/supabase');
  const supabase = createBrowserClient();

  // Stage 1 — the cheap, local read. getSession() transparently refreshes an
  // expired access token; a refresh the server *rejects* yields
  // `session: null`, but a refresh that never reached the server yields an
  // `AuthRetryableFetchError` — which is a question, not an answer.
  const { data, error } = await supabase.auth.getSession();

  if (error) return verdictFromProbeError(error);

  // A cleanly absent session — the server was asked (or nothing was ever
  // stored) and there is simply nothing to authenticate with. This is the ONE
  // verdict stage 1 may call on its own.
  //
  // Note what is deliberately absent: no `expires_at <= Date.now()` check. That
  // reads the *client's* clock, and a workstation running a few minutes fast
  // makes every freshly issued token look expired — hard-redirecting a live
  // session without one network call. When a session object exists, getUser()
  // is the arbiter, full stop.
  if (!data?.session) return 'dead';

  // Stage 2 — the authoritative check. getSession() only reads local storage,
  // so a session revoked server-side (admin revoke, global sign-out, deleted
  // account) reads "alive" until the access token's own expiry. Only getUser()
  // actually asks the server, so it — not stage 1 — is the arbiter.
  //
  // auth-js RETURNS its errors rather than throwing, so `userError` covers both
  // "the server rejected this token" and "we never reached the server"; only
  // the former is death.
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) return verdictFromProbeError(userError);
    // No error and no user is the server answering "nobody" — authoritative.
    return userData?.user ? 'alive' : 'dead';
  } catch (thrown) {
    return verdictFromProbeError(thrown);
  }
}

/**
 * Race the probe against a deadline. Without it a hung getSession/getUser holds
 * the de-dupe promise forever, every later 401 folds into it, and a genuinely
 * dead session can never redirect.
 */
function probeSessionLivenessWithTimeout(): Promise<SessionLivenessVerdict> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<SessionLivenessVerdict>((resolve) => {
    timer = setTimeout(
      () => resolve('inconclusive'),
      SESSION_LIVENESS_PROBE_TIMEOUT_MS
    );
  });

  return Promise.race([probeSessionLiveness(), deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function confirmExpiredSessionThenRedirect(
  options?: AuthExpiryOptions
): Promise<void> | void {
  // Server-side there is no browser session to probe and nowhere to navigate.
  // The caller still gets `true` from handleAuthExpiry — the shape claim holds.
  if (typeof window === 'undefined') return;

  if (options?.restoreErrorSurface) {
    pendingSurfaceRestorers.push(options.restoreErrorSurface);
  }
  if (sessionLivenessProbe) return sessionLivenessProbe;

  sessionLivenessProbe = (async () => {
    const verdict = await probeSessionLivenessWithTimeout().catch(
      // The probe itself failed (offline, transport error). A network blip must
      // never boot the user.
      (): SessionLivenessVerdict => 'inconclusive'
    );

    if (verdict === 'dead') {
      // Redirect FIRST, then decide what to do with the collected surfaces —
      // because `redirectToSignIn` can decline (already on an /auth page, a
      // navigation loop-bounded by the 30s stamp). Dropping the surfaces before
      // asking left the declined case with no toast, no navigation, and no
      // retry (auth errors are never retried): a button that does nothing at
      // all. `/auth/accept-invite` is an authenticated page, so that case is
      // real, not theoretical.
      if (redirectToSignIn('session expired (confirmed dead)')) {
        // The page is about to be replaced — the collected surfaces are dropped
        // rather than flashing a toast over a navigating document.
        pendingSurfaceRestorers = [];
        return;
      }

      console.warn(
        '[auth] session confirmed dead but the sign-in redirect declined (already on /auth, or loop-bounded) — surfacing the expiry error instead of leaving the caller silent'
      );
      // The session really is dead here, so the honest surface is the original
      // expiry copy — "sign in again" is true advice on this branch.
      restorePendingSurfaces('dead');
      return;
    }

    console.warn(
      verdict === 'alive'
        ? '[auth] auth-shaped error but session is alive — not redirecting (check server-side JWT verification config)'
        : '[auth] session liveness probe was inconclusive — not redirecting; surfacing the original error'
    );
    restorePendingSurfaces(verdict);
  })().finally(() => {
    // Cleared unconditionally so a later 401 can re-probe — including after an
    // inconclusive verdict, which is the only way a hung probe stops blocking
    // a genuinely dead session from redirecting.
    sessionLivenessProbe = null;
  });

  return sessionLivenessProbe;
}

/**
 * What a caller hands `handleAuthExpiry` alongside the error.
 */
export interface AuthExpiryOptions {
  /**
   * Restores the caller's own error surface whenever the user is going to stay
   * on this page — the session is demonstrably alive, the probe was
   * inconclusive, or the session is dead but the redirect declined. Mandatory
   * in spirit: the caller suppressed its toast/band on the strength of `true`,
   * and auth errors are never retried, so without this a 401 is a button that
   * does nothing at all.
   *
   * The verdict is passed because it changes what is *true* to say. On `dead`
   * the expiry copy is honest ("sign in again"). On `alive` / `inconclusive`
   * it is the exact opposite of the verdict — pass the error through
   * `toLiveSessionError` for neutral copy instead.
   */
  restoreErrorSurface?: (outcome: SessionLivenessVerdict) => void;
}

/**
 * Derive the surface to show for an expiry-*shaped* error whose session turned
 * out to be fine.
 *
 * Every error that reaches the arbiter is expiry-shaped by construction, so
 * `handleApiError` maps it to TOKEN_EXPIRED/UNAUTHORIZED and the toast reads
 * "Your session has expired. Please sign in again" — the opposite of the
 * verdict. A user who obeys it gets bounced straight back by middleware, which
 * still sees a perfectly good cookie. This keeps the original code and message
 * in `details` for logs, and overrides only what the user reads.
 */
export function toLiveSessionError(error: unknown): AppError {
  const original = handleApiError(error);
  return new AppError(
    {
      code: 'REQUEST_FAILED_SESSION_ALIVE',
      message: getUserFriendlyMessage('REQUEST_FAILED_SESSION_ALIVE', ''),
      details: {
        originalCode: original.code,
        originalMessage: original.message,
        originalDetails: original.details,
      },
      requestId: original.requestId,
      traceId: original.traceId,
    },
    original.statusCode
  );
}

/**
 * If the given error is expiry-shaped, start the liveness probe and return
 * `true` so the caller suppresses its own error surface. `true` is a claim
 * about the error's *shape*, not a promise that we navigated — navigation
 * happens only if the probe proves the session dead AND the redirect guards
 * allow it; in every other case the caller's `restoreErrorSurface` puts its
 * surface back. Otherwise return `false` so
 * the caller falls through to normal error handling (toast, inline error
 * state, etc.). Centralizing the decision here keeps the query cache, mutation
 * cache, and any page-level guard consistent.
 */
export function handleAuthExpiry(
  error: unknown,
  options?: AuthExpiryOptions
): boolean {
  if (!isSessionExpiredError(error)) return false;
  void confirmExpiredSessionThenRedirect(options);
  return true;
}

/**
 * Log error to monitoring service (e.g., Sentry, DataDog)
 */
export function logError(error: unknown, context?: Record<string, any>) {
  // In production, send to error monitoring service
  if (process.env.NODE_ENV === 'production') {
    // Example: Sentry.captureException(error, { extra: context });
    console.error('Error logged:', error, context);
  } else {
    console.error('Error:', error, context);
  }
}

/**
 * Handle API errors and convert to AppError
 */
export function handleApiError(error: any): AppError {
  // Already normalized — pass through untouched so we never re-wrap (and lose
  // the original statusCode) when a caller double-handles an error.
  if (error instanceof AppError) {
    return error;
  }

  // Supabase-shaped errors (PostgrestError / AuthError) are plain objects with
  // `.code` / `.status` and NO Axios `.response` / `.request`. Detect an
  // expired session here so it carries a 401 + TOKEN_EXPIRED code downstream
  // (isAuthError, the query cache, redirectToSignIn). Without this branch the
  // error fell through to the generic case, lost its 401-ness, and the
  // decisions dashboard rendered a misleading "0 open / 100%".
  if (error && typeof error === 'object' && !error.response && !error.request) {
    if (isSessionExpiredError(error)) {
      return new AppError(
        {
          code: 'TOKEN_EXPIRED',
          message: error.message || 'Your session has expired. Please sign in again',
          details: { code: error.code, status: error.status },
        },
        401
      );
    }

    // Postgres CHECK violation from the 00187 invoice guard: deleting a
    // project_ffe_items row that a live invoice line bills makes the FK's
    // ON DELETE SET NULL violate chk_line_items_ffe_kind. Translate the raw
    // constraint error into designer language here so the global mutation
    // toast is friendly. (The FF&E drawer also disables Remove proactively
    // via useFfeInvoiceCoverage — this mapping is the fallback for stale
    // coverage caches and non-drawer delete paths.)
    if (
      error.code === '23514' &&
      typeof error.message === 'string' &&
      error.message.includes('chk_line_items_ffe_kind')
    ) {
      return new AppError(
        {
          code: 'FFE_ITEM_BILLED',
          message: 'This item is on an invoice — void the invoice before removing it.',
          details: { code: error.code },
        },
        409
      );
    }
  }

  // Axios error
  if (error.response) {
    const { status, data } = error.response;

    // For 401 errors, preserve the status code to identify auth errors
    return new AppError(
      {
        code: data?.code || (status === 401 ? 'UNAUTHORIZED' : 'API_ERROR'),
        message: data?.message || 'An API error occurred',
        details: data?.details,
        requestId: data?.requestId,
        traceId: data?.traceId,
      },
      status
    );
  }

  // Network error (service unavailable, ECONNREFUSED, etc.)
  if (error.request) {
    // Check if it's a connection refused error (service down)
    const isServiceDown = error.code === 'ECONNREFUSED' ||
                         error.message?.includes('ECONNREFUSED') ||
                         error.message?.includes('Network Error');

    return new AppError({
      code: isServiceDown ? 'SERVICE_UNAVAILABLE' : 'NETWORK_ERROR',
      message: isServiceDown
        ? 'Service temporarily unavailable. Please try again later.'
        : 'Network error. Please check your connection',
      details: { originalError: error.code || error.message },
    });
  }

  // Generic error
  return new AppError(error.message || 'An unexpected error occurred');
}

/**
 * Retry logic for failed requests
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delay?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const { maxRetries = 3, delay = 1000, shouldRetry = () => true } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Exponential backoff
      const backoffDelay = delay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }

  throw lastError;
}

/**
 * Toast notification helper for errors
 */
export interface ToastOptions {
  title?: string;
  description: string;
  variant?: 'default' | 'destructive' | 'success';
  duration?: number;
}

let toastFunction: ((options: ToastOptions) => void) | null = null;

export function setToastFunction(fn: (options: ToastOptions) => void) {
  toastFunction = fn;
}

export function showErrorToast(error: unknown, title = 'Error') {
  const message = getErrorMessage(error);
  if (toastFunction) {
    toastFunction({
      title,
      description: message,
      variant: 'destructive',
      duration: 5000,
    });
  }
}

export function showSuccessToast(message: string, title = 'Success') {
  if (toastFunction) {
    toastFunction({
      title,
      description: message,
      variant: 'success',
      duration: 3000,
    });
  }
}
