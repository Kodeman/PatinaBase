'use client';

/**
 * ScanViewerSheet (R90) — the interactive room scan over the Document. The
 * shared full-screen ground owns dialog behavior; RoomScanViewer retains its
 * own live chrome, tools, and WebGL lifecycle without a nested dialog/header.
 *
 * The model URL must be signed before the interactive viewer mounts: iOS wrote
 * public-style URLs for a private bucket, so handing the raw row to WebGL would
 * issue a guaranteed 400. The ErrorBoundary still degrades to the scan still
 * until the React-19-compatible fiber stack is in place.
 */

import dynamic from 'next/dynamic';
import {
  useRoomScan,
  useSignedScanModelUrl,
  type RoomScan,
} from '@patina/supabase';
import { ErrorBoundary } from '@patina/design-system';
import {
  FullScreenViewerHeader,
  FullScreenViewerShell,
  FullScreenViewerState,
} from './full-screen-viewer-shell';

// Keep @react-three/fiber out of every document bundle. fiber@8 reads a React
// internal removed in React 19; the boundary below catches that init failure.
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
  const { data: signedModelUrl, isLoading: signingModel } =
    useSignedScanModelUrl(scan);
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

  if (signingModel) {
    return (
      <FullScreenViewerShell
        title={title}
        onClose={onClose}
        actionKey="close-scan-viewer"
      >
        <FullScreenViewerState>Preparing the 3D file…</FullScreenViewerState>
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
      </div>
    </FullScreenViewerShell>
  );
}

/** The lazy viewer's paper state while its heavy WebGL chunk downloads. */
function ViewerLoading() {
  return (
    <FullScreenViewerState withHeader>
      Opening the 3D scan…
    </FullScreenViewerState>
  );
}

/**
 * Degrade path when the interactive viewer cannot run. This is only content
 * inside the owning dialog, so it does not introduce nested dialog semantics.
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
