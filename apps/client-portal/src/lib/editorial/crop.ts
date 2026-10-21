/* Crop geometry the page needs: object-position from a crop rectangle and the
   `<picture>` sources built from an asset's stored crops. */

import { plateSrcSet, plateUrl, type PlateFormat } from '@/lib/plates';

import { heroDesktopLayout, type HeroDesktopLayout } from './floors';
import type { EditorialAsset, PlateCropKey, Rect } from './types';

/** AVIF first, WebP second: the browser takes the first type it decodes. */
export const PLATE_FORMATS: readonly PlateFormat[] = ['avif', 'webp'];

export const PHONE_MEDIA = '(max-width: 600px)';
export const DESK_MEDIA = '(min-width: 601px)';

/** `sizes` per the PLAN serving table. */
export const SIZES = {
  bleed: '100vw',
  measure: '(min-width: 1296px) 1248px, calc(100vw - 32px)',
  /** The portrait hero's 4:5 column is never wider than 520px (editorial.css). */
  portrait: '(min-width: 601px) 520px, 100vw',
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

/*
 * The hero, per its desktop layout (floors.ts `heroDesktopLayout`). Each layout
 * asks for its own crop first, then the crop the media worker does emit for a
 * source that selects it: a measure source is under `wide`'s 1600 floor, and a
 * portrait under 1696 tall has no `tall`. The phone always draws `cover_phone`.
 */
const HERO_CROPS: Readonly<Record<HeroDesktopLayout, readonly PlateCropKey[]>> = {
  bleed: ['wide', 'cover_phone'],
  measure: ['wide', 'wide32', 'cover_phone'],
  portrait: ['tall', 'cover_phone'],
};

/** `sizes` and the intrinsic size attributes; CSS sets the laid-out box. */
const HERO_BOX: Readonly<Record<HeroDesktopLayout, { sizes: string; width: number; height: number }>> = {
  bleed: { sizes: SIZES.bleed, width: 1440, height: 648 },
  measure: { sizes: SIZES.measure, width: 1248, height: 648 },
  portrait: { sizes: SIZES.portrait, width: 520, height: 650 },
};

export interface HeroPicture {
  layout: HeroDesktopLayout;
  /** The crop at 601 and up, and at every width when there is no phone crop. */
  main: PlateCropKey;
  phone: PlateCropKey | null;
  sizes: string;
  width: number;
  height: number;
}

function holds(asset: EditorialAsset, cropKey: PlateCropKey): boolean {
  return (asset.crops[cropKey]?.widths.length ?? 0) > 0;
}

export function heroPicture(asset: EditorialAsset): HeroPicture {
  const layout = heroDesktopLayout(asset.width, asset.height, asset.subjectBox) ?? 'bleed';
  const main = HERO_CROPS[layout].find((key) => holds(asset, key)) ?? 'cover_phone';
  const phone = main !== 'cover_phone' && holds(asset, 'cover_phone') ? 'cover_phone' : null;
  return { layout, main, phone, ...HERO_BOX[layout] };
}

export interface HeroPreloadSource {
  imageSrcSet: string;
  imageSizes: string;
  media?: string;
}

/** The hero's preload, one per art-directed source: the crops and `sizes` `heroPicture` draws. */
export function heroPreloadSources(scopeId: string, asset: EditorialAsset): HeroPreloadSource[] {
  const hero = heroPicture(asset);
  const sources: Array<{ cropKey: PlateCropKey; sizes: string; media?: string }> = hero.phone
    ? [
        { cropKey: hero.phone, sizes: SIZES.bleed, media: PHONE_MEDIA },
        { cropKey: hero.main, sizes: hero.sizes, media: DESK_MEDIA },
      ]
    : [{ cropKey: hero.main, sizes: hero.sizes }];
  return sources.flatMap(({ cropKey, sizes, media }) => {
    const widths = asset.crops[cropKey]?.widths ?? [];
    if (widths.length === 0) return [];
    const imageSrcSet = plateSrcSet(scopeId, asset.sha256, cropKey, [...widths].sort((a, b) => a - b), 'avif');
    return [{ imageSrcSet, imageSizes: sizes, ...(media ? { media } : {}) }];
  });
}
