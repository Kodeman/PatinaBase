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

const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_PATTERN = /^[0-9a-fA-F:]{2,45}$/;

/**
 * THE ADDRESS, ONLY IF IT IS ONE (R-CA, W4 r10 MAJOR-2).
 *
 * `resolveClientIp` above answers what the headers SAY, which is right for an
 * audit trail — `proposals.signed_ip` records the claim, whatever it is. It is
 * wrong for a rate bucket: `paperwork_link_rate_limit_hit` used to take an
 * `inet`, so `cf-connecting-ip: not-an-ip` (and the perfectly ordinary proxy
 * value `1.2.3.4:5678`) raised 22P02, and a door that treated an unreadable
 * limiter as a pass had its only abuse control switched off by one header.
 *
 * So the bucket's address goes through here first: the port is stripped from
 * an `ip:port` or `[v6]:port` value and the rest must read as a v4 or v6
 * address. Anything else is null, and the paperwork door then buckets by the
 * link's own row id instead of by nothing.
 */
export function normalizeCallerIp(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;

  const bracketed = /^\[([0-9a-fA-F:.]+)\](?::\d{1,5})?$/.exec(value);
  const candidate = bracketed
    ? bracketed[1]
    : /^[0-9.]+:\d{1,5}$/.test(value)
      ? value.slice(0, value.lastIndexOf(':'))
      : value;

  if (IPV4_PATTERN.test(candidate)) return candidate;
  if (candidate.includes(':') && IPV6_PATTERN.test(candidate.replace(/\./g, ''))) {
    return candidate;
  }
  return null;
}
