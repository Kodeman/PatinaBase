'use client';

import { SIZES, objectPositionFromRect } from '@/lib/editorial/crop';
import type { CaptionTriplet, EditorialAsset } from '@/lib/editorial/types';

import { Plate, type PlateFallback } from './plate';

export const CONCEPT_CHIP = 'Concept · not installed';

export interface RoomPlateProps {
  scopeId: string;
  asset: EditorialAsset;
  caption?: CaptionTriplet | null;
  alt?: string;
  paletteHex?: string | null;
  fallback: PlateFallback;
}

/**
 * The chapter plate, 3:2. A concept render is a state of this plate: inset at
 * most 612 wide, held by the hairline, with the on-image chip (R142).
 */
export function RoomPlate({ scopeId, asset, caption, alt, paletteHex, fallback }: RoomPlateProps) {
  const concept = asset.sourceKind === 'concept';
  return (
    <Plate
      role="room"
      className="ed-room"
      scopeId={scopeId}
      asset={asset}
      cropKey="wide32"
      sizes={SIZES.measure}
      width={1248}
      height={832}
      caption={caption}
      alt={alt}
      paletteHex={paletteHex}
      objectPosition={objectPositionFromRect(asset.crops.wide32?.rect, asset.width, asset.height)}
      bleed={!concept}
      framed={concept}
      overlay={concept ? <span className="ed-chip">{CONCEPT_CHIP}</span> : null}
      dataAttributes={{ 'data-concept': concept ? '' : undefined }}
      fallback={fallback}
    />
  );
}
