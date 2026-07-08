// capture-from-url · SSRF hard-guards.
//
// This module is the security boundary for fetching an arbitrary,
// user-supplied product URL server-side. Everything a designer pastes is
// hostile until proven otherwise: it could point at the cloud metadata
// endpoint (169.254.169.254), a service on the loopback, a box on the private
// LAN, or a public hostname that DNS-rebinds to one of those.
//
// Defense is layered:
//   1. `assertSafeUrl` (PURE, no network) — scheme allow-list, plus a literal-IP
//      and `localhost` block. The WHATWG URL parser canonicalizes non-standard
//      IPv4 encodings (decimal `2130706433`, hex `0x7f000001`, octal
//      `017700000001`) to dotted-quad BEFORE we see them, so the literal-IP
//      check catches those forms too (verified against Deno's URL parser).
//   2. `assertHostResolvesSafe` (network) — resolves A + AAAA and rejects if ANY
//      resolved address is blocked. This is the DNS-rebinding defense and MUST
//      run on the host of every redirect hop, immediately before each fetch.
//   3. `fetchHtml` — manual redirect following (≤3 hops, re-validating each),
//      a 5s timeout, a 2MB response cap, and a `text/html`-only content-type
//      gate.
//
// The pure classifiers (`isBlockedAddress`, `assertSafeUrl`) are exported so
// `ssrf_test.ts` can exercise the hostile matrix WITHOUT `--allow-net`.

/** A guard/fetch failure carrying the HTTP status the handler should return. */
export class UrlError extends Error {
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.name = 'UrlError';
    this.status = status;
  }
}

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 5_000;
const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const USER_AGENT =
  'PatinaBot/1.0 (+https://patina.cloud; product metadata fetch)';

// ─── IP parsing ──────────────────────────────────────────────────────────────

/** Parse a strict dotted-quad into 4 octets, or null if it isn't one. */
export function parseIPv4Octets(s: string): [number, number, number, number] | null {
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (o.some((n) => n > 255)) return null;
  return [o[0], o[1], o[2], o[3]];
}

/**
 * Parse an IPv6 string into 8 hextets, handling `::` compression, an embedded
 * trailing dotted-quad (`::ffff:127.0.0.1`), and a zone id (`fe80::1%eth0`).
 * Returns null if it isn't a well-formed IPv6 literal.
 */
export function parseIPv6(input: string): number[] | null {
  let s = input.trim().toLowerCase();
  const pct = s.indexOf('%');
  if (pct !== -1) s = s.slice(0, pct); // drop the zone id
  if (!s) return null;

  // Fold a trailing dotted-quad (v4-mapped / v4-compat) into two hextets.
  if (s.indexOf('.') !== -1) {
    const lastColon = s.lastIndexOf(':');
    if (lastColon === -1) return null;
    const v4 = parseIPv4Octets(s.slice(lastColon + 1));
    if (!v4) return null;
    const h1 = ((v4[0] << 8) | v4[1]).toString(16);
    const h2 = ((v4[2] << 8) | v4[3]).toString(16);
    s = s.slice(0, lastColon + 1) + h1 + ':' + h2;
  }

  const parseGroups = (str: string): number[] | null => {
    if (str === '') return [];
    const groups = str.split(':');
    const out: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const halves = s.split('::');
  if (halves.length > 2) return null;

  if (halves.length === 2) {
    const head = parseGroups(halves[0]);
    const tail = parseGroups(halves[1]);
    if (head === null || tail === null) return null;
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    return [...head, ...Array(missing).fill(0), ...tail];
  }

  const groups = parseGroups(s);
  if (groups === null || groups.length !== 8) return null;
  return groups;
}

function isBlockedV4(o: [number, number, number, number]): boolean {
  const [a, b] = o;
  if (a === 0) return true; // 0.0.0.0/8 (incl. unspecified)
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local + metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

function isBlockedV6(h: number[]): boolean {
  // Unspecified :: and loopback ::1
  if (h.every((x) => x === 0)) return true;
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true;

  // v4-mapped ::ffff:a.b.c.d — reclassify against the IPv4 rules.
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    const a = (h[6] >> 8) & 0xff;
    const b = h[6] & 0xff;
    const c = (h[7] >> 8) & 0xff;
    const d = h[7] & 0xff;
    return isBlockedV4([a, b, c, d]);
  }

  // fc00::/7 (unique local) — first byte 0xfc or 0xfd.
  if (((h[0] >> 8) & 0xfe) === 0xfc) return true;
  // fe80::/10 (link-local).
  if ((h[0] & 0xffc0) === 0xfe80) return true;

  return false;
}

/**
 * PURE. Given a string that is an IP address (literal host, or a resolved DNS
 * answer), report whether it falls in a private/loopback/link-local/CGNAT/
 * unspecified range. Fails CLOSED: an unparseable input is treated as blocked.
 */
export function isBlockedAddress(ip: string): boolean {
  const v4 = parseIPv4Octets(ip.trim());
  if (v4) return isBlockedV4(v4);
  const v6 = parseIPv6(ip);
  if (v6) return isBlockedV6(v6);
  return true; // not a recognizable IP → don't trust it
}

// ─── URL / host classification ───────────────────────────────────────────────

/**
 * If `hostname` (as produced by `new URL().hostname`) is a literal IP, return
 * the bare address string; otherwise null (it's a DNS name we must resolve).
 * IPv6 hostnames arrive bracketed (`[::1]`); IPv4 arrives dotted.
 */
export function hostToIpLiteral(hostname: string): string | null {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  if (parseIPv4Octets(hostname)) return hostname;
  return null;
}

/**
 * PURE parse/scheme/literal-IP gate. Returns the parsed URL when it clears the
 * synchronous checks, or throws `UrlError`. Does NOT resolve DNS — the caller
 * must additionally run `assertHostResolvesSafe` before fetching.
 */
export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlError('invalid_url', 400);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlError('unsupported_scheme', 400);
  }

  const host = url.hostname.toLowerCase();
  if (!host) throw new UrlError('invalid_url', 400);
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new UrlError('blocked_host', 400);
  }

  const literal = hostToIpLiteral(host);
  if (literal && isBlockedAddress(literal)) {
    throw new UrlError('blocked_host', 400);
  }

  return url;
}

// ─── Network guards + fetch (require --allow-net) ─────────────────────────────

/**
 * Resolve the host's A + AAAA records and reject if ANY answer is blocked.
 * This is the DNS-rebinding defense; run it on every redirect hop's host,
 * immediately before the fetch. Literal-IP hosts skip DNS (already vetted by
 * `assertSafeUrl`, and `Deno.resolveDns` can't resolve an address).
 */
export async function assertHostResolvesSafe(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();
  if (hostToIpLiteral(host)) return;

  const addrs: string[] = [];
  for (const kind of ['A', 'AAAA'] as const) {
    try {
      const answers = await Deno.resolveDns(host, kind);
      addrs.push(...answers);
    } catch {
      // NXDOMAIN / no record for this family is fine; the other may answer.
    }
  }
  if (addrs.length === 0) throw new UrlError('dns_resolution_failed', 502);
  for (const a of addrs) {
    if (isBlockedAddress(a)) throw new UrlError('blocked_host', 400);
  }
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/** Read a response body, aborting past `MAX_BYTES`, decoded as UTF-8. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new UrlError('response_too_large', 413);
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(merged);
}

/**
 * Fetch a product page behind the full SSRF guard: scheme/literal check + DNS
 * check on every hop, manual redirect following (≤3), a 5s timeout, a 2MB cap,
 * and a `text/html` content-type gate. Returns the HTML and the final URL
 * (after any redirects) so relative assets resolve correctly.
 */
export async function fetchHtml(startUrl: string): Promise<{ html: string; finalUrl: string }> {
  let currentUrl = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = assertSafeUrl(currentUrl);
    await assertHostResolvesSafe(parsed.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
        },
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new UrlError('request_timeout', 504);
      }
      throw new UrlError('fetch_failed', 502);
    } finally {
      clearTimeout(timer);
    }

    if (isRedirectStatus(res.status)) {
      const location = res.headers.get('location');
      await res.body?.cancel();
      if (!location) throw new UrlError('redirect_without_location', 502);
      if (hop === MAX_REDIRECTS) throw new UrlError('too_many_redirects', 502);
      // Resolve relative Location against the current URL; the next iteration
      // re-runs the full SSRF check on the new host.
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!res.ok) {
      await res.body?.cancel();
      throw new UrlError('fetch_failed', 502);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
      await res.body?.cancel();
      throw new UrlError('not_html', 415);
    }

    const declaredLength = Number(res.headers.get('content-length') ?? '');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
      await res.body?.cancel();
      throw new UrlError('response_too_large', 413);
    }

    const html = await readCapped(res);
    return { html, finalUrl: currentUrl };
  }

  throw new UrlError('too_many_redirects', 502);
}
