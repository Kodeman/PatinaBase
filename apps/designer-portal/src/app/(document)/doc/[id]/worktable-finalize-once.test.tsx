/**
 * The Finalize table says each thing once (Start to Signature W4 integration).
 *
 * worktable-finalize.test.tsx walks the table's composition with the spread and
 * the wall stubbed out. This spec renders both for real, because the two
 * integration rulings are claims about the WHOLE page:
 *
 *   1. The offer stops printing twice. Flag-on AND finalize, the read-only
 *      spread drops its Offer blocks (Timeline · Payments · Exclusions) — the
 *      seams below are their addressable home, so each offer fact is printed
 *      exactly once. Flag off, the spread is exactly what it has always been.
 *
 *   2. One leader per table. The head's derived leader is the table's only
 *      leader-weight act, so the watch's "Mark signed" — a verb no derivation
 *      carries — keeps its place and gives up its weight. Flag off it is the
 *      primary it has always been.
 *
 *      The rule governs the TABLE's composition, not the paper's fixed
 *      skeleton (ruled at the W4 review). The letterhead's "Message {family}"
 *      is chrome — it stands on every document at every stage and answers to
 *      no table — so it does not count against the table's one leader. The
 *      letterhead is therefore rendered for real here, not stubbed to null:
 *      an assertion that only passes because the competing act was mocked away
 *      proves the mock, not the rule.
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
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/doc/chain-root-1',
}));

/* ── The offer, written once at the source: three facts that must each be
      printed exactly once on the composed table. ───────────────────────────── */

const PHASE_NAME = 'Schematic design';
const PAYMENT_LABEL = 'Deposit on signing';
const EXCLUSION_TEXT = 'Structural engineering';

let mockProposal: Record<string, unknown> = {};
let mockFeedback: Array<Record<string, unknown>> = [];

const ITEMS = [
  { id: 'line-a', name: 'A mohair sofa', quantity: 1, unit_price: 2500, line_total_cents: 250000 },
  { id: 'line-b', name: 'A walnut desk', quantity: 1, unit_price: 2500, line_total_cents: 250000 },
];

jest.mock('@patina/supabase', () => ({
  /* B2 — the ticket now stands on the proposal spread too, and its Money row
     runs the ladder against an empty read. */
  computeArAging: jest.requireActual('@patina/supabase').computeArAging,
  invoiceDaysOverdue: jest.requireActual('@patina/supabase').invoiceDaysOverdue,
  useProjectRoomScans: () => ({ data: [] }),
  useGeneratedRoomFilesByScan: () => ({ data: new Map() }),
  /* the page's own reads */
  useProjectV2: () => ({ data: undefined, isLoading: false, isError: false }),
  useProjectPhases: () => ({ data: [] }),
  useProjectApprovals: () => ({ data: [] }),
  useProposalFeedback: () => ({ data: mockFeedback }),
  useProjectRoster: () => ({ data: [] }),
  useDiscovery: () => ({ data: undefined, isLoading: false, isError: false }),
  useProjectContextualHandoffs: () => ({ data: [], isError: false }),
  useResolvedSchedule: () => ({
    phases: [],
    milestones: [],
    resolved: null,
    isLoading: false,
    isError: false,
  }),
  /* the offer, read by BOTH the spread and the seams */
  useProposalPhases: () => ({
    data: [{ name: PHASE_NAME, duration_weeks: 4, duration_days: null }],
  }),
  useProposalPaymentMilestones: () => ({
    data: [
      {
        label: PAYMENT_LABEL,
        percentage: 50,
        amount_cents: 250000,
        trigger_condition: null,
      },
    ],
  }),
  useProposalExclusions: () => ({
    data: [{ description: EXCLUSION_TEXT, category: null }],
  }),
  useProposalScheduleMilestones: () => ({ data: [] }),
  useProposalSections: () => ({ data: [] }),
  useScopeBuilderSummary: () => ({ data: undefined }),
  /* the watch's own reads */
  useActivateProposal: () => ({ mutateAsync: jest.fn(), isPending: false }),
  /* the speccing tools, which must not mount here */
  useProposalScopeRooms: () => ({ data: [], isLoading: false }),
  useAddScopeRoom: () => ({ mutate: jest.fn(), isPending: false }),
  useBoards: () => ({ data: [], isLoading: false, isError: false }),
  useUpsertBoard: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCrossLayerSearch: () => ({ data: undefined, isLoading: false, isError: false }),
  useAddProposalItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFFECategories: () => ({ data: [] }),
  useConsumeCapture: () => ({ mutate: jest.fn(), isPending: false }),
  useReorderProposalItems: () => ({ mutate: jest.fn() }),
  useReorderProposalScopeRooms: () => ({ mutate: jest.fn() }),
  useIsStudioOwner: () => ({ isStudioOwner: false }),
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
  }),
}));

jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({ data: mockProposal, isError: false, isLoading: false }),
  useProposalEngagement: () => ({ data: [] }),
  useProposalEngagementStats: () => ({ data: null }),
  useNudgeProposal: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAddProposalItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateProposalItem: () => ({ mutate: jest.fn(), isPending: false }),
  useRemoveProposalItem: () => ({ mutate: jest.fn(), isPending: false }),
  useProposalSections: () => ({ data: [] }),
}));
jest.mock('@/hooks/use-proposal-project', () => ({
  useProposalProject: () => ({ data: null, isLoading: false }),
}));

/* The overlays and the live rail — sheets and full-screen layers, mocked as
   their own specs do, so this spec walks what the paper prints. */
jest.mock('@/components/document/proposal-preview', () => ({
  ProposalPreview: () => <div data-preview-overlay />,
}));
jest.mock('@/components/document/overlays/send-sheet', () => ({
  SendSheet: ({ open }: { open: boolean }) => (open ? <div data-send-sheet /> : null),
}));
jest.mock('@/components/document/overlays/mark-signed-sheet', () => ({
  MarkSignedSheet: ({ open }: { open: boolean }) =>
    open ? <div data-mark-signed-sheet /> : null,
}));
jest.mock('@/components/document/drafting/proposal-mirror', () => ({
  ProposalPreviewRail: ({ proposalId }: { proposalId: string }) => (
    <div data-client-copy-rail={proposalId} />
  ),
}));
/* Both are tertiary acts wherever they mount, so standing them down cannot
   hide a leader from the count below. */
jest.mock('@/components/document/proposal-share-instrument', () => ({
  ProposalShareInstrument: () => null,
}));
jest.mock('@/components/document/proposal-version-history', () => ({
  ProposalVersionHistory: () => null,
}));

/* The Offer facets' editors never mount on this table; stub them so the
   assertion is about what is printed, not about their imports. */
jest.mock('@/components/portal/scope-builder/phase-builder', () => ({
  PhaseBuilder: () => <div data-phase-builder />,
}));
jest.mock('@/components/portal/scope-builder/exclusions-list', () => ({
  ExclusionsList: () => <div data-exclusions-editor />,
}));
jest.mock('@/components/portal/scope-builder/payment-milestones-builder', () => ({
  PaymentMilestonesBuilder: () => <div data-payments-editor />,
}));
jest.mock('@/components/portal/scope-builder/change-order-terms-editor', () => ({
  ChangeOrderTermsEditor: () => <div data-terms-editor />,
}));
jest.mock('@/components/document/rooms/drafting/terms-agreement-body', () => ({
  TermsAgreementBody: () => <div data-terms-body-editor />,
}));

/* ── The page's surround, as worktable-finalize.test.tsx stubs it. ───────── */

jest.mock('@/components/document/approvals/project-approval-document', () => ({
  ProjectApprovalDocument: () => null,
}));
jest.mock('@/components/document/schedule/schedule-spine', () => ({
  ScheduleSpine: () => null,
}));
jest.mock('@/components/document/ffe-section', () => ({ FFESection: () => null }));
jest.mock('@/components/document/commercial/money-region', () => ({
  MoneyRegion: () => null,
}));
jest.mock('@/components/document/care-band', () => ({ CareBand: () => null }));
jest.mock('@/components/document/quiet-sections', () => ({ CareSection: () => null }));
jest.mock('@/components/document/account-band', () => ({ AccountBand: () => null }));
jest.mock('@/components/document/roster/kickoff-band', () => ({ KickoffBand: () => null }));
jest.mock('@/components/document/spine-shelved-blocks', () => ({
  DocSpineShelvedBlocks: () => null,
}));
jest.mock('@/components/document/roster/call-sheet-mount', () => ({
  CallSheetMount: () => null,
}));
jest.mock('@/components/document/doc-spine', () => ({
  DocSpine: ({ shelved }: { shelved: ReactNode }) => <div data-spine>{shelved}</div>,
}));
/* DocLetterhead and LetterheadInstruments are NOT stubbed — see the header
   note: the letterhead's own `primary` is the act the scoped assertion below
   has to survive. */
jest.mock('@/components/document/doc-colophon', () => ({ DocColophon: () => null }));
jest.mock('@/components/document/previous-work', () => ({ PreviousWork: () => null }));
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
jest.mock('@/components/document/folio-strip', () => ({
  FolioLetterhead: () => null,
  ProposalFolioStrip: () => null,
}));
jest.mock('@/components/document/mobile/mobile-margin-chips', () => ({
  MobileMarginChips: () => null,
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
jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingState: () => ({
    facets: {
      rooms: true,
      ffe: true,
      phases: true,
      exclusions: true,
      payments: true,
      terms: false,
      palette: false,
      boards: false,
    },
    summary: { phases: 1, exclusions: 1, payments: 1 },
    items: [],
    gaps: [],
    isLoading: false,
    error: null,
  }),
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

/** A proposal in the client's hands: 00327 Shape B, chain root ≠ live version. */
const FINALIZE_ROW = {
  engagement_kind: 'proposal',
  engagement_id: 'chain-root-1',
  project_id: null,
  proposal_id: 'proposal-live-1',
  lead_id: null,
  designer_id: 'designer-1',
  client_profile_id: 'client-1',
  client_name: 'Avery Stone',
  title: 'Stone Proposal',
  active_section: 'proposal',
  project_status: null,
  current_phase: null,
  is_paused: false,
  is_archived: false,
  proposal_status: 'sent',
  proposal_sent_at: '2026-08-10T12:00:00Z',
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
    data: { kind: 'engagement', row: FINALIZE_ROW },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

const paramsFor = (id: string) =>
  ({ status: 'fulfilled', value: { id }, then: () => undefined }) as unknown as Promise<{
    id: string;
  }>;

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DocumentPage params={paramsFor('chain-root-1')} />
    </QueryClientProvider>,
  );
}

/** Open all three Offer seams. A FacetSection mounts its body lazily and keeps
 *  it mounted once visited, so after this every offer fact the seams carry is
 *  in the DOM at once — which is exactly the condition a double print needs. */
function openOfferSeams() {
  for (const name of ['Phases', 'Payments', 'Exclusions']) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
  }
}

const approvals = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    proposal_item_id: `line-${i}`,
    verdict: 'approved',
    created_at: '2026-08-12T12:00:00Z',
    resolved_at: null,
  }));

describe('the Finalize table says each thing once (W4 integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlagOn.current = true;
    mockProposal = {
      id: 'proposal-live-1',
      status: 'sent',
      document_kind: 'legacy',
      commercial_state: null,
      issued_on_paper: false,
      sent_at: '2026-08-10T12:00:00Z',
      last_nudged_at: null,
      total_amount: 500000,
      items: ITEMS,
    };
    mockFeedback = approvals(2);
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

  /* ── Ruling 1 — the offer stops printing twice. ─────────────────────────── */

  it('prints every offer fact exactly once, with all the seams open', () => {
    renderPage();
    openOfferSeams();

    expect(screen.getAllByText(PHASE_NAME)).toHaveLength(1);
    expect(screen.getAllByText(PAYMENT_LABEL)).toHaveLength(1);
    expect(screen.getAllByText(EXCLUSION_TEXT)).toHaveLength(1);
  });

  it('leaves the offer to the seams: the spread states none of it', () => {
    const { container } = renderPage();

    // Closed seams carry nothing yet, so anything found here is the spread's.
    expect(screen.queryByText(PHASE_NAME)).not.toBeInTheDocument();
    expect(screen.queryByText(PAYMENT_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText(EXCLUSION_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
    expect(screen.queryByText('Not included')).not.toBeInTheDocument();
    // What is not the offer stays on the spread.
    expect(screen.getByText('Investment')).toBeInTheDocument();
    expect(container.querySelector('[data-offer-facets]')).not.toBeNull();
  });

  it('renders the spread exactly as today with the flag off', () => {
    mockFlagOn.current = false;
    const { container } = renderPage();

    expect(container.querySelector('[data-offer-facets]')).toBeNull();
    expect(screen.getByText(PHASE_NAME)).toBeInTheDocument();
    expect(screen.getByText(PAYMENT_LABEL)).toBeInTheDocument();
    expect(screen.getByText(EXCLUSION_TEXT)).toBeInTheDocument();
    expect(screen.getByText('Timeline')).toBeInTheDocument();
    expect(screen.getByText('Not included')).toBeInTheDocument();
    expect(screen.getByText('Investment')).toBeInTheDocument();
  });

  /* ── Ruling 2 — one leader per table. ───────────────────────────────────── */

  it('carries exactly one leader-weight act across the table’s composition', () => {
    const { container } = renderPage();

    const table = container.querySelector('[data-table="finalize"]')!;
    expect(table).not.toBeNull();
    const leaders = table.querySelectorAll(
      '[data-action-variant="inked"], [data-action-variant="primary"]',
    );
    expect(leaders).toHaveLength(1);
    // …and it is the head's derived leader, not the watch's Mark signed.
    expect(leaders[0].textContent).toContain('Nudge Avery Stone');
    expect(screen.getByRole('button', { name: /Mark signed/ })).toHaveAttribute(
      'data-action-variant',
      'secondary',
    );
  });

  it('does not count the fixed skeleton’s chrome against the table', () => {
    const { container } = renderPage();

    // The letterhead is rendered, and it carries a `primary` of its own —
    // "Message {family}" stands on every document at every stage. It sits
    // OUTSIDE the composed table, which is why the rule is scoped there.
    const letterheadLeader = screen.getByRole('button', {
      name: /Message Avery Stone/,
    });
    expect(letterheadLeader).toHaveAttribute('data-action-variant', 'primary');
    expect(
      container.querySelector('[data-table="finalize"]')!.contains(letterheadLeader),
    ).toBe(false);
  });

  it('keeps Mark signed the primary it has always been with the flag off', () => {
    mockFlagOn.current = false;
    const { container } = renderPage();

    expect(screen.getByRole('button', { name: /Mark signed/ })).toHaveAttribute(
      'data-action-variant',
      'primary',
    );
    expect(container.querySelector('[data-action-variant="inked"]')).toBeNull();
  });
});
