/**
 * The canonical paper order, checked against the paper.
 *
 * `PROJECT_PAPER_ORDER` claims to state the order the Project regions actually
 * mount in, and the spine's running index is derived from it — so if the array
 * and the DOM ever disagree, the index lies about the document again (it did:
 * the list declared schedule first while approvals mounted above the ledger).
 *
 * Nothing else can catch that. `use-document-running-index.test.tsx` builds its
 * fixture FROM the keys, so it agrees with the array by construction; only a
 * render of the real page walking the real `[data-index-region]` roots can tell
 * the two apart. The four region components are stubbed down to their markers
 * (their bodies are other suites' subject), which is exactly the contract under
 * test: WHERE the page mounts them, not what they draw.
 */
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import DocumentPage from './page';
import { PROJECT_PAPER_ORDER } from '@/lib/document/document-index';

jest.mock('@portabletext/react', () => ({
  PortableText: () => null,
  toPlainText: () => '',
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  /* B1 — the job ticket's own reads. The ticket is mounted by every
     project-kind document now, so every suite that renders one pays for
     these; none of them is this suite's subject. */
  usePlanRoom: () => ({ data: { sheets: [] }, isLoading: false }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useProjectBoards: () => ({ data: [], isLoading: false }),
  useProjectInvoices: () => ({ isLoading: false, error: null, data: [] }),
  usePurchaseOrders: () => ({ isLoading: false, error: null, data: [] }),
  computeArAging: jest.requireActual('@patina/supabase').computeArAging,
  invoiceDaysOverdue: jest.requireActual('@patina/supabase').invoiceDaysOverdue,
  useProjectRoomScans: () => ({ data: [] }),
  useGeneratedRoomFilesByScan: () => ({ data: new Map() }),
  useProjectV2: () => ({ data: undefined, isLoading: false, isError: false }),
  useProjectPhases: () => ({ data: [] }),
  useProjectApprovals: () => ({ data: [] }),
  useProposalFeedback: () => ({ data: [] }),
  useProjectRoster: () => ({ data: [] }),
  useDiscovery: () => ({ data: undefined, isLoading: false, isError: false }),
  useProjectFFEItems: () => ({ data: [] }),
  useProjectContextualHandoffs: () => ({ data: [], isError: false }),
  useProjectParties: () => ({ data: [] }),
  useCoordinationItems: () => ({ data: [] }),
  useDesignerClientForClientUser: () => ({ data: null }),
  useProjectWorkflow: () => ({ data: [], isLoading: false, isError: false }),
  useResolvedSchedule: () => ({
    phases: [],
    milestones: [],
    resolved: null,
    isLoading: false,
    isError: false,
  }),
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

/* The four index regions, reduced to the roots the scrollspy observes. */
jest.mock('@/components/document/approvals/project-approval-document', () => ({
  ProjectApprovalDocument: () => <div data-index-region="approvals" />,
}));
jest.mock('@/components/document/schedule/schedule-spine', () => ({
  ScheduleSpine: () => <div data-index-region="schedule" />,
}));
jest.mock('@/components/document/ffe-section', () => ({
  FFESection: () => <div data-index-region="ffe" />,
}));
jest.mock('@/components/document/commercial/money-region', () => ({
  MoneyRegion: () => <div data-index-region="money" />,
}));

/* Everything else the page mounts is another suite's subject. */
jest.mock('@/components/document/care-band', () => ({ CareBand: () => null }));
jest.mock('@/components/document/account-band', () => ({ AccountBand: () => null }));
jest.mock('@/components/document/roster/kickoff-band', () => ({ KickoffBand: () => null }));
jest.mock('@/components/document/spine-shelved-blocks', () => ({
  DocSpineShelvedBlocks: () => null,
}));
jest.mock('@/components/document/shelves/document-shelves', () => ({
  DocumentShelves: () => null,
}));
jest.mock('@/components/document/roster/call-sheet-mount', () => ({ CallSheetMount: () => null }));
jest.mock('@/components/document/doc-spine', () => ({ DocSpine: () => null }));
jest.mock('@/components/document/doc-letterhead', () => ({ DocLetterhead: () => null }));
jest.mock('@/components/document/doc-colophon', () => ({ DocColophon: () => null }));
jest.mock('@/components/document/previous-work', () => ({
  PreviousWork: () => <div data-the-record />,
}));
jest.mock('@/components/document/brief-section', () => ({ BriefSection: () => null }));
jest.mock('@/components/document/brief-recap', () => ({ BriefRecap: () => null }));
jest.mock('@/components/document/discovery/discovery-section', () => ({
  DiscoverySection: () => null,
}));
jest.mock('@/components/document/discovery/discovery-recap', () => ({
  DiscoveryRecap: () => null,
}));
jest.mock('@/components/document/discovery/discovery-margin', () => ({
  DiscoveryMargin: () => null,
}));
jest.mock('@/components/document/proposal-blocks-readonly', () => ({
  ProposalBlocksReadOnly: () => null,
}));
jest.mock('@/components/document/proposal-instruments', () => ({
  ProposalInstruments: () => null,
}));
jest.mock('@/components/document/folio-strip', () => ({
  FolioLetterhead: () => null,
  ProposalFolioStrip: () => null,
}));
jest.mock('@/components/document/mobile/mobile-margin-chips', () => ({
  MobileMarginChips: () => null,
}));
jest.mock('@/components/document/letterhead-instruments', () => ({
  LetterheadInstruments: () => null,
}));
jest.mock('@/components/document/section-stage-line-mount', () => ({
  SectionStageLineMount: () => null,
}));
jest.mock('@/components/document/schedule/schedule-rule-region', () => ({
  ScheduleRuleRegion: () => null,
}));
jest.mock('@/components/document/schedule/install-window-ceremony', () => ({
  InstallWindowCeremony: () => null,
}));
jest.mock('@/components/document/schedule/schedule-nav-context', () => ({
  ScheduleNavProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/document/schedule/schedule-ripple-context', () => ({
  RippleProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/document/margin-rail', () => ({
  MarginRail: () => null,
  ResponsiveMarginRail: () => null,
  openMarginRail: jest.fn(),
}));
jest.mock('@/components/document/household-chip', () => ({ HouseholdChip: () => null }));
jest.mock('@/components/document/document-guide', () => ({ DocumentGuide: () => null }));
jest.mock('@/components/document/red-letter-zone', () => ({ RedLetterZone: () => null }));

jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));
jest.mock('@/hooks/document-time-provider', () => ({ useHoldDocument: jest.fn() }));
jest.mock('@/components/document/mobile/mobile-shell', () => ({
  useMobileActiveDoc: jest.fn(),
  useMobilePrimaryAction: jest.fn(),
}));
jest.mock('@/hooks/use-document-presence', () => ({ useDocumentPresence: () => [] }));
jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({ data: undefined, isError: false }),
}));
jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingState: () => ({ gaps: [], isLoading: false, error: null }),
}));
jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => ({
    data: { folders: [], chips: [], composed: {} },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  selectOperationalNeedForDocument: () => undefined,
  selectOperationalNeedsForDocument: () => undefined,
}));
jest.mock('@/hooks/use-document-rooms', () => ({ useDocumentRooms: () => ({ data: [] }) }));
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
  readRecentDocumentsInHand: () => [],
  documentEvents: {
    historyToggled: jest.fn(),
    guideShown: jest.fn(),
    guideSelected: jest.fn(),
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    wayfinding: { marginNote: jest.fn() },
  },
}));

const PROJECT_ROW = {
  engagement_kind: 'project',
  engagement_id: 'project-1',
  project_id: 'project-1',
  proposal_id: null,
  lead_id: null,
  designer_id: 'designer-1',
  client_profile_id: 'client-1',
  client_name: 'Avery Stone',
  title: 'Stone Residence',
  active_section: 'project',
  project_status: 'active',
  current_phase: 'design_development',
  is_paused: false,
  is_archived: false,
  proposal_status: null,
  proposal_sent_at: null,
  proposal_viewed_at: null,
  lead_response_deadline: null,
  lead_status: null,
  overdue_decision_count: 0,
  earliest_overdue_due: null,
  awaiting_inspection_count: 0,
  blocked_item_count: 0,
  in_flight_count: 0,
  installed_count: 0,
  item_count: 0,
  updated_at: '2026-08-10T12:00:00Z',
  open_claim_count: 0,
  open_claim_po: null,
  unsent_pulse_count: 0,
  pulse_week_of: null,
  draft_unsent_po_count: 0,
  oldest_draft_po_created_at: null,
  draft_po_label: null,
  unacked_po_count: 0,
  oldest_unacked_sent_at: null,
  unacked_po_label: null,
  due_task_count: 0,
  earliest_task_due: null,
  due_task_title: null,
};

jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => ({
    data: { kind: 'engagement', row: PROJECT_ROW },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

const params = {
  status: 'fulfilled',
  value: { id: 'project-1' },
  then: () => undefined,
} as unknown as Promise<{ id: string }>;

describe('the canonical paper order', () => {
  beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: /min-width:\s*(\d+)px/.test(query),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  it('mounts the Project regions in exactly the order PROJECT_PAPER_ORDER declares', () => {
    const { container } = render(<DocumentPage params={params} />);

    const mounted = Array.from(
      container.querySelectorAll('[data-index-region]'),
    ).map((el) => el.getAttribute('data-index-region'));

    expect(mounted).toEqual(PROJECT_PAPER_ORDER.map((region) => region.key));
  });

  it('mounts every declared region — the index never names a place the paper lacks', () => {
    const { container } = render(<DocumentPage params={params} />);

    for (const region of PROJECT_PAPER_ORDER) {
      expect(
        container.querySelector(`[data-index-region="${region.key}"]`),
      ).not.toBeNull();
    }
  });

  it('keeps the Record at the foot: the settled bars follow the last indexed region', () => {
    const { container } = render(<DocumentPage params={params} />);

    const nodes = Array.from(container.querySelectorAll('main *'));
    const lastRegion = container.querySelector('[data-index-region="money"]')!;
    const record = container.querySelector('[data-the-record]');

    // The Record mounts at all on a project document, and does so after the
    // work rather than between the guide and it.
    expect(record).not.toBeNull();
    expect(nodes.indexOf(record as Element)).toBeGreaterThan(
      nodes.indexOf(lastRegion),
    );
  });
});
