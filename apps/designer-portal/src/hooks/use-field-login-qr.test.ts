/**
 * Contract test for the frozen QR payload shape. Pure — no mocks required
 * (buildFieldLoginUrl touches no Supabase client), so it dodges the jest.mock
 * no-op trap entirely. The iOS half parses exactly `field://login?v=1&th=<hash>`.
 */

import { buildFieldLoginUrl, FIELD_LOGIN_QR_VERSION, QR_ROTATE_SECONDS } from './use-field-login-qr';

describe('buildFieldLoginUrl', () => {
  it('encodes the frozen field://login?v=1&th=<token_hash> shape', () => {
    expect(buildFieldLoginUrl('abc123')).toBe('field://login?v=1&th=abc123');
  });

  it('pins the protocol version to 1', () => {
    expect(FIELD_LOGIN_QR_VERSION).toBe(1);
    expect(buildFieldLoginUrl('t')).toContain('v=1');
  });

  it('url-encodes token hashes with reserved characters', () => {
    const url = buildFieldLoginUrl('a+b/c=d&e');
    // The `th` value must round-trip through URLSearchParams without breaking
    // the query structure.
    const parsed = new URL(url);
    expect(parsed.protocol).toBe('field:');
    expect(parsed.searchParams.get('v')).toBe('1');
    expect(parsed.searchParams.get('th')).toBe('a+b/c=d&e');
  });

  it('rotates every 60 seconds', () => {
    expect(QR_ROTATE_SECONDS).toBe(60);
  });
});
