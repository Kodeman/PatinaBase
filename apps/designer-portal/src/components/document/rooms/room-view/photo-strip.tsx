'use client';

/**
 * PhotoStrip — the quiet horizontal contact strip under the stage (Room View
 * PHOTOS program, W2). Small square thumbs on paper, a hairline frame, zero
 * shadows (D4) — structurally a product hero-gallery thumb row, treated in the
 * Room View's own hand.
 *
 * Renders ONLY when there are photos (Field scans have none — the strip is
 * absent entirely, no empty label). Its own horizontal-scroll container never
 * pushes page overflow. Each tile prefers `signedThumbUrl`, falls back to
 * `signedImageUrl`; a photo whose only source is an undecodable HEIC (or has
 * neither) shows a quiet mono placeholder tile and is still counted honestly.
 * A mono capture-time microcaption fades in on hover/focus. Click opens the
 * viewer at that photo.
 */

import { useState } from 'react';
import type { RoomScanPhoto } from '@patina/supabase';

export interface PhotoStripProps {
  photos: RoomScanPhoto[];
  /** Opens the viewer at the given index. */
  onOpen: (index: number) => void;
}

export function PhotoStrip({ photos, onOpen }: PhotoStripProps) {
  if (photos.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--color-aged-oak)]">
          Photos
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--color-mocha)]">
          {photos.length}
        </span>
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'thin' }}
        role="list"
        aria-label="Room photos"
      >
        {photos.map((photo, i) => (
          <ThumbTile key={photo.id} photo={photo} onClick={() => onOpen(i)} />
        ))}
      </div>
    </div>
  );
}

function timeCaption(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function ThumbTile({ photo, onClick }: { photo: RoomScanPhoto; onClick: () => void }) {
  const initialSrc = photo.signedThumbUrl ?? photo.signedImageUrl;
  const [src, setSrc] = useState<string | null>(initialSrc);
  const caption = timeCaption(photo.captured_at);

  const onError = () => {
    // thumb failed → try the full image once; if that was the source too,
    // drop to the placeholder tile (never a broken-image glyph).
    if (src === photo.signedThumbUrl && photo.signedImageUrl && photo.signedImageUrl !== src) {
      setSrc(photo.signedImageUrl);
    } else {
      setSrc(null);
    }
  };

  return (
    <button
      type="button"
      role="listitem"
      onClick={onClick}
      title={caption ?? undefined}
      className="group relative h-16 w-16 flex-none overflow-hidden rounded-[2px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-front)] outline-none transition-colors focus-visible:border-[var(--color-clay)]"
      aria-label={caption ? `Photo taken ${caption}` : 'Photo'}
    >
      {src ? (

        <img
          src={src}
          alt=""
          onError={onError}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-[var(--color-aged-oak)]/[0.06] font-mono text-[7.5px] uppercase leading-tight tracking-[0.1em] text-[var(--color-aged-oak)]">
          HEIC
        </span>
      )}
      {caption && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-[var(--color-charcoal)]/85 px-1 py-0.5 text-center font-mono text-[7.5px] tracking-[0.06em] text-[var(--color-off-white)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {caption}
        </span>
      )}
    </button>
  );
}
