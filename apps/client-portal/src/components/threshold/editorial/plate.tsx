'use client';

import { useState, type ReactNode } from 'react';

import { CAPTION_SEPARATOR, NOTE_LOAD_FAILED, captionTriplet, plateAlt } from '@/lib/editorial/caption';
import { platePicture, type PhoneCrop } from '@/lib/editorial/crop';
import type { CaptionTriplet, EditorialAsset, PlateCropKey } from '@/lib/editorial/types';
import type { PlateRole } from '@/lib/editorial/floors';

import { SilhouettePlate } from './silhouette-plate';

/* Every plate: figure + picture + figcaption. Plates never carry `data-dimmable`
   (since-yesterday.tsx): `data-never-dim` keeps a plate inked inside any unit. */

export interface PlateCaptionProps {
  caption: CaptionTriplet;
  note?: string | null;
}

/** Exactly three segments; a qualifier is its own `plate-note` line, never a fourth. */
export function PlateCaption({ caption, note }: PlateCaptionProps) {
  return (
    <figcaption className="ed-caption">
      <span data-caption-field="what">{caption.what}</span>
      {CAPTION_SEPARATOR}
      <span data-caption-field="whose">{caption.whose}</span>
      {CAPTION_SEPARATOR}
      <span data-caption-field="when">{caption.when}</span>
      {note ? <span className="plate-note">{note}</span> : null}
    </figcaption>
  );
}

/** What the silhouette draws when the picture cannot stand. */
export interface PlateFallback {
  name: string;
  silhouetteKind?: string | null;
  category?: string | null;
}

export interface PlateProps {
  role: PlateRole;
  /** Phase 1: the project id. Phase 2: the approved edition id. */
  scopeId: string;
  asset: EditorialAsset;
  cropKey: PlateCropKey;
  sizes: string;
  phoneCrop?: PhoneCrop;
  /** Intrinsic size attributes; CSS sets the laid-out box. */
  width: number;
  height: number;
  /** Defaults to the asset's stored caption; null means the plate cannot be captioned. */
  caption?: CaptionTriplet | null;
  alt?: string;
  note?: string | null;
  paletteHex?: string | null;
  /** The hero: eager, high fetch priority. Every other plate is lazy. */
  priority?: boolean;
  objectPosition?: string;
  bleed?: boolean;
  framed?: boolean;
  stock?: boolean;
  className?: string;
  /** Drawn over the picture inside the frame (the concept chip). */
  overlay?: ReactNode;
  /** Between the rule and the caption (the hero's paper tab, a piece's name). */
  children?: ReactNode;
  /** The whole frame links here (a sheet opens its PDF). */
  href?: string;
  hrefLabel?: string;
  fallback: PlateFallback;
  dataAttributes?: Record<`data-${string}`, string | undefined>;
}

type PlatePictureModel = NonNullable<ReturnType<typeof platePicture>>;

function plateClasses(props: PlateProps): string {
  return ['ed-plate', props.bleed && 'ed-plate--bleed', props.framed && 'ed-plate--framed', props.className]
    .filter(Boolean)
    .join(' ');
}

function imageStyle(asset: EditorialAsset, objectPosition: string | undefined) {
  return {
    objectPosition,
    backgroundColor: asset.dominantHex ?? undefined,
    backgroundImage: asset.lqip ? `url("${asset.lqip}")` : undefined,
  };
}

function PlatePictureEl({
  props,
  picture,
  onError,
}: {
  props: PlateProps;
  picture: PlatePictureModel;
  onError: () => void;
}) {
  const priority = Boolean(props.priority);
  return (
    <picture>
      {picture.sources.map((s) => (
        <source key={`${s.media ?? 'all'}-${s.type}`} type={s.type} srcSet={s.srcSet} sizes={s.sizes} media={s.media} />
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element -- sized at source; no optimizer on Workers */}
      <img
        className="ed-plate__img"
        src={picture.src}
        alt={props.alt ?? plateAlt(props.asset)}
        width={props.width}
        height={props.height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        onError={onError}
        style={imageStyle(props.asset, props.objectPosition)}
      />
    </picture>
  );
}

function PlateFrame({ props, children }: { props: PlateProps; children: ReactNode }) {
  const stock = Boolean(props.stock);
  return (
    <div
      className={stock ? 'ed-plate__frame ed-stock' : 'ed-plate__frame'}
      style={{ backgroundColor: stock ? undefined : props.asset.dominantHex ?? undefined }}
    >
      {props.href ? (
        <a href={props.href} aria-label={props.hrefLabel}>
          {children}
        </a>
      ) : (
        children
      )}
      {props.overlay}
    </div>
  );
}

function PaletteRule({ hex }: { hex?: string | null }) {
  if (!hex) return null;
  return <div aria-hidden="true" className="ed-plate__rule" style={{ backgroundColor: hex }} />;
}

function PlateFailed({ props, failed }: { props: PlateProps; failed: boolean }) {
  const { fallback } = props;
  return (
    <SilhouettePlate
      name={fallback.name}
      silhouetteKind={fallback.silhouetteKind}
      category={fallback.category}
      note={failed ? NOTE_LOAD_FAILED : null}
      className={props.className}
    >
      {props.children}
    </SilhouettePlate>
  );
}

function plateCaptionFor(props: PlateProps): CaptionTriplet | null {
  return props.caption === undefined ? captionTriplet(props.asset.caption) : props.caption;
}

export function Plate(props: PlateProps) {
  const [failed, setFailed] = useState(false);
  const caption = plateCaptionFor(props);
  const picture = platePicture(props.scopeId, props.asset, props.cropKey, props.sizes, props.phoneCrop);

  if (failed || !picture || !caption) return <PlateFailed props={props} failed={failed} />;

  return (
    <figure className={plateClasses(props)} data-plate={props.role} data-never-dim="" {...props.dataAttributes}>
      <PlateFrame props={props}>
        <PlatePictureEl props={props} picture={picture} onError={() => setFailed(true)} />
      </PlateFrame>
      <PaletteRule hex={props.paletteHex} />
      {props.children}
      <PlateCaption caption={caption} note={props.note} />
    </figure>
  );
}
