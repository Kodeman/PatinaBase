'use client';

/**
 * SplatStage — the Splat projection's stage frame (Rendered Room v2, W2;
 * PROPOSAL §4 "One viewer substrate").
 *
 * The only thing `room-view.tsx` imports for SPLAT. It carries `PlanStage` /
 * `OrbitStage` / `ModelStage`'s bordered stage box and mono stagecap verbatim, so
 * Plan, Orbit, Mesh, and Splat read as four faces of one instrument (D1 — a Strata
 * rule apart, not tabs), and it owns the projection's quiet states.
 *
 * The WebGL surface arrives through `dynamic(() => import('./splat-canvas'),
 * { ssr:false })`, so `@sparkjsdev/spark` — and the Rust splat-decode WASM it
 * inlines — land in a chunk that loads on the first Splat mount and never on a
 * Plan-, Orbit-, or Mesh-only visit. A design-system `ErrorBoundary` wraps it: if
 * Spark can't start, Mesh and Plan still carry the room. This module itself stays
 * free of three and of Spark; `__tests__/splat-chunk-boundary.test.ts` holds that.
 *
 * The quiet states live here rather than in the canvas because each is known
 * before any WebGL exists: the Room File row is in flight, the splat is registered
 * but its read path is not live yet, or the scan has no walkthrough at all. The
 * load-error state proper — a splat file that 404s or won't decode — is the
 * canvas's, and reads in the same voice.
 */

import dynamic from 'next/dynamic';
import { ErrorBoundary } from '@patina/design-system';
import type { SplatUnavailableReason } from '@patina/supabase';

const SplatCanvas = dynamic(() => import('./splat-canvas'), {
  ssr: false,
  loading: () => <StageMessage mono>Bringing the walkthrough up…</StageMessage>,
});

const SPLAT_FALLBACK = (
  <StageMessage>
    Splat couldn’t start on this device — Mesh and Plan carry the room.
  </StageMessage>
);

export interface SplatStageProps {
  /** A fetchable splat URL, or null while none resolves. */
  url: string | null;
  /** Why `url` is null — `useSplatUrl`'s own answer, passed through unchanged. */
  unavailable: SplatUnavailableReason | null;
  /** True while the Room File row that carries the artifact ref is in flight. */
  isLoading?: boolean;
}

export function SplatStage({ url, unavailable, isLoading = false }: SplatStageProps) {
  return (
    <div className="overflow-hidden rounded-[2px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-front)]">
      <StageBody url={url} unavailable={unavailable} isLoading={isLoading} />
      <div className="flex items-center justify-between border-t border-[var(--doc-ink-border)] px-3.5 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
        <span>Splat · the room as photographed</span>
        <span>seen, never measured against</span>
      </div>
    </div>
  );
}

function StageBody({ url, unavailable, isLoading }: SplatStageProps) {
  if (isLoading) return <StageMessage mono>Fetching the walkthrough…</StageMessage>;

  // A URL resolved — a dev `?splatUrl=` override today, a capability URL once the
  // W2 read path lands. Either way it is the canvas's from here.
  if (url) {
    return (
      <ErrorBoundary fallback={SPLAT_FALLBACK}>
        <SplatCanvas splatUrl={url} />
      </ErrorBoundary>
    );
  }

  if (unavailable === 'read-path-pending') {
    return (
      <StageMessage>
        This room’s walkthrough is captured — the viewer is waiting on its read path.
      </StageMessage>
    );
  }

  return (
    <StageMessage>
      This scan has no walkthrough yet — Mesh and Plan carry the room.
    </StageMessage>
  );
}

/** The stage-height quiet line every non-canvas state uses — mono for a passing
 *  moment (loading), italic body for a settled one (nothing to draw). Lifted from
 *  `model/model-stage.tsx` so the two projections' silences read alike. */
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
