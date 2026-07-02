/**
 * §8.2 correction picker vocabulary — chip → direction mapping.
 */

import {
  CORRECTION_CHIPS,
  CORRECTION_STEP,
  chipsToDirection,
  toggleChip,
} from '../correction-chips';

describe('CORRECTION_CHIPS', () => {
  it('covers all six dimensions with both poles', () => {
    expect(CORRECTION_CHIPS).toHaveLength(12);
    const dims = new Set(CORRECTION_CHIPS.map((c) => c.dimension));
    expect(dims.size).toBe(6);
    for (const dim of dims) {
      const signs = CORRECTION_CHIPS.filter((c) => c.dimension === dim).map((c) => c.sign);
      expect(signs.sort()).toEqual([-1, 1]);
    }
  });

  it('never says "AI" (copy law)', () => {
    for (const chip of CORRECTION_CHIPS) {
      expect(chip.label).not.toMatch(/\bAI\b/i);
    }
  });
});

describe('chipsToDirection', () => {
  it('maps "more industrial" to craftsmanship down (§8.2 example shape)', () => {
    expect(chipsToDirection(['craftsmanship:-'])).toEqual({ craftsmanship: -CORRECTION_STEP });
  });

  it('folds multiple dimensions into one direction object', () => {
    expect(chipsToDirection(['warmth:+', 'boldness:-'])).toEqual({
      warmth: CORRECTION_STEP,
      boldness: -CORRECTION_STEP,
    });
  });

  it('last sign wins when both poles of a dimension sneak in', () => {
    expect(chipsToDirection(['warmth:+', 'warmth:-'])).toEqual({ warmth: -CORRECTION_STEP });
  });

  it('ignores unknown ids', () => {
    expect(chipsToDirection(['nonsense'])).toEqual({});
  });
});

describe('toggleChip', () => {
  it('adds and removes a chip', () => {
    const on = toggleChip([], 'warmth:+');
    expect(on).toEqual(['warmth:+']);
    expect(toggleChip(on, 'warmth:+')).toEqual([]);
  });

  it('evicts the opposite pole of the same dimension', () => {
    expect(toggleChip(['warmth:+'], 'warmth:-')).toEqual(['warmth:-']);
  });

  it('leaves other dimensions alone', () => {
    expect(toggleChip(['boldness:-'], 'warmth:+')).toEqual(['boldness:-', 'warmth:+']);
  });
});
