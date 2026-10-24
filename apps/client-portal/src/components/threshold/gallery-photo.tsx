'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

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

/** The current viewport's cover window is applied to the exact cropped file served. */
export function GalleryPhoto({ scope, asset, palette, arrival = false }: {
  scope: string; asset: EditorialAsset | null; palette: readonly PaletteSwatch[]; arrival?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  useLayoutEffect(() => {
    const node = frame.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) setAspect(entry.contentRect.width / entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const phone = asset && galleryRendition(scope, asset, aspect ?? GALLERY_PHONE_ASPECT);
  const desktop = asset && galleryRendition(scope, asset, aspect ?? GALLERY_DESKTOP_ASPECT);
  const photo = !failed && phone && desktop;
  const caption = asset && photo ? captionTriplet(asset.caption) : null;
  return <figure className={arrival ? 'gallery-arrival-figure' : 'gallery-figure'}>
    <div ref={frame} className="gallery-photo-frame" style={{
      '--gallery-phone-position': phone?.position,
      '--gallery-wide-position': desktop?.position,
    } as CSSProperties}>
      {photo ? <picture>
        {phone.picture.sources.map((source) => <source key={`phone-${source.type}`} {...source} media="(max-width: 899px)" />)}
        {desktop.picture.sources.map((source) => <source key={`wide-${source.type}`} {...source} media="(min-width: 900px)" />)}
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated plate renditions, no image optimizer */}
        <img src={desktop.picture.src} alt={plateAlt(asset!)} width={asset!.width} height={asset!.height}
          loading={arrival ? 'eager' : 'lazy'} fetchPriority={arrival ? 'high' : undefined}
          onError={() => setFailed(true)} />
      </picture> : <GalleryPaint palette={palette} />}
    </div>
    <figcaption className="gallery-caption">
      {caption ? captionText(caption) : photo ? plateAlt(asset!) : palette.length
        ? 'Paint for the house · Screen colours are approximate; the paint card is the authority.'
        : 'Photographs to follow.'}
    </figcaption>
  </figure>;
}
