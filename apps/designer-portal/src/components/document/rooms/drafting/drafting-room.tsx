'use client';

/**
 * The Drafting Room (R42 / R43) — the anti-wizard for authoring a proposal.
 * A new RoomShell tenant that clones the Composing Page's pattern (R40): a
 * detailed process rendered as a paper artifact that BUILDS ITSELF. The eight
 * facets of a proposal — Rooms · FF&E · Palette · Boards · Phases · Exclusions
 * · Payments · Terms — fill in ANY order, each hosting the PROVEN legacy
 * scope-builder editor (all proposalId-addressed and self-persisting). The
 * proposal is always a real draft; there is no Save button gate, no tab strip,
 * no stepper, no "Step N of 8".
 *
 * The Strata Mark (R35) is the ONLY progress indicator there is. The three
 * movements map to the three lines, and the state reads Outline → Drafting →
 * Ready to send off the same fill (drafting-progress.ts):
 *   · line 1 — SCOPE      (the rooms + what fills them)
 *   · line 2 — THE OFFER  (phases, exclusions, payments, terms)
 *   · line 3 — THE VISION (palette + boards)
 *
 * R43: the right rail mirrors what the CLIENT's copy carries as the designer
 * composes (ProposalPreviewRail — "Sarah's copy"). Two-column at 1440px+;
 * below that, the same live copy opens on demand in a DocSheet.
 *
 * A Room — full-bleed paper, zero shadows (D4); reuses RoomShell's physics.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  useProposal,
  useProposalFeedback,
  useScopeBuilderSummary,
  useUpdateProposalItem,
  type ProposalItemType,
} from '@patina/supabase';
import { latestVerdictByLine } from '@patina/utils';
import { RoomShell } from '../room-shell';
import { StrataMark } from '../../strata-mark';
import { StatusChip } from '../../status-chip';
import { ProposalShareInstrument } from '../../proposal-share-instrument';
import { verdictChipSpec } from '@/lib/document/verdict-chip';
import { FacetSection } from './facet-section';
import { ProposalPreviewRail } from '../../drafting/proposal-mirror';
import { DocSheet } from '../../overlays/doc-sheet';
import { SendSheet } from '../../overlays/send-sheet';
import {
  useDraftingState,
  useDraftingWritesPending,
} from '@/hooks/use-drafting-state';
import type { DraftingFacets } from '@/lib/document/drafting-progress';
import { familyLabel } from '@/lib/document/family-label';
import { clearRoomOrigin, readRoomOrigin } from '@/lib/document/room-origin';

// The eight legacy editors — proven, proposalId-addressed, self-persisting.
import { RoomsInScope } from '@/components/portal/scope-builder/rooms-in-scope';
import { FFEScheduleBuilder } from '@/components/portal/scope-builder/ffe-schedule-builder';
import { PaletteBuilder } from '@/components/portal/scope-builder/palette-builder';
import { BoardsBuilder } from '@/components/portal/scope-builder/boards-builder';
import { PhaseBuilder } from '@/components/portal/scope-builder/phase-builder';
import { ExclusionsList } from '@/components/portal/scope-builder/exclusions-list';
import { PaymentMilestonesBuilder } from '@/components/portal/scope-builder/payment-milestones-builder';
import { ChangeOrderTermsEditor } from '@/components/portal/scope-builder/change-order-terms-editor';
import { useDocumentSurface } from '@/lib/help-system/use-document-surface';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { TermsAgreementBody } from './terms-agreement-body';
import { ScheduleLineUnfold } from './schedule-line-unfold';
import type { ComposeDecisionRequest } from '@/lib/document/compose-decision';
import { ComposeDecisionSheet } from '@/components/document/coordination/compose-decision-sheet';
import { DocumentAction, DocumentActionGroup } from '../../document-action';
import { useMobilePrimaryAction } from '../../mobile/mobile-shell';
import { commercialDocumentExperience } from '@/lib/document/commercial-documents';
import { ServiceAgreementDraftingRoom } from './service-agreement-drafting-room';

const STATE_TONE: Record<string, { color: string; bg: string }> = {
  Outline: { color: 'var(--color-aged-oak)', bg: 'transparent' },
  Drafting: { color: '#b89a2e', bg: 'transparent' },
  'Ready to send': { color: 'var(--color-sage)', bg: 'rgba(168,181,160,0.12)' },
};

const MOVEMENT = {
  scope: 'var(--color-mocha)',
  offer: 'var(--color-clay)',
  vision: 'var(--color-dusty-blue)',
};

const num = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0;

// Cycle order for the FF&E type chip (R42): fixed → allowance → tbd → fixed.
const TYPE_ORDER: ProposalItemType[] = ['fixed', 'allowance', 'tbd'];
const TYPE_CHIP: Record<string, { label: string; mark: string }> = {
  fixed: {
    label: 'Fixed',
    mark: 'var(--color-sage)',
  },
  allowance: {
    label: 'Allowance',
    mark: 'var(--color-golden-hour)',
  },
  tbd: {
    label: 'TBD',
    mark: 'var(--color-aged-oak)',
  },
};

type DraftingFacetId = keyof DraftingFacets;

const DRAFTING_FACET_ORDER: DraftingFacetId[] = [
  'rooms',
  'ffe',
  'palette',
  'boards',
  'phases',
  'exclusions',
  'payments',
  'terms',
];

function firstIncompleteDraftingFacet(
  facets: DraftingFacets,
): DraftingFacetId {
  return DRAFTING_FACET_ORDER.find((id) => !facets[id]) ?? 'rooms';
}

export function DraftingRoom({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const {
    data: proposal,
    isLoading,
    error,
    refetch,
  } = useProposal(proposalId) as {
    data?: any;
    isLoading: boolean;
    error?: Error | null;
    refetch: () => unknown;
  };
  const experience = commercialDocumentExperience(proposal?.document_kind);
  const commercialState = proposal?.commercial_state ?? 'draft';

  useEffect(() => {
    if (
      proposal &&
      ((experience === 'legacy' && proposal.status !== 'draft') ||
        (experience === 'design_services' && commercialState !== 'draft') ||
        experience === 'commercial_readonly')
    ) {
      router.replace(`/doc/${proposalId}`);
    }
  }, [commercialState, experience, proposal, proposalId, router]);

  if (isLoading) {
    return <DraftingRoomGateMessage message="Opening the draft…" />;
  }

  if (error || !proposal) {
    return (
      <DraftingRoomGateMessage
        message="The draft could not be verified. Editing stays closed until it loads."
        action={
          <button
            type="button"
            onClick={() => void refetch()}
            className="doc-type-control underline underline-offset-4"
          >
            Retry
          </button>
        }
      />
    );
  }

  if (experience === 'commercial_readonly') {
    return (
      <DraftingRoomGateMessage message="This commercial edition is read-only in Wave 1. Returning to its document…" />
    );
  }

  if (
    (experience === 'legacy' && proposal.status !== 'draft') ||
    (experience === 'design_services' && commercialState !== 'draft')
  ) {
    return (
      <DraftingRoomGateMessage message="This commercial document has already been issued. Returning to its read-only document…" />
    );
  }

  if (experience === 'design_services') {
    return <ServiceAgreementDraftingRoom proposal={proposal} />;
  }

  return <DraftingRoomEditor proposalId={proposalId} proposal={proposal} />;
}

function DraftingRoomGateMessage({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="doc-type-body text-[var(--color-quiet-ink)]">{message}</p>
      {action}
    </div>
  );
}

function DraftingRoomEditor({
  proposalId,
  proposal,
}: {
  proposalId: string;
  proposal: any;
}) {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.drafting); // R89 — scope help to the Drafting Room
  const router = useRouter();
  const { data: summary } = useScopeBuilderSummary(proposalId);
  // The shared drafting state — the SAME ['drafting-facets', id] read the open
  // document's proposal instruments echo, so "what's written" agrees everywhere.
  const {
    facets,
    summary: s,
    items,
    fill,
    pct,
    state,
    gaps,
    isLoading: facetsLoading,
  } = useDraftingState(proposalId);
  const draftingWritePending = useDraftingWritesPending(proposalId);
  const updateItem = useUpdateProposalItem();
  const queryClient = useQueryClient();

  // C3 — the client's per-line verdicts, folded to the latest per line, so the
  // schedule can wear an approve / flag / note chip beside each row (no chip
  // when a line has no verdict). Shares the ['proposal-feedback', id] query with
  // the line unfold — one fetch.
  const { data: feedback = [] } = useProposalFeedback(proposalId);

  // C4 — escalate a flagged line to a client Decision. The Drafting Room is its
  // own route (no margin rail), so it hosts the composer itself. Available only
  // once the proposal has a project + client — the composer's existing contract.
  const composeProjectId = (proposal?.project_id as string | null) ?? null;
  const composeClientUserId = (proposal?.client_id as string | null) ?? null;
  const canComposeDecision = Boolean(composeProjectId && composeClientUserId);
  const [composeRequest, setComposeRequest] =
    useState<ComposeDecisionRequest | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // A1 — the Desk "N lines flagged" walk-in arrives at /drafting/<id>?flagged=1.
  // Read it client-side (no useSearchParams → no Suspense boundary needed) and
  // auto-open the oldest unresolved flag's line, its Alternatives band showing.
  const [arrivingFlagged, setArrivingFlagged] = useState(false);
  useEffect(() => {
    setArrivingFlagged(
      new URLSearchParams(window.location.search).get('flagged') === '1',
    );
  }, []);
  const firstFlaggedItemId = useMemo(() => {
    if (!arrivingFlagged) return undefined;
    const open = feedback.filter(
      (f) => f.verdict === 'rejected' && !f.resolved_at && f.proposal_item_id,
    );
    if (open.length === 0) return undefined;
    return (
      open.reduce((a, b) => (a.created_at <= b.created_at ? a : b))
        .proposal_item_id ?? undefined
    );
  }, [arrivingFlagged, feedback]);
  const latestVerdict = useMemo(
    () =>
      latestVerdictByLine(
        feedback.map((f) => ({
          lineId: f.proposal_item_id ?? '',
          verdict: f.verdict,
          createdAt: f.created_at,
          resolvedAt: f.resolved_at,
        })),
      ),
    [feedback],
  );
  const renderVerdictChip = (item: { id: string }) => {
    const v = latestVerdict.get(item.id);
    if (!v) return null;
    const spec = verdictChipSpec(v.verdict, v.resolvedAt);
    return spec ? <StatusChip label={spec.label} color={spec.color} /> : null;
  };

  // Payments needs the running total (Σ FF&E estimate + Σ design fees), like the
  // legacy shell computed for the milestone allocator.
  const totalProjectCents =
    num(summary?.totalFFEEstimateCents) + num(summary?.totalDesignFeeCents);

  const tone = STATE_TONE[state];

  // Keep exactly one facet in hand. Once the composite read resolves, returning
  // designers land directly in the first unfinished facet; their own selection
  // then stays put while the live query catches up with edits.
  const [activeFacet, setActiveFacet] = useState<DraftingFacetId | null>(null);
  const currentFacet = activeFacet ?? firstIncompleteDraftingFacet(facets);
  useEffect(() => {
    if (facetsLoading) return;
    setActiveFacet(
      (current) => current ?? firstIncompleteDraftingFacet(facets),
    );
  }, [facets, facetsLoading]);

  // The send flow lives IN the Room now (no need to leave to send): the head
  // action opens the SendSheet, weighted by readiness. On a successful send the
  // proposal is out, so we return to the document it lives in — which now shows
  // the "With the client" watch view.
  const returnToDocument = () => {
    const dest = readRoomOrigin();
    clearRoomOrigin();
    router.push(dest);
  };
  const openSend = () => {
    setPreviewOpen(false);
    setSendOpen(true);
  };
  const openPreview = () => {
    setSendOpen(false);
    setPreviewOpen(true);
  };
  const openComposeDecision = (request: ComposeDecisionRequest) => {
    setPreviewOpen(false);
    setSendOpen(false);
    setComposeRequest(request);
  };

  // The FF&E type-cycle chips read off the same facets query; cycling persists
  // via useUpdateProposalItem (which already recomputes line_total_cents).
  // useUpdateProposalItem invalidates the item-schedule key, NOT this composite,
  // so we invalidate it here too — otherwise the chip reads a stale item_type and
  // a second tap won't advance (fixed→allowance→TBD stalls). Await keeps the
  // chip, the Strata Mark, and the live preview in lockstep with each tap.
  const cycleType = async (id: string, current: ProposalItemType | null) => {
    const idx = TYPE_ORDER.indexOf((current ?? 'fixed') as ProposalItemType);
    const next = TYPE_ORDER[(idx + 1) % TYPE_ORDER.length];
    await updateItem.mutateAsync({
      itemId: id,
      proposalId,
      updates: { item_type: next },
    });
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['drafting-facets', proposalId],
      }),
      // Flip to/from TBD changes what the client sees (R43) — refresh the live
      // preview immediately rather than waiting for its poll tick.
      queryClient.invalidateQueries({
        queryKey: ['proposal-mirror', proposalId],
      }),
    ]);
  };

  const title = proposal?.title ?? proposal?.client_name ?? 'A proposal';

  const guide =
    pct === 0
      ? 'Start anywhere. Every facet saves into the same sendable draft.'
      : pct >= 100
        ? 'Ready to send. Every facet is written.'
        : `Still open: ${gaps.slice(0, 3).join(', ')}${gaps.length > 3 ? '…' : ''}. Choose any facet.`;

  // The Room's single head action: send the proposal. Weighted by readiness —
  // filled clay once fully drafted, a quiet outline ("send as-is") while still
  // composing (sending is never blocked, only weighted — mirrors the document's
  // non-hard-gate). Hidden at 0% — there's nothing to send yet.
  const clientLabel = proposal?.client_name
    ? familyLabel(proposal.client_name)
    : null;
  const readyToSend = state === 'Ready to send';
  const sendLabel = readyToSend
    ? `Send to ${clientLabel ?? 'the client'}`
    : 'Send as-is';

  useMobilePrimaryAction(
    pct > 0
      ? {
          actionKey: 'send-proposal',
          surfaceKey: 'drafting',
          regionKey: 'room-head',
          label: sendLabel,
          target: { kind: 'press', onPress: openSend },
        }
      : null,
  );

  const sendAction =
    pct > 0 ? (
      <DocumentAction
        actionKey="send-proposal"
        variant="primary"
        trailing="→"
        onClick={openSend}
      >
        {sendLabel}
      </DocumentAction>
    ) : undefined;

  return (
    <RoomShell
      title="The Drafting Room"
      count={pct > 0 ? `${pct}% drafted` : undefined}
      // C2 — the share instrument rides beside the send act in the head: a quiet
      // mono doorway into the tokenized share-link sheet (view-only client copy),
      // seeded from the proposal's client-visibility tier.
      action={
        <DocumentActionGroup
          surfaceKey="drafting"
          regionKey="room-head"
          aria-label="Drafting actions"
        >
          {sendAction}
          <ProposalShareInstrument
            proposalId={proposalId}
            tier={proposal?.client_visibility_tier}
            mobileSecondary
          />
        </DocumentActionGroup>
      }
      // S10: no backTo — leaving returns to the stashed origin (the document the
      // designer walked in from, "← the document"), not the legacy proposals route.
    >
      <div className="mx-auto max-w-[1240px] px-6 sm:px-8">
        {/* ── The proposal taking shape — the Strata Mark is the ONLY progress ── */}
        <section className="sticky top-[57px] z-[5] border-b border-[var(--doc-ink-border)] bg-[var(--doc-paper)] pb-4 pt-6">
          <div className="flex items-center gap-5">
            {/* The ONE Strata Mark — three movements map to the three lines. */}
            <StrataMark size="lg" fill={fill} />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-[1.5rem] leading-tight text-[var(--color-charcoal)]">
                {title}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span className="doc-type-meta tracking-[0.04em]">
                  <b className="font-heading text-[0.95rem] text-[var(--color-charcoal)]">
                    {pct}
                  </b>
                  % drafted
                </span>
                <span
                  className="doc-type-meta rounded-[3px] border px-2 py-0.5 uppercase tracking-[0.1em]"
                  style={{
                    color: tone.color,
                    borderColor: tone.color,
                    background: tone.bg,
                  }}
                >
                  {state}
                </span>
                <span className="doc-type-meta uppercase tracking-[0.08em] opacity-70">
                  Scope · The Offer · The Vision
                </span>
                <span
                  aria-live="polite"
                  className="font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]"
                >
                  {draftingWritePending ? 'Saving proposal changes…' : ''}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="doc-type-body min-w-[240px] flex-1 border-l-2 border-[var(--color-clay)] pl-3 text-[var(--color-quiet-ink)]">
              {guide}
            </p>
            <DocumentAction
              actionKey="preview-client-copy"
              surfaceKey="drafting"
              regionKey="drafting-progress"
              variant="secondary"
              className="min-[1440px]:hidden"
              onClick={openPreview}
            >
              Preview client copy
            </DocumentAction>
          </div>
        </section>

        {/* ── The live 360px copy stays permanent only where it does not crowd. ── */}
        <div className="grid gap-8 pt-6 min-[1440px]:grid-cols-[minmax(0,1fr)_360px]">
          {/* ── The facets — eight, in order, no tab strip, no stepper. ── */}
          <div>
            {/* Movement 1 · Scope */}
            <MovementRule
              name="Scope"
              meta="Line 1 · the rooms & what fills them"
              hue={MOVEMENT.scope}
            />

            <FacetSection
              name="Rooms"
              accent={MOVEMENT.scope}
              done={facets.rooms}
              status={
                facets.rooms
                  ? `${s?.rooms} room${s?.rooms === 1 ? '' : 's'} in scope`
                  : 'not yet written'
              }
              open={currentFacet === 'rooms'}
              onToggle={() => setActiveFacet('rooms')}
            >
              <RoomsInScope proposalId={proposalId} />
            </FacetSection>

            <FacetSection
              name="FF&E"
              accent={MOVEMENT.scope}
              done={facets.ffe}
              status={
                facets.ffe
                  ? `${s?.ffe} piece${s?.ffe === 1 ? '' : 's'} scheduled`
                  : 'no schedule yet'
              }
              open={currentFacet === 'ffe'}
              onToggle={() => setActiveFacet('ffe')}
            >
              {/* R42: tap-to-cycle the item type per piece (fixed → allowance →
                  tbd). The legacy editor has no inline type toggle, so this strip
                  exposes cycling without touching its internals. */}
              {items.length > 0 && (
                <div className="mb-4 rounded-[7px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] px-3 py-2.5">
                  <p className="doc-type-meta mb-2 font-semibold uppercase tracking-[0.08em]">
                    Tap a type to cycle it · fixed → allowance → tbd
                  </p>
                  <div className="flex flex-col gap-1">
                    {items.map((it) => {
                      const t = (it.item_type ?? 'fixed') as ProposalItemType;
                      const chip = TYPE_CHIP[t];
                      return (
                        <div
                          key={it.id}
                          className="flex items-center gap-3 border-b border-dashed border-[var(--color-pearl)] py-1 last:border-b-0"
                        >
                          <span className="doc-type-body min-w-0 flex-1 truncate text-[var(--color-charcoal)]">
                            {it.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => cycleType(it.id, it.item_type)}
                            disabled={updateItem.isPending}
                            aria-label={`Cycle ${it.name} type — currently ${chip.label}`}
                            className="da-score-hover doc-type-control inline-flex min-h-11 min-w-11 shrink-0 items-center gap-2 px-2 uppercase tracking-[0.06em] text-[var(--color-quiet-ink)] disabled:opacity-50"
                          >
                            <span
                              aria-hidden
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: chip.mark }}
                            />
                            {chip.label} ⟳
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* S5 — a row unfolds in place (Document grammar; the legacy
                  /portal host keeps pencil-edit only). D4 inside the paper: the
                  shared builder's bulk bar + filter popover carry shadow-lg in
                  the old zones — strip them here without touching them (R3),
                  the same move LineUnfold makes for the procurement panels. */}
              <div className="contents [&_.shadow-lg]:shadow-none [&_.shadow-xl]:shadow-none">
                <FFEScheduleBuilder
                  proposalId={proposalId}
                  initialUnfoldedId={firstFlaggedItemId}
                  renderUnfold={(item, fold) => (
                    <ScheduleLineUnfold
                      item={item}
                      proposalId={proposalId}
                      onFold={fold}
                      canComposeDecision={canComposeDecision}
                      onComposeDecision={openComposeDecision}
                    />
                  )}
                  renderVerdictChip={renderVerdictChip}
                />
              </div>
            </FacetSection>

            {/* Movement 3 · The Vision (palette + boards) — placed before the
                offer so the page reads scope → vision → commerce, but the lines
                still map by facet, not by order. */}
            <MovementRule
              name="The Vision"
              meta="Line 3 · palette & boards"
              hue={MOVEMENT.vision}
            />

            <FacetSection
              name="Palette"
              accent={MOVEMENT.vision}
              done={facets.palette}
              status={
                facets.palette
                  ? `${s?.swatches} swatch${s?.swatches === 1 ? '' : 'es'}`
                  : s?.palettes
                    ? 'palette started · no swatches'
                    : 'no palette yet'
              }
              open={currentFacet === 'palette'}
              onToggle={() => setActiveFacet('palette')}
            >
              <PaletteBuilder proposalId={proposalId} />
            </FacetSection>

            <FacetSection
              name="Boards"
              accent={MOVEMENT.vision}
              done={facets.boards}
              status={
                facets.boards
                  ? `${s?.boards} board${s?.boards === 1 ? '' : 's'} with pieces`
                  : 'no boards yet'
              }
              open={currentFacet === 'boards'}
              onToggle={() => setActiveFacet('boards')}
            >
              <BoardsBuilder proposalId={proposalId} />
            </FacetSection>

            {/* Movement 2 · The Offer (commerce) */}
            <MovementRule
              name="The Offer"
              meta="Line 2 · phases, exclusions, payments, terms"
              hue={MOVEMENT.offer}
            />

            <FacetSection
              name="Phases"
              accent={MOVEMENT.offer}
              done={facets.phases}
              status={
                facets.phases
                  ? `${s?.phases} phase${s?.phases === 1 ? '' : 's'} & fees`
                  : 'no phases yet'
              }
              open={currentFacet === 'phases'}
              onToggle={() => setActiveFacet('phases')}
            >
              <PhaseBuilder proposalId={proposalId} />
            </FacetSection>

            <FacetSection
              name="Exclusions"
              accent={MOVEMENT.offer}
              done={facets.exclusions}
              status={
                facets.exclusions ? `${s?.exclusions} stated` : 'none stated'
              }
              open={currentFacet === 'exclusions'}
              onToggle={() => setActiveFacet('exclusions')}
            >
              <ExclusionsList proposalId={proposalId} />
            </FacetSection>

            <FacetSection
              name="Payments"
              accent={MOVEMENT.offer}
              done={facets.payments}
              status={
                facets.payments
                  ? `${s?.payments} milestone${s?.payments === 1 ? '' : 's'}`
                  : 'no schedule yet'
              }
              open={currentFacet === 'payments'}
              onToggle={() => setActiveFacet('payments')}
            >
              <PaymentMilestonesBuilder
                proposalId={proposalId}
                totalCents={totalProjectCents}
              />
            </FacetSection>

            <FacetSection
              name="Terms"
              accent={MOVEMENT.offer}
              done={facets.terms}
              status={
                facets.terms ? 'change-order terms written' : 'not yet written'
              }
              open={currentFacet === 'terms'}
              onToggle={() => setActiveFacet('terms')}
            >
              {/* R85 — the free-text agreement body (persists to
                  proposal_sections.body, the row the client copy renders),
                  above the structured change-order terms. */}
              <TermsAgreementBody proposalId={proposalId} />
              <ChangeOrderTermsEditor proposalId={proposalId} />
            </FacetSection>

            <p className="doc-type-body mx-auto mt-8 max-w-[620px] border-t border-[var(--doc-ink-border)] py-5 text-center italic text-[var(--color-quiet-ink)]">
              Work in any order. Every edit belongs to the same sendable draft;
              there are no steps to unlock.
            </p>
          </div>

          {/* ── The right rail — "Sarah's copy": what the client sees (R43). ── */}
          <aside className="hidden min-[1440px]:block">
            <div className="sticky top-[150px]">
              <p className="doc-type-meta mb-3 font-semibold uppercase tracking-[0.1em]">
                The client&apos;s copy · live
              </p>
              <div className="rounded-[10px] border border-[var(--doc-ink-border)] bg-white px-5 py-5">
                <ProposalPreviewRail
                  proposalId={proposalId}
                  clientName={proposal?.client_name ?? undefined}
                />
              </div>
            </div>
          </aside>
        </div>
      </div>

      <DocSheet
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Client copy preview"
      >
        <section className="mx-auto max-w-[420px]" aria-label="Client copy">
          <header className="mb-5 border-b border-[var(--doc-ink-border)] pb-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-[1.35rem] italic text-[var(--color-charcoal)]">
                The client&apos;s copy
              </h2>
              <span className="doc-type-meta inline-flex items-center gap-2 uppercase tracking-[0.08em]">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-[var(--color-sage)]"
                />
                Live
              </span>
            </div>
            <p className="doc-type-body mt-1 text-[var(--color-quiet-ink)]">
              {proposal?.client_name
                ? `Previewing the copy for ${proposal.client_name}.`
                : 'Previewing the copy the client will receive.'}
            </p>
          </header>
          <ProposalPreviewRail
            proposalId={proposalId}
            clientName={proposal?.client_name ?? undefined}
          />
        </section>
      </DocSheet>

      {/* Send — the charcoal DocSheet, opened from the head action. On success
          it returns us to the document the proposal lives in (the watch view). */}
      <SendSheet
        proposalId={proposalId}
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        onSent={returnToDocument}
      />

      {/* C4 — the escalate-to-Decision composer, opened from a flagged line's
          Alternatives band. Mounted only with a project + client in hand. */}
      {composeRequest && composeProjectId && (
        <ComposeDecisionSheet
          proposalId={proposalId}
          projectId={composeProjectId}
          clientUserId={composeClientUserId}
          request={composeRequest}
          onClose={() => setComposeRequest(null)}
        />
      )}
    </RoomShell>
  );
}

function MovementRule({
  name,
  meta,
  hue,
}: {
  name: string;
  meta: string;
  hue: string;
}) {
  return (
    <section className="pb-1 pt-8 first:pt-2">
      <div className="mb-1 flex items-baseline gap-3">
        <span
          aria-hidden
          className="h-[4px] w-[34px] shrink-0 self-center rounded-[2px]"
          style={{ background: hue }}
        />
        <h2 className="font-heading text-[1.2rem] font-medium italic text-[var(--color-charcoal)]">
          {name}
        </h2>
        <span className="doc-type-meta ml-auto uppercase tracking-[0.06em]">
          {meta}
        </span>
      </div>
      <div className="mb-4 h-px bg-[var(--doc-ink-border)]" />
    </section>
  );
}
