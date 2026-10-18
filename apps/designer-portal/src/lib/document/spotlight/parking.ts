import { useSyncExternalStore } from "react";

// One in-memory store for sheets that leave for a fix. Nothing crosses a tab
// or survives a reload; sheet and subject both belong in the key.
const parked = new Map<string, unknown>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function invoiceParkingKey(projectId: string): string {
  return `invoice:${projectId}`;
}

export function park<T>(key: string, state: T): void {
  parked.set(key, state);
  notify();
}

export function unpark(key: string): void {
  if (parked.delete(key)) notify();
}

export function parkedState<T>(key: string): T | null {
  return (parked.get(key) as T | undefined) ?? null;
}

export function clearParked(): void {
  if (parked.size === 0) return;
  parked.clear();
  notify();
}

export function subscribeParked(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useParked<T>(key: string): T | null {
  return useSyncExternalStore(
    subscribeParked,
    () => parkedState<T>(key),
    () => null,
  );
}
