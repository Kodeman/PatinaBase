/**
 * Client IP resolution for server-side audit trails (e.g.
 * `proposals.signed_ip` on the e-signature route), in trust order:
 *
 *  1. `cf-connecting-ip` — Cloudflare's own edge header, set on every
 *     request that reaches a Worker through Cloudflare's network (i.e. all
 *     production traffic). Authoritative and not attacker-supplied.
 *  2. `x-forwarded-for` first hop — covers non-Workers environments (local
 *     dev behind a reverse proxy) where a forwarding chain may be present.
 *  3. `x-client-ip` — a legacy header. The client portal's middleware used to
 *     stamp it for PAGE routes under `/proposals`; that tree is retired and
 *     folds before it renders, and API routes never matched the stamp anyway,
 *     so nothing in this portal sets it now. Kept as a last-resort fallback
 *     for a proxy that supplies it.
 *
 * Lives outside any `route.ts` deliberately: Next's App Router validates
 * that route files only export recognized handlers/config (GET, POST,
 * dynamic, etc.) — an extra named export like this one fails that check at
 * build time (`.next/types` route validation).
 */
export function resolveClientIp(headers: Headers): string | null {
  const cfConnectingIp = headers.get('cf-connecting-ip')?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  const firstHop = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (firstHop) return firstHop;

  const legacyClientIp = headers.get('x-client-ip')?.trim();
  if (legacyClientIp) return legacyClientIp;

  return null;
}
