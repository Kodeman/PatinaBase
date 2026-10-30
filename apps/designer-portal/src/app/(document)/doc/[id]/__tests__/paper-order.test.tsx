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
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import DocumentPage from '../page';
import { beginEntry } from '@/components/document/arrival/arrival-mount';
import { PROJECT_PAPER_ORDER } from '@/lib/document/document-index';
import { ROUND8_INDEX_KEYS, ROUND8_PAPER_ORDER } from '@/lib/document/round8-paper-order';

const mockWorkRoom = jest.fn();
jest.mock('@/components/document/paper/unfold-instrument', () => ({
  ...jest.requireActual('@/components/document/paper/unfold-instrument'),
  openUnfold: (...args: unknown[]) => mockWorkRoom(...args),
}));
jest.mock('@/components/document/paper/chapters/design-chapter', () => ({
  DesignChapter: ({ projectId, routeId, onWorkRoom }: { projectId: string; routeId: string; onWorkRoom: (id: string, opener: HTMLButtonElement) => void }) => (
    <div data-design-chapter data-project-id={projectId} data-route-id={routeId}>
      <button onClick={(event) => onWorkRoom('room-1', event.currentTarget)}>Work this room</button>
    </div>
  ),
}));

jest.mock('@portabletext/react', () => ({
  PortableText: () => null,
  toPlainText: () => '',
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/doc/project-1',
}));

// SQ-1885 F2 — a failed Field read, switched per test.
let mockVisitsFailed = false;
jest.mock('@patina/supabase', () => ({
  /* US-36 K6 — the band's money read for a client-less job (SQ-1041). */
  useUnbilledTime: () => ({ data: undefined }),
  inboxKeys: { unreadCount: () => ['inbox', 'unread-count'] },
  procurementUnreadCountKey: () => ['procurement-unread-count'],
  useInstallWindow: () => ({ data: null, isSuccess: true }),
  useProjectLead: () => ({ data: null }),
  useNeedStates: () => ({ data: new Map() }),
  useSetNeedState: () => ({ mutate: jest.fn() }),
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
  // The Visits block (FC W4) mounts on every project spread; both of its
  // reads are unconditional hooks, so any suite rendering one must stub them.
  useProjectVisits: () => ({
    data: [],
    isLoading: false,
    isError: mockVisitsFailed,
    error: mockVisitsFailed ? new Error('field read failed') : null,
  }),
  useCaptureMediaUrls: () => ({ data: undefined }),
  useProjectV2: () => ({ data: undefined, isLoading: false, isError: false }),
  useProjectPhases: () => ({ data: [] }),
  useProjectApprovals: () => ({ data: [] }),
  useProposalFeedback: () => ({ data: [] }),
  useProjectRoster: () => ({ data: [] }),
  useDiscovery: () => ({ data: undefined, isLoading: false, isError: false }),
  // R5 — page.tsx runs the discovery seed for the band's rest act.
  useBeginDirection: () => ({ mutateAsync: jest.fn() }),
  useProjectFFEItems: () => ({ data: [] }),
  useExternalFulfilmentReadings: () => ({ data: [], isError: false }),
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
  // L3 (00559) — the first-hire-opened marker's own reads; this suite never
  // exercises the checklist, so a fixed empty shape keeps the mount effect a
  // no-op.
  useOrganizations: () => ({ data: [] }),
  useOrganizationMembers: () => ({ data: [] }),
  useMarkFirstDocumentOpened: () => ({ mutate: jest.fn() }),
  // R4 — the letterhead's subject editor writes through this.
  useUpdateEngagementSubject: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'owner-user' } }),
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

/* The four index regions, reduced to the roots the scrollspy observes. */
jest.mock('@/components/document/approvals/project-approval-document', () => ({
  ProjectApprovalDocument: () => <div data-index-region="approvals" />,
}));
// SQ-1012 — the band's status line reads the mutation cache; this page renders
// without a QueryClientProvider, so it stands in as nothing.
jest.mock('@/components/feedback/saving-band', () => ({
  ...jest.requireActual('@/components/feedback/saving-band'),
  BandStatusLine: () => null,
}));
jest.mock('@/components/document/schedule/schedule-spine', () => ({
  ScheduleSpine: () => <div data-index-region="schedule" />,
}));
jest.mock('@/components/document/ffe-section', () => ({
  FFESection: () => <div data-index-region="ffe" />,
}));
// The region's embedded accounts band, unless it leaves them to the page's
// standalone one (US-40: Install and Care).
jest.mock('@/components/document/commercial/money-region', () => ({
  MoneyRegion: ({ accountsElsewhere }: { accountsElsewhere?: boolean }) => (
    <div data-index-region="money">{accountsElsewhere ? null : <div data-account-band />}</div>
  ),
}));

/* Everything else the page mounts is another suite's subject. */
// W2 (C-2): the project spread's Care band IS the running index's `care`
// root; the install spread's second mount is not (one root per stop).
jest.mock('@/components/document/care-band', () => ({
  CareBand: ({ indexRoot }: { indexRoot?: boolean }) =>
    indexRoot ? <div data-index-region="care" /> : <div data-care-band />,
}));
// The Closeout chapter lazy-loads the acceptance and completion instruments;
// their reads are not this suite's subject.
jest.mock('@/components/document/service-acceptance/service-acceptance-section', () => ({
  ServiceAcceptanceSection: () => null,
}));
jest.mock('@/components/document/service-completion/studio-service-section', () => ({
  StudioServiceSection: () => null,
}));
jest.mock('@/components/document/account-band', () => ({
  AccountBand: () => <div data-account-band />,
}));
jest.mock('@/components/document/quiet-sections', () => ({ CareSection: () => null }));
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
jest.mock('@/hooks/use-desk-engagements', () => {
  const needs = (data: { folders?: { need?: unknown }[] } | undefined) =>
    (data?.folders ?? []).flatMap((folder) => (folder.need ? [folder.need] : []));
  return {
    selectOperationalNeedForDocument: (data: { folders?: { need?: unknown }[] } | undefined) =>
      needs(data)[0],
    selectOperationalNeedsForDocument: (data: { folders?: { need?: unknown }[] } | undefined) => {
      const list = needs(data);
      return list.length ? list : undefined;
    },
  };
});
// WP-01.5 (SQ-1885 F3) — a need on this job, switched per test, so its act
// lands through the page's own anchor seam.
let mockNeedFolders: unknown[] = [];
jest.mock('@/hooks/use-engagement-need', () => ({
  useEngagementNeed: () => ({
    data: { folders: mockNeedFolders, composed: {} },
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-document-rooms', () => ({ useDocumentRooms: () => ({ data: [] }) }));
jest.mock('@/hooks/use-section-work', () => ({
  gateState: jest.fn(),
  useSectionGates: () => ({ data: [] }),
  useSectionTasks: () => ({ data: [] }),
}));
// WP-01.5 (G5) — records every request for the round-8 frame's module: the
// legacy paper must never load it; only the round-8 renderer's lazy import does.
const mockRound8FrameRequested = jest.fn();
// SQ-1885 F6 — a cold chunk: while held, the frame stays suspended under the
// page's skeleton after the page's own reads have settled.
let mockFrameHold: Promise<void> | null = null;
jest.mock('@/components/document/frame/round8-paper-frame', () => {
  mockRound8FrameRequested();
  const actual = jest.requireActual('@/components/document/frame/round8-paper-frame');
  const { createElement } = jest.requireActual('react');
  return {
    __esModule: true,
    ...actual,
    default: (props: object) => {
      if (mockFrameHold) throw mockFrameHold;
      return createElement(actual.default, props);
    },
  };
});
// WP-01.5 — the renderer latch's answer, switched per describe.
let mockPaperRenderer: { renderer: 'legacy' | 'round8'; source: 'override' } = {
  renderer: 'legacy',
  source: 'override',
};
jest.mock('@/hooks/use-paper-renderer', () => ({
  usePaperRenderer: () => mockPaperRenderer,
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));
jest.mock('@/lib/help-system/use-document-surface', () => ({
  useDocumentSurface: jest.fn(),
}));
let mockSeenBefore = false;
jest.mock('@/lib/analytics/document-events', () => ({
  rememberDocumentInHand: jest.fn(),
  readRecentDocumentsInHand: () => mockSeenBefore ? [{ id: 'project-1' }] : [],
  documentEvents: {
    lensLineShown: jest.fn(),
    lensLineActed: jest.fn(),
    lensStandingSheetOpened: jest.fn(),
    historyToggled: jest.fn(),
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    zoneFlight: jest.fn(),
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
  const originalRequestAnimationFrame = window.requestAnimationFrame;
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
  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
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
    // W2 — `record` is the last indexed region now: `PreviousWork` emits its
    // root unconditionally and the Care band carries `care`, so the paper's
    // own foot is what the Record must follow.
    const lastRegion = container.querySelector('[data-index-region="record"]')!;
    const record = container.querySelector('[data-the-record]');

    // The Record mounts at all on a project document, and does so after the
    // work rather than between the guide and it.
    expect(record).not.toBeNull();
    expect(nodes.indexOf(record as Element)).toBeGreaterThan(
      nodes.indexOf(lastRegion),
    );
  });

  // US-40 — the Working budget's recovery links land on the money region, so
  // the Install and Care spreads carry it too, without its accounts: there the
  // page's standalone AccountBand still states them, so the accounts print
  // once on every spread.
  it('prints the accounts once on the Project spread, inside the money region — no standalone band', () => {
    const { container } = render(<DocumentPage params={params} />);

    const moneyRoots = container.querySelectorAll('[data-index-region="money"]');
    expect(moneyRoots).toHaveLength(1);
    const bands = container.querySelectorAll('[data-account-band]');
    expect(bands).toHaveLength(1);
    expect(moneyRoots[0].contains(bands[0])).toBe(true);
  });

  describe.each(['install', 'care'] as const)('the %s spread', (section) => {
    beforeEach(() => {
      PROJECT_ROW.active_section = section;
    });
    afterEach(() => {
      PROJECT_ROW.active_section = 'project';
    });

    it('mounts exactly one money region, after the Pieces and before closeout and the Record', () => {
      const { container } = render(<DocumentPage params={params} />);

      const moneyRoots = container.querySelectorAll('[data-index-region="money"]');
      expect(moneyRoots).toHaveLength(1);

      const nodes = Array.from(container.querySelectorAll('main *'));
      const at = (selector: string) => {
        const node = container.querySelector(selector);
        expect(node).not.toBeNull();
        return nodes.indexOf(node as Element);
      };
      const money = nodes.indexOf(moneyRoots[0]);
      expect(money).toBeGreaterThan(at('[data-index-region="ffe"]'));
      expect(money).toBeLessThan(at('[data-index-region="record"]'));
      if (section === 'install') {
        expect(money).toBeLessThan(at('[data-care-band]'));
      }
    });

    it('prints the accounts once, on the standalone AccountBand outside the money region', () => {
      const { container } = render(<DocumentPage params={params} />);

      const bands = container.querySelectorAll('[data-account-band]');
      expect(bands).toHaveLength(1);
      expect(
        container.querySelector('[data-index-region="money"]')!.contains(bands[0]),
      ).toBe(false);
    });
  });
});

/**
 * WP-01.5 (R8-02) — the round-8 paper states its own order. A project job is
 * one continuous paper: its chapters mount in `ROUND8_PAPER_ORDER`, each
 * carrying the legacy region it wraps, and the legacy frame never mounts
 * beside it. The legacy order above is untouched by the same render.
 */
describe('the legacy renderer', () => {
  it('never requests the round-8 frame module (every legacy render above, and this one)', () => {
    const { container } = render(<DocumentPage params={params} />);

    expect(container.querySelector('[data-paper-renderer]')).toBeNull();
    expect(container.querySelector('[data-paper-chapter]')).toBeNull();
    expect(mockRound8FrameRequested).not.toHaveBeenCalled();
  });
});

describe('the round-8 paper order', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  const pendingFrames = new Set<number>();

  beforeEach(() => {
    mockPaperRenderer = { renderer: 'round8', source: 'override' };
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: /min-width:\s*(\d+)px/.test(query),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia;
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      const id = window.setTimeout(() => {
        pendingFrames.delete(id);
        callback(performance.now());
      }, 0);
      pendingFrames.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id: number) => {
      window.clearTimeout(id);
      pendingFrames.delete(id);
    };
    HTMLElement.prototype.scrollIntoView = jest.fn();
  });
  afterEach(() => {
    for (const id of pendingFrames) window.clearTimeout(id);
    pendingFrames.clear();
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    mockPaperRenderer = { renderer: 'legacy', source: 'override' };
  });

  async function renderRound8() {
    // The frame is its own lazily loaded chunk: the page suspends on it, so
    // the render is an awaited act that lets the import resolve.
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<DocumentPage params={params} />);
    });
    await waitFor(() =>
      expect(view.container.querySelector('[data-paper-renderer="round8"]')).not.toBeNull(),
    );
    return view;
  }

  it('mounts one shell and one paper, never the legacy frame beside it', async () => {
    const { container } = await renderRound8();

    // The frame arrived through its lazy import.
    expect(mockRound8FrameRequested).toHaveBeenCalledTimes(1);

    expect(container.querySelectorAll('[data-document-shell]')).toHaveLength(1);
    expect(container.querySelectorAll('main[data-document-paper][data-spotlight-frame]')).toHaveLength(1);
    expect(container.querySelector('[data-document-shell]')!.getAttribute('data-shell-regime')).toBe(
      'single-below-1180-narrow-to-1439-full-from-1440',
    );
    // §4's one active spread is the legacy composition; the continuous paper has none.
    expect(container.querySelector('[data-active-section]')).toBeNull();
  });

  it('mounts the chapters with content, continuously, in exactly ROUND8_PAPER_ORDER', async () => {
    const { container } = await renderRound8();

    const chapters = Array.from(container.querySelectorAll('[data-paper-chapter]')).map((el) =>
      el.getAttribute('data-paper-chapter'),
    );
    // Brief & agreement owns missing-history states even on a direct project;
    // Design owns room evidence/empty states without generated Room Files.
    // No visit or Cabinetry content is invented.
    expect(chapters).toEqual(['brief', 'design', 'approvals', 'schedule', 'ffe', 'financials', 'closeout', 'record']);
    expect(chapters).toEqual(ROUND8_INDEX_KEYS.filter((key) => chapters.includes(key)));
  });

  it.each([
    ['lead', 'brief'],
    ['proposal', 'proposal'],
  ])('keeps a %s document in its pre-work region, not project chapters', async (kind, section) => {
    const project = { ...PROJECT_ROW };
    Object.assign(PROJECT_ROW, {
      engagement_kind: kind,
      project_id: null,
      proposal_id: kind === 'proposal' ? 'proposal-1' : null,
      lead_id: kind === 'lead' ? 'lead-1' : null,
      active_section: section,
    });
    try {
      const { container } = await renderRound8();
      expect(container.querySelector('[data-paper-chapter]')).toBeNull();
      expect(container.querySelectorAll('[data-active-section]')).toHaveLength(1);
      expect(container.querySelector('[data-active-section]')).toHaveAttribute('id', `doc-section-${section}`);
    } finally {
      Object.assign(PROJECT_ROW, project);
    }
  });

  it('puts every legacy region inside the chapter that carries it', async () => {
    const { container } = await renderRound8();

    for (const chapter of ROUND8_PAPER_ORDER) {
      if (!chapter.region) continue;
      const root = container.querySelector(`[data-paper-chapter="${chapter.key}"]`);
      expect(root).not.toBeNull();
      const inner = Array.from(
        container.querySelectorAll(`[data-index-region="${chapter.region}"]`),
      ).filter((el) => el !== root);
      expect(inner).toHaveLength(1);
      expect(root!.contains(inner[0])).toBe(true);
    }
  });

  it('wires the design room and exact opener to the existing FF&E unfold owner', async () => {
    const { container } = await renderRound8();
    const design = container.querySelector('[data-design-chapter]')!;
    expect(design).not.toBeNull();
    expect(design).toHaveAttribute('data-project-id', 'project-1');
    expect(design).toHaveAttribute('data-route-id', 'project-1');
    const opener = design.querySelector('button')!;
    fireEvent.click(opener);
    expect(mockWorkRoom).toHaveBeenCalledWith(
      { kind: 'pieces', lens: 'spec', room: 'room-1', line: null },
      { documentId: 'project-1', chapter: 'design', room: 'room-1', lens: 'spec' },
      opener,
    );
  });

  it('prints the accounts once, inside the Financials chapter', async () => {
    const { container } = await renderRound8();

    const bands = container.querySelectorAll('[data-account-band]');
    expect(bands).toHaveLength(1);
    expect(container.querySelector('[data-paper-chapter="financials"]')!.contains(bands[0])).toBe(true);
  });

  // SQ-1885 F2 — a failed Field read is an outage, not a field-less job: the
  // Site chapter stays so VisitsBlock can say "Field data unavailable".
  it('keeps the Site chapter when the visits read fails', async () => {
    mockVisitsFailed = true;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { container } = await renderRound8();
      const site = container.querySelector('[data-paper-chapter="site"]');
      expect(site).not.toBeNull();
      expect(site!.textContent).toContain('Field data unavailable');
    } finally {
      mockVisitsFailed = false;
      (console.error as jest.Mock).mockRestore();
    }
  });

  // SQ-1885 F3 — the continuous paper prints no active-section wrapper, so the
  // shared anchor seam lands a section on the chapter carrying its work.
  describe('a section landing on the continuous paper', () => {
    afterEach(() => {
      mockNeedFolders = [];
    });

    it('lands a need act on the chapter that carries the project work and focuses its heading', async () => {
      mockNeedFolders = [
        {
          row: { engagement_id: 'project-1' },
          need: {
            kind: 'ceremony_pending',
            text: 'Walk Avery through the schedule',
            actionLabel: 'Continue the introduction',
            urgent: false,
            stamp: { label: 'WAITING' },
          },
        },
      ];
      const { getByRole, container } = await renderRound8();
      const ffe = container.querySelector<HTMLElement>('[data-paper-chapter="ffe"]')!;
      const scroll = jest.fn();
      ffe.scrollIntoView = scroll;

      act(() => {
        getByRole('button', { name: 'Continue the introduction' }).click();
      });

      await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' }));
      expect(document.activeElement).toBe(container.querySelector('#ffe-chapter-heading'));
    });

    it('lands a closeout request on the Closeout chapter', async () => {
      const { container } = await renderRound8();
      const closeout = container.querySelector<HTMLElement>('[data-paper-chapter="closeout"]')!;
      const scroll = jest.fn();
      closeout.scrollIntoView = scroll;

      act(() => {
        window.dispatchEvent(new CustomEvent('document:open-section', { detail: 'care' }));
      });

      await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
      await act(async () => {});
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(container.querySelector('#closeout-chapter-heading'));
    });
  });

  // SQ-1885 F6 — the Desk act's one-shot landing waits for the selected frame
  // to commit, not merely for the page's reads: a cold round-8 chunk keeps the
  // skeleton up after the page settles, and a landing spent then lands nowhere.
  describe.each([
    ['region', { kind: 'region', region: 'money' }, 'money'],
    ['FF&E line', { kind: 'ffe', ffeItemId: 'ffe-1' }, 'ffe'],
  ])('a Desk %s landing behind a cold frame', (_name, landing, unfolds) => {
    let release: () => void = () => undefined;
    const unfolded: string[] = [];
    const onUnfold = (event: Event) =>
      unfolded.push((event as CustomEvent<{ region: string }>).detail.region);

    beforeEach(() => {
      unfolded.length = 0;
      mockFrameHold = new Promise<void>((resolve) => {
        release = () => {
          mockFrameHold = null;
          resolve();
        };
      });
      window.addEventListener('document:unfold-region', onUnfold);
      window.history.replaceState({}, '', '/doc/project-1');
      window.sessionStorage.setItem(
        'pl-arrive',
        JSON.stringify({ via: 'act', to: '/doc/project-1', at: Date.now(), landing }),
      );
    });
    afterEach(() => {
      mockFrameHold = null;
      window.removeEventListener('document:unfold-region', onUnfold);
      window.sessionStorage.removeItem('pl-arrive');
      window.history.replaceState({}, '', '/');
    });

    it('spends the token on mount but lands only once the frame has committed', async () => {
      let view!: ReturnType<typeof render>;
      await act(async () => {
        view = render(<DocumentPage params={params} />);
      });
      expect(window.sessionStorage.getItem('pl-arrive')).toBeNull();
      expect(view.container.querySelector('[data-paper-renderer="round8"]')).toBeNull();
      expect(unfolded).toEqual([]);

      await act(async () => {
        release();
      });
      await waitFor(() =>
        expect(view.container.querySelector('[data-paper-renderer="round8"]')).not.toBeNull(),
      );
      await waitFor(() => expect(unfolded).toContain(unfolds));
    });
  });
});

// SQ-1887 R2-F1 — tokenless revisits use the same stage-to-chapter mapping
// as section actions, but retain the legacy below-the-fold resume rule.
describe('a seen-before tokenless resume', () => {
  beforeEach(() => {
    mockSeenBefore = true;
    beginEntry();
    document.documentElement.classList.remove('arr-pre', 'arr-on', 'arr-press');
    window.sessionStorage.removeItem('pl-arrive');
    window.history.replaceState({}, '', '/doc/project-1');
    HTMLElement.prototype.scrollIntoView = jest.fn();
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: window.innerHeight,
    } as DOMRect);
  });
  afterEach(() => {
    mockSeenBefore = false;
    mockFrameHold = null;
    mockPaperRenderer = { renderer: 'legacy', source: 'override' };
    PROJECT_ROW.active_section = 'project';
    jest.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it.each([
    ['round8', 'project', '[data-paper-chapter="ffe"]'],
    ['round8', 'install', '[data-paper-chapter="ffe"]'],
    ['round8', 'care', '[data-paper-chapter="closeout"]'],
    ['legacy', 'project', '[data-active-section]'],
    ['legacy', 'install', '[data-active-section]'],
    ['legacy', 'care', '[data-active-section]'],
  ] as const)('resumes %s %s at its active work', async (renderer, section, selector) => {
    mockPaperRenderer = { renderer, source: 'override' };
    PROJECT_ROW.active_section = section;
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<DocumentPage params={params} />); });
    const target = view.container.querySelector(selector);
    expect(target).not.toBeNull();
    const scroll = HTMLElement.prototype.scrollIntoView as jest.Mock;
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(target);
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
  });

  it('does not spend the resume before a delayed round-8 frame commits', async () => {
    mockPaperRenderer = { renderer: 'round8', source: 'override' };
    let release!: () => void;
    mockFrameHold = new Promise<void>((resolve) => {
      release = () => { mockFrameHold = null; resolve(); };
    });
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<DocumentPage params={params} />); });
    expect(view.container.querySelector('[data-paper-chapter]')).toBeNull();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();

    await act(async () => { release(); });
    const target = view.container.querySelector('[data-paper-chapter="ffe"]');
    expect(target).not.toBeNull();
    const scroll = HTMLElement.prototype.scrollIntoView as jest.Mock;
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(target);
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
  });

  it.each(['legacy', 'round8'] as const)('leaves %s active work already at the 0.6 viewport boundary in place', async (renderer) => {
    mockPaperRenderer = { renderer, source: 'override' };
    (HTMLElement.prototype.getBoundingClientRect as jest.Mock).mockReturnValue({
      top: window.innerHeight * 0.6,
    } as DOMRect);
    await act(async () => { render(<DocumentPage params={params} />); });
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
