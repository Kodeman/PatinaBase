import { TIER, compareAssets, heroEligible, rankHero, roomPlates, tierOf } from '../rank';
import type { ClientProjectEditorial, EditorialAsset, EditorialItem, EditorialRoom } from '../types';

let n = 0;
function asset(over: Partial<EditorialAsset>): EditorialAsset {
  n += 1;
  return {
    id: `asset-${n}`,
    sha256: n.toString(16).padStart(64, '0'),
    sourceKind: 'upload',
    width: 2400,
    height: 1600,
    ground: 'scene',
    dominantHex: '#8C7356',
    lqip: null,
    focal: null,
    subjectBox: null,
    crops: {},
    caption: { what: 'Walnut top', whose: 'Birchwood Studio', when: '2 June 2026' },
    alt: null,
    ...over,
  };
}

function item(over: Partial<EditorialItem>): EditorialItem {
  return {
    id: 'item-1',
    nameAsSigned: 'Walnut sideboard',
    category: 'furniture',
    status: 'in_production',
    material: null,
    finish: null,
    dimensions: null,
    descriptionAsSigned: null,
    assetIds: [],
    silhouetteKind: null,
    ...over,
  };
}

function room(over: Partial<EditorialRoom>): EditorialRoom {
  return { id: 'room-1', name: 'Living room', anchor: 'room-room-1', conceptAssetId: null, scanAssetIds: [], items: [], ...over };
}

describe('rank', () => {
  it('orders the R142 tiers: installed, studio-made, maker, catalogue', () => {
    expect(tierOf({ sourceKind: 'installed', ground: 'scene' })).toBe(TIER.installed);
    for (const kind of ['scan', 'board', 'sheet', 'upload'] as const) {
      expect(tierOf({ sourceKind: kind, ground: 'scene' })).toBe(TIER.studio);
    }
    expect(tierOf({ sourceKind: 'maker', ground: 'scene' })).toBe(TIER.maker);
    expect(tierOf({ sourceKind: 'maker', ground: 'white' })).toBe(TIER.catalogue);
    expect(TIER.catalogue).toBeLessThan(TIER.silhouette);
  });

  it('gives a concept render no tier', () => {
    expect(tierOf({ sourceKind: 'concept', ground: 'scene' })).toBeNull();
  });

  it('sorts by tier, then pixels, then sha256', () => {
    const maker = asset({ sourceKind: 'maker', width: 6000, height: 4000 });
    const installed = asset({ sourceKind: 'installed' });
    const bigUpload = asset({ sourceKind: 'upload', width: 3000, height: 2000 });
    const smallUpload = asset({ sourceKind: 'upload' });
    expect([maker, smallUpload, bigUpload, installed].sort(compareAssets)).toEqual([installed, bigUpload, smallUpload, maker]);
  });

  it('never picks a concept render as the hero, however large', () => {
    const concept = asset({ sourceKind: 'concept', width: 6000, height: 4000 });
    expect(heroEligible(concept)).toBe(false);
    expect(rankHero({ assets: [concept] })).toBeNull();
  });

  it('never bleeds a drawing sheet or a white-ground clipping', () => {
    expect(heroEligible(asset({ sourceKind: 'sheet' }))).toBe(false);
    expect(heroEligible(asset({ sourceKind: 'maker', ground: 'white' }))).toBe(false);
  });

  it('lets a strong maker photograph lead when nothing higher passes the floors (V2-1 amended)', () => {
    const maker = asset({ sourceKind: 'maker' });
    const smallUpload = asset({ sourceKind: 'upload', width: 600, height: 400 });
    expect(rankHero({ assets: [smallUpload, maker] })).toBe(maker);
  });

  it('takes the highest tier that has an eligible plate', () => {
    const maker = asset({ sourceKind: 'maker', width: 6000, height: 4000 });
    const installed = asset({ sourceKind: 'installed' });
    expect(rankHero({ assets: [maker, installed] })).toBe(installed);
  });

  it('chooses each room its chapter plate, concept state and pieces', () => {
    const hero = asset({ sourceKind: 'installed' });
    const scan = asset({ sourceKind: 'scan', width: 2048, height: 1365 });
    const concept = asset({ sourceKind: 'concept' });
    const catalogue = asset({ sourceKind: 'maker', ground: 'white', width: 800, height: 800 });
    const tiny = asset({ sourceKind: 'upload', width: 200, height: 200 });
    const editorial: Pick<ClientProjectEditorial, 'assets' | 'rooms'> = {
      assets: [hero, scan, concept, catalogue, tiny],
      rooms: [
        room({
          conceptAssetId: concept.id,
          scanAssetIds: [scan.id, hero.id],
          items: [item({ id: 'sideboard', assetIds: [catalogue.id] }), item({ id: 'lamp', assetIds: [tiny.id] })],
        }),
      ],
    };
    const [choice] = roomPlates(editorial, hero.id);
    expect(choice.chapter).toBe(scan);
    expect(choice.concept).toBe(concept);
    expect(choice.pieces).toEqual([
      { itemId: 'sideboard', asset: catalogue },
      { itemId: 'lamp', asset: null },
    ]);
  });

  it('never uses a concept or white-ground photograph as a chapter plate', () => {
    const concept = asset({ sourceKind: 'concept' });
    const white = asset({ sourceKind: 'maker', ground: 'white' });
    const [choice] = roomPlates({
      assets: [concept, white],
      rooms: [room({ scanAssetIds: [concept.id], items: [item({ assetIds: [white.id] })] })],
    });
    expect(choice.chapter).toBeNull();
  });
});
