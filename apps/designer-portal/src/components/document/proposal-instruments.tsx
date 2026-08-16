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
}: {
  proposalId: string;
  clientName: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal } = useProposal(proposalId) as { data: any };
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
      />
      {experience === 'design_services' ? (
        <ServiceAgreementInstruments proposal={proposal} clientName={clientName} />
      ) : (
        <LegacyProposalInstruments
          proposalId={proposalId}
          clientName={clientName}
          proposal={proposal}
        />
      )}
    </>
  );
}

const fmtDayShort = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(iso),
  );

/** "today" / "yesterday" / "3 days ago" — the register a wall is read in. */
function daysAgoPhrase(days: number | null): string | null {
  if (days === null || days < 0) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * SP3 — the send wall's state line. Between the send and the seal the paper
 * always says where the agreement stands and what can be done about it; before
 * this, a designer could look at a sent proposal and read only figures.
 *
 * `commercialState` is the design-services rail's own lifecycle
 * (proposals.commercial_state, 00412/00477). It has to be consulted because a
 * client's signature moves THAT column while proposals.status stays 'sent' —
 * offering a nudge to a household that has already signed would be a lie the
 * watch model alone cannot catch.
 */
function SendWallLine({
  proposalId,
  clientName,
  commercialState,
}: {
  proposalId: string;
  clientName: string;
  commercialState: string | null;
}) {
  const { watch: w } = useProposalWatch(proposalId);
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

  // A draft has no wall yet; a seal speaks for itself; and an executed or
  // terminal commercial edition is stated in full by the block below.
  if (!w || w.settled || (!w.awaitingClient && !w.terminal)) return null;
  if (
    commercialState === 'executed' ||
    commercialState === 'declined' ||
    commercialState === 'expired' ||
    commercialState === 'superseded'
  ) {
    return null;
  }

  const countersignPending = commercialState === 'client_signed';
  const canNudge = w.canNudge && !countersignPending;

  const ago = daysAgoPhrase(w.awaitingDays);
  // 00477's paper door issues without sending, so sent_at is legitimately null.
  const sentText = w.sentAt
    ? ago
      ? `Sent ${ago}`
      : `Sent ${fmtDayShort(w.sentAt)}`
    : 'Issued on paper';

  let stateWord: string | null = null;
  if (w.status === 'declined') stateWord = 'declined by the client';
  else if (w.status === 'expired') stateWord = 'expired unsigned';
  else if (w.status === 'revised') stateWord = 'superseded by a newer version';
  else if (!canNudge && w.lastNudgedAt && !countersignPending) {
    stateWord = `nudged ${fmtDayShort(w.lastNudgedAt)}`;
  } else if (!canNudge) stateWord = 'awaiting countersign';

  return (
    <>
      <DocumentActionRow
        surfaceKey="open-document"
        regionKey="proposal-send-wall"
        className="mt-1"
        aria-label="Proposal state"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
          {sentText} —
        </span>
        {canNudge && (
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
        {stateWord && (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {stateWord}
          </span>
        )}
      </DocumentActionRow>
      {note && (
        <p
          role={note.tone === 'err' ? 'alert' : 'status'}
          className="font-mono text-[10px] uppercase tracking-[0.06em]"
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
}: {
  proposalId: string;
  clientName: string;
  proposal: any;
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
    return <ProposalWatch proposalId={proposalId} clientName={clientName} />;
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
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
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
