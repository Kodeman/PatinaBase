import { PHONE_MEDIA, objectPositionFromRect, platePicture } from '../crop';
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
