/**
 * safeInternalPath — the one gate every post-auth redirect passes through.
 *
 * A `callbackUrl`/`next` value is only ever minted by this portal's own
 * middleware, and it is always a path + query on THIS origin. Anything else —
 * an absolute URL (`https://evil.example`), a protocol-relative
 * `//evil.example`, or a backslash-smuggled variant (`/\evil.example`, which
 * browsers normalise to `//evil.example`) — is an open-redirect attempt or
 * junk, and is dropped in favour of the Desk.
 *
 * This mirrors, verbatim in semantics, the `safeCallbackUrl` guard in
 * `src/middleware.ts` (the server leg): normalise backslashes, require a
 * single leading slash, reject anything carrying a scheme. Four legs now agree
 * — middleware, /auth/signin, /auth/mfa-verify, /auth/callback — so a value
 * the middleware would refuse cannot be honoured by a client-side leg later in
 * the same round trip.
 *
 * Returns a path safe to hand to `router.push`/`router.replace`/
 * `window.location.href`; never returns null, so callers have no unsafe
 * branch to forget.
 */

/** Where a rejected (or absent) callback lands. The Document's front door. */
export const SAFE_INTERNAL_PATH_FALLBACK = '/desk';

/** `scheme:` at the start of the value — `javascript:`, `https:`, `data:`, … */
const SCHEME_PREFIX = /^[a-z][a-z0-9+.\-]*:/i;

export function safeInternalPath(
  raw: string | null | undefined,
  fallback: string = SAFE_INTERNAL_PATH_FALLBACK,
): string {
  if (!raw) return fallback;
  // Browsers treat `\` as `/` in URLs, so normalise before judging: without
  // this, `/\evil.example` passes a naive leading-slash test and then
  // navigates off-origin.
  const value = raw.replace(/\\/g, '/');
  if (SCHEME_PREFIX.test(value)) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}
