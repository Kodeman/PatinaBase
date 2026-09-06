import {
  isLikelyInvoiceLinkToken,
  invoiceLinkPath,
  invoiceLinkUrl,
  INVOICE_LINK_TOKEN_PATTERN,
} from './invoice-link';

describe('invoice-link token helpers', () => {
  // 64 lowercase hex chars = the shape ensure_invoice_link (00574) emits.
  const good = 'a'.repeat(64);
  const realish = '0123456789abcdef'.repeat(4);

  it('INVOICE_LINK_TOKEN_PATTERN matches exactly 64 lowercase hex chars', () => {
    expect(INVOICE_LINK_TOKEN_PATTERN.test(good)).toBe(true);
    expect(INVOICE_LINK_TOKEN_PATTERN.test(realish)).toBe(true);
  });

  it('isLikelyInvoiceLinkToken accepts the DB token shape', () => {
    expect(isLikelyInvoiceLinkToken(good)).toBe(true);
    expect(isLikelyInvoiceLinkToken(realish)).toBe(true);
  });

  it('isLikelyInvoiceLinkToken rejects malformed tokens (no DB round-trip needed)', () => {
    expect(isLikelyInvoiceLinkToken('')).toBe(false);
    expect(isLikelyInvoiceLinkToken('too-short')).toBe(false);
    expect(isLikelyInvoiceLinkToken('A'.repeat(64))).toBe(false); // uppercase
    expect(isLikelyInvoiceLinkToken('g'.repeat(64))).toBe(false); // non-hex
    expect(isLikelyInvoiceLinkToken('a'.repeat(63))).toBe(false); // 63 chars
    expect(isLikelyInvoiceLinkToken('a'.repeat(65))).toBe(false); // 65 chars
    expect(isLikelyInvoiceLinkToken(null)).toBe(false);
    expect(isLikelyInvoiceLinkToken(undefined)).toBe(false);
    expect(isLikelyInvoiceLinkToken('  ' + good + '  ')).toBe(false); // whitespace
  });

  it('invoiceLinkPath builds the client-portal pay route', () => {
    expect(invoiceLinkPath(good)).toBe(`/pay/${good}`);
  });

  it('invoiceLinkUrl joins origin + path and normalizes a trailing slash', () => {
    expect(invoiceLinkUrl('https://client.patina.cloud', good)).toBe(
      `https://client.patina.cloud/pay/${good}`,
    );
    expect(invoiceLinkUrl('https://client.patina.cloud/', good)).toBe(
      `https://client.patina.cloud/pay/${good}`,
    );
    expect(invoiceLinkUrl('http://localhost:3002///', good)).toBe(
      `http://localhost:3002/pay/${good}`,
    );
  });
});
