// test-account-login — pure request logic (no Deno.serve, no network).
//
// Split out from index.ts so the allowlist/rate-limit/response-shape logic
// can be tested with dependency injection (field-login-token / po-send /
// aesthete-ask convention: importing index.ts would boot Deno.serve).
// index.ts wires the real Supabase + app_setting deps.
//
// CONTEXT: a designated shared TEST ACCOUNT (tester@patina.cloud) needs to
// sign into the designer portal with a static OTP code, for external testers
// who have no access to that mailbox. This is an owner-authorized, narrowly
// scoped pre-auth path: only email/code pairs matching a Vault-backed
// allowlist (public.app_setting 'test_login_accounts' / 'test_login_code',
// 00258) succeed, and success mints a normal single-use GoTrue magiclink
// token — the portal completes sign-in exactly as it would for a real OTP.
//
// SECURITY:
//   - Fail closed: EITHER setting missing/empty -> 403 (never a bypass).
//   - Every failure mode (bad email, bad code, missing config, generateLink
//     failure) returns the SAME generic 403 body, so a caller can never learn
//     whether a given email is on the allowlist.
//   - Code comparison is constant-time (constantTimeEqual below) so response
//     latency cannot be used to guess the static code character-by-character.
//   - The submitted code and the minted token_hash are NEVER logged.
//   - Rate limiting runs FIRST, before anything else the request could cost:
//     both caps are count-only reads, evaluated before the two Vault-backed
//     app_setting RPCs and before the attempt row is written. A rejected
//     request therefore writes NOTHING — it cannot extend its own trailing
//     window (or the global one) by logging itself, so the caps are real
//     ceilings rather than self-sustaining ones — and cannot force a config
//     read either. 20 attempts from one IP, or 300 across all IPs, in the
//     trailing 15 minutes are the last ones accepted; the next is 429 (the
//     comparison is >=, against the count of rows ALREADY in the window).
//     The global cap bounds a flood that rotates X-Forwarded-For to dodge
//     the per-IP counter.
//   - Only a request that passed both caps writes an attempt row, and that
//     row stores the submitted email ONLY when it is allowlisted. The portal
//     falls back to this endpoint on every failed OTP, so logging the raw
//     address would accumulate real users' emails pre-auth.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GENERIC_DENY_BODY = { error: 'invalid_credentials' } as const;

/** JSON response with CORS + no-store (token-bearing responses must not cache). */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

/** Same body for every failure mode — never reveals which check failed. */
function deny(): Response {
  return json(GENERIC_DENY_BODY, 403);
}

/**
 * Caller IP, by preference chain:
 *   1. `cf-connecting-ip` — written by the Cloudflare edge in front of this
 *      deployment, overwriting any client-supplied copy. When present it is
 *      the caller's real address and cannot be spoofed.
 *   2. `x-real-ip` — the same single-address form from a non-Cloudflare proxy
 *      (Kong, or a local `supabase functions serve`).
 *   3. the FIRST hop of `x-forwarded-for` — the address the earliest proxy
 *      recorded for the client. Proxies APPEND, so later hops are proxy
 *      addresses, not the caller.
 *   4. 'unknown' when nothing identifies the caller.
 *
 * This mirrors the portal's QR-token limiter
 * (apps/designer-portal/src/app/api/auth/qr/generate/route.ts), which prefers
 * `cf-connecting-ip` and reads the FIRST x-forwarded-for hop only as a
 * development fallback.
 *
 * HONESTY: reaching step 3 means no trusted proxy header was set, and
 * `x-forwarded-for` IS caller-controlled there — a flood can rotate it to get
 * a fresh per-IP bucket per request. That is bounded, not prevented: the
 * global 300/15min cap limits total volume regardless of claimed IP, and the
 * Vault-backed email allowlist means volume alone never yields a token.
 */
export function getClientIp(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;

  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const firstHop = xff.split(',')[0]?.trim();
    if (firstHop) return firstHop;
  }

  return 'unknown';
}

/**
 * Constant-time string comparison (byte length + XOR accumulation, no
 * early return on mismatch) so response timing can't be used to recover the
 * static code one character at a time. Unequal-length inputs still take a
 * comparison pass (against the longer input) before returning false, to
 * avoid an obvious length-based timing tell.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  const len = Math.max(bufA.length, bufB.length, 1);
  let diff = bufA.length === bufB.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const byteA = i < bufA.length ? bufA[i] : 0;
    const byteB = i < bufB.length ? bufB[i] : 0;
    diff |= byteA ^ byteB;
  }
  return diff === 0;
}

/** Vault-backed allowlist config (public.app_setting, 00258). */
export interface TestLoginConfig {
  /** Comma-separated allowlisted emails, or null/empty if unset. */
  accounts: string | null;
  /** Static OTP code, or null/empty if unset. */
  code: string | null;
}

/** Either the minted hashed token, or a non-secret error code (never logged/returned verbatim to the caller). */
export type GenerateResult = { tokenHash: string } | { error: string };

export interface TestAccountLoginDeps {
  /**
   * Read the two Vault-backed app settings this function depends on. Called
   * ONLY after both rate-limit checks pass, so a rejected request never costs
   * the two app_setting RPCs.
   */
  getConfig: () => Promise<TestLoginConfig>;
  /**
   * Insert one row per ACCEPTED attempt — after both rate-limit checks, before
   * the credential decision. Rate-limited requests are never recorded, so a
   * caller already over a cap cannot keep the window (or the global counter)
   * alive by hammering the endpoint. `email` is non-null ONLY for an
   * allowlisted address — see the caller.
   */
  recordAttempt: (ip: string, email: string | null) => Promise<void>;
  /**
   * True if this IP already has 20 or more attempts in the trailing 15
   * minutes (count-only read — this request has not been recorded yet, so 20
   * is the real per-IP ceiling).
   */
  isRateLimited: (ip: string) => Promise<boolean>;
  /**
   * True if attempts across ALL IPs in the trailing 15 minutes already number
   * 300 or more. Bounds a flood that rotates X-Forwarded-For to dodge the
   * per-IP limiter.
   */
  isGloballyRateLimited: () => Promise<boolean>;
  /** Mint a magiclink for `email`; return its hashed_token, or a non-secret error code. */
  generateMagiclinkHash: (email: string) => Promise<GenerateResult>;
}

function parseAllowlist(accounts: string): string[] {
  return accounts
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Core handler. Contract:
 *   OPTIONS                    -> 200 CORS preflight
 *   non-POST                   -> 405 { error: 'method_not_allowed' }
 *   rate limited (>=20/15min per IP, or >=300/15min across all IPs)
 *                               -> 429 { error: 'rate_limited' }, and NOTHING
 *                                  else runs: no config read, no attempt row
 *   missing config / bad email / bad code / generateLink failure
 *                               -> 403 { error: 'invalid_credentials' } (identical body every time)
 *   ok                         -> 200 { token_hash }
 */
export async function handleTestAccountLogin(
  req: Request,
  deps: TestAccountLoginDeps,
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const ip = getClientIp(req);

  // Rate limits are evaluated FIRST, on count-only reads: before the Vault
  // RPCs and before any row is written. A rejected request must cost nothing
  // and, critically, must not log itself — otherwise a caller already over the
  // cap would keep its own trailing window (and the global counter) topped up
  // forever, and could pin the endpoint in a permanently-limited state.
  if (await deps.isRateLimited(ip)) {
    return json({ error: 'rate_limited' }, 429);
  }

  // Global cap: a flood spoofing a fresh X-Forwarded-For per request never
  // trips the per-IP limiter, so total volume is bounded too.
  if (await deps.isGloballyRateLimited()) {
    return json({ error: 'rate_limited' }, 429);
  }

  let body: { email?: unknown; code?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Malformed JSON is treated as a bad-credentials attempt below, not a
    // distinct error shape — no extra information leak.
  }

  const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
  const rawCode = typeof body.code === 'string' ? body.code : '';

  // Config is read before the attempt row is written only so that row can omit
  // the submitted address unless it is allowlisted: the portal falls back to
  // this endpoint on every failed OTP, so persisting rawEmail would collect
  // real users' email addresses in a pre-auth side table.
  const config = await deps.getConfig();
  const allowlist = config.accounts ? parseAllowlist(config.accounts) : [];
  const emailLower = rawEmail.toLowerCase();
  const emailAllowed = allowlist.includes(emailLower);

  // Record the attempt BEFORE the credential decision, per spec — this request
  // passed both caps, so it counts toward the next one's window.
  await deps.recordAttempt(ip, emailAllowed ? emailLower : null);

  // Fail closed: either setting missing/empty means the path is unconfigured.
  if (!config.accounts || !config.code) {
    return deny();
  }

  // Evaluate BOTH checks unconditionally (no short-circuit) so response
  // timing doesn't leak which check failed.
  const codeMatches = constantTimeEqual(rawCode, config.code);

  if (!emailAllowed || !codeMatches) {
    return deny();
  }

  const result = await deps.generateMagiclinkHash(emailLower);
  if ('error' in result) {
    // `result.error` is a non-secret error code — logged by the caller (index.ts
    // wiring), never returned to the client and never the token itself.
    return deny();
  }

  return json({ token_hash: result.tokenHash });
}
