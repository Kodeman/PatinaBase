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
 *   3. SP3 — the send wall is never silent. Whichever wall renders below (the
 *      legacy watch or the design-services status block), one scored state line
 *      opens it: how long it has been out, and the verb that is actually
 *      available — or the state word when none is. The nudge lives HERE and
 *      nowhere else on this wall, so the word is printed once.
 *
 * Every overlay is local state over a DocSheet / full-screen layer — the
 * document beneath NEVER unmounts or resets (D1). Typography-first, zero
 * shadows (D4).
 */

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useNudgeProposal, useProposal } from '@/hooks/use-proposals';
import { useProposalWatch } from '@/hooks/use-proposal-watch';
import { familyLabel } from '@/lib/document/family-label';
import {
  deriveSendWallLine,
  sendWallStateWord,
} from '@/lib/document/proposal-watch-derivation';
import { useFinalizeLeader } from '@/hooks/use-finalize-leader';
import { rememberRoomOrigin } from '@/lib/document/room-origin';
import { useDraftingState } from '@/hooks/use-drafting-state';
import { displayDraftingState } from '@/lib/document/drafting-progress';
import {
  DocumentAction,
  DocumentActionGroup,
  DocumentActionRow,
} from './document-action';
import { StrataMark } from './strata-mark';
import { ProposalVersionHistory } from './proposal-version-history';
import { ProposalShareInstrument } from './proposal-share-instrument';
import { ProposalWatch } from './proposal-watch';
import { useMobilePrimaryAction } from './mobile/mobile-shell';
import { commercialDocumentExperience } from '@/lib/document/commercial-documents';
import { ServiceAgreementInstruments } from './commercial/service-agreement-instruments';
import { MOBILE_ACTION_PRIORITY } from './mobile/lifecycle-mobile-action';

export function ProposalInstruments({
  proposalId,
  clientName,
  onFinalizeTable = false,
}: {
  proposalId: string;
  clientName: string;
  /** W4a — the Finalize table's head has promoted one of these acts to the
   *  table's one inked leader. The wall reads the SAME derivation off the same
   *  cached reads (never a second answer) and stands that one act down, so the
   *  verb is offered once. False everywhere else, flag off included. */
  onFinalizeTable?: boolean;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal } = useProposal(proposalId) as { data: any };
  const { leader } = useFinalizeLeader(proposalId, clientName);
  const hoistedLeader = onFinalizeTable ? (leader?.kind ?? null) : null;
  const experience = commercialDocumentExperience(proposal?.document_kind);
  if (experience === 'commercial_readonly') {
    return (
      <p className="mt-2 border-l-2 border-[var(--color-aged-oak)] pl-3 text-[12px] text-[var(--text-muted)]">
        This commercial edition is read-only here — open it from the
        project&rsquo;s authorizations ledger.
      </p>
    );
  }
  return (
    <>
      <SendWallLine
        proposalId={proposalId}
        clientName={clientName}
        commercialState={
          typeof proposal?.commercial_state === 'string'
            ? proposal.commercial_state
            : null
        }
        issuedOnPaper={proposal?.issued_on_paper === true}
        nudgeHoisted={hoistedLeader === 'nudge'}
      />
      {experience === 'design_services' ? (
        <ServiceAgreementInstruments proposal={proposal} clientName={clientName} />
      ) : (
        <LegacyProposalInstruments
          proposalId={proposalId}
          clientName={clientName}
          proposal={proposal}
          hoistedLeader={hoistedLeader}
          onFinalizeTable={onFinalizeTable}
        />
      )}
    </>
  );
}

/**
 * SP3 — the send wall's state line: a thin renderer over `deriveSendWallLine`.
 * Every rule about which verb is offered, which state word is named, and when
 * the wall stands down lives in the derivation, where the
 * status × commercial_state × issued_on_paper matrix is covered by a spec.
 */
function SendWallLine({
  proposalId,
  clientName,
  commercialState,
  issuedOnPaper,
  nudgeHoisted = false,
}: {
  proposalId: string;
  clientName: string;
  commercialState: string | null;
  issuedOnPaper: boolean;
  /** The table's leader is already offering this nudge — the SAME decision,
   *  read once (deriveSendWallLine). The line keeps its fact and drops the
   *  verb rather than printing the act twice, and names the state it is in
   *  where the verb stood. */
  nudgeHoisted?: boolean;
}) {
  const { watch } = useProposalWatch(proposalId);
  const nudge = useNudgeProposal();
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'warn' | 'err' } | null>(
    null,
  );

  const family = familyLabel(clientName);
  const onNudge = async () => {
    setNote(null);
    try {
      const res = await nudge.mutateAsync({ proposalId });
      setNote(
        res._emailDispatched
          ? { text: `Reminder sent to ${family}.`, tone: 'ok' }
          : {
              text: 'Nudge recorded, but the email couldn’t be sent — follow up directly.',
              tone: 'warn',
            },
      );
    } catch (e) {
      setNote({
        text: e instanceof Error ? e.message : 'Could not send the reminder.',
        tone: 'err',
      });
    }
  };

  const line = watch
    ? deriveSendWallLine({ watch, commercialState, issuedOnPaper }, new Date())
    : null;
  if (!line) return null;
  const standDown = nudgeHoisted && line.verb === 'nudge';
  // The head took the verb, not the news. `deriveSendWallLine` names no state
  // while it is offering an act (exactly one of the two prints), so the line
  // asks for the state word itself here — otherwise it reads "Sent 5 days ago"
  // and stops, over a row with nothing in it.
  const stateWord =
    line.stateWord ??
    (standDown && watch ? sendWallStateWord(watch, commercialState) : null);

  return (
    <>
      {/* The proposal stage's act lands on the wall, ~200px below the guide
          strip that offers it (`document-guide.ts`). DocumentActionRow states
          no `id` of its own, so the anchor is the wrapper. */}
      <div id="proposal-send-wall" tabIndex={-1} className="scroll-mt-16">
      <DocumentActionRow
        surfaceKey="open-document"
        regionKey="proposal-send-wall"
        className="mt-1"
        aria-label="Proposal state"
      >
        {/* W5-R5 §4 (N4) — the lead sentence is GONE. `SENT 7 DAYS AGO —`
            restates the proposal head's own status line and the band's line 2,
            which SP-12 forbids: one fact, one printing.

            The ROW and its `#proposal-send-wall` anchor stay, and so does the
            act: `document-guide.ts`'s `SEND_WALL_ANCHOR_ID` sends the reader
            here for exactly this act, so removing the row outright would land
            the guide on nothing. The restatement is what the ruling objects
            to; the destination is not. Flagged for the design lead. */}
        {!standDown && line.verb === 'nudge' && (
          <DocumentAction
            actionKey="nudge-client"
            variant="secondary"
            loading={nudge.isPending}
            loadingLabel="Nudging…"
            onClick={onNudge}
          >
            Nudge {family}
          </DocumentAction>
        )}
        {/* NOT a restatement: this prints only when the act has STOOD DOWN
            because the table's head took it (`standDown`), and it is then the
            only thing in the row. Removing it left an empty row. */}
        {stateWord && (
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {stateWord}
          </span>
        )}
      </DocumentActionRow>
      </div>
      {note && (
        <p
          role={note.tone === 'err' ? 'alert' : 'status'}
          className="font-mono text-[11px] uppercase tracking-[0.06em]"
          style={{
            color:
              note.tone === 'ok'
                ? 'var(--color-sage)'
                : note.tone === 'warn'
                  ? 'var(--color-aged-oak)'
                  : '#C77B6E',
          }}
        >
          {note.text}
        </p>
      )}
    </>
  );
}

function LegacyProposalInstruments({
  proposalId,
  clientName,
  proposal,
  hoistedLeader = null,
  onFinalizeTable = false,
}: {
  proposalId: string;
  clientName: string;
  proposal: any;
  hoistedLeader?: 'nudge' | 'preview' | 'resend' | null;
  onFinalizeTable?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // F6 (walk 2026-07): walking into the Room is a real transition, not an
  // instant swap — acknowledge the act and make it idempotent.
  const [entering, setEntering] = useState(false);

  const status: string = proposal?.status ?? 'draft';
  const isDraft = status === 'draft';
  // The shared drafting progress (the SAME mark the Drafting Room shows) — only
  // polled while a draft, used to weight "Draft" vs "Send" as the lead act.
  const {
    state: draftState,
    pct,
    fill,
  } = useDraftingState(proposalId, isDraft);
  // No new legacy sending, so this no longer drives an act — only the tint
  // and the label below, sharing the Drafting Room's same rewording.
  const fullyDrafted = draftState === 'Ready to send';

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

  useMobilePrimaryAction(
    isDraft
      ? {
          actionKey: 'continue-drafting',
          surfaceKey: 'open-document',
          regionKey: 'proposal-draft-actions',
          label: 'Continue drafting',
          target: {
            kind: 'press',
            onPress: () => {
              if (entering) return;
              enterDrafting();
            },
          },
          loading: entering,
        }
      : null,
    { priority: MOBILE_ACTION_PRIORITY.lifecycle },
  );

  // Out the door — the Proposal section becomes the watch view (R71). It carries
  // its own acts (Preview · Resend) and overlays.
  if (!isDraft) {
    return (
      <ProposalWatch
        proposalId={proposalId}
        clientName={clientName}
        hoistedLeader={hoistedLeader}
        onFinalizeTable={onFinalizeTable}
      />
    );
  }

  // Legacy retirement: no new legacy sending. A draft here is either a
  // project-bound furnishing draft (it reaches the client only inside a
  // named furnishings authorization released from the schedule, see
  // project-commerce) or an orphan legacy draft that stays editable but is
  // no longer sendable — new client-facing agreements start as design
  // agreements.
  const modelNote = proposal?.project_id
    ? 'This selection reaches your client as part of a furnishings authorization from the project page.'
    : 'New client work begins with a design agreement — this earlier-format draft stays for your records.';

  // Draft — the Direction WORK BAND (R68): a draft is the work to be done, so it
  // earns a prominent, in-language CTA. One SOLID filled button. Flat: tint +
  // fill, no shadow (D4).
  return (
    <>
      <DocumentActionGroup
        surfaceKey="open-document"
        regionKey="proposal-draft-actions"
        className="mt-1 !block"
        aria-label="Draft proposal actions"
      >
        <div
          className={`mb-2.5 flex items-center gap-4 rounded-[3px] px-4 py-3.5 transition-colors ${
            fullyDrafted
              ? 'bg-[rgba(168,181,160,0.16)]'
              : 'bg-[rgba(229,221,208,0.5)]'
          }`}
        >
          <StrataMark
            size="lg"
            fill={fill}
            label={`Drafting the proposal — ${pct}% written`}
          />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Drafting the proposal
            </p>
            <p className="mt-0.5 text-[14px] leading-snug text-[var(--color-charcoal)]">
              {pct === 0 ? (
                <>
                  <b>Not started yet</b> — open the Drafting Room to write it
                </>
              ) : fullyDrafted ? (
                <>
                  <b>{displayDraftingState(draftState)}</b> — every facet is written
                </>
              ) : (
                <>
                  <b>A draft taking shape</b> · {pct}% written — keep going
                </>
              )}
            </p>
          </div>
          <DocumentAction
            actionKey="continue-drafting"
            variant="primary"
            loading={entering}
            loadingLabel="Opening…"
            trailing="→"
            onClick={() => {
              if (entering) return;
              enterDrafting();
            }}
          >
            Continue drafting
          </DocumentAction>
        </div>

        <DocumentActionRow
          surfaceKey="open-document"
          regionKey="proposal-draft-actions"
          aria-label="Other proposal actions"
        >
          <ProposalShareInstrument
            proposalId={proposalId}
            tier={proposal?.client_visibility_tier}
          />
          <ProposalVersionHistory proposalId={proposalId} />
        </DocumentActionRow>
      </DocumentActionGroup>

      <p className="mt-2 border-l-2 border-[var(--color-aged-oak)] pl-3 text-[12px] text-[var(--text-muted)]">
        {modelNote}
      </p>
    </>
  );
}
