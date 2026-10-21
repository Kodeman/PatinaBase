'use client';

import { useRef } from 'react';

import { PHONE_MEDIA, SIZES, objectPositionFromRect } from '@/lib/editorial/crop';
import type { CaptionTriplet, EditorialAsset, PlateCropKey } from '@/lib/editorial/types';
import { plateSrcSet } from '@/lib/plates';

import { PaperTab, usePaperTabMode, type PaperTabMode } from './paper-tab';
import { Plate, type PlateFallback } from './plate';

/** 390: `cover_phone` 390 × 340. 601 and up: `wide`, 1440 × min(72svh, 648). */
function heroCrops(asset: EditorialAsset): { main: PlateCropKey; phone: PlateCropKey | null } {
  if (asset.crops.wide) return { main: 'wide', phone: asset.crops.cover_phone ? 'cover_phone' : null };
  return { main: 'cover_phone', phone: null };
}

export interface HeroPreloadLink {
  rel: 'preload';
  as: 'image';
  type: 'image/avif';
  imageSrcSet: string;
  imageSizes: string;
  fetchPriority: 'high';
  media?: string;
}

/**
 * `<link rel="preload" as="image">` attributes for the server page's head, one
 * per art-directed source, so the hero starts before the page hydrates.
 */
export function preloadLink(scopeId: string, asset: EditorialAsset): HeroPreloadLink[] {
  const { main, phone } = heroCrops(asset);
  const link = (cropKey: PlateCropKey, media?: string): HeroPreloadLink | null => {
    const crop = asset.crops[cropKey];
    if (!crop || crop.widths.length === 0) return null;
    return {
      rel: 'preload',
      as: 'image',
      type: 'image/avif',
      imageSrcSet: plateSrcSet(scopeId, asset.sha256, cropKey, [...crop.widths].sort((a, b) => a - b), 'avif'),
      imageSizes: SIZES.bleed,
      fetchPriority: 'high',
      ...(media ? { media } : {}),
    };
  };
  const links = phone ? [link(phone, PHONE_MEDIA), link(main, '(min-width: 601px)')] : [link(main)];
  return links.filter((l): l is HeroPreloadLink => l !== null);
}

export interface HeroPlateProps {
  scopeId: string;
  asset: EditorialAsset;
  eyebrow: string;
  headline: string;
  headingId?: string;
  caption?: CaptionTriplet | null;
  alt?: string;
  paletteHex?: string | null;
  fallback: PlateFallback;
  /** Forces a tab mode; otherwise computed from the plate, zoom and width. */
  tabMode?: PaperTabMode;
}

export function HeroPlate(props: HeroPlateProps) {
  const ref = useRef<HTMLDivElement>(null);
  const computed = usePaperTabMode(props.asset, ref);
  const { main, phone } = heroCrops(props.asset);
  const rect = props.asset.crops[main]?.rect;

  return (
    <div ref={ref} className="ed-hero-slot">
      <Plate
        role="hero"
        className="ed-hero"
        scopeId={props.scopeId}
        asset={props.asset}
        cropKey={main}
        sizes={SIZES.bleed}
        phoneCrop={phone ? { cropKey: phone, sizes: SIZES.bleed } : undefined}
        width={1440}
        height={648}
        caption={props.caption}
        alt={props.alt}
        paletteHex={props.paletteHex}
        priority
        objectPosition={objectPositionFromRect(rect, props.asset.width, props.asset.height)}
        fallback={props.fallback}
      >
        <PaperTab
          mode={props.tabMode ?? computed}
          eyebrow={props.eyebrow}
          headline={props.headline}
          headingId={props.headingId}
        />
      </Plate>
    </div>
  );
}
