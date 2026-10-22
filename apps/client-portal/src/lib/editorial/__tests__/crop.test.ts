import { PHONE_MEDIA, SHORT_PHONE_FRAME, objectPositionFromRect, platePicture, shortFramePosition } from '../crop';
import type { EditorialAsset } from '../types';

const SHA = 'a'.repeat(64);

function asset(crops: EditorialAsset['crops']): EditorialAsset {
  return {
    id: 'asset-1',
    sha256: SHA,
    sourceKind: 'maker',
    width: 4000,
    height: 3000,
    ground: 'scene',
    dominantHex: '#8C7356',
    lqip: null,
    focal: null,
    subjectBox: null,
    crops,
    caption: { what: 'Walnut top', whose: 'Harmon Bench Works', when: '15 October 2026' },
    alt: null,
  };
}

describe('crop', () => {
  it('positions the image at the crop rectangle centre, from source pixels', () => {
    expect(objectPositionFromRect([0, 0, 4000, 2500], 4000, 3000)).toBe('50% 41.7%');
    expect(objectPositionFromRect([1000, 600, 2000, 1500], 4000, 3000)).toBe('50% 45%');
  });

  it('accepts a rectangle already normalised to the source', () => {
    expect(objectPositionFromRect([0.1, 0.2, 0.4, 0.4], 4000, 3000)).toBe('30% 40%');
  });

  it('centres when there is no rectangle', () => {
    expect(objectPositionFromRect(null, 4000, 3000)).toBe('50% 50%');
  });

  it('builds AVIF then WebP sources from the stored crop widths, smallest first', () => {
    const picture = platePicture('proj-1', asset({ wide: { rect: [0, 0, 1, 1], widths: [2048, 1280, 1600] } }), 'wide', '100vw');
    expect(picture!.sources.map((s) => s.type)).toEqual(['image/avif', 'image/webp']);
    expect(picture!.sources[0].srcSet).toBe(
      `/plates/proj-1/${SHA}/wide-1280.avif 1280w, /plates/proj-1/${SHA}/wide-1600.avif 1600w, /plates/proj-1/${SHA}/wide-2048.avif 2048w`,
    );
    expect(picture!.src).toBe(`/plates/proj-1/${SHA}/wide-2048.webp`);
  });

  it('puts the art-directed phone crop first, under the phone media query', () => {
    const picture = platePicture(
      'proj-1',
      asset({
        wide: { rect: [0, 0, 1, 1], widths: [1280] },
        cover_phone: { rect: [0, 0, 1, 1], widths: [640, 828] },
      }),
      'wide',
      '100vw',
      { cropKey: 'cover_phone', sizes: '100vw' },
    );
    expect(picture!.sources.map((s) => [s.type, s.media ?? null])).toEqual([
      ['image/avif', PHONE_MEDIA],
      ['image/webp', PHONE_MEDIA],
      ['image/avif', null],
      ['image/webp', null],
    ]);
    expect(picture!.sources[0].srcSet).toContain('cover_phone-640.avif 640w');
  });

  it('returns null when the asset holds no rendition of the crop', () => {
    expect(platePicture('proj-1', asset({}), 'wide32', '100vw')).toBeNull();
  });
});

/*
 * SQ-1593 R5: a long headline shortens the phone hero from 39:34 to 39:30. The
 * near-edge case: 1560 × 1360, subject box [.05, 0, .9, .7] touching the top.
 * The phone draws cover_phone (39:34, the whole source); at 390 wide it stands
 * 340 tall in a 300 frame, so 40px (160 source rows) must go.
 */
describe('the shorter phone frame', () => {
  const nearEdge: EditorialAsset = {
    ...asset({
      wide32: { rect: [0, 0, 1560, 1040], widths: [768, 1024] },
      cover_phone: { rect: [0, 0, 1560, 1360], widths: [640, 828, 1080] },
    }),
    width: 1560,
    height: 1360,
    subjectBox: [0.05, 0, 0.9, 0.7],
  };

  /** The rendered window, in source rows, for an object-position y share at 390 wide. */
  function windowRows(positionY: number): [number, number] {
    const drawn = 390 / (1560 / 1360); // the rendition's laid-out height
    const frame = 390 / SHORT_PHONE_FRAME;
    const top = (drawn - frame) * positionY;
    const scale = 1360 / drawn;
    return [top * scale, (top + frame) * scale];
  }

  it('keeps the near-edge subject whole: top-aligned, where the desktop crop centre would clip 61px off it', () => {
    // The old position: the desktop crop's centre, applied to the phone rendition.
    expect(objectPositionFromRect(nearEdge.crops.wide32!.rect, 1560, 1360)).toBe('50% 38.2%');
    const [oldTop] = windowRows(0.382);
    expect(oldTop).toBeGreaterThan(61);

    const position = shortFramePosition(nearEdge);
    expect(position).toBe('50% 0%');
    const [top, bottom] = windowRows(0);
    const [, boxY, , boxH] = nearEdge.subjectBox!;
    expect(top).toBeLessThanOrEqual(boxY * 1360);
    expect(bottom).toBeGreaterThanOrEqual((boxY + boxH) * 1360);
  });

  it('stays inside the subject from either edge, nearest the focal point', () => {
    expect(shortFramePosition({ ...nearEdge, subjectBox: [0.05, 0.3, 0.9, 0.7] })).toBe('50% 100%');
    expect(shortFramePosition({ ...nearEdge, subjectBox: [0.1, 0.4, 0.8, 0.2], focal: [0.5, 0.5] })).toBe('50% 50%');
    // No subject box: the picture sits centred, as nothing needs protecting.
    expect(shortFramePosition({ ...nearEdge, subjectBox: null })).toBe('50% 50%');
  });

  it('refuses cover for the 1200×1600 scan in a 390×400 viewport clamped to 72svh', () => {
    const scan: EditorialAsset = {
      ...nearEdge, sourceKind: 'scan', width: 1200, height: 1600,
      subjectBox: [0.05, 0, 0.9, 0.57],
      crops: { cover_phone: { rect: [0, 0, 1200, 1046], widths: [640, 828, 1080] } },
    };
    const width = 390;
    const height = Math.min(width / SHORT_PHONE_FRAME, 400 * 0.72);
    const subjectHeight = scan.subjectBox![3] * scan.height;
    expect(subjectHeight - height / width * scan.width).toBeCloseTo(25.846, 2);
    expect(shortFramePosition(scan)).toBe('50% 0%'); // nominal box fits
    expect(shortFramePosition(scan, width / height)).toBeNull(); // actual box needs contain
    // A slightly smaller near-top subject fits only when the actual aspect is used.
    expect(shortFramePosition({ ...scan, subjectBox: [0.05, 0, 0.9, 0.55] }, width / height)).toBe('50% 0%');
  });

  it('refuses the shorter frame when the subject is taller than it: the hero keeps 39:34', () => {
    expect(shortFramePosition({ ...nearEdge, subjectBox: [0.05, 0, 0.9, 0.95] })).toBeNull();
    // A hero with no phone rendition to measure keeps the taller frame too.
    expect(shortFramePosition({ ...nearEdge, crops: {} })).toBeNull();
  });
});
