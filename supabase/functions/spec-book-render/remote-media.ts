function ipv4Octets(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  return octets.every((octet) =>
      Number.isInteger(octet) && octet >= 0 && octet <= 255
    )
    ? octets
    : null;
}

function isBlockedIpv4(octets: number[]): boolean {
  const [a, b, c] = octets;
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224;
}

function expandIpv6(host: string): number[] | null {
  const pieces = host.toLowerCase().split("::");
  if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (
    (pieces.length === 1 && missing !== 0) ||
    (pieces.length === 2 && missing < 1)
  ) return null;
  const groups = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ];
  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
  ) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

function isBlockedIpv6(groups: number[]): boolean {
  const [first, second] = groups;
  const allZeroPrefix = groups.slice(0, 6).every((group) => group === 0);
  const unspecifiedOrLoopback =
    groups.slice(0, 7).every((group) => group === 0) &&
    groups[7] <= 1;
  const uniqueLocal = (first & 0xfe00) === 0xfc00;
  const linkLocal = (first & 0xffc0) === 0xfe80;
  const multicast = (first & 0xff00) === 0xff00;
  const documentation = first === 0x2001 && second === 0x0db8;
  const ipv4Mapped = groups.slice(0, 5).every((group) => group === 0) &&
    groups[5] === 0xffff;
  const embeddedIpv4 = allZeroPrefix || ipv4Mapped;
  const embedded = [
    groups[6] >> 8,
    groups[6] & 0xff,
    groups[7] >> 8,
    groups[7] & 0xff,
  ];
  return unspecifiedOrLoopback ||
    uniqueLocal ||
    linkLocal ||
    multicast ||
    documentation ||
    (embeddedIpv4 && isBlockedIpv4(embedded));
}

function isBlockedHost(rawHostname: string): boolean {
  const host = rawHostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) return true;
  const ipv4 = ipv4Octets(host);
  if (ipv4) return isBlockedIpv4(ipv4);
  if (host.includes(":")) {
    const ipv6 = expandIpv6(host);
    return !ipv6 || isBlockedIpv6(ipv6);
  }
  return false;
}

export function safeRemoteImageUrl(
  raw: string,
  supabaseUrl: string,
): URL | null {
  try {
    const url = new URL(raw);
    const supabaseOrigin = new URL(supabaseUrl).origin;
    if (url.username || url.password) return null;
    if (url.protocol !== "https:" && url.origin !== supabaseOrigin) return null;
    if (url.origin !== supabaseOrigin && isBlockedHost(url.hostname)) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
