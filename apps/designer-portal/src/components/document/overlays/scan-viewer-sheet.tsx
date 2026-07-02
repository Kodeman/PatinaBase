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
 */

import { useEffect, useRef } from 'react';
import { useRoomScan } from '@patina/supabase';
import { RoomScanViewer } from '@/components/rooms/viewer';

export function ScanViewerSheet({
  scanId,
  onClose,
}: {
  scanId: string;
  onClose: () => void;
}) {
  const { data: scan, isError } = useRoomScan(scanId);
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
        // The viewer brings its own full-height charcoal chrome + close ✕.
        <RoomScanViewer scan={scan} onClose={onClose} />
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
