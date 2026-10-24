import type { ClientProjectEditorial, EditorialAsset } from '../types';

export const bed: EditorialAsset = {
  id: 'bed', sha256: 'b'.repeat(64), sourceKind: 'maker', ground: 'white', width: 1600, height: 1600,
  focal: [0.45, 0.48], subjectBox: [0.12, 0.27, 0.7, 0.4], dominantHex: null, lqip: null, alt: 'Sierra Queen Bed',
  caption: { what: 'Sierra Queen Bed', whose: "from the maker's catalogue", when: null },
  crops: { pair: { rect: [0, 197, 1600, 1143], widths: [768, 1024, 1600] }, piece: { rect: [0, 0, 1600, 1600], widths: [256, 512, 768] } },
};
export const smallScene: EditorialAsset = { ...bed, id: 'scene', sha256: 'a'.repeat(64), ground: 'scene', width: 400, height: 400,
  subjectBox: null, crops: { piece: { rect: [0, 0, 400, 400], widths: [256] } } };
export const eligibleScene: EditorialAsset = { ...bed, id: 'hero', sourceKind: 'installed', ground: 'scene', width: 2400, height: 1600,
  subjectBox: null, crops: { cover_phone: { rect: [0, 0, 2400, 1600], widths: [1600] }, wide: { rect: [0, 0, 2400, 1600], widths: [2400] } } };
export function arrivalFixture(assets: EditorialAsset[] = [smallScene, bed], heroId: string | null = 'bed'): ClientProjectEditorial {
  return {
    project: { id: 'job', name: 'Elm House', phase: null, targetDate: null, showMakers: true, studio: { name: 'Studio', town: null } },
    assets, palette: [], rooms: [], boards: [], sheets: [],
    edition: { id: 'edition', seq: 1, approvedAt: '2026-10-24', approvedBy: 'studio', notice: null },
    composition: { hero: heroId ? { assetId: heroId } : null, held: [], chapters: [] }, images: [],
  };
}
export const arrivalCases = [
  { name: 'chosen catalogue bed', editorial: arrivalFixture(), kind: 'photo', id: 'bed', mode: 'contained' },
  { name: 'empty job', editorial: arrivalFixture([], null), kind: 'empty', id: null, mode: null },
  { name: 'paint only', editorial: { ...arrivalFixture([], null), palette: [{ hex: '#aabbcc', name: 'Oat', brand: null }] }, kind: 'paint', id: null, mode: null },
  { name: 'eligible hero', editorial: arrivalFixture([eligibleScene, bed], 'hero'), kind: 'photo', id: 'hero', mode: 'cover' },
  { name: 'no approved edition', editorial: { ...arrivalFixture(), edition: undefined }, kind: 'empty', id: null, mode: null },
] as const;
