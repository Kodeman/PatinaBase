import {
  draftingFill,
  draftingPct,
  draftingStateLabel,
  draftingGaps,
  type DraftingFacets,
} from '../drafting-progress';

const NONE: DraftingFacets = {
  rooms: false,
  ffe: false,
  phases: false,
  exclusions: false,
  payments: false,
  terms: false,
  palette: false,
  boards: false,
};

const mk = (over: Partial<DraftingFacets>): DraftingFacets => ({ ...NONE, ...over });

describe('draftingFill (R42)', () => {
  it('an empty outline fills nothing', () => {
    const f = mk({});
    expect(draftingFill(f)).toEqual([0, 0, 0]);
    expect(draftingPct(draftingFill(f))).toBe(0);
  });

  it('rooms + ffe fill SCOPE whole, the other two lines empty', () => {
    const f = mk({ rooms: true, ffe: true });
    expect(draftingFill(f)).toEqual([1, 0, 0]);
  });

  it('one SCOPE facet fills line one halfway', () => {
    expect(draftingFill(mk({ rooms: true }))).toEqual([0.5, 0, 0]);
    expect(draftingFill(mk({ ffe: true }))).toEqual([0.5, 0, 0]);
  });

  it('one OFFER facet fills line two a quarter', () => {
    expect(draftingFill(mk({ phases: true }))).toEqual([0, 0.25, 0]);
    expect(draftingFill(mk({ exclusions: true }))).toEqual([0, 0.25, 0]);
    expect(draftingFill(mk({ payments: true }))).toEqual([0, 0.25, 0]);
    expect(draftingFill(mk({ terms: true }))).toEqual([0, 0.25, 0]);
  });

  it('all four OFFER facets fill line two whole', () => {
    const f = mk({ phases: true, exclusions: true, payments: true, terms: true });
    expect(draftingFill(f)).toEqual([0, 1, 0]);
  });

  it('one VISION facet fills line three halfway', () => {
    expect(draftingFill(mk({ palette: true }))).toEqual([0, 0, 0.5]);
    expect(draftingFill(mk({ boards: true }))).toEqual([0, 0, 0.5]);
  });

  it('a fully drafted proposal fills every line', () => {
    const f = mk({
      rooms: true,
      ffe: true,
      phases: true,
      exclusions: true,
      payments: true,
      terms: true,
      palette: true,
      boards: true,
    });
    expect(draftingFill(f)).toEqual([1, 1, 1]);
    expect(draftingPct(draftingFill(f))).toBe(100);
  });
});

describe('draftingPct', () => {
  it('rounds the average of the three lines to a whole percent', () => {
    // SCOPE whole only → (1 + 0 + 0) / 3 = 33%
    expect(draftingPct([1, 0, 0])).toBe(33);
    // one OFFER quarter → (0.25 / 3) → 8%
    expect(draftingPct([0, 0.25, 0])).toBe(8);
  });
});

describe('draftingStateLabel', () => {
  it("an empty outline reads 'Outline'", () => {
    expect(draftingStateLabel(draftingPct(draftingFill(NONE)))).toBe('Outline');
    expect(draftingStateLabel(0)).toBe('Outline');
    expect(draftingStateLabel(-5)).toBe('Outline');
  });

  it("anything begun-but-unfinished reads 'Drafting'", () => {
    expect(draftingStateLabel(33)).toBe('Drafting');
    expect(draftingStateLabel(99)).toBe('Drafting');
  });

  it("a full draft reads 'Ready to send'", () => {
    const f = mk({
      rooms: true,
      ffe: true,
      phases: true,
      exclusions: true,
      payments: true,
      terms: true,
      palette: true,
      boards: true,
    });
    expect(draftingStateLabel(draftingPct(draftingFill(f)))).toBe('Ready to send');
    expect(draftingStateLabel(100)).toBe('Ready to send');
  });
});

describe('draftingGaps', () => {
  it('an empty outline lists every facet, in line order, in plain words', () => {
    expect(draftingGaps(NONE)).toEqual([
      'rooms in scope',
      'an FF&E schedule',
      'phases & fees',
      'exclusions',
      'a payment schedule',
      'change-order terms',
      'a palette',
      'mood boards',
    ]);
  });

  it('a full draft has no open items', () => {
    const f = mk({
      rooms: true,
      ffe: true,
      phases: true,
      exclusions: true,
      payments: true,
      terms: true,
      palette: true,
      boards: true,
    });
    expect(draftingGaps(f)).toEqual([]);
  });

  it('only the missing facets surface', () => {
    expect(draftingGaps(mk({ rooms: true, ffe: true, palette: true, boards: true }))).toEqual([
      'phases & fees',
      'exclusions',
      'a payment schedule',
      'change-order terms',
    ]);
  });
});
