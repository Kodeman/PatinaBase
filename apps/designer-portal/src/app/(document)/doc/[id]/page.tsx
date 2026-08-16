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
  useProjectApprovals,
  useProposalFeedback,
  useProjectRoster,
  useDiscovery,
  useProjectContextualHandoffs,
  useResolvedSchedule,
} from '@patina/supabase';
import {
  rollupVerdicts,
  formatVerdictRollup,
  phaseFidelity,
  positionText,
  selectActivePhase,
  targetEnd,
  type Fidelity,
  type PhaseStatus,
} from '@patina/utils';
import { useDocumentEngagement } from '@/hooks/use-document-state';
import { useHoldDocument } from '@/hooks/document-time-provider';
import { useMobileActiveDoc } from '@/components/document/mobile/mobile-shell';
import { MobileMarginChips } from '@/components/document/mobile/mobile-margin-chips';
import {
  documentEvents,
  rememberDocumentInHand,
  readRecentDocumentsInHand,
} from '@/lib/analytics/document-events';
import { useDocumentPresence } from '@/hooks/use-document-presence';
import { useProposal } from '@/hooks/use-proposals';
import {
  deriveSections,
  type SectionLineage,
  type SectionScheduleFacts,
} from '@/lib/document/section-derivation';
import { type DocumentStateRow, type SectionKey } from '@/lib/document/desk-derivation';
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
import { ScheduleSpine } from '@/components/document/schedule/schedule-spine';
import { InstallWindowCeremony } from '@/components/document/schedule/install-window-ceremony';
import { BriefSection } from '@/components/document/brief-section';
import { BriefRecap } from '@/components/document/brief-recap';
import { CareBand } from '@/components/document/care-band';
import { CareSection } from '@/components/document/quiet-sections';
import { DiscoverySection } from '@/components/document/discovery/discovery-section';
import { DiscoveryRecap } from '@/components/document/discovery/discovery-recap';
import { DiscoveryMargin } from '@/components/document/discovery/discovery-margin';
import {
  MarginRail,
  openMarginRail,
  ResponsiveMarginRail,
} from '@/components/document/margin-rail';
import { useDocumentSurface } from '@/lib/help-system/use-document-surface';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { AccountBand } from '@/components/document/account-band';
import { MoneyRegion } from '@/components/document/commercial/money-region';
import { KickoffBand } from '@/components/document/roster/kickoff-band';
import { ScheduleNavProvider } from '@/components/document/schedule/schedule-nav-context';
import { RippleProvider } from '@/components/document/schedule/schedule-ripple-context';
import { ScheduleRuleRegion } from '@/components/document/schedule/schedule-rule-region';
import { SectionStageLineMount } from '@/components/document/section-stage-line-mount';
import { ProjectApprovalDocumentMount } from '@/components/document/project-approval-document-mount';
import { LetterheadInstruments } from '@/components/document/letterhead-instruments';
import { CallSheetMount } from '@/components/document/roster/call-sheet-mount';
import type { CallSheetOpenMode } from '@/components/document/roster/call-sheet';
import { HouseholdChip } from '@/components/document/household-chip';
import { ProposalInstruments } from '@/components/document/proposal-instruments';
import { FolioLetterhead, ProposalFolioStrip } from '@/components/document/folio-strip';
import { DocColophon } from '@/components/document/doc-colophon';
import { useDocumentRooms } from '@/hooks/use-document-rooms';
import { gateState, useSectionGates } from '@/hooks/use-section-work';
import { deriveFillState } from '@/lib/document/fill-state';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { useHydrated } from '@/hooks/use-hydrated';
import { authorizationDoorwayFor } from '@/lib/document/authorization-doorway';
import {
  asLegacyProposalLifecycle,
  deriveDocumentGuide,
  needGuideAction,
  type DocumentGuideAction,
  type ProposalGuideFacts,
} from '@/lib/document/document-guide';
import { composeDocumentGuideInputs } from '@/lib/document/document-guide-inputs';
import { deriveGates, nearestOpenGate } from '@/lib/document/workflow-gate';
import {
  asCommercialDocumentKind,
  asCommercialState,
} from '@/lib/document/commercial-documents';
import { useDraftingState } from '@/hooks/use-drafting-state';
import {
  selectOperationalNeedForDocument,
  selectOperationalNeedsForDocument,
  useDeskEngagements,
} from '@/hooks/use-desk-engagements';
import { openLedger } from '@/components/document/command-bar';
import { RedLetterZone, type RedLetterRow } from '@/components/document/red-letter-zone';
import {
  RoomLensProvider,
  useRoomLens,
} from '@/components/document/room-lens-context';
import { DocSpineShelvedBlocks } from '@/components/document/spine-shelved-blocks';
import { DocumentShelves } from '@/components/document/shelves/document-shelves';
import {
  NEW_BOARD_EVENT,
  isShelfLeafKey,
  type ShelfKey,
  type ShelfLeafKey,
} from '@/lib/document/shelves';

const prettyPhase = (phase: string | null) =>
  phase
    ? phase
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : null;

type AnyRecord = any;

/**
 * The project fields the letterhead actually reads. Standalone — NOT an
 * intersection with `AnyRecord`, which would collapse straight back to `any`
 * and re-open the hole that let `project?.target_completion` (not a column)
 * sit here for months rendering nothing.
 */
interface ProjectVitalsRecord {
  target_end_date?: string | null;
  total_amount_cents?: number | null;
  start_date?: string | null;
}

/**
 * R108 — the header speaks the resolver's selection and its target in the
 * register the data supports. Null while the schedule is still unread.
 */
interface ScheduleVitals {
  activePhaseName: string | null;
  target: { date: string | null; fidelity: Fidelity };
}

/**
 * R107/R108. The register a target may be stated in. When the resolver placed
 * no phase at all, the project's own `target_end_date` IS the Band tier — a
 * project-level target the header may state, band-honest, at month precision.
 */
function targetVitalFor(
  target: ScheduleVitals['target'],
  projectTargetEndDate: string | null | undefined,
): string | null {
  if (!target.date) {
    return projectTargetEndDate ? `Target ~${fmtMonthYear(projectTargetEndDate)}` : null;
  }
  const month = fmtMonthYear(target.date);
  switch (target.fidelity) {
    case 'committed':
    case 'record':
      return `Target ${month}`;
    case 'frame':
      return `Target ~${month}`;
    case 'band':
      return `Target band · ${month}`;
  }
}

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

function vitalsFor(
  row: DocumentStateRow,
  project: ProjectVitalsRecord,
  proposal: AnyRecord,
  schedule: ScheduleVitals | null,
): string {
  // Project + proposal carry the client as a first-class subtitle (the
  // HouseholdChip in the title block), so the vitals drop the client name to
  // avoid showing it twice — they state the phase/target/money only.
  if (row.engagement_kind === 'project') {
    return [
      (schedule ? schedule.activePhaseName : null) ?? prettyPhase(row.current_phase),
      // While the schedule loads the header states no target at all — a firmer
      // claim that later softens would be the same lie, briefly.
      schedule ? targetVitalFor(schedule.target, project?.target_end_date) : null,
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
  // The room lens wraps the whole document: the letterhead names the room in
  // hand, the paper lifts by it, and the shelves lift by it too — one hold,
  // read in three places.
  return (
    <RoomLensProvider>
      <DocumentPageBody params={params} />
    </RoomLensProvider>
  );
}

function DocumentPageBody({ params }: { params: Promise<{ id: string }> }) {
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
  // W4: the same key ProjectApprovalDocument already holds hot — read here only
  // to count what is drafted and unsent, for the recap line.
  const approvalsQuery = useProjectApprovals(projectId || undefined);
  // R108/R111 — one derivation, several mouths: the letterhead vitals, the
  // Project sub-label, and the Install sub-label all read this.
  const scheduleQuery = useResolvedSchedule(projectId || undefined);
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
  // Gated on the same predicate as the query, not on the query's own state: the
  // CommandBar in (document)/layout.tsx holds this key hot on every document
  // route, so `data` is present even where this page asked for nothing. Reading
  // it there would let a composition that never covered this document answer
  // "no need" for it.
  const enrichedOperationalNeed = deskEnrichment
    ? selectOperationalNeedForDocument(enrichedOperationalQuery.data, row?.engagement_id)
    : undefined;
  // One clock for the document: the margin's overdue stamp and the guide's
  // sentence read the same instant, so they cannot disagree across a midnight.
  // Re-derived only when the gate read itself changes.
  const handoffsQuery = useProjectContextualHandoffs(projectId || null);
  const gateNow = useMemo(
    () => new Date(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handoffsQuery.dataUpdatedAt],
  );
  // Ruling V: the guide speaks for the nearest open gate. `undefined` while the
  // projection has not answered — the guide then keeps its own derivation
  // rather than claiming there is no gate.
  const nearestGate = useMemo(
    () =>
      handoffsQuery.data
        ? nearestOpenGate(
            deriveGates(handoffsQuery.data, gateNow, row?.client_name ?? null),
          )
        : undefined,
    [handoffsQuery.data, gateNow, row?.client_name],
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
  // The shelves — one leaf open at a time, beside the spine. The call sheet is
  // not one of them: it is a doorway to the roster sheet mounted below.
  const [openShelf, setOpenShelf] = useState<ShelfLeafKey | null>(null);
  const { heldRoomId } = useRoomLens();
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
    // A margin-owned anchor lives in a sheet that is `inert` while closed, so
    // focus would silently no-op. Raise it before the focus frame.
    if (focusId?.startsWith('document-handoff-')) openMarginRail();
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
        // Idempotence rests on the target declaring its own state: an expandable
        // focus target must publish aria-expanded, or a second activation would
        // toggle it shut. Non-expandable targets (the mobile margin chip, which
        // opens a sheet rather than toggling) carry none and stay safe to press.
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

  // W4 — the recap line's approvals clause is a door to the approvals record,
  // which keeps its own place on the page; the disclosure below it only ever
  // holds settled bars.
  const openApprovals = useCallback(() => {
    const section = document.querySelector<HTMLElement>('[data-project-approval-document]');
    if (!section) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    const target =
      section.querySelector<HTMLElement>('#project-approvals-title') ?? section;
    target.focus({ preventScroll: true });
  }, []);

  // Esc puts down (D1) — unless something above it owns the key. A sheet is
  // first (it is the topmost thing on the screen and closes itself), then an
  // open shelf leaf (ShelfPanel closes it); only a bare document is put down.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"]')) return;
      if (openShelf) return;
      router.push('/desk');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [router, openShelf]);

  // The shelf rows. A leaf toggles; the call sheet dispatches at the roster
  // sheet that already exists rather than printing a second, thinner copy.
  const toggleShelf = useCallback((key: ShelfKey) => {
    if (!isShelfLeafKey(key)) {
      window.dispatchEvent(
        new CustomEvent('document:open-call-sheet', { detail: { mode: 'sheet' } }),
      );
      return;
    }
    setOpenShelf((current) => (current === key ? null : key));
  }, []);

  // The leaf and its shelf rows only exist from 1440px. Narrower than that
  // they are display:none, so an open shelf would leave Esc and focus-restore
  // aiming at elements nobody can see — the same safeguard the room lens keeps.
  useEffect(() => {
    if (!openShelf || typeof window === 'undefined') return;
    const query = window.matchMedia?.('(min-width: 1440px)');
    if (!query) return;
    const release = () => {
      if (!query.matches) setOpenShelf(null);
    };
    query.addEventListener('change', release);
    return () => query.removeEventListener('change', release);
  }, [openShelf]);

  // "Start a board" from the Add-to-project sheet reaches a room that now lives
  // on a shelf. Catch the intent, open the shelf, and re-fire once the room is
  // listening — the guard is the shelf's own state, so the re-fire cannot loop.
  const forwardBoardIntent = useRef(false);
  const shelvesAvailable =
    row?.active_section === 'project' && Boolean(row?.project_id);
  useEffect(() => {
    // Only where the shelves are actually on the rail. Off the Project
    // section there is no mood-board room to open and no shelf row to press,
    // so the intent is left alone rather than opening a leaf that will not
    // render and stranding the focus that was following it.
    if (!shelvesAvailable) return;
    const onNewBoard = () => {
      setOpenShelf((current) => {
        if (current === 'moodboards') return current;
        forwardBoardIntent.current = true;
        return 'moodboards';
      });
    };
    window.addEventListener(NEW_BOARD_EVENT, onNewBoard);
    return () => window.removeEventListener(NEW_BOARD_EVENT, onNewBoard);
  }, [shelvesAvailable]);
  useEffect(() => {
    if (openShelf !== 'moodboards' || !forwardBoardIntent.current) return;
    forwardBoardIntent.current = false;
    window.dispatchEvent(new CustomEvent(NEW_BOARD_EVENT));
  }, [openShelf]);

  // Open lands at the active section (§4): settled bars compress above it —
  // but only for a visitor who has been in this document before (A8). A
  // first-time/shared-link visitor should see the header first; the jump is
  // a resume convenience, not a default. "Seen before" reads off the same
  // recent-documents-in-hand MRU this page writes to below via
  // rememberDocumentInHand — that write runs later in this same commit
  // (React runs effects in declaration order), so this read never races it
  // for the current visit.
  const landedRef = useRef(false);
  useEffect(() => {
    if (!row || landedRef.current) return;
    landedRef.current = true;
    const seenBefore = readRecentDocumentsInHand().some((d) => d.id === row.engagement_id);
    if (!seenBefore) return;
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
  const scheduleFacts = useMemo<SectionScheduleFacts | null>(() => {
    const resolved = scheduleQuery.resolved;
    if (!resolved) return null;
    const statuses = new Map<string, PhaseStatus>(
      scheduleQuery.phases.map((p) => [p.id, (p.status ?? 'pending') as PhaseStatus]),
    );
    const sortOrders = new Map<string, number>(
      scheduleQuery.phases.map((p) => [p.id, p.sort_order ?? 0]),
    );
    const today = new Date().toISOString().slice(0, 10);
    const selection = selectActivePhase(resolved, statuses, today, sortOrders);
    const active = resolved.phases.find((p) => p.id === selection.activePhaseId) ?? null;
    const installResolved = installPhase
      ? (resolved.phases.find((p) => p.id === installPhase.id) ?? null)
      : null;
    return {
      selection,
      fidelity: active ? phaseFidelity(active, statuses.get(active.id) ?? 'pending') : 'band',
      positionText: positionText(resolved, selection, today),
      install: installResolved
        ? {
            date: installResolved.start,
            fidelity: phaseFidelity(installResolved, statuses.get(installResolved.id) ?? 'pending'),
          }
        : null,
    };
  }, [scheduleQuery.resolved, scheduleQuery.phases, installPhase]);

  const scheduleVitals = useMemo<ScheduleVitals | null>(() => {
    const resolved = scheduleQuery.resolved;
    if (!resolved) return null;
    const activeId = scheduleFacts?.selection.activePhaseId ?? null;
    return {
      activePhaseName: activeId
        ? (scheduleQuery.phases.find((p) => p.id === activeId)?.name ?? null)
        : null,
      target: targetEnd(resolved),
    };
  }, [scheduleQuery.resolved, scheduleQuery.phases, scheduleFacts]);

  // R108 — the seam over the folded drafting strip and the running index's
  // Schedule line both read the derivation above. Neither computes a second
  // position sentence that could drift from the letterhead's.
  const scheduleRuleSummary = useMemo(() => {
    if (!scheduleFacts) return 'Phase dates';
    const install = scheduleFacts.install;
    const installText =
      install?.date != null
        ? install.fidelity === 'committed' || install.fidelity === 'record'
          ? `Install ${fmtMonthYear(install.date)}`
          : `Install ~${fmtMonthYear(install.date)}`
        : null;
    return [scheduleFacts.positionText, installText].filter(Boolean).join(' · ');
  }, [scheduleFacts]);

  const sections = row
    ? deriveSections(
        {
          row,
          lineage,
          schedule: scheduleFacts,
          lineageResolved:
            row.engagement_kind !== 'project' || (!projectIsLoading && !projectIsError),
        },
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
        gate: nearestGate,
      })
    : null;
  // Split from activateGuide so the red-letter zone's per-need actions (below)
  // can reach the same switch without going through the guide's own model.
  const activateDestination = useCallback(
    (destination: DocumentGuideAction['destination']) => {
      if (destination.kind === 'retry') {
        void enrichedOperationalQuery.refetch();
        return;
      }
      if (destination.kind === 'anchor') {
        jumpToSection(destination.section, destination.focusId, destination.activate);
      }
      if (destination.kind === 'ledger') openLedger(destination.name, destination.context);
    },
    [enrichedOperationalQuery, jumpToSection],
  );
  const activateGuide = useCallback(() => {
    const destination = guideModel?.action?.destination;
    if (!destination) return;
    activateDestination(destination);
  }, [activateDestination, guideModel]);

  // The letterhead's red-letter zone (project documents only, D-something): every
  // need this document is carrying, printed once, instead of the guide's single
  // sentence. Sourced from the Desk composition ONLY — `undefined` means the
  // composition has not answered for this document, and the zone stands down in
  // favour of DocumentGuide rather than printing a local derivation: this page
  // cannot pass deriveNeeds the invoice/schedule facts the Desk holds, so that
  // fallback silently printed a SHORT list as if it were the whole list.
  const enrichedOperationalNeeds = deskEnrichment
    ? selectOperationalNeedsForDocument(enrichedOperationalQuery.data, row?.engagement_id)
    : undefined;
  const redLetterRows: RedLetterRow[] = useMemo(() => {
    if (!row || row.engagement_kind !== 'project') return [];
    const needs = enrichedOperationalNeeds;
    if (!needs) return [];
    return needs.map((need, index) => {
      const action = needGuideAction(need, row.active_section, row.project_id ?? null);
      return {
        key: `${need.kind}-${index}`,
        kind: need.kind,
        text: need.text,
        actionLabel: action.label,
        onAct: () => activateDestination(action.destination),
        urgent: need.urgent,
      };
    });
  }, [row, enrichedOperationalNeeds, activateDestination]);

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

  // Call Sheet (Wave 3) — rules of hooks: called unconditionally above the
  // early returns below, alongside the page's other hooks. The roster fetch is
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
  const heldRoomName =
    (docRooms ?? []).find((r) => r.id === heldRoomId)?.name ?? null;
  // The shelved spine's blocks stand only where their subjects do: the running
  // index names Project regions, and the rooms and shelves are project things.
  const shelvedSpine =
    row.engagement_kind === 'project' &&
    row.project_id &&
    row.active_section === 'project' ? (
      <DocSpineShelvedBlocks
        projectId={row.project_id}
        rooms={docRooms ?? []}
        scheduleValue={scheduleFacts?.positionText ?? 'Not scheduled'}
        approvalsValue={
          approvalsQuery.isLoading
            ? 'Reading…'
            : `${(approvalsQuery.data ?? []).length} in the log`
        }
        rosterCount={(rosterRows ?? []).length}
        callSheetEnabled={callSheetGate.value}
        openShelf={openShelf}
        onToggleShelf={toggleShelf}
      />
    ) : null;
  // W1 — the letterhead's setup chip. deriveNeed returns at most one need per
  // document, so this list holds one entry or none; `undefined` (the Desk has
  // not answered) and `null` (it answered "nothing") both render nothing. The
  // remedy anchors to the active section directly rather than borrowing the
  // guide's action, which an open workflow gate can point somewhere else.
  const needsSetup =
    enrichedOperationalNeed?.kind === 'schedule_unconfigured'
      ? [
          {
            text: enrichedOperationalNeed.text,
            remedyLabel: enrichedOperationalNeed.actionLabel ?? 'Review',
            onActivate: () => jumpToSection(row.active_section),
          },
        ]
      : [];
  // W4 — drafted approvals that have not been published to the client. Null
  // while the read is unanswered: a recap line that grows a clause after first
  // paint is the same lie as a figure that softens.
  const approvalsAwaitingPublish = approvalsQuery.isLoading
    ? null
    : (approvalsQuery.data ?? []).filter(
        (approval) => approval.lifecycleStatus === 'draft' && approval.disposition === 'active',
      ).length;
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

      <DocSpine
        sections={sections}
        others={others}
        onJump={jumpToSection}
        shelved={shelvedSpine}
      />

      {/* No z-index here: a stacking context on main would trap the fixed
          procurement panels (inspection drawer, Order Assistant) mounted in
          line unfolds beneath the aside rail and the drawer strip. The z-0
          grain painting over content is imperceptible at 1% alpha. */}
      <main
        ref={mainRef}
        data-document-paper
        data-shelf-open={openShelf ? 'true' : undefined}
        className="w-full min-w-0 max-w-[1040px] justify-self-center px-7 pb-32 pt-8 min-[1180px]:px-10 min-[1440px]:px-12"
      >
        {/* The household — who this document is for — is a first-class subtitle
            in the title block (R68.2): a prominent clickable line directly under
            the title, not a tiny line tucked below the divider. View / set /
            change / edit through the household sheet. */}
        <DocLetterhead
          title={row.title}
          // The cast is the narrowing: `project` is still the page-wide
          // AnyRecord, but the letterhead may only reach the three columns it
          // actually reads.
          vitals={vitalsFor(row, project as ProjectVitalsRecord, liveProposal, scheduleVitals)}
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
          needsSetup={needsSetup}
          inHandRoomName={heldRoomName}
        />

        {/* The red letter replaces the guide only where it can actually speak
            for the document: a composed Desk answer for THIS engagement. With
            no composition (or a failed Desk read, whose retry lives on the
            guide) the project document keeps the same guide every other kind
            gets — silence is not a state this page is allowed to render. */}
        {guideModel &&
          (row.engagement_kind === 'project' &&
          enrichedOperationalNeeds &&
          !deskGuidanceFailed ? (
            <RedLetterZone rows={redLetterRows} />
          ) : (
            <DocumentGuide model={guideModel} onActivate={activateGuide} />
          ))}

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
              engagementId={row.engagement_id}
            />
            <FolioLetterhead projectId={row.project_id} />
          </>
        )}
        {row.engagement_kind !== 'project' && row.client_profile_id && (
          <LetterheadInstruments
            clientProfileId={row.client_profile_id}
            clientName={row.client_name}
            engagementId={row.engagement_id}
          />
        )}

        {/* D13: letterhead-anchored margin items (Pulse, section items) as
            chips beneath the title — the desktop margin rail hides on mobile. */}
        <MobileMarginChips
          projectId={row.project_id}
          proposalId={row.proposal_id}
          anchorKind="letterhead"
          clientName={row.client_name}
        />

        <ProjectApprovalDocumentMount
          projectId={
            row.engagement_kind === 'project' ? row.project_id : null
          }
          clientProfileId={
            row.engagement_kind === 'project' ? (project?.client_id ?? null) : null
          }
          clientName={row.client_name}
          phases={phases}
        />

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
                horizontal instrument — status-weighted segments, a today cut,
                draggable phase bars. Project-wide (shows across
                project/install/care stages), mounted with the AccountBand at the
                top of the project document so it reads as a project overview
                above the section work. B3 retired the flip gate: the Rule is the
                schedule, unconditionally. */}
            <ScheduleRuleRegion
              engagementKind={row.engagement_kind}
              projectId={row.project_id}
              projectTitle={row.title}
              projectStatus={project?.status}
              phases={phases}
              summary={scheduleRuleSummary}
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
            {/* R1 / M1-after (I114): the stage sub-label and its track bands are
                the head of the OPEN section, not a free-standing band under the
                letterhead. They ride inside <div data-active-section> so they
                read as the section's own sub-label, exactly as the deck draws
                the open Project row. */}
            <SectionStageLineMount
              projectId={
                row.engagement_kind === 'project' ? row.project_id : null
              }
              activeSection={row.active_section}
            />
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
                    B3 retired the schedule-spine flip gate — the Spine is the
                    ledger, unconditionally; CoordinationBand was its fallback
                    and no longer mounts anywhere. */}
                  <ScheduleSpine
                    projectId={row.project_id}
                    clientUserId={row.client_profile_id}
                    clientName={row.client_name}
                    projectStatus={project?.status}
                  />
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
                  {/* W2 — one money region: authority → plan → committed →
                    moved, over the four surfaces that used to stand apart
                    (design authority, working budget, authorizations & trade
                    scopes, the accounts). Gated on engagement_kind exactly as
                    the four tail mounts it replaced were. */}
                  {row.engagement_kind === 'project' && (
                    <MoneyRegion
                      projectId={row.project_id}
                      projectName={row.title}
                      clientName={row.client_name}
                      activeSection={row.active_section}
                    />
                  )}
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
                {/* R112: the install week's commitment act, on the section
                    whose whole subject is that week. */}
                <InstallWindowCeremony projectId={row.project_id} />
                {/* R80: at install the band opens unfolded — closing out IS the
                    work of this stage. */}
                <CareBand projectId={row.project_id} />
              </>
            )}
            {row.active_section === 'care' && (
              <>
                <CareSection
                  completedLabel={
                    project?.target_end_date ? fmtMonthYear(project.target_end_date) : null
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
                opened document reaches the schedule before its reference material.
                W2 — the accounts moved into the money region, which mounts only
                while the Project section is open; every other section keeps the
                band here, where it has always been. */}
            {row.active_section !== 'project' && (
              <AccountBand
                projectId={row.project_id}
                clientName={row.client_name}
                activeSection={row.active_section}
              />
            )}
            {/* The four supporting rooms moved to the shelves, so the
                not-started band that collapsed them has nothing left to
                collapse. The first-staffing nudge has no other home and stays
                here, ungated: it self-silences on the flag, a staffed sheet, or
                its own dismissal. */}
            <KickoffBand projectId={row.project_id} rows={rosterRows ?? []} />
          </>
        )}

        {/* The Record — the settled bars, at the FOOT of the paper: history is
            an appendix, not a preamble. Every phase with a read-only body
            unfolds in place so completed work stays reviewable (R66); reached
            from the spine marker (jumpToSection) or the bar itself. */}
        <PreviousWork
          count={settled.length}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          approvalsAwaitingPublish={approvalsAwaitingPublish}
          onOpenApprovals={openApprovals}
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
            now={gateNow}
            approvalSurfaceMounted={row.engagement_kind === 'project'}
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
      {/* The shelves' leaf — the reference material that does not fit inline,
          beside the spine and over the canvas, never over the paper's text. */}
      {row.engagement_kind === 'project' && row.project_id && (
        <DocumentShelves
          openShelf={openShelf}
          onClose={() => setOpenShelf(null)}
          projectId={row.project_id}
          routeId={id}
          rooms={docRooms ?? []}
          canCreateBoards={row.active_section === 'project'}
        />
      )}

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
