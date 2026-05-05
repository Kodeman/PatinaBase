import { describe, expect, it } from 'vitest';
import {
  diceCoefficient,
  findSimilarVendors,
} from '../lib/vendor-similarity';

describe('diceCoefficient', () => {
  it('returns 1 for identical strings', () => {
    expect(diceCoefficient('Herman Miller', 'Herman Miller')).toBe(1);
  });

  it('returns 1 for same string with case + punctuation differences', () => {
    expect(diceCoefficient('Herman Miller', 'herman-miller')).toBe(1);
  });

  it('scores near-identical strings highly', () => {
    const score = diceCoefficient('Herman Miller', 'Herman Miller Inc');
    expect(score).toBeGreaterThan(0.85);
  });

  it('scores plausible-same-brand pairs above 0.7', () => {
    const score = diceCoefficient('West Elm', 'West Elm Home');
    expect(score).toBeGreaterThan(0.7);
  });

  it('scores unrelated strings low', () => {
    expect(diceCoefficient('Herman Miller', 'IKEA')).toBeLessThan(0.3);
  });

  it('returns 0 when either is empty', () => {
    expect(diceCoefficient('', 'foo')).toBe(0);
    expect(diceCoefficient('foo', '')).toBe(0);
  });
});

describe('findSimilarVendors', () => {
  const vendors = [
    { id: '1', name: 'Herman Miller' },
    { id: '2', name: 'Knoll' },
    { id: '3', name: 'IKEA' },
    { id: '4', name: 'Herman Miller Inc' },
  ];

  it('returns matches ranked by score', () => {
    const matches = findSimilarVendors('Herman Miller', vendors);
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches[0].vendor.id).toBe('1');
    expect(matches[0].score).toBe(1);
  });

  it('respects the threshold', () => {
    const matches = findSimilarVendors('Herman Miller', vendors, 0.99);
    expect(matches).toHaveLength(1);
  });

  it('returns empty array for unknown brands', () => {
    const matches = findSimilarVendors('CompletelyNewBrand', vendors);
    expect(matches).toEqual([]);
  });
});
