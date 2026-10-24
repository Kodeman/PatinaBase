import { editionHero } from '../use-client-editorial';
import { galleryHeroFits } from '@/lib/editorial/floors';
import { heroEligible } from '@/lib/editorial/rank';
import type { ClientProjectEditorial, EditorialAsset } from '@/lib/editorial/types';

jest.mock('@patina/supabase/client', () => ({ createBrowserClient: jest.fn() }));

const asset = (over: Partial<EditorialAsset> = {}): EditorialAsset => ({
  id: 'photo', sha256: 'a'.repeat(64), sourceKind: 'installed', width: 2400, height: 1600,
  ground: 'scene', dominantHex: null, lqip: null, focal: [0.7, 0.6], subjectBox: [0.6, 0.3, 0.2, 0.4],
  crops: { piece: { rect: [0,0,2400,1600], widths: [1600] } }, caption: { what: 'The living room', whose: 'Maren Holt', when: '24 October' }, alt: null,
  ...over,
});
const editorial = (photo: EditorialAsset, approved = true): ClientProjectEditorial => ({
  project: { id: 'house', name: 'Elm Street', phase: null, targetDate: null, studio: { name: 'Birchwood', town: null }, showMakers: true },
  rooms: [], assets: [photo], palette: [], boards: [], sheets: [],
  ...(approved ? { edition: { id: 'edition', seq: 1, approvedAt: '2026-10-24', approvedBy: 'studio' as const, notice: null } } : {}),
  composition: { hero: { assetId: photo.id }, held: [], chapters: [] },
});

describe('Gallery hero rule', () => {
  it('requires at least 2000 long-side and 1200 short-side pixels', () => {
    expect(heroEligible(asset({ width: 2000, height: 1200, subjectBox: null }))).toBe(true);
    expect(heroEligible(asset({ width: 1999, height: 1200, subjectBox: null }))).toBe(false);
    expect(heroEligible(asset({ width: 2000, height: 1199, subjectBox: null }))).toBe(false);
    expect(galleryHeroFits(1200, 2000)).toBe(true);
    expect(galleryHeroFits(Infinity, 2000)).toBe(false);
  });
  it('accepts only real scene photographs and scans, never unknown, drawing, concept or catalogue grounds', () => {
    for (const sourceKind of ['installed', 'upload', 'scan', 'maker'] as const) {
      expect(heroEligible(asset({ sourceKind }))).toBe(true);
    }
    for (const sourceKind of ['concept', 'board', 'sheet'] as const) {
      expect(heroEligible(asset({ sourceKind }))).toBe(false);
    }
    for (const ground of ['white', 'drawing', null] as const) expect(heroEligible(asset({ ground }))).toBe(false);
  });
  it('protects the whole subject in both tall and wide crops, in normalized or pixel coordinates', () => {
    expect(heroEligible(asset({ subjectBox: [0.2, 0.2, 0.6, 0.6] }))).toBe(false);
    expect(heroEligible(asset({ width: 1200, height: 2000, subjectBox: [0.2, 0.1, 0.2, 0.8] }))).toBe(false);
    expect(heroEligible(asset({ subjectBox: [1440, 480, 480, 640] }))).toBe(true);
    expect(galleryHeroFits(2400, 1600, [0.95, 0, 0.2, 0.2])).toBe(false);
  });
  it('uses only a servable reader-vetted hero from an approved edition', () => {
    const photo = asset();
    expect(editionHero(editorial(photo))).toBe(photo);
    expect(editionHero(editorial(photo, false))).toBeNull();
    expect(editionHero(editorial(asset({ ground: 'white' })))?.ground).toBe('white');
    expect(editionHero({ ...editorial(photo), composition: { hero: null, held: [], chapters: [] } })).toBeNull();
    expect(editionHero(editorial(asset({ width: 1000, height: 800 })))?.id).toBe('photo');
    expect(editionHero(editorial(asset({ crops: {} })))).toBeNull();
  });
});
