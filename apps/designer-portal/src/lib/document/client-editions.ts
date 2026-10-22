/**
 * US-49 Phase 2 — reading a job's editions (list_client_editions, 00845) the
 * way the server acts on them. The Press band and the client mirror share
 * these, so both name the same pending, current and published editions.
 */

import type { ClientEdition } from '@patina/supabase';

/** The edition waiting on the studio's Approve, if any. */
export const pendingEdition = (editions: readonly ClientEdition[]) =>
  editions.find((edition) => edition.status === 'awaiting_review') ?? null;

/** The approved edition the client sees now, if any. */
export const currentEdition = (editions: readonly ClientEdition[]) =>
  editions.find((edition) => edition.status === 'approved') ?? null;

/**
 * Published = it reached the client page: studio-approved (approvedAt) or
 * auto-published. A superseded edition that was never approved (a draft a
 * newer draft replaced) was never published.
 */
export const wasPublished = (edition: ClientEdition) =>
  (edition.status === 'approved' || edition.status === 'superseded') &&
  (edition.approvedAt != null || edition.autoPublished);

/**
 * The edition Undo brings back (undo_client_edition, 00845): the approved
 * edition this one superseded, latest approval first. Null → the page goes
 * back to what it showed before any edition.
 */
export function editionUndoRestores(
  editions: readonly ClientEdition[],
  undone: ClientEdition,
): ClientEdition | null {
  return (
    editions
      .filter(
        (edition) =>
          edition.supersededBy === undone.id &&
          edition.status === 'superseded' &&
          edition.approvedAt != null,
      )
      .sort(
        (a, b) => (b.approvedAt ?? '').localeCompare(a.approvedAt ?? '') || b.seq - a.seq,
      )[0] ?? null
  );
}

/** The project is closed: its current edition is frozen (00847), so nothing
 *  on the client page may change from here. */
export const editionsFrozen = (editions: readonly ClientEdition[]) =>
  editions.some((edition) => edition.status === 'approved' && edition.frozenAt != null);
