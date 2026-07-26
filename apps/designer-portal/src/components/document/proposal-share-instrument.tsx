'use client';

/**
 * ProposalShareInstrument (Schedule & Boards Wave 2 · C2) — the quiet doorway
 * into the share-link sheet. Follows ProposalVersionHistory: owns its own
 * open-state, renders one tertiary DocumentAction, and mounts the ShareSheet as
 * a local-state overlay so the document beneath never unmounts (D1).
 */

import { useState } from 'react';
import type { ClientVisibilityTier } from '@patina/utils';
import { DocumentAction } from './document-action';
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
      <DocumentAction
        actionKey="share-proposal"
        variant="tertiary"
        onClick={() => setOpen(true)}
      >
        Share…
      </DocumentAction>
      <ShareSheet
        proposalId={proposalId}
        tier={tier}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
