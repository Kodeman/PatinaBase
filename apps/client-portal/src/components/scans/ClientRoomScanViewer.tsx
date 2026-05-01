'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';

import { useRoomScan } from '@patina/supabase';

import { ClientViewerCanvas, type ClientViewerMode } from './ClientViewerCanvas';
import { ClientViewerLoadingOverlay } from './ClientViewerLoadingOverlay';
import { ClientViewerToolbar } from './ClientViewerToolbar';
import { ShareScanDialog } from './ShareScanDialog';

interface ClientRoomScanViewerProps {
  scanId: string;
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

export function ClientRoomScanViewer({ scanId }: ClientRoomScanViewerProps) {
  const { data: scan, isLoading } = useRoomScan(scanId);
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<ClientViewerMode>('orbit');
  const [fullQuality, setFullQuality] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Resolve the GLB URL. If the scan has separate LOD URLs we'd pick lod0/lod1
  // here; today the scan only carries a single model_url(_gltf). Treat the
  // "full quality" toggle as informational until the media service returns
  // tiered URLs.
  const modelUrl = useMemo(() => scan?.model_url_gltf ?? scan?.model_url ?? null, [scan]);

  if (isLoading) {
    return (
      <section className="rounded-lg border border-[var(--border-default)] bg-patina-charcoal text-white">
        <div className="flex aspect-video items-center justify-center">
          <p className="type-body-small text-white/60">Loading room…</p>
        </div>
      </section>
    );
  }

  if (!scan) {
    return (
      <section className="rounded-lg border border-[var(--border-default)] bg-white p-8 text-center">
        <p className="type-body text-[var(--text-muted)]">Room not found.</p>
      </section>
    );
  }

  const hasModel = !!modelUrl;
  const fullQualityDisabledReason = isMobile
    ? 'Full quality available on desktop'
    : !hasModel
      ? 'No model available'
      : undefined;

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-patina-charcoal text-white">
      <header className="flex items-start justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="font-heading text-base text-white">{scan.name}</h2>
          <p className="text-xs text-white/60">
            {scan.floor_area ? `${scan.floor_area.toFixed(1)} m²` : 'Room scan'}
            {scan.room_type ? ` · ${scan.room_type.replace(/_/g, ' ')}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="rounded-[3px] bg-[var(--accent-primary)] px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
          data-testid="open-share-dialog"
        >
          Get design help
        </button>
      </header>

      {hasModel ? (
        <>
          <ClientViewerToolbar
            mode={mode}
            onChangeMode={setMode}
            fullQuality={fullQuality}
            onToggleFullQuality={() => setFullQuality((v) => !v)}
            fullQualityAvailable={!isMobile && hasModel}
            fullQualityDisabledReason={fullQualityDisabledReason}
          />
          <div className="relative aspect-video w-full" data-testid="client-viewer-canvas">
            <Suspense fallback={<ClientViewerLoadingOverlay />}>
              <ClientViewerCanvas modelUrl={modelUrl} mode={mode} />
            </Suspense>
          </div>
        </>
      ) : (
        <div className="flex aspect-video items-center justify-center bg-patina-charcoal p-8 text-center">
          <div>
            <p className="text-sm text-white/80">3D model not yet available.</p>
            <p className="mt-2 text-xs text-white/50">
              Your scan may still be processing. Check back shortly.
            </p>
          </div>
        </div>
      )}

      <ShareScanDialog
        scanId={scanId}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </section>
  );
}
