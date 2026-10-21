/* Crop geometry the page needs: object-position from a crop rectangle and the
   `<picture>` sources built from an asset's stored crops. */

import { plateSrcSet, plateUrl, type PlateFormat } from '@/lib/plates';

import type { EditorialAsset, PlateCropKey, Rect } from './types';

/** AVIF first, WebP second: the browser takes the first type it decodes. */
export const PLATE_FORMATS: readonly PlateFormat[] = ['avif', 'webp'];

export const PHONE_MEDIA = '(max-width: 600px)';

/** `sizes` per the PLAN serving table. */
export const SIZES = {
  bleed: '100vw',
  measure: '(min-width: 1296px) 1248px, calc(100vw - 32px)',
  piece: '(min-width: 601px) 282px, 171px',
} as const;

export function normalised(rect: Rect, width: number, height: number): Rect {
  const unit = rect.every((v) => v >= 0 && v <= 1);
  return unit ? rect : [rect[0] / width, rect[1] / height, rect[2] / width, rect[3] / height];
}

function pct(value: number): string {
  const clamped = Math.min(100, Math.max(0, value * 100));
  return `${Math.round(clamped * 10) / 10}%`;
}

/** The rectangle's centre as a share of the source: `50% 45%`. */
export function objectPositionFromRect(rect: Rect | null | undefined, width: number, height: number): string {
  if (!rect || !(width > 0 && height > 0)) return '50% 50%';
  const [x, y, w, h] = normalised(rect, width, height);
  return `${pct(x + w / 2)} ${pct(y + h / 2)}`;
}

export interface PictureSource {
  type: `image/${PlateFormat}`;
  srcSet: string;
  sizes: string;
  media?: string;
}

export interface PlatePicture {
  sources: PictureSource[];
  /** The widest WebP, for the `<img>` itself. */
  src: string;
}

function sourcesFor(scopeId: string, asset: EditorialAsset, cropKey: PlateCropKey, sizes: string, media?: string) {
  const crop = asset.crops[cropKey];
  if (!crop || crop.widths.length === 0) return null;
  const widths = [...crop.widths].sort((a, b) => a - b);
  const sources: PictureSource[] = PLATE_FORMATS.map((format) => ({
    type: `image/${format}` as const,
    srcSet: plateSrcSet(scopeId, asset.sha256, cropKey, widths, format),
    sizes,
    ...(media ? { media } : {}),
  }));
  return { sources, src: plateUrl(scopeId, asset.sha256, cropKey, widths[widths.length - 1], 'webp') };
}

export interface PhoneCrop {
  cropKey: PlateCropKey;
  sizes: string;
}

/**
 * Sources for one crop, with an art-directed phone crop ahead of it when the
 * asset has one. Null when the asset holds no rendition of the main crop.
 */
export function platePicture(
  scopeId: string,
  asset: EditorialAsset,
  cropKey: PlateCropKey,
  sizes: string,
  phone?: PhoneCrop,
): PlatePicture | null {
  const main = sourcesFor(scopeId, asset, cropKey, sizes);
  if (!main) return null;
  const phoneSet = phone ? sourcesFor(scopeId, asset, phone.cropKey, phone.sizes, PHONE_MEDIA) : null;
  return { sources: [...(phoneSet?.sources ?? []), ...main.sources], src: main.src };
}
