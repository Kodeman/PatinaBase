import { buildRefreshDiff, type RefreshCurrentRecord, type ExtractedProduct } from './capture-from-url';

const current: RefreshCurrentRecord = {
  name: 'Oak Table',
  brand: 'Patina',
  description: 'A table.',
  price_retail: 420000,
  images: ['a.jpg'],
};

describe('buildRefreshDiff', () => {
  it('proposes nothing when the page matches the record', () => {
    const extracted: ExtractedProduct = {
      name: 'Oak Table',
      brand: 'Patina',
      description: 'A table.',
      priceRetailCents: 420000,
      images: ['a.jpg'],
    };
    expect(buildRefreshDiff(current, extracted)).toEqual([]);
  });

  it('proposes only the fields the page carries AND that differ', () => {
    const extracted: ExtractedProduct = {
      name: 'Heirloom Oak Table', // changed
      brand: 'Patina', // same → not proposed
      priceRetailCents: 399000, // changed
      // description + images absent → never proposed (a refresh cannot wipe)
    };
    const diff = buildRefreshDiff(current, extracted);
    expect(diff.map((d) => d.field).sort()).toEqual(['name', 'price_retail']);
    const name = diff.find((d) => d.field === 'name');
    expect(name).toMatchObject({ before: 'Oak Table', after: 'Heirloom Oak Table' });
    const price = diff.find((d) => d.field === 'price_retail');
    expect(price).toMatchObject({ before: 420000, after: 399000 });
  });

  it('never proposes a field the page omits (no silent wipe of a verified record)', () => {
    expect(buildRefreshDiff(current, {})).toEqual([]);
    expect(buildRefreshDiff(current, { name: '', description: '   ', images: [] })).toEqual([]);
  });

  it('trims extracted text and compares trimmed', () => {
    expect(buildRefreshDiff(current, { name: '  Oak Table  ' })).toEqual([]); // trims to same
    const diff = buildRefreshDiff(current, { brand: '  Strata  ' });
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ field: 'brand', after: 'Strata' });
  });

  it('adds a field that was empty on file', () => {
    const bare: RefreshCurrentRecord = { name: 'X' };
    const diff = buildRefreshDiff(bare, { brand: 'Patina', priceRetailCents: 100 });
    expect(diff.map((d) => d.field).sort()).toEqual(['brand', 'price_retail']);
    expect(diff.find((d) => d.field === 'brand')).toMatchObject({ before: null, after: 'Patina' });
  });

  it('proposes images when the page carries a different set', () => {
    const diff = buildRefreshDiff(current, { images: ['a.jpg', 'b.jpg'] });
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ field: 'images', before: ['a.jpg'], after: ['a.jpg', 'b.jpg'] });
  });

  it('does not propose images when the set is unchanged', () => {
    expect(buildRefreshDiff(current, { images: ['a.jpg'] })).toEqual([]);
  });
});
