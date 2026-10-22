'use client';

import { NOTE_NOT_YOUR_PIECE, captionTriplet, catalogueCaption } from '@/lib/editorial/caption';
import { SIZES } from '@/lib/editorial/crop';
import { TIER, tierOf } from '@/lib/editorial/rank';
import type { EditorialAsset, EditorialItem } from '@/lib/editorial/types';

import { Plate } from './plate';
import { SilhouettePlate } from './silhouette-plate';

const INSTALLED = /install/i;

export interface PiecePlateProps {
  scopeId: string;
  showMakers: boolean;
  item: Pick<EditorialItem, 'nameAsSigned' | 'status' | 'makerName' | 'category' | 'silhouetteKind'>;
  /** Null: no photograph yet, so the piece is drawn. */
  asset: EditorialAsset | null;
  /** Where the piece stands, in words: "In production". */
  statusWords: string;
  paletteHex?: string | null;
}

type PieceItem = PiecePlateProps['item'];

/** A catalogue photograph says it shows the same model; an installed piece needs no note. */
function pieceCaption(item: PieceItem, asset: EditorialAsset, showMakers: boolean) {
  if (tierOf(asset) !== TIER.catalogue) return { caption: captionTriplet(asset.caption), note: null };
  const caption = catalogueCaption(
    showMakers ? item.nameAsSigned : asset.caption.what,
    item.makerName, asset.caption.when, item.category, showMakers,
  );
  return { caption, note: INSTALLED.test(item.status ?? '') ? null : NOTE_NOT_YOUR_PIECE };
}

/**
 * 1:1, 171 at the phone and 282 above 600. A white-ground photograph is
 * contained with a tenth inset on stock; a catalogue photograph says it shows
 * the same model, not your piece.
 */
export function PiecePlate({ scopeId, showMakers, item, asset, statusWords, paletteHex }: PiecePlateProps) {
  const fallback = { name: item.nameAsSigned, silhouetteKind: item.silhouetteKind, category: item.category };
  const lines = (
    <>
      <p className="ed-piece__name">{item.nameAsSigned}</p>
      <p className="ed-piece__status">{statusWords}</p>
    </>
  );

  if (!asset) {
    return (
      <SilhouettePlate {...fallback} className="ed-piece">
        {lines}
      </SilhouettePlate>
    );
  }

  const { caption, note } = pieceCaption(item, asset, showMakers);
  const white = asset.ground === 'white';

  return (
    <Plate
      role="piece"
      className="ed-piece"
      scopeId={scopeId}
      asset={asset}
      cropKey="piece"
      sizes={SIZES.piece}
      width={282}
      height={282}
      caption={caption}
      note={note}
      paletteHex={paletteHex}
      stock={white}
      framed={!white}
      dataAttributes={{ 'data-ground': asset.ground ?? undefined }}
      fallback={fallback}
    >
      {lines}
    </Plate>
  );
}
