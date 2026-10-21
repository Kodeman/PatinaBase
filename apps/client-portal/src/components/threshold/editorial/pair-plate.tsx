'use client';

import { SIZES, objectPositionFromRect } from '@/lib/editorial/crop';
import type { CaptionTriplet, EditorialAsset, PaletteSwatch } from '@/lib/editorial/types';

import { Plate, type PlateFallback } from './plate';
import { SwatchStrip } from './swatch-strip';

export interface PairPlateProps {
  scopeId: string;
  asset: EditorialAsset;
  caption?: CaptionTriplet | null;
  alt?: string;
  paletteHex?: string | null;
  swatches?: readonly PaletteSwatch[];
  fallback: PlateFallback;
}

/** The piece at 7:5 beside what changed in it: Approvals, scope-change asks, Progress. */
export function PairPlate({ scopeId, asset, caption, alt, paletteHex, swatches, fallback }: PairPlateProps) {
  return (
    <div className="ed-pair-set">
      <Plate
        role="pair"
        className="ed-pair"
        scopeId={scopeId}
        asset={asset}
        cropKey="pair"
        sizes={SIZES.measure}
        width={784}
        height={560}
        caption={caption}
        alt={alt}
        paletteHex={paletteHex}
        objectPosition={objectPositionFromRect(asset.crops.pair?.rect, asset.width, asset.height)}
        fallback={fallback}
      />
      {swatches?.length ? <SwatchStrip swatches={swatches} /> : null}
    </div>
  );
}
