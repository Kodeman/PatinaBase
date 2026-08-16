'use client';

/**
 * Stale-table pinning (Direction B, R7).
 *
 * A table never reshuffles under the designer's hands. The composition is
 * snapshotted when the document is picked up; a derivation that would compose a
 * different table does not re-compose the paper — it arms a turn, which the
 * designer performs. Adopting re-arms for the next change, and re-opening the
 * document adopts naturally, because a fresh mount snapshots again.
 *
 * Data inside the regions is untouched by any of this: every region keeps its
 * own live reads. Only which spread the paper's middle is composed as is held.
 *
 * `derived` must be referentially stable for equal inputs — the caller memoizes
 * it — and is `null` until the document's row has answered, since a pin taken
 * over an absent row would pin nothing.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  tableCompositionKey,
  type TableComposition,
} from '@/lib/document/table-derivation';

export interface TablePin {
  /** The composition the paper is currently printed as. */
  composition: TableComposition | null;
  /** The composition the derivation would compose now — null when it agrees. */
  pending: TableComposition | null;
  /** Adopt the pending composition. */
  turn: () => void;
}

export function useTablePin(derived: TableComposition | null): TablePin {
  const [pinned, setPinned] = useState<TableComposition | null>(derived);

  useEffect(() => {
    setPinned((current) => current ?? derived);
  }, [derived]);

  const composition = pinned ?? derived;
  const pending =
    composition && derived && tableCompositionKey(composition) !== tableCompositionKey(derived)
      ? derived
      : null;

  const turn = useCallback(() => {
    if (!pending) return;
    setPinned(pending);
  }, [pending]);

  return { composition, pending, turn };
}
