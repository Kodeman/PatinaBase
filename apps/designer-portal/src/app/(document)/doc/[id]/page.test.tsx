import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import DocumentPage from './page';
import { authorizationDoorwayFor } from '@/lib/document/authorization-doorway';

let mockHydrated = false;
const mockRetryDocumentResolution = jest.fn();
const mockHistoryToggled = jest.fn();
const mockDiscoveryFacetOpen = jest.fn();
let mockDocumentQuery: Record<string, unknown>;
let mockDiscoveryQuery: Record<string, unknown> = { data: undefined, isLoading: false, isError: false };
let mockDraftingState: Record<string, unknown> = { gaps: [], isLoading: false, error: null };
let mockProposalData: Record<string, unknown> | undefined;
let mockProposalError = false;
let mockProjectQuery: Record<string, unknown> = { data: undefined, isLoading: false, isError: false };

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
}));

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
      <button id="discovery-facet-budget" type="button" onClick={mockDiscoveryFacetOpen}>
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
jest.mock('@/components/document/margin-rail', () => ({ MarginRail: () => null, ResponsiveMarginRail: () => null }));
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

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-section-work', () => ({
  gateState: jest.fn(),
  useSectionGates: () => ({ data: [] }),
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
  },
}));

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
    mockDiscoveryQuery = { data: undefined, isLoading: false, isError: false };
    mockDraftingState = { gaps: [], isLoading: false, error: null };
    mockProposalData = undefined;
    mockProposalError = false;
    mockProjectQuery = { data: undefined, isLoading: false, isError: false };
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
    window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
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
