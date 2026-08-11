import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import DocumentPage from './page';
import { authorizationDoorwayFor } from '@/lib/document/authorization-doorway';

let mockHydrated = false;
const mockRetryDocumentResolution = jest.fn();
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
type MockDeskData = {
  folders: Array<{ row: { engagement_id: string }; need: Record<string, unknown> | null }>;
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

jest.mock('@portabletext/react', () => ({
  PortableText: () => null,
  toPlainText: () => '',
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useProjectV2: () => mockProjectQuery,
  useProjectPhases: () => ({ data: [] }),
  useProposalFeedback: () => ({ data: [] }),
  useProjectRoster: () => ({ data: [] }),
  useDiscovery: () => mockDiscoveryQuery,
  // Read by the real MarginRail.
  useProjectFFEItems: () => ({ data: [] }),
  useProjectParties: () => ({ data: [] }),
  useCoordinationItems: () => ({ data: [] }),
  useDesignerClientForClientUser: () => ({ data: null }),
  useProjectWorkflow: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
}));

// The project document's own sections are not what these tests exercise; the
// guide strip and the margin are.
jest.mock('@/components/document/ffe-section', () => ({ FFESection: () => null }));
jest.mock('@/components/document/coordination/coordination-band', () => ({ CoordinationBand: () => null }));
jest.mock('@/components/document/schedule/schedule-spine', () => ({ ScheduleSpine: () => null }));
jest.mock('@/components/document/workflow/contextual-handoff-band', () => ({
  ContextualHandoffBand: () => null,
}));
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
jest.mock('@/components/document/account-band', () => ({ AccountBand: () => null }));
jest.mock('@/components/document/project-mood-boards', () => ({ ProjectMoodBoards: () => null }));
jest.mock('@/components/document/roster/kickoff-band', () => ({ KickoffBand: () => null }));
jest.mock('@/components/document/plans/plan-room-band', () => ({ PlanRoomBand: () => null }));
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
  DocSpine: ({ onJump }: { onJump: (section: string) => void }) => (
    <button type="button" onClick={() => onJump('brief')}>Jump to brief</button>
  ),
}));
jest.mock('@/components/document/doc-letterhead', () => ({
  DocLetterhead: ({ title }: { title: string }) => <header>{title}</header>,
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

jest.mock('@/components/document/phase-timeline', () => ({
  PhaseTimeline: ({ projectId }: { projectId: string }) => (
    <div data-testid="legacy-schedule">Legacy schedule · {projectId}</div>
  ),
}));

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
    mockDeskData = { folders: [], chips: [], composed: {} };
    mockDeskLoading = false;
    mockDeskError = false;
    mockRetryDesk.mockReset();
    mockUseDeskEngagements.mockClear();
    mockSelectOperationalNeed.mockClear();
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

    fireEvent.click(screen.getByRole('button', { name: 'Review the brief' }));

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
    expect(screen.getByRole('button', { name: 'Review decisions' })).toBeInTheDocument();
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
          actionLabel: 'Review now', urgent: false, stamp: { label: 'DORMANT' },
        },
      }],
      chips: [],
      composed: { 'relationship-1': true },
    };

    render(<DocumentPage params={fulfilledParams} />);

    expect(mockUseDeskEngagements).toHaveBeenCalledWith({ enabled: false });
    expect(mockSelectOperationalNeed).not.toHaveBeenCalled();
    expect(screen.queryByText('Reconnect with Avery')).not.toBeInTheDocument();
    expect(screen.getByText('Complete Discovery')).toBeInTheDocument();
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

    expect(screen.getByText('Guidance is unavailable')).toBeInTheDocument();
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
    expect(screen.getByText('Review the inquiry')).toBeInTheDocument();
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
    expect(screen.getByText('Complete Discovery')).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'Review flagged lines' })).toHaveAttribute(
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

    expect(screen.getByRole('link', { name: 'Open Drafting Room' })).toHaveAttribute(
      'href', '/drafting/proposal-1',
    );
    expect(screen.getByText(/Input needed · phases & fees/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Review decisions' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Review and send' }));
    expect(document.getElementById('document-pulse-control-desktop')).toHaveAttribute(
      'aria-expanded', 'true',
    );
    expect(screen.getByText('Pulse body')).toBeInTheDocument();

    // Second activation must leave it open, not toggle it shut.
    fireEvent.click(screen.getByRole('button', { name: 'Review and send' }));
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

    expect(screen.getByText('Guidance is unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/Input needed/)).not.toBeInTheDocument();
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
