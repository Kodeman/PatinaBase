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
//   - Rate limiting: one attempt row is written per request BEFORE the
//     credential decision; the request is rejected 429 if that IP has more
//     than 20 attempts in the trailing 15 minutes, or if ALL IPs together
//     have more than 300 in that window (the global cap bounds a flood that
//     rotates X-Forwarded-For to dodge the per-IP counter).
//   - The attempt row stores the submitted email ONLY when it is allowlisted.
//     The portal falls back to this endpoint on every failed OTP, so logging
//     the raw address would accumulate real users' emails pre-auth.

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
 * Extracts the caller IP from the LAST hop of X-Forwarded-For.
 *
 * Proxies APPEND to this header, so the first hop is whatever the client sent
 * and is fully caller-controlled — an attacker rotating it defeats a per-IP
 * limiter entirely. The last hop is the address observed by the nearest
 * trusted proxy. Same reasoning as the portal's QR-token limiter
 * (apps/designer-portal/src/app/api/auth/qr/generate/route.ts), which likewise
 * refuses to trust the first hop.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (!xff) return 'unknown';
  const hops = xff.split(',').map((hop) => hop.trim()).filter(Boolean);
  return hops[hops.length - 1] || 'unknown';
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
  /** Read the two Vault-backed app settings this function depends on. */
  getConfig: () => Promise<TestLoginConfig>;
  /**
   * Insert one row per attempt (fires before the credential decision).
   * `email` is non-null ONLY for an allowlisted address — see the caller.
   */
  recordAttempt: (ip: string, email: string | null) => Promise<void>;
  /** True if this IP has more than 20 attempts in the trailing 15 minutes. */
  isRateLimited: (ip: string) => Promise<boolean>;
  /**
   * True if attempts across ALL IPs in the trailing 15 minutes exceed 300.
   * Bounds a flood that rotates X-Forwarded-For to dodge the per-IP limiter.
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
 *   rate limited (>20/15min per IP, or >300/15min across all IPs)
 *                               -> 429 { error: 'rate_limited' }
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

  let body: { email?: unknown; code?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Malformed JSON is treated as a bad-credentials attempt below, not a
    // distinct error shape — no extra information leak.
  }

  const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
  const rawCode = typeof body.code === 'string' ? body.code : '';
  const ip = getClientIp(req);

  // Config is read up front only so the attempt row can be written WITHOUT the
  // submitted address unless it is allowlisted: the portal falls back to this
  // endpoint on every failed OTP, so persisting rawEmail would collect real
  // users' email addresses in a pre-auth side table.
  const config = await deps.getConfig();
  const allowlist = config.accounts ? parseAllowlist(config.accounts) : [];
  const emailLower = rawEmail.toLowerCase();
  const emailAllowed = allowlist.includes(emailLower);

  // Record the attempt BEFORE the credential decision, per spec.
  await deps.recordAttempt(ip, emailAllowed ? emailLower : null);

  if (await deps.isRateLimited(ip)) {
    return json({ error: 'rate_limited' }, 429);
  }

  // Global cap: a flood spoofing a fresh X-Forwarded-For per request never
  // trips the per-IP limiter, so total volume is bounded too.
  if (await deps.isGloballyRateLimited()) {
    return json({ error: 'rate_limited' }, 429);
  }

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
