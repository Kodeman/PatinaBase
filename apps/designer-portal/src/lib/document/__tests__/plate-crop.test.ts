/**
 * US-49 (R8) — the studio previews the crop the media worker cuts. Parity with
 * infra/media-worker/container/plates.mjs planCrops, on the SQ-1636 review's
 * two native reproductions, plus the client page's cover eligibility (R11).
 */
import {
  COVER_ASPECT,
  heroEligible,
  objectPositionOf,
  plateCropRect,
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
      COVER_ASPECT.wide,
    );
    expect(window).toEqual({ left: 0, top: 0.1, vx: 1, vy: 0.625 });
    // 0.1 of the 0.375 that can move: 26.67% down.
    expect(objectPositionOf(window)).toMatch(/^50% 26\.666/);
  });

  it('where the worker cuts nothing, the preview centres on the point unconstrained', () => {
    const window = plateCropWindow(
      { width: 2000, height: 1250, focal: [1, 0.2], subjectBox: [0, 0, 1, 1] },
      COVER_ASPECT.cover_phone,
    );
    expect(window.left).toBeCloseTo(566 / 2000);
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
