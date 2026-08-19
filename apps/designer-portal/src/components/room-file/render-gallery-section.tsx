'use client';

/**
 * RenderGallerySection — a horizontal strip of the room's registered Modal
 * renders (Rendered Room v2, W2 finale). Consumes `useRenderShots`, the
 * `renders` sibling of `useSplatUrl` (packages/supabase/src/hooks) — same
 * env-gated pending contract, so this section behaves exactly like every
 * other artifact-backed section here: three states, one of them invisible.
 *
 * Shot selection: the renders stage plans 4 corners + 1 top-down + 24
 * turntable frames (`services/scan-modal/.../cameras.py: plan_cameras`). The
 * turntable frames are a flip-book, not stills worth a static gallery tile, so
 * they're excluded outright rather than collapsed behind a count chip — the
 * strip only ever shows the named "still" shots: `cover` (present only when
 * distinct from every other shot; today the cover IS the top-down render, so
 * the route dedupes it away and this key is normally absent — see
 * `infra/edge-api-worker/src/scan.ts`), the 4 corners, and top-down. A fixed
 * display order keeps the strip deterministic across renders regardless of
 * the shot map's own (sorted-by-name) key order.
 */

import { useState } from 'react';
import { useRenderShots } from '@patina/supabase';
import { SectionHeading } from './drawings-section';
import { FullScreenViewerShell } from '@/components/document/overlays/full-screen-viewer-shell';
import { ROOM_FILE_COPY as C } from './room-file-copy';

/** Fixed display order — cover first, then the 4 corners, then top-down.
 *  Anything not in this set (i.e. every `turntable_NNN` frame) is excluded. */
const SHOT_ORDER = ['cover', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw', 'top_down'];

function shotLabel(shot: string): string {
  return C.renderShotLabel[shot] ?? shot.replace(/_/g, ' ');
}

export interface RenderGallerySectionProps {
  roomFileId: string;
  roomName: string;
}

export function RenderGallerySection({ roomFileId, roomName }: RenderGallerySectionProps) {
  const { hasArtifact, shots, unavailable } = useRenderShots(roomFileId);
  const [openShot, setOpenShot] = useState<string | null>(null);

  // Hidden, not empty-stated: env-unset/pending and no-artifact both render
  // nothing — the section simply doesn't exist yet, matching `useSplatUrl`'s
  // "unavailable" collapse (a 403-shaped confirmation is exactly what this
  // avoids).
  if (!hasArtifact || unavailable || !shots) return null;

  const tiles = SHOT_ORDER.filter((shot) => shots[shot]);
  if (tiles.length === 0) return null;

  const openUrl = openShot ? shots[openShot]?.url : null;

  return (
    <section className="mt-10">
      <SectionHeading title={C.renderGalleryTitle} meta={C.renderGallerySubtitle(tiles.length)} />

      <ul className="mt-4 flex gap-3 overflow-x-auto pb-1">
        {tiles.map((shot) => (
          <li key={shot} className="flex-shrink-0">
            <button
              type="button"
              onClick={() => setOpenShot(shot)}
              className="block w-[160px] overflow-hidden rounded-[3px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-front)] text-left transition-colors hover:border-[var(--color-clay)]"
            >
              <img
                src={shots[shot].url}
                alt={C.renderShotAlt(roomName, shot)}
                className="block aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
              <span className="block px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                {shotLabel(shot)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {openShot && openUrl && (
        <FullScreenViewerShell
          title={`${roomName} · ${shotLabel(openShot)}`}
          onClose={() => setOpenShot(null)}
        >
          <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--color-charcoal)] p-4">
            <img
              src={openUrl}
              alt={C.renderShotAlt(roomName, openShot)}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </FullScreenViewerShell>
      )}
    </section>
  );
}
