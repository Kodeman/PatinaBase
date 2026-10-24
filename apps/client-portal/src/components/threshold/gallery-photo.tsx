'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

import { captionText, captionTriplet, catalogueCaption, plateAlt } from '@/lib/editorial/caption';
import { GALLERY_DESKTOP_ASPECT, GALLERY_PHONE_ASPECT } from '@patina/utils';
import { arrivalMode, containedRendition, galleryRendition } from '@/lib/editorial/gallery-picture';
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
  const image = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    if (image.current?.complete && image.current.naturalWidth === 0) onError();
  }, [onError]);
  return <picture onErrorCapture={onError}>
    {phone.picture.sources.map((source) => <source key={`phone-${source.type}`} {...source} media="(max-width: 899px)" />)}
    {desktop.picture.sources.map((source) => <source key={`wide-${source.type}`} {...source} media="(min-width: 900px)" />)}
    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated plate renditions, no image optimizer */}
    <img ref={image} src={desktop.picture.src} alt={plateAlt(asset)} width={asset.width} height={asset.height}
      loading={arrival ? 'eager' : 'lazy'} fetchPriority={arrival ? 'high' : undefined} />
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
  const caption = asset.ground === 'white' && asset.sourceKind === 'maker'
    ? catalogueCaption(asset.caption.what, null, asset.caption.when) : captionTriplet(asset.caption);
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
  const contained = !failed && arrival && asset && arrivalMode(asset) === 'contained' ? containedRendition(scope, asset) : null;
  const pair = failed || contained ? null : picturePair(scope, asset, aspect);
  const shown = contained ? asset : pair?.asset ?? null;
  const style = contained ? { '--gallery-contained-width': `${contained.width * 1.25}px` } as CSSProperties : frameStyle(pair);
  return <figure className={arrival ? 'gallery-arrival-figure' : 'gallery-figure'}>
    <div ref={frame} className="gallery-photo-frame" data-gallery-mode={contained ? 'contained' : 'cover'} data-ground={shown?.ground} style={style}>
      {contained ? <img src={contained.src} alt={plateAlt(asset!)} loading="eager" fetchPriority="high" onError={() => setFailed(true)} />
        : pair ? <ResponsivePhoto {...pair} arrival={arrival} onError={() => setFailed(true)} /> : <GalleryPaint palette={palette} />}
      {conceptLabel(pair)}
    </div>
    <figcaption className="gallery-caption">{photoCaption(shown, palette)}</figcaption>
  </figure>;
}
