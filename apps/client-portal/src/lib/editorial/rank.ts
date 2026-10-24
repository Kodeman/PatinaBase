/* R142 image rank: installed > studio-made (scan, board, sheet, upload) > maker
   photograph > catalogue > silhouette. A concept render is a room-plate state
   and never the hero. */

import { galleryHeroFits, placeRole } from './floors';
export { selectArrival } from '@patina/utils';
import { compareArrivalAssets } from '@patina/utils';
import type { ClientProjectEditorial, EditorialAsset } from './types';

export const TIER = {
  installed: 0,
  studio: 1,
  maker: 2,
  catalogue: 3,
  silhouette: 4,
} as const;

export type Tier = (typeof TIER)[keyof typeof TIER];

const SOURCE_TIER: Partial<Record<EditorialAsset['sourceKind'], Tier>> = {
  installed: TIER.installed,
  scan: TIER.studio,
  board: TIER.studio,
  sheet: TIER.studio,
  upload: TIER.studio,
  maker: TIER.maker,
};

/** A maker photograph on a white ground is a catalogue clipping. Null for a concept. */
export function tierOf(asset: Pick<EditorialAsset, 'sourceKind' | 'ground'>): Tier | null {
  if (asset.sourceKind === 'maker' && asset.ground === 'white') return TIER.catalogue;
  return SOURCE_TIER[asset.sourceKind] ?? null;
}

export const compareAssets = compareArrivalAssets;

/**
 * The hero may bleed: never a concept, never a drawing sheet (a cropped
 * drawing misstates its scale), never a white-ground clipping.
 */
export function heroEligible(asset: EditorialAsset): boolean {
  if (!['installed', 'upload', 'scan', 'maker'].includes(asset.sourceKind) || asset.ground !== 'scene') return false;
  return galleryHeroFits(asset.width, asset.height, asset.subjectBox);
}

export function rankHero(editorial: Pick<ClientProjectEditorial, 'assets'>): EditorialAsset | null {
  const eligible = editorial.assets.filter(heroEligible).sort(compareAssets);
  return eligible[0] ?? null;
}

export interface PieceChoice {
  itemId: string;
  /** Null: the piece is drawn as a silhouette. */
  asset: EditorialAsset | null;
}

export interface RoomPlateChoice {
  roomId: string;
  /** The chapter plate (3:2), never the hero again, never a concept. */
  chapter: EditorialAsset | null;
  /** The room's concept render, shown as a room-plate state with its chip. */
  concept: EditorialAsset | null;
  pieces: PieceChoice[];
}

/** Each room's plates; a picture in `placed` (the hero, an edition's held plate) stands elsewhere. */
export function roomPlates(
  editorial: Pick<ClientProjectEditorial, 'assets' | 'rooms'>,
  placed: readonly string[] = [],
): RoomPlateChoice[] {
  const byId = new Map(editorial.assets.map((a) => [a.id, a]));
  const lookup = (ids: readonly string[]) =>
    ids.map((id) => byId.get(id)).filter((a): a is EditorialAsset => Boolean(a));

  return editorial.rooms.map((room) => {
    const own = lookup([...room.scanAssetIds, ...room.items.flatMap((i) => i.assetIds)]);
    const chapter =
      own
        .filter(
          (a) =>
            !placed.includes(a.id) &&
            tierOf(a) !== null &&
            a.ground !== 'white' &&
            placeRole('room', a.width, a.height, a.subjectBox) === 'room',
        )
        .sort(compareAssets)[0] ?? null;
    const conceptAsset = room.conceptAssetId ? byId.get(room.conceptAssetId) ?? null : null;
    const pieces = room.items.map((item) => ({
      itemId: item.id,
      asset:
        lookup(item.assetIds)
          .filter((a) => tierOf(a) !== null && placeRole('piece', a.width, a.height) === 'piece')
          .sort(compareAssets)[0] ?? null,
    }));
    return {
      roomId: room.id,
      chapter,
      concept: conceptAsset?.sourceKind === 'concept' ? conceptAsset : null,
      pieces,
    };
  });
}

/** Piece photographs in room/item order; the same piece choices as room chapters. */
export function arrivalPieces(editorial: Pick<ClientProjectEditorial, 'assets' | 'rooms'>) {
  const choices = new Map(roomPlates(editorial).map(room => [room.roomId, room.pieces]));
  return editorial.rooms.flatMap(room => room.items.flatMap(item => {
    const asset = choices.get(room.id)?.find(piece => piece.itemId === item.id)?.asset;
    return asset?.crops.piece?.widths.length ? [{ item, asset }] : [];
  })).slice(0, 4);
}
