'use client';

/**
 * Teaching hold registry (return-teaching §2, finding 12). An editor that holds
 * dirty state registers a hold; while any hold is registered the surface is not
 * "at rest" and no teaching note may render. Holds are keyed, so a double hold
 * under one key is a single hold and one release clears it.
 */

import { useEffect } from 'react';

const holds = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function holdTeaching(key: string): void {
  if (holds.has(key)) return;
  holds.add(key);
  emit();
}

export function releaseTeaching(key: string): void {
  if (!holds.delete(key)) return;
  emit();
}

export function isTeachingHeld(): boolean {
  return holds.size > 0;
}

/** Called on every hold-set change. Returns the unsubscribe function. */
export function subscribeHolds(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** Holds `key` while `active` is true; releases on false or unmount. */
export function useTeachingHold(key: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    holdTeaching(key);
    return () => releaseTeaching(key);
  }, [key, active]);
}
