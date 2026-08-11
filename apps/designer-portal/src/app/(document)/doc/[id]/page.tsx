'use client';

/**
 * The open document — full bleed (D12): the paper IS the screen. No
 * surround, no border, no stacked edge; spine and margin are sticky rails;
 * main scrolls between them, padded clear of the drawer. Read-only Slice 2:
 * §4 sections via document_state, letterhead, settled bars with the
 * canonical Proposal unfold (real seal data), FF&E with R2 stamps, D6
 * presence. Esc puts down (sheet-first priority, §3).
 */

import { use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useProjectV2,
  useProjectPhases,
  useProposalFeedback,
  useProjectRoster,
  useDiscovery,
} from '@patina/supabase';
import { rollupVerdicts, formatVerdictRollup } from '@patina/utils';
import { useDocumentEngagement } from '@/hooks/use-document-state';
import { useHoldDocument } from '@/hooks/document-time-provider';
import { useMobileActiveDoc } from '@/components/document/mobile/mobile-shell';
import { MobileMarginChips } from '@/components/document/mobile/mobile-margin-chips';
import { documentEvents, rememberDocumentInHand } from '@/lib/analytics/document-events';
import { useDocumentPresence } from '@/hooks/use-document-presence';
import { useProposal } from '@/hooks/use-proposals';
import { deriveSections, type SectionLineage } from '@/lib/document/section-derivation';
import type { DocumentStateRow, SectionKey } from '@/lib/document/desk-derivation';
import { sectionAnchorId } from '@/lib/document/section-anchor';
import { fmtDay, fmtMonthYear, fmtUsd } from '@/lib/document/format';
import { documentResolutionState } from '@/lib/document/document-resolution-state';
import { DocSpine } from '@/components/document/doc-spine';
import { DocLetterhead } from '@/components/document/doc-letterhead';
import { SettledBar } from '@/components/document/settled-bar';
import { PreviousWork } from '@/components/document/previous-work';
import { DocumentGuide } from '@/components/document/document-guide';
import { ProposalBlocksReadOnly } from '@/components/document/proposal-blocks-readonly';
import { FFESection } from '@/components/document/ffe-section';
import { CoordinationBand } from '@/components/document/coordination/coordination-band';
import { ScheduleSpine } from '@/components/document/schedule/schedule-spine';
import { BriefSection } from '@/components/document/brief-section';
import { BriefRecap } from '@/components/document/brief-recap';
import { CareBand } from '@/components/document/care-band';
import { CareSection } from '@/components/document/quiet-sections';
import { DiscoverySection } from '@/components/document/discovery/discovery-section';
import { DiscoveryRecap } from '@/components/document/discovery/discovery-recap';
import { DiscoveryMargin } from '@/components/document/discovery/discovery-margin';
import {
  MarginRail,
  ResponsiveMarginRail,
} from '@/components/document/margin-rail';
import { useDocumentSurface } from '@/lib/help-system/use-document-surface';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { AccountBand } from '@/components/document/account-band';
import { ScheduleNavProvider } from '@/components/document/schedule/schedule-nav-context';
import { RippleProvider } from '@/components/document/schedule/schedule-ripple-context';
import { ProjectScheduleHandoffMount } from '@/components/document/project-schedule-handoff-mount';
import { LetterheadInstruments } from '@/components/document/letterhead-instruments';
import { CallSheetMount } from '@/components/document/roster/call-sheet-mount';
import type { CallSheetOpenMode } from '@/components/document/roster/call-sheet';
import { KickoffBand } from '@/components/document/roster/kickoff-band';
import { PlanRoomBand } from '@/components/document/plans/plan-room-band';
import { HouseholdChip } from '@/components/document/household-chip';
import { ProposalInstruments } from '@/components/document/proposal-instruments';
import { FolioLetterhead, ProposalFolioStrip } from '@/components/document/folio-strip';
import { DocColophon } from '@/components/document/doc-colophon';
import { useDocumentRooms } from '@/hooks/use-document-rooms';
import { gateState, useSectionGates } from '@/hooks/use-section-work';
import { deriveFillState } from '@/lib/document/fill-state';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { useHydrated } from '@/hooks/use-hydrated';
import { ProjectAuthorityBandForProject } from '@/components/document/commercial/project-authority-band';
import { ProjectMoodBoards } from '@/components/document/project-mood-boards';
import { ProjectCommerceSection } from '@/components/document/commercial/project-commerce-section';
import { authorizationDoorwayFor } from '@/lib/document/authorization-doorway';
import {
  asLegacyProposalLifecycle,
  deriveDocumentGuide,
  type ProposalGuideFacts,
} from '@/lib/document/document-guide';
import { composeDocumentGuideInputs } from '@/lib/document/document-guide-inputs';
import {
  asCommercialDocumentKind,
  asCommercialState,
} from '@/lib/document/commercial-documents';
import { useDraftingState } from '@/hooks/use-drafting-state';
import {
  selectOperationalNeedForDocument,
  useDeskEngagements,
} from '@/hooks/use-desk-engagements';
import { openLedger } from '@/components/document/command-bar';

const prettyPhase = (phase: string | null) =>
  phase
    ? phase
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : null;

type AnyRecord = any;

/**
 * Whether the Desk composition can tell this document anything its own row
 * cannot. The Desk's side feeds are keyed narrowly: conflicts and receivables
 * on project_id, flagged lines on a proposal engagement, a parked ceremony on a
 * lead. A relationship (Discovery) document matches none of them, and deriveNeed
 * refuses paused/archived rows outright — so those never pay the read.
 */
function deskEnrichmentApplies(row: DocumentStateRow | null): boolean {
  if (!row || row.is_paused || row.is_archived) return false;
  return Boolean(
    row.project_id ||
      (row.engagement_kind === 'proposal' && row.proposal_id) ||
      (row.engagement_kind === 'lead' && row.lead_id),
  );
}

function vitalsFor(row: DocumentStateRow, project: AnyRecord, proposal: AnyRecord): string {
  // Project + proposal carry the client as a first-class subtitle (the
  // HouseholdChip in the title block), so the vitals drop the client name to
  // avoid showing it twice — they state the phase/target/money only.
  if (row.engagement_kind === 'project') {
    return [
      prettyPhase(row.current_phase),
      project?.target_completion ? `Target ${fmtMonthYear(project.target_completion)}` : null,
      project?.total_amount_cents != null ? fmtUsd(project.total_amount_cents) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (row.engagement_kind === 'proposal') {
    return [proposal?.total_amount != null ? `${fmtUsd(proposal.total_amount)} proposed` : null]
      .filter(Boolean)
      .join(' · ');
  }
  if (row.engagement_kind === 'lead') {
    return [row.client_name, 'New inquiry'].filter(Boolean).join(' · ');
  }
  return [row.client_name, 'In discovery'].filter(Boolean).join(' · ');
}

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.doc); // R89 — scope help to the open document
  const { id } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();

  const {
    data: resolution,
    isLoading,
    isFetching,
    isError,
    refetch: retryDocumentResolution,
  } = useDocumentEngagement(id);
  const row = resolution?.kind === 'engagement' ? resolution.row : null;
  const projectId = row?.project_id ?? '';
  const proposalId = row?.proposal_id ?? '';

  const { data: project, isLoading: projectIsLoading, isError: projectIsError } = useProjectV2(projectId) as {
    data: AnyRecord;
    isLoading: boolean;
    isError: boolean;
  };
  const { data: phases } = useProjectPhases(projectId) as { data: AnyRecord[] | undefined };
  const { data: liveProposal, isError: proposalIsError } = useProposal(proposalId) as {
    data: any;
    isError: boolean;
  };
  const discoveryQuery = useDiscovery(
    row?.active_section === 'discovery' ? row.engagement_id : null,
  );
  const draftingState = useDraftingState(
    proposalId,
    row?.active_section === 'direction' && Boolean(proposalId),
  );
  const deskEnrichment = deskEnrichmentApplies(row);
  const enrichedOperationalQuery = useDeskEngagements({
    enabled: deskEnrichment && !isError,
  });
  const enrichedOperationalNeed = selectOperationalNeedForDocument(
    enrichedOperationalQuery.data,
    row?.engagement_id,
  );
  const authorizationDoorway = authorizationDoorwayFor({
    engagementKind: row?.engagement_kind,
    projectId: row?.project_id,
    proposalId: row?.proposal_id,
    documentKind: liveProposal?.document_kind,
  });
  const others = useDocumentPresence(row?.engagement_id ?? null);
  const designerClientId =
    row?.engagement_kind === 'relationship'
      ? row.engagement_id
      : row?.engagement_kind === 'proposal'
        ? (liveProposal?.designer_client_id ?? null)
        : row?.engagement_kind === 'project'
          ? (project?.proposal?.designer_client_id ?? null)
          : null;

  // C3 — the proposal's per-line client verdicts, rolled up for a quiet
  // letterhead summary on the open proposal ("4 of 12 approved · 1 flagged").
  // The denominator is the client-visible line count; empty when nothing has
  // happened yet → no line renders.
  const { data: proposalFeedback = [] } = useProposalFeedback(proposalId);
  const verdictSummary = useMemo(() => {
    const totalLines = liveProposal?.items?.length ?? 0;
    return formatVerdictRollup(
      rollupVerdicts(
        totalLines,
        proposalFeedback.map((f) => ({
          lineId: f.proposal_item_id ?? '',
          verdict: f.verdict,
          createdAt: f.created_at,
          resolvedAt: f.resolved_at,
        })),
      ),
    );
  }, [proposalFeedback, liveProposal?.items?.length]);

  // D11 (ratified R19): picking up the document starts the timer (chaining out any running
  // one); putting down releases it through the log strip. Projects only —
  // time attaches to project rows (00177 FK).
  useHoldDocument(
    row?.project_id
      ? {
          projectId: row.project_id,
          projectName: row.title,
          phaseKey: row.current_phase ?? null,
        }
      : null,
  );

  // Which settled phase is unfolded (R66 review) — generalizes the old
  // proposal-only unfold so ANY completed phase can be clicked open.
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const settledCountRef = useRef(0);
  const [highlightLineId, setHighlightLineId] = useState<string | null>(null);
  const [pendingNoteAnchor, setPendingNoteAnchor] = useState<string | null>(null);
  // The Call Sheet (Wave 3) — an overlay, never a section (D1). Closed by
  // default; the letterhead instrument and ⌘K's "This surface" row both
  // dispatch document:open-call-sheet rather than holding their own state.
  const [callSheetOpen, setCallSheetOpen] = useState(false);
  // FIX 2 — the event's optional { mode } detail (default 'sheet'), read off
  // whichever dispatch opened it and forwarded straight through to CallSheet.
  const [callSheetMode, setCallSheetMode] = useState<CallSheetOpenMode>('sheet');
  // R24: drags anywhere on the active section land in the folio.
  const [sectionDrag, setSectionDrag] = useState(false);
  const [folioDrop, setFolioDrop] = useState<File[] | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Click a spine marker (or a settled bar): unfold that phase and scroll to it.
  // The active phase has no settled bar — the scroll just lands on its section.
  const jumpToSection = useCallback((key: SectionKey, focusId?: string, activate = false) => {
    if (key !== row?.active_section && !historyOpen) {
      setHistoryOpen(true);
      documentEvents.historyToggled({
        expanded: true,
        completed_count: settledCountRef.current,
      });
    }
    setOpenSection(key);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const section = document.getElementById(sectionAnchorId(key));
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        section?.scrollIntoView({
          block: 'start',
          behavior: reduceMotion ? 'auto' : 'smooth',
        });
        const responsiveFocusId =
          focusId === 'document-pulse-control'
            ? `${focusId}-${window.matchMedia?.('(min-width: 1180px)').matches ? 'desktop' : 'mobile'}`
            : focusId;
        const focusTarget =
          (responsiveFocusId ? document.getElementById(responsiveFocusId) : null) ??
          section?.querySelector<HTMLElement>('[data-settled-heading]') ?? section;
        focusTarget?.focus({ preventScroll: true });
        if (
          activate &&
          focusTarget instanceof HTMLButtonElement &&
          focusTarget.getAttribute('aria-expanded') !== 'true'
        ) {
          focusTarget.click();
        }
      });
    });
  }, [historyOpen, row?.active_section]);

  // D13: the mobile spine sheet lives outside this React tree — it asks for a
  // section jump via a CustomEvent (mirrors the account sheet's open-account).
  useEffect(() => {
    const onOpenSection = (e: Event) => {
      const key = (e as CustomEvent).detail as SectionKey | undefined;
      if (key) jumpToSection(key);
    };
    window.addEventListener('document:open-section', onOpenSection);
    return () => window.removeEventListener('document:open-section', onOpenSection);
  }, [jumpToSection]);

  // The Call Sheet's doorways (⌘K, the letterhead instrument, the kickoff
  // band) all reach it this way — mirrors the document:open-section pattern
  // above. A no-op off a project document (the sheet below never mounts).
  useEffect(() => {
    const onOpenCallSheet = (e: Event) => {
      const mode = (e as CustomEvent<{ mode?: CallSheetOpenMode }>).detail?.mode ?? 'sheet';
      setCallSheetMode(mode);
      setCallSheetOpen(true);
    };
    window.addEventListener('document:open-call-sheet', onOpenCallSheet);
    return () => window.removeEventListener('document:open-call-sheet', onOpenCallSheet);
  }, []);

  // R25 rooms (spine-sheet jump rows + headings) · R23 gates (settled stamps).
  const { data: docRooms } = useDocumentRooms(row?.project_id ?? null);
  const { data: sectionGates } = useSectionGates(row?.project_id ?? null);

  // R6: an activated proposal's id redirects to its project document —
  // pre-signing links survive the signing moment. replace(), not push.
  useEffect(() => {
    if (resolution?.kind === 'redirect') router.replace(`/doc/${resolution.projectId}`);
  }, [resolution, router]);

  // Furnishings authorizations are project instruments, not standalone
  // proposal documents. Route old Desk links through the canonical doorway so
  // the authorization opens in the project's ledger instead of dead-ending on
  // the read-only proposal shell.
  useEffect(() => {
    if (authorizationDoorway) router.replace(authorizationDoorway);
  }, [authorizationDoorway, router]);

  // Esc puts down (D1) — unless an overlay owns it (ledger sheet first, §3).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"]')) return;
      router.push('/desk');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [router]);

  // Open lands at the active section (§4): settled bars compress above it.
  const landedRef = useRef(false);
  useEffect(() => {
    if (!row || landedRef.current) return;
    landedRef.current = true;
    const el = mainRef.current?.querySelector('[data-active-section]');
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) {
      el.scrollIntoView({ block: 'start' });
    }
  }, [row]);

  // Lineage (R1): activating proposal for signed work; live proposal pre-signing.
  const lineage: SectionLineage | null = useMemo(() => {
    const src = row?.engagement_kind === 'project' ? project?.proposal : liveProposal;
    if (!src) return null;
    return {
      createdAt: src.created_at ?? null,
      sentAt: src.sent_at ?? null,
      signedAt: src.signed_at ?? null,
      status: src.status ?? null,
      version: src.version ?? null,
    };
  }, [row?.engagement_kind, project?.proposal, liveProposal]);

  // Sections are derived above the early returns so the mobile shell hook
  // (D13) can publish them unconditionally (rules of hooks). Guarded for the
  // pre-resolution null row.
  const installPhase = (phases ?? []).find((p) => p.phase_key === 'installation');
  const sections = row
    ? deriveSections(
        {
          row,
          lineage,
          projectStartDate: project?.start_date ?? null,
          installStartDate: installPhase?.start_date ?? null,
          lineageResolved:
            row.engagement_kind !== 'project' || (!projectIsLoading && !projectIsError),
        },
        new Date(),
      )
    : [];
  const proposalGuideFacts: ProposalGuideFacts | null = liveProposal
    ? {
        status: asLegacyProposalLifecycle(liveProposal.status),
        documentKind: asCommercialDocumentKind(liveProposal.document_kind),
        commercialState: asCommercialState(liveProposal.commercial_state),
        projectId: liveProposal.project_id ?? null,
      }
    : null;
  const guideInputs = row
    ? composeDocumentGuideInputs({
        row,
        proposal: proposalGuideFacts,
        readiness: {
          discovery: discoveryQuery.isError
            ? { state: 'error' }
            : discoveryQuery.isLoading
              ? { state: 'loading' }
              : discoveryQuery.data
                ? { state: 'ready', data: discoveryQuery.data.row ?? discoveryQuery.data.prefill ?? {} }
                : { state: 'idle' },
          drafting: draftingState.error
            ? { state: 'error' }
            : draftingState.isLoading
              ? { state: 'loading' }
              : { state: 'ready', data: { gaps: draftingState.gaps } },
        },
      })
    : [];
  // A failed Desk read only blanks guidance that depended on it. A document its
  // side feeds never key on keeps its own truthful guidance through the outage.
  const deskGuidanceFailed = deskEnrichment && enrichedOperationalQuery.isError;
  const guideUnavailable = Boolean(
    row && (
      deskGuidanceFailed ||
      (row.engagement_kind === 'project' && projectIsError) ||
      ((row.active_section === 'direction' || row.active_section === 'proposal') && proposalIsError) ||
      (row.active_section === 'discovery' && discoveryQuery.isError) ||
      (row.active_section === 'direction' && draftingState.error)
    ),
  );
  // The Desk composition enriches guidance; it never gates it. A cold deep-link
  // renders the document's own derivation on first paint and upgrades in place
  // if the Desk read later contributes a need the row alone cannot carry.
  const guideModel = row
    ? deriveDocumentGuide({
        row,
        availability: guideUnavailable ? 'unavailable' : 'ready',
        retryAvailable: deskGuidanceFailed,
        proposal: proposalGuideFacts,
        inputFacts: guideInputs,
        operationalNeed: enrichedOperationalNeed,
      })
    : null;
  const activateGuide = useCallback(() => {
    if (guideModel?.action?.key === 'retry-guidance') {
      void enrichedOperationalQuery.refetch();
      return;
    }
    const destination = guideModel?.action?.destination;
    if (!destination) return;
    if (destination.kind === 'anchor') {
      jumpToSection(destination.section, destination.focusId, destination.activate);
    }
    if (destination.kind === 'ledger') openLedger(destination.name, destination.context);
  }, [enrichedOperationalQuery, guideModel, jumpToSection]);

  // D13: publish the held document to the mobile shell (bar + spine sheet).
  useMobileActiveDoc(
    row
      ? {
          projectId: row.project_id,
          proposalId: row.proposal_id,
          clientName: row.client_name,
          title: row.title,
          sections,
          rooms: (docRooms ?? []).map((r) => ({ id: r.id, name: r.name })),
        }
      : null,
  );

  // R21 flight telemetry: remember the last document in hand so a later
  // old-zone visit can name where the designer left from. Title + client
  // name ride along so the command bar's recent-documents MRU can name it too.
  const heldEngagementId = row?.engagement_id ?? null;
  const heldTitle = row?.title ?? null;
  const heldSubtitle = row?.client_name ?? null;
  useEffect(() => {
    rememberDocumentInHand(heldEngagementId, { title: heldTitle, subtitle: heldSubtitle });
  }, [heldEngagementId, heldTitle, heldSubtitle]);

  // C7 — the Schedule Spine flip gate. Rules of hooks: called unconditionally
  // above the early returns below, alongside the page's other hooks.
  const spineGate = useFeatureFlag('schedule-spine');
  // Call Sheet (Wave 3) — same rules-of-hooks posture. The roster fetch is
  // gated on the flag so a cohort without it doesn't pay for a query neither
  // the kickoff band nor the instrument will render from.
  const callSheetGate = useFeatureFlag('call-sheet');
  const rosterProjectId =
    callSheetGate.value && row?.engagement_kind === 'project' && row.project_id
      ? row.project_id
      : null;
  const { data: rosterRows } = useProjectRoster(rosterProjectId);
  const resolutionState = documentResolutionState({
    resolutionKind: resolution?.kind,
    isLoading,
    isFetching,
    isError,
  });

  // SSR always starts with an empty engagement cache, while client navigation
  // can arrive with a warm React Query cache. Hold the first client paint to
  // the server's loading tree so those two render contracts cannot diverge.
  if (!hydrated || resolutionState === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--doc-paper)]" aria-busy>
        <p className="px-10 py-12 font-heading text-[14px] italic text-[var(--text-muted)]">
          Picking up…
        </p>
      </div>
    );
  }

  if (resolutionState === 'error') {
    return (
      <div className="min-h-screen bg-[var(--doc-paper)] px-10 py-12">
        <p className="mb-3 font-heading text-[16px] text-[var(--color-charcoal)]">
          This document could not be picked up.
        </p>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.08em]">
          <button
            type="button"
            className="text-[var(--color-clay)]"
            onClick={() => void retryDocumentResolution()}
          >
            Try again
          </button>
          <Link href="/desk" className="text-[var(--text-muted)]">
            Back to the desk
          </Link>
        </div>
      </div>
    );
  }

  if (resolutionState === 'missing' || !row) {
    return (
      <div className="min-h-screen bg-[var(--doc-paper)] px-10 py-12">
        <p className="mb-3 font-heading text-[16px] text-[var(--color-charcoal)]">
          No document answers to this name.
        </p>
        <Link
          href="/desk"
          className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay)]"
        >
          ← Back to the desk
        </Link>
      </div>
    );
  }

  const settled = sections.filter((s) => s.state === 'settled');
  settledCountRef.current = settled.length;
  const unfoldProposalId =
    row.engagement_kind === 'project' ? (project?.proposal?.id ?? null) : (row.proposal_id ?? null);
  const seal = lineage?.signedAt
    ? {
        date: fmtDay(lineage.signedAt),
        by:
          (row.engagement_kind === 'project'
            ? project?.proposal?.signed_by_name
            : liveProposal?.signed_by_name) ?? null,
      }
    : null;

  return (
    <div
      data-document-shell
      data-shell-regime="single-below-1180-compact-to-1439-full-from-1440"
      className="relative grid min-h-screen grid-cols-1 overflow-x-clip bg-[var(--doc-paper)] [grid-template-rows:auto_1fr] min-[1180px]:grid-cols-[56px_minmax(0,1fr)] min-[1180px]:[grid-template-rows:none] min-[1440px]:grid-cols-[200px_minmax(0,1fr)_232px] motion-safe:animate-[doc-raise_270ms_ease-out] motion-reduce:animate-[doc-fade_200ms_ease-out]"
    >
      {/* Paper grain at the threshold of perception */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(139,115,85,0.01) 3px, rgba(139,115,85,0.01) 4px)',
        }}
      />

      <DocSpine sections={sections} others={others} onJump={jumpToSection} />

      {/* No z-index here: a stacking context on main would trap the fixed
          procurement panels (inspection drawer, Order Assistant) mounted in
          line unfolds beneath the aside rail and the drawer strip. The z-0
          grain painting over content is imperceptible at 1% alpha. */}
      <main
        ref={mainRef}
        data-document-paper
        className="w-full min-w-0 max-w-[1040px] justify-self-center px-7 pb-32 pt-8 min-[1180px]:px-10 min-[1440px]:px-12"
      >
        {/* The household — who this document is for — is a first-class subtitle
            in the title block (R68.2): a prominent clickable line directly under
            the title, not a tiny line tucked below the divider. View / set /
            change / edit through the household sheet. */}
        <DocLetterhead
          title={row.title}
          vitals={vitalsFor(row, project, liveProposal)}
          // R80: project vitals self-save at the letterhead (blur-save law).
          projectId={row.engagement_kind === 'project' ? row.project_id : null}
          fill={deriveFillState(sections)}
          client={
            row.engagement_kind === 'project' || row.engagement_kind === 'proposal' ? (
              <HouseholdChip
                engagementKind={row.engagement_kind}
                projectId={row.project_id}
                proposalId={row.proposal_id}
                clientProfileId={row.client_profile_id}
                designerClientId={designerClientId}
                clientName={row.client_name}
                proposalStatus={liveProposal?.status ?? null}
              />
            ) : undefined
          }
        />

        {guideModel && <DocumentGuide model={guideModel} onActivate={activateGuide} />}

        {/* R27 / R63: the letterhead instruments — one quiet DM-mono row under
            the subtitle, now STAGE-CONSISTENT. Send-a-note (and, where there's
            something to mirror, View-as) ride the letterhead across stages,
            not project-only:
              · project      — full client mirror + project group thread + folio
              · proposal      — direct-thread follow-up at the letterhead; the
                                proposal-grain mirror stays in the Proposal
                                section's ProposalInstruments (no duplicate
                                "view as them" under one letterhead)
              · relationship  — direct-thread follow-up (no artifact to mirror)
              · brief (lead)  — only when the captured lead has an in-app profile
            A profile-less captured lead has no counterpart, so the component
            hides both affordances itself (no empty row). The folio unfold is a
            project artifact and stays project-only. */}
        {row.engagement_kind === 'project' && row.project_id && (
          <>
            <LetterheadInstruments
              projectId={row.project_id}
              clientProfileId={row.client_profile_id}
              clientName={row.client_name}
            />
            <FolioLetterhead projectId={row.project_id} />
          </>
        )}
        {row.engagement_kind !== 'project' && row.client_profile_id && (
          <LetterheadInstruments
            clientProfileId={row.client_profile_id}
            clientName={row.client_name}
          />
        )}

        {/* D13: letterhead-anchored margin items (Pulse, section items) as
            chips beneath the title — the desktop margin rail hides on mobile. */}
        <MobileMarginChips
          projectId={row.project_id}
          proposalId={row.proposal_id}
          anchorKind="letterhead"
        />

        {/* Settled bars — letterhead bar + stamp; every phase with a read-only
            body unfolds in place so completed work stays reviewable (R66).
            Clicked from the spine marker (jumpToSection) or the bar itself. */}
        <PreviousWork
          count={settled.length}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
        >
          {settled.map((s) => {
          const isOpen = openSection === s.key;
          const toggle = () => setOpenSection((prev) => (prev === s.key ? null : s.key));

          // R23: a gate-settled section wears the client's grant; the Proposal
          // wears its signing seal.
          const approvedGate = (sectionGates ?? []).find(
            (g) => g.section_key === s.key && gateState(g) === 'approved',
          );
          const stamp =
            s.key === 'proposal' && seal
              ? { label: `Signed · ${seal.date}`, color: 'var(--color-sage)', ink: '#85947C' }
              : approvedGate
                ? {
                    label: `Approved${approvedGate.responded_at ? ` · ${fmtDay(approvedGate.responded_at)}` : ''}`,
                    color: 'var(--color-sage)',
                    ink: '#85947C',
                  }
                : undefined;

          // The read-only review body — what the designer reviews on unfold.
          // Brief → the lead record (triage auto-hides once accepted); Discovery
          // → the captured facts recap; Direction/Proposal → the proposal blocks.
          let body: ReactNode = null;
          if (s.key === 'brief') {
            body = <BriefRecap clientProfileId={row.client_profile_id} leadId={row.lead_id} />;
          } else if (s.key === 'discovery') {
            body = (
              <DiscoveryRecap
                clientProfileId={row.client_profile_id}
                engagementKind={row.engagement_kind}
                engagementId={row.engagement_id}
                proposalId={row.proposal_id}
              />
            );
          } else if ((s.key === 'direction' || s.key === 'proposal') && unfoldProposalId) {
            body = (
              <>
                <ProposalBlocksReadOnly proposalId={unfoldProposalId} />
                {s.key === 'proposal' && seal && (
                  <p className="mt-4 border-t border-[var(--color-pearl)] pt-3 text-[10.5px] text-[var(--text-muted)]">
                    {seal.by ? `Signed by ${seal.by} · ${seal.date}` : `Signed · ${seal.date}`}
                  </p>
                )}
              </>
            );
          }

          return (
            <SettledBar
              key={s.key}
              anchorId={sectionAnchorId(s.key)}
              name={
                s.key === 'proposal' && lineage?.version ? `Proposal · v${lineage.version}` : s.label
              }
              hint={s.key === 'proposal' ? undefined : s.sub}
              stamp={stamp}
              open={isOpen}
              onToggle={body ? toggle : undefined}
            >
              {body}
            </SettledBar>
          );
          })}
        </PreviousWork>

        {/* ScheduleNavProvider wires the Rule (below) to the Spine (mounted
            deeper, inside the active section) so a minimap click reveals
            through to the ledger (§3.5). Context.Provider renders no wrapper
            element — it adds nothing to the DOM, so the Rule's real parent
            stays <main> (the mount contract in schedule-rule.tsx's header)
            and the gate-off tree below is unaffected by its presence. */}
        <ScheduleNavProvider>
          {/* RippleProvider owns the ONE time-edit preview session (Slice 04
              R100). It wraps the SAME subtree as ScheduleNavProvider so the two
              surfaces that begin an edit — the Rule's drags and the Spine's
              inline duration/anchor fields — share a single session, and the
              confirm strip below reads the same diff. It renders no DOM (a
              context provider), so the gate-off / non-project DOM stays
              byte-identical; on a PROJECT doc with the gate off the provider
              does add a background schedule fetch (useResolvedSchedule —
              React-Query-deduped against the Rule/Spine's own reads, so at most
              one extra schedule-milestones query; negligible). On an empty id
              (a non-project document) the hook is fully inert — `??''` keeps
              the provider total there (proposal/brief docs never begin a
              ripple). */}
          <RippleProvider projectId={row.project_id ?? ''}>
            {/* Field Coordination (light-PM slice): the phase schedule as a
                horizontal band — status-tinted segments, a today line, popover date
                editing. Project-wide (shows across project/install/care stages),
                mounted with the AccountBand at the top of the project document so it
                reads as a project overview above the section work.
                S2-4 — the Rule flip gate (same spineGate as the C7 gate below):
                while it's loading (or resolves off) the old PhaseTimeline
                renders — fail-closed, zero flash for the non-pilot cohort. */}
            <ProjectScheduleHandoffMount
              engagementKind={row.engagement_kind}
              projectId={row.project_id}
              projectTitle={row.title}
              projectStatus={project?.status}
              phases={phases}
              showScheduleRule={!spineGate.isLoading && spineGate.value}
            />

          {/* The active section — exactly one (§4). */}
          <div
            id={sectionAnchorId(row.active_section)}
            data-active-section
            tabIndex={-1}
            className="scroll-mt-24 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
            onDragOver={(e) => {
              if (!row.project_id || !e.dataTransfer?.types?.includes('Files')) return;
              e.preventDefault();
              setSectionDrag(true);
            }}
            onDragLeave={() => setSectionDrag(false)}
            onDrop={(e) => {
              if (!row.project_id) return;
              e.preventDefault();
              setSectionDrag(false);
              const files = Array.from(e.dataTransfer.files ?? []);
              if (files.length) setFolioDrop(files);
            }}
          >
            {row.active_section === 'brief' && row.lead_id && <BriefSection leadId={row.lead_id} />}
            {row.active_section === 'discovery' && row.engagement_id && row.designer_id && (
              <DiscoverySection
                engagementId={row.engagement_id}
                designerId={row.designer_id}
                clientProfileId={row.client_profile_id}
                clientName={row.client_name}
              />
            )}
            {(row.active_section === 'direction' || row.active_section === 'proposal') &&
              row.proposal_id && (
                <section>
                  <div className="mb-1.5 mt-5 flex items-baseline justify-between">
                    <h2 className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">
                      {row.active_section === 'direction' ? 'Direction' : 'Proposal'}
                      {liveProposal?.version ? ` · v${liveProposal.version}` : ''}
                    </h2>
                    <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      {sections.find((s) => s.key === row.active_section)?.sub}
                    </span>
                  </div>
                  {/* C3 — a quiet letterhead read of where the client's verdicts
                      stand ("4 of 12 approved · 1 flagged"). Nothing when the
                      client hasn't weighed in yet. */}
                  {row.engagement_kind === 'proposal' && verdictSummary && (
                    <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      {verdictSummary}
                    </p>
                  )}
                  {/* The proposal instruments (gated to engagement_kind
                      ==='proposal'): the Drafting Room doorway for a draft, the
                      Send/Preview/Revise overlay row once it's in the client's
                      hands, and the version-history strip. Local-state overlays
                      never unmount the document beneath (D1). */}
                  {row.engagement_kind === 'proposal' && (
                    <ProposalInstruments
                      proposalId={row.proposal_id}
                      clientName={row.client_name}
                    />
                  )}
                  {/* S18: name the model — what's below is a read-only preview of
                      the proposal; the editing happens in the Drafting Room. */}
                  {row.engagement_kind === 'proposal' && liveProposal?.status === 'draft' && (
                    <p className="mb-2 mt-3 font-mono text-[8.5px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
                      Read-only preview · edit in the Drafting Room
                    </p>
                  )}
                  {/* R85 — the Folio mounts on proposal-stage documents (space
                      plans/drawings clip here pre-project; flagged files reach the
                      client's proposal copy via 00252's client read leg). */}
                  {row.engagement_kind === 'proposal' && (
                    <ProposalFolioStrip proposalId={row.proposal_id} />
                  )}
                  <ProposalBlocksReadOnly proposalId={row.proposal_id} />
                </section>
              )}
              {row.active_section === 'project' && row.project_id && (
                <>
                  {/* Track 5 — the coordination band (ball-in-court + dependency web).
                    The band resolves designerClientId itself from clientUserId
                    (work-block.tsx pattern); the page passes clientUserId, never a
                    raw uid. Mounts ABOVE the FF&E section in the project home (D1:
                    its sheets are band-local overlays, never a route).
                    C7 — the schedule-spine flip gate: while the flag is loading
                    (or resolves off), the old band renders — fail-closed default
                    IS the accepted current page, so this is zero flash/layout
                    shift for the non-pilot cohort (PostHog persists flags, so
                    pilots see at most one first-visit swap). */}
                  {!spineGate.isLoading && spineGate.value ? (
                    <ScheduleSpine
                      projectId={row.project_id}
                      clientUserId={row.client_profile_id}
                      clientName={row.client_name}
                    />
                  ) : (
                    <CoordinationBand
                      projectId={row.project_id}
                      clientUserId={row.client_profile_id}
                      clientName={row.client_name}
                    />
                  )}
                  <FFESection
                    projectId={row.project_id}
                    projectName={row.title}
                    mode="project"
                    highlightId={highlightLineId}
                    onAddNote={setPendingNoteAnchor}
                    sectionKey="project"
                    clientUserId={row.client_profile_id}
                    clientName={row.client_name}
                    folioDrop={folioDrop}
                    onFolioDropConsumed={() => setFolioDrop(null)}
                    sectionDragOver={sectionDrag}
                  />
                  <ProjectAuthorityBandForProject projectId={row.project_id} allowAddendum />
                  <ProjectCommerceSection
                    projectId={row.project_id}
                    projectName={row.title}
                    clientName={row.client_name}
                  />
                  {/* R80: the Care band — closure stays reachable from an active
                    project (a quiet folded line until install nears). */}
                  <CareBand projectId={row.project_id} />
                </>
              )}
            {row.active_section === 'install' && row.project_id && (
              <>
                <FFESection
                  projectId={row.project_id}
                  projectName={row.title}
                  mode="install"
                  highlightId={highlightLineId}
                  onAddNote={setPendingNoteAnchor}
                  sectionKey="install"
                  clientUserId={row.client_profile_id}
                  clientName={row.client_name}
                  folioDrop={folioDrop}
                  onFolioDropConsumed={() => setFolioDrop(null)}
                  sectionDragOver={sectionDrag}
                />
                {/* R80: at install the band opens unfolded — closing out IS the
                    work of this stage. */}
                <CareBand projectId={row.project_id} />
              </>
            )}
            {row.active_section === 'care' && (
              <>
                <CareSection
                  completedLabel={
                    project?.target_completion ? fmtMonthYear(project.target_completion) : null
                  }
                  projectId={row.project_id}
                />
                {row.project_id && (
                  <FFESection
                    projectId={row.project_id}
                    mode="install"
                    highlightId={highlightLineId}
                    sectionKey="care"
                    clientUserId={row.client_profile_id}
                    clientName={row.client_name}
                    folioDrop={folioDrop}
                    onFolioDropConsumed={() => setFolioDrop(null)}
                    sectionDragOver={sectionDrag}
                  />
                )}
              </>
            )}
          </div>
          </RippleProvider>
        </ScheduleNavProvider>

        {row.engagement_kind === 'project' && row.project_id && (
          <>
            {/* Supporting project records follow the active work so a newly
                opened document reaches the schedule before its reference material. */}
            <AccountBand projectId={row.project_id} clientName={row.client_name} />
            <ProjectMoodBoards projectId={row.project_id} />
            <KickoffBand projectId={row.project_id} rows={rosterRows ?? []} />
            <PlanRoomBand routeId={id} projectId={row.project_id} />
          </>
        )}

        {/* R29: the colophon — the paper's last line states its own facts. */}
        {row.engagement_kind === 'project' && row.project_id && (
          <DocColophon
            projectId={row.project_id}
            designerId={row.designer_id}
            projectStatus={row.project_status}
            isPaused={row.is_paused}
            handsOnTheWork={others}
          />
        )}
      </main>

      {/* Margin rail (D12; D2: the margin IS the notification model).
          Below 1180px the margin lives as anchored chips + the mobile spine
          sheet's summary. From 1180–1439px it opens on demand; only the wide
          Document gives it a permanent grid column. */}
      <ResponsiveMarginRail>
        {row.active_section === 'discovery' ? (
          // R66: at Discovery (Shape D) there is no project/proposal — the
          // margin is notes-only, keyed on the relationship.
          <DiscoveryMargin designerClientId={row.engagement_id ?? ''} />
        ) : (
          <MarginRail
            projectId={row.project_id}
            proposalId={row.proposal_id}
            clientName={row.client_name}
            clientUserId={row.client_profile_id}
            onHoverLine={setHighlightLineId}
            pendingNoteAnchor={pendingNoteAnchor}
            onNoteAnchorConsumed={() => setPendingNoteAnchor(null)}
          />
        )}
      </ResponsiveMarginRail>

      {/* D1: the Call Sheet is an overlay, never a section — mounted once
          here (closed by default), opened by document:open-call-sheet from
          ⌘K, the letterhead instrument, and the kickoff band. Project docs
          only; the sheet itself is also flag-gated (self-managed, like every
          other Wave 3 roster component). `openMode` forwards the event's
          detail — 'sheet' from ⌘K/the instrument, 'picker'/'add' from the
          kickoff band's two doorways (FIX 2).

          CallSheetMount, not CallSheet: the mount carries the chevron's
          destination (PartyProfileSheet, over the sheet) and the client
          identity the roster view cannot give us — `client_name` /
          `client_profile_id`, the same pair the letterhead instruments read,
          which become the synthetic row leading the CLIENT SIDE group. */}
      {row.engagement_kind === 'project' && row.project_id && (
        <CallSheetMount
          open={callSheetOpen}
          onClose={() => setCallSheetOpen(false)}
          projectId={row.project_id}
          projectTitle={row.title}
          clientName={row.client_name}
          clientProfileId={row.client_profile_id}
          openMode={callSheetMode}
        />
      )}
    </div>
  );
}
