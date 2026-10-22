/**
 * US-49 (R8) — the studio previews the crop the media worker cuts. Parity with
 * infra/media-worker/container/plates.mjs planCrops, on the SQ-1636 review's
 * two native reproductions, plus the client page's cover eligibility (R11).
 */
import {
  COVER_ASPECT,
  coverCropShown,
  heroEligible,
  objectPositionOf,
  plateCrop,
  plateCropRect,
  plateCrops,
  plateCropWindow,
} from '../plate-crop';

describe('plateCropRect — the worker’s centring and containment', () => {
  it('2000×1250, focal [1, .2], no box: wide is the whole source, the phone cover slides right', () => {
    const source = { width: 2000, height: 1250, focal: [1, 0.2], subjectBox: null };
    expect(plateCropRect(source, COVER_ASPECT.wide)).toEqual([0, 0, 2000, 1250]);
    // 1250 × 39/34 = 1434 wide, centred on x = 2000, held inside the source.
    expect(plateCropRect(source, COVER_ASPECT.cover_phone)).toEqual([566, 0, 1434, 1250]);
    expect(plateCropRect(source, 3 / 2)).not.toBeNull();
    expect(plateCropRect(source, 7 / 5)).not.toBeNull();
  });

  it('a manufactured whole-frame box would drop the phone, 3:2 and pair crops (why R1 keeps null)', () => {
    const source = { width: 2000, height: 1250, focal: [1, 0.2], subjectBox: [0, 0, 1, 1] };
    expect(plateCropRect(source, COVER_ASPECT.wide)).toEqual([0, 0, 2000, 1250]);
    expect(plateCropRect(source, COVER_ASPECT.cover_phone)).toBeNull();
    expect(plateCropRect(source, 3 / 2)).toBeNull();
    expect(plateCropRect(source, 7 / 5)).toBeNull();
  });

  it('2000², box [.1,.1,.8,.5], focal [.5,.6]: containment wins → wide [0, 200, 2000, 1250]', () => {
    const source = { width: 2000, height: 2000, focal: [0.5, 0.6], subjectBox: [0.1, 0.1, 0.8, 0.5] };
    expect(plateCropRect(source, COVER_ASPECT.wide)).toEqual([0, 200, 2000, 1250]);
    // The unconstrained centre would have put it at 575.
    expect(plateCropRect({ ...source, subjectBox: null }, COVER_ASPECT.wide)).toEqual([0, 575, 2000, 1250]);
  });

  it('no focal point: the worker’s thirds bias [.5, .45]', () => {
    expect(plateCropRect({ width: 2000, height: 2000 }, COVER_ASPECT.wide)).toEqual([0, 275, 2000, 1250]);
  });
});

describe('plateCropWindow / objectPositionOf', () => {
  it('turns the cut into the frame’s object-position', () => {
    const window = plateCropWindow(
      { width: 2000, height: 2000, focal: [0.5, 0.6], subjectBox: [0.1, 0.1, 0.8, 0.5] },
      'wide',
    );
    expect(window).toEqual({ left: 0, top: 0.1, vx: 1, vy: 0.625 });
    // 0.1 of the 0.375 that can move: 26.67% down.
    expect(objectPositionOf(window!)).toMatch(/^50% 26\.666/);
  });
});

/*
 * N1 — a crop the worker does not cut is unavailable, never an invented
 * window. Oracle values are native planCrops output (plates.mjs, scene ground,
 * upload), pinned here rather than imported.
 */
describe('plateCrop / plateCropWindow — unavailable where planCrops cuts nothing (N1)', () => {
  it('2000×1250, focal [1, .2], box [0,0,1,1]: the worker cuts only wide and piece', () => {
    // planCrops → {wide: [0, 0, 2000, 1250], piece: [0, 0, 2000, 1250]}
    const source = { width: 2000, height: 1250, focal: [1, 0.2], subjectBox: [0, 0, 1, 1] };
    expect(plateCrop(source, 'wide')).toEqual([0, 0, 2000, 1250]);
    expect(plateCrop(source, 'cover_phone')).toBeNull();
    expect(plateCrop(source, 'wide32')).toBeNull();
    expect(plateCrop(source, 'tall')).toBeNull();
    expect(plateCropWindow(source, 'cover_phone')).toBeNull();
    // The client page's phones fall back to the desktop crop: the wide cover.
    expect(coverCropShown(source, 'phone')).toBe('wide');
    expect(coverCropShown(source, 'desktop')).toBe('wide');
  });

  it('1400×900, no box: under the wide floor, so no wide crop; desktops draw the 3:2', () => {
    // planCrops → {cover_phone: [184, 0, 1032, 900], wide32: [25, 0, 1350, 900], pair, piece}
    const source = { width: 1400, height: 900, focal: null, subjectBox: null };
    expect(plateCrop(source, 'wide')).toBeNull();
    expect(plateCropWindow(source, 'wide')).toBeNull();
    expect(plateCrop(source, 'cover_phone')).toEqual([184, 0, 1032, 900]);
    expect(plateCrop(source, 'wide32')).toEqual([25, 0, 1350, 900]);
    expect(coverCropShown(source, 'desktop')).toBe('wide32');
    expect(coverCropShown(source, 'phone')).toBe('cover_phone');
  });

  it('2000×1250, ground white, maker: the worker cuts only pair and piece (F1)', () => {
    // planCrops({width: 2000, height: 1250, ground: 'white', sourceKind: 'maker'})
    //   → {pair: {rect: [125, 0, 1750, 1250]}, piece: {rect: [0, 0, 2000, 1250]}}
    const source = { width: 2000, height: 1250, ground: 'white' };
    expect(plateCrops(source)).toEqual({ pair: [125, 0, 1750, 1250], piece: [0, 0, 2000, 1250] });
    for (const key of ['wide', 'cover_phone', 'wide32', 'tall'] as const) {
      expect(plateCropWindow(source, key)).toBeNull();
    }
    expect(coverCropShown(source, 'desktop')).toBeNull();
    expect(coverCropShown(source, 'phone')).toBeNull();
  });

  it('the same picture on a scene ground, or of unknown ground, keeps its cover crops', () => {
    // planCrops({width: 2000, height: 1250, ground: 'scene', sourceKind: 'maker'})
    const scene = {
      wide: [0, 0, 2000, 1250],
      cover_phone: [283, 0, 1434, 1250],
      wide32: [63, 0, 1875, 1250],
      pair: [125, 0, 1750, 1250],
      piece: [0, 0, 2000, 1250],
    };
    expect(plateCrops({ width: 2000, height: 1250, ground: 'scene' })).toEqual(scene);
    expect(plateCrops({ width: 2000, height: 1250, ground: null })).toEqual(scene);
  });

  it('900×600: under every cover floor, no cover at all', () => {
    // planCrops → {pair, piece} only
    const source = { width: 900, height: 600 };
    for (const key of ['wide', 'cover_phone', 'wide32', 'tall'] as const) {
      expect(plateCrop(source, key)).toBeNull();
    }
    expect(coverCropShown(source, 'desktop')).toBeNull();
    expect(coverCropShown(source, 'phone')).toBeNull();
  });
});

describe('heroEligible — what the client page may open on', () => {
  const asset = (over: Partial<Parameters<typeof heroEligible>[0]> = {}) => ({
    sourceKind: 'upload',
    ground: 'scene',
    width: 2000,
    height: 1250,
    subjectBox: null,
    ...over,
  });

  it('a job photograph meeting the cover floors', () => {
    expect(heroEligible(asset())).toBe(true);
    expect(heroEligible(asset({ sourceKind: 'maker' }))).toBe(true);
    // A measure-width landscape and a tall portrait still open the page.
    expect(heroEligible(asset({ width: 1400, height: 900 }))).toBe(true);
    expect(heroEligible(asset({ width: 1100, height: 1400 }))).toBe(true);
  });

  it('never a concept render, a drawing sheet, a white-ground clipping or a small picture', () => {
    expect(heroEligible(asset({ sourceKind: 'concept' }))).toBe(false);
    expect(heroEligible(asset({ sourceKind: 'sheet' }))).toBe(false);
    expect(heroEligible(asset({ sourceKind: 'maker', ground: 'white' }))).toBe(false);
    expect(heroEligible(asset({ width: 900, height: 600 }))).toBe(false);
    expect(heroEligible(asset({ sourceKind: null }))).toBe(false);
  });
});
