'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  getProposalAutosaveSnapshot,
  subscribeToProposalAutosaves,
} from '@/lib/proposal-autosave-registry';

export function useProposalAutosaveBarrier(proposalId: string) {
  const subscribe = useCallback(
    (listener: () => void) =>
      subscribeToProposalAutosaves(proposalId, listener),
    [proposalId],
  );
  const getSnapshot = useCallback(
    () => getProposalAutosaveSnapshot(proposalId),
    [proposalId],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
