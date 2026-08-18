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
 * ⚠ THE CANVAS IS NOT HERE YET, AND THE ABSENCE IS DELIBERATE. Every MIT
 * three.js-native Gaussian-splat renderer requires a three.js newer than the one
 * this portal runs; the evaluation, the evidence, and what unblocks it are in
 * `README.md` beside this file. Until then the stage tells the truth rather than
 * mounting a canvas that would throw on its first frame. When the renderer lands,
 * `splat-canvas.tsx` arrives as a sibling behind
 * `dynamic(() => import('./splat-canvas'), { ssr:false })` — the ModelStage shape —
 * and the only edit here is swapping the `renderer-pending` branch for it. The
 * states around it, and the whole data seam behind them, are already right.
 */

import type { SplatUnavailableReason } from '@patina/supabase';

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
  // W2 read path lands. Either way there is no renderer to hand it to yet, and
  // saying so is the honest state; see this module's README.
  if (url) {
    return (
      <StageMessage>
        The walkthrough viewer isn’t in this build yet — Mesh and Plan carry the room.
      </StageMessage>
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
