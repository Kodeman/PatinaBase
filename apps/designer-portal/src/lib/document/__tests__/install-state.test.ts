import { STATE_WORDS, isPieceHere, pieceInstallState } from '../install-state';

describe('install state (D6, 0a-2)', () => {
  it('a piece on the way is not here', () => {
    for (const status of ['specified', 'approved', 'ordered', 'production', 'shipped']) {
      expect(isPieceHere({ status })).toBe(false);
      expect(pieceInstallState({ status })).toBe('not-here');
    }
  });

  it('a delivered piece is here', () => {
    expect(isPieceHere({ status: 'delivered' })).toBe(true);
    expect(pieceInstallState({ status: 'delivered' })).toBe('here');
  });

  it("the purchase order's delivered date makes a piece here", () => {
    const item = { status: 'shipped', purchase_order: { delivered_date: '2026-10-02' } };
    expect(isPieceHere(item)).toBe(true);
    expect(pieceInstallState(item)).toBe('here');
  });

  it('an empty delivered date or a missing order says nothing', () => {
    expect(isPieceHere({ status: 'shipped', purchase_order: { delivered_date: null } })).toBe(false);
    expect(isPieceHere({ status: 'shipped', purchase_order: null })).toBe(false);
    expect(isPieceHere({ status: null })).toBe(false);
  });

  it('an installed piece is here and reads Installed', () => {
    expect(isPieceHere({ status: 'installed' })).toBe(true);
    expect(pieceInstallState({ status: 'installed' })).toBe('installed');
  });

  it('prints the three words', () => {
    expect(STATE_WORDS).toEqual({ 'not-here': 'Not here', here: 'Here', installed: 'Installed' });
  });
});
