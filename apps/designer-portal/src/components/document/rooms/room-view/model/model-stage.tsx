'use client';

/**
 * ModelStage — the Mesh projection's stage frame + lazy boundary (Rendered Room v2, P1;
 * PROPOSAL §4 "One viewer substrate").
 *
 * The ONLY thing the shell (`room-view.tsx`) imports for Mesh, and — like `OrbitStage` —
 * it never touches three.js itself. The WebGL surface arrives through
 * `dynamic(() => import('./model-canvas'), { ssr:false })`, so three, the GLTF/Draco/KTX2
 * loaders, and the scene builder land in a chunk that loads on the first Mesh mount and
 * never on a Plan- or Orbit-only visit. A design-system `ErrorBoundary` wraps the canvas:
 * if plain three.js can't start, Plan still carries the room.
 *
 * The bordered stage box + mono stagecap are `PlanStage`/`OrbitStage`'s chrome verbatim,
 * so Plan, Orbit, and Mesh read as three faces of one instrument (D1 — a Strata rule
 * apart, not tabs).
 *
 * Three quiet states live here rather than in the canvas, because all three are known
 * before any WebGL exists: the mesh URL is still being signed, the signing came back
 * empty (the row points at an artifact Storage doesn't have), or the canvas itself
 * failed. The load-error state proper — a GLB that 404s or won't parse — is the canvas's,
 * and reads in the same voice.
 */

import dynamic from 'next/dynamic';
import { ErrorBoundary } from '@patina/design-system';

const ModelCanvas = dynamic(() => import('./model-canvas'), {
  ssr: false,
  loading: () => <StageMessage mono>Bringing the mesh up…</StageMessage>,
});

const MODEL_FALLBACK = (
  <StageMessage>Mesh couldn’t start on this device — Plan carries the measurements.</StageMessage>
);

/**
 * Does this scan carry a mesh worth offering? The MESH mode is hidden entirely unless
 * `room_scans.model_url_gltf` is set — `model_url` alone is the iOS USDZ, which
 * `GLTFLoader` cannot read, so falling back to it (the way `useSignedScanModelUrl` does
 * for the legacy viewer) would offer a mode that can only fail.
 */
export function hasMeshModel(
  scan: { model_url_gltf?: string | null } | null | undefined,
): boolean {
  return typeof scan?.model_url_gltf === 'string' && scan.model_url_gltf.length > 0;
}

export interface ModelStageProps {
  /** The signed GLB URL; null while unresolved or when signing came back empty. */
  modelUrl: string | null;
  /** True while the signed URL is in flight. */
  isSigning?: boolean;
}

export function ModelStage({ modelUrl, isSigning = false }: ModelStageProps) {
  return (
    <div className="overflow-hidden rounded-[2px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-front)]">
      {isSigning ? (
        <StageMessage mono>Fetching the mesh…</StageMessage>
      ) : modelUrl ? (
        <ErrorBoundary fallback={MODEL_FALLBACK}>
          <ModelCanvas modelUrl={modelUrl} />
        </ErrorBoundary>
      ) : (
        <StageMessage>
          This scan has no mesh file yet — Plan carries the measurements.
        </StageMessage>
      )}
      <div className="flex items-center justify-between border-t border-[var(--doc-ink-border)] px-3.5 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
        <span>Mesh · the room as scanned</span>
        <span>drag to orbit · scroll to move closer</span>
      </div>
    </div>
  );
}

/** The stage-height quiet line every non-canvas state uses — mono for a passing
 *  moment (loading), italic body for a settled one (nothing to draw). */
function StageMessage({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex h-[560px] w-full items-center justify-center px-6 text-center">
      <p
        className={
          mono
            ? 'font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]'
            : 'text-[12px] italic text-[var(--text-muted)]'
        }
      >
        {children}
      </p>
    </div>
  );
}
