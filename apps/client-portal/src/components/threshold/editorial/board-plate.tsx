'use client';

import { SIZES } from '@/lib/editorial/crop';
import type { CaptionTriplet, EditorialAsset } from '@/lib/editorial/types';

import { Plate, type PlateFallback } from './plate';

export interface BoardPlateProps {
  scopeId: string;
  asset: EditorialAsset;
  caption?: CaptionTriplet | null;
  /** The board's name; boards never go to a model for a description. */
  alt: string;
  paletteHex?: string | null;
  fallback: PlateFallback;
}

/** The studio's board, whole on stock and never cropped. */
export function BoardPlate({ scopeId, asset, caption, alt, paletteHex, fallback }: BoardPlateProps) {
  return (
    <Plate
      role="board"
      className="ed-board"
      scopeId={scopeId}
      asset={asset}
      cropKey="none"
      sizes={SIZES.measure}
      width={832}
      height={624}
      caption={caption}
      alt={alt}
      paletteHex={paletteHex}
      stock
      fallback={fallback}
    />
  );
}
