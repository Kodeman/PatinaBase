import {
  isLikelyShareToken,
  shareLinkPath,
  shareLinkUrl,
  SHARE_TOKEN_PATTERN,
} from './document-share';

describe('document-share token helpers', () => {
  // 64 lowercase hex chars = the shape create_document_share (00266) emits.
  const good = 'a'.repeat(64);
  const realish = '0123456789abcdef'.repeat(4);

  it('SHARE_TOKEN_PATTERN matches exactly 64 lowercase hex chars', () => {
    expect(SHARE_TOKEN_PATTERN.test(good)).toBe(true);
    expect(SHARE_TOKEN_PATTERN.test(realish)).toBe(true);
  });

  it('isLikelyShareToken accepts the DB token shape', () => {
    expect(isLikelyShareToken(good)).toBe(true);
    expect(isLikelyShareToken(realish)).toBe(true);
  });

  it('isLikelyShareToken rejects malformed tokens (no DB round-trip needed)', () => {
    expect(isLikelyShareToken('')).toBe(false);
    expect(isLikelyShareToken('too-short')).toBe(false);
    expect(isLikelyShareToken('A'.repeat(64))).toBe(false); // uppercase
    expect(isLikelyShareToken('g'.repeat(64))).toBe(false); // non-hex
    expect(isLikelyShareToken('a'.repeat(63))).toBe(false); // 63 chars
    expect(isLikelyShareToken('a'.repeat(65))).toBe(false); // 65 chars
    expect(isLikelyShareToken(null)).toBe(false);
    expect(isLikelyShareToken(undefined)).toBe(false);
    expect(isLikelyShareToken('  ' + good + '  ')).toBe(false); // whitespace
  });

  it('shareLinkPath builds the client-portal route', () => {
    expect(shareLinkPath(good)).toBe(`/share/${good}`);
  });

  it('shareLinkUrl joins origin + path and normalizes a trailing slash', () => {
    expect(shareLinkUrl('https://app.patina.cloud', good)).toBe(`https://app.patina.cloud/share/${good}`);
    expect(shareLinkUrl('https://app.patina.cloud/', good)).toBe(`https://app.patina.cloud/share/${good}`);
    expect(shareLinkUrl('http://localhost:3002///', good)).toBe(`http://localhost:3002/share/${good}`);
  });
});
