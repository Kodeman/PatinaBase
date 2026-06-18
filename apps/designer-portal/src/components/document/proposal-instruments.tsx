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

import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useProposal } from '@/hooks/use-proposals';
import { rememberRoomOrigin } from '@/lib/document/room-origin';
import { SendSheet } from './overlays/send-sheet';
import { ReviseSheet } from './overlays/revise-sheet';
import { ProposalVersionHistory } from './proposal-version-history';
import { ProposalPreviewRail } from './drafting/proposal-mirror';

const instrumentCls =
  'font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--color-clay)]';

/** "the Whitfields" from a client name; falls back to the raw name. Local to
 *  the proposal instruments — mirrors the project letterhead's family label. */
function useFamilyLabel(clientName: string): string {
  return useMemo(() => {
    const parts = clientName.trim().split(/\s+/);
    const surname = parts[parts.length - 1];
    return surname && surname.toLowerCase() !== 'client' ? `the ${surname}s` : clientName;
  }, [clientName]);
}

/** The doorway spine-tick (D14): three diminishing clay lines marking "a place
 *  you walk into" — identical grammar to the Library's drawer doorway. */
function DoorwayTick() {
  return (
    <span aria-hidden className="inline-flex flex-col gap-[2px]">
      <i className="block h-[2px] w-[15px] rounded-[1px] bg-[var(--color-clay)]" />
      <i className="block h-[2px] w-[11px] rounded-[1px] bg-[var(--color-clay)] opacity-60" />
      <i className="block h-[2px] w-[7px] rounded-[1px] bg-[var(--color-clay)] opacity-30" />
    </span>
  );
}

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

  const familyLabel = useFamilyLabel(clientName);
  const status: string = proposal?.status ?? 'draft';
  const isDraft = status === 'draft';
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
      {/* The instrument row — one quiet DM-mono line under the letterhead. */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {/* The doorway into the Drafting Room — a draft is still being written.
            Distinct from the flat instruments: it wears the Strata tick + ↗. */}
        {isDraft && (
          <button
            type="button"
            onClick={enterDrafting}
            className="inline-flex items-center gap-[0.4rem] text-[var(--text-muted)] transition-colors hover:text-[var(--color-clay)]"
          >
            <DoorwayTick />
            <span className="font-mono text-[9px] uppercase tracking-[0.08em]">
              Into the Drafting Room
            </span>
            <span aria-hidden className="font-mono text-[10px] text-[var(--color-clay)] opacity-70">
              ↗
            </span>
          </button>
        )}

        {isDraft && (
          <button type="button" onClick={() => setSendOpen(true)} className={instrumentCls}>
            Send to {familyLabel}
          </button>
        )}

        {isLive && (
          <>
            <button type="button" onClick={() => setPreviewOpen(true)} className={instrumentCls}>
              Preview as {familyLabel}
            </button>
            <button type="button" onClick={() => setReviseOpen(true)} className={instrumentCls}>
              Request a change &middot; Revise
            </button>
            {/* The version chain reads itself; renders nothing for a v1-only
                chain (its own guard). */}
            <ProposalVersionHistory proposalId={proposalId} />
          </>
        )}

        {/* Terminal (expired/declined) — R63. Preview · Resend · Revise. Resend
            re-opens the SAME proposal via send_proposal (which doesn't gate on
            draft): the SendSheet lets the designer set a fresh expiry, flipping
            it back to 'sent'. Revise opens a clean v+1 draft instead. */}
        {isTerminal && (
          <>
            <button type="button" onClick={() => setPreviewOpen(true)} className={instrumentCls}>
              Preview as {familyLabel}
            </button>
            <button type="button" onClick={() => setSendOpen(true)} className={instrumentCls}>
              Resend &middot; new expiry
            </button>
            <button type="button" onClick={() => setReviseOpen(true)} className={instrumentCls}>
              Revise
            </button>
            <ProposalVersionHistory proposalId={proposalId} />
          </>
        )}
      </div>

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
