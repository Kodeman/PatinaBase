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
  computeArAging,
  invoiceDaysOverdue,
  usePlanRoom,
  useProjectBoards,
  useProjectFFEItems,
  useProjectInvoices,
  useProjectOwnedBoards,
  useProjectV2,
  useProjectPhases,
  useProjectApprovals,
  useProposalFeedback,
  useProjectRoster,
  useDiscovery,
  useProjectContextualHandoffs,
  useProposalScopeRooms,
  useProposalScheduleItems,
  useBoards,
  usePurchaseOrders,
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
import {
  paperRegionsForSection,
  requestRegionUnfold,
  type DocumentIndexKey,
} from '@/lib/document/document-index';
import { scrollToRegion } from '@/hooks/use-document-running-index';
import { rankOperationalNeeds } from '@/lib/document/need-tie-break';
import {
  deriveProposalWatch,
  deriveSendWallLine,
} from '@/lib/document/proposal-watch-derivation';
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
import { RoomFilesSection } from '@/components/room-file/room-files-section';
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
import {
  composeDocumentGuideInputs,
  type DocumentGuideReadinessFacts,
} from '@/lib/document/document-guide-inputs';
import { deriveGates, nearestOpenGate } from '@/lib/document/workflow-gate';
import {
  asCommercialDocumentKind,
  asCommercialState,
  commercialDocumentExperience,
} from '@/lib/document/commercial-documents';
import { useDraftingState } from '@/hooks/use-drafting-state';
import {
  selectOperationalNeedForDocument,
  selectOperationalNeedsForDocument,
  useDeskEngagements,
} from '@/hooks/use-desk-engagements';
import { callSheetPending, openLedger } from '@/components/document/command-bar';
import { RedLetterZone, type RedLetterRow } from '@/components/document/red-letter-zone';
import {
  RoomLensProvider,
  useRoomLens,
} from '@/components/document/room-lens-context';
import { DocSpineShelvedBlocks } from '@/components/document/spine-shelved-blocks';
import { JobTicket } from '@/components/document/job-ticket';
import {
  deriveTicket,
  deriveTicketHead,
  deriveTicketIdentity,
  deriveTicketSeam,
  type TicketClientCopy,
  type TicketInput,
  type TicketLine,
  type TicketPhase,
  type TicketRoomFact,
  type TicketRow,
  type TicketSlotKey,
  type TicketUnansweredPo,
} from '@/lib/document/ticket-derivation';
import { boardsRoutePath } from '@/lib/document/registry';
import { deriveMoneyLadder, type MoneyLadder } from '@/lib/document/money-ladder';
import { useMoneyLadder } from '@/hooks/use-money-ladder';
import { selectUndrawnVendorPayments } from '@/lib/document/vendor-payouts';
import {
  deriveLineStamp,
  type LineStampInput,
} from '@/lib/document/stamp-derivation';
import { deriveTableComposition } from '@/lib/document/table-derivation';
import { useTablePin } from '@/components/document/worktable/use-table-pin';
import { ReleaseLift } from '@/components/document/worktable/release-lift';
import { TableFrame } from '@/components/document/worktable/table-frame';
import {
  markSealTurn,
  readAndClearSealTurn,
} from '@/components/document/worktable/seal-turn';
import type { SpeccingTableSlots } from '@/components/document/worktable/table-slots';
import { RoomsRail } from '@/components/document/worktable/rooms-rail';
import { Scheme } from '@/components/document/worktable/scheme';
import { BoardsStrip } from '@/components/document/worktable/boards-strip';
import { LibraryReachIn } from '@/components/document/worktable/library-reach-in';
import { FinalizeHead } from '@/components/document/worktable/finalize-head';
import { OfferFacets } from '@/components/document/worktable/offer-facets';
import { IntakeSpreadHeader } from '@/components/document/worktable/intake-spread-header';
import { DocumentShelves } from '@/components/document/shelves/document-shelves';
import {
  NEW_BOARD_EVENT,
  isShelfLeafKey,
  shelfRouteFor,
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
 * The FF&E columns the ticket counts: the stamp machine's own input, plus the
 * two fields the ticket reads directly — which room a line belongs to, and
 * whether it carries a product yet.
 */
interface TicketFFERow extends LineStampInput {
  project_room_id?: string | null;
  product_id?: string | null;
  removed_at?: string | null;
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

/** The two Speccing tools the ticket's Rooms and Boards rows anchor to. A
 *  module constant so the mounts' memos see one identity across renders. */
const SPECCING_TICKET_SLOTS: readonly TicketSlotKey[] = [
  'rooms-rail',
  'boards-strip',
];

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

/**
 * Two derivations are the same map when every row prints the same words and
 * opens the same kind of door.
 *
 * This test is load-bearing, not an optimisation. The ticket re-derives
 * whenever any of its six live reads hands back a new object identity, so the
 * rows it reports up carry a fresh array on renders where nothing was said
 * differently — and since the guide reads that array from page state, an
 * identity test would have the report re-render the mount that made it, and
 * that render report again, without end.
 */
function sameTicketRows(
  previous: readonly TicketRow[] | null,
  next: readonly TicketRow[],
): boolean {
  if (!previous || previous.length !== next.length) return false;
  return previous.every((row, index) => {
    const other = next[index];
    return (
      row.key === other.key &&
      row.label === other.label &&
      row.value === other.value &&
      row.emphasis === other.emphasis &&
      row.door.kind === other.door.kind &&
      row.exception?.rank === other.exception?.rank &&
      row.exception?.phrase === other.exception?.phrase &&
      row.exception?.standingSince === other.exception?.standingSince
    );
  });
}

/**
 * A settled, empty money ladder — the six rungs of a paper with no project to
 * spend against. Derived rather than hand-written so the rungs keep
 * `money-ladder.ts`'s own words for nothing-yet, and so a seventh rung added
 * there is a rung this paper prints too. Called from inside a memo rather than
 * at module load: the derivation reaches into `@patina/supabase`, and running
 * it at load would make merely IMPORTING this page depend on that.
 */
function noProjectLadder(): MoneyLadder {
  return deriveMoneyLadder({
    budget: { settled: true, failed: false, authorizedCents: null },
    plan: {
      settled: true,
      failed: false,
      versionNumber: null,
      lineCount: 0,
      targetCents: 0,
    },
    authorized: {
      settled: true,
      failed: false,
      executedCount: 0,
      committedCents: 0,
    },
    purchaseOrders: { settled: true, failed: false, rows: [] },
    invoices: { settled: true, failed: false, rows: [] },
  });
}

/**
 * The ticket's own reads, in a component of their own.
 *
 * `useMoneyLadder` (and the two un-`enabled` queries under it) may only be
 * called where the ticket actually stands, so the mount is CONDITIONAL rather
 * than a hook the page calls and discards on every non-project document.
 *
 * Every read here is a key React Query already holds for this document —
 * the shelf leaves, the money region and the FF&E section make the same
 * calls — so the ticket costs cache hits, not round trips.
 */
function JobTicketMount({
  projectId,
  routeId,
  section,
  regionSection,
  project,
  tableSlots,
  unansweredPo,
  phase,
  rooms,
  roomsSettled,
  schedule,
  scheduleSettled,
  callSheetEnabled,
  rosterCount,
  rosterSettled,
  onOpenLeaf,
  onUnfoldRegion,
  onRows,
  clientCopy,
}: {
  projectId: string;
  /** The `[id]` this document is mounted at — the address every leaf page and
   *  the boards route resolve, project id or engagement id alike. */
  routeId: string;
  section: SectionKey;
  /** Which spread's regions are actually on the paper. Off the `worktable`
   *  flag this IS `section`; with a table pinned the two differ, and a row
   *  that unfolds a region the pinned spread never mounted opens nothing. */
  regionSection: SectionKey;
  /** Whether the three shelf leaves and the call sheet are mounted on this
   *  document — the same predicate their own mounts read below. */
  project: boolean;
  /** What the pinned composition already stands on this paper (Speccing). */
  tableSlots: readonly TicketSlotKey[] | undefined;
  /** direction-b §3.2 rank three, riding the Pieces row (§3.3's specimen). */
  unansweredPo: TicketUnansweredPo | null;
  phase: TicketPhase | null;
  rooms: readonly TicketRoomFact[];
  roomsSettled: boolean;
  schedule: SectionScheduleFacts | null;
  scheduleSettled: boolean;
  callSheetEnabled: boolean;
  rosterCount: number;
  rosterSettled: boolean;
  onOpenLeaf: (key: ShelfKey) => void;
  onUnfoldRegion: (region: DocumentIndexKey) => void;
  /** The eight rows, reported up for the guide's leader (B2-L3). The rows are
   *  derived here because the reads are here; the guide is derived above this
   *  mount, so the leader can only speak from what the ticket prints if the
   *  rows travel back up. */
  onRows: (rows: readonly TicketRow[]) => void;
  /** The proposal's own copy — the ninth row, and only on the Finalize table. */
  clientCopy: TicketClientCopy | null;
}) {
  const ffeQuery = useProjectFFEItems(projectId) as {
    data: TicketFFERow[] | undefined;
    isLoading: boolean;
  };
  const planRoomQuery = usePlanRoom(projectId);
  const liveBoardsQuery = useProjectOwnedBoards(projectId);
  const signedBoardsQuery = useProjectBoards(projectId);
  const invoicesQuery = useProjectInvoices(projectId);
  const purchaseOrdersQuery = usePurchaseOrders({ projectId });
  const moneyRead = useMoneyLadder(projectId);

  const lines = useMemo<TicketLine[]>(
    () =>
      (ffeQuery.data ?? [])
        .filter((item) => item.removed_at == null)
        .map((item) => ({
          stamp: deriveLineStamp(item).kind,
          roomId: item.project_room_id ?? null,
          // The same test the FF&E ledger's own "Spec the N unspecified"
          // leader runs, so the ticket's numerator and the region's act can
          // never count different lines.
          specified: Boolean(item.product_id),
        })),
    [ffeQuery.data],
  );

  const leadingOpenInvoice = useMemo(
    () => computeArAging(invoicesQuery.data ?? []).openInvoices[0] ?? null,
    [invoicesQuery.data],
  );

  const boardsCount =
    (liveBoardsQuery.data ?? []).filter((board) => board.status !== 'archived')
      .length + (signedBoardsQuery.data ?? []).length;

  const paperRegionKeys = useMemo(
    () => paperRegionsForSection(regionSection).map((region) => region.key),
    [regionSection],
  );

  // See `ProjectlessTicketMount` — the facts, not the object identity. Both
  // props are rebuilt on every render of the page, which sits above an early
  // return no memo of theirs could be hoisted over.
  const copySettled = clientCopy?.settled ?? null;
  const copySent = clientCopy?.sent ?? null;
  const copyFailed = clientCopy?.failed ?? null;
  const poCount = unansweredPo?.count ?? 0;
  const poLabel = unansweredPo?.label ?? null;
  const poSentAt = unansweredPo?.sentAt ?? null;
  const po = useMemo<TicketUnansweredPo | null>(
    () =>
      poCount > 0 && poSentAt
        ? { count: poCount, label: poLabel, sentAt: poSentAt }
        : null,
    [poCount, poLabel, poSentAt],
  );

  const ticketInput = useMemo<TicketInput>(
    () => ({
      section,
      phase,
      project,
      tableSlots,
      rooms: { settled: roomsSettled, list: rooms },
      pieces: { settled: !ffeQuery.isLoading, lines, unansweredPo: po },
      drawings: {
        settled: !planRoomQuery.isLoading,
        sheetCount: planRoomQuery.data?.sheets.length ?? 0,
      },
      boards: {
        settled: !liveBoardsQuery.isLoading && !signedBoardsQuery.isLoading,
        count: boardsCount,
      },
      money: {
        settled: moneyRead.settled,
        failed: moneyRead.failed,
        ladder: moneyRead.ladder,
        owedDays: leadingOpenInvoice
          ? invoiceDaysOverdue(leadingOpenInvoice)
          : null,
        undrawnKind: selectUndrawnVendorPayments(purchaseOrdersQuery.data ?? [])
          .kind,
        owedSince: leadingOpenInvoice?.due_date?.slice(0, 10) ?? null,
      },
      dates: { settled: scheduleSettled, schedule },
      people: { settled: rosterSettled, callSheetEnabled, rosterCount },
      clientCopy:
        copySettled == null || copySent == null
          ? null
          : { settled: copySettled, sent: copySent, failed: copyFailed ?? false },
      paperRegions: paperRegionKeys,
    }),
    [
      copySettled,
      copySent,
      copyFailed,
      section,
      phase,
      project,
      tableSlots,
      po,
      roomsSettled,
      rooms,
      ffeQuery.isLoading,
      lines,
      planRoomQuery.isLoading,
      planRoomQuery.data,
      liveBoardsQuery.isLoading,
      signedBoardsQuery.isLoading,
      boardsCount,
      moneyRead.settled,
      moneyRead.failed,
      moneyRead.ladder,
      leadingOpenInvoice,
      purchaseOrdersQuery.data,
      scheduleSettled,
      schedule,
      rosterSettled,
      callSheetEnabled,
      rosterCount,
      paperRegionKeys,
    ],
  );

  return (
    <TicketFace
      input={ticketInput}
      routeId={routeId}
      onOpenLeaf={onOpenLeaf}
      onUnfoldRegion={onUnfoldRegion}
      onRows={onRows}
    />
  );
}

/**
 * The ticket on a document that has no project yet — the four stages before
 * the work starts (brief · discovery · direction · proposal).
 *
 * It reads the PROPOSAL's three populations, never the project's. A direction
 * or a proposal document carries rooms, priced lines and boards of its own —
 * the very things the Speccing and Finalize tables mount beside this ticket —
 * so reporting them settled-and-empty printed `No rooms yet` above a rail
 * listing rooms. Everything a project owns and a proposal does not (the plan
 * room, the money ladder, the schedule, the roster) stays settled and empty:
 * an honest empty for a paper that genuinely has none.
 *
 * `JobTicketMount`'s own reads still may not run here. Its `enabled`-gated
 * queries would never answer with no project id, pinning rows at `Reading…`
 * for the life of the document, and its two un-`enabled` ones would fetch the
 * studio's whole ledger.
 */
function ProjectlessTicketMount({
  routeId,
  proposalId,
  section,
  regionSection,
  tableSlots,
  clientCopy,
  onOpenLeaf,
  onUnfoldRegion,
  onRows,
}: {
  routeId: string;
  /** The proposal this paper is composed from, where it has one. */
  proposalId: string | null;
  section: SectionKey;
  regionSection: SectionKey;
  tableSlots: readonly TicketSlotKey[] | undefined;
  clientCopy: TicketClientCopy | null;
  onOpenLeaf: (key: ShelfKey) => void;
  onUnfoldRegion: (region: DocumentIndexKey) => void;
  onRows: (rows: readonly TicketRow[]) => void;
}) {
  // The proposal's OWN three populations — the same reads the Speccing table's
  // rail, scheme and strip make from the same cache. All three are `enabled`
  // on the proposal id, so a brief or a discovery with no proposal runs none of
  // them and settles empty. Without this the ticket printed `No rooms yet`
  // directly above a rail listing rooms.
  const scopeRoomsQuery = useProposalScopeRooms(proposalId) as {
    data: Array<{ id: string; name: string | null }> | undefined;
    isLoading: boolean;
  };
  const proposalItemsQuery = useProposalScheduleItems(proposalId);
  const proposalBoardsQuery = useBoards(proposalId);

  const rooms = useMemo<TicketRoomFact[]>(
    () =>
      (scopeRoomsQuery.data ?? []).map((room) => ({
        id: room.id,
        name: room.name ?? 'Room',
      })),
    [scopeRoomsQuery.data],
  );
  const lines = useMemo<TicketLine[]>(
    () =>
      (proposalItemsQuery.data ?? []).map((item) => ({
        // A proposal line has no movement — nothing is ordered from a document
        // that has not become a project — so every line reads as the schedule's
        // own `specified` register and the census counts it `not ordered yet`.
        stamp: 'specified' as const,
        roomId: item.scope_room_id ?? null,
        specified: Boolean(item.product_id),
      })),
    [proposalItemsQuery.data],
  );
  const boardsCount = (proposalBoardsQuery.data ?? []).filter(
    (board) => board.status !== 'archived',
  ).length;

  const paperRegionKeys = useMemo(
    () => paperRegionsForSection(regionSection).map((region) => region.key),
    [regionSection],
  );
  // The prop is a fresh object on every render of the page, which sits above
  // an early return the memo it would need cannot be hoisted over. Its three
  // facts are what the derivation actually depends on.
  const copySettled = clientCopy?.settled ?? null;
  const copySent = clientCopy?.sent ?? null;
  const copyFailed = clientCopy?.failed ?? null;
  const ticketInput = useMemo<TicketInput>(
    () => ({
      section,
      phase: null,
      // No project stands behind this paper, so the three leaves and the call
      // sheet are not mounted (see the `DocumentShelves` and `CallSheetMount`
      // gates below) and those rows open nothing.
      project: false,
      tableSlots,
      rooms: { settled: !scopeRoomsQuery.isLoading, list: rooms },
      pieces: { settled: !proposalItemsQuery.isLoading, lines },
      // A plan room and a spec book are the project's; a paper with none has
      // nothing filed and nothing to read.
      drawings: { settled: true, sheetCount: 0 },
      boards: { settled: !proposalBoardsQuery.isLoading, count: boardsCount },
      money: {
        settled: true,
        failed: false,
        ladder: noProjectLadder(),
        owedDays: null,
        undrawnKind: null,
        owedSince: null,
      },
      dates: { settled: true, schedule: null },
      people: { settled: true, callSheetEnabled: false, rosterCount: 0 },
      clientCopy:
        copySettled == null || copySent == null
          ? null
          : { settled: copySettled, sent: copySent, failed: copyFailed ?? false },
      paperRegions: paperRegionKeys,
    }),
    [
      section,
      tableSlots,
      copySettled,
      copySent,
      copyFailed,
      paperRegionKeys,
      rooms,
      lines,
      boardsCount,
      scopeRoomsQuery.isLoading,
      proposalItemsQuery.isLoading,
      proposalBoardsQuery.isLoading,
    ],
  );
  return (
    <TicketFace
      input={ticketInput}
      routeId={routeId}
      onOpenLeaf={onOpenLeaf}
      onUnfoldRegion={onUnfoldRegion}
      onRows={onRows}
    />
  );
}

/**
 * The ticket itself, once its facts are settled — one derivation and one
 * render, whether the facts came from a project's seven reads or from a paper
 * that has no project to read.
 */
function TicketFace({
  input,
  routeId,
  onOpenLeaf,
  onUnfoldRegion,
  onRows,
}: {
  input: TicketInput;
  routeId: string;
  onOpenLeaf: (key: ShelfKey) => void;
  onUnfoldRegion: (region: DocumentIndexKey) => void;
  onRows: (rows: readonly TicketRow[]) => void;
}) {
  // The top of the paper on every document: the derivation runs when a fact
  // changes, not on every render one of the reads beneath it causes.
  const ticket = useMemo(() => {
    const rows = deriveTicket(input);
    return {
      rows,
      seam: deriveTicketSeam(rows, deriveTicketIdentity(input)),
      head: deriveTicketHead(input),
    };
  }, [input]);

  useEffect(() => {
    onRows(ticket.rows);
  }, [ticket.rows, onRows]);

  return (
    <JobTicket
      rows={ticket.rows}
      seam={ticket.seam}
      head={ticket.head}
      onOpenLeaf={onOpenLeaf}
      routes={{
        planroom: shelfRouteFor('planroom', routeId) ?? undefined,
        specbook: shelfRouteFor('specbook', routeId) ?? undefined,
        moodboards: boardsRoutePath(routeId),
      }}
      onUnfoldRegion={onUnfoldRegion}
      onOpenCallSheet={() =>
        window.dispatchEvent(
          new CustomEvent('document:open-call-sheet', {
            detail: { mode: 'sheet' },
          }),
        )
      }
    />
  );
}

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  // F2 — the body is keyed on the document id so picking up a DIFFERENT
  // document is a fresh mount by our own construction, not by trusting the
  // router to remount a segment whose param changed. What depends on it: the
  // table pin re-snapshots (R7's "re-opening the document adopts naturally"),
  // and the seal note's read-once guard re-arms for the arrival after a
  // redirect.
  const { id } = use(params);
  // The room lens wraps the whole document: the letterhead names the room in
  // hand, the paper lifts by it, and the shelves lift by it too — one hold,
  // read in three places.
  return (
    <RoomLensProvider>
      <DocumentPageBody key={id} params={params} />
    </RoomLensProvider>
  );
}

function DocumentPageBody({ params }: { params: Promise<{ id: string }> }) {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.doc); // R89 — scope help to the open document
  const { id } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  // Start to Signature W2 — the Worktable composes the paper's middle. Fails
  // closed: with the flag off this page prints exactly the composition it has
  // always printed, and every fixed part of the paper is identical either way.
  const worktableOn = useFeatureFlag('worktable').value;

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
  // The letterhead's red-letter zone (project documents only): every need this
  // document is carrying, printed once, instead of the guide's single sentence.
  // Sourced from the Desk composition ONLY — `undefined` means the composition
  // has not answered for this document, and the zone stands down in favour of
  // DocumentGuide rather than printing a local derivation: this page cannot
  // pass deriveNeeds the invoice/schedule facts the Desk holds, so that
  // fallback silently printed a SHORT list as if it were the whole list.
  const enrichedOperationalNeeds = deskEnrichment
    ? selectOperationalNeedsForDocument(enrichedOperationalQuery.data, row?.engagement_id)
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
  // The tie-break the red letter prints in and the guide leads with — one
  // ordering, so the sentence at the top of the paper names the same need the
  // zone's first row does.
  const rankedOperationalNeeds = useMemo(
    () =>
      enrichedOperationalNeeds
        ? rankOperationalNeeds(enrichedOperationalNeeds, gateNow)
        : undefined,
    [enrichedOperationalNeeds, gateNow],
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
  // A3-L7 — the care rest state ("Everything is settled." / CLOSE THE BOOK) is
  // gated on the closure gate the Care band alone can compute: it is the only
  // reader of the eight closeout queries AND of the checklist's own state. The
  // band publishes its answer here rather than the page paying for that read
  // twice and getting a second answer.
  const [closureReady, setClosureReady] = useState(false);
  // FIX 2 — the event's optional { mode } detail (default 'sheet'), read off
  // whichever dispatch opened it and forwarded straight through to CallSheet.
  const [callSheetMode, setCallSheetMode] = useState<CallSheetOpenMode>('sheet');
  // The shelves — one leaf open at a time, beside the spine. The call sheet is
  // not one of them: it is a doorway to the roster sheet mounted below.
  const [openShelf, setOpenShelf] = useState<ShelfLeafKey | null>(null);
  const { heldRoomId, toggleRoom } = useRoomLens();
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
    // A ⌘K row that named a document NOT in hand walked here instead of
    // dispatching into a page that had no listener yet; the flag is the
    // intent, read and cleared once on arrival (openCaptureLead's pattern).
    if (callSheetPending.value) {
      callSheetPending.value = false;
      setCallSheetMode('sheet');
      setCallSheetOpen(true);
    }
    return () => window.removeEventListener('document:open-call-sheet', onOpenCallSheet);
  }, []);

  // R25 rooms (spine-sheet jump rows + headings) · R23 gates (settled stamps).
  const { data: docRooms, isLoading: docRoomsLoading } = useDocumentRooms(
    row?.project_id ?? null,
  );
  const docRoomsSettled = Boolean(row?.project_id) && !docRoomsLoading;
  const { data: sectionGates } = useSectionGates(row?.project_id ?? null);

  // R6: an activated proposal's id redirects to its project document —
  // pre-signing links survive the signing moment. replace(), not push.
  useEffect(() => {
    if (resolution?.kind !== 'redirect') return;
    // W2 — the turn the seal performs is announced on the destination's paper.
    if (worktableOn) markSealTurn(resolution.projectId);
    router.replace(`/doc/${resolution.projectId}`);
  }, [resolution, router, worktableOn]);

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

  // B1 — the force-close is gone. A shelf carried below 1440 used to be
  // dropped on the floor because its leaf became display:none; ShelfPanel now
  // routes it to the shelf's own page instead, so the reader arrives at what
  // they opened rather than at nothing.

  // The region a ticket row unfolds — the same request and the same landing the
  // running index's own rows make, so a jump from the ticket and a jump from
  // the index take the reading line to the same place by the same act.
  const unfoldRegion = useCallback(
    (key: DocumentIndexKey) => {
      requestRegionUnfold(key);
      scrollToRegion(key, row?.project_id ?? '');
    },
    [row?.project_id],
  );

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

  // The ticket's identity line names the PHASE and its fraction, never the
  // section word (direction-b §5 — two vocabularies, two jobs). Null until the
  // resolver has placed a phase: `Procurement & Orders 4 of 6` with no phase
  // behind it would be a fraction of nothing.
  const ticketPhase = useMemo<TicketPhase | null>(() => {
    const name = scheduleVitals?.activePhaseName ?? null;
    const activeId = scheduleFacts?.selection.activePhaseId ?? null;
    if (!name || !activeId) return null;
    const ordered = [...scheduleQuery.phases].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    const index = ordered.findIndex((phase) => phase.id === activeId);
    if (index < 0) return null;
    return { name, position: index + 1, of: ordered.length };
  }, [scheduleVitals, scheduleFacts, scheduleQuery.phases]);

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
  // The wall's own line, for the proposal stage's dated headline and SP-12's
  // live verb. Built here rather than through `useProposalWatch` because the
  // engagement aggregate and the raw event log feed only the open count and the
  // record — no field `deriveSendWallLine` reads — so the two extra reads would
  // buy nothing and would fire on every document route.
  const sendWallLine = useMemo(() => {
    if (!liveProposal) return null;
    const watch = deriveProposalWatch(
      {
        status: liveProposal.status,
        sentAt: liveProposal.sent_at ?? null,
        viewedAt: liveProposal.viewed_at ?? null,
        acceptedAt: liveProposal.accepted_at ?? null,
        lastNudgedAt: liveProposal.last_nudged_at ?? null,
        version: liveProposal.version ?? null,
      },
      null,
      null,
      gateNow,
    );
    return deriveSendWallLine(
      {
        watch,
        commercialState: liveProposal.commercial_state ?? null,
        issuedOnPaper: Boolean(liveProposal.issued_on_paper),
      },
      gateNow,
    );
  }, [liveProposal, gateNow]);
  const proposalGuideFacts: ProposalGuideFacts | null = liveProposal
    ? {
        status: asLegacyProposalLifecycle(liveProposal.status),
        documentKind: asCommercialDocumentKind(liveProposal.document_kind),
        commercialState: asCommercialState(liveProposal.commercial_state),
        projectId: liveProposal.project_id ?? null,
      }
    : null;
  const discoveryReadiness: DocumentGuideReadinessFacts['discovery'] = discoveryQuery.isError
    ? { state: 'error' }
    : discoveryQuery.isLoading
      ? { state: 'loading' }
      : discoveryQuery.data
        ? { state: 'ready', data: discoveryQuery.data.row ?? discoveryQuery.data.prefill ?? {} }
        : { state: 'idle' };
  const draftingReadiness: DocumentGuideReadinessFacts['drafting'] = draftingState.error
    ? { state: 'error' }
    : draftingState.isLoading
      ? { state: 'loading' }
      : { state: 'ready', data: { gaps: draftingState.gaps } };
  const guideInputs = row
    ? composeDocumentGuideInputs({
        row,
        proposal: proposalGuideFacts,
        readiness: { discovery: discoveryReadiness, drafting: draftingReadiness },
      })
    : [];
  // A3-L7's rest states read an empty `guideInputs` as "nothing outstanding".
  // On these two stages that list is also empty while its own read is still in
  // flight, so the stage would announce itself finished on a fact nobody has
  // stated yet. Pending is not quiet.
  const guideInputsPending =
    (row?.active_section === 'discovery' && discoveryReadiness.state !== 'ready') ||
    (row?.active_section === 'direction' && draftingReadiness.state !== 'ready');
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
  // B2 — the eight rows the ticket is printing, reported up by its mount. The
  // guide's leader is elected from these, so it can never name something the
  // map on the same paper does not show. Null on a document with no ticket,
  // and null until the mount's first report.
  const [ticketRows, setTicketRows] = useState<readonly TicketRow[] | null>(null);
  const acceptTicketRows = useCallback((rows: readonly TicketRow[]) => {
    setTicketRows((previous) =>
      sameTicketRows(previous, rows) ? previous : rows,
    );
  }, []);
  // The Desk composition enriches guidance; it never gates it. A cold deep-link
  // renders the document's own derivation on first paint and upgrades in place
  // if the Desk read later contributes a need the row alone cannot carry.
  const guideModel = row
    ? deriveDocumentGuide({
        row,
        availability: guideUnavailable ? 'unavailable' : 'ready',
        retryAvailable: deskGuidanceFailed,
        proposal: proposalGuideFacts
          ? { ...proposalGuideFacts, sendWall: sendWallLine }
          : null,
        schedule: scheduleFacts,
        inputFacts: guideInputs,
        inputsPending: guideInputsPending,
        operationalNeed: rankedOperationalNeeds?.[0] ?? enrichedOperationalNeed,
        gate: nearestGate,
        closureReady,
        ticketRows,
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

  const redLetterRows: RedLetterRow[] = useMemo(() => {
    if (!row || row.engagement_kind !== 'project') return [];
    const needs = rankedOperationalNeeds;
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
  }, [row, rankedOperationalNeeds, activateDestination]);

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

  // W2 — which table the paper composes as, and the pin that holds it still.
  // Memoized on the two facts it reads so the pin's snapshot is taken once per
  // real change rather than once per render. The pin runs in both flag states
  // (rules of hooks); with the flag off nothing reads its answer.
  const activeSection = row?.active_section;
  const liveProposalStatus = liveProposal?.status ?? null;
  const derivedTable = useMemo(
    () =>
      activeSection
        ? deriveTableComposition({
            activeSection,
            proposalStatus: liveProposalStatus,
          })
        : null,
    [activeSection, liveProposalStatus],
  );
  const tablePin = useTablePin(derivedTable);
  // W3 — the room in hand at the Speccing table's head. The rail reports it;
  // the scheme and the boards strip lift by it. One id or null, reset per
  // document by the F2 key={id} remount above — no extra machinery. This is
  // deliberately NOT the project room lens (room-lens-context): different
  // store, different subject, and this one persists at every width (A7).
  const [roomInHand, setRoomInHand] = useState<string | null>(null);
  // W4b — whether the schedule has a release to offer. Reported up by the FF&E
  // section, which is where `canRelease` and per-line eligibility are derived;
  // the Delivery table head only prints the leader it is told exists.
  const [releaseOffered, setReleaseOffered] = useState(false);
  // The seal note is read ONCE per arrival: the marker is cleared as it is
  // read, and held in state so this mount keeps printing it.
  const [sealTurnNoted, setSealTurnNoted] = useState(false);
  const sealTurnRead = useRef(false);
  const arrivedProjectId = row?.project_id ?? null;
  useEffect(() => {
    if (!worktableOn || !arrivedProjectId || sealTurnRead.current) return;
    sealTurnRead.current = true;
    if (readAndClearSealTurn(arrivedProjectId)) setSealTurnNoted(true);
  }, [worktableOn, arrivedProjectId]);

  const rosterProjectId =
    callSheetGate.value && row?.engagement_kind === 'project' && row.project_id
      ? row.project_id
      : null;
  const { data: rosterRows, isLoading: rosterLoading } =
    useProjectRoster(rosterProjectId);
  const rosterSettled = Boolean(rosterProjectId) && !rosterLoading;
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
            className="text-[var(--color-clay-ink)]"
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
          className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay-ink)]"
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
  // B1 — the rooms and the shelves left the spine for the ticket, so the
  // widened section predicate goes with them: the one block left is the running
  // index, and the only thing it needs is regions to name. `paperRegionsForSection`
  // already answers empty for a spread that mounts none (C11), so the gate is
  // read off the regions themselves rather than kept as a second list of
  // section names that can drift from it.
  const paperRegions =
    row.engagement_kind === 'project' && row.project_id
      ? paperRegionsForSection(row.active_section)
      : [];
  const shelvedSpine =
    row.project_id && paperRegions.length > 0 ? (
      <DocSpineShelvedBlocks
        projectId={row.project_id}
        regions={paperRegions}
        rooms={docRooms ?? []}
        scheduleValue={scheduleFacts?.positionText ?? 'Not scheduled'}
        approvalsValue={
          approvalsQuery.isLoading
            ? 'Reading…'
            : `${(approvalsQuery.data ?? []).length} in the log`
        }
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
  // W2 — the table, or nothing. Which section's spread stands on the paper is
  // the pinned composition's answer while the flag is on, so a derivation that
  // moves under the designer's hands cannot re-compose the middle; every other
  // read on this page stays on the live row.
  const table = worktableOn ? tablePin.composition : null;
  const spreadSection = table ? table.section : row.active_section;
  // W4a — the Finalize table: the LEGACY proposal in the client's hands. Its
  // head, its leader, its Offer facets and its one shelf stand only here.
  //
  // The document-kind gate is load-bearing, not decoration: the head's headline
  // counts per-line client verdicts and its leader is derived from the legacy
  // watch, and neither is a sentence a design-services agreement or a
  // furnishings authorization can say. Without it those editions lost the
  // letterhead's verdict whisper (stood down for a head that was speaking the
  // wrong language), and on `commercial_readonly` — where ProposalInstruments
  // prints nothing at all — the wrong leader was the document's only act. Same
  // predicate `OfferFacets` holds one component down.
  const finalizeTable =
    table?.table === 'finalize' &&
    row.engagement_kind === 'proposal' &&
    commercialDocumentExperience(liveProposal?.document_kind) === 'legacy';
  // The client's copy, and whether it has gone out — the proposal's one shelf
  // until B2 made it the ticket's NINTH row. Non-null only on the Finalize
  // table, which is what keeps the ticket eight rows on every other paper. The
  // leaf it opens is still mounted below; only the trigger moved.
  const clientCopy: TicketClientCopy | null =
    finalizeTable && row.proposal_id
      ? {
          settled: Boolean(liveProposal),
          sent: Boolean(liveProposal?.sent_at),
          // A failed read wears its own face. Settling an error as `not sent
          // yet` tells a designer the proposal in the client's hands never went
          // out — the same conflation `Reading…` is kept apart from, with the
          // worse of the two lies substituted for the harmless one.
          failed: proposalIsError && !liveProposal,
        }
      : null;
  // W4b — the Delivery table's procurement setting: the one composition where
  // the release leader stands at the table head. Null off the flag, so nothing
  // below it can lift, seam, or demote anything.
  const deliveryProcurement =
    table?.table === 'delivery' && table.setting === 'procurement';
  // W3 — the Speccing table's four tools on W2's slots: rooms → the work →
  // the tools. Proposal-keyed on `row.proposal_id`: 00327's Shape B emits the
  // LIVE chain version (pr.id) there while `engagement_id` carries the chain
  // root — and never the raw route param, which an aliased arrival (J6) has
  // already redirected off before the table composes. The frame mounts these
  // only on the Speccing table; building them here for other rows creates
  // elements, never mounts.
  const speccingSlots: SpeccingTableSlots = row.proposal_id
    ? {
        'rooms-rail': (
          <RoomsRail
            proposalId={row.proposal_id}
            value={roomInHand}
            onChange={setRoomInHand}
          />
        ),
        scheme: <Scheme proposalId={row.proposal_id} roomFilter={roomInHand} />,
        'boards-strip': (
          <BoardsStrip proposalId={row.proposal_id} roomFilter={roomInHand} />
        ),
        'reach-in': <LibraryReachIn proposalId={row.proposal_id} />,
      }
    : {};
  // THE TICKET — the document's map, composed ONCE here and printed in exactly
  // one of two positions (B2-L4, direction-b §9). With no table it stands
  // between the letterhead and the guide, which is where B1 mounted it and
  // where it stays on today's paper. With a table it stands above the table:
  // the job's header over the job's middle (I138), the same rows, values,
  // doors and seam either way — what differs is only what sits beneath it.
  // `TableFrame` prints nothing when it has no composition, so handing the
  // node to both positions cannot print two.
  //
  // THE ORDER, RULED. direction-b §2.2 draws LETTERHEAD → TICKET → GUIDE on the
  // paper with no table, and §9 asks for the ticket immediately above
  // `TableFrame` where one stands — which puts the guide above the ticket on
  // the four compositions. §9 wins, and deliberately: the guide's sentence is a
  // quotation of a ticket row, and the reader who wants the whole map is one
  // scroll from it either way, while a ticket divorced from the table it heads
  // stops being the job's header over the job's middle (I138). Nothing about
  // the guide's own position changes with the flag off.
  //
  // All seven spreads print it. A document that carries a project reads its
  // seven facts; the four stages before the work starts have no project to
  // read and print the honest empties `deriveTicket` holds for them. Exactly
  // one of the two mounts stands on any document, so the rows the guide's
  // leader is elected from are always the rows on this paper.
  // The three shelf leaves and the call sheet are project-keyed and mounted
  // only on a project document (see `DocumentShelves` / `CallSheetMount`
  // below). The ticket reads the SAME predicate, so a row never prints a `→`
  // for a leaf this document has not mounted.
  const ticketLeaves =
    row.engagement_kind === 'project' && Boolean(row.project_id);
  // The Speccing table already stands I139's rooms rail and Q1/C9's on-paper
  // boards strip on this paper, so those two rows anchor to them instead of
  // opening a second door to the same subject (direction-b §9).
  const ticketSlots: readonly TicketSlotKey[] | undefined =
    table?.table === 'speccing' && row.proposal_id
      ? SPECCING_TICKET_SLOTS
      : undefined;
  // direction-b §3.3's project specimen rides the Pieces row.
  const unansweredPo: TicketUnansweredPo | null =
    row.unacked_po_count > 0 && row.oldest_unacked_sent_at
      ? {
          count: row.unacked_po_count,
          label: row.unacked_po_label,
          sentAt: row.oldest_unacked_sent_at,
        }
      : null;
  const jobTicket =
    row.project_id ? (
      <JobTicketMount
        projectId={row.project_id}
        routeId={id}
        section={row.active_section}
        regionSection={spreadSection}
        project={ticketLeaves}
        tableSlots={ticketSlots}
        unansweredPo={unansweredPo}
        phase={ticketPhase}
        rooms={docRooms ?? []}
        roomsSettled={docRoomsSettled}
        schedule={scheduleFacts}
        scheduleSettled={!scheduleQuery.isLoading}
        callSheetEnabled={callSheetGate.value}
        rosterCount={(rosterRows ?? []).length}
        rosterSettled={rosterSettled}
        onOpenLeaf={toggleShelf}
        onUnfoldRegion={unfoldRegion}
        onRows={acceptTicketRows}
        clientCopy={clientCopy}
      />
    ) : (
      <ProjectlessTicketMount
        routeId={id}
        proposalId={row.proposal_id}
        section={row.active_section}
        regionSection={spreadSection}
        tableSlots={ticketSlots}
        clientCopy={clientCopy}
        onOpenLeaf={toggleShelf}
        onUnfoldRegion={unfoldRegion}
        onRows={acceptTicketRows}
      />
    );
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
          onReleaseRoom={heldRoomId ? () => toggleRoom(heldRoomId) : null}
        />

        {/* THE TICKET — the document's map, mounted by the DOCUMENT rather
            than the section, so all seven spreads read identically (B1, B2).
            Between the letterhead and the guide/red-letter zone on the paper
            that has no table; above the table where one stands, which is the
            position `TableFrame` prints it in below. */}
        {!table && jobTicket}

        {/* The red letter replaces the guide only where it can actually speak
            for the document: a composed Desk answer for THIS engagement that
            carries at least one row. With no composition, a failed Desk read
            (whose retry lives on the guide), or a composition that answered
            "nothing", the project document keeps the same guide every other
            kind gets — the zone renders null on an empty list, so without the
            row count this branch printed nothing at all, and silence is not a
            state this page is allowed to render. */}
        {guideModel &&
          (row.engagement_kind === 'project' &&
          enrichedOperationalNeeds &&
          redLetterRows.length > 0 &&
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
            <TableFrame
              composition={table}
              pending={worktableOn ? tablePin.pending : null}
              onTurn={tablePin.turn}
              sealTurn={sealTurnNoted ? { signedDate: seal?.date ?? null } : null}
              slots={speccingSlots}
              ticket={jobTicket}
            >
            {/* W4c — Table I's spread header: the household chip promoted into
                the spread. Printed identity only (Q6). Mounted only on the
                composed Intake table — `table` is null with the flag off, so
                the flag off is byte-identical — and only on the DISCOVERY
                spread, because on the brief spread BriefSection prints the same
                three facts immediately below. The component holds both gates as
                its own law. */}
            {table?.table === 'intake' && (
              <IntakeSpreadHeader
                table={table.table}
                section={spreadSection}
                leadId={row.lead_id}
                clientName={row.client_name}
              />
            )}
            {spreadSection === 'brief' && row.lead_id && <BriefSection leadId={row.lead_id} />}
            {spreadSection === 'discovery' && row.engagement_id && row.designer_id && (
              <DiscoverySection
                engagementId={row.engagement_id}
                designerId={row.designer_id}
                clientProfileId={row.client_profile_id}
                clientName={row.client_name}
                projectId={row.project_id ?? null}
              />
            )}
            {(spreadSection === 'direction' || spreadSection === 'proposal') &&
              row.proposal_id && (
                <section>
                  <div className="mb-1.5 mt-5 flex items-baseline justify-between">
                    <h2 className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">
                      {spreadSection === 'direction' ? 'Direction' : 'Proposal'}
                      {liveProposal?.version ? ` · v${liveProposal.version}` : ''}
                    </h2>
                    <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      {sections.find((s) => s.key === spreadSection)?.sub}
                    </span>
                  </div>
                  {/* C3 — a quiet letterhead read of where the client's verdicts
                      stand ("4 of 12 approved · 1 flagged"). Nothing when the
                      client hasn't weighed in yet. W4a: on the Finalize table
                      this whisper stands down — the same sentence is that
                      table's headline, and one fact prints at one weight. */}
                  {row.engagement_kind === 'proposal' &&
                    verdictSummary &&
                    !finalizeTable && (
                      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                        {verdictSummary}
                      </p>
                    )}
                  {/* W4a — the Finalize table's head: the verdict roll-up as the
                      headline sentence, and the one inked leader the lifecycle ×
                      verdicts × send-wall matrix allows. */}
                  {finalizeTable && (
                    <FinalizeHead
                      proposalId={row.proposal_id}
                      clientName={row.client_name}
                    />
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
                      onFinalizeTable={finalizeTable}
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
                  <ProposalBlocksReadOnly
                    proposalId={row.proposal_id}
                    omitOfferBlocks={finalizeTable}
                  />
                  {/* W4a — the Drafting Room's Offer movement (Phases ·
                      Exclusions · Payments · Terms), folding open under the
                      spread in the Room's own seam form. */}
                  {finalizeTable && <OfferFacets proposalId={row.proposal_id} />}
                </section>
              )}
              {spreadSection === 'project' && row.project_id && (
                <>
                  {/* W4b — the release ceremony's leader, at the head of the
                    Delivery table instead of inside the FF&E region's ledger.
                    The section below demotes to its next verb so the page still
                    carries exactly one inked release. */}
                  {deliveryProcurement && releaseOffered && <ReleaseLift />}
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
                  {/* Wave 1P (spec §11.2) — the Room-files zone the component's
                    own docstring was written for and nothing ever mounted.
                    Unflagged by FC-R10: it returns null for a project with no
                    Room-File-bearing scans, so a field-less project renders
                    exactly as it did before this line existed. */}
                  <RoomFilesSection projectId={row.project_id} />
                  <FFESection
                    projectId={row.project_id}
                    projectName={row.title}
                    mode="project"
                    needs={rankedOperationalNeeds}
                    highlightId={highlightLineId}
                    onAddNote={setPendingNoteAnchor}
                    sectionKey="project"
                    clientUserId={row.client_profile_id}
                    clientName={row.client_name}
                    folioDrop={folioDrop}
                    onFolioDropConsumed={() => setFolioDrop(null)}
                    sectionDragOver={sectionDrag}
                    releaseLeaderElsewhere={deliveryProcurement}
                    onReleaseOffered={
                      deliveryProcurement ? setReleaseOffered : undefined
                    }
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
                      /* W4b — on the table money is what the work is measured
                         against, not the work: one seam, one press from full. */
                      tableSeam={deliveryProcurement}
                    />
                  )}
                  {/* R80: the Care band — closure stays reachable from an active
                    project (a quiet folded line until install nears). */}
                  <CareBand projectId={row.project_id} onCloseoutReady={setClosureReady} />
                </>
              )}
            {spreadSection === 'install' && row.project_id && (
              <>
                <FFESection
                  projectId={row.project_id}
                  projectName={row.title}
                  mode="install"
                  needs={rankedOperationalNeeds}
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
                <CareBand projectId={row.project_id} onCloseoutReady={setClosureReady} />
              </>
            )}
            {spreadSection === 'care' && (
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
                    needs={rankedOperationalNeeds}
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
            </TableFrame>
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
            {/* F1 — the band and the money region are one either-or, so both
                sides read the SAME section. The money region mounts inside the
                pinned spread; a band gated on the live row would print the
                accounts twice (or nowhere) for as long as an armed turn goes
                unpressed. Off the flag `spreadSection` IS `row.active_section`. */}
            {spreadSection !== 'project' && (
              <AccountBand
                projectId={row.project_id}
                clientName={row.client_name}
                activeSection={spreadSection}
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
          /* The ticket's `Boards` row means one act at every width and on
             every project-kind spread; the leaf answers as its page does. */
          canCreateBoards={row.engagement_kind === 'project'}
        />
      )}

      {/* W4a — the Finalize table's one leaf: the client's copy, live. */}
      {finalizeTable && row.proposal_id && (
        <DocumentShelves
          openShelf={openShelf}
          onClose={() => setOpenShelf(null)}
          routeId={id}
          proposalId={row.proposal_id}
          clientName={row.client_name}
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
