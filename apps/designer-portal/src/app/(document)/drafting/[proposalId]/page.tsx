'use client';

import { use } from 'react';
import { DraftingRoom } from '@/components/document/rooms/drafting/drafting-room';

/**
 * /drafting/[proposalId] (R42/R43) — the Drafting Room, a Room reached from a
 * draft proposal. The anti-wizard for authoring a proposal: eight self-saving
 * facets, the Strata Mark as the only progress, the client's copy mirrored in
 * the right rail. Behind the-document-pilot via the (document) layout (Drawer
 * + ⌘K + LogStrip persist above this Room).
 */
export default function DraftingRoute({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = use(params);
  return <DraftingRoom proposalId={proposalId} />;
}
