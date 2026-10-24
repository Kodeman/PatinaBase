/* Crop geometry the page needs: object-position from a crop rectangle and the
   `<picture>` sources built from an asset's stored crops. */

import { arrivalMode, arrivalRendition } from '@patina/utils';
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
    srcSet: plateSrcSet(scopeId, asset.sha256, cropKey, widths, format, crop.rev),
    sizes,
    ...(media ? { media } : {}),
  }));
  return { sources, src: plateUrl(scopeId, asset.sha256, cropKey, widths[widths.length - 1], 'webp', crop.rev) };
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
  contained: boolean;
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

const RENDITION_KEYS: readonly PlateCropKey[] = ['pair', 'piece', 'wide', 'wide32', 'tall', 'cover_phone', 'sheet', 'board'];

function bestRendition(asset: EditorialAsset): PlateCropKey | undefined {
  return RENDITION_KEYS.filter((key) => holds(asset, key))
    .sort((a, b) => Math.max(...asset.crops[b]!.widths) - Math.max(...asset.crops[a]!.widths))[0];
}

/** The contained photo's box: 10% inset + hairline, phone 39:34 cap, desktop measure. */
function containedSizes(width: number, height: number): string {
  const aspect = width / height;
  const desk = 'min(1104px, calc(100vw - 48px))';
  const photo = (frame: string, cap: string) =>
    `min(${width}px, calc(${frame} * 0.8 - 2px), calc((${cap} - ${frame} * 0.2 - 2px) * ${aspect}))`;
  const phone = photo('calc(100vw - 32px)', 'min(calc((100vw - 32px) * 34 / 39), 72svh)');
  return `(max-width: 600px) ${phone}, ${photo(desk, '72svh')}`;
}

function containedHero(asset: EditorialAsset, main: PlateCropKey): HeroPicture {
  const crop = asset.crops[main]!;
  const width = Math.max(...crop.widths);
  const [, , w, h] = normalised(crop.rect, asset.width, asset.height);
  const height = Math.round(width * (h * asset.height) / (w * asset.width));
  return {
    layout: 'measure', contained: true, main, phone: null, width, height,
    sizes: containedSizes(width, height),
  };
}

function containedCrop(asset: EditorialAsset, main: PlateCropKey | undefined): PlateCropKey | undefined {
  if (asset.ground === 'white' && asset.sourceKind !== 'concept') {
    return (['pair', 'piece'] as const).find((key) => holds(asset, key)) ?? bestRendition(asset);
  }
  return main ? undefined : bestRendition(asset);
}

function croppedHero(asset: EditorialAsset, layout: HeroDesktopLayout, main = 'cover_phone' as PlateCropKey): HeroPicture {
  const phone = main !== 'cover_phone' && holds(asset, 'cover_phone') ? 'cover_phone' : null;
  return { layout, contained: false, main, phone, ...HERO_BOX[layout] };
}

export function heroPicture(asset: EditorialAsset): HeroPicture {
  const layout = heroDesktopLayout(asset.width, asset.height, asset.subjectBox) ?? 'bleed';
  const main = HERO_CROPS[layout].find((key) => holds(asset, key));
  const contained = containedCrop(asset, main);
  return contained ? containedHero(asset, contained) : croppedHero(asset, layout, main);
}

/** The phone hero's shorter frame under a long headline (editorial.css `[data-hero-frame='short']`). */
export const SHORT_PHONE_FRAME = 39 / 30;

/**
 * One axis of an object-fit: cover window. `visible` is the share of the
 * rendition the frame shows, `subject` the protected span in rendition
 * shares, `centre` where the picture would sit. The object-position share
 * that keeps the whole subject in view nearest that centre; null when the
 * subject is longer than the window.
 */
function coverAxis(visible: number, subject: readonly [number, number], centre: number): number | null {
  const slack = 1 - visible;
  if (slack <= 1e-9) return 0.5;
  const [from, to] = [Math.max(0, subject[0]), Math.min(1, subject[1])];
  if (to - from > visible + 1e-9) return null;
  const start = Math.min(Math.max(centre - visible / 2, to - visible, 0), from, slack);
  return Math.max(0, start) / slack;
}

/**
 * The object-position for the phone hero in its shorter frame, computed on the
 * rendition the phone actually draws so the subject box stays whole. Null when
 * the subject cannot fit: use contain in a viewport-clamped short frame, or
 * keep the taller 39:34 when even the nominal short frame cannot fit it.
 * `frameAspect` is the measured image box width / height, including 72svh.
 */
export function shortFramePosition(asset: EditorialAsset, frameAspect = SHORT_PHONE_FRAME): string | null {
  const hero = heroPicture(asset);
  const rect = asset.crops[hero.phone ?? hero.main]?.rect;
  if (!rect || !(asset.width > 0 && asset.height > 0)) return null;
  const [rx, ry, rw, rh] = normalised(rect, asset.width, asset.height);
  const aspect = (rw * asset.width) / (rh * asset.height);
  const visible = aspect < frameAspect ? [1, aspect / frameAspect] : [frameAspect / aspect, 1];
  const box = asset.subjectBox ? normalised(asset.subjectBox, asset.width, asset.height) : null;
  const span = (start: number, length: number, origin: number, size: number): [number, number] =>
    [(start - origin) / size, (start + length - origin) / size];
  const subjects = box
    ? [span(box[0], box[2], rx, rw), span(box[1], box[3], ry, rh)]
    : [[0.5, 0.5] as [number, number], [0.5, 0.5] as [number, number]];
  const focal = asset.focal ?? (box ? [box[0] + box[2] / 2, box[1] + box[3] / 2] : null);
  const centres = focal ? [(focal[0] - rx) / rw, (focal[1] - ry) / rh] : [0.5, 0.5];
  const x = coverAxis(visible[0], subjects[0], centres[0]);
  const y = coverAxis(visible[1], subjects[1], centres[1]);
  return x === null || y === null ? null : `${pct(x)} ${pct(y)}`;
}

export interface HeroPreloadSource {
  imageSrcSet: string;
  imageSizes: string;
  media?: string;
}

/** The hero's preload, one per art-directed source: the crops and `sizes` `heroPicture` draws. */
export function heroPreloadSources(scopeId: string, asset: EditorialAsset): HeroPreloadSource[] {
  if (arrivalMode(asset) === 'contained') {
    const crop = arrivalRendition(asset, null);
    return crop ? [{ imageSrcSet: plateUrl(scopeId, asset.sha256, crop.key as PlateCropKey, crop.width, 'webp', asset.crops[crop.key as PlateCropKey]?.rev), imageSizes: '100vw' }] : [];
  }
  const hero = heroPicture(asset);
  const sources: Array<{ cropKey: PlateCropKey; sizes: string; media?: string }> = hero.phone
    ? [
        { cropKey: hero.phone, sizes: SIZES.bleed, media: PHONE_MEDIA },
        { cropKey: hero.main, sizes: hero.sizes, media: DESK_MEDIA },
      ]
    : [{ cropKey: hero.main, sizes: hero.sizes }];
  return sources.flatMap(({ cropKey, sizes, media }) => {
    const crop = asset.crops[cropKey];
    const widths = crop?.widths ?? [];
    if (widths.length === 0) return [];
    const imageSrcSet = plateSrcSet(scopeId, asset.sha256, cropKey, [...widths].sort((a, b) => a - b), 'avif', crop?.rev);
    return [{ imageSrcSet, imageSizes: sizes, ...(media ? { media } : {}) }];
  });
}
