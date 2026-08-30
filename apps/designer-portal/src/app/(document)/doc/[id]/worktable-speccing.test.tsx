/**
 * The Speccing table's four tools, wired (Start to Signature W3).
 *
 * worktable.test.tsx proves the Delivery table is the project document that was
 * already there; this spec proves the Speccing table is the direction spread
 * plus exactly four tools, in W2's declared order — rooms-rail at the head,
 * then scheme, boards-strip, reach-in — each keyed on the PROPOSAL identity
 * (00327 Shape B: `proposal_id` is the live chain version; `engagement_id` is
 * the chain root the route arrives on), and that the rail's held room reaches
 * the scheme and the strip as their lens. Flag off, none of it exists; a
 * non-Speccing table mounts none of it.
 *
 * The four tools render REAL — their data hooks are mocked per their own
 * specs' patterns (rooms-rail.test / scheme.test / boards-strip.test /
 * library-reach-in.test), so the lens assertions walk actual lifted DOM order,
 * not forwarded props.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import DocumentPage from './page';

jest.mock('@portabletext/react', () => ({
  PortableText: () => null,
  toPlainText: () => '',
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/doc/chain-root-1',
}));

/* ── The four tools' data reads, recording the id each was keyed on. ────── */

const mockScopeRoomsHook = jest.fn();
const mockBoardsHook = jest.fn();
const mockDocCodesHook = jest.fn();
const mockItemsEq = jest.fn();
let mockItems: any[] = [];
let mockBoards: any[] = [];

const RAIL_ROOMS = [
  { id: 'room-living', name: 'Living Room', ffe_categories: null },
  { id: 'room-study', name: 'The Study', ffe_categories: null },
];

function board(id: string, name: string, scopeRoomId: string | null, sort: number) {
  return {
    id,
    proposal_id: 'proposal-live-1',
    project_id: null,
    name,
    scope_room_id: scopeRoomId,
    cover_image_url: null,
    cover_fallback_url: null,
    cover_fallback_urls: [],
    canvas_width: 1200,
    canvas_height: 800,
    background_color: '#FAF8F5',
    sort_order: sort,
    sections: [],
    status: 'active',
    item_count: 2,
    verdict_counts: { approved: 0, rejected: 0, comment: 0, total: 0 },
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
  };
}

function line(id: string, name: string, scopeRoomId: string | null, position: number) {
  return {
    id,
    name,
    description: null,
    quantity: 1,
    unit_price: 100000,
    unit_sell_price: 100000,
    markup_percent: null,
    line_total_cents: 100000,
    notes: null,
    internal_notes: null,
    category: null,
    vendor_name: null,
    position,
    scope_room_id: scopeRoomId,
    product_id: null,
    image_url: null,
    item_type: 'fixed',
    budget_min_cents: null,
    budget_max_cents: null,
    ffe_category: null,
    doc_code: null,
    lead_time_weeks: null,
    custom_fields: null,
  };
}

jest.mock('@patina/supabase', () => ({
  /* B1 — the job ticket's own reads. The ticket is mounted by every
     project-kind document now, so every suite that renders one pays for
     these; none of them is this suite's subject. */
  useProjectFFEItems: () => ({ data: [], isLoading: false }),
  usePlanRoom: () => ({ data: { sheets: [] }, isLoading: false }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useProjectBoards: () => ({ data: [], isLoading: false }),
  useProjectInvoices: () => ({ isLoading: false, error: null, data: [] }),
  usePurchaseOrders: () => ({ isLoading: false, error: null, data: [] }),
  computeArAging: jest.requireActual('@patina/supabase').computeArAging,
  invoiceDaysOverdue: jest.requireActual('@patina/supabase').invoiceDaysOverdue,
  useProjectRoomScans: () => ({ data: [] }),
  useGeneratedRoomFilesByScan: () => ({ data: new Map() }),
  /* the page's own reads */
  useProjectV2: () => ({ data: undefined, isLoading: false, isError: false }),
  useProjectPhases: () => ({ data: [] }),
  useProjectApprovals: () => ({ data: [] }),
  useProposalFeedback: () => ({ data: [] }),
  useProjectRoster: () => ({ data: [] }),
  useDiscovery: () => ({ data: undefined, isLoading: false, isError: false }),
  useProjectContextualHandoffs: () => ({ data: [], isError: false }),
  useCoordinationItems: () => ({ data: [] }),
  useResolvedSchedule: () => ({
    phases: [],
    milestones: [],
    resolved: null,
    isLoading: false,
    isError: false,
  }),
  /* the rooms rail (rooms-rail.test.tsx pattern) */
  useProposalScheduleItems: () => ({ data: [], isLoading: false }),
  useProposalScopeRooms: (proposalId: string) => {
    mockScopeRoomsHook(proposalId);
    return { data: RAIL_ROOMS, isLoading: false };
  },
  useAddScopeRoom: () => ({ mutate: jest.fn(), isPending: false }),
  /* the boards strip (boards-strip.test.tsx pattern) */
  useBoards: (proposalId: string) => {
    mockBoardsHook(proposalId);
    return { data: mockBoards, isLoading: false, isError: false };
  },
  useUpsertBoard: () => ({ mutateAsync: jest.fn(), isPending: false }),
  /* the reach-in (library-reach-in.test.tsx pattern) */
  useCrossLayerSearch: () => ({ data: undefined, isLoading: false, isError: false }),
  useAddProposalItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
  /* the scheme's builder (scheme.test.tsx pattern) */
  useFFECategories: () => ({ data: [] }),
  useConsumeCapture: () => ({ mutate: jest.fn(), isPending: false }),
  useReorderProposalItems: () => ({ mutate: jest.fn() }),
  useReorderProposalScopeRooms: () => ({ mutate: jest.fn() }),
  useIsStudioOwner: () => ({ isStudioOwner: false }),
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => {
          mockItemsEq(column, value);
          return {
            order: () => Promise.resolve({ data: mockItems, error: null }),
          };
        },
      }),
    }),
  }),
}));

// W5-R1: the Margin sheet's whole-margin derivation lives in this local
// hook, not `@patina/supabase` — mocking it keeps the fix top-of-file only
// (no QueryClientProvider needed: the real `useQuery` inside it never runs).
jest.mock('@/hooks/use-margin-items', () => ({
  useMarginItems: () => ({ data: [] }),
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

/* The reach-in's taken-codes read — its own key by design (F1); the key
   factory stays real so the seam matches the shipped one. */
jest.mock('@/components/document/worktable/use-reach-in-doc-codes', () => ({
  ...jest.requireActual('@/components/document/worktable/use-reach-in-doc-codes'),
  useReachInDocCodes: (proposalId: string) => {
    mockDocCodesHook(proposalId);
    return { data: [] };
  },
}));

jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({ data: undefined, isError: false }),
  useAddProposalItem: () => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
  useUpdateProposalItem: () => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
  useRemoveProposalItem: () => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}));

jest.mock('@/lib/analytics', () => ({
  proposalEvents: { scopeUpdated: jest.fn(), itemAdded: jest.fn() },
}));

jest.mock('@/hooks/use-spec-fields', () => ({
  useSpecFieldDefs: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-drafting-facet-invalidation', () => ({
  useDraftingFacetInvalidation: () => () => Promise.resolve(),
}));

jest.mock('@/lib/proposal-autosave-registry', () => ({
  runBoardOwnerAutosaveAction: jest.fn(
    async (_owner: unknown, action: () => Promise<void>) => action(),
  ),
}));

/* The builder's heavy neighbors, exactly as scheme.test.tsx stubs them. */
jest.mock('@/components/portal/proposals/capture-inbox', () => ({
  CaptureInbox: () => null,
  parseCaptureDraggableId: () => null,
}));
jest.mock('@/components/portal/ffe/add-ffe-item-controls', () => {
  const React = require('react');
  return {
    AddFFEItemControls: React.forwardRef(function MockAddControls(
      _props: unknown,
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({
        openProduct: jest.fn(),
        openAllowance: jest.fn(),
        openTbd: jest.fn(),
      }));
      return null;
    }),
  };
});
jest.mock('@/components/portal/ffe/ffe-item-card', () => ({
  FFEItemCard: ({ name }: { name: string }) => <div data-line-name={name}>{name}</div>,
}));
jest.mock('@/components/portal/scope-builder/spec-fields-manager', () => ({
  SpecFieldsManager: () => null,
}));
jest.mock('@/components/portal/scope-builder/financial-lens', () => ({
  FinancialLensPanel: () => null,
}));
jest.mock('@/components/document/rooms/drafting/schedule-line-unfold', () => ({
  ScheduleLineUnfold: () => null,
}));

/* ── The page's surround, identical to worktable.test.tsx's stubs. ──────── */

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
jest.mock('@/components/document/care-band', () => ({ CareBand: () => null }));
jest.mock('@/components/document/quiet-sections', () => ({ CareSection: () => null }));
jest.mock('@/components/document/account-band', () => ({ AccountBand: () => null }));
jest.mock('@/components/document/roster/kickoff-band', () => ({ KickoffBand: () => null }));
jest.mock('@/components/document/shelves/document-shelves', () => ({
  DocumentShelves: () => null,
}));
jest.mock('@/components/document/roster/call-sheet-mount', () => ({ CallSheetMount: () => null }));
jest.mock('@/components/document/doc-spine', () => ({ DocSpine: () => null }));
jest.mock('@/components/document/doc-letterhead', () => ({ DocLetterhead: () => null }));
jest.mock('@/components/document/doc-colophon', () => ({ DocColophon: () => null }));
jest.mock('@/components/document/previous-work', () => ({
  PreviousWork: () => null,
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
const mockFlagOn = { current: true };
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({
    value: name === 'worktable' && mockFlagOn.current,
    isLoading: false,
  }),
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

/**
 * A direction-stage document, as 00327's Shape B emits it: the route arrives
 * on the chain-root engagement_id; proposal_id carries the LIVE proposal.
 * The two ids differ on purpose — a tool keyed on the wrong one fails loud.
 */
const DIRECTION_ROW = {
  engagement_kind: 'proposal',
  engagement_id: 'chain-root-1',
  project_id: null,
  proposal_id: 'proposal-live-1',
  lead_id: null,
  designer_id: 'designer-1',
  client_profile_id: 'client-1',
  client_name: 'Avery Stone',
  title: 'Stone Direction',
  active_section: 'direction',
  project_status: null,
  current_phase: null,
  is_paused: false,
  is_archived: false,
  proposal_status: 'draft',
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

const PROJECT_ROW = {
  ...DIRECTION_ROW,
  engagement_kind: 'project',
  engagement_id: 'project-1',
  project_id: 'project-1',
  proposal_id: null,
  title: 'Stone Residence',
  active_section: 'project',
  project_status: 'active',
  current_phase: 'design_development',
  proposal_status: null,
};

const mockRow: { current: typeof DIRECTION_ROW } = { current: DIRECTION_ROW };

jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => ({
    data: { kind: 'engagement', row: mockRow.current },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

const paramsFor = (id: string) =>
  ({
    status: 'fulfilled',
    value: { id },
    then: () => undefined,
  }) as unknown as Promise<{ id: string }>;

function renderPage(routeId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DocumentPage params={paramsFor(routeId)} />
    </QueryClientProvider>,
  );
}

/** True when a precedes b in document order. */
function precedes(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

const TOOL_ROOTS = [
  'nav[aria-label="Rooms on the table"]',
  '[data-scheme]',
  '[data-boards-strip]',
  '[data-library-reach-in]',
];

describe('the Speccing table, tooled (W3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlagOn.current = true;
    mockRow.current = DIRECTION_ROW;
    mockItems = [
      line('item-lamp', 'Floor lamp', null, 0),
      line('item-sofa', 'A mohair sofa', 'room-living', 1),
      line('item-desk', 'A walnut desk', 'room-study', 2),
    ];
    mockBoards = [
      board('board-living', 'Living direction', 'room-living', 0),
      board('board-study', 'Study textures', 'room-study', 1),
    ];
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

  it('fills all four slots on the Speccing table, in the declared order, rail at the head', async () => {
    const { container } = renderPage('chain-root-1');

    const table = container.querySelector('[data-table]');
    expect(table).not.toBeNull();
    expect(table!.getAttribute('data-table')).toBe('speccing');

    const slots = Array.from(container.querySelectorAll('[data-table-slot]')).map(
      (el) => el.getAttribute('data-table-slot'),
    );
    expect(slots).toEqual(['rooms-rail', 'scheme', 'boards-strip', 'reach-in']);

    // Each slot holds its own tool.
    const slotEls = Array.from(container.querySelectorAll('[data-table-slot]'));
    TOOL_ROOTS.forEach((selector, i) => {
      expect(slotEls[i].querySelector(selector)).not.toBeNull();
    });

    // The rail is the table HEAD: it precedes the direction spread; the other
    // three tools follow it.
    const rail = container.querySelector('[data-table-slot="rooms-rail"]')!;
    const spreadHeading = screen.getByRole('heading', { name: /Direction/ });
    expect(precedes(rail, spreadHeading)).toBe(true);
    expect(precedes(spreadHeading, slotEls[1])).toBe(true);

    // The scheme's lines arrive through the builder's own read.
    expect(await screen.findByText('A mohair sofa')).toBeInTheDocument();
  });

  it('stands the band above the table, and the rail still under it', () => {
    // B2-L4's acceptance, on the PAGE's own composition, carried onto R127's
    // band (W3-L5): the band is the job's header over the job's middle (I138),
    // and I139's rail is not replaced by anything the band prints — it keeps
    // being add-a-room's speccing home. The selector is the only thing that
    // moved; the ordering claim and the one-map claim are unchanged.
    const { container } = renderPage('chain-root-1');

    const band = container.querySelector('[data-lens-band]')!;
    const table = container.querySelector('[data-table="speccing"]')!;
    const rail = container.querySelector('[data-table-slot="rooms-rail"]')!;
    expect(band).not.toBeNull();
    expect(precedes(band, table)).toBe(true);
    expect(precedes(band, rail)).toBe(true);
    expect(container.querySelectorAll('[data-lens-band]')).toHaveLength(1);
  });

  it('keeps one door to the rooms and one to the boards on this paper', () => {
    // W3-L5. The claim this replaces — "the ticket's Rooms and Boards rows take
    // the reader to the tools already on the paper" — no longer exists: the
    // eight-row list dies with the ticket and the band prints no rows at all.
    // What direction-b §9 / C9 was protecting does survive, and is asserted
    // here in the only form left to it: two doors to the boards on one paper is
    // the split Q1 exists to prevent, so this paper prints exactly ONE of each.
    // The ladder's own `Mood boards` door and its room rungs are project-keyed
    // (OD-8) and stand on no proposal spread, so the table's tools are alone.
    const { container } = renderPage('chain-root-1');

    expect(
      container.querySelectorAll('[data-table-slot="rooms-rail"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-table-slot="boards-strip"]'),
    ).toHaveLength(1);
    expect(container.querySelector('[data-ladder-door="moodboards"]')).toBeNull();
    expect(container.querySelector('[data-room-chip]')).toBeNull();
  });

  it('keys every tool on the proposal identity — never the chain-root route id', async () => {
    renderPage('chain-root-1');
    await screen.findByText('A mohair sofa');

    // The rail and the scheme's builder read scope rooms; the strip reads
    // boards; the reach-in reads its taken-codes projection; the scheme's
    // line read filters on proposal_id. All on the live proposal's own id.
    expect(mockScopeRoomsHook).toHaveBeenCalledWith('proposal-live-1');
    expect(mockBoardsHook).toHaveBeenCalledWith('proposal-live-1');
    expect(mockDocCodesHook).toHaveBeenCalledWith('proposal-live-1');
    expect(mockItemsEq).toHaveBeenCalledWith('proposal_id', 'proposal-live-1');
    for (const spy of [mockScopeRoomsHook, mockBoardsHook, mockDocCodesHook]) {
      expect(spy).not.toHaveBeenCalledWith('chain-root-1');
    }
  });

  it('passes a pressed room to the scheme and the boards strip as their lens', async () => {
    const { container } = renderPage('chain-root-1');

    // Unlensed: the scheme composes unassigned-first, the strip keeps board order.
    const lamp = await screen.findByText('Floor lamp');
    const desk = screen.getByText('A walnut desk');
    expect(precedes(lamp, desk)).toBe(true);

    const studySegment = screen.getByRole('button', { name: 'The Study' });
    fireEvent.click(studySegment);
    expect(screen.getByRole('button', { name: 'The Study' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The scheme lifts the held room's group to the front — nothing hidden.
    const liftedDesk = await screen.findByText('A walnut desk');
    expect(precedes(liftedDesk, screen.getByText('Floor lamp'))).toBe(true);
    expect(precedes(liftedDesk, screen.getByText('A mohair sofa'))).toBe(true);

    // The strip lifts the held room's board to the front — both still print.
    const wide = container.querySelector('[data-boards-strip-wide]') as HTMLElement;
    const tiles = Array.from(wide.querySelectorAll('a'));
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveAccessibleName('Open board Study textures');
    expect(tiles[1]).toHaveAccessibleName('Open board Living direction');

    // Releasing through "All" puts the scheme's own order back.
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    const backLamp = await screen.findByText('Floor lamp');
    expect(precedes(backLamp, screen.getByText('A walnut desk'))).toBe(true);
  });

  it('renders none of the tools with the flag off — parity', () => {
    mockFlagOn.current = false;
    const { container } = renderPage('chain-root-1');

    expect(container.querySelector('[data-table]')).toBeNull();
    expect(container.querySelector('[data-table-slot]')).toBeNull();
    for (const selector of TOOL_ROOTS) {
      expect(container.querySelector(selector)).toBeNull();
    }
  });

  it('mounts no speccing slot on a non-Speccing table (Delivery)', () => {
    mockRow.current = PROJECT_ROW;
    const { container } = renderPage('project-1');

    expect(container.querySelector('[data-table]')!.getAttribute('data-table')).toBe(
      'delivery',
    );
    expect(container.querySelector('[data-table-slot]')).toBeNull();
    for (const selector of TOOL_ROOTS) {
      expect(container.querySelector(selector)).toBeNull();
    }
  });
});
