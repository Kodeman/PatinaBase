'use client';

/**
 * The client's copy — the Drafting Room's ≥1440 right rail (ProposalPreviewRail,
 * R43), re-homed as a shelf leaf when the Room becomes a press (amendment A3).
 * It is the same live rail, the same component, the same read: what the client
 * is looking at, beside the paper the studio is looking at.
 *
 * Below 1440 no leaf exists at all — the shelf panel is display:none by
 * construction there — and the capability keeps the form it has always had:
 * the watch's "Preview as {family}" act, which opens the copy full-screen.
 */

import { ProposalPreviewRail } from '../drafting/proposal-mirror';
import { ShelfNote } from './shelf-parts';

export function ClientCopyLeaf({
  proposalId,
  clientName,
}: {
  proposalId: string;
  clientName?: string;
}) {
  return (
    <>
      <ShelfNote>
        What {clientName?.trim() ? clientName : 'the client'} is looking at,
        live.
      </ShelfNote>
      <div className="rounded-[10px] border border-[var(--doc-ink-border)] bg-white px-4 py-4">
        <ProposalPreviewRail proposalId={proposalId} clientName={clientName} />
      </div>
    </>
  );
}
