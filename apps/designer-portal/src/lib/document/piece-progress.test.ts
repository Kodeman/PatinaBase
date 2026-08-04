/**
 * piece-progress — the R40 completeness read (P2-9 gating regression).
 *
 * Covers the base pieceSections/pieceFill/piecePct/pieceStateLabel/pieceGaps
 * behavior, plus the invariant the flat-facet gating work depends on: a
 * gated facet (available_colors, finish) can never strand `piece` section
 * completion, for any configuration_mode, because `piece` never reads them.
 */
import {
  pieceFill,
  pieceGaps,
  piecePct,
  pieceSections,
  pieceStateLabel,
  type PieceRow,
} from './piece-progress';

const FULL_ROW: PieceRow = {
  name: 'Chesterfield sofa',
  brand: 'Studio Aldwych',
  dimensions: { width: '84', depth: '38', height: '30' },
  materials: ['solid oak', 'linen'],
  price_retail: 480000,
  price_trade: 320000,
  images: ['https://example.com/a.jpg'],
};

describe('pieceSections', () => {
  it('marks every section true for a fully-captured row with teaching', () => {
    const sections = pieceSections(FULL_ROW, true);
    expect(sections).toEqual({
      identity: true,
      piece: true,
      commerce: true,
      folio: true,
      eye: true,
    });
  });

  it('marks every section false for a bare row without teaching', () => {
    const sections = pieceSections({}, false);
    expect(sections).toEqual({
      identity: false,
      piece: false,
      commerce: false,
      folio: false,
      eye: false,
    });
  });

  it('identity requires BOTH a name and a brand', () => {
    expect(pieceSections({ name: 'Sofa' }, false).identity).toBe(false);
    expect(pieceSections({ brand: 'Studio' }, false).identity).toBe(false);
    expect(
      pieceSections({ name: 'Sofa', brand: 'Studio' }, false).identity,
    ).toBe(true);
  });

  it('piece requires BOTH dimensions and at least one material', () => {
    expect(
      pieceSections({ dimensions: { width: '84' } }, false).piece,
    ).toBe(false);
    expect(pieceSections({ materials: ['oak'] }, false).piece).toBe(false);
    expect(
      pieceSections(
        { dimensions: { width: '84' }, materials: ['oak'] },
        false,
      ).piece,
    ).toBe(true);
  });

  it('commerce accepts either a retail or a trade price', () => {
    expect(pieceSections({ price_retail: 100 }, false).commerce).toBe(true);
    expect(pieceSections({ price_trade: 100 }, false).commerce).toBe(true);
    expect(pieceSections({}, false).commerce).toBe(false);
  });

  it('folio requires at least one image', () => {
    expect(pieceSections({ images: [] }, false).folio).toBe(false);
    expect(pieceSections({ images: ['a.jpg'] }, false).folio).toBe(true);
  });
});

describe('pieceSections — flat-facet gating cannot strand completion (P2-9)', () => {
  it('piece completion is identical with and without available_colors/finish on the row', () => {
    const withoutGatedFacets = pieceSections(FULL_ROW, false);
    const withGatedFacets = pieceSections(
      { ...FULL_ROW, available_colors: ['walnut'], finish: 'hand-rubbed oil' },
      false,
    );
    expect(withGatedFacets).toEqual(withoutGatedFacets);
    expect(withGatedFacets.piece).toBe(true);
  });

  it('a row missing available_colors/finish is still complete once dimensions+materials are on file', () => {
    // Simulates a configured piece: available_colors/finish are gated
    // read-only on the Piece Room (readOnly={readOnly || mode !== "standard"})
    // and may never get a value on file — completion must not depend on them.
    const configuredPieceRow: PieceRow = {
      ...FULL_ROW,
      configuration_mode: 'variant',
      available_colors: null,
      finish: null,
    };
    expect(pieceSections(configuredPieceRow, false).piece).toBe(true);
  });

  it('completion is unaffected by configuration_mode for every mode value', () => {
    const modes = ['standard', 'variant', 'configured', 'custom', null, undefined];
    const results = modes.map(
      (configuration_mode) =>
        pieceSections({ ...FULL_ROW, configuration_mode }, true).piece,
    );
    expect(results.every((value) => value === true)).toBe(true);
  });
});

describe('pieceFill / piecePct / pieceStateLabel', () => {
  it('computes the three-line fill fractions from sections', () => {
    const sections = pieceSections(FULL_ROW, true);
    expect(pieceFill(sections)).toEqual([1, 1, 1]);
    expect(piecePct(pieceFill(sections))).toBe(100);
    expect(pieceStateLabel(100)).toBe('Catalog-ready');
  });

  it('reads Capture at 0% and Draft in between', () => {
    expect(pieceStateLabel(0)).toBe('Capture');
    expect(pieceStateLabel(50)).toBe('Draft');
  });

  it('half-filled sections average correctly', () => {
    const sections = pieceSections(
      { name: 'Sofa', brand: 'Studio' }, // identity true, everything else false
      false,
    );
    const fill = pieceFill(sections);
    expect(fill).toEqual([0.5, 0, 0]);
    expect(piecePct(fill)).toBe(17); // round((0.5+0+0)/3 * 100)
  });
});

describe('pieceGaps', () => {
  it('lists nothing for a fully-captured row', () => {
    expect(pieceGaps(pieceSections(FULL_ROW, true))).toEqual([]);
  });

  it('lists every open gap for a bare row, in a stable order', () => {
    expect(pieceGaps(pieceSections({}, false))).toEqual([
      'a name & maker',
      'dimensions & materials',
      'a price',
      'an image',
      'its style',
    ]);
  });

  it('never lists color or finish — gated facets are not tracked gaps', () => {
    const gaps = pieceGaps(pieceSections({}, false));
    expect(gaps.some((gap) => /color|finish/i.test(gap))).toBe(false);
  });
});
