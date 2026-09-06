import {
  isPastDueRefusal,
  isPermissionRefusal,
  refusalSentence,
  retryUnlessRefused,
} from '../refusal';

/* A refused act says so in a sentence this house authored — and a REFUSAL is
   told apart from a bad moment, because only one of the two is worth trying
   again. `W3W-R1-04` was the cost of not telling them apart: three retries and
   five blank seconds before a stranger's paper record said anything, and then
   "Refresh to try again" about a door that will never open. */

describe('isPermissionRefusal', () => {
  it('knows PostgREST’s refusal by its SQLSTATE and by its status', () => {
    expect(isPermissionRefusal({ code: '42501', message: 'permission denied' })).toBe(true);
    expect(isPermissionRefusal({ status: 403 })).toBe(true);
  });

  it('calls nothing else a refusal', () => {
    expect(isPermissionRefusal(new Error('Failed to fetch'))).toBe(false);
    expect(isPermissionRefusal({ code: 'PGRST116' })).toBe(false);
    expect(isPermissionRefusal({ status: 500 })).toBe(false);
    expect(isPermissionRefusal(null)).toBe(false);
    expect(isPermissionRefusal('42501')).toBe(false);
  });
});

describe('retryUnlessRefused', () => {
  it('answers a refusal once', () => {
    expect(retryUnlessRefused(0, { code: '42501' })).toBe(false);
    expect(retryUnlessRefused(0, { status: 403 })).toBe(false);
  });

  it('keeps React Query’s three tries for everything else', () => {
    expect(retryUnlessRefused(0, new Error('network'))).toBe(true);
    expect(retryUnlessRefused(2, new Error('network'))).toBe(true);
    expect(retryUnlessRefused(3, new Error('network'))).toBe(false);
  });
});

/* `W3R1-n1`: 00572 refuses a hold on an approval past its date, in one token,
   so the surface can answer with the sentence it already draws in the act's
   place instead of "that could not be set just now". */
describe('isPastDueRefusal', () => {
  it('reads 00572’s token', () => {
    expect(isPastDueRefusal({ message: 'decision_past_due' })).toBe(true);
    expect(
      isPastDueRefusal({ code: '23514', message: 'decision_past_due', details: null }),
    ).toBe(true);
  });

  it('reads nothing else as it', () => {
    expect(isPastDueRefusal({ message: 'permission denied' })).toBe(false);
    expect(isPastDueRefusal(new Error('network'))).toBe(false);
    expect(isPastDueRefusal(undefined)).toBe(false);
  });
});

describe('refusalSentence', () => {
  it('prints the house’s sentence and never the cause’s own words', () => {
    expect(
      refusalSentence(new Error('duplicate key value violates unique constraint'), 'Nope.'),
    ).toBe('Nope.');
  });
});
