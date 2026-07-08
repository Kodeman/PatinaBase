import {
  recordCompletenessFill,
  recordCompletenessPct,
  type RecordCompletenessRow,
} from './record-completeness';

const full: RecordCompletenessRow = {
  name: 'Heirloom Oak Table',
  brand: 'Patina',
  dimensions: { width: '72', depth: '40', height: '30', unit: 'in' },
  materials: ['oak'],
  price_retail: 420000,
  images: ['a.jpg'],
};

describe('recordCompletenessFill', () => {
  it('scores an empty record [0,0,0]', () => {
    expect(recordCompletenessFill({}, false)).toEqual([0, 0, 0]);
  });

  it('scores a fully-taught record [1,1,1]', () => {
    expect(recordCompletenessFill(full, true)).toEqual([1, 1, 1]);
  });

  it('line 1 = identity(0.5) + piece(0.5): needs BOTH name & brand, AND dims & materials', () => {
    expect(recordCompletenessFill({ name: 'X' }, false)[0]).toBe(0); // brand missing
    expect(recordCompletenessFill({ name: 'X', brand: 'Y' }, false)[0]).toBe(0.5); // identity only
    expect(
      recordCompletenessFill({ name: 'X', brand: 'Y', dimensions: { width: '1' }, materials: ['oak'] }, false)[0],
    ).toBe(1);
  });

  it('piece needs a real dimension value AND at least one material', () => {
    expect(recordCompletenessFill({ dimensions: {}, materials: ['oak'] }, false)[0]).toBe(0);
    expect(recordCompletenessFill({ dimensions: { width: '  ' }, materials: ['oak'] }, false)[0]).toBe(0);
    expect(recordCompletenessFill({ dimensions: { depth: '40' }, materials: [] }, false)[0]).toBe(0);
    expect(recordCompletenessFill({ dimensions: { height: '30' }, materials: ['oak'] }, false)[0]).toBe(0.5);
  });

  it('line 2 = commerce(0.5, trade OR retail) + folio(0.5, ≥1 image)', () => {
    expect(recordCompletenessFill({ price_trade: 100 }, false)[1]).toBe(0.5);
    expect(recordCompletenessFill({ price_retail: 0 }, false)[1]).toBe(0.5); // 0 is a price on file
    expect(recordCompletenessFill({ images: ['a'] }, false)[1]).toBe(0.5);
    expect(recordCompletenessFill({ price_retail: 1, images: ['a'] }, false)[1]).toBe(1);
  });

  it('line 3 = the eye (teaching) only', () => {
    expect(recordCompletenessFill({}, true)).toEqual([0, 0, 1]);
  });
});

describe('recordCompletenessPct', () => {
  it('0 for empty, 100 for fully taught', () => {
    expect(recordCompletenessPct({}, false)).toBe(0);
    expect(recordCompletenessPct(full, true)).toBe(100);
  });

  it('100 requires the eye — a perfect record with no teaching caps below 100', () => {
    expect(recordCompletenessPct(full, false)).toBe(67); // [1,1,0] → round(2/3*100)
  });

  it('rounds the average of the three lines', () => {
    // [1, 0.5, 0] → (1.5/3)*100 = 50
    expect(recordCompletenessPct({ name: 'X', brand: 'Y', dimensions: { width: '1' }, materials: ['oak'], price_retail: 1 }, false)).toBe(50);
  });
});
