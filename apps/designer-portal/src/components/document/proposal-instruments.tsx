'use client';

/**
 * The proposal letterhead instruments — the proposal-grain sibling of the
 * project's LetterheadInstruments (R27), gated to engagement_kind==='proposal'
 * and mounted in the Proposal/Direction section of the open document.
 *
 * Two affordances live here, and only here:
 *
 *   1. A quiet DOORWAY (status='draft' only) that walks INTO the Drafting Room
 *      to compose the proposal. Same grammar as the Library doorway (D14): a
 *      three-line Strata spine-tick + "↗", reachable ONLY here (no nav link).
 *      On click it stashes the surface we're leaving (rememberRoomOrigin) so
 *      the Room returns us to this exact document, then navigates.
 *
 *   2. The instrument row mounting the Phase-2 send/revise overlays:
 *        · draft                          → "Send to the [clients]" (SendSheet)
 *        · sent/viewed/accepted/revised   → "Preview as the [clients]" (the
 *            proposal-grain client mirror, full-screen under a thin charcoal
 *            banner), "Request a change → Revise" (ReviseSheet; on v2 opened we
 *            route to the new draft's document), and the version-history strip.
 *
 * Every overlay is local state over a DocSheet / full-screen layer — the
 * document beneath NEVER unmounts or resets (D1). Typography-first, zero
 * shadows (D4).
 */

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useProposal } from '@/hooks/use-proposals';
import { rememberRoomOrigin } from '@/lib/document/room-origin';
import { familyLabel } from '@/lib/document/family-label';
import { useDraftingState } from '@/hooks/use-drafting-state';
import { Instrument, InstrumentRow } from './instrument';
import { SendSheet } from './overlays/send-sheet';
import { ReviseSheet } from './overlays/revise-sheet';
import { ProposalVersionHistory } from './proposal-version-history';
import { ProposalPreviewRail } from './drafting/proposal-mirror';

export function ProposalInstruments({
  proposalId,
  clientName,
}: {
  proposalId: string;
  clientName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: proposal } = useProposal(proposalId) as { data: any };

  const [sendOpen, setSendOpen] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const family = familyLabel(clientName);
  const status: string = proposal?.status ?? 'draft';
  const isDraft = status === 'draft';
  // The shared drafting progress (the SAME mark the Drafting Room shows) — only
  // polled while a draft, used to weight "Draft" vs "Send" as the lead act.
  const { state: draftState, pct } = useDraftingState(proposalId, isDraft);
  const readyToSend = draftState === 'Ready to send';
  // The live set: in the client's hands or settled — Preview · Revise (+ Send
  // again is unnecessary; the chain is already out there).
  const isLive = status === 'sent' || status === 'viewed' || status === 'accepted' || status === 'revised';
  // The terminal set (G2 / R63): an expired or declined proposal is no longer
  // in anyone's hands, but the engagement is still live on the Desk ("Proposal
  // expired — revise or follow up"). It must offer a way back in:
  // Preview (read what they last saw) · Resend (send_proposal re-sends with a
  // fresh expiry — 00176 doesn't gate on draft) · Revise (clone → new draft).
  const isTerminal = status === 'expired' || status === 'declined';

  /** Walk into the Drafting Room to compose. Stash the document we're leaving
   *  so the Room returns us here on exit (R39 / D14), then navigate — the held
   *  document puts itself down through the normal unmount flow. */
  const enterDrafting = () => {
    rememberRoomOrigin(pathname);
    router.push(`/drafting/${proposalId}`);
  };

  return (
    <>
      {/* Draft — ONE weighted lead act that swaps by drafting state (R68): while
          composing, the Drafting-Room doorway leads; once Ready to send, "Send
          the proposal" promotes and "keep drafting" steps back. Emphasis is
          weight + colour, never chrome (D4). The state echo is the doorway's
          live read of how far along the draft is. */}
      {isDraft && (
        <div className="mt-1">
          <InstrumentRow>
            {readyToSend ? (
              <>
                <Instrument variant="primary" trailing="→" onClick={() => setSendOpen(true)}>
                  Send the proposal
                </Instrument>
                <Instrument variant="secondary" onClick={enterDrafting}>
                  Keep drafting
                </Instrument>
              </>
            ) : (
              <>
                <Instrument variant="doorway" trailing="↗" onClick={enterDrafting}>
                  {pct === 0 ? 'Start the proposal' : 'Draft the proposal'}
                </Instrument>
                <Instrument variant="secondary" onClick={() => setSendOpen(true)}>
                  Send the proposal
                </Instrument>
              </>
            )}
            {/* You draft v2 BECAUSE of v1 — keep the chain reachable while drafting. */}
            <ProposalVersionHistory proposalId={proposalId} />
          </InstrumentRow>
          <p className="mt-1 text-[10px] italic text-[var(--text-muted)]">
            {pct === 0
              ? 'Nothing drafted yet — open the Drafting Room to begin.'
              : readyToSend
                ? 'Fully drafted — ready to send.'
                : `${pct}% drafted · keep going in the Drafting Room.`}
          </p>
        </div>
      )}

      {/* In the client's hands or settled — Preview · Revise are quiet seconds. */}
      {isLive && (
        <InstrumentRow className="mt-1">
          <Instrument variant="secondary" onClick={() => setPreviewOpen(true)}>
            Preview as {family}
          </Instrument>
          <Instrument variant="secondary" onClick={() => setReviseOpen(true)}>
            Request a change · Revise
          </Instrument>
          {/* The version chain reads itself; renders nothing for a v1-only chain. */}
          <ProposalVersionHistory proposalId={proposalId} />
        </InstrumentRow>
      )}

      {/* Terminal (expired/declined) — R63/R65. REVISE is the primary act
          (a superseding new version via clone_proposal); Preview and Resend
          are quiet seconds. Resend re-opens the SAME proposal via send_proposal
          (which doesn't gate on draft): the SendSheet sets a fresh expiry. */}
      {isTerminal && (
        <InstrumentRow className="mt-1">
          <Instrument variant="primary" trailing="→" onClick={() => setReviseOpen(true)}>
            Revise
          </Instrument>
          <Instrument variant="secondary" onClick={() => setPreviewOpen(true)}>
            Preview as {family}
          </Instrument>
          <Instrument variant="secondary" onClick={() => setSendOpen(true)}>
            Resend · new expiry
          </Instrument>
          <ProposalVersionHistory proposalId={proposalId} />
        </InstrumentRow>
      )}

      {/* Send — the charcoal DocSheet over the open Proposal (D1). */}
      <SendSheet proposalId={proposalId} open={sendOpen} onClose={() => setSendOpen(false)} />

      {/* Revise — opens v2 as a fresh draft and routes the document beneath to
          it (a new proposal_id ⇒ a new document URL), never an unmount-in-place. */}
      <ReviseSheet
        proposalId={proposalId}
        open={reviseOpen}
        onClose={() => setReviseOpen(false)}
        onOpened={(newProposalId) => router.push(`/doc/${newProposalId}`)}
      />

      {/* Preview as the client — the proposal-grain mirror (R43), full-screen
          under a thin charcoal banner. Read-only by construction; the document
          beneath stays mounted behind it. */}
      {previewOpen && (
        <ProposalPreview
          proposalId={proposalId}
          clientName={clientName}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}

/** The "Preview as the [clients]" full-screen layer. Reuses the proposal-grain
 *  mirror rail and the client-mirror's banner frame so the two previews read
 *  as one session. Esc closes here (stops the document's put-down handler).
 *  Exported so the (pre-project) letterhead's "View as the client" can mount
 *  the same proposal-grain mirror when there is no project to mirror (R63). */
export function ProposalPreview({
  proposalId,
  clientName,
  onClose,
}: {
  proposalId: string;
  clientName: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`What ${clientName} sees`}
      data-testid="proposal-preview"
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--doc-paper)]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      {/* The thin charcoal banner — same frame as the project mirror. */}
      <div className="flex items-baseline justify-between bg-[var(--color-charcoal)] px-7 py-2">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.75)]">
          You&rsquo;re seeing what they see
        </p>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--color-clay)] hover:opacity-80"
        >
          ← Back to your copy
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-8 min-[980px]:px-16">
        <ProposalPreviewRail proposalId={proposalId} clientName={clientName} />
      </div>
    </div>
  );
}
