'use client';

/**
 * PhotoStrip — the quiet horizontal contact strip under the stage (Room View
 * PHOTOS program, W2). Small square thumbs on paper, a hairline frame, zero
 * shadows (D4) — structurally a product hero-gallery thumb row, treated in the
 * Room View's own hand.
 *
 * Renders ONLY when there are photos (Field scans have none — the strip is
 * absent entirely, no empty label). Its own horizontal-scroll container never
 * pushes page overflow.
 *
 * Tile source ladder (`stripSrcLadder`): 512 px thumb → 1600 px preview →
 * the original, and the original ONLY when its mime says a browser can decode
 * it. That last gate is a real saving, not bookkeeping: without it a
 * derivative-less HEIC row makes a 64×64 tile download ~237 KB of bytes no
 * browser can draw, and then fall to the placeholder anyway. A photo with no
 * usable source shows a quiet mono placeholder tile and is still counted
 * honestly. Tiles are natively lazy — production tops out at 42 distinct
 * tiles against the iOS producer's hard 60-photo cap, so `loading="lazy"`
 * buys what virtualization would, with no dependency and no scroll anchoring
 * to get wrong.
 *
 * A mono capture-time microcaption fades in on hover/focus. Click opens the
 * viewer at that photo.
 */

import { useState } from 'react';
import type { RoomScanPhoto } from '@patina/supabase';
import { isBrowserDecodableMime, type ViewerSrcPhoto } from './photo-viewer';

export interface PhotoStripProps {
  photos: RoomScanPhoto[];
  /** Opens the viewer at the given index. */
  onOpen: (index: number) => void;
}

/**
 * The ordered, distinct, non-null sources a 64×64 tile may try, cheapest
 * first: thumb → preview → original. The original is included ONLY when
 * `mime_type` doesn't positively say the browser can't decode it (an absent
 * or unknown mime counts as decodable — see `isBrowserDecodableMime`), so a
 * derivative-less HEIC row never spends ~237 KB to reach the placeholder.
 *
 * Pure. Returns `[]` when the photo has no usable source at all.
 */
export function stripSrcLadder(photo: ViewerSrcPhoto): string[] {
  const candidates = [
    photo.signedThumbUrl,
    photo.signedPreviewUrl ?? null,
    isBrowserDecodableMime(photo.mime_type) ? photo.signedImageUrl : null,
  ];
  const ladder: string[] = [];
  for (const src of candidates) {
    if (src && !ladder.includes(src)) ladder.push(src);
  }
  return ladder;
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
  const ladder = stripSrcLadder(photo);
  // Position on the ladder, advanced one rung per failed load. Tiles are keyed
  // by photo id in the parent, so a changed photo remounts and resets this.
  const [rung, setRung] = useState(0);
  const src = ladder[rung] ?? null;
  const caption = timeCaption(photo.captured_at);

  // Each failure steps down one rung; stepping past the last leaves `src`
  // null, which is the quiet placeholder tile (never a broken-image glyph).
  const onError = () => setRung((r) => r + 1);

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
          key={src}
          src={src}
          alt=""
          onError={onError}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        // Mime-agnostic on purpose: a JPEG row with no derivatives and an
        // unreachable original lands here too, so "HEIC" was a guess.
        <span className="flex h-full w-full items-center justify-center bg-[var(--color-aged-oak)]/[0.06] font-mono text-[7.5px] uppercase leading-tight tracking-[0.1em] text-[var(--color-aged-oak)]">
          no preview
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
