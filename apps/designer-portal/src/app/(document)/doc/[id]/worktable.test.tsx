/**
 * The Worktable, flag on — the parity the whole wave rests on.
 *
 * W2 re-composes the middle of the paper and nothing else, so the one thing
 * this spec proves is that the Delivery table is exactly the project document
 * that was already there: the same four regions, in the canonical order W1
 * pinned, with the Record still at the foot — now inside a table root that
 * names itself. Flag OFF parity is `paper-order.test.tsx`, which renders the
 * same page with the flag mocked false (jest's default state).
 *
 * The mock surface is deliberately identical to that file's: same stubs, same
 * row, so any difference in the rendered order is the flag's doing and nothing
 * else's.
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
  // The ticket reads the PROPOSAL's own three populations on a paper with no
  // project (B2). All three are `enabled` on a proposal id, so a document
  // without one runs none of them.
  useProposalScopeRooms: () => ({ data: [], isLoading: false }),
  useProposalScheduleItems: () => ({ data: [], isLoading: false }),
  useBoards: () => ({ data: [], isLoading: false, isError: false }),
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
  MoneyRegion: () => <div data-index-region="money" data-accounts-surface="money" />,
}));

/* Everything else the page mounts is another suite's subject. */
// W2 (C-2): the project spread's Care band IS the running index's `care`
// root; the install spread's second mount is not (one root per stop).
jest.mock('@/components/document/care-band', () => ({
  CareBand: ({ indexRoot }: { indexRoot?: boolean }) =>
    indexRoot ? <div data-index-region="care" /> : null,
}));
jest.mock('@/components/document/quiet-sections', () => ({ CareSection: () => null }));
/* The two surfaces that state the accounts — one of them prints, never both. */
jest.mock('@/components/document/account-band', () => ({
  AccountBand: () => <div data-accounts-surface="band" />,
}));
jest.mock('@/components/document/roster/kickoff-band', () => ({ KickoffBand: () => null }));
jest.mock('@/components/document/shelves/document-shelves', () => ({
  DocumentShelves: () => null,
}));
jest.mock('@/components/document/roster/call-sheet-mount', () => ({ CallSheetMount: () => null }));
jest.mock('@/components/document/doc-spine', () => ({ DocSpine: () => null }));
jest.mock('@/components/document/doc-letterhead', () => ({ DocLetterhead: () => null }));
jest.mock('@/components/document/doc-colophon', () => ({ DocColophon: () => null }));
// W2 (C-2): the record root is emitted unconditionally now, empty body and
// all, so the index has a foot to observe on a project with nothing settled.
jest.mock('@/components/document/previous-work', () => ({
  PreviousWork: () => (
    <section data-index-region="record">
      <div data-the-record />
    </section>
  ),
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
// W3 (C-6) — the guide is a MODEL provider now: the page reads
// `deriveGuideModel` for the band's line 2 and never renders the strip.
jest.mock('@/components/document/document-guide', () => ({
  DocumentGuide: () => null,
  deriveGuideModel: (model: { headline: string }) => ({
    text: model.headline,
    act: null,
  }),
}));
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
/* The one difference from paper-order.test.tsx: the table is set. */
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({ value: name === 'worktable', isLoading: false }),
}));
jest.mock('@/lib/help-system/use-document-surface', () => ({
  useDocumentSurface: jest.fn(),
}));
jest.mock('@/lib/analytics/document-events', () => ({
  rememberDocumentInHand: jest.fn(),
  readRecentDocumentsInHand: () => [],
  documentEvents: {
    lensLineShown: jest.fn(),
    lensLineActed: jest.fn(),
    lensStandingSheetOpened: jest.fn(),
    historyToggled: jest.fn(),
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

/** The live row, which the derivation may move under a pinned composition. */
const mockRow: { current: typeof PROJECT_ROW } = { current: PROJECT_ROW };

jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => ({
    data: { kind: 'engagement', row: mockRow.current },
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

describe('the Worktable, flag on', () => {
  beforeEach(() => {
    mockRow.current = PROJECT_ROW;
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

  it('sets the Delivery table, in its procurement setting, on a project document', () => {
    const { container } = render(<DocumentPage params={params} />);

    const table = container.querySelector('[data-table]');
    expect(table).not.toBeNull();
    expect(table!.getAttribute('data-table')).toBe('delivery');
    expect(table!.getAttribute('data-table-setting')).toBe('procurement');
  });

  it('keeps the canonical paper order under the table', () => {
    const { container } = render(<DocumentPage params={params} />);

    const mounted = Array.from(
      container.querySelectorAll('[data-index-region]'),
    ).map((el) => el.getAttribute('data-index-region'));

    expect(mounted).toEqual(PROJECT_PAPER_ORDER.map((region) => region.key));
  });

  it('keeps the Record at the foot', () => {
    const { container } = render(<DocumentPage params={params} />);

    const nodes = Array.from(container.querySelectorAll('main *'));
    // W2 — `record` is the last indexed region now: `PreviousWork` emits its
    // root unconditionally and the Care band carries `care`, so the paper's
    // own foot is what the Record must follow.
    const lastRegion = container.querySelector('[data-index-region="record"]')!;
    const record = container.querySelector('[data-the-record]');

    expect(record).not.toBeNull();
    expect(nodes.indexOf(record as Element)).toBeGreaterThan(
      nodes.indexOf(lastRegion),
    );
  });

  /**
   * F1 — the accounts are an either-or: the money region states them inside the
   * Project spread, the account band states them everywhere else. An armed turn
   * is unbounded (the designer may never press it), so for as long as it stands
   * the two must still agree about which section the paper is composed as.
   */
  describe('through an armed turn window', () => {
    it('prints exactly one accounts surface when the live section moves off project', () => {
      const { container, rerender } = render(<DocumentPage params={params} />);

      mockRow.current = { ...PROJECT_ROW, active_section: 'care' };
      rerender(<DocumentPage params={params} />);

      // The turn is armed and unpressed: the paper is still the Project spread.
      expect(container.querySelector('[data-table-turn]')).not.toBeNull();
      expect(container.querySelector('[data-table]')!.getAttribute('data-table')).toBe(
        'delivery',
      );
      expect(container.querySelectorAll('[data-accounts-surface]')).toHaveLength(1);
      expect(
        container.querySelector('[data-accounts-surface]')!.getAttribute(
          'data-accounts-surface',
        ),
      ).toBe('money');
    });

    it('prints exactly one accounts surface when the live section moves onto project', () => {
      mockRow.current = { ...PROJECT_ROW, active_section: 'care' };
      const { container, rerender } = render(<DocumentPage params={params} />);

      mockRow.current = PROJECT_ROW;
      rerender(<DocumentPage params={params} />);

      expect(container.querySelector('[data-table-turn]')).not.toBeNull();
      expect(container.querySelectorAll('[data-accounts-surface]')).toHaveLength(1);
      expect(
        container.querySelector('[data-accounts-surface]')!.getAttribute(
          'data-accounts-surface',
        ),
      ).toBe('band');
    });
  });

  it('says nothing it has no reason to say — no turn, no seal note, no seams', () => {
    const { container } = render(<DocumentPage params={params} />);

    expect(container.querySelector('[data-table-turn]')).toBeNull();
    expect(container.querySelector('[data-seal-turn-note]')).toBeNull();
    expect(container.querySelector('[data-future-seam]')).toBeNull();
    // The Speccing slots are Wave 3's; an unfilled slot prints nothing at all.
    expect(container.querySelector('[data-table-slot]')).toBeNull();
  });
});
