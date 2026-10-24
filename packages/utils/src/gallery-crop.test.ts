import { galleryCropPosition, GALLERY_DESKTOP_ASPECT, GALLERY_PHONE_ASPECT } from './gallery-crop';

describe('Gallery crop geometry', () => {
  it('positions tall and wide crops separately around the stored focal point without losing the subject', () => {
    const photo = { width: 2400, height: 1600, subjectBox: [0.6, 0.3, 0.2, 0.4] as const, focal: [0.7, 0.6] as const };
    expect(galleryCropPosition(photo.width, photo.height, GALLERY_PHONE_ASPECT, photo.subjectBox, photo.focal)).toBe('79.7% 50%');
    expect(galleryCropPosition(photo.width, photo.height, GALLERY_DESKTOP_ASPECT, photo.subjectBox, photo.focal)).toBe('50% 100%');
    expect(galleryCropPosition(2400, 1600, GALLERY_PHONE_ASPECT, [0, 0, 1, 1])).toBeNull();
    expect(galleryCropPosition(0, 1600, GALLERY_PHONE_ASPECT)).toBeNull();
  });
});


import { arrivalRendition, selectArrival, arrivalMode, compareArrivalAssets, type ArrivalAsset } from './gallery-crop';
const catalogue: ArrivalAsset = {
  id: 'bed', sha256: 'b', sourceKind: 'maker', ground: 'white', width: 1600, height: 1600,
  focal: [0.45,0.48], subjectBox: [0.12,0.27,0.7,0.4],
  crops: { pair: { rect: [0,197,1600,1143], widths: [768,1024,1600] }, piece: { rect: [0,0,1600,1600], widths: [768] } },
};
it('contains the complete catalogue subject using the largest served rendition', () => {
  expect(arrivalRendition(catalogue, null)).toMatchObject({ key: 'pair', width: 1600 });
  expect(arrivalMode(catalogue)).toBe('contained');
  expect(selectArrival({ assets: [catalogue], palette: [] }).asset).toBe(catalogue);
});
it('excludes concept and sheet arrivals and rejects crops that cut the subject', () => {
  for (const sourceKind of ['concept','sheet']) expect(arrivalMode({ ...catalogue, sourceKind })).toBeNull();
  expect(arrivalMode({ ...catalogue, crops: { piece: { rect: [0,0,0.1,0.1], widths: [256] } } })).toBeNull();
  expect(arrivalMode({ ...catalogue, crops: {} })).toBeNull();
});
it('ranks photographs before catalogue clippings and breaks ties by pixels then digest', () => {
  const scene = { ...catalogue, id: 'scene', ground: 'scene', width: 400, height: 400, subjectBox: null, crops: { piece: { rect: [0,0,400,400], widths: [256] } } };
  expect(selectArrival({ assets: [catalogue,scene], palette: ['paint'] }).asset).toBe(scene);
  expect(compareArrivalAssets(catalogue, { ...catalogue, width: 800 })).toBeLessThan(0);
  expect(compareArrivalAssets(catalogue, { ...catalogue, sha256: 'a' })).toBeGreaterThan(0);
});
