/**
 * Release manifest for return teaching (system-architecture §1.2).
 *
 * Append-only and ordered: the array order is the release order, so "since"
 * is a cursor comparison. Appending a release means appending its id to
 * `teaching-releases.snapshot.json` too. Copy lives in the Sanity
 * `teachingRelease` doc with the same id; only releases in both render.
 */
import type { TeachingRelease, TeachingSizeClass } from '@/lib/teaching/types';

export const TEACHING_RELEASES = [
  { id: '2026-09-10-galley-parts', shippedOn: '2026-09-10', sizeClass: 'workflow_changing', featureKeys: ['galley'] },
  { id: '2026-09-11-ledger-invoice-delivery', shippedOn: '2026-09-11', sizeClass: 'useful', featureKeys: ['ledger'] },
  { id: '2026-09-11-invoice-print', shippedOn: '2026-09-11', sizeClass: 'useful', featureKeys: ['ledger'] },
] as const satisfies readonly TeachingRelease[];

export interface ResolvedCursor {
  /** Manifest index of the cursor; -1 when nothing has been met yet. */
  index: number;
  /** The id is not in this bundle's manifest: resolved to head, and the caller writes nothing. */
  unknown: boolean;
}

/** `null` means before the first release. An id absent from the manifest resolves to head. */
export function resolveCursor(
  cursor: string | null,
  manifest: readonly TeachingRelease[]
): ResolvedCursor {
  if (cursor === null) return { index: -1, unknown: false };
  const index = manifest.findIndex((r) => r.id === cursor);
  return index === -1 ? { index: manifest.length - 1, unknown: true } : { index, unknown: false };
}

/** True when the release comes after the cursor in manifest order. */
export function releaseSinceCursor(
  releaseId: string | undefined,
  cursor: string | null,
  manifest: readonly TeachingRelease[]
): boolean {
  const index = manifest.findIndex((r) => r.id === releaseId);
  return index !== -1 && index > resolveCursor(cursor, manifest).index;
}

export function sizeOf(
  releaseId: string | undefined,
  manifest: readonly TeachingRelease[]
): TeachingSizeClass | undefined {
  return manifest.find((r) => r.id === releaseId)?.sizeClass;
}

/** The release's `YYYY-MM-DD` ship date. */
export function shippedOn(
  releaseId: string | undefined,
  manifest: readonly TeachingRelease[]
): string | undefined {
  return manifest.find((r) => r.id === releaseId)?.shippedOn;
}

/**
 * The first-load cursor: the newest release shipped on or before the account
 * was created, or `null` when none is that old (§1.3).
 */
export function initialCursorFor(
  createdAt: string,
  manifest: readonly TeachingRelease[]
): string | null {
  const created = Date.parse(createdAt);
  for (let i = manifest.length - 1; i >= 0; i -= 1) {
    if (Date.parse(manifest[i].shippedOn) <= created) return manifest[i].id;
  }
  return null;
}
