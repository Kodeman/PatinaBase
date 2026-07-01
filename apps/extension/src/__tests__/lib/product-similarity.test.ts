import { describe, it, expect } from 'vitest';
import {
  scoreProductMatch,
  bestProductMatch,
  type ProductCandidate,
} from '../../lib/product-similarity';

const query = {
  name: 'Eames Lounge Chair',
  priceCents: 549900,
  vendorId: 'vendor-hm',
};

function candidate(over: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: 'p1',
    name: 'Eames Lounge Chair',
    priceRetail: 549900,
    vendorId: 'vendor-hm',
    ...over,
  };
}

describe('scoreProductMatch', () => {
  it('scores an identical name + vendor + price near 1', () => {
    expect(scoreProductMatch(candidate(), query)).toBeGreaterThan(0.95);
  });

  it('scores a clearly different product low', () => {
    expect(
      scoreProductMatch(candidate({ name: 'Noguchi Coffee Table', vendorId: null, priceRetail: 199900 }), query)
    ).toBeLessThan(0.5);
  });

  it('rewards a matching vendor', () => {
    const withVendor = scoreProductMatch(candidate({ name: 'Eames Lounge' }), query);
    const withoutVendor = scoreProductMatch(candidate({ name: 'Eames Lounge', vendorId: 'other' }), query);
    expect(withVendor).toBeGreaterThan(withoutVendor);
  });

  it('rewards a price within ~5%', () => {
    const close = scoreProductMatch(candidate({ name: 'Eames Lounge', priceRetail: 540000 }), query);
    const far = scoreProductMatch(candidate({ name: 'Eames Lounge', priceRetail: 100000 }), query);
    expect(close).toBeGreaterThan(far);
  });
});

describe('bestProductMatch', () => {
  it('returns the highest-scoring candidate', () => {
    const best = bestProductMatch(
      [
        candidate({ id: 'a', name: 'Totally Different Sofa', vendorId: null }),
        candidate({ id: 'b' }),
      ],
      query
    );
    expect(best?.candidate.id).toBe('b');
    expect(best?.score).toBeGreaterThan(0.9);
  });

  it('returns null for no candidates', () => {
    expect(bestProductMatch([], query)).toBeNull();
  });
});
