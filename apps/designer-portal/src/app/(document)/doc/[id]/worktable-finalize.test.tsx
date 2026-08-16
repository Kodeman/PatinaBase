/**
 * The Finalize table (Start to Signature W4a).
 *
 * worktable.test.tsx proves the Delivery table is the project document that was
 * already there, and worktable-speccing.test.tsx proves the Speccing table's
 * four tools; this spec proves the Finalize table is the sent-proposal spread
 * with three things added and one taken away: the verdict roll-up promoted from
 * a 9px whisper to the headline sentence (and the whisper stood down), the one
 * inked leader at the spread head, the Offer facets folding open under it, and
 * the client's copy on a shelf. Flag off, none of it exists and the whisper is
 * back where it was.
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

/* ── The proposal, its verdicts, its offer. ─────────────────────────────── */

let mockProposal: Record<string, unknown> = {};
let mockFeedback: Array<Record<string, unknown>> = [];

const ITEMS = [
  { id: 'line-a', name: 'A mohair sofa' },
  { id: 'line-b', name: 'A walnut desk' },
];

jest.mock('@patina/supabase', () => ({
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
  /* the Offer facets' reads */
  useScopeBuilderSummary: () => ({ data: undefined }),
  useProposalPhases: () => ({
    data: [{ name: 'Schematic design', duration_weeks: 4, duration_days: null }],
  }),
  useProposalExclusions: () => ({ data: [] }),
  useProposalPaymentMilestones: () => ({ data: [] }),
  useProposalSections: () => ({ data: [] }),
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

/* The head's overlays and the leaf's live rail — real components, mocked as
   their own specs do, so this spec walks composition rather than their guts. */
jest.mock('@/components/document/proposal-preview', () => ({
  ProposalPreview: () => <div data-preview-overlay />,
}));
jest.mock('@/components/document/overlays/send-sheet', () => ({
  SendSheet: ({ open }: { open: boolean }) =>
    open ? <div data-send-sheet /> : null,
}));
jest.mock('@/components/document/drafting/proposal-mirror', () => ({
  ProposalPreviewRail: ({ proposalId }: { proposalId: string }) => (
    <div data-client-copy-rail={proposalId} />
  ),
}));

/* The Offer facets' editors never mount on this table; stub them so the
   assertion is about composition, not about their imports. */
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

/* The instruments, recorded: whether the wall below was told it is standing on
   the Finalize table. What it does with that is finalize-leader-hoist.test.tsx. */
const mockInstruments = jest.fn();
jest.mock('@/components/document/proposal-instruments', () => ({
  ProposalInstruments: (props: { onFinalizeTable?: boolean }) => {
    mockInstruments(props.onFinalizeTable ?? false);
    return <div data-instruments />;
  },
}));

/* ── The page's surround, as worktable-speccing.test.tsx stubs it. ──────── */

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
jest.mock('@/components/document/doc-letterhead', () => ({ DocLetterhead: () => null }));
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
jest.mock('@/components/document/proposal-blocks-readonly', () => ({
  ProposalBlocksReadOnly: () => <div data-spread-blocks />,
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
jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingState: () => ({
    facets: {
      rooms: true,
      ffe: true,
      phases: true,
      exclusions: false,
      payments: false,
      terms: false,
      palette: false,
      boards: false,
    },
    summary: { phases: 3, exclusions: 0, payments: 0 },
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

const mockRow: { current: typeof FINALIZE_ROW } = { current: FINALIZE_ROW };

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
  ({ status: 'fulfilled', value: { id }, then: () => undefined }) as unknown as Promise<{
    id: string;
  }>;

function renderPage(routeId = 'chain-root-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DocumentPage params={paramsFor(routeId)} />
    </QueryClientProvider>,
  );
}

function precedes(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

const approvals = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    proposal_item_id: `line-${i}`,
    verdict: 'approved',
    created_at: '2026-08-12T12:00:00Z',
    resolved_at: null,
  }));

describe('the Finalize table (W4a)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlagOn.current = true;
    mockRow.current = FINALIZE_ROW;
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
    mockFeedback = [];
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

  it('composes the Finalize table', () => {
    const { container } = renderPage();
    expect(container.querySelector('[data-table]')?.getAttribute('data-table')).toBe(
      'finalize',
    );
  });

  it('promotes the verdict roll-up to the headline and stands the whisper down', () => {
    mockFeedback = [
      {
        proposal_item_id: 'line-a',
        verdict: 'approved',
        created_at: '2026-08-12T12:00:00Z',
        resolved_at: null,
      },
    ];
    const { container } = renderPage();

    const headline = container.querySelector('[data-finalize-headline]')!;
    expect(headline).not.toBeNull();
    expect(headline.textContent).toBe('1 of 2 approved');
    // Serif, not the 9px mono whisper.
    expect(headline.className).toContain('font-heading');
    // The same sentence is printed exactly once on the paper.
    expect(screen.getAllByText('1 of 2 approved')).toHaveLength(1);
    // …and it opens the table, ahead of the spread's instruments and body.
    expect(precedes(headline, container.querySelector('[data-instruments]')!)).toBe(true);
    expect(precedes(headline, container.querySelector('[data-spread-blocks]')!)).toBe(true);
  });

  it('prints no headline while the client has said nothing', () => {
    const { container } = renderPage();
    expect(container.querySelector('[data-finalize-headline]')).toBeNull();
  });

  it('leads with Answer the flags, pointing at the flagged-lines walk-in', () => {
    mockFeedback = [
      {
        proposal_item_id: 'line-a',
        verdict: 'rejected',
        created_at: '2026-08-12T12:00:00Z',
        resolved_at: null,
      },
    ];
    renderPage();
    const leader = screen.getByRole('link', { name: /Answer the flags/ });
    expect(leader).toHaveAttribute('href', '/drafting/proposal-live-1?flagged=1');
    expect(leader).toHaveAttribute('data-action-variant', 'inked');
    expect(leader).toHaveAttribute('data-flagged-line', 'line-a');
  });

  it('leads with the nudge when every line is approved, and tells the wall below', () => {
    mockFeedback = approvals(2);
    renderPage();
    expect(screen.getByRole('button', { name: /Nudge Avery Stone/ })).toHaveAttribute(
      'data-action-variant',
      'inked',
    );
    expect(mockInstruments).toHaveBeenCalledWith(true);
  });

  it('leads with the watch’s own Preview act on a silent sent proposal', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Preview as Avery Stone/ })).toHaveAttribute(
      'data-action-variant',
      'inked',
    );
  });

  it('carries exactly one inked leader', () => {
    mockFeedback = approvals(2);
    const { container } = renderPage();
    expect(container.querySelectorAll('[data-action-variant="inked"]')).toHaveLength(1);
  });

  it('folds the Offer open under the spread, read-only — the Drafting Room’s own rule', () => {
    const { container } = renderPage();

    const offer = container.querySelector('[data-offer-facets]')!;
    expect(offer.getAttribute('data-offer-editable')).toBe('false');
    // Under the spread, not over it.
    expect(precedes(container.querySelector('[data-spread-blocks]')!, offer)).toBe(true);

    for (const name of ['Phases', 'Exclusions', 'Payments', 'Terms']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }

    // A seam opens in place onto the offer as written; no editor mounts.
    fireEvent.click(screen.getByRole('button', { name: /Phases/ }));
    expect(screen.getByText('Schematic design')).toBeInTheDocument();
    expect(container.querySelector('[data-phase-builder]')).toBeNull();
    expect(container.querySelector('[data-terms-body-editor]')).toBeNull();
  });

  it('shelves the client’s copy, and opens it as a leaf', () => {
    const { container } = renderPage();

    const row = container.querySelector('[data-shelf-trigger="clientcopy"]') as HTMLElement;
    expect(row).not.toBeNull();
    // It is the proposal document's ONLY shelf — no project rows here.
    expect(container.querySelectorAll('[data-shelf-trigger]')).toHaveLength(1);

    fireEvent.click(row);
    expect(container.querySelector('[data-shelf-leaf="clientcopy"]')).not.toBeNull();
    expect(
      container.querySelector('[data-client-copy-rail="proposal-live-1"]'),
    ).not.toBeNull();
  });

  it('mounts none of it with the flag off — parity', () => {
    mockFlagOn.current = false;
    mockFeedback = approvals(2);
    const { container } = renderPage();

    expect(container.querySelector('[data-table]')).toBeNull();
    expect(container.querySelector('[data-finalize-head]')).toBeNull();
    expect(container.querySelector('[data-offer-facets]')).toBeNull();
    expect(container.querySelector('[data-shelf-trigger]')).toBeNull();
    expect(container.querySelector('[data-action-variant="inked"]')).toBeNull();
    // The whisper is back where it has always been.
    const whisper = screen.getByText('2 of 2 approved');
    expect(whisper.className).toContain('font-mono');
    expect(mockInstruments).toHaveBeenCalledWith(false);
  });

  it('mounts none of it on a table that is not Finalize', () => {
    mockRow.current = {
      ...FINALIZE_ROW,
      engagement_kind: 'project',
      engagement_id: 'project-1',
      project_id: 'project-1',
      proposal_id: null as unknown as string,
      active_section: 'project',
      proposal_status: null as unknown as string,
    };
    const { container } = renderPage('project-1');

    expect(container.querySelector('[data-table]')?.getAttribute('data-table')).toBe(
      'delivery',
    );
    expect(container.querySelector('[data-finalize-head]')).toBeNull();
    expect(container.querySelector('[data-offer-facets]')).toBeNull();
    expect(container.querySelector('[data-shelf-trigger]')).toBeNull();
  });
});
