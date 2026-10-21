'use client';

import { useRef } from 'react';

import { SIZES, heroPicture, heroPreloadSources, objectPositionFromRect } from '@/lib/editorial/crop';
import type { CaptionTriplet, EditorialAsset } from '@/lib/editorial/types';

import { PaperTab, usePaperTabMode, type PaperTabMode } from './paper-tab';
import { Plate, type PlateFallback } from './plate';

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
  return heroPreloadSources(scopeId, asset).map((source) => ({
    rel: 'preload',
    as: 'image',
    type: 'image/avif',
    fetchPriority: 'high',
    ...source,
  }));
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
  const { layout, main, phone, sizes, width, height } = heroPicture(props.asset);
  const rect = props.asset.crops[main]?.rect;

  return (
    <div ref={ref} className="ed-hero-slot">
      <Plate
        role="hero"
        className={`ed-hero ed-hero--${layout}`}
        scopeId={props.scopeId}
        asset={props.asset}
        cropKey={main}
        sizes={sizes}
        phoneCrop={phone ? { cropKey: phone, sizes: SIZES.bleed } : undefined}
        width={width}
        height={height}
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
