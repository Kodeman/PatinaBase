/**
 * C-12 · the Order Assistant opens on the studio account's terms and
 * deposit %, and falls back to the shared vendor default, labelled so.
 */
import {
  depositDefaultForPattern,
  prefillPaymentPattern,
  termsNote,
} from '../step-details';

describe('prefillPaymentPattern', () => {
  it('takes the studio account first', () => {
    expect(prefillPaymentPattern('thirty_seventy', 'net_30')).toBe('thirty_seventy');
  });
  it('falls back to the vendor default, then 50/50', () => {
    expect(prefillPaymentPattern(null, 'net_30')).toBe('net_30');
    expect(prefillPaymentPattern(undefined, null)).toBe('fifty_fifty');
  });
});

describe('termsNote', () => {
  it('labels the vendor default "(Vendor default)" when the studio sets no terms', () => {
    expect(termsNote('net_30', null, 'net_30')).toBe(' (Vendor default)');
    expect(termsNote('fifty_fifty', null, 'net_30')).toBe('');
  });
  it('labels the studio account terms, and drops the vendor default label', () => {
    expect(termsNote('thirty_seventy', 'thirty_seventy', 'net_30')).toBe(' (Studio account)');
    expect(termsNote('net_30', 'thirty_seventy', 'net_30')).toBe('');
  });
});

describe('depositDefaultForPattern with the account deposit %', () => {
  it("uses the account's deposit % on a split pattern", () => {
    expect(depositDefaultForPattern('thirty_seventy', 100000, 40)).toBe(
      depositDefaultForPattern('full_upfront', 40000),
    );
    expect(depositDefaultForPattern('fifty_fifty', 100000, 25)).toBe(
      depositDefaultForPattern('full_upfront', 25000),
    );
  });
  it('keeps the canonical math without one, and ignores it off a split pattern', () => {
    expect(depositDefaultForPattern('thirty_seventy', 100000, null)).toBe(
      depositDefaultForPattern('full_upfront', 30000),
    );
    expect(depositDefaultForPattern('full_upfront', 100000, 40)).toBe(
      depositDefaultForPattern('full_upfront', 100000),
    );
    expect(depositDefaultForPattern('net_30', 100000, 40)).toBe('');
  });
});
