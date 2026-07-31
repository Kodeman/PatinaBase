'use client';

/**
 * ProposalShareInstrument (Schedule & Boards Wave 2 · C2) — the quiet doorway
 * into the share-link sheet. Follows ProposalVersionHistory: owns its own
 * open-state, renders one tertiary DocumentAction, and mounts the ShareSheet as
 * a local-state overlay so the document beneath never unmounts (D1).
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ClientVisibilityTier } from '@patina/utils';
import { DocumentAction } from './document-action';
import { ShareSheet } from './overlays/share-sheet';
import { useMobileSecondaryAction } from './mobile/mobile-shell';

function MobileShareRegistration({ onOpen }: { onOpen: () => void }) {
  useMobileSecondaryAction({
    actionKey: 'share-proposal',
    label: 'Share client copy',
    onPress: onOpen,
  });
  return null;
}

export function ProposalShareInstrument({
  proposalId,
  tier,
  mobileSecondary = false,
}: {
  proposalId: string;
  tier?: ClientVisibilityTier | null;
  /** Publish this same instrument into MobileBar's existing More disclosure. */
  mobileSecondary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const openShare = () => setOpen(true);
  const shareSheet = (
    <ShareSheet
      proposalId={proposalId}
      tier={tier}
      open={open}
      onClose={() => setOpen(false)}
    />
  );

  return (
    <>
      {mobileSecondary && <MobileShareRegistration onOpen={openShare} />}
      <DocumentAction
        actionKey="share-proposal"
        variant="tertiary"
        onClick={openShare}
      >
        Share…
      </DocumentAction>
      {/* Drafting's head action lives in a desktop-only RoomShell wrapper.
          Portal the shared sheet for the mobile opt-in so opening it from More
          cannot inherit that wrapper's display:none. The trigger and overlay
          still share this one local open state. */}
      {mobileSecondary && typeof document !== 'undefined'
        ? createPortal(shareSheet, document.body)
        : shareSheet}
    </>
  );
}
