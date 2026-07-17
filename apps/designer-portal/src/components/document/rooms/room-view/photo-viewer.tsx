'use client';

/**
 * PhotoViewer — the Room View's full-bleed photo viewer (Room View PHOTOS
 * program, W2). Built on DocFileViewer's overlay grammar (R24/R27): full-bleed
 * `--doc-paper` at z-[60], a quiet mono header, Esc + backdrop + focus-restore,
 * zero shadows (D4). One photo at a time; prev/next by button or arrow key.
 *
 * D1 — the surface beneath is never unmounted: room-view.tsx conditionally
 * renders this ON TOP of the still-mounted Plan/facts rail, so closing puts
 * the room back exactly as it was.
 *
 * HEIC fallback (flagged for review — see task report): originals are often
 * HEIC, which Chrome cannot decode. The viewer shows `signedImageUrl` first;
 * if the <img> errors AND a distinct `signedThumbUrl` exists, it falls back to
 * the (JPEG-derivative) thumb with a quiet "preview quality — full image is
 * HEIC" mono note — never a broken-image glyph. If neither resolves, a quiet
 * mono "preview unavailable" tile stands in. No zoom in v1 (logged as a
 * code-only call — prev/next + full-bleed is the whole interaction).
 */

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { RoomScanPhoto } from '@patina/supabase';

// ═══════════════════════════════════════════════════════════════════════════
// Pure helpers (no React — unit-tested directly)
// ═══════════════════════════════════════════════════════════════════════════

export type ViewerSrcPhoto = Pick<RoomScanPhoto, 'signedImageUrl' | 'signedThumbUrl'>;

/** Which source the viewer is currently trying to render.
 *  - 'full'  → the signed original (may be an undecodable HEIC in Chrome)
 *  - 'thumb' → the JPEG-derivative preview (fallback after a full-image error,
 *              or when no full URL exists at all)
 *  - 'failed' → nothing renderable; the viewer shows a quiet mono tile */
export type ViewerStage = 'full' | 'thumb' | 'failed';

/** The stage the viewer opens a photo at: full when a full URL exists, else a
 *  thumb, else failed. Pure — reset per photo on index change. */
export function initialViewerStage(photo: ViewerSrcPhoto): ViewerStage {
  if (photo.signedImageUrl) return 'full';
  if (photo.signedThumbUrl) return 'thumb';
  return 'failed';
}

/** The next stage after the current source errors. full → thumb (only when a
 *  DISTINCT thumb exists), everything else → failed. Pure. */
export function nextViewerStageOnError(stage: ViewerStage, photo: ViewerSrcPhoto): ViewerStage {
  if (
    stage === 'full' &&
    photo.signedThumbUrl &&
    photo.signedThumbUrl !== photo.signedImageUrl
  ) {
    return 'thumb';
  }
  return 'failed';
}

/** The URL for a stage, or null when there is nothing to render. Pure. */
export function stageSrc(stage: ViewerStage, photo: ViewerSrcPhoto): string | null {
  if (stage === 'full') return photo.signedImageUrl;
  if (stage === 'thumb') return photo.signedThumbUrl;
  return null;
}

/** Clamp an index into `[0, len)`; returns 0 for an empty set. Pure. */
export function clampIndex(index: number, len: number): number {
  if (len <= 0) return 0;
  return Math.min(Math.max(0, Math.floor(index)), len - 1);
}

/** Date + time footer stamp, e.g. "Jul 15, 3:24 PM" — feet-free per the
 *  footer contract. Falls back to '—' on a bad/absent timestamp. Pure. */
export function fmtStamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
}

/** The footer line: `photo N of M · <kind> · <stamp> · <caption?>`. Pure. */
export function viewerFooterLine(
  photo: Pick<RoomScanPhoto, 'photo_kind' | 'caption' | 'captured_at'>,
  index: number,
  total: number,
): string {
  return [
    `photo ${index + 1} of ${total}`,
    photo.photo_kind ?? 'photo',
    fmtStamp(photo.captured_at),
    photo.caption ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export interface PhotoViewerProps {
  photos: RoomScanPhoto[];
  /** Current photo index (owned by room-view's usePhotoViewer). */
  index: number;
  /** Clamped setter — prev/next and arrow keys route through it so the shared
   *  selection stays in range. */
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

export function PhotoViewer({ photos, index, onIndexChange, onClose }: PhotoViewerProps) {
  const total = photos.length;
  const safeIndex = clampIndex(index, total);
  const photo = photos[safeIndex];

  const [stage, setStage] = useState<ViewerStage>(() =>
    photo ? initialViewerStage(photo) : 'failed',
  );
  const restoreRef = useRef<HTMLElement | null>(null);

  // Reset the HEIC-fallback stage whenever the photo changes.
  useEffect(() => {
    setStage(photo ? initialViewerStage(photo) : 'failed');
  }, [photo]);

  // Esc closes, arrows navigate. Capture phase + stopPropagation so Esc lands
  // here and not on RoomShell's window Escape (which would leave the room) —
  // same discipline as DocFileViewer / use-measure.
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.stopPropagation();
        onIndexChange(safeIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.stopPropagation();
        onIndexChange(safeIndex + 1);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      restoreRef.current?.focus?.();
    };
  }, [onClose, onIndexChange, safeIndex]);

  if (!photo) return null;

  const src = stageSrc(stage, photo);
  const previewFallback = stage === 'thumb' && Boolean(photo.signedImageUrl);
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < total - 1;
  const title = photo.caption ?? `Photo ${safeIndex + 1}`;

  const onBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--doc-paper)] motion-safe:animate-[doc-fade_200ms_ease-out]"
    >
      {/* header */}
      <div className="flex items-baseline justify-between border-b border-[var(--color-pearl)] px-7 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
          {title}
          <span className="ml-3 text-[var(--text-muted)]">
            {safeIndex + 1} / {total}
          </span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay)] hover:opacity-80"
        >
          ← Back to the room
        </button>
      </div>

      {/* body */}
      <div
        onClick={onBackdrop}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6"
      >
        {hasPrev && (
          <NavButton side="left" label="Previous photo" onClick={() => onIndexChange(safeIndex - 1)} />
        )}

        {src ? (

          <img
            key={`${safeIndex}:${stage}`}
            src={src}
            alt={photo.caption ?? `Photo ${safeIndex + 1}`}
            onError={() => setStage((s) => nextViewerStageOnError(s, photo))}
            className="max-h-full max-w-full border border-[var(--doc-ink-border)] object-contain"
          />
        ) : (
          <div className="flex h-40 w-64 items-center justify-center border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-front)] text-center font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            preview unavailable
          </div>
        )}

        {hasNext && (
          <NavButton side="right" label="Next photo" onClick={() => onIndexChange(safeIndex + 1)} />
        )}
      </div>

      {/* footer */}
      <div className="border-t border-[var(--color-pearl)] px-7 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {viewerFooterLine(photo, safeIndex, total)}
        </p>
        {previewFallback && (
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            preview quality — full image is HEIC
          </p>
        )}
      </div>
    </div>
  );

  // Portal to <body> so the overlay's z-[60] escapes RoomShell's `relative
  // z-10` paper stacking context — otherwise its z-20 header and the fixed
  // z-40 studio drawer paint OVER the viewer. Same overlay grammar as
  // paper-folio-sheet.tsx. The room beneath stays mounted (D1); this is a
  // portal sibling, not a remount.
  return typeof document === 'undefined' ? overlay : createPortal(overlay, document.body);
}

function NavButton({
  side,
  label,
  onClick,
}: {
  side: 'left' | 'right';
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        'absolute top-1/2 -translate-y-1/2 rounded-full border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-front)] px-3 py-2',
        'font-mono text-[13px] text-[var(--color-mocha)] transition-colors hover:text-[var(--color-charcoal)]',
        side === 'left' ? 'left-4' : 'right-4',
      ].join(' ')}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}
