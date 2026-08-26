'use client';

/**
 * F51 — one opener for the Drafting Room, shared by ⌘K's `This surface` row and
 * the Desk's `Begin` column.
 *
 * The Room has no standalone route without a proposal in hand, which is why
 * `desk-contents.tsx` filters `STUDIO_ROOMS` to `scope === 'global'` and its
 * `verbHandlers` assume no id is needed. A caller that holds a draft proposal
 * walks straight in; a caller that holds nothing gets the household picker —
 * the same doorway the `Draft a design agreement` verb already opens. That
 * fallback is the whole reason this is an opener rather than a label (C-AF-01).
 *
 * `navigate` is passed in rather than taken from `useRouter` so this stays a
 * plain function any surface can call from an event handler.
 */

import { openDraftProposalPicker } from '@/components/document/rooms/drafting/draft-proposal-opener';

export interface OpenDraftingRoomOptions {
  /** The draft proposal in hand, when the caller holds one. */
  proposalId?: string | null;
  /** Router push. Without it there is nothing to walk into, so the picker opens. */
  navigate?: (href: string) => void;
}

export function openDraftingRoom({
  proposalId,
  navigate,
}: OpenDraftingRoomOptions = {}): void {
  if (proposalId && navigate) {
    navigate(`/drafting/${proposalId}`);
    return;
  }
  openDraftProposalPicker();
}
