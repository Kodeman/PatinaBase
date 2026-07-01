'use client';

/**
 * The proposal letterhead instruments — gated to engagement_kind==='proposal'
 * and mounted in the Proposal/Direction section of the open document.
 *
 *   1. While a DRAFT: a quiet DOORWAY into the Drafting Room (D14) and the
 *      WORK BAND (R68) — a prominent, in-language CTA whose lead act swaps by
 *      state (Open the Drafting Room while composing, Send once ready). The
 *      Strata Mark is the SAME drafting fill the Room shows.
 *
 *   2. Once the proposal is OUT (sent / viewed / revised / accepted / expired /
 *      declined): the section BECOMES the "With the client" watch view
 *      (ProposalWatch, R71) — sent / opened / viewed / reading inline and front
 *      and center, since the document is parked in this state (or revisions of
 *      it) until the client advances it.
 *
 * Every overlay is local state over a DocSheet / full-screen layer — the
 * document beneath NEVER unmounts or resets (D1). Typography-first, zero
 * shadows (D4).
 */

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useProposal } from '@/hooks/use-proposals';
import { rememberRoomOrigin } from '@/lib/document/room-origin';
import { useDraftingState } from '@/hooks/use-drafting-state';
import { Instrument, InstrumentRow } from './instrument';
import { StrataMark } from './strata-mark';
import { SendSheet } from './overlays/send-sheet';
import { ProposalVersionHistory } from './proposal-version-history';
import { ProposalWatch } from './proposal-watch';

export function ProposalInstruments({
  proposalId,
  clientName,
}: {
  proposalId: string;
  clientName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal } = useProposal(proposalId) as { data: any };

  const [sendOpen, setSendOpen] = useState(false);
  // F6 (walk 2026-07): walking into the Room is a real transition, not an
  // instant swap — acknowledge the act and make it idempotent.
  const [entering, setEntering] = useState(false);

  const status: string = proposal?.status ?? 'draft';
  const isDraft = status === 'draft';
  // The shared drafting progress (the SAME mark the Drafting Room shows) — only
  // polled while a draft, used to weight "Draft" vs "Send" as the lead act.
  const { state: draftState, pct, fill } = useDraftingState(proposalId, isDraft);
  const readyToSend = draftState === 'Ready to send';

  // F6: the doorway is a <button> (D1 — documents carry no nav links), so
  // Next.js never prefetches the Room route the way a <Link> would. The push
  // then pays a cold route fetch with zero visual acknowledgment — which reads
  // as a dead click. Prefetch the Room while the draft band is showing so the
  // walk-in is immediate.
  useEffect(() => {
    if (isDraft) router.prefetch(`/drafting/${proposalId}`);
  }, [isDraft, proposalId, router]);

  // F6: if the navigation stalls (slow route fetch), release the act after a
  // beat so the doorway can be walked again instead of wedging on "Opening…".
  useEffect(() => {
    if (!entering) return;
    const t = setTimeout(() => setEntering(false), 8000);
    return () => clearTimeout(t);
  }, [entering]);

  /** Walk into the Drafting Room to compose. Stash the document we're leaving so
   *  the Room returns us here on exit (R39 / D14), then navigate. Idempotent:
   *  re-clicks while the transition is in flight don't re-fire the push (F6). */
  const enterDrafting = () => {
    if (entering) return;
    setEntering(true);
    rememberRoomOrigin(pathname);
    router.push(`/drafting/${proposalId}`);
  };

  // Out the door — the Proposal section becomes the watch view (R71). It carries
  // its own acts (Preview · Revise · Resend) and overlays.
  if (!isDraft) {
    return <ProposalWatch proposalId={proposalId} clientName={clientName} />;
  }

  // Draft — the Direction WORK BAND (R68): a draft is the work to be done, so it
  // earns a prominent, in-language CTA. One SOLID filled button; the non-lead act
  // steps back to a quiet mono second below. Flat: tint + fill, no shadow (D4).
  return (
    <>
      <div className="mt-1">
        <div
          className={`mb-2.5 flex items-center gap-4 rounded-[3px] px-4 py-3.5 transition-colors ${
            readyToSend ? 'bg-[rgba(168,181,160,0.16)]' : 'bg-[rgba(229,221,208,0.5)]'
          }`}
        >
          <StrataMark size="lg" fill={fill} label={`Drafting the proposal — ${pct}% written`} />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Drafting the proposal
            </p>
            <p className="mt-0.5 text-[14px] leading-snug text-[var(--color-charcoal)]">
              {pct === 0 ? (
                <>
                  <b>Not started yet</b> — open the Drafting Room to write it
                </>
              ) : readyToSend ? (
                <>
                  <b>Ready to send</b> — fully drafted
                </>
              ) : (
                <>
                  <b>A draft taking shape</b> · {pct}% written — keep going
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            aria-busy={entering || undefined}
            onClick={() => {
              if (entering) return;
              if (readyToSend) setSendOpen(true);
              else enterDrafting();
            }}
            className="shrink-0 rounded-[4px] bg-[var(--color-clay)] px-4 py-2 text-[12px] font-medium text-[var(--color-charcoal)] transition-opacity hover:opacity-90"
          >
            {entering
              ? 'Opening…'
              : readyToSend
                ? 'Send the proposal →'
                : 'Open the Drafting Room →'}
          </button>
        </div>

        {/* The quiet second — the non-lead act stays a mono micro-action; the
            version chain stays reachable (you draft v2 BECAUSE of v1). */}
        <InstrumentRow>
          {readyToSend ? (
            <Instrument variant="secondary" onClick={enterDrafting}>
              Keep drafting
            </Instrument>
          ) : (
            <Instrument variant="secondary" onClick={() => setSendOpen(true)}>
              Send the proposal
            </Instrument>
          )}
          <ProposalVersionHistory proposalId={proposalId} />
        </InstrumentRow>
      </div>

      {/* Send — the charcoal DocSheet over the open Proposal (D1). */}
      <SendSheet proposalId={proposalId} open={sendOpen} onClose={() => setSendOpen(false)} />
    </>
  );
}
