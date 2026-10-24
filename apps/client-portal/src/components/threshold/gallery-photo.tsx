'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

import { captionText, captionTriplet, plateAlt } from '@/lib/editorial/caption';
import { GALLERY_DESKTOP_ASPECT, GALLERY_PHONE_ASPECT } from '@/lib/editorial/gallery-crop';
import { galleryRendition } from '@/lib/editorial/gallery-picture';
import type { EditorialAsset, PaletteSwatch } from '@/lib/editorial/types';

export function GalleryPaint({ palette }: { palette: readonly PaletteSwatch[] }) {
  const swatches = palette.filter((swatch) => /^#[0-9a-f]{6}$/i.test(swatch.hex));
  return <div className="gallery-paint" role="img" aria-label={swatches.length
    ? `Paint for the house: ${swatches.map((swatch) => swatch.name || swatch.hex).join(', ')}. Screen colours are approximate.`
    : 'The house is waiting for photographs.'}>
    {swatches.map((swatch, index) => <span key={index} style={{ backgroundColor: swatch.hex }} />)}
  </div>;
}

function useFrameAspect(frame: RefObject<HTMLDivElement | null>) {
  const [aspect, setAspect] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = frame.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) setAspect(entry.contentRect.width / entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [frame]);
  return aspect;
}

type Rendition = NonNullable<ReturnType<typeof galleryRendition>>;
function ResponsivePhoto({ phone, desktop, asset, arrival, onError }: {
  phone: Rendition; desktop: Rendition; asset: EditorialAsset; arrival: boolean; onError: () => void;
}) {
  return <picture>
    {phone.picture.sources.map((source) => <source key={`phone-${source.type}`} {...source} media="(max-width: 899px)" />)}
    {desktop.picture.sources.map((source) => <source key={`wide-${source.type}`} {...source} media="(min-width: 900px)" />)}
    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated plate renditions, no image optimizer */}
    <img src={desktop.picture.src} alt={plateAlt(asset)} width={asset.width} height={asset.height}
      loading={arrival ? 'eager' : 'lazy'} fetchPriority={arrival ? 'high' : undefined} onError={onError} />
  </picture>;
}

function responsiveRendition(scope: string, asset: EditorialAsset, aspect: number | null, fallback: number) { return galleryRendition(scope, asset, aspect ?? fallback); }
function picturePair(scope: string, asset: EditorialAsset | null, aspect: number | null) {
  if (!asset) return null;
  const phone = responsiveRendition(scope, asset, aspect, GALLERY_PHONE_ASPECT);
  const desktop = responsiveRendition(scope, asset, aspect, GALLERY_DESKTOP_ASPECT);
  if (!phone || !desktop) return null;
  return { phone, desktop, asset };
}

function photoCaption(asset: EditorialAsset | null, palette: readonly PaletteSwatch[]) {
  if (!asset) return palette.length
    ? 'Paint for the house · Screen colours are approximate; the paint card is the authority.' : 'Photographs to follow.';
  const caption = captionTriplet(asset.caption);
  return caption ? captionText(caption) : plateAlt(asset);
}

/** The current viewport's cover window is applied to the exact cropped file served. */
function frameStyle(pair: ReturnType<typeof picturePair>): CSSProperties {
  if (!pair) return {};
  return { '--gallery-phone-position': pair.phone.position, '--gallery-wide-position': pair.desktop.position } as CSSProperties;
}
function conceptLabel(pair: ReturnType<typeof picturePair>) { return pair?.asset.sourceKind === 'concept' ? <span className="gallery-concept-label">Concept · not installed</span> : null; }
export function GalleryPhoto({ scope, asset, palette, arrival = false }: {
  scope: string; asset: EditorialAsset | null; palette: readonly PaletteSwatch[]; arrival?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const aspect = useFrameAspect(frame);
  const [failed, setFailed] = useState(false);
  const pair = failed ? null : picturePair(scope, asset, aspect);
  return <figure className={arrival ? 'gallery-arrival-figure' : 'gallery-figure'}>
    <div ref={frame} className="gallery-photo-frame" style={frameStyle(pair)}>
      {pair ? <ResponsivePhoto {...pair} arrival={arrival} onError={() => setFailed(true)} /> : <GalleryPaint palette={palette} />}
      {conceptLabel(pair)}
    </div>
    <figcaption className="gallery-caption">{photoCaption(pair?.asset ?? null, palette)}</figcaption>
  </figure>;
}
