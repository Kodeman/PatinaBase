'use client';

/**
 * OrbitStage — the Orbit projection's stage frame + lazy boundary (W3-T6; R107 §3, I71).
 *
 * This is the ONLY thing the shell (`room-view.tsx`) imports for Orbit. It never touches
 * three.js itself: the WebGL surface is pulled through `dynamic(() => import('./orbit-canvas'),
 * { ssr:false })`, so three + the scene builder land in a chunk that loads on the first
 * Orbit mount and never on a Plan-only visit. A design-system `ErrorBoundary` wraps the
 * canvas — if plain three.js can't start on the device, Plan still carries the room.
 *
 * The bordered stage box + the mono stagecap mirror `PlanStage`'s chrome, so Plan and
 * Orbit read as two faces of one instrument (a Strata rule apart, not tabs — D1).
 */

import dynamic from 'next/dynamic';
import { ErrorBoundary } from '@patina/design-system';
import type { RoomGeometry } from '@/lib/room-view/geometry';

const OrbitCanvas = dynamic(() => import('./orbit-canvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[560px] w-full items-center justify-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
        Bringing the room up…
      </p>
    </div>
  ),
});

const ORBIT_FALLBACK = (
  <div className="flex h-[560px] w-full items-center justify-center px-6 text-center">
    <p className="text-[12px] italic text-[var(--text-muted)]">
      Orbit couldn’t start on this device — Plan carries the measurements.
    </p>
  </div>
);

export function OrbitStage({ geometry }: { geometry: RoomGeometry }) {
  return (
    <div className="overflow-hidden rounded-[2px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-front)]">
      <ErrorBoundary fallback={ORBIT_FALLBACK}>
        <OrbitCanvas geometry={geometry} />
      </ErrorBoundary>
      <div className="flex items-center justify-between border-t border-[var(--doc-ink-border)] px-3.5 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
        <span>Orbit · the room as a volume</span>
        <span>drag to orbit · scroll to move closer</span>
      </div>
    </div>
  );
}
