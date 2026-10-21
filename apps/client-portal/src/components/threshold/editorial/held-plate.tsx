'use client';

import { SIZES, objectPositionFromRect } from '@/lib/editorial/crop';
import type { CaptionTriplet, EditorialAsset } from '@/lib/editorial/types';

import { Plate, type PlateFallback } from './plate';

export interface HeldPlateProps {
  scopeId: string;
  asset: EditorialAsset;
  caption?: CaptionTriplet | null;
  alt?: string;
  paletteHex?: string | null;
  fallback: PlateFallback;
}

/**
 * The held plate: 390 × min(780, 100svh − 72) from the `tall` crop on a phone,
 * a 3:2 chapter plate above 600. One per page; the caller keeps it to one.
 */
export function HeldPlate({ scopeId, asset, caption, alt, paletteHex, fallback }: HeldPlateProps) {
  return (
    <Plate
      role="held"
      className="ed-held"
      scopeId={scopeId}
      asset={asset}
      cropKey={asset.crops.wide32 ? 'wide32' : 'tall'}
      sizes={SIZES.measure}
      phoneCrop={asset.crops.wide32 ? { cropKey: 'tall', sizes: SIZES.bleed } : undefined}
      width={390}
      height={780}
      caption={caption}
      alt={alt}
      paletteHex={paletteHex}
      objectPosition={objectPositionFromRect(asset.crops.tall?.rect, asset.width, asset.height)}
      bleed
      fallback={fallback}
    />
  );
}
