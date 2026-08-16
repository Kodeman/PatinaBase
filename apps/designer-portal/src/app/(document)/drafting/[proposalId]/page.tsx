'use client';

import { use } from 'react';
import { DraftingEstimateFlow } from '@/components/document/drafting/drafting-estimate-flow';
import { DraftingRoom } from '@/components/document/rooms/drafting/drafting-room';

/**
 * /drafting/[proposalId] (R42/R43) — the Drafting Room, a Room reached from a
 * draft proposal. The anti-wizard for authoring a proposal: eight self-saving
 * facets, the Strata Mark as the only progress, the client's copy mirrored in
 * the right rail. Unflagged — it rides the (document) layout (Drawer + ⌘K +
 * LogStrip persist above this Room), unconditional since the R21 dissolve (I109).
 */
export default function DraftingRoute({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = use(params);
  return (
    <>
      <DraftingRoom proposalId={proposalId} />
      <DraftingEstimateFlow proposalId={proposalId} />
    </>
  );
}
