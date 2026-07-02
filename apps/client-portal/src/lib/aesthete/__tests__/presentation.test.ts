/**
 * Copy-law guards for the quiz results surface (design §10.6):
 * confidence is a band, never a percent; budget copy handles the null
 * 'discuss' range; archetype copy composes without inventing judgment.
 */
import {
  archetypeLine,
  budgetPosture,
  confidenceBand,
  formatPriceCents,
  SPECTRUM_META,
} from '../presentation';

describe('confidenceBand (§10.6: early read / good / strong — never a percent)', () => {
  it('maps low, mid, and high confidence to the three legal bands', () => {
    expect(confidenceBand(0.1)).toBe('early read');
    expect(confidenceBand(0.44)).toBe('early read');
    expect(confidenceBand(0.45)).toBe('good');
    expect(confidenceBand(0.5)).toBe('good');
    expect(confidenceBand(0.72)).toBe('strong');
    expect(confidenceBand(1)).toBe('strong');
  });

  it('treats missing confidence as an early read', () => {
    expect(confidenceBand(null)).toBe('early read');
    expect(confidenceBand(undefined)).toBe('early read');
  });

  it('never emits digits or percent signs', () => {
    for (const c of [0, 0.3, 0.5, 0.7, 0.99, 1]) {
      expect(confidenceBand(c)).not.toMatch(/[\d%]/);
    }
  });
});

describe('budgetPosture', () => {
  it('formats a real range in whole dollars', () => {
    expect(
      budgetPosture({ min_cents: 500000, max_cents: 1500000, label: 'Heirloom', value_orientation: 0.7 }),
    ).toBe('Heirloom · $5,000–$15,000');
  });

  it("renders the 'discuss' null range as a conversation, not a number", () => {
    const line = budgetPosture({
      min_cents: null,
      max_cents: null,
      label: 'Let us talk it through',
      value_orientation: 0.2,
      lead_signal: true,
    });
    expect(line).toBe('Let us talk it through — a conversation, not a number');
    expect(line).not.toMatch(/\$/);
  });

  it('degrades to null without a budget', () => {
    expect(budgetPosture(null)).toBeNull();
    expect(budgetPosture(undefined)).toBeNull();
  });
});

describe('archetypeLine', () => {
  it('composes primary + secondary', () => {
    expect(archetypeLine('Warm Modern', 'Japandi')).toBe('Warm Modern, with a thread of Japandi');
  });
  it('stands alone with only a primary', () => {
    expect(archetypeLine('Warm Modern', null)).toBe('Warm Modern');
  });
  it('is null when nothing accumulated (server may return null archetype)', () => {
    expect(archetypeLine(null, null)).toBeNull();
  });
});

describe('formatPriceCents', () => {
  it('renders cents as whole dollars', () => {
    expect(formatPriceCents(420000)).toBe('$4,200');
  });
  it('is null for missing prices', () => {
    expect(formatPriceCents(null)).toBeNull();
  });
});

describe('SPECTRUM_META', () => {
  it('covers all six dimensions in display order', () => {
    expect(SPECTRUM_META.map((s) => s.key)).toEqual([
      'warmth',
      'complexity',
      'formality',
      'timelessness',
      'boldness',
      'craftsmanship',
    ]);
  });

  it('copy never says "AI" (copy law §2.1)', () => {
    const allCopy = SPECTRUM_META.flatMap((s) => [s.label, s.low, s.high]).join(' ');
    expect(allCopy).not.toMatch(/\bAI\b/);
  });
});
