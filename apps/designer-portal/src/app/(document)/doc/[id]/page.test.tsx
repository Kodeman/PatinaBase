import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import DocumentPage from './page';
import { authorizationDoorwayFor } from '@/lib/document/authorization-doorway';

let mockHydrated = false;
const mockRetryDocumentResolution = jest.fn();
// A8: the recent-documents-in-hand MRU landedRef reads to decide whether to
// jump to the active section. Empty by default — most existing tests in
// this file exercise a "first open" shape and must not gain a surprise
// scroll-jump because of this addition.
let mockRecentDocumentsInHand: Array<{ id: string; title: string; subtitle?: string }> = [];
const mockHistoryToggled = jest.fn();
const mockDiscoveryFacetOpen = jest.fn();
let mockDiscoveryFacetExpanded = false;
/** Rows the real MarginRail composes into real MarginItems. */
let mockMarginItems: Array<Record<string, unknown>> = [];
let mockDocumentQuery: Record<string, unknown>;
let mockDiscoveryQuery: Record<string, unknown> = { data: undefined, isLoading: false, isError: false };
let mockDraftingState: Record<string, unknown> = { gaps: [], isLoading: false, error: null };
let mockProposalData: Record<string, unknown> | undefined;
let mockProposalError = false;
let mockProjectQuery: Record<string, unknown> = { data: undefined, isLoading: false, isError: false };
// W4: the recap line counts drafted-and-unsent client approvals off this read.
let mockProjectApprovalsQuery: Record<string, unknown> = { data: [] };
// R108: the letterhead vitals read the resolver, never a stored column.
const NO_RESOLVED_SCHEDULE = {
  phases: [],
  milestones: [],
  resolved: null,
  isLoading: false,
  isError: false,
};
let mockResolvedSchedule: Record<string, unknown> = NO_RESOLVED_SCHEDULE;
// Ruling V: the nearest open gate feeds the guide. Empty by default so the
// existing guide branches keep asserting the derivations they were written for.
let mockContextualHandoffsQuery: Record<string, unknown> = { data: [], isError: false };
type MockDeskData = {
  folders: Array<{
    row: { engagement_id: string };
    need: Record<string, unknown> | null;
    needs?: Array<Record<string, unknown>>;
  }>;
  chips: unknown[];
  composed: Record<string, true>;
};
let mockDeskData: MockDeskData = { folders: [], chips: [], composed: {} };
let mockDeskLoading = false;
let mockDeskError = false;
const mockRetryDesk = jest.fn();
// `enabled` does NOT withhold data: a disabled TanStack observer still reads the
// cache, and <CommandBar/> in (document)/layout.tsx keeps this exact key hot on
// every document route. The page must be safe against a populated cache it did
// not ask for, so these tests hand it one.
const mockUseDeskEngagements = jest.fn((_options?: { enabled?: boolean }) => ({
  data: mockDeskData,
  isLoading: mockDeskLoading,
  isError: mockDeskError,
  refetch: mockRetryDesk,
}));
const mockSelectOperationalNeed = jest.fn(
  (data: MockDeskData | undefined, engagementId: string | null | undefined) => {
    if (!data || !engagementId) return undefined;
    if (data.composed[engagementId] !== true) return undefined;
    return data.folders.find((folder) => folder.row.engagement_id === engagementId)?.need ?? null;
  },
);
// L1 — the red-letter zone's whole-chain reader (mirrors the singular reader
// above, sentinel-for-sentinel).
const mockSelectOperationalNeeds = jest.fn(
  (data: MockDeskData | undefined, engagementId: string | null | undefined) => {
    if (!data || !engagementId) return undefined;
    if (data.composed[engagementId] !== true) return undefined;
    return (
      data.folders.find((folder) => folder.row.engagement_id === engagementId)?.needs ?? []
    );
  },
);

jest.mock('@portabletext/react', () => ({
  PortableText: () => null,
  toPlainText: () => '',
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useProjectRoomScans: () => ({ data: [] }),
  useGeneratedRoomFilesByScan: () => ({ data: new Map() }),
  useProjectV2: () => mockProjectQuery,
  useProjectPhases: () => ({ data: [] }),
  useProjectApprovals: () => mockProjectApprovalsQuery,
  useProposalFeedback: () => ({ data: [] }),
  useProjectRoster: () => ({ data: [] }),
  useDiscovery: () => mockDiscoveryQuery,
  // Read by the real MarginRail.
  useProjectFFEItems: () => ({ data: [] }),
  useProjectContextualHandoffs: () => mockContextualHandoffsQuery,
  useProjectParties: () => ({ data: [] }),
  useCoordinationItems: () => ({ data: [] }),
  useDesignerClientForClientUser: () => ({ data: null }),
  useProjectWorkflow: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
  useResolvedSchedule: () => mockResolvedSchedule,
}));

// The project document's own sections are not what these tests exercise; the
// guide strip and the margin are.
jest.mock('@/components/document/ffe-section', () => ({ FFESection: () => null }));
jest.mock('@/components/document/schedule/schedule-spine', () => ({ ScheduleSpine: () => null }));
jest.mock('@/components/document/approvals/project-approval-document', () => ({
  ProjectApprovalDocument: () => null,
}));
jest.mock('@/components/document/commercial/project-authority-band', () => ({
  ProjectAuthorityBandForProject: () => null,
}));
jest.mock('@/components/document/commercial/project-commerce-section', () => ({
  ProjectCommerceSection: () => null,
}));
jest.mock('@/components/document/care-band', () => ({ CareBand: () => null }));
// Real section bodies this suite's install/care fixtures (F14) now reach but
// do not exercise — stubbed the same way FFESection/ScheduleSpine/CareBand
// above are, rather than threading every supabase hook their subtrees use.
jest.mock('@/components/document/quiet-sections', () => ({ CareSection: () => null }));
jest.mock('@/components/document/schedule/install-window-ceremony', () => ({
  InstallWindowCeremony: () => null,
}));
jest.mock('@/components/document/account-band', () => ({ AccountBand: () => null }));
jest.mock('@/components/document/commercial/money-region', () => ({ MoneyRegion: () => null }));
jest.mock('@/components/document/roster/kickoff-band', () => ({ KickoffBand: () => null }));
// A1-L2's contract: the page hands this component the exact `regions` subset
// `paperRegionsForSection` returned for the spread. Render that list as
// testable rows here — the component's OWN rendering of them (labels, scroll
// targets, fold state) is `shelved-spine.test.tsx`'s job (A1-L2), not this
// integration suite's; this mock exists only to prove the page wired the
// right subset through.
jest.mock('@/components/document/spine-shelved-blocks', () => ({
  DocSpineShelvedBlocks: (props: { regions: ReadonlyArray<{ key: string }> }) => (
    <ul data-testid="shelved-spine-regions" aria-label="In this document">
      {props.regions.map((region) => (
        <li key={region.key}>{region.key}</li>
      ))}
    </ul>
  ),
}));
jest.mock('@/components/document/shelves/document-shelves', () => ({
  DocumentShelves: () => null,
}));
jest.mock('@/components/document/roster/call-sheet-mount', () => ({ CallSheetMount: () => null }));

jest.mock('@/hooks/use-hydrated', () => ({
  useHydrated: () => mockHydrated,
}));

jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => mockDocumentQuery,
}));

jest.mock('@/hooks/document-time-provider', () => ({
  useHoldDocument: jest.fn(),
}));

jest.mock('@/components/document/mobile/mobile-shell', () => ({
  useMobileActiveDoc: jest.fn(),
  useMobilePrimaryAction: jest.fn(),
}));

jest.mock('@/components/document/doc-spine', () => ({
  // F14/C11: the page passes its shelved-blocks element (or null) as `shelved`
  // — render it, or `DocSpineShelvedBlocks`'s own mock above never mounts.
  DocSpine: ({
    onJump,
    shelved,
  }: {
    onJump: (section: string) => void;
    shelved?: ReactNode;
  }) => (
    <>
      <button type="button" onClick={() => onJump('brief')}>Jump to brief</button>
      {shelved}
    </>
  ),
}));
jest.mock('@/components/document/doc-letterhead', () => ({
  DocLetterhead: ({
    title,
    vitals,
    needsSetup,
  }: {
    title: string;
    vitals?: string;
    needsSetup?: Array<{ text: string; remedyLabel: string; onActivate: () => void }> | null;
  }) => (
    <header>
      {title}
      <span data-testid="doc-vitals">{vitals}</span>
      <span data-testid="doc-needs-setup-count">{needsSetup?.length ?? 0}</span>
      {(needsSetup ?? []).map((entry) => (
        <button key={entry.text} type="button" onClick={entry.onActivate}>
          {`${entry.text} · ${entry.remedyLabel}`}
        </button>
      ))}
    </header>
  ),
}));
jest.mock('@/components/document/brief-section', () => ({
  BriefSection: () => <div>Brief work</div>,
}));
jest.mock('@/components/document/brief-recap', () => ({ BriefRecap: () => <div>Brief recap</div> }));
jest.mock('@/components/document/discovery/discovery-section', () => ({
  DiscoverySection: () => (
    <>
      <button id="discovery-facet-budget" type="button" aria-expanded={mockDiscoveryFacetExpanded} onClick={mockDiscoveryFacetOpen}>
        Budget comfort
      </button>
      <div id="document-decision-controls" tabIndex={-1}>Decision controls</div>
    </>
  ),
}));
jest.mock('@/components/document/proposal-blocks-readonly', () => ({ ProposalBlocksReadOnly: () => null }));
jest.mock('@/components/document/proposal-instruments', () => ({ ProposalInstruments: () => null }));
jest.mock('@/components/document/folio-strip', () => ({ FolioLetterhead: () => null, ProposalFolioStrip: () => null }));
jest.mock('@/components/document/mobile/mobile-margin-chips', () => ({ MobileMarginChips: () => null }));
jest.mock('@/components/document/letterhead-instruments', () => ({ LetterheadInstruments: () => null }));
jest.mock('@/components/document/schedule/schedule-nav-context', () => ({
  ScheduleNavProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/document/schedule/schedule-ripple-context', () => ({
  RippleProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/document/project-schedule-handoff-mount', () => ({ ProjectScheduleHandoffMount: () => null }));
jest.mock('@/components/document/schedule/schedule-rule-region', () => ({
  ScheduleRuleRegion: () => null,
}));
// margin-rail is deliberately NOT mocked: the pulse activation path runs
// through the real MarginRail → MarginItem, which is where the targetId and the
// aria-expanded contract actually live. Only its data and its unfolded body are
// stubbed.
jest.mock('@/components/document/discovery/discovery-margin', () => ({
  DiscoveryMargin: () => null,
}));
jest.mock('@/components/document/margin-bodies', () => ({
  MarginItemBody: () => <div>Pulse body</div>,
}));
jest.mock('@/hooks/use-margin-items', () => ({
  useMarginItems: () => ({ data: mockMarginItems, isLoading: false }),
}));
jest.mock('@/hooks/use-margin-notes', () => ({
  useCreateMarginNote: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-project-file-change-notifications', () => ({
  useProjectFileChangeNotifications: () => ({ data: [] }),
  useMarkProjectFileChangeRead: () => jest.fn(),
}));
jest.mock('@/components/document/doc-colophon', () => ({ DocColophon: () => null }));

jest.mock('@/components/document/schedule/schedule-rule', () => ({
  ScheduleRule: ({
    projectId,
    projectTitle,
  }: {
    projectId: string;
    projectTitle: string;
  }) => (
    <div data-testid="schedule-rule">
      Schedule rule · {projectId} · {projectTitle}
    </div>
  ),
}));

jest.mock('@/components/document/schedule/schedule-confirm-strip', () => ({
  ScheduleConfirmStrip: ({ projectId }: { projectId: string }) => (
    <div data-testid="schedule-confirm">Confirm schedule · {projectId}</div>
  ),
}));

jest.mock('@/components/document/phase-advance-control', () => ({
  PhaseAdvanceControl: ({
    projectId,
    phases,
  }: {
    projectId: string;
    phases: readonly unknown[] | undefined;
  }) => (
    <div data-testid="phase-handoffs">
      Phase handoffs · {projectId} · {phases?.length ?? 0}
    </div>
  ),
}));

jest.mock('@/hooks/use-document-presence', () => ({
  useDocumentPresence: () => [],
}));

jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({ data: mockProposalData, isError: mockProposalError }),
}));

jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingState: () => mockDraftingState,
}));

jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: (options?: { enabled?: boolean }) => mockUseDeskEngagements(options),
  selectOperationalNeedForDocument: (
    data: typeof mockDeskData | undefined,
    engagementId: string | null | undefined,
  ) =>
    mockSelectOperationalNeed(data, engagementId),
  selectOperationalNeedsForDocument: (
    data: typeof mockDeskData | undefined,
    engagementId: string | null | undefined,
  ) =>
    mockSelectOperationalNeeds(data, engagementId),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-section-work', () => ({
  gateState: jest.fn(),
  useSectionGates: () => ({ data: [] }),
  useSectionTasks: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

jest.mock('@/lib/help-system/use-document-surface', () => ({
  useDocumentSurface: jest.fn(),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  rememberDocumentInHand: jest.fn(),
  readRecentDocumentsInHand: () => mockRecentDocumentsInHand,
  documentEvents: {
    historyToggled: (...args: unknown[]) => mockHistoryToggled(...args),
    guideShown: jest.fn(),
    guideSelected: jest.fn(),
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    // The real MarginRail leads with the R94 first-touch margin note.
    wayfinding: { marginNote: jest.fn() },
  },
}));

/** A truthful matchMedia: min-width queries answer against `width`, and the
 *  motion query answers the stated preference. Anything else is false rather
 *  than accidentally true. */
function setViewport({ width, reducedMotion }: { width: number; reducedMotion: boolean }) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => {
    const minWidth = /min-width:\s*(\d+)px/.exec(query);
    const matches = minWidth
      ? width >= Number(minWidth[1])
      : query.includes('prefers-reduced-motion: reduce')
        ? reducedMotion
        : false;
    return {
      matches,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
  }) as unknown as typeof window.matchMedia;
}

const fulfilledParams = {
  status: 'fulfilled',
  value: { id: 'missing-document' },
  then: () => undefined,
} as unknown as Promise<{ id: string }>;

describe('DocumentPage hydration render behavior', () => {
  beforeEach(() => {
    mockHydrated = false;
    mockRetryDocumentResolution.mockReset();
    mockDocumentQuery = {
      data: { kind: 'missing' },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: mockRetryDocumentResolution,
    };
  });

  it('keeps a warm non-loading client result on the server loading tree until hydration', () => {
    const { rerender } = render(<DocumentPage params={fulfilledParams} />);

    expect(screen.getByText('Picking up…')).toBeVisible();
    expect(screen.queryByText('No document answers to this name.')).not.toBeInTheDocument();

    mockHydrated = true;
    rerender(<DocumentPage params={fulfilledParams} />);

    expect(screen.queryByText('Picking up…')).not.toBeInTheDocument();
    expect(screen.getByText('No document answers to this name.')).toBeVisible();
  });

  it('offers a retry instead of hanging when document resolution fails', () => {
    mockHydrated = true;
    mockDocumentQuery = {
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      refetch: mockRetryDocumentResolution,
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.queryByText('Picking up…')).not.toBeInTheDocument();
    expect(screen.getByText('This document could not be picked up.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockRetryDocumentResolution).toHaveBeenCalledTimes(1);
  });
});

describe('DocumentPage guide activation', () => {
  beforeEach(() => {
    mockHydrated = true;
    mockHistoryToggled.mockReset();
    mockDiscoveryFacetOpen.mockReset();
    mockDiscoveryFacetExpanded = false;
    mockMarginItems = [];
    mockDiscoveryQuery = { data: undefined, isLoading: false, isError: false };
    mockDraftingState = { gaps: [], isLoading: false, error: null };
    mockProposalData = undefined;
    mockProposalError = false;
    mockProjectQuery = { data: undefined, isLoading: false, isError: false };
    mockProjectApprovalsQuery = { data: [] };
    mockResolvedSchedule = NO_RESOLVED_SCHEDULE;
    mockContextualHandoffsQuery = { data: [], isError: false };
    mockDeskData = { folders: [], chips: [], composed: {} };
    mockDeskLoading = false;
    mockDeskError = false;
    mockRetryDesk.mockReset();
    mockUseDeskEngagements.mockClear();
    mockSelectOperationalNeed.mockClear();
    mockSelectOperationalNeeds.mockClear();
    mockRecentDocumentsInHand = [];
    mockDocumentQuery = {
      data: {
        kind: 'engagement',
        row: {
          engagement_kind: 'lead', engagement_id: 'lead-1', project_id: null, proposal_id: null,
          lead_id: 'lead-1', designer_id: 'designer-1', client_profile_id: null,
          client_name: 'Avery Stone', title: 'Stone Residence', active_section: 'brief',
          project_status: null, current_phase: null, is_paused: false, is_archived: false,
          proposal_status: null, proposal_sent_at: null, proposal_viewed_at: null,
          lead_response_deadline: null, lead_status: null, overdue_decision_count: 0,
          earliest_overdue_due: null, awaiting_inspection_count: 0, blocked_item_count: 0,
          in_flight_count: 0, installed_count: 0, item_count: 0,
          updated_at: '2026-08-10T12:00:00Z', open_claim_count: 0, open_claim_po: null,
          unsent_pulse_count: 0, pulse_week_of: null, draft_unsent_po_count: 0,
          oldest_draft_po_created_at: null, draft_po_label: null, unacked_po_count: 0,
          oldest_unacked_sent_at: null, unacked_po_label: null, due_task_count: 0,
          earliest_task_due: null, due_task_title: null,
        },
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: mockRetryDocumentResolution,
    };
    // One viewport, answered per query rather than `true` to everything: a
    // 1440px window (so the real ResponsiveMarginRail chooses its full-rail
    // branch because the width says so) with reduced motion asked for.
    setViewport({ width: 1440, reducedMotion: true });
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  it('activates the guide anchor and honors reduced motion', () => {
    render(<DocumentPage params={fulfilledParams} />);
    const activeSection = document.querySelector<HTMLElement>('[data-active-section]');
    expect(activeSection).not.toBeNull();
    activeSection!.scrollIntoView = jest.fn();

    fireEvent.click(screen.getByRole('button', { name: 'Accept and begin' }));

    expect(activeSection!.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    expect(activeSection).toHaveFocus();
  });

  it('fetches and selects a ceremony need on a freshly opened Brief', () => {
    mockDeskData = {
      folders: [{
        row: { engagement_id: 'lead-1' },
        need: {
          kind: 'ceremony_pending', text: 'Introduce yourself to Avery',
          actionLabel: 'Continue the introduction', urgent: false,
          stamp: { label: 'CLAIMED · CEREMONY WAITING' }, deepLink: '/ceremony/lead-1',
        },
      }],
      chips: [],
      composed: { 'lead-1': true },
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(mockUseDeskEngagements).toHaveBeenCalledWith({ enabled: true });
    expect(mockSelectOperationalNeed).toHaveBeenCalledWith(
      mockDeskData, 'lead-1',
    );
    expect(screen.getByRole('link', { name: 'Continue the introduction' })).toHaveAttribute(
      'href', '/ceremony/lead-1',
    );
  });

  it('renders document-local guidance while the Desk read is still in flight', () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: { kind: 'engagement', row: { ...current, overdue_decision_count: 2 } },
    };
    // In flight: this engagement is not in any composition yet, so the guide has
    // only the row to work from — and must state it rather than stalling.
    mockDeskLoading = true;
    mockDeskData = { folders: [], chips: [], composed: {} };

    render(<DocumentPage params={fulfilledParams} />);

    expect(mockSelectOperationalNeed).toHaveReturnedWith(undefined);
    expect(screen.getByText(/2 decisions overdue/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chase the approval' })).toBeInTheDocument();
  });

  it('ignores a hot Desk cache for a document its side feeds cannot key on', () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: { kind: 'engagement', row: {
        ...current, engagement_kind: 'relationship', active_section: 'discovery',
        engagement_id: 'relationship-1', lead_id: null, client_profile_id: 'client-1',
      } },
    };
    // The CommandBar keeps this key warm, so the cache holds a composed answer
    // for this very engagement. This page declared the enrichment out of scope,
    // so it must not consult it at all — not even to read the answer.
    mockDeskData = {
      folders: [{
        row: { engagement_id: 'relationship-1' },
        need: {
          kind: 'reconnect_due', text: 'Reconnect with Avery',
          actionLabel: null, urgent: false, stamp: { label: 'DORMANT' },
        },
      }],
      chips: [],
      composed: { 'relationship-1': true },
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(mockUseDeskEngagements).toHaveBeenCalledWith({ enabled: false });
    expect(mockSelectOperationalNeed).not.toHaveBeenCalled();
    expect(screen.queryByText('Reconnect with Avery')).not.toBeInTheDocument();
    expect(screen.getByText('Finish what you need to know')).toBeInTheDocument();
  });

  it('skips the Desk read on a paused document', () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: { kind: 'engagement', row: { ...current, is_paused: true } },
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(mockUseDeskEngagements).toHaveBeenCalledWith({ enabled: false });
    expect(screen.getByText('This project is paused')).toBeInTheDocument();
  });

  it('shows unavailable guidance and retries a failed operational read', () => {
    mockDeskError = true;

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.getByRole('heading', { name: 'Guidance is unavailable' })).toBeInTheDocument();
    const activeSection = document.querySelector<HTMLElement>('[data-active-section]');
    activeSection!.scrollIntoView = jest.fn();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(mockRetryDesk).toHaveBeenCalledTimes(1);
    // The retry destination dispatches on its own kind — it never falls through
    // to the anchor branch and scrolls the document.
    expect(activeSection!.scrollIntoView).not.toHaveBeenCalled();
  });

  it('honors a Desk answer of no need over re-deriving one from the row', () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: { kind: 'engagement', row: { ...current, overdue_decision_count: 1 } },
    };
    // Composed and need-free: the Desk looked at this engagement and found
    // nothing, which outranks the row's own stale overdue count.
    mockDeskData = { folders: [], chips: [], composed: { 'lead-1': true } };

    render(<DocumentPage params={fulfilledParams} />);

    expect(mockSelectOperationalNeed).toHaveReturnedWith(null);
    expect(screen.queryByText(/decision overdue/)).not.toBeInTheDocument();
    expect(screen.getByText('Decide on this inquiry')).toBeInTheDocument();
  });

  it('derives locally when a hot Desk cache never composed this document', () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: { kind: 'engagement', row: { ...current, overdue_decision_count: 1 } },
    };
    // The CommandBar's read is warm and holds OTHER engagements. Absence from
    // it is not an answer about this one, so the row's own need must still show.
    mockDeskData = {
      folders: [{ row: { engagement_id: 'someone-else' }, need: null }],
      chips: [],
      composed: { 'someone-else': true },
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(mockSelectOperationalNeed).toHaveReturnedWith(undefined);
    expect(screen.getByText(/1 decision overdue/)).toBeInTheDocument();
  });

  it('keeps guidance whole when a Desk read this document never depended on fails', () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: { kind: 'engagement', row: {
        ...current, engagement_kind: 'relationship', active_section: 'discovery',
        engagement_id: 'relationship-1', lead_id: null, client_profile_id: 'client-1',
      } },
    };
    mockDeskError = true;

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.queryByText('Guidance is unavailable')).not.toBeInTheDocument();
    expect(screen.getByText('Finish what you need to know')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('fetches and selects flagged-line guidance on a freshly opened Proposal', () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: { kind: 'engagement', row: {
        ...current, engagement_kind: 'proposal', active_section: 'proposal',
        engagement_id: 'proposal-1', proposal_id: 'proposal-1', lead_id: null,
        proposal_status: 'sent',
      } },
    };
    mockProposalData = {
      id: 'proposal-1', status: 'sent', document_kind: 'design_services',
      commercial_state: 'sent', project_id: null,
    };
    mockDeskData = {
      folders: [{
        row: { engagement_id: 'proposal-1' },
        need: {
          kind: 'lines_flagged', text: '2 lines flagged on Design agreement',
          actionLabel: 'Review flagged lines', urgent: false,
          stamp: { label: 'FLAGGED' }, deepLink: '/drafting/proposal-1?flagged=1',
        },
      }],
      chips: [],
      composed: { 'proposal-1': true },
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(mockUseDeskEngagements).toHaveBeenCalledWith({ enabled: true });
    expect(mockSelectOperationalNeed).toHaveBeenCalledWith(
      mockDeskData, 'proposal-1',
    );
    expect(screen.getByRole('link', { name: 'Open the flagged lines' })).toHaveAttribute(
      'href', '/drafting/proposal-1?flagged=1',
    );
  });

  it('counts a programmatic history expansion once', () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: {
        kind: 'engagement',
        row: {
          ...current,
          engagement_kind: 'relationship',
          active_section: 'discovery',
          engagement_id: 'relationship-1',
          lead_id: null,
          client_profile_id: 'client-1',
        },
      },
    };

    render(<DocumentPage params={fulfilledParams} />);
    fireEvent.click(screen.getByRole('button', { name: 'Jump to brief' }));
    fireEvent.click(screen.getByRole('button', { name: 'Jump to brief' }));

    expect(mockHistoryToggled).toHaveBeenCalledTimes(1);
    expect(mockHistoryToggled).toHaveBeenCalledWith({ expanded: true, completed_count: 1 });
  });

  it('composes canonical Discovery readiness into guide input copy', () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: { kind: 'engagement', row: {
        ...current, engagement_kind: 'relationship', active_section: 'discovery',
        engagement_id: 'relationship-1', lead_id: null, client_profile_id: 'client-1',
      } },
    };
    mockDiscoveryQuery = {
      data: { row: { project_type: 'full_home', rooms: [{ name: 'Living room' }] }, prefill: null },
      isLoading: false,
      isError: false,
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.getByText(/Input needed · Working budget/).parentElement).toHaveTextContent(
      'Client · blocks Direction · +3 more',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Working budget' }));
    expect(mockDiscoveryFacetOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Budget comfort' })).toHaveFocus();
  });

  it('keeps a draft commercial agreement reachable from Direction', () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: { kind: 'engagement', row: {
        ...current, engagement_kind: 'proposal', active_section: 'direction',
        engagement_id: 'proposal-1', proposal_id: 'proposal-1', lead_id: null,
        client_profile_id: 'client-1', proposal_status: 'draft',
      } },
    };
    mockProposalData = {
      id: 'proposal-1', status: 'draft', document_kind: 'design_services',
      commercial_state: 'draft', project_id: null,
    };
    mockDraftingState = { gaps: ['phases & fees'], isLoading: false, error: null };

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.getByRole('link', { name: 'Open the Drafting Room' })).toHaveAttribute(
      'href', '/drafting/proposal-1',
    );
    expect(screen.getByText(/Input needed · phases & fees/)).toBeInTheDocument();
  });

  it('J1 — the successor id begin() lands on renders the doc\'s own Direction section', () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    // The REAL post-begin row, not an invented one: document_state shape B
    // (00327) emits engagement_id = pr.chain_root_id — the new proposal's own
    // id for a freshly seeded chain — with project_id and lead_id NULL. This
    // is exactly what /doc/<proposalId> resolves to after
    // discovery-section.tsx's begin() replaces the URL with the id the RPC
    // returned. (A row keyed on the designer_clients id cannot exist here:
    // shape D is suppressed the moment a draft proposal references it.)
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: { kind: 'engagement', row: {
        ...current, engagement_kind: 'proposal', active_section: 'direction',
        engagement_id: 'proposal-9', project_id: null, proposal_id: 'proposal-9',
        lead_id: null, designer_id: 'designer-1', client_profile_id: 'client-1',
        proposal_status: 'draft',
      } },
    };
    mockProposalData = {
      id: 'proposal-9', status: 'draft', document_kind: 'design_services',
      commercial_state: 'draft', project_id: null,
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.getByRole('heading', { name: 'Direction', level: 2 })).toBeInTheDocument();
    expect(screen.queryByText('No document answers to this name.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Budget comfort' })).not.toBeInTheDocument();
  });

  it('focuses an already-open missing Discovery facet without toggling it closed', () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: { kind: 'engagement', row: {
        ...current, engagement_kind: 'relationship', active_section: 'discovery',
        engagement_id: 'relationship-1', lead_id: null, client_profile_id: 'client-1',
      } },
    };
    mockDiscoveryQuery = {
      data: { row: { project_type: 'full_home', rooms: [{ name: 'Living room' }] }, prefill: null },
      isLoading: false,
      isError: false,
    };
    mockDiscoveryFacetExpanded = true;

    render(<DocumentPage params={fulfilledParams} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Working budget' }));
    expect(mockDiscoveryFacetOpen).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Budget comfort' })).toHaveFocus();
  });

  it('focuses the canonical control for an operational guide action', () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: { kind: 'engagement', row: {
        ...current, engagement_kind: 'relationship', active_section: 'discovery',
        engagement_id: 'relationship-1', lead_id: null, overdue_decision_count: 1,
      } },
    };

    render(<DocumentPage params={fulfilledParams} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chase the approval' }));
    expect(screen.getByText('Decision controls')).toHaveFocus();
  });

  it('opens a closed pulse item once and never toggles it shut on re-activation', () => {
    // A project-shape row: document_state only reports unsent_pulse_count on a
    // project engagement, so this is a state the view can actually produce.
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: { kind: 'engagement', row: {
        ...current, engagement_kind: 'project', active_section: 'project',
        engagement_id: 'project-1', project_id: 'project-1', lead_id: null,
        client_profile_id: 'client-1', current_phase: 'design_development',
        project_status: 'active', unsent_pulse_count: 1, pulse_week_of: '2026-08-03',
      } },
    };
    // The real MarginRail composes this into the real MarginItem that carries
    // targetId="document-pulse-control-desktop" and its onToggle.
    mockMarginItems = [{
      kind: 'pulse',
      item_id: 'pulse-1',
      project_id: 'project-1',
      proposal_id: null,
      anchor_kind: 'letterhead',
      anchor_id: null,
      state: 'draft',
      title: 'Weekly pulse',
      detail: 'Draft ready to send',
      ts: '2026-08-10T12:00:00Z',
      payload: {},
    }];

    render(<DocumentPage params={fulfilledParams} />);

    const pulse = document.getElementById('document-pulse-control-desktop');
    expect(pulse).not.toBeNull();
    expect(pulse).toHaveAttribute('aria-expanded', 'false');

    // First activation unfolds it.
    fireEvent.click(screen.getByRole('button', { name: 'Send the pulse' }));
    expect(document.getElementById('document-pulse-control-desktop')).toHaveAttribute(
      'aria-expanded', 'true',
    );
    expect(screen.getByText('Pulse body')).toBeInTheDocument();

    // Second activation must leave it open, not toggle it shut.
    fireEvent.click(screen.getByRole('button', { name: 'Send the pulse' }));
    expect(document.getElementById('document-pulse-control-desktop')).toHaveAttribute(
      'aria-expanded', 'true',
    );
    expect(screen.getByText('Pulse body')).toBeInTheDocument();
    expect(document.getElementById('document-pulse-control-desktop')).toHaveFocus();
  });

  it('treats a proposal query error as unknown guidance', () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: { kind: 'engagement', row: {
        ...current, engagement_kind: 'proposal', active_section: 'proposal',
        engagement_id: 'proposal-1', proposal_id: 'proposal-1', lead_id: null,
        proposal_status: 'sent',
      } },
    };
    mockProposalError = true;

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.getByRole('heading', { name: 'Guidance is unavailable' })).toBeInTheDocument();
    expect(screen.queryByText(/Input needed/)).not.toBeInTheDocument();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // R108 + the ratified quick fix — the letterhead's target. `target_completion`
  // is not a column on `projects`; the `AnyRecord` type is why it stayed silent.
  // ───────────────────────────────────────────────────────────────────────────

  const asProjectDocument = () => {
    const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
    mockDocumentQuery = {
      ...mockDocumentQuery,
      data: {
        kind: 'engagement',
        row: {
          ...current,
          engagement_kind: 'project',
          active_section: 'project',
          engagement_id: 'project-1',
          project_id: 'project-1',
          lead_id: null,
          client_profile_id: 'client-1',
          current_phase: 'design_development',
          project_status: 'active',
        },
      },
    };
  };

  const resolvedWith = (
    phase: Record<string, unknown>,
    row: Record<string, unknown> = { id: 'ph1', name: 'Design Development', status: 'in_progress' },
  ) => ({
    phases: [row],
    milestones: [],
    resolved: {
      phases: [phase],
      milestones: [],
      conflicts: [],
      slackDays: null,
    },
    isLoading: false,
    isError: false,
  });

  it('states a target from the resolver, in the register its source supports', () => {
    asProjectDocument();
    mockProjectQuery = {
      data: { total_amount_cents: null, target_end_date: null, start_date: null },
      isLoading: false,
      isError: false,
    };
    mockResolvedSchedule = resolvedWith({
      id: 'ph1',
      start: '2026-08-01',
      end: '2026-11-15',
      lane: 'main',
      anchored: true,
      source: 'anchor',
      slackDays: null,
      governingAnchorId: 'ph1',
      origin: 'anchor',
    });

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.getByTestId('doc-vitals').textContent).toContain('Target November 2026');
  });

  it('a band project renders no firm target — only the band', () => {
    asProjectDocument();
    mockProjectQuery = {
      data: { total_amount_cents: null, target_end_date: null, start_date: null },
      isLoading: false,
      isError: false,
    };
    mockResolvedSchedule = resolvedWith({
      id: 'ph1',
      start: '2026-01-05',
      end: '2026-11-15',
      lane: 'main',
      anchored: false,
      source: 'legacy-dates',
      slackDays: null,
      governingAnchorId: null,
      origin: 'legacy',
    });

    render(<DocumentPage params={fulfilledParams} />);

    const vitals = screen.getByTestId('doc-vitals').textContent ?? '';
    expect(vitals).toContain('Target band · November 2026');
    expect(vitals).not.toMatch(/Target November/);
  });

  it('a phantom target_completion produces no target at all (dead-field regression)', () => {
    asProjectDocument();
    mockProjectQuery = {
      data: { target_completion: '2026-11-15', total_amount_cents: null },
      isLoading: false,
      isError: false,
    };
    mockResolvedSchedule = {
      phases: [],
      milestones: [],
      resolved: { phases: [], milestones: [], conflicts: [], slackDays: null },
      isLoading: false,
      isError: false,
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.getByTestId('doc-vitals').textContent ?? '').not.toMatch(/Target/);
  });

  it('R107: a phase-less project states its project-level target in the band register', () => {
    asProjectDocument();
    mockProjectQuery = {
      data: { target_end_date: '2026-11-15', total_amount_cents: null },
      isLoading: false,
      isError: false,
    };
    mockResolvedSchedule = {
      phases: [],
      milestones: [],
      resolved: { phases: [], milestones: [], conflicts: [], slackDays: null },
      isLoading: false,
      isError: false,
    };

    render(<DocumentPage params={fulfilledParams} />);

    // Band-honest: month precision, approximate marker, never a firm claim.
    const vitals = screen.getByTestId('doc-vitals').textContent ?? '';
    expect(vitals).toContain('Target ~November 2026');
    expect(vitals).not.toMatch(/Target November/);
  });

  it('states no target while the schedule is still being read', () => {
    asProjectDocument();
    mockProjectQuery = {
      data: { target_end_date: '2026-11-15', total_amount_cents: null },
      isLoading: false,
      isError: false,
    };
    mockResolvedSchedule = { ...NO_RESOLVED_SCHEDULE, isLoading: true };

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.getByTestId('doc-vitals').textContent ?? '').not.toMatch(/Target/);
  });

  // ── W1: the letterhead's needs-setup chip ──
  it('states no setup need when the Desk reports none', () => {
    asProjectDocument();
    mockDeskData = {
      folders: [{ row: { engagement_id: 'project-1' }, need: null }],
      chips: [],
      composed: { 'project-1': true },
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.getByTestId('doc-needs-setup-count')).toHaveTextContent('0');
  });

  it('carries the one unconfigured-schedule need to the letterhead with its remedy', () => {
    asProjectDocument();
    mockDeskData = {
      folders: [{
        row: { engagement_id: 'project-1' },
        need: {
          kind: 'schedule_unconfigured',
          text: 'Name the phases for this project',
          actionLabel: 'Open the schedule',
          urgent: false,
          stamp: { label: 'BAND' },
        },
      }],
      chips: [],
      composed: { 'project-1': true },
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.getByTestId('doc-needs-setup-count')).toHaveTextContent('1');
    const activeSection = document.querySelector<HTMLElement>('[data-active-section]');
    activeSection!.scrollIntoView = jest.fn();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Name the phases for this project · Open the schedule',
      }),
    );

    expect(activeSection!.scrollIntoView).toHaveBeenCalled();
    expect(activeSection).toHaveFocus();
  });

  it('leaves every other kind of need to the guide', () => {
    asProjectDocument();
    mockDeskData = {
      folders: [{
        row: { engagement_id: 'project-1' },
        need: {
          kind: 'task_due',
          text: 'Confirm the site measure',
          actionLabel: 'Open the task',
          urgent: false,
          stamp: { label: 'TASK DUE' },
        },
      }],
      chips: [],
      composed: { 'project-1': true },
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.getByTestId('doc-needs-setup-count')).toHaveTextContent('0');
  });

  // ── A1-L2: F14/C11 — the shelved spine mounts on install/care, and its index
  // derives from the spread's own regions (paperRegionsForSection). The
  // per-row rendering (labels, scroll targets, fold state) is
  // shelved-spine.test.tsx's job; this integration suite only proves the page
  // wires the right region SET through for each spread. ──
  describe('the shelved spine mount (F14/C11)', () => {
    it('mounts on an install document with the two regions that spread prints', () => {
      asProjectDocument();
      const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
      mockDocumentQuery = {
        ...mockDocumentQuery,
        data: { kind: 'engagement', row: { ...current, active_section: 'install' } },
      };

      render(<DocumentPage params={fulfilledParams} />);

      // No money row (MoneyRegion mounts only under spreadSection === 'project')
      // and no schedule row (nor does ScheduleSpine, the only
      // data-index-region="schedule" root) — a row for either would be a jump
      // target with nothing behind it.
      const index = screen.getByTestId('shelved-spine-regions');
      expect(within(index).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        'approvals', 'ffe',
      ]);
    });

    it('mounts on a care document with the same two regions', () => {
      asProjectDocument();
      const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
      mockDocumentQuery = {
        ...mockDocumentQuery,
        data: { kind: 'engagement', row: { ...current, active_section: 'care' } },
      };

      render(<DocumentPage params={fulfilledParams} />);

      // No money row (MoneyRegion mounts only under spreadSection === 'project')
      // and no schedule row (nor does ScheduleSpine, the only
      // data-index-region="schedule" root) — a row for either would be a jump
      // target with nothing behind it.
      const index = screen.getByTestId('shelved-spine-regions');
      expect(within(index).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        'approvals', 'ffe',
      ]);
    });

    it('still mounts all four regions, money included, on the project section', () => {
      asProjectDocument();

      render(<DocumentPage params={fulfilledParams} />);

      const index = screen.getByTestId('shelved-spine-regions');
      expect(within(index).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        'approvals', 'schedule', 'ffe', 'money',
      ]);
    });
  });

  // ── A1-L1/L2 — the tie-break: the guide's headline and the red-letter
  // zone's first row must name the same need. The two surfaces are mutually
  // exclusive on a project engagement (the zone replaces the guide once it
  // has rows), so this is asserted as two renders sharing one input pair and
  // one ranking function, rather than one render showing both. ──
  describe('the operational-need tie-break (rankOperationalNeeds)', () => {
    const rankThreeThenOne = [
      {
        kind: 'task_due', text: 'Confirm the site measure',
        actionLabel: 'Open the task', urgent: false, stamp: { label: 'TASK DUE' },
      },
      {
        kind: 'damage_claim', text: 'A delivered piece was damaged in transit',
        actionLabel: null, urgent: true, stamp: { label: 'DAMAGE CLAIM' },
      },
    ];

    it('leads the guide with the higher-ranked need even though it arrived second', () => {
      // Default fixture: engagement_kind 'lead', active_section 'brief',
      // engagement_id 'lead-1' — a non-project document, so the guide (not
      // the zone) renders and speaks for whichever need ranks first.
      mockDeskData = {
        folders: [{ row: { engagement_id: 'lead-1' }, need: null, needs: rankThreeThenOne }],
        chips: [],
        composed: { 'lead-1': true },
      };

      render(<DocumentPage params={fulfilledParams} />);

      expect(
        screen.getByText('A delivered piece was damaged in transit'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Confirm the site measure')).not.toBeInTheDocument();
    });

    it('leads the red-letter zone with the same higher-ranked need, first row', () => {
      asProjectDocument();
      mockDeskData = {
        folders: [{ row: { engagement_id: 'project-1' }, need: null, needs: rankThreeThenOne }],
        chips: [],
        composed: { 'project-1': true },
      };

      render(<DocumentPage params={fulfilledParams} />);

      const region = screen.getByRole('region', { name: 'Needs attention' });
      const rows = region.querySelectorAll('li');
      expect(rows).toHaveLength(2);
      expect(rows[0]!.textContent).toContain('A delivered piece was damaged in transit');
      expect(rows[1]!.textContent).toContain('Confirm the site measure');
    });
  });

  // ── L1: the letterhead's red-letter zone (project documents only) ──
  describe('the red-letter zone', () => {
    it('renders the red-letter zone, not the guide strip, on a project document', () => {
      asProjectDocument();
      mockDeskData = {
        folders: [{
          row: { engagement_id: 'project-1' },
          need: {
            kind: 'task_due', text: 'Confirm the site measure',
            actionLabel: 'Open the task', urgent: false, stamp: { label: 'TASK DUE' },
          },
          needs: [{
            kind: 'task_due', text: 'Confirm the site measure',
            actionLabel: 'Open the task', urgent: false, stamp: { label: 'TASK DUE' },
          }],
        }],
        chips: [],
        composed: { 'project-1': true },
      };

      render(<DocumentPage params={fulfilledParams} />);

      expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument();
      expect(screen.getByText('Confirm the site measure')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open the task' })).toBeInTheDocument();
      // The guide strip's own heading id never mounts alongside it.
      expect(document.getElementById('document-next-up')).toBeNull();
    });

    it('keeps the guide strip, not the red-letter zone, on a non-project document', () => {
      // The default mockDocumentQuery row from the outer beforeEach is a lead
      // (Brief) document — unaffected by the project-only swap.
      render(<DocumentPage params={fulfilledParams} />);

      expect(screen.getByRole('button', { name: 'Accept and begin' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Needs attention' })).not.toBeInTheDocument();
    });

    it('maps every need in the chain to its own red-letter row', () => {
      asProjectDocument();
      mockDeskData = {
        folders: [{
          row: { engagement_id: 'project-1' },
          need: {
            kind: 'task_due', text: 'Confirm the site measure',
            actionLabel: 'Open the task', urgent: false, stamp: { label: 'TASK DUE' },
          },
          needs: [
            {
              kind: 'task_due', text: 'Confirm the site measure',
              actionLabel: 'Open the task', urgent: false, stamp: { label: 'TASK DUE' },
            },
            {
              kind: 'awaiting_inspection', text: '1 piece delivered — awaiting inspection',
              actionLabel: 'Inspect the delivery', urgent: false, stamp: { label: 'DELIVERED' },
            },
          ],
        }],
        chips: [],
        composed: { 'project-1': true },
      };

      render(<DocumentPage params={fulfilledParams} />);

      const region = screen.getByRole('region', { name: 'Needs attention' });
      expect(region.querySelectorAll('li')).toHaveLength(2);
      expect(screen.getByText('Confirm the site measure')).toBeInTheDocument();
      expect(screen.getByText('1 piece delivered — awaiting inspection')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open the task' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Inspect the delivery' })).toBeInTheDocument();
    });

    it('keeps the guide on a project the Desk composition never covered', () => {
      asProjectDocument();
      // Warm cache, other engagements only: the zone has no answer for THIS
      // document, and the page cannot derive one (it holds no invoice or
      // schedule facts), so the guide speaks instead of a short list posing as
      // the whole list.
      mockDeskData = {
        folders: [{ row: { engagement_id: 'someone-else' }, need: null, needs: [] }],
        chips: [],
        composed: { 'someone-else': true },
      };

      render(<DocumentPage params={fulfilledParams} />);

      expect(mockSelectOperationalNeeds).toHaveReturnedWith(undefined);
      expect(screen.queryByRole('region', { name: 'Needs attention' })).not.toBeInTheDocument();
      expect(document.getElementById('document-next-up')).not.toBeNull();
    });

    it('keeps the guide — and its retry — on a project whose Desk read failed', () => {
      asProjectDocument();
      mockDeskError = true;

      render(<DocumentPage params={fulfilledParams} />);

      expect(screen.queryByRole('region', { name: 'Needs attention' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Guidance is unavailable' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    it('F77 — prints the guide, not the red-letter zone, when the composition covered the project and found nothing', () => {
      asProjectDocument();
      mockDeskData = { folders: [], chips: [], composed: { 'project-1': true } };

      render(<DocumentPage params={fulfilledParams} />);

      expect(mockSelectOperationalNeeds).toHaveReturnedWith([]);
      expect(screen.queryByRole('region', { name: 'Needs attention' })).not.toBeInTheDocument();
      expect(document.getElementById('document-next-up')).not.toBeNull();
    });

    it('F77 — a care document always shows a guide with no Desk composition', () => {
      asProjectDocument();
      const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
      mockDocumentQuery = {
        ...mockDocumentQuery,
        data: { kind: 'engagement', row: { ...current, active_section: 'care' } },
      };
      // Left at the outer beforeEach default: mockDeskData = { folders: [], chips: [], composed: {} }.

      render(<DocumentPage params={fulfilledParams} />);

      expect(screen.queryByRole('region', { name: 'Needs attention' })).not.toBeInTheDocument();
      expect(document.getElementById('document-next-up')).not.toBeNull();
    });

    it('F77 — a care document always shows a guide when the composition covered it and found nothing', () => {
      asProjectDocument();
      const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
      mockDocumentQuery = {
        ...mockDocumentQuery,
        data: { kind: 'engagement', row: { ...current, active_section: 'care' } },
      };
      mockDeskData = { folders: [], chips: [], composed: { 'project-1': true } };

      render(<DocumentPage params={fulfilledParams} />);

      expect(mockSelectOperationalNeeds).toHaveReturnedWith([]);
      expect(screen.queryByRole('region', { name: 'Needs attention' })).not.toBeInTheDocument();
      expect(document.getElementById('document-next-up')).not.toBeNull();
    });
  });

  // ── W4: the recap line ──
  it('counts only drafted, active approvals as awaiting publish', () => {
    asProjectDocument();
    // Proposal lineage resolves the earlier sections as settled, which is what
    // gives this project document a recap line to carry the approvals count.
    mockProjectQuery = {
      data: { proposal: { id: 'proposal-1', version: 1, status: 'signed', signed_at: null } },
      isLoading: false,
      isError: false,
    };
    mockProjectApprovalsQuery = {
      data: [
        { lifecycleStatus: 'draft', disposition: 'active' },
        { lifecycleStatus: 'pending', disposition: 'active' },
        { lifecycleStatus: 'draft', disposition: 'superseded' },
      ],
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(
      screen.getByRole('button', { name: 'Client approvals · 1 awaiting publish →' }),
    ).toBeVisible();
    // The recap disclosure promises only what its own body holds.
    expect(
      screen.getByRole('button', { name: /^Previous work · \d+ complete$/ }),
    ).toBeVisible();
  });

  it('says nothing about approvals while that read is unanswered', () => {
    asProjectDocument();
    mockProjectQuery = {
      data: { proposal: { id: 'proposal-1', version: 1, status: 'signed', signed_at: null } },
      isLoading: false,
      isError: false,
    };
    mockProjectApprovalsQuery = { data: undefined, isLoading: true };

    render(<DocumentPage params={fulfilledParams} />);

    expect(screen.queryByText(/Client approvals/)).not.toBeInTheDocument();
  });
});

describe('DocumentPage landedRef — A8 first-open gate', () => {
  const rowFor = (engagementId: string, activeSection: string) => ({
    engagement_kind: 'lead', engagement_id: engagementId, project_id: null, proposal_id: null,
    lead_id: engagementId, designer_id: 'designer-1', client_profile_id: null,
    client_name: 'Avery Stone', title: 'Stone Residence', active_section: activeSection,
    project_status: null, current_phase: null, is_paused: false, is_archived: false,
    proposal_status: null, proposal_sent_at: null, proposal_viewed_at: null,
    lead_response_deadline: null, lead_status: null, overdue_decision_count: 0,
    earliest_overdue_due: null, awaiting_inspection_count: 0, blocked_item_count: 0,
    in_flight_count: 0, installed_count: 0, item_count: 0,
    updated_at: '2026-08-10T12:00:00Z', open_claim_count: 0, open_claim_po: null,
    unsent_pulse_count: 0, pulse_week_of: null, draft_unsent_po_count: 0,
    oldest_draft_po_created_at: null, draft_po_label: null, unacked_po_count: 0,
    oldest_unacked_sent_at: null, unacked_po_label: null, due_task_count: 0,
    earliest_task_due: null, due_task_title: null,
  });

  beforeEach(() => {
    mockHydrated = true;
    mockDiscoveryQuery = { data: undefined, isLoading: false, isError: false };
    mockDraftingState = { gaps: [], isLoading: false, error: null };
    mockProposalData = undefined;
    mockProposalError = false;
    mockProjectQuery = { data: undefined, isLoading: false, isError: false };
    mockResolvedSchedule = NO_RESOLVED_SCHEDULE;
    mockContextualHandoffsQuery = { data: [], isError: false };
    mockDeskData = { folders: [], chips: [], composed: {} };
    mockDeskLoading = false;
    mockDeskError = false;
    mockRetryDesk.mockReset();
    mockUseDeskEngagements.mockClear();
    mockSelectOperationalNeed.mockClear();
    mockSelectOperationalNeeds.mockClear();
    mockRecentDocumentsInHand = [];
    mockDocumentQuery = {
      data: { kind: 'engagement', row: rowFor('lead-1', 'brief') },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: mockRetryDocumentResolution,
    };
    setViewport({ width: 1440, reducedMotion: true });
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    HTMLElement.prototype.scrollIntoView = jest.fn();
    // The active-section element's real geometry is irrelevant here — this
    // gate is exercised BEFORE React ever mounts it, so force every element
    // past the 60% threshold that would otherwise trigger the jump, and
    // isolate what's under test to the MRU membership check alone.
    HTMLElement.prototype.getBoundingClientRect = jest.fn(() => ({
      top: 1000, bottom: 1100, left: 0, right: 100, width: 100, height: 100,
      x: 0, y: 1000, toJSON: () => ({}),
    })) as unknown as typeof HTMLElement.prototype.getBoundingClientRect;
  });

  it('does not jump to the active section for a first-time visitor (no MRU record for this document)', () => {
    mockRecentDocumentsInHand = [];

    render(<DocumentPage params={fulfilledParams} />);

    expect(document.querySelector('[data-active-section]')).not.toBeNull();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('jumps to the active section as before for a visitor whose MRU already holds this document', () => {
    mockRecentDocumentsInHand = [{ id: 'lead-1', title: 'Stone Residence' }];

    render(<DocumentPage params={fulfilledParams} />);

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('does not jump when the MRU holds other documents but not this one', () => {
    mockRecentDocumentsInHand = [
      { id: 'other-doc-1', title: 'Whitfield Residence' },
      { id: 'other-doc-2', title: 'Harper Loft' },
    ];

    render(<DocumentPage params={fulfilledParams} />);

    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('furnishings authorization doorway', () => {
  it('routes a project-backed authorization through the Desk doorway', () => {
    expect(
      authorizationDoorwayFor({
        engagementKind: 'proposal',
        projectId: 'project-1',
        proposalId: 'authorization-1',
        documentKind: 'furnishings_authorization',
      }),
    ).toBe('/desk?authorization=authorization-1&projectId=project-1');
  });

  it('leaves ordinary proposals and unlinked authorizations in place', () => {
    expect(
      authorizationDoorwayFor({
        engagementKind: 'proposal',
        projectId: 'project-1',
        proposalId: 'proposal-1',
        documentKind: 'legacy',
      }),
    ).toBeNull();
    expect(
      authorizationDoorwayFor({
        engagementKind: 'proposal',
        projectId: null,
        proposalId: 'authorization-1',
        documentKind: 'furnishings_authorization',
      }),
    ).toBeNull();
  });
});
