/**
 * Return teaching — the in-memory tagged-boundary log (system-architecture §2,
 * "Unit of work completed: tagged boundaries"). The global MutationCache
 * subscriber in `lib/react-query.ts` records a boundary when a mutation tagged
 * `meta.teachingBoundary` succeeds; anchor notes ask `firedOn` whether their
 * boundary fired on their surface after it mounted. Nothing is persisted: the
 * log lives for this page session only.
 */

import type { BoundaryLog, TeachingBoundaryKey } from './types';

export interface BoundaryFiring {
  boundaryKey: TeachingBoundaryKey;
  /** Epoch ms. */
  at: number;
  surfaceKey: string;
}

type Listener = (firing: BoundaryFiring) => void;

const firings: BoundaryFiring[] = [];
const listeners = new Set<Listener>();
let currentSurface = 'unknown';

/** Surfaces declare themselves on mount so a firing is attributed to them. */
export function setCurrentTeachingSurface(surfaceKey: string): void {
  currentSurface = surfaceKey;
}

export function getCurrentTeachingSurface(): string {
  return currentSurface;
}

export function record(firing: BoundaryFiring): void {
  firings.push(firing);
  for (const listener of listeners) listener(firing);
}

export function firedOn(surface: string, boundary: string, sinceMs?: number): boolean {
  return firings.some(
    (f) =>
      f.surfaceKey === surface &&
      f.boundaryKey === boundary &&
      (sinceMs === undefined || f.at >= sinceMs),
  );
}

/** Returns the unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The selector's `BoundaryLog` input. */
export const boundaryLog: BoundaryLog = { firedOn };

/** Test-only: forget every firing, listener and the current surface. */
export function resetTeachingBoundaries(): void {
  firings.length = 0;
  listeners.clear();
  currentSurface = 'unknown';
}
