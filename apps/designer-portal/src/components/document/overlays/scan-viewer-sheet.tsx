'use client';

/**
 * ScanViewerSheet (R90) — the room scan over the Document. The shared
 * full-screen ground owns dialog behavior; the content below owns its own
 * visible chrome without a nested dialog/header.
 *
 * ⚠ THE INTERACTIVE VIEWER IS GONE FROM THIS SHEET, AND THAT IS THE POINT
 * (Rendered Room v2, W2). It was `RoomScanViewer` on @react-three/fiber@8,
 * which reads a React internal removed in React 19 — under React 19 it could
 * only ever throw on mount and fall through the ErrorBoundary to `ScanStill`.
 * The whole r3f stack has been deleted rather than kept as a lazy chunk that
 * always fails; the still it degraded to is now simply the sheet's content, so
 * this surface behaves exactly as it did in practice and costs no WebGL. A
 * follow-up may point the sheet at Room View's `ModelStage` (plain three.js,
 * React-19-safe) — that is a separate item, not this one.
 *
 * The model URL is still signed here: iOS wrote public-style URLs for a private
 * bucket, and the still's own preparation state depends on that resolution.
 */

import { useRoomScan, type RoomScan } from '@patina/supabase';
import {
  FullScreenViewerHeader,
  FullScreenViewerShell,
  FullScreenViewerState,
} from './full-screen-viewer-shell';

export function ScanViewerSheet({
  scanId,
  onClose,
}: {
  scanId: string;
  onClose: () => void;
}) {
  // No `useSignedScanModelUrl` here any more: signing existed solely to hand a
  // private-bucket URL to the WebGL viewer, and its "Preparing the 3D file…"
  // state now gates nothing — the still comes off the scan row itself.
  const { data: scan, isError } = useRoomScan(scanId);
  const title = scan?.name ?? 'Room scan';

  if (!scan) {
    return (
      <FullScreenViewerShell
        title="Room scan"
        onClose={onClose}
        actionKey="close-scan-viewer"
      >
        <FullScreenViewerState error={isError}>
          {isError
            ? 'That scan could not be opened.'
            : 'Opening the scan…'}
        </FullScreenViewerState>
      </FullScreenViewerShell>
    );
  }

  return (
    <FullScreenViewerShell
      title={title}
      onClose={onClose}
      showHeader={false}
      actionKey="close-scan-viewer"
    >
      <div
        data-overlay-scan-viewer
        className="flex min-h-0 flex-1 flex-col [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:focus-visible:outline [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-[var(--color-clay)]"
      >
        <ScanStill scan={scan} onClose={onClose} />
      </div>
    </FullScreenViewerShell>
  );
}

/**
 * The sheet's content: the scan's own still. This is only content inside the
 * owning dialog, so it does not introduce nested dialog semantics. It supplies
 * its own header, which is why the shell above runs `showHeader={false}`.
 */
function ScanStill({ scan, onClose }: { scan: RoomScan; onClose: () => void }) {
  const title = scan.name ?? 'Room scan';
  const still = scan.thumbnail_url;

  return (
    <div
      data-overlay-scan-still
      className="flex min-h-0 flex-1 flex-col bg-[var(--doc-paper)]"
    >
      <FullScreenViewerHeader
        title={title}
        actionKey="close-scan-still"
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto p-4 sm:p-6">
        {still ? (
          <img
            src={still}
            alt={title}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <p className="text-[14px] italic text-[var(--text-body)]">
            No preview image is available for this scan.
          </p>
        )}
        <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
          The interactive 3D preview is being updated.
        </p>
      </div>
    </div>
  );
}
