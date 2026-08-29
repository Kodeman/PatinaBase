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
 * SOURCE LADDER — `full → preview → thumb`, opened at the right rung rather
 * than discovered by failure. Originals are often HEIC, which Chrome cannot
 * decode; the 00340 derivative lane already produces a 1600 px JPEG preview
 * for every one of them. So the opening rung is decided from `mime_type` —
 * a column the photo query already selects — instead of downloading ~237 KB
 * of HEIC and waiting for `onError`. For a HEIC row that means the FIRST
 * request is the preview: fewer bytes (179 KB vs 237 KB), no wasted request,
 * no error event, and it wins in Safari too, so no UA sniffing.
 *
 * `isBrowserDecodableMime` answers `true` for an unknown or absent mime — the
 * ladder never demotes on missing information, only on positive knowledge
 * that a format is undecodable.
 *
 * `onError` still walks the same ladder downward (a signed URL can expire, a
 * derivative can 404), so the failure path is unchanged in behaviour and just
 * has one more rung to try. If nothing resolves, a quiet mono "preview
 * unavailable" tile stands in — never a broken-image glyph. A quality note
 * appears ONLY at `thumb`: 1600 px is the intended quality, not a
 * degradation. No zoom in v1 (logged as a code-only call — prev/next +
 * full-bleed is the whole interaction).
 */

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { RoomScanPhoto } from '@patina/supabase';

// ═══════════════════════════════════════════════════════════════════════════
// Pure helpers (no React — unit-tested directly)
// ═══════════════════════════════════════════════════════════════════════════

/** The source fields any image surface needs to pick a rung.
 *
 *  The two derivative-lane fields are OPTIONAL: a caller that only knows about
 *  the original and the thumbnail (older call sites, narrow test literals)
 *  stays valid, and an absent field reads exactly like a null one — no rung. */
export type ViewerSrcPhoto = Pick<RoomScanPhoto, 'signedImageUrl' | 'signedThumbUrl'> &
  Partial<Pick<RoomScanPhoto, 'signedPreviewUrl' | 'mime_type'>>;

/** Which source the viewer is currently trying to render.
 *  - 'full'    → the signed original (may be an undecodable HEIC in Chrome)
 *  - 'preview' → the 1600 px JPEG derivative (00340) — the intended quality
 *                for a HEIC row, not a degradation
 *  - 'thumb'   → the 512 px JPEG derivative (last resort)
 *  - 'failed'  → nothing renderable; the viewer shows a quiet mono tile */
export type ViewerStage = 'full' | 'preview' | 'thumb' | 'failed';

/** The renderable rungs, best first. `failed` is deliberately not a rung —
 *  it is the terminal state reached by falling off the bottom. */
const LADDER: readonly ViewerStage[] = ['full', 'preview', 'thumb'];

/** Mimes no mainstream browser will decode in an `<img>`. Chrome, Firefox and
 *  Edge decode none of these; Safari decodes HEIC but is served the preview
 *  anyway (smaller, and one code path beats two). */
const UNDECODABLE_MIMES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

/**
 * Can the browser be expected to render this mime in an `<img>`?
 *
 * Returns `true` for an unknown, empty or absent mime — the ladder must never
 * demote on missing information, only on positive knowledge that a format is
 * undecodable. That default is what keeps every mime-less call site (and every
 * bare test literal) behaving exactly as it did before the preview rung
 * existed. Pure.
 */
export function isBrowserDecodableMime(mime: string | null | undefined): boolean {
  if (!mime) return true;
  // Strip any `; codecs=…` parameter and normalise case before matching.
  const base = mime.split(';')[0].trim().toLowerCase();
  if (!base) return true;
  return !UNDECODABLE_MIMES.has(base);
}

/** The URL for a stage, or null when there is nothing to render. Pure. */
export function stageSrc(stage: ViewerStage, photo: ViewerSrcPhoto): string | null {
  if (stage === 'full') return photo.signedImageUrl;
  if (stage === 'preview') return photo.signedPreviewUrl ?? null;
  if (stage === 'thumb') return photo.signedThumbUrl;
  return null;
}

/**
 * The stage the viewer OPENS a photo at: the highest rung that both has a URL
 * and can actually be decoded. `full` is skipped when `mime_type` says the
 * original is HEIC/HEIF, so a HEIC photo's first network request is the
 * 1600 px preview and the browser never fetches bytes it cannot draw.
 *
 * The skip is a PREFERENCE, not a ban. If no decodable rung has a URL, the
 * viewer opens the undecodable original anyway rather than showing "preview
 * unavailable" over a photo we are actually holding — Safari decodes HEIC, and
 * in Chrome this is exactly the pre-existing behaviour (try, fail, fall to
 * `failed`). Withholding it would be a regression traded for nothing. This
 * case does not arise in production, where every HEIC row has both
 * derivatives; the clause exists so the ladder degrades honestly if one day
 * one doesn't.
 *
 * Note the deliberate asymmetry with `stripSrcLadder` / `PeekChip`, which do
 * hard-gate the original: a 64 px tile spending ~237 KB on a HEIC it cannot
 * draw is pure waste, whereas the full-bleed viewer is the surface the
 * designer opened specifically to see this photo.
 *
 * Pure — recomputed per photo on index change.
 */
export function initialViewerStage(photo: ViewerSrcPhoto): ViewerStage {
  const decodable = isBrowserDecodableMime(photo.mime_type);
  for (const rung of LADDER) {
    if (rung === 'full' && !decodable) continue;
    if (stageSrc(rung, photo)) return rung;
  }
  // Last resort: an undecodable original beats showing nothing.
  if (!decodable && photo.signedImageUrl) return 'full';
  return 'failed';
}

/**
 * The next stage after the current source errors: a walk DOWN the ladder to
 * the first lower rung that has a URL of its own and whose URL differs from
 * the one that just failed (retrying an identical URL would only re-fail).
 * Falling off the bottom is `failed`. Pure.
 *
 * Deliberately unguarded by mime: this is the runtime failure path (an expired
 * signature, a 404 derivative), and by the time we are here the opening rung's
 * assumption has already been disproved.
 */
export function nextViewerStageOnError(stage: ViewerStage, photo: ViewerSrcPhoto): ViewerStage {
  const from = LADDER.indexOf(stage);
  if (from < 0) return 'failed';
  const failedSrc = stageSrc(stage, photo);
  for (const rung of LADDER.slice(from + 1)) {
    const src = stageSrc(rung, photo);
    if (src && src !== failedSrc) return rung;
  }
  return 'failed';
}

/**
 * The quiet footer note about the rung being shown, or null for no note.
 *
 * `full` and `preview` both return null: 1600 px IS the intended quality for a
 * HEIC row, so opening at the preview is not a degradation and must not be
 * apologised for. Only `thumb` — the 512 px last resort, reached only after
 * something better failed — warrants a note, and only when something better
 * actually existed. The wording is mime-agnostic on purpose: a JPEG row can
 * land here too, so the old "full image is HEIC" copy was factually wrong.
 * Pure.
 */
export function viewerQualityNote(stage: ViewerStage, photo: ViewerSrcPhoto): string | null {
  if (stage !== 'thumb') return null;
  const betterExisted = Boolean(photo.signedImageUrl) || Boolean(photo.signedPreviewUrl);
  return betterExisted ? 'reduced quality — the larger image could not be loaded' : null;
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
  const qualityNote = viewerQualityNote(stage, photo);
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
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
          {title}
          <span className="ml-3 text-[var(--text-muted)]">
            {safeIndex + 1} / {total}
          </span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-clay-ink)] hover:opacity-80"
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
            // Explicitly EAGER: this is the one image the designer opened the
            // viewer to see. `loading="lazy"` here would be a bug.
            loading="eager"
            decoding="async"
            className="max-h-full max-w-full border border-[var(--doc-ink-border)] object-contain"
          />
        ) : (
          <div className="flex h-40 w-64 items-center justify-center border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-front)] text-center font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            preview unavailable
          </div>
        )}

        {hasNext && (
          <NavButton side="right" label="Next photo" onClick={() => onIndexChange(safeIndex + 1)} />
        )}
      </div>

      {/* footer */}
      <div className="border-t border-[var(--color-pearl)] px-7 py-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {viewerFooterLine(photo, safeIndex, total)}
        </p>
        {qualityNote && (
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            {qualityNote}
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
