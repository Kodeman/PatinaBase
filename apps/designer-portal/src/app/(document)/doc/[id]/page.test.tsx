import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import DocumentPage from './page';
import { useMobileActiveDoc } from '@/components/document/mobile/mobile-shell';
import { authorizationDoorwayFor } from '@/lib/document/authorization-doorway';
import { paperRegionsForSection } from '@/lib/document/document-index';

/**
 * W3 — the band's line 2, the one printing of the sentence that changes (L-1).
 * The red-letter zone and the guide strip are model providers now (C-6): the
 * worst standing exception, or the stage's guide sentence when nothing stands.
 */
const bandLine2 = () =>
  document.querySelector<HTMLElement>('[data-lens-line="2"]');
const bandSentence = () =>
  document.querySelector('[data-lens-sentence]')?.textContent ?? '';
/** `standing` | `guide` | `none` — which source line 2 is speaking from. */
const bandLine2Kind = () =>
  bandLine2()?.getAttribute('data-lens-line2-kind') ?? null;
/** Line 1's right-flush slot — the dated and money facts, per spread (OD-1). */
const bandRightFlush = () =>
  document.querySelector('[data-lens-right-flush]')?.textContent ?? '';

let mockHydrated = false;
const mockRetryDocumentResolution = jest.fn();
// A8: the recent-documents-in-hand MRU landedRef reads to decide whether to
// jump to the active section. Empty by default — most existing tests in
// this file exercise a "first open" shape and must not gain a surprise
// scroll-jump because of this addition.
let mockRecentDocumentsInHand: Array<{ id: string; title: string; subtitle?: string }> = [];
const mockHistoryToggled = jest.fn();
const mockLensLineShown = jest.fn();
const mockLensLineActed = jest.fn();
const mockLensStandingSheetOpened = jest.fn();
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

// W3 — the guide's deep links were an `<a href>` the guide strip rendered
// itself; the band prints one act, as a press, so the navigation the act
// performs is what these tests now read.
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

let mockInvoices: Record<string, unknown>[] = [];

jest.mock('@patina/supabase', () => ({
  /* B1 — the job ticket's own reads. The ticket is mounted by every
     project-kind document now, so every suite that renders one pays for
     these; none of them is this suite's subject. */
  usePlanRoom: () => ({ data: { sheets: [] }, isLoading: false }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  // The ticket reads the PROPOSAL's own three populations on a paper with no
  // project (B2). All three are `enabled` on a proposal id, so a document
  // without one runs none of them.
  useProposalScopeRooms: () => ({ data: [], isLoading: false }),
  useProposalScheduleItems: () => ({ data: [], isLoading: false }),
  useBoards: () => ({ data: [], isLoading: false, isError: false }),
  useProjectBoards: () => ({ data: [], isLoading: false }),
  useProjectInvoices: () => ({ isLoading: false, error: null, data: mockInvoices }),
  usePurchaseOrders: () => ({ isLoading: false, error: null, data: [] }),
  computeArAging: jest.requireActual('@patina/supabase').computeArAging,
  invoiceDaysOverdue: jest.requireActual('@patina/supabase').invoiceDaysOverdue,
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

/* The money ladder under the ticket's Money row: four commercial reads that
   now run on every project document. */
jest.mock('@/hooks/use-commercial-documents', () => ({
  __esModule: true,
  useProjectBillingAuthority: () => ({
    isLoading: false,
    error: null,
    data: { authorizedCents: 0 },
  }),
  useWorkingBudget: () => ({ isLoading: false, error: null, data: null }),
  useProjectInstruments: () => ({ isLoading: false, error: null, data: [] }),
  useTradeScopes: () => ({ isLoading: false, error: null, data: [] }),
}));

// The project document's own sections are not what these tests exercise; the
// guide strip and the margin are.
const mockFFESection = jest.fn();
/** P2-07 — the id `landOnFfeAnchor` lands on, when the FF&E body has already
 *  mounted it. Null in every other case, which is the cold-load shape: the
 *  anchor does not exist until the unfold has been asked for and the promotion
 *  flushed, and that is the branch that waits two frames. */
let mockFfeAnchorId: string | null = null;
jest.mock('@/components/document/ffe-section', () => ({
  FFESection: (props: Record<string, unknown>) => {
    mockFFESection(props);
    return mockFfeAnchorId ? <div id={mockFfeAnchorId} /> : null;
  },
}));

/** P2-07 — the press order, in one log, from the three things `landOnFfeAnchor`
 *  composes. Each is recorded where it actually happens, so an implementation
 *  that reordered them (or dropped one) reads differently here. */
const pressOrder: string[] = [];

jest.mock('@/lib/document/document-index', () => {
  const actual = jest.requireActual('@/lib/document/document-index');
  return {
    __esModule: true,
    ...actual,
    requestRegionUnfold: (key: string) => {
      pressOrder.push(`unfold:${key}`);
      return actual.requestRegionUnfold(key);
    },
  };
});

jest.mock('@/hooks/use-lens-density', () => {
  const actual = jest.requireActual('@/hooks/use-lens-density');
  // The real API object is `useMemo([])`-stable, and the page keeps it in
  // `useCallback` deps — so the wrapper has to be stable too, or every render
  // would rebuild the very handlers this case reads.
  const wrapped = new WeakMap<object, unknown>();
  return {
    __esModule: true,
    ...actual,
    useLensDensity: (...args: unknown[]) => {
      const api = actual.useLensDensity(...args) as Record<string, unknown> & {
        forceFullThrough: (key: string) => void;
      };
      let seen = wrapped.get(api);
      if (!seen) {
        seen = {
          ...api,
          forceFullThrough: (key: string) => {
            pressOrder.push(`promote:${key}`);
            api.forceFullThrough(key);
          },
        };
        wrapped.set(api, seen);
      }
      return seen;
    },
  };
});
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
  // W2 (C-3): the page hands the rail the exact ladder `deriveLadderSegments`
  // returned for the spread. Render those keys as testable rows here — the
  // rail's OWN rendering of them (registers, the bracket, the doors) is
  // `lens-ladder.test.tsx`'s job, not this integration suite's; this mock
  // exists only to prove the page wired the right stops through.
  DocSpine: ({
    onJump,
    segments = [],
    doors = [],
  }: {
    onJump: (section: string) => void;
    segments?: ReadonlyArray<{ key: string }>;
    doors?: ReadonlyArray<{ key: string }>;
  }) => (
    <>
      <button type="button" onClick={() => onJump('brief')}>Jump to brief</button>
      <ul data-testid="ladder-segments" aria-label="This paper">
        {segments.map((segment) => (
          <li key={segment.key}>{segment.key}</li>
        ))}
      </ul>
      {/* W3 — `deriveLadderDoors` gates the four project doors on the SAME
          `input.project` the ticket's People row used to read, so this is
          where the page's leaf-mount predicate is now observable. */}
      <ul data-testid="ladder-doors">
        {doors.map((door) => (
          <li key={door.key}>{door.key}</li>
        ))}
      </ul>
    </>
  ),
}));
jest.mock('@/components/document/doc-letterhead', () => ({
  DocLetterhead: ({
    title,
    vitals,
    needsSetup,
    instruments,
  }: {
    title: string;
    vitals?: string;
    needsSetup?: Array<{ text: string; remedyLabel: string; onActivate: () => void }> | null;
    instruments?: ReactNode;
  }) => (
    <header id="document-project-status">
      {title}
      <span data-testid="doc-vitals">{vitals}</span>
      {/* W3 — the instruments' ledger stands INSIDE the letterhead now. */}
      <span data-testid="letterhead-instruments">{instruments}</span>
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
jest.mock('@/components/document/proposal-blocks-readonly', () => ({
  // W5-R2 item 1 — the mock renders a testid keyed on `only` so a test can
  // find which region root a given call landed under, without pulling in
  // the real block components' own hooks.
  ProposalBlocksReadOnly: ({ only }: { only?: string }) => (
    <div data-testid={`blocks-${only ?? 'full'}`} />
  ),
}));
jest.mock('@/components/document/proposal-instruments', () => ({ ProposalInstruments: () => null }));
jest.mock('@/components/document/folio-strip', () => ({ FolioLetterhead: () => null, ProposalFolioStrip: () => null }));
// W3 — the instruments are handed to the letterhead as a node now, so the
// stub prints a marker rather than nothing: where it lands, and how many of
// it there are, is the assertion.
jest.mock('@/components/document/letterhead-instruments', () => ({
  LetterheadInstruments: () => <span data-testid="instruments-row" />,
}));
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

// Off for everything unless a test names the flag it needs — W3 turns
// `worktable` on to prove the band prints once on the composed spreads.
let mockEnabledFlags: string[] = [];
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({
    value: mockEnabledFlags.includes(key),
    isLoading: false,
  }),
}));

jest.mock('@/lib/help-system/use-document-surface', () => ({
  useDocumentSurface: jest.fn(),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  rememberDocumentInHand: jest.fn(),
  readRecentDocumentsInHand: () => mockRecentDocumentsInHand,
  documentEvents: {
    historyToggled: (...args: unknown[]) => mockHistoryToggled(...args),
    // D-B22 — the lens line's three events, fired from this page.
    lensLineShown: (...args: unknown[]) => mockLensLineShown(...args),
    lensLineActed: (...args: unknown[]) => mockLensLineActed(...args),
    lensStandingSheetOpened: (...args: unknown[]) =>
      mockLensStandingSheetOpened(...args),
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

// Flags are off for every test unless it names one; a test that turns one on
// must not leak it into the next.
beforeEach(() => {
  mockEnabledFlags = [];
  mockRouter.push.mockReset();
  mockRouter.replace.mockReset();
});

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
    mockFFESection.mockClear();
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
    mockInvoices = [];
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
    // A3-L7 — a Brief with nothing outstanding is at rest and states no act
    // ("Nothing to decide yet."), so the anchor machinery is exercised through
    // a need whose act lands on this document's own section rather than a
    // ledger or a deep link.
    mockDeskData = {
      folders: [{
        row: { engagement_id: 'lead-1' },
        need: {
          kind: 'ceremony_pending', text: 'Introduce yourself to Avery',
          actionLabel: 'Continue the introduction', urgent: false,
          stamp: { label: 'CLAIMED · CEREMONY WAITING' },
        },
      }],
      chips: [],
      composed: { 'lead-1': true },
    };
    render(<DocumentPage params={fulfilledParams} />);
    const activeSection = document.querySelector<HTMLElement>('[data-active-section]');
    expect(activeSection).not.toBeNull();
    activeSection!.scrollIntoView = jest.fn();

    fireEvent.click(screen.getByRole('button', { name: 'Continue the introduction' }));

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
    // W3 — the strip rendered an `<a href>`; the band prints one act, as a
    // press, so the destination is proven by what the press navigates to.
    fireEvent.click(screen.getByRole('button', { name: 'Continue the introduction' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/ceremony/lead-1');
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

    // W3 — the strip's `<h2 id="document-next-up">` became the band's line 2.
    expect(bandSentence()).toContain('Guidance is unavailable');
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
    // A3-L7 — the Desk's "nothing here" is the Brief's rest state, and rest is
    // a named sentence rather than the old always-actionable default.
    expect(screen.getByText('Nothing to decide yet.')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Open the flagged lines' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/drafting/proposal-1?flagged=1');
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

    // W3 — the guide strip's `Input needed · Working budget · Client · blocks
    // Direction · +3 more` line is deleted with the strip; the band prints the
    // headline and the act only. What the composition still has to prove is
    // that the canonical Discovery read reaches the facet the guide names.
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

    fireEvent.click(screen.getByRole('button', { name: 'Open the Drafting Room' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/drafting/proposal-1');
    // `Input needed · phases & fees` is deleted with the guide strip (see the
    // Discovery case above); the gap still elects the act.
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

    // W3 — the strip's heading became the band's line 2. `Input needed` is
    // deleted with the strip, so its absence is no longer a claim this test
    // can make about unknown guidance.
    expect(bandSentence()).toContain('Guidance is unavailable');
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

  // ── W2 (C-3, F14/C11) — the ladder mounts on every project-backed spread,
  // and its stops derive from the spread's own regions
  // (`paperRegionsForSection`, carried on the ticket's input). The per-row
  // rendering is lens-ladder.test.tsx's job; this integration suite only
  // proves the page wires the right stop SET through for each spread. ──
  describe('the ladder mount (C-3, F14/C11)', () => {
    it('mounts on an install document with the regions that spread prints', () => {
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
      const index = screen.getByTestId('ladder-segments');
      expect(within(index).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        'approvals', 'ffe', 'care', 'record',
      ]);
    });

    it('mounts on a care document with the same regions', () => {
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
      const index = screen.getByTestId('ladder-segments');
      expect(within(index).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        'approvals', 'ffe', 'care', 'record',
      ]);
    });

    it('still mounts all six stops, money and the record included, on the project section', () => {
      asProjectDocument();

      render(<DocumentPage params={fulfilledParams} />);

      const index = screen.getByTestId('ladder-segments');
      expect(within(index).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        'approvals', 'schedule', 'ffe', 'money', 'care', 'record',
      ]);
    });
  });

  // ── P2-07 · `landOnFfeAnchor` — the composition the sheets ask for and
  // nothing tested. The Margin sheet's line rows and the sections sheet's room
  // rows both land on ids INSIDE the FF&E body, and a body that is quiet (or
  // that she closed herself) is not mounted: the order is the whole mechanism.
  // The sheets only ask; the page owns the landing (D-B46). ──
  describe('the line-jump press order (D-B46, P2-07)', () => {
    /** The handler the page publishes to the mobile shell — the one the Margin
     *  sheet actually calls. Read from the publication, never re-derived. */
    const publishedJumpToLine = (): ((lineId: string) => void) => {
      const calls = (useMobileActiveDoc as jest.Mock).mock.calls;
      for (let i = calls.length - 1; i >= 0; i -= 1) {
        const doc = calls[i]?.[0] as { onJumpToLine?: (id: string) => void } | null;
        if (doc?.onJumpToLine) return doc.onJumpToLine;
      }
      throw new Error('the page published no onJumpToLine');
    };

    beforeEach(() => {
      pressOrder.length = 0;
      mockFfeAnchorId = null;
      (useMobileActiveDoc as jest.Mock).mockClear();
    });

    afterEach(() => {
      mockFfeAnchorId = null;
    });

    it('asks for the unfold, flushes the promotion, THEN lands — in that order', () => {
      mockFfeAnchorId = 'ffe-selection-ffe-2';
      asProjectDocument();
      render(<DocumentPage params={fulfilledParams} />);

      const anchor = document.getElementById('ffe-selection-ffe-2')!;
      anchor.scrollIntoView = jest.fn(() => {
        pressOrder.push('land:ffe-selection-ffe-2');
      });

      act(() => {
        publishedJumpToLine()('ffe-2');
      });

      expect(pressOrder).toEqual([
        'unfold:ffe',
        'promote:ffe',
        'land:ffe-selection-ffe-2',
      ]);
      // The landing is `block: 'start'` at either motion register; the
      // behaviour follows `prefers-reduced-motion`, which the suite's own
      // matchMedia stub answers, so only the block is asserted here.
      expect(anchor.scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ block: 'start' }),
      );
    });

    it('waits two frames when the anchor is not mounted yet, and lands on the same id', () => {
      // The cold-load shape: the promotion is flushed, but the UNFOLD is a
      // React state change the region has to paint before its anchor exists.
      asProjectDocument();
      render(<DocumentPage params={fulfilledParams} />);

      const frames: FrameRequestCallback[] = [];
      const raf = jest
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((cb: FrameRequestCallback) => {
          frames.push(cb);
          return frames.length;
        });

      act(() => {
        publishedJumpToLine()('ffe-2');
      });

      // Asked and promoted, but nothing landed — there is nothing to land on.
      expect(pressOrder).toEqual(['unfold:ffe', 'promote:ffe']);
      expect(frames).toHaveLength(1);

      // The unfold paints: the body mounts its anchor.
      const late = document.createElement('div');
      late.id = 'ffe-selection-ffe-2';
      late.scrollIntoView = jest.fn(() => {
        pressOrder.push('land:ffe-selection-ffe-2');
      });
      document.body.appendChild(late);

      act(() => {
        frames.shift()!(0);
      });
      // Still one frame short — a single rAF is the write, not the paint.
      expect(pressOrder).toEqual(['unfold:ffe', 'promote:ffe']);

      act(() => {
        frames.shift()!(0);
      });
      expect(pressOrder).toEqual([
        'unfold:ffe',
        'promote:ffe',
        'land:ffe-selection-ffe-2',
      ]);

      raf.mockRestore();
      late.remove();
    });
  });

  // ── OD-9 / W0-L1 — the rendered replacement for the retired 1500-char
  // regex in stage2-approval-cutover-contract.test.ts: the in-section stage
  // line must actually land INSIDE <div data-active-section> (containment,
  // not merely "somewhere after it in source text"), and after it in DOM
  // order. jsdom has no :has(), so containment is proven by index comparison
  // over a flattened element list rather than by selector. ──
  describe('the stage line mount is contained by the active section (OD-9)', () => {
    it('nests [data-section-stage-line] inside [data-active-section], after it in document order', () => {
      asProjectDocument();

      render(<DocumentPage params={fulfilledParams} />);

      const activeSection = document.querySelector('[data-active-section]');
      const stageLine = document.querySelector('[data-section-stage-line]');
      expect(activeSection).not.toBeNull();
      expect(stageLine).not.toBeNull();

      expect(activeSection!.contains(stageLine!)).toBe(true);

      const all = Array.from(document.querySelectorAll('*'));
      expect(all.indexOf(stageLine!)).toBeGreaterThan(all.indexOf(activeSection!));
    });
  });

  // ── W3 (C-5) — the job ticket is gone; the LENS BAND stands where it stood.
  // Mounted by the DOCUMENT, not by the section, so every spread reads
  // identically — and, because it is document-level and sticky, `TableFrame`
  // no longer re-mounts anything at the table's head either.
  //
  // What moved, assertion by assertion: the eight `[data-ticket-row]` reads
  // ("prints the same eight rows on a %s spread", the four projectless VALUE
  // reads) are DELETED here — the rows are data, and `ticket-derivation.test.ts`
  // owns them by name. The B3 People-row triple, which proved the PAGE hands
  // the derivation its own leaf-mount predicate rather than `Boolean(project_id)`,
  // is re-pointed at the ladder's doors: `deriveLadderDoors` gates the four
  // project doors on the same `input.project`. The one-per-document count and
  // the sentinel adjacency survive verbatim, renamed to `[data-lens-band]`. ──
  describe('the lens band (B1 → C-5)', () => {
    const BAND = '[data-lens-band]';
    const band = () => document.querySelector<HTMLElement>(BAND);
    const doorKeys = () =>
      Array.from(
        screen.getByTestId('ladder-doors').querySelectorAll('li'),
        (li) => li.textContent,
      );

    it.each(['project', 'install', 'care'])(
      'stands on a %s spread',
      (section) => {
        asProjectDocument();
        const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
        mockDocumentQuery = {
          ...mockDocumentQuery,
          data: { kind: 'engagement', row: { ...current, active_section: section } },
        };

        render(<DocumentPage params={fulfilledParams} />);

        expect(band()).not.toBeNull();
        expect(screen.getByRole('region', { name: 'The job' })).toBe(band());
      },
    );

    it('stands on a document with no project (B2)', () => {
      // The outer beforeEach's row is a lead (Brief) document. It has no
      // project, so the derivation behind the band reads NOTHING — every row
      // is the honest empty `deriveTicket` holds for the four stages before
      // the work starts, and the money ladder's two un-`enabled` reads are
      // never fired at a document with no project behind them.
      render(<DocumentPage params={fulfilledParams} />);

      expect(band()).not.toBeNull();
    });

    // ── B3 · the leaf-mount predicate, at the PAGE's grain. What is proven
    // here is that the page hands the derivation the fact it needs —
    // `project` is read off THIS document's own row (`engagement_kind ===
    // 'project' && project_id`), not assumed from a project id. Wired wrong,
    // a proposal engagement that happens to carry a project id would offer
    // doors to leaves this page never mounted. The flag is off in this file's
    // mocks, so the two cases differ ONLY by that one fact. ──
    it('reads the leaf-mount predicate, not merely the presence of a project id', () => {
      const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
      mockDocumentQuery = {
        ...mockDocumentQuery,
        data: {
          kind: 'engagement',
          row: {
            ...current,
            engagement_kind: 'proposal',
            active_section: 'proposal',
            project_id: 'project-1',
          },
        },
      };

      render(<DocumentPage params={fulfilledParams} />);

      expect(doorKeys()).not.toContain('planroom');
      expect(doorKeys()).not.toContain('specbook');
    });

    it('opens the filed leaves only once a project is behind the paper', () => {
      asProjectDocument();

      render(<DocumentPage params={fulfilledParams} />);

      expect(doorKeys()).toEqual(
        expect.arrayContaining(['planroom', 'specbook', 'moodboards']),
      );
    });

    it('mounts exactly one band on a document, project or not', () => {
      render(<DocumentPage params={fulfilledParams} />);
      expect(document.querySelectorAll(BAND)).toHaveLength(1);

      cleanup();
      asProjectDocument();
      render(<DocumentPage params={fulfilledParams} />);
      expect(document.querySelectorAll(BAND)).toHaveLength(1);
    });

    // ── W3 · the band is DOCUMENT-level, so the three worktable spreads that
    // used to re-mount the ticket inside `TableFrame` print exactly one. ──
      it.each([
      ['speccing', 'direction'],
      ['finalize', 'proposal'],
      ['delivery', 'project'],
    ])('mounts once on the %s spread', (_table, section) => {
      asProjectDocument();
      mockEnabledFlags = ['worktable'];
      const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
      mockDocumentQuery = {
        ...mockDocumentQuery,
        data: {
          kind: 'engagement',
          row: { ...current, active_section: section, proposal_status: 'sent' },
        },
      };

      render(<DocumentPage params={fulfilledParams} />);

      expect(document.querySelectorAll(BAND)).toHaveLength(1);
    });

    it('carries its pin sentinel with it, immediately above itself', () => {
      asProjectDocument();

      render(<DocumentPage params={fulfilledParams} />);

      const sentinel = document.getElementById('doc-ticket-sentinel');
      const letterhead = document.querySelector('main header');
      expect(sentinel).not.toBeNull();
      // The sentinel is the BAND's, rendered directly above it. Anchored to
      // the letterhead instead, a band standing anywhere else on the paper
      // would report itself pinned while it was still far below the frame top.
      expect(
        letterhead!.compareDocumentPosition(sentinel!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        sentinel!.compareDocumentPosition(band()!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(sentinel!.nextElementSibling).toBe(band());
    });

    it('stands under the letterhead, above the paper’s first region', () => {
      asProjectDocument();

      render(<DocumentPage params={fulfilledParams} />);

      const letterhead = document.querySelector('main header')!;
      const firstRegion = document.querySelector('[data-index-region]')!;
      expect(
        letterhead.compareDocumentPosition(band()!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        band()!.compareDocumentPosition(firstRegion) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('hands the letterhead the instruments ledger, and mounts it once', () => {
      asProjectDocument();

      render(<DocumentPage params={fulfilledParams} />);

      // One mount: two would register `useMobilePrimaryAction` twice and put
      // the same act on the 390 bar from two owners.
      const rows = document.querySelectorAll('[data-testid="instruments-row"]');
      expect(rows).toHaveLength(1);
      // Inside the letterhead's own ledger slot, not a row on the paper below.
      expect(
        screen.getByTestId('letterhead-instruments').contains(rows[0]!),
      ).toBe(true);
    });

    it('hands the letterhead the instruments on a document with no project', () => {
      // A pre-project document with a client profile keeps the row (R63) — it
      // just carries the direct-thread follow-up instead of the mirror.
      const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
      mockDocumentQuery = {
        ...mockDocumentQuery,
        data: {
          kind: 'engagement',
          row: { ...current, client_profile_id: 'client-1' },
        },
      };

      render(<DocumentPage params={fulfilledParams} />);

      expect(
        document.querySelectorAll('[data-testid="instruments-row"]'),
      ).toHaveLength(1);
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

    // W3-R1 — the zone's `<li>` list became the band's line 2 (the worst) plus
    // the standing sheet behind `+N MORE` (the rest), and line 2 is ranked by
    // DEADLINE DISTANCE, not by kind: neither the four standing tiers nor the
    // desk's four ranks decide it. The fixture below is the case that tells
    // the three rules apart — a decision three weeks out against a claim
    // window that shuts tomorrow. The retired tier sort put `decision-due`
    // (tier 1) above `damage` (tier 2) and would have led with the task.
    const farDecisionAndNearWindow = [
      {
        kind: 'task_due', text: 'Confirm the site measure — due in 21 days',
        actionLabel: 'Open the task', urgent: false, stamp: { label: 'TASK DUE' },
      },
      {
        kind: 'damage_claim',
        text: 'A delivered piece was damaged in transit — window closes in 1 day',
        actionLabel: null, urgent: true, stamp: { label: 'DAMAGE CLAIM' },
      },
    ];

    it('leads line 2 by deadline distance, and files the rest', () => {
      asProjectDocument();
      mockDeskData = {
        folders: [
          { row: { engagement_id: 'project-1' }, need: null, needs: farDecisionAndNearWindow },
        ],
        chips: [],
        composed: { 'project-1': true },
      };

      render(<DocumentPage params={fulfilledParams} />);

      expect(bandSentence()).toContain('window closes in 1 day');
      expect(bandSentence()).not.toContain('Confirm the site measure');

      fireEvent.click(screen.getByRole('button', { name: '+1 MORE' }));
      const sheet = screen.getByRole('dialog');
      expect(
        within(sheet).getByText('Confirm the site measure — due in 21 days'),
      ).toBeInTheDocument();
    });
  });

  // ── W3 (C-6) — the red-letter zone and the guide strip no longer print.
  // Both are model providers for the band's line 2: the worst standing
  // exception with its act, or the stage's guide sentence when nothing stands.
  //
  // What moved, assertion by assertion: `getByRole('region', { name: 'Needs
  // attention' })` becomes `data-lens-line2-kind === 'standing'` on the band's
  // one live region; `getElementById('document-next-up')` (the guide's own
  // heading id, which the strip owned) becomes `=== 'guide'`. The zone's
  // per-need `<li>` list becomes line 2 plus the standing sheet behind
  // `+N MORE`. The guide's `reason`, its `Input needed · …` line and its
  // `+N more` input count are DELETED with the strip — the band prints the
  // headline and the act, nothing else (proposal §2.2). ──
  // D-B22 — `guideShown`/`guideSelected` retired with the strip that fired
  // them (`DocumentGuide` no longer mounts, so those two events fired
  // NOWHERE). Their cases move here, against the three lens events, because
  // the page — which owns the band's model — is where the lens line fires.
  describe('the lens line’s telemetry (D-B22)', () => {
    it('fires once for the model the page actually printed', () => {
      asProjectDocument();
      mockDeskData = {
        folders: [{
          row: { engagement_id: 'project-1' },
          need: null,
          needs: [{
            kind: 'task_due', text: 'Confirm the site measure',
            actionLabel: 'Open the task', urgent: false, stamp: { label: 'TASK DUE' },
          }],
        }],
        chips: [],
        composed: { 'project-1': true },
      };

      render(<DocumentPage params={fulfilledParams} />);

      // N-10 — ONCE. `toHaveBeenLastCalledWith` passes just as happily on a
      // model that fired on every settling read, which is the defect the
      // once-per-distinct-shape key exists to prevent.
      expect(mockLensLineShown).toHaveBeenCalledTimes(1);
      expect(mockLensLineShown).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'standing',
          // N-05 — the act's own stable key, never its printed label.
          action_key: 'task_due-0',
          standing_count: 1,
          tier: 'full',
        }),
      );
    });

    it('fires nothing from the loading tree (N-11)', () => {
      // The loading and error trees print no band; an impression from a tree
      // with no lens line on it is a phantom.
      mockDocumentQuery = { isLoading: true, isFetching: true, isError: false, data: undefined };
      render(<DocumentPage params={fulfilledParams} />);
      expect(mockLensLineShown).not.toHaveBeenCalled();
    });

    it('fires on the act and on the door, and never from the band itself', () => {
      asProjectDocument();
      const needs = [
        {
          kind: 'task_due', text: 'Confirm the site measure',
          actionLabel: 'Open the task', urgent: false, stamp: { label: 'TASK DUE' },
        },
        {
          kind: 'damage_claim', text: 'A delivered piece was damaged in transit',
          actionLabel: null, urgent: true, stamp: { label: 'DAMAGE CLAIM' },
        },
      ];
      mockDeskData = {
        folders: [{ row: { engagement_id: 'project-1' }, need: null, needs }],
        chips: [],
        composed: { 'project-1': true },
      };

      render(<DocumentPage params={fulfilledParams} />);

      fireEvent.click(screen.getByRole('button', { name: '+1 MORE' }));
      expect(mockLensStandingSheetOpened).toHaveBeenCalledTimes(1);
      // The sheet's payload carries no `action_key` — the door opens a list,
      // not an act.
      expect(mockLensStandingSheetOpened.mock.calls[0][0]).not.toHaveProperty(
        'action_key',
      );
      expect(mockLensLineActed).not.toHaveBeenCalled();
    });

    it('is the document’s ONE live region, wherever line 2 came from (OD-7)', () => {
      asProjectDocument();
      render(<DocumentPage params={fulfilledParams} />);
      expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
    });
  });

  describe('line 2 — the sentence that changes (L1 → C-6)', () => {
    it('prints the standing exception, not the guide sentence, on a project document', () => {
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

      expect(bandLine2Kind()).toBe('standing');
      expect(bandSentence()).toContain('Confirm the site measure');
      expect(screen.getByRole('button', { name: 'Open the task' })).toBeInTheDocument();
      // One thing stands, so there is nothing to file behind the door.
      expect(screen.queryByRole('button', { name: /MORE$/ })).not.toBeInTheDocument();
    });

    it('prints the guide sentence on a non-project document', () => {
      // The default mockDocumentQuery row from the outer beforeEach is a lead
      // (Brief) document — unaffected by the project-only swap.
      render(<DocumentPage params={fulfilledParams} />);

      expect(bandLine2Kind()).toBe('guide');
      // A3-L7 leaves a resting Brief with no act to point at, so the sentence
      // is what names the state.
      expect(bandSentence()).toBe('Nothing to decide yet.');
    });

    it('files every other standing need behind the door', () => {
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

      fireEvent.click(screen.getByRole('button', { name: '+1 MORE' }));
      const sheet = screen.getByRole('dialog');
      // Every exception, none withheld — the sheet lists both, each with its
      // own act (OD-6).
      expect(sheet.querySelectorAll('[data-standing-row]')).toHaveLength(2);
      expect(within(sheet).getByText('Confirm the site measure')).toBeInTheDocument();
      expect(
        within(sheet).getByText('1 piece delivered — awaiting inspection'),
      ).toBeInTheDocument();
      expect(
        within(sheet).getByRole('button', { name: 'Inspect the delivery' }),
      ).toBeInTheDocument();
    });

    it('keeps the guide sentence on a project the Desk composition never covered', () => {
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
      expect(bandLine2Kind()).toBe('guide');
    });

    it('B2 — elects the guide’s sentence from the ticket’s own rows', async () => {
      asProjectDocument();
      mockDeskData = {
        folders: [{ row: { engagement_id: 'someone-else' }, need: null, needs: [] }],
        chips: [],
        composed: { 'someone-else': true },
      };
      // One overdue receivable — the only thing wrong on this paper. The
      // derivation's Money row states it, and the guide's sixth rung quotes
      // the row rather than reaching for the stage's shrug.
      mockInvoices = [
        {
          id: 'invoice-1',
          status: 'sent',
          total_cents: 1_750_000,
          amount_paid_cents: 0,
          due_date: '2026-01-05',
        },
      ];

      render(<DocumentPage params={fulfilledParams} />);

      // D-B26 — the money row's own exception is the worst thing standing, so
      // line 2 names the figure and line 1 YIELDS it rather than printing
      // $17,500 twice, twenty pixels apart. This paper has no install date, so
      // line 1's right slot is empty rather than shortened.
      expect(bandRightFlush()).not.toContain('$17,500');
      // The election is more direct than it was: the guide strip quoted the
      // row (`Money · $17,500 owed you`); the band takes the row's own
      // exception into the standing set and prints it as the worst thing on
      // the paper (OD-8, `rankStanding`). Same source, one hop fewer. The rows
      // reach the page one paint after the first, and L-1 turns the sentence
      // over 90ms rather than swapping it under the reader's eye.
      await waitFor(() => expect(bandLine2Kind()).toBe('standing'));
      expect(bandSentence()).toContain('$17,500 owed you');
    });

    it('B2 — stops naming a row once its data is gone', () => {
      asProjectDocument();
      mockDeskData = {
        folders: [{ row: { engagement_id: 'someone-else' }, need: null, needs: [] }],
        chips: [],
        composed: { 'someone-else': true },
      };

      render(<DocumentPage params={fulfilledParams} />);

      expect(bandSentence()).not.toContain('owed you');
      // Nothing is moving, so the money slot states nothing rather than a zero.
      expect(bandRightFlush()).not.toContain('$');
    });

    it('keeps the guide — and its retry — on a project whose Desk read failed', () => {
      asProjectDocument();
      mockDeskError = true;

      render(<DocumentPage params={fulfilledParams} />);

      expect(bandLine2Kind()).toBe('guide');
      expect(bandSentence()).toContain('Guidance is unavailable');
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(mockRetryDesk).toHaveBeenCalledTimes(1);
    });

    it('F77 — prints the guide, not a standing exception, when the composition covered the project and found nothing', () => {
      asProjectDocument();
      mockDeskData = { folders: [], chips: [], composed: { 'project-1': true } };

      render(<DocumentPage params={fulfilledParams} />);

      expect(mockSelectOperationalNeeds).toHaveReturnedWith([]);
      expect(bandLine2Kind()).toBe('guide');
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

      expect(bandLine2Kind()).toBe('guide');
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
      expect(bandLine2Kind()).toBe('guide');
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
    // The recap disclosure promises only what its own body holds. W2 (C-2)
    // gave the record a `RegionHead`, so the one line became two registers —
    // the name and the count — on the region's own root.
    const record = document.querySelector<HTMLElement>(
      '[data-index-region="record"]',
    )!;
    expect(within(record).getByText('The record')).toBeVisible();
    expect(within(record).getByText(/^\d+ complete$/)).toBeVisible();
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

  // ── A3-L8: the wiring this wave's lanes contracted the page for ──
  describe('A3 page wiring', () => {
    it('hands the FF&E schedule the same ranked needs the red letter prints', () => {
      asProjectDocument();
      mockDeskData = {
        folders: [{
          row: { engagement_id: 'project-1' },
          need: {
            kind: 'damage_claim', text: 'A delivered piece was damaged in transit',
            actionLabel: 'File the claim', urgent: true, stamp: { label: 'DAMAGED' },
          },
          needs: [{
            kind: 'damage_claim', text: 'A delivered piece was damaged in transit',
            actionLabel: 'File the claim', urgent: true, stamp: { label: 'DAMAGED' },
          }],
        }],
        chips: [],
        composed: { 'project-1': true },
      };

      render(<DocumentPage params={fulfilledParams} />);

      // One ordering for the whole spread: the head's leader is elected from
      // the same list the zone's first row was drawn from.
      const props = mockFFESection.mock.calls.at(-1)![0] as { needs?: readonly { kind: string }[] };
      expect(props.needs?.map((need) => need.kind)).toEqual(['damage_claim']);
    });

    it('does not call a discovery document complete while its own read is in flight', () => {
      const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
      mockDocumentQuery = {
        ...mockDocumentQuery,
        data: { kind: 'engagement', row: {
          ...current, engagement_kind: 'relationship', active_section: 'discovery',
          engagement_id: 'relationship-1', lead_id: null, client_profile_id: 'client-1',
        } },
      };
      // The discovery read has not answered, so the checklist is empty for want
      // of an answer rather than for want of work.
      mockDiscoveryQuery = { data: undefined, isLoading: true, isError: false };

      render(<DocumentPage params={fulfilledParams} />);

      expect(screen.queryByText('Discovery is complete. Shape the direction.')).not.toBeInTheDocument();
      expect(screen.getByText('Finish what you need to know')).toBeInTheDocument();
    });

    it('rests a discovery document once its read answers with nothing outstanding', () => {
      const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
      mockDocumentQuery = {
        ...mockDocumentQuery,
        data: { kind: 'engagement', row: {
          ...current, engagement_kind: 'relationship', active_section: 'discovery',
          engagement_id: 'relationship-1', lead_id: null, client_profile_id: 'client-1',
        } },
      };
      mockDiscoveryQuery = {
        data: { row: {
          project_type: 'full_home', rooms: [{ name: 'Kitchen' }],
          budget_max_cents: 18_450_000, target_date: '2026-11-02', hard_date: null,
          style_tag_ids: ['warm-modern'], style_keywords: [],
          lifestyle: [{ who: 'Two dogs', how: 'wipe-clean everything' }],
          keep_items: [], avoid_items: [], decision_makers: [],
          room_scan_id: null, site_notes: null,
        } },
        isLoading: false,
        isError: false,
      };

      render(<DocumentPage params={fulfilledParams} />);

      expect(screen.getByText('Discovery is complete. Shape the direction.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Begin the direction' })).toBeInTheDocument();
    });
  });

  // W5 (OD-2) — before this the four spreads before the work starts rendered
  // ZERO `[data-index-region]` and ZERO `[data-region-head]` elements (F16):
  // the ladder had nothing to index and the lens nothing to observe.
  describe('the pre-work spreads carry real regions', () => {
    const paperRegionKeys = () =>
      Array.from(
        document.querySelectorAll('[data-document-paper] [data-index-region]'),
      ).map((el) => el.getAttribute('data-index-region'));

    const openSpread = (row: Record<string, unknown>) => {
      const current = (mockDocumentQuery.data as { row: Record<string, unknown> }).row;
      mockDocumentQuery = {
        ...mockDocumentQuery,
        data: { kind: 'engagement', row: { ...current, ...row } },
      };
      render(<DocumentPage params={fulfilledParams} />);
    };

    const SPREADS = [
      ['brief', { engagement_kind: 'lead', active_section: 'brief', lead_id: 'lead-1' }],
      [
        'discovery',
        {
          engagement_kind: 'relationship',
          active_section: 'discovery',
          engagement_id: 'relationship-1',
          lead_id: null,
          client_profile_id: 'client-1',
        },
      ],
      [
        'direction',
        {
          engagement_kind: 'proposal',
          active_section: 'direction',
          proposal_id: 'proposal-1',
          lead_id: null,
        },
      ],
      [
        'proposal',
        {
          engagement_kind: 'proposal',
          active_section: 'proposal',
          proposal_id: 'proposal-1',
          lead_id: null,
        },
      ],
    ] as const;

    // W5F-02 — after N2 the strip is re-hosted inside `scope`, and `scope`
    // mounts on the PROPOSAL spread only. Suppressing it for all four pre-work
    // stages therefore took it off brief, discovery and direction entirely —
    // `section-stage-line-mount.tsx`'s section-mode branch exists for exactly
    // those three.
    it.each(SPREADS)(
      'the %s spread prints its stage strip exactly once, in the right place',
      (label, row) => {
        openSpread(row as Record<string, unknown>);

        const strips = document.querySelectorAll('[data-section-stage-line]');
        // One strip, on every pre-work spread — never zero (W5F-02), never two.
        expect(strips).toHaveLength(1);

        const insideScope = document.querySelector(
          '[data-index-region="scope"] [data-section-stage-line]',
        );
        if (label === 'proposal') {
          // Its body — so the first thing after the band is a region head.
          expect(insideScope).not.toBeNull();
        } else {
          // Where R1/I114 put it: the open section's own sub-label.
          expect(insideScope).toBeNull();
        }
      },
    );

    it.each(SPREADS)(
      'the %s spread mounts exactly the stops the index declares, in order',
      (section, row) => {
        openSpread(row);
        expect(paperRegionKeys()).toEqual(
          paperRegionsForSection(section).map((region) => region.key),
        );
      },
    );

    it.each(SPREADS)('every %s stop prints a region head', (_section, row) => {
      openSpread(row);
      for (const root of Array.from(
        document.querySelectorAll('[data-document-paper] [data-index-region]'),
      )) {
        expect(root.querySelector('[data-region-head]')).not.toBeNull();
      }
    });

    // OD-2 — a row the spread cannot state a number for prints a sentence,
    // never a dash and never a placeholder figure.
    it('prints NOTHING YET on a stop with no number', () => {
      // The proposal read has answered, with a paper that has not gone out:
      // the difference between `Reading…` and `Not sent yet` is the whole
      // discipline of the count line.
      mockProposalData = {
        id: 'proposal-1',
        status: 'draft',
        version: 1,
        sent_at: null,
        viewed_at: null,
        total_amount: null,
        items: [],
      };
      openSpread({
        engagement_kind: 'proposal',
        active_section: 'proposal',
        proposal_id: 'proposal-1',
        lead_id: null,
      });
      const statusOf = (key: string) =>
        document.querySelector(
          `[data-document-paper] [data-index-region="${key}"] [data-region-head]`,
        )?.textContent ?? '';
      // Prose has nothing to count, so the vision row is a name over a
      // sentence at every state.
      expect(statusOf('vision')).toContain('Not written yet');
      // `mockProposalData` is undefined here — nothing has gone out — and the
      // row says so in words rather than with a dash or a $0 husk.
      expect(statusOf('proposal')).toContain('Not sent yet');
      // W5-R5 §2 — `scope`'s fact HAS a source: the section stage line, which
      // is now this stop's own body (N2). So it prints the stage phrase, not
      // `Nothing yet` — and not the stop's name again, which the head prints
      // one line above.
      expect(statusOf('scope')).toContain('Core · stage 03');
      expect(statusOf('scope')).not.toContain('Scope & Engagement · Core');
      expect(statusOf('investment')).toContain('Nothing yet');
      expect(statusOf('vision')).not.toMatch(/—|--|\$0/);
    });

    // DL-02 — the three stage stops' printed names.
    it('names the stage stops as the design lead ruled', () => {
      openSpread({ engagement_kind: 'lead', active_section: 'brief', lead_id: 'lead-1' });
      expect(
        document
          .querySelector(
            '[data-document-paper] [data-index-region="brief"] [data-region-head]',
          )
          ?.querySelector('h2')?.textContent,
      ).toBe('The brief');
    });

    // W5-R2 item 1 — the proposal spread re-parents the blocks that used to
    // stand entirely under `investment`: `vision` takes the description,
    // `scope` takes the per-room budgets and the terms, `investment` keeps
    // the totals ledger alone.
    describe('re-parents the proposal blocks by region (W5-R2 item 1)', () => {
      const PROPOSAL_ROW = {
        engagement_kind: 'proposal',
        active_section: 'proposal',
        proposal_id: 'proposal-1',
        lead_id: null,
      } as const;

      it.each([
        ['scope', 'scope'],
        ['vision', 'vision'],
        ['investment', 'investment'],
      ] as const)('mounts the %s block under the %s stop', (group, region) => {
        openSpread(PROPOSAL_ROW);
        expect(
          document.querySelector(
            `[data-document-paper] [data-index-region="${region}"] [data-testid="blocks-${group}"]`,
          ),
        ).not.toBeNull();
      });

      it('mounts no block under a stop it was not re-parented to', () => {
        openSpread(PROPOSAL_ROW);
        const regionOf = (testId: string) =>
          document
            .querySelector(`[data-testid="${testId}"]`)
            ?.closest('[data-index-region]')
            ?.getAttribute('data-index-region');
        expect(regionOf('blocks-scope')).toBe('scope');
        expect(regionOf('blocks-vision')).toBe('vision');
        expect(regionOf('blocks-investment')).toBe('investment');
        // Never doubled onto `proposal` (the lifecycle stop) or onto each
        // other's region.
        expect(
          document.querySelector(
            '[data-index-region="proposal"] [data-testid^="blocks-"]',
          ),
        ).toBeNull();
      });

      it('the direction spread keeps every block under its one stop, unfiltered', () => {
        openSpread({
          engagement_kind: 'proposal',
          active_section: 'direction',
          proposal_id: 'proposal-1',
          lead_id: null,
        });
        expect(
          document.querySelector(
            '[data-document-paper] [data-index-region="direction"] [data-testid="blocks-full"]',
          ),
        ).not.toBeNull();
      });
    });
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

// W5-R6 / 1b — the shell's Put-down (D1) and text entry share one key. A
// reader amending the letterhead's name pressed Escape to mean "leave it
// alone" and the shell put the paper down underneath her: `/doc/…` → `/desk`.
describe('Escape puts the paper down — unless a field is using the key', () => {
  // The Put-down listener is registered by the shell itself, above whatever
  // the paper is doing — so a still-resolving document is enough to read it.
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
    mockRecentDocumentsInHand = [];
    mockDocumentQuery = {
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
      refetch: mockRetryDocumentResolution,
    };
    setViewport({ width: 1440, reducedMotion: true });
  });

  it('puts a bare document down', () => {
    render(<DocumentPage params={fulfilledParams} />);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(mockRouter.push).toHaveBeenCalledWith('/desk');
  });

  it('leaves the paper alone when the key came from text entry', () => {
    render(<DocumentPage params={fulfilledParams} />);
    // Fired straight at the shell's own listener, outside React's tree: the
    // guard has to hold on its own, not because the field stopped the event.
    const field = document.createElement('input');
    document.body.appendChild(field);
    try {
      fireEvent.keyDown(field, { key: 'Escape' });
      expect(mockRouter.push).not.toHaveBeenCalled();
    } finally {
      field.remove();
    }
  });
});
