import {
  extractAttributeKeywords,
  rankTaughtAlternatives,
  ATTRIBUTE_VOCABULARY,
  type KeywordSurface,
} from './taught-alternatives';

describe('extractAttributeKeywords', () => {
  it('returns [] for empty / null / whitespace', () => {
    expect(extractAttributeKeywords('')).toEqual([]);
    expect(extractAttributeKeywords(null)).toEqual([]);
    expect(extractAttributeKeywords(undefined)).toEqual([]);
    expect(extractAttributeKeywords('   ')).toEqual([]);
  });

  it('pulls colors / materials / forms from a rejection note, in first-seen order', () => {
    expect(
      extractAttributeKeywords('This is too big — I wanted a walnut table, not black'),
    ).toEqual(['walnut', 'table', 'black']);
  });

  it('is case-insensitive and dedupes', () => {
    expect(extractAttributeKeywords('OAK, oak and more Oak')).toEqual(['oak']);
  });

  it('ignores words outside the curated vocabulary', () => {
    expect(extractAttributeKeywords('the client hated it and wants something else')).toEqual([]);
  });

  it('does NOT read negation — it extracts the attribute word regardless of intent', () => {
    // A documented limitation: "not black" still yields "black" (no LLM).
    expect(extractAttributeKeywords('anything but black')).toContain('black');
  });

  it('splits on punctuation so words are not swallowed', () => {
    expect(extractAttributeKeywords('brass/glass,leather')).toEqual(['brass', 'glass', 'leather']);
  });

  it('vocabulary is non-trivial', () => {
    expect(ATTRIBUTE_VOCABULARY.has('velvet')).toBe(true);
    expect(ATTRIBUTE_VOCABULARY.has('sofa')).toBe(true);
    expect(ATTRIBUTE_VOCABULARY.size).toBeGreaterThan(50);
  });
});

describe('rankTaughtAlternatives', () => {
  const c = (name: string, extra: Partial<KeywordSurface> = {}): KeywordSurface & { name: string } => ({
    name,
    ...extra,
  });

  // Incoming order is the SQL corpus-first order — the function must preserve it.
  const corpus = [
    c('Ashwood Sofa'), // 0
    c('Black Leather Chair', { materials: ['leather'] }), // 1
    c('Walnut Side Table', { category: 'table', style_tags: ['mid-century'] }), // 2
    c('Brass Floor Lamp', { materials: ['brass'] }), // 3
  ];

  it('with no keywords, preserves corpus-first order (returns a copy)', () => {
    const out = rankTaughtAlternatives(corpus, []);
    expect(out.map((x) => x.name)).toEqual([
      'Ashwood Sofa',
      'Black Leather Chair',
      'Walnut Side Table',
      'Brass Floor Lamp',
    ]);
    expect(out).not.toBe(corpus); // a copy, not the same array
  });

  it('floats keyword-matching candidates to the top, stable within each group', () => {
    // "walnut" matches #2 only → it leads; the rest keep corpus order.
    const out = rankTaughtAlternatives(corpus, ['walnut']);
    expect(out.map((x) => x.name)).toEqual([
      'Walnut Side Table',
      'Ashwood Sofa',
      'Black Leather Chair',
      'Brass Floor Lamp',
    ]);
  });

  it('matches across name, category, style_tags, and materials — and never drops non-matches', () => {
    // "leather" (materials of #1) + "table" (category of #2) both match.
    const out = rankTaughtAlternatives(corpus, ['leather', 'table']);
    expect(out.map((x) => x.name)).toEqual([
      'Black Leather Chair', // matched (materials), corpus index 1
      'Walnut Side Table', // matched (category), corpus index 2
      'Ashwood Sofa', // rest
      'Brass Floor Lamp', // rest
    ]);
    expect(out).toHaveLength(corpus.length); // nothing removed
  });

  it('does not partial-match inside a longer word (token, not substring)', () => {
    // "ash" must NOT match "Ashwood".
    const out = rankTaughtAlternatives(corpus, ['ash']);
    expect(out.map((x) => x.name)).toEqual(corpus.map((x) => x.name)); // no reorder
  });
});
