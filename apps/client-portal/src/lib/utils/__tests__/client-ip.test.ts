/**
 * Tests for resolveClientIp (lib/utils/client-ip.ts).
 *
 * Regression: proposal 2ff78824's `signed_ip` was NULL after a real browser
 * signature. Cause: client-portal's middleware.ts only sets `x-client-ip`
 * for PAGE routes under `/proposals` (`pathname.startsWith('/proposals')`,
 * which `/api/proposals/**` never matches), and `x-forwarded-for` is
 * typically absent on Cloudflare Workers (Cloudflare's own client-IP header
 * is `cf-connecting-ip`). The old header-chain (`x-client-ip` ??
 * `x-forwarded-for`) had no header that was ever actually present in
 * production, so `p_signed_ip` was always null.
 *
 * Fix: prefer `cf-connecting-ip`, then the first hop of `x-forwarded-for`,
 * then the legacy `x-client-ip` as a last-resort fallback.
 */
import { normalizeCallerIp, resolveClientIp } from '../client-ip';

describe('resolveClientIp', () => {
  it('prefers cf-connecting-ip over every other header', () => {
    const headers = new Headers({
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.1, 10.0.0.1',
      'x-client-ip': '192.0.2.99',
    });
    expect(resolveClientIp(headers)).toBe('203.0.113.7');
  });

  it('falls back to the first hop of x-forwarded-for when cf-connecting-ip is absent', () => {
    const headers = new Headers({
      'x-forwarded-for': '198.51.100.1, 10.0.0.1',
      'x-client-ip': '192.0.2.99',
    });
    expect(resolveClientIp(headers)).toBe('198.51.100.1');
  });

  it('trims whitespace around the first x-forwarded-for hop', () => {
    const headers = new Headers({ 'x-forwarded-for': '  198.51.100.1  ,10.0.0.1' });
    expect(resolveClientIp(headers)).toBe('198.51.100.1');
  });

  it('falls back to the legacy x-client-ip when neither Cloudflare nor x-forwarded-for headers are present', () => {
    const headers = new Headers({ 'x-client-ip': '192.0.2.99' });
    expect(resolveClientIp(headers)).toBe('192.0.2.99');
  });

  it('returns null when no IP header is present at all — this was the production bug', () => {
    expect(resolveClientIp(new Headers())).toBeNull();
  });
});

// R-CA (W4 r10 MAJOR-2). `resolveClientIp` answers what the headers SAY, which
// is what an audit trail wants. A RATE BUCKET wants an address or nothing: the
// paperwork door's limiter took an `inet`, so a caller-written
// `cf-connecting-ip: not-an-ip` raised 22P02 and the door read the error as
// "within limit" — one header switched its only abuse control off.
describe('normalizeCallerIp', () => {
  it('keeps a real v4 or v6 address', () => {
    expect(normalizeCallerIp('203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeCallerIp(' 198.51.100.1 ')).toBe('198.51.100.1');
    expect(normalizeCallerIp('2001:db8::1')).toBe('2001:db8::1');
  });

  it('strips the port a proxy appends', () => {
    expect(normalizeCallerIp('1.2.3.4:5678')).toBe('1.2.3.4');
    expect(normalizeCallerIp('[2001:db8::1]:443')).toBe('2001:db8::1');
  });

  it('answers null for anything that is not an address', () => {
    expect(normalizeCallerIp('not-an-ip')).toBeNull();
    expect(normalizeCallerIp('999.1.1.1')).toBeNull();
    expect(normalizeCallerIp('1.2.3.4; drop')).toBeNull();
    expect(normalizeCallerIp('')).toBeNull();
    expect(normalizeCallerIp(null)).toBeNull();
    expect(normalizeCallerIp(undefined)).toBeNull();
  });
});
