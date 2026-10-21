'use client';

import { SIZES } from '@/lib/editorial/crop';
import type { CaptionTriplet, EditorialAsset } from '@/lib/editorial/types';

import { Plate, type PlateFallback } from './plate';

export interface SheetPlateProps {
  scopeId: string;
  asset: EditorialAsset;
  caption?: CaptionTriplet | null;
  /** Built in code from the sheet number and title, never sent anywhere. */
  alt: string;
  /** The whole drawing opens its PDF in Documents. */
  href?: string;
  hrefLabel?: string;
  paletteHex?: string | null;
  fallback: PlateFallback;
}

/** A drawing sheet, whole on stock: never cropped, since a crop misstates its scale. */
export function SheetPlate({ scopeId, asset, caption, alt, href, hrefLabel, paletteHex, fallback }: SheetPlateProps) {
  return (
    <Plate
      role="sheet"
      className="ed-sheet"
      scopeId={scopeId}
      asset={asset}
      cropKey="sheet"
      sizes={SIZES.measure}
      width={772}
      height={648}
      caption={caption}
      alt={alt}
      href={href}
      hrefLabel={hrefLabel}
      paletteHex={paletteHex}
      stock
      fallback={fallback}
    />
  );
}
