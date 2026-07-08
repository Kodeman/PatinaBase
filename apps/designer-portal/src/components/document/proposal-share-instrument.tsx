'use client';

/**
 * ProposalShareInstrument (Schedule & Boards Wave 2 · C2) — the quiet doorway
 * into the share-link sheet. Follows ProposalVersionHistory: owns its own
 * open-state, renders one in-line mono Instrument, and mounts the ShareSheet as
 * a local-state overlay so the document beneath never unmounts (D1).
 */

import { useState } from 'react';
import type { ClientVisibilityTier } from '@patina/utils';
import { Instrument } from './instrument';
import { ShareSheet } from './overlays/share-sheet';

export function ProposalShareInstrument({
  proposalId,
  tier,
}: {
  proposalId: string;
  tier?: ClientVisibilityTier | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Instrument variant="secondary" onClick={() => setOpen(true)}>
        Share…
      </Instrument>
      <ShareSheet proposalId={proposalId} tier={tier} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
