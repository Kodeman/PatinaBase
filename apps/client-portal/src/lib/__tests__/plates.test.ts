import { plateRevision, plateSrcSet, plateUrl } from '../plates';
import { heroPicture, heroPreloadSources, platePicture } from '../editorial/crop';
import type { EditorialAsset } from '../editorial/types';

const asset: EditorialAsset = {
  id: 'asset', sha256: 'a'.repeat(64), sourceKind: 'upload', width: 4000, height: 3000,
  ground: 'scene', dominantHex: null, lqip: null, focal: [0.4, 0.5], subjectBox: null,
  crops: {
    wide: { rect: [0, 0, 4000, 2500], widths: [1280, 1600] },
    cover_phone: { rect: [0, 0, 2000, 2000], widths: [640, 828] },
  },
  caption: { what: null, whose: null, when: null }, alt: null,
};

it('versions plate URLs by stable geometry and preserves null/null URLs byte-for-byte', () => {
  const revision = plateRevision(asset.focal, asset.subjectBox);
  expect(revision).toMatch(/^[a-z0-9]+$/);
  expect(plateRevision([0.4, 0.5], null)).toBe(revision);
  expect(plateRevision([0.7, 0.5], null)).not.toBe(revision);
  expect(plateRevision(asset.focal, [0.1, 0.1, 0.4, 0.4])).not.toBe(revision);
  const url = plateUrl('scope', asset.sha256, 'wide', 1280, 'webp', revision);
  expect(url).toContain(`?r=${revision}`);
  expect(plateUrl('scope', asset.sha256, 'wide', 1280, 'webp', plateRevision(null, null)))
    .toBe(`/plates/scope/${asset.sha256}/wide-1280.webp`);
  expect(plateSrcSet('scope', asset.sha256, 'wide', [1280, 1600], 'webp', revision))
    .toBe(`${url} 1280w, ${plateUrl('scope', asset.sha256, 'wide', 1600, 'webp', revision)} 1600w`);
});

it('changes picture URLs on focal/box changes and keeps hero preload identical to picture sources', () => {
  const hero = heroPicture(asset);
  const picture = platePicture('scope', asset, hero.main, hero.sizes, { cropKey: 'cover_phone', sizes: '100vw' })!;
  const changed = platePicture('scope', { ...asset, focal: [0.7, 0.5] }, hero.main, hero.sizes)!;
  const boxed = platePicture('scope', { ...asset, subjectBox: [0.1, 0.1, 0.4, 0.4] }, hero.main, hero.sizes)!;
  expect(changed.src).not.toBe(picture.src);
  expect(boxed.src).not.toBe(picture.src);
  expect(picture.src).toContain('?r=');
  expect(picture.sources.every((source) => source.srcSet.includes('?r='))).toBe(true);
  const preloads = heroPreloadSources('scope', asset);
  expect(preloads).toHaveLength(2);
  for (const preload of preloads) {
    const source = picture.sources.find((entry) => entry.type === 'image/avif' &&
      (preload.media ? entry.srcSet.includes(preload.media.includes('max-width') ? 'cover_phone-' : 'wide-') : true));
    expect(preload.imageSrcSet).toBe(source!.srcSet);
    expect(preload.imageSizes).toBe(source!.sizes);
  }
});
