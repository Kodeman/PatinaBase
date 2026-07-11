'use client';

/**
 * ScanViewerSheet (R90) — the interactive 3D room scan as a doc-file-viewer
 * sibling. DocFileViewer's own header calls itself "the scan's viewer (R27) —
 * one component, two doors"; R90 replaces the door that opened a static hero
 * image with the live WebGL `RoomScanViewer` (reused verbatim).
 *
 * A full-bleed paper sheet (z-[60], the DocFileViewer grammar) fetches the
 * RoomScan by id, then hands it to the viewer — whose own charcoal chrome
 * (close ✕ + toolbar + measure/annotate) fills the sheet. Esc or the viewer's
 * close ✕ put it back; focus is restored to the opener. Zero shadows (D4); the
 * document beneath stays mounted (D1).
 *
 * Contract: `<ScanViewerSheet scanId onClose />`. The sheet owns the RoomScan
 * fetch (useRoomScan) so callers pass an id, never a loaded scan — this is the
 * one place that fetch lives, and it retires the /portal/rooms/[id] page's
 * useRoom+useRoomScans mount. Do NOT fold this into doc-file-viewer.tsx (the
 * Folio consumes that as the paper file viewer); this is its sibling.
 *
 * Designer Handoff (Wave 1B): the client iOS app writes PUBLIC-style URLs into
 * `model_url`/`model_url_gltf` even though `room-scans` is a PRIVATE bucket —
 * those 400 for everyone. `useSignedScanModelUrl` derives the real storage
 * path and mints a signed URL; this sheet is the one place that swap happens,
 * so every caller (Discovery, Folio, Letterhead) gets a working model for
 * free. The sheet holds the interactive viewer until the signing query
 * settles, so the network tab only ever sees the signed request, never the
 * raw 400.
 */

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRoomScan, useSignedScanModelUrl, type RoomScan } from '@patina/supabase';
import { ErrorBoundary } from '@patina/design-system';

// The 3D viewer pulls @react-three/fiber (a WebGL/three stack). Load it ONLY
// when this sheet mounts. A static import drags fiber into every doc's module
// graph, and fiber@8's reconciler throws at init under React 19 (it reads the
// removed React internal ReactCurrentOwner) — that white-screened every
// /doc/[id]. dynamic({ ssr: false }) code-splits it out of the doc bundle; the
// ErrorBoundary around it catches the fiber-vs-React-19 crash on open and shows
// the scan still instead (the pre-R90 behavior) until fiber is upgraded to v9.
const RoomScanViewer = dynamic(
  () => import('@/components/rooms/viewer').then((m) => m.RoomScanViewer),
  { ssr: false, loading: () => <ViewerLoading /> },
);

export function ScanViewerSheet({
  scanId,
  onClose,
}: {
  scanId: string;
  onClose: () => void;
}) {
  const { data: scan, isError } = useRoomScan(scanId);
  // Signed model URL — enabled only once the scan itself is loaded (null-safe
  // when disabled/no model). See the file header for why this swap happens here.
  const { data: signedModelUrl, isLoading: signingModel } = useSignedScanModelUrl(scan);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Esc / focus-restore — the doc-file-viewer sheet grammar. Capture-phase so
  // the sheet closes before the surface beneath (or the viewer's own Escape
  // tool-clear) sees the key, matching DocFileViewer.
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={scan?.name ?? 'Room scan'}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--doc-paper)] motion-safe:animate-[doc-fade_200ms_ease-out]"
    >
      {scan ? (
        signingModel ? (
          // Hold the interactive viewer until the signed URL resolves — the
          // raw row's model_url/model_url_gltf are public-style URLs into a
          // private bucket and would 400 if handed to the viewer directly.
          <>
            <div className="flex items-baseline justify-between border-b border-[var(--color-pearl)] px-7 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
                {scan.name ?? 'Room scan'}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay)] hover:opacity-80"
              >
                ← Back to the document
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <p className="text-[12px] italic text-[var(--text-muted)]">
                Preparing the 3D file…
              </p>
            </div>
          </>
        ) : (
          // The viewer brings its own full-height charcoal chrome + close ✕. If
          // it can't run (fiber@8 under React 19), degrade to the still (R90 fix).
          <ErrorBoundary fallback={<ScanStill scan={scan} onClose={onClose} />}>
            <RoomScanViewer
              scan={{
                ...scan,
                model_url: signedModelUrl ?? null,
                model_url_gltf: signedModelUrl ?? null,
              }}
              onClose={onClose}
            />
          </ErrorBoundary>
        )
      ) : (
        <>
          <div className="flex items-baseline justify-between border-b border-[var(--color-pearl)] px-7 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
              Room scan
            </p>
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay)] hover:opacity-80"
            >
              ← Back to the document
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <p className="text-[12px] italic text-[var(--text-muted)]">
              {isError ? 'That scan could not be opened.' : 'Opening the scan…'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** The lazy viewer's loading state while its (heavy) chunk downloads. */
function ViewerLoading() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <p className="text-[12px] italic text-[var(--text-muted)]">Opening the 3D scan…</p>
    </div>
  );
}

/**
 * The degrade path: when the interactive viewer can't run, show the scan's
 * still (hero frame / thumbnail) — the pre-R90 door — with a quiet note. Stops
 * a scan-open from white-screening; retires when fiber is upgraded to v9.
 */
function ScanStill({ scan, onClose }: { scan: RoomScan; onClose: () => void }) {
  const still = scan.thumbnail_url;
  return (
    <>
      <div className="flex items-baseline justify-between border-b border-[var(--color-pearl)] px-7 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
          {scan.name ?? 'Room scan'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay)] hover:opacity-80"
        >
          ← Back to the document
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6">
        {still ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={still}
            alt={scan.name ?? 'Room scan'}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <p className="text-[12px] italic text-[var(--text-muted)]">No preview image for this scan.</p>
        )}
        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          The interactive 3D preview is being updated.
        </p>
      </div>
    </>
  );
}
