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
//      resolved address is blocked.
//   3. `DenoPinnedHttpTransport` — opens a TCP socket to the already-validated
//      address and, for HTTPS, upgrades it with the original hostname as SNI
//      and the certificate-verification name. There is no second DNS lookup
//      for an attacker to rebind between validation/fetch.
//   4. `fetchHtml` — manual redirect following (≤3 hops, re-validating and
//      re-pinning each), a 5s timeout, a 2MB response cap, and a
//      `text/html`-only content-type gate.
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

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export interface PinnedRequestOptions {
  headers: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
  allowedContentTypes?: readonly string[];
}

export interface PinnedHttpTransport {
  request(
    url: URL,
    address: ResolvedAddress,
    options: PinnedRequestOptions,
  ): Promise<Response>;
}

export interface SafeFetchDependencies {
  resolver?: HostResolver;
  transport?: PinnedHttpTransport;
}

type PinnedTransportFailureReason =
  | 'timeout'
  | 'too_large'
  | 'unsupported_content_type'
  | 'failed';

export class PinnedTransportError extends Error {
  constructor(readonly reason: PinnedTransportFailureReason) {
    super(reason);
    this.name = 'PinnedTransportError';
  }
}

// ─── IP parsing ──────────────────────────────────────────────────────────────

/** Parse a strict dotted-quad into 4 octets, or null if it isn't one. */
export function parseIPv4Octets(
  s: string,
): [number, number, number, number] | null {
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
    if (missing <= 0) return null;
    return [...head, ...Array(missing).fill(0), ...tail];
  }

  const groups = parseGroups(s);
  if (groups === null || groups.length !== 8) return null;
  return groups;
}

function isBlockedV4(o: [number, number, number, number]): boolean {
  const [a, b, c] = o;
  if (a === 0) return true; // 0.0.0.0/8 (incl. unspecified)
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local + metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 (IETF protocols)
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 (documentation)
  if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 (deprecated relay)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (benchmark)
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (documentation)
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (documentation)
  if (a >= 224) return true; // multicast + reserved + limited broadcast
  return false;
}

function isBlockedV6(h: number[]): boolean {
  // Unspecified :: and loopback ::1
  if (h.every((x) => x === 0)) return true;
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true;

  // IANA currently allocates public unicast only from 2000::/3. Rejecting the
  // remaining reserved space also closes deprecated site-local ranges such as
  // fec0::/10 instead of relying on a growing exception list.
  if ((h[0] & 0xe000) !== 0x2000) return true;

  // IPv4-compatible and IPv4-mapped forms are rejected wholesale. Accepting
  // mapped public addresses adds an unnecessary alternate representation at
  // this boundary and differs across runtimes/resolvers.
  if (h.slice(0, 6).every((x) => x === 0)) return true; // ::/96
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    return true; // ::ffff:0:0/96
  }

  if (
    h[0] === 0x0064 && h[1] === 0xff9b &&
    h.slice(2, 6).every((x) => x === 0)
  ) return true; // 64:ff9b::/96 (NAT64)
  if (h[0] === 0x0064 && h[1] === 0xff9b && h[2] === 0x0001) {
    return true; // 64:ff9b:1::/48 (local-use translation)
  }
  if (
    h[0] === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0
  ) return true; // 100::/64 (discard-only)
  if (h[0] === 0x2001 && (h[1] & 0xfe00) === 0) return true; // 2001::/23 (IETF assignments)
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // documentation
  if (h[0] === 0x2002) return true; // 6to4 (may embed a private IPv4 target)
  if (h[0] === 0x3fff && (h[1] & 0xf000) === 0) return true; // documentation
  // fc00::/7 (unique local) — first byte 0xfc or 0xfd.
  if (((h[0] >> 8) & 0xfe) === 0xfc) return true;
  // fe80::/10 (link-local).
  if ((h[0] & 0xffc0) === 0xfe80) return true;
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast

  return false;
}

/**
 * PURE. Given a string that is an IP address (literal host, or a resolved DNS
 * answer), report whether it falls in a private, loopback, link-local, CGNAT,
 * documentation, benchmark, multicast, or other non-global range. Fails
 * CLOSED: an unparseable input is treated as blocked.
 */
export function isBlockedAddress(ip: string): boolean {
  if (ip.includes('%')) return true; // scoped IPv6 is never globally routable
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

  if (url.username || url.password) {
    throw new UrlError('blocked_host', 400);
  }
  const expectedPort = url.protocol === 'https:' ? '443' : '80';
  if (url.port && url.port !== expectedPort) {
    throw new UrlError('blocked_host', 400);
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) throw new UrlError('invalid_url', 400);
  if (
    host === 'localhost' || host.endsWith('.localhost') ||
    host.endsWith('.local') || host.endsWith('.internal')
  ) {
    throw new UrlError('blocked_host', 400);
  }

  const literal = hostToIpLiteral(host);
  if (literal && isBlockedAddress(literal)) {
    throw new UrlError('blocked_host', 400);
  }

  if (url.hostname !== host) url.hostname = host;
  return url;
}

// ─── Network guards + fetch (require --allow-net) ─────────────────────────────

const denoHostResolver: HostResolver = async (host) => {
  const addresses: ResolvedAddress[] = [];
  for (const [kind, family] of [['A', 4], ['AAAA', 6]] as const) {
    try {
      const answers = await Deno.resolveDns(host, kind);
      addresses.push(...answers.map((address) => ({ address, family })));
    } catch {
      // NXDOMAIN / no record for this family is fine; the other may answer.
    }
  }
  return addresses;
};

/**
 * Resolve the host's A + AAAA records, reject if ANY answer is blocked, and
 * return the exact validated addresses that the transport may use. Returning
 * the set (instead of performing a void preflight) is the load-bearing
 * anti-rebinding contract.
 */
export async function assertHostResolvesSafe(
  hostname: string,
  resolver: HostResolver = denoHostResolver,
  timeoutMs = TIMEOUT_MS,
): Promise<ResolvedAddress[]> {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const literal = hostToIpLiteral(host);
  if (literal) {
    const family = parseIPv4Octets(literal) ? 4 : parseIPv6(literal) ? 6 : null;
    if (!family || isBlockedAddress(literal)) {
      throw new UrlError('blocked_host', 400);
    }
    return [{
      address: literal,
      family,
    }];
  }

  let addresses: ResolvedAddress[];
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    addresses = await Promise.race([
      resolver(host),
      new Promise<ResolvedAddress[]>((_, reject) => {
        timeout = setTimeout(
          () => reject(new PinnedTransportError('timeout')),
          timeoutMs,
        );
      }),
    ]);
  } catch {
    throw new UrlError('dns_resolution_failed', 502);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  if (addresses.length === 0) {
    throw new UrlError('dns_resolution_failed', 502);
  }
  const validated: ResolvedAddress[] = [];
  for (const entry of addresses) {
    const familyMatches = entry.family === 4
      ? parseIPv4Octets(entry.address) !== null
      : entry.family === 6 && parseIPv6(entry.address) !== null;
    if (!familyMatches || isBlockedAddress(entry.address)) {
      throw new UrlError('blocked_host', 400);
    }
    validated.push({ address: entry.address, family: entry.family });
  }
  return validated;
}

const MAX_RESPONSE_HEADER_BYTES = 64 * 1024;
const MAX_RESPONSE_LINE_BYTES = 8 * 1024;
const MAX_INFORMATIONAL_RESPONSES = 5;
const MAX_RESPONSE_CHUNKS = 4_096;
const READ_BUFFER_BYTES = 16 * 1024;
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const latin1Decoder = new TextDecoder('latin1');

export interface ByteReader {
  read(buffer: Uint8Array): Promise<number | null>;
}

interface ParsedResponseHead {
  status: number;
  headers: Headers;
  rawHeaders: Map<string, string[]>;
}

function findSequence(haystack: Uint8Array, needle: Uint8Array): number {
  outer:
  for (let offset = 0; offset <= haystack.length - needle.length; offset++) {
    for (let index = 0; index < needle.length; index++) {
      if (haystack[offset + index] !== needle[index]) continue outer;
    }
    return offset;
  }
  return -1;
}

function mergeBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.length === 0) return right.slice();
  if (right.length === 0) return left.slice();
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left);
  merged.set(right, left.length);
  return merged;
}

function joinChunks(chunks: Uint8Array[], length: number): Uint8Array {
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

function hasControlCharacter(
  value: string,
  allowHorizontalTab: boolean,
): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if ((code <= 31 || code === 127) && !(allowHorizontalTab && code === 9)) {
      return true;
    }
  }
  return false;
}

class BufferedByteReader {
  private buffered: Uint8Array<ArrayBufferLike> = new Uint8Array();
  private ended = false;

  constructor(private readonly source: ByteReader) {}

  private async fill(): Promise<void> {
    if (this.ended) return;
    const chunk = new Uint8Array(READ_BUFFER_BYTES);
    const count = await this.source.read(chunk);
    if (count === null) {
      this.ended = true;
      return;
    }
    if (count < 0 || count > chunk.length) {
      throw new PinnedTransportError('failed');
    }
    if (count === 0) throw new PinnedTransportError('failed');
    this.buffered = mergeBytes(this.buffered, chunk.subarray(0, count));
  }

  private consume(length: number): Uint8Array {
    const value = this.buffered.slice(0, length);
    this.buffered = this.buffered.slice(length);
    return value;
  }

  async readUntil(
    delimiter: Uint8Array,
    maxBytes: number,
  ): Promise<Uint8Array> {
    for (;;) {
      const delimiterOffset = findSequence(this.buffered, delimiter);
      if (delimiterOffset !== -1) {
        if (delimiterOffset > maxBytes) {
          throw new PinnedTransportError('failed');
        }
        const value = this.consume(delimiterOffset);
        this.consume(delimiter.length);
        return value;
      }
      if (this.buffered.length > maxBytes + delimiter.length - 1) {
        throw new PinnedTransportError('failed');
      }
      await this.fill();
      if (this.ended) throw new PinnedTransportError('failed');
    }
  }

  async readExactly(length: number): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < length) {
      if (this.buffered.length === 0) {
        await this.fill();
        if (this.ended) throw new PinnedTransportError('failed');
      }
      const count = Math.min(length - total, this.buffered.length);
      chunks.push(this.consume(count));
      total += count;
    }
    return joinChunks(chunks, total);
  }

  async readToEnd(maxBytes: number): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      if (this.buffered.length > 0) {
        total += this.buffered.length;
        if (total > maxBytes) throw new PinnedTransportError('too_large');
        chunks.push(this.consume(this.buffered.length));
      }
      if (this.ended) return joinChunks(chunks, total);
      await this.fill();
    }
  }
}

function parseResponseHead(bytes: Uint8Array): ParsedResponseHead {
  const lines = latin1Decoder.decode(bytes).split('\r\n');
  const statusLine = lines.shift() ?? '';
  if (
    statusLine.length > MAX_RESPONSE_LINE_BYTES ||
    hasControlCharacter(statusLine, true)
  ) {
    throw new PinnedTransportError('failed');
  }
  const statusMatch = statusLine.match(
    /^HTTP\/1\.[01] ([0-9]{3})(?:[ \t].*)?$/,
  );
  if (!statusMatch) throw new PinnedTransportError('failed');
  const status = Number(statusMatch[1]);
  if (status < 100 || status > 599) {
    throw new PinnedTransportError('failed');
  }

  const headers = new Headers();
  const rawHeaders = new Map<string, string[]>();
  for (const line of lines) {
    if (
      !line || line.length > MAX_RESPONSE_LINE_BYTES ||
      line.startsWith(' ') || line.startsWith('\t')
    ) {
      throw new PinnedTransportError('failed');
    }
    const colon = line.indexOf(':');
    const name = colon === -1 ? '' : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).trim();
    if (
      !HEADER_NAME.test(name) ||
      hasControlCharacter(value, true)
    ) {
      throw new PinnedTransportError('failed');
    }
    const normalizedName = name.toLowerCase();
    const values = rawHeaders.get(normalizedName) ?? [];
    values.push(value);
    rawHeaders.set(normalizedName, values);
    try {
      headers.append(normalizedName, value);
    } catch {
      throw new PinnedTransportError('failed');
    }
  }
  return { status, headers, rawHeaders };
}

function commaSeparatedValues(
  rawHeaders: Map<string, string[]>,
  name: string,
): string[] {
  return (rawHeaders.get(name) ?? []).flatMap((value) => value.split(','))
    .map((value) => value.trim());
}

function parseContentLength(
  rawHeaders: Map<string, string[]>,
): number | null {
  const values = commaSeparatedValues(rawHeaders, 'content-length');
  if (values.length === 0) return null;
  if (values.some((value) => !/^\d+$/.test(value))) {
    throw new PinnedTransportError('failed');
  }
  if (values.some((value) => value !== values[0])) {
    throw new PinnedTransportError('failed');
  }
  const length = Number(values[0]);
  if (!Number.isSafeInteger(length)) {
    throw new PinnedTransportError('too_large');
  }
  return length;
}

function parseTransferEncoding(
  rawHeaders: Map<string, string[]>,
): 'chunked' | null {
  const values = commaSeparatedValues(rawHeaders, 'transfer-encoding').map(
    (value) => value.toLowerCase(),
  );
  if (values.length === 0) return null;
  if (values.length !== 1 || values[0] !== 'chunked') {
    throw new PinnedTransportError('failed');
  }
  return 'chunked';
}

function assertIdentityContentEncoding(
  rawHeaders: Map<string, string[]>,
): void {
  const values = commaSeparatedValues(rawHeaders, 'content-encoding').map(
    (value) => value.toLowerCase(),
  );
  if (values.some((value) => value !== 'identity')) {
    throw new PinnedTransportError('failed');
  }
}

function assertAllowedContentType(
  headers: Headers,
  allowedContentTypes: readonly string[] | undefined,
): void {
  if (!allowedContentTypes) return;
  const mediaType = (headers.get('content-type') ?? '').split(';', 1)[0].trim()
    .toLowerCase();
  if (!allowedContentTypes.includes(mediaType)) {
    throw new PinnedTransportError('unsupported_content_type');
  }
}

function assertTrailerLine(line: Uint8Array): void {
  const decoded = latin1Decoder.decode(line);
  const colon = decoded.indexOf(':');
  const name = colon === -1 ? '' : decoded.slice(0, colon);
  const value = colon === -1 ? '' : decoded.slice(colon + 1).trim();
  if (
    !HEADER_NAME.test(name) ||
    hasControlCharacter(value, true)
  ) {
    throw new PinnedTransportError('failed');
  }
}

async function readChunkedBody(
  reader: BufferedByteReader,
  maxBytes: number,
): Promise<Uint8Array> {
  const crlf = new Uint8Array([13, 10]);
  const chunks: Uint8Array[] = [];
  let total = 0;
  let chunkCount = 0;
  for (;;) {
    const sizeLine = latin1Decoder.decode(
      await reader.readUntil(crlf, MAX_RESPONSE_LINE_BYTES),
    );
    if (hasControlCharacter(sizeLine, false)) {
      throw new PinnedTransportError('failed');
    }
    const sizeToken = sizeLine.split(';', 1)[0];
    if (!/^[0-9a-fA-F]+$/.test(sizeToken)) {
      throw new PinnedTransportError('failed');
    }
    let size: bigint;
    try {
      size = BigInt(`0x${sizeToken}`);
    } catch {
      throw new PinnedTransportError('failed');
    }
    if (size > BigInt(maxBytes - total)) {
      throw new PinnedTransportError('too_large');
    }
    if (size === 0n) {
      let trailerBytes = 0;
      for (;;) {
        const trailer = await reader.readUntil(crlf, MAX_RESPONSE_LINE_BYTES);
        trailerBytes += trailer.length + crlf.length;
        if (trailerBytes > MAX_RESPONSE_HEADER_BYTES) {
          throw new PinnedTransportError('failed');
        }
        if (trailer.length === 0) return joinChunks(chunks, total);
        assertTrailerLine(trailer);
      }
    }
    if (++chunkCount > MAX_RESPONSE_CHUNKS) {
      throw new PinnedTransportError('failed');
    }
    const chunkLength = Number(size);
    const chunk = await reader.readExactly(chunkLength);
    const terminator = await reader.readExactly(crlf.length);
    if (terminator[0] !== 13 || terminator[1] !== 10) {
      throw new PinnedTransportError('failed');
    }
    chunks.push(chunk);
    total += chunkLength;
  }
}

/**
 * Parse exactly one HTTP/1.x response from a pinned connection. The parser is
 * intentionally strict: ambiguous framing, compressed payloads, folded
 * headers, oversized metadata, and malformed chunks all fail closed.
 */
export async function readPinnedHttpResponse(
  source: ByteReader,
  options: Pick<PinnedRequestOptions, 'maxBytes' | 'allowedContentTypes'>,
): Promise<Response> {
  const reader = new BufferedByteReader(source);
  const headerDelimiter = new Uint8Array([13, 10, 13, 10]);
  let informationalResponses = 0;
  let totalHeaderBytes = 0;
  let head: ParsedResponseHead;
  for (;;) {
    const headerBlock = await reader.readUntil(
      headerDelimiter,
      MAX_RESPONSE_HEADER_BYTES,
    );
    totalHeaderBytes += headerBlock.length + headerDelimiter.length;
    if (totalHeaderBytes > MAX_RESPONSE_HEADER_BYTES) {
      throw new PinnedTransportError('failed');
    }
    head = parseResponseHead(headerBlock);
    if (head.status < 100 || head.status >= 200) break;
    if (
      head.status === 101 ||
      ++informationalResponses > MAX_INFORMATIONAL_RESPONSES
    ) {
      throw new PinnedTransportError('failed');
    }
  }

  const contentLength = parseContentLength(head.rawHeaders);
  const transferEncoding = parseTransferEncoding(head.rawHeaders);
  if (contentLength !== null && transferEncoding !== null) {
    throw new PinnedTransportError('failed');
  }

  // Redirect and error bodies are irrelevant and the connection is never
  // reused, so return their headers immediately and close the socket upstream.
  if (head.status < 200 || head.status > 299) {
    return new Response(null, { status: head.status, headers: head.headers });
  }

  if (head.status === 204 || head.status === 205) {
    if (transferEncoding !== null || (contentLength ?? 0) !== 0) {
      throw new PinnedTransportError('failed');
    }
    return new Response(null, { status: head.status, headers: head.headers });
  }

  assertIdentityContentEncoding(head.rawHeaders);
  assertAllowedContentType(head.headers, options.allowedContentTypes);
  if (contentLength !== null && contentLength > options.maxBytes) {
    throw new PinnedTransportError('too_large');
  }

  let body: Uint8Array;
  if (transferEncoding === 'chunked') {
    body = await readChunkedBody(reader, options.maxBytes);
  } else if (contentLength !== null) {
    body = await reader.readExactly(contentLength);
  } else {
    body = await reader.readToEnd(options.maxBytes);
  }
  return new Response(new Uint8Array(body), {
    status: head.status,
    headers: head.headers,
  });
}

function buildRequestBytes(
  url: URL,
  headers: Record<string, string>,
): Uint8Array {
  const reservedHeaders = new Set([
    'host',
    'connection',
    'content-length',
    'transfer-encoding',
    'accept-encoding',
  ]);
  const requestTarget = `${url.pathname || '/'}${url.search}`;
  const hostHeader = url.host;
  if (
    !hostHeader || hasControlCharacter(hostHeader, false) ||
    hasControlCharacter(requestTarget, false)
  ) {
    throw new PinnedTransportError('failed');
  }
  const lines = [
    `GET ${requestTarget} HTTP/1.1`,
    `Host: ${hostHeader}`,
  ];
  for (const [name, value] of Object.entries(headers)) {
    if (
      !HEADER_NAME.test(name) || reservedHeaders.has(name.toLowerCase()) ||
      hasControlCharacter(value, false)
    ) {
      throw new PinnedTransportError('failed');
    }
    lines.push(`${name}: ${value}`);
  }
  lines.push('Accept-Encoding: identity', 'Connection: close', '', '');
  return new TextEncoder().encode(lines.join('\r\n'));
}

async function writeAll(
  connection: Deno.Conn,
  bytes: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.length) {
    const written = await connection.write(bytes.subarray(offset));
    if (written <= 0) throw new PinnedTransportError('failed');
    offset += written;
  }
}

function closeQuietly(connection: Deno.Conn | undefined): void {
  try {
    connection?.close();
  } catch {
    // A timeout/read failure may already have closed the resource.
  }
}

/**
 * Edge-runtime-compatible HTTP(S) transport. TCP always targets the vetted IP;
 * HTTPS then performs TLS with the original hostname for SNI and certificate
 * verification. ALPN is fixed to HTTP/1.1 because this module owns framing.
 */
export class DenoPinnedHttpTransport implements PinnedHttpTransport {
  request(
    url: URL,
    address: ResolvedAddress,
    options: PinnedRequestOptions,
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let connection: Deno.Conn | undefined;
      const finish = (response: Response) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        closeQuietly(connection);
        resolve(response);
      };
      const fail = (reason: PinnedTransportFailureReason) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        closeQuietly(connection);
        reject(new PinnedTransportError(reason));
      };
      const deadline = setTimeout(() => fail('timeout'), options.timeoutMs);

      void (async () => {
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new PinnedTransportError('failed');
        }
        const port = url.port
          ? Number(url.port)
          : url.protocol === 'https:'
          ? 443
          : 80;
        if (!Number.isInteger(port) || port < 1 || port > 65_535) {
          throw new PinnedTransportError('failed');
        }

        const tcp = await Deno.connect({ hostname: address.address, port });
        if (settled) {
          closeQuietly(tcp);
          return;
        }
        connection = tcp;
        if (url.protocol === 'https:') {
          const tlsHostname = hostToIpLiteral(url.hostname) ?? url.hostname;
          const tls = await Deno.startTls(tcp, {
            hostname: tlsHostname,
            alpnProtocols: ['http/1.1'],
          });
          connection = tls;
          await tls.handshake();
        }
        if (settled) return;

        await writeAll(connection, buildRequestBytes(url, options.headers));
        const response = await readPinnedHttpResponse(connection, options);
        finish(response);
      })().catch((error) => {
        fail(
          error instanceof PinnedTransportError ? error.reason : 'failed',
        );
      });
    });
  }
}

export const denoPinnedHttpTransport = new DenoPinnedHttpTransport();

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 ||
    status === 308;
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
export async function fetchHtml(
  startUrl: string,
  dependencies: SafeFetchDependencies = {},
): Promise<{ html: string; finalUrl: string }> {
  let currentUrl = startUrl;
  const resolver = dependencies.resolver ?? denoHostResolver;
  const transport = dependencies.transport ?? denoPinnedHttpTransport;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = assertSafeUrl(currentUrl);
    const addresses = await assertHostResolvesSafe(parsed.hostname, resolver);
    const pinnedAddress = addresses[0];
    currentUrl = parsed.toString();

    let res: Response;
    try {
      res = await transport.request(
        parsed,
        pinnedAddress,
        {
          headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml',
          },
          timeoutMs: TIMEOUT_MS,
          maxBytes: MAX_BYTES,
          allowedContentTypes: ['text/html'],
        },
      );
    } catch (e) {
      if (e instanceof PinnedTransportError && e.reason === 'timeout') {
        throw new UrlError('request_timeout', 504);
      }
      if (e instanceof PinnedTransportError && e.reason === 'too_large') {
        throw new UrlError('response_too_large', 413);
      }
      if (
        e instanceof PinnedTransportError &&
        e.reason === 'unsupported_content_type'
      ) {
        throw new UrlError('not_html', 415);
      }
      throw new UrlError('fetch_failed', 502);
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
