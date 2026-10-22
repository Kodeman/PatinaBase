import { framingRevision, plateSrcSet, plateUrl } from '../plates';
import { heroPicture, heroPreloadSources, platePicture } from '../editorial/crop';
import type { EditorialAsset } from '../editorial/types';

const REV = framingRevision([0.4, 0.5], null);

const asset: EditorialAsset = {
  id: 'asset', sha256: 'a'.repeat(64), sourceKind: 'upload', width: 4000, height: 3000,
  ground: 'scene', dominantHex: null, lqip: null, focal: [0.4, 0.5], subjectBox: null,
  crops: {
    wide: { rect: [0, 0, 4000, 2500], widths: [1280, 1600], rev: REV },
    cover_phone: { rect: [0, 0, 2000, 2000], widths: [640, 828], rev: REV },
  },
  caption: { what: null, whose: null, when: null }, alt: null,
};

it('framingRevision matches the media worker: 16 hex of FNV-1a 64 over [focal, subjectBox]', () => {
  // The same vectors pin infra/media-worker/src/plates.ts framingRevision.
  expect(framingRevision(null, null)).toBe('7272b34ce903217b');
  expect(REV).toBe('234dc778349cc289');
  expect(framingRevision([0.4, 0.5], [0.1, 0.1, 0.5, 0.6])).toBe('2ceb50ab64e60e27');
  expect(framingRevision([0.3, 0.4], null)).toBe('f443ad36e2b82d43');
  expect(framingRevision(null, [0, 0, 1, 1])).toBe('ea45f831d5fcaff0');
});

it('names a revision in the query and leaves an unversioned URL byte-for-byte', () => {
  const url = plateUrl('scope', asset.sha256, 'wide', 1280, 'webp', REV);
  expect(url).toBe(`/plates/scope/${asset.sha256}/wide-1280.webp?r=${REV}`);
  expect(plateUrl('scope', asset.sha256, 'wide', 1280, 'webp')).toBe(`/plates/scope/${asset.sha256}/wide-1280.webp`);
  expect(plateSrcSet('scope', asset.sha256, 'wide', [1280, 1600], 'webp', REV))
    .toBe(`${url} 1280w, ${plateUrl('scope', asset.sha256, 'wide', 1600, 'webp', REV)} 1600w`);
});

it('builds URLs from the revision each crop was stored under, not the row framing', () => {
  const hero = heroPicture(asset);
  const picture = platePicture('scope', asset, hero.main, hero.sizes, { cropKey: 'cover_phone', sizes: '100vw' })!;
  expect(picture.src).toBe(`/plates/scope/${asset.sha256}/wide-1600.webp?r=${REV}`);
  expect(picture.sources.every((source) => source.srcSet.split(', ').every((c) => c.includes(`?r=${REV} `)))).toBe(true);
  // A recrop moves the row's focal before its crops settle: the URLs stay on the stored framing.
  const moved = platePicture('scope', { ...asset, focal: [0.7, 0.5], subjectBox: [0.1, 0.1, 0.4, 0.4] }, hero.main, hero.sizes)!;
  expect(moved.src).toBe(picture.src);
  // Crops stored at the unversioned prefix name no revision.
  const unstamped = { ...asset, crops: { wide: { rect: asset.crops.wide!.rect, widths: [1280] } } };
  expect(platePicture('scope', unstamped, 'wide', hero.sizes)!.src).toBe(`/plates/scope/${asset.sha256}/wide-1280.webp`);
});

it('keeps the hero preload identical to the picture sources', () => {
  const hero = heroPicture(asset);
  const picture = platePicture('scope', asset, hero.main, hero.sizes, { cropKey: 'cover_phone', sizes: '100vw' })!;
  const preloads = heroPreloadSources('scope', asset);
  expect(preloads).toHaveLength(2);
  for (const preload of preloads) {
    const source = picture.sources.find((entry) => entry.type === 'image/avif' &&
      (preload.media ? entry.srcSet.includes(preload.media.includes('max-width') ? 'cover_phone-' : 'wide-') : true));
    expect(preload.imageSrcSet).toBe(source!.srcSet);
    expect(preload.imageSizes).toBe(source!.sizes);
    expect(preload.imageSrcSet).toContain(`?r=${REV}`);
  }
});
