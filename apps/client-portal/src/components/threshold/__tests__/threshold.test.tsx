import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import type { Invoice, ProjectApprovalReview, Proposal } from '@patina/supabase';
import type { ClientProjectOverview, MilestoneDetail } from '@/types/project';
import { adaptClientSelections, type ClientSelection } from '@/lib/commercial-documents';
import { resetCheckoutReturn } from '@/lib/threshold/checkout-return';

/* ── The wiring ─────────────────────────────────────────────────────────────
   Everything below the surface is a query, so the boundary is the hook
   modules `threshold.tsx` actually imports — not the adapters under them. The
   assertions are about the composition: which region renders, in what order,
   from which hook, and what the page does while the rooms are still coming.
   Specifiers match the imports exactly; a near-miss silently no-ops
   (patina-testing). ──────────────────────────────────────────────────────── */

jest.mock('next/link', () => ({
  __esModule: true,
  default: function MockLink({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & Record<string, unknown>) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

// The capture reads room_scans and the sharing table of its own accord; this
// suite is about the wiring, so the band's plate is a marker here and is
// tested in `room-capture.test.tsx`.
jest.mock('../room-capture', () => ({
  __esModule: true,
  RoomCapture: ({ roomId, roomName }: { roomId: string; roomName: string }) => (
    <div data-testid="room-capture-stub" data-room-id={roomId}>
      {roomName}
    </div>
  ),
  StrayCaptures: ({ userId }: { userId: string }) => (
    <div data-testid="stray-captures-stub">{userId}</div>
  ),
}));

// The sheet reads three registers of its own; this suite is about the wiring
// from the mat, so it stands in as a marker and is tested in
// `papers-sheet.test.tsx`.
jest.mock('../papers-sheet', () => ({
  __esModule: true,
  PapersSheet: ({ open, onDismiss }: { open: boolean; onDismiss: () => void }) =>
    open ? (
      <div role="dialog" data-testid="papers-sheet-stub">
        <button type="button" onClick={onDismiss}>
          Dismiss the papers
        </button>
      </div>
    ) : null,
}));

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useDirectOrders: jest.fn(),
  useProjectInvoices: jest.fn(),
  useClientInvoices: jest.fn(),
  useClientSafeProposals: jest.fn(),
  useClientSafeProposalBundle: jest.fn(),
  useProjectRooms: jest.fn(),
  useProjectNotes: jest.fn(),
  useProjectNotesRealtime: jest.fn(),
  useProjectParties: jest.fn(),
  useProjectTeamMembers: jest.fn(),
  useStudioIdentity: jest.fn(),
  // The letter's own address (00574) — the letterbox reads it; this suite is
  // not about the link, so it answers with none.
  useInvoiceLink: () => ({ data: null }),
  useMarkProjectRead: jest.fn(),
  useMyProjectApprovalReviews: jest.fn(),
  usePreviousReadingMark: jest.fn(),
  // The doorstep ask answers in place now; these are its boundary.
  useConfirmProjectApprovalReview: jest.fn(),
  useRespondProjectApproval: jest.fn(),
  useSetDecisionSnooze: jest.fn(),
  useDecisionSnooze: jest.fn(),
  useDecisionComments: jest.fn(),
  useCreateDecisionComment: jest.fn(),
  useDecisionRealtime: jest.fn(),
  // L6 — the review and scope-change asks (review-ask.tsx, scope-change-ask.tsx)
  // mount inside `asks`/`previouslySection`/the mat/every room band, so any
  // threshold.tsx render exercises their hooks too. `resetMocks: true`
  // (jest.config.js) strips these bare `jest.fn()`s before every test, so the
  // "nothing pending" shape they need is set for real in the shared
  // `beforeEach` below, alongside every other hook this file mocks.
  useMyPendingReviewRequests: jest.fn(),
  useMySubmittedReviews: jest.fn(),
  useSubmitReview: jest.fn(),
  useScopeChangeRequests: jest.fn(),
  useApproveScopeChange: jest.fn(),
  useDeclineScopeChange: jest.fn(),
  useCreateClientScopeChangeRequest: jest.fn(),
  useCancelClientScopeChangeRequest: jest.fn(),
  // A letter the address names is unfolded on arrival, and unfolding mounts
  // `Settlement`. Its own behaviour is `settlement.test.tsx`'s; here these only
  // have to exist so the ceremony can stand.
  useInvoicePaymentOptions: jest.fn(),
  useStartCheckout: jest.fn(),
  useNotifyCheckIntent: jest.fn(),
}));

jest.mock('@/hooks/use-commercial-client', () => ({
  __esModule: true,
  useClientSelections: jest.fn(),
  useClientPlan: jest.fn(),
  useClientCommercialDocument: jest.fn(),
  clientCommercialDocumentQueryOptions: jest.fn(),
  useAcceptTradeScope: jest.fn(),
  useProjectWorkingBudget: jest.fn(),
  invalidateSignedCommercialDocument: jest.fn().mockResolvedValue(undefined),
  // L6 — SelectionEditionAsk (review-ask.tsx) reads no edition id from any of
  // this file's fixtures (no `?review=` in jsdom's default URL), so it never
  // calls these with a real id; the shared `beforeEach` gives them a safe
  // default regardless (see the note above `useMyPendingReviewRequests`).
  useClientProjectReviewBundle: jest.fn(),
  useRecordProjectReviewFeedback: jest.fn(),
}));

jest.mock('@/hooks/use-auth', () => ({
  __esModule: true,
  useAuth: jest.fn(),
}));

// The letterbox-only front door falls back to this state and borrows its two
// acts; the CMS probe behind it is `ProjectsEmptyState`'s own boundary.
jest.mock('@/components/projects/ProjectsEmptyState', () => ({
  __esModule: true,
  ProjectsEmptyState: () => <div data-testid="empty-state" />,
  EmptyStateActs: () => <div data-testid="empty-state-acts" />,
}));

// The door's other four answers (read in full / ask / request a change /
// decline) are their own component with their own suite — door-acts.test.tsx.
// Stubbed here so this file's boundary stays the wiring it is about.
jest.mock('../door-acts', () => ({
  __esModule: true,
  // Rendered as a witness rather than as nothing: R30's origin door has to
  // hand the acts a studio to ask in place of the project it has not got,
  // and this file is where that wiring is asserted.
  DoorActs: ({
    projectId,
    studioProfileId,
  }: {
    projectId: string | null;
    studioProfileId?: string | null;
  }) => (
    <div
      data-testid="door-acts-stub"
      data-project-id={projectId ?? ''}
      data-studio-profile-id={studioProfileId ?? ''}
    />
  ),
}));

jest.mock('@/hooks/use-project-correspondence', () => ({
  __esModule: true,
  useProjectCorrespondence: jest.fn(),
  useMarkNoticesRead: jest.fn(),
  useMarkLettersRead: jest.fn(),
  useWriteBack: jest.fn(),
  useMuteLetters: jest.fn(),
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  clientEvents: {
    projectView: jest.fn(),
    // The letterbox reports a return from the till; the front door mounts it
    // with no house under it.
    paymentCompleted: jest.fn(),
    paymentCancelled: jest.fn(),
    // Choosing "check" on the adopted studio letter is how the payee is read.
    paymentMethodSelected: jest.fn(),
    checkIntentSubmitted: jest.fn(),
    paymentStarted: jest.fn(),
  },
  makingEvents: {
    surfaceViewed: jest.fn(),
    gateFollowed: jest.fn(),
    tollFollowed: jest.fn(),
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
  proposalClientEvents: { signed: jest.fn() },
}));

import {
  useClientInvoices,
  useConfirmProjectApprovalReview,
  useCreateDecisionComment,
  useDecisionComments,
  useDecisionRealtime,
  useDirectOrders,
  useMarkProjectRead,
  useMyProjectApprovalReviews,
  usePreviousReadingMark,
  useRespondProjectApproval,
  useSetDecisionSnooze,
  useDecisionSnooze,
  useProjectInvoices,
  useProjectNotes,
  useProjectParties,
  useProjectRooms,
  useProjectTeamMembers,
  useStudioIdentity,
  useClientSafeProposals,
  useMyPendingReviewRequests,
  useMySubmittedReviews,
  useSubmitReview,
  useScopeChangeRequests,
  useApproveScopeChange,
  useDeclineScopeChange,
  useCreateClientScopeChangeRequest,
  useInvoicePaymentOptions,
  useStartCheckout,
  useNotifyCheckIntent,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import {
  useMarkLettersRead,
  useMarkNoticesRead,
  useMuteLetters,
  useProjectCorrespondence,
  useWriteBack,
} from '@/hooks/use-project-correspondence';
import {
  clientCommercialDocumentQueryOptions,
  useAcceptTradeScope,
  useClientCommercialDocument,
  useClientPlan,
  useClientSelections,
  useClientProjectReviewBundle,
  useProjectWorkingBudget,
  useRecordProjectReviewFeedback,
} from '@/hooks/use-commercial-client';

import { HOLD_MS } from '../instruments/scored-action';
import { LetterboxDoor } from '../letterbox-door';
import { Threshold } from '../threshold';

const approvalsMock = useMyProjectApprovalReviews as jest.Mock;
const invoicesMock = useProjectInvoices as jest.Mock;
const clientInvoicesMock = useClientInvoices as jest.Mock;
const proposalsMock = useClientSafeProposals as jest.Mock;
const roomsMock = useProjectRooms as jest.Mock;
const notesMock = useProjectNotes as jest.Mock;
const ordersMock = useDirectOrders as jest.Mock;
const partiesMock = useProjectParties as jest.Mock;
const teamMock = useProjectTeamMembers as jest.Mock;
const identityMock = useStudioIdentity as jest.Mock;
const paymentOptionsMock = useInvoicePaymentOptions as jest.Mock;
const startCheckoutMock = useStartCheckout as jest.Mock;
const notifyCheckIntentMock = useNotifyCheckIntent as jest.Mock;
const markReadMock = useMarkProjectRead as jest.Mock;
const previousMarkMock = usePreviousReadingMark as jest.Mock;
const selectionsMock = useClientSelections as jest.Mock;
const planMock = useClientPlan as jest.Mock;
const pendingReviewMock = useMyPendingReviewRequests as jest.Mock;
const submittedReviewMock = useMySubmittedReviews as jest.Mock;
const submitReviewMock = useSubmitReview as jest.Mock;
const scopeChangesMock = useScopeChangeRequests as jest.Mock;
const approveScopeChangeMock = useApproveScopeChange as jest.Mock;
const declineScopeChangeMock = useDeclineScopeChange as jest.Mock;
const createScopeChangeMock = useCreateClientScopeChangeRequest as jest.Mock;
const reviewBundleMock = useClientProjectReviewBundle as jest.Mock;
const reviewFeedbackMock = useRecordProjectReviewFeedback as jest.Mock;
const bundleMock = useClientCommercialDocument as jest.Mock;
const queryOptionsMock = clientCommercialDocumentQueryOptions as jest.Mock;
const acceptMock = useAcceptTradeScope as jest.Mock;
const authMock = useAuth as jest.Mock;
const correspondenceMock = useProjectCorrespondence as jest.Mock;
const markNoticesReadMock = useMarkNoticesRead as jest.Mock;
const markLettersReadMock = useMarkLettersRead as jest.Mock;
const writeBackMock = useWriteBack as jest.Mock;
const muteLettersMock = useMuteLetters as jest.Mock;

// ── Fixtures — the Vale residence, as the seed tells it ─────────────────────

const PROJECT_ID = 'proj-vale';
const LIBRARY = 'room-library';
const ENTRY = 'room-entry';

const PROJECT: ClientProjectOverview = {
  id: PROJECT_ID,
  name: 'The Vale Residence',
  location: 'Oak Park, Illinois',
  currentPhase: 'procurement',
  status: 'active',
  projectedCompletionDate: '2099-10-15',
  progressPercentage: 60,
  completedMilestones: 3,
  totalMilestones: 6,
  approvalsPending: 0,
  unreadMessages: 0,
  nextMilestone: null,
};

const MILESTONES: MilestoneDetail[] = [
  {
    id: 'ph-1',
    index: 0,
    title: 'Discovery',
    phase: 'consultation',
    status: 'completed',
    completionDate: '2026-03-12',
    progressPercentage: 100,
    checklist: [],
    documents: [],
    messages: [],
  },
  {
    id: 'ph-4',
    index: 3,
    title: 'Procurement',
    phase: 'procurement',
    status: 'in_progress',
    progressPercentage: 40,
    checklist: [],
    documents: [],
    messages: [],
  },
  {
    id: 'ph-5',
    index: 4,
    title: 'Installation',
    phase: 'installation',
    status: 'upcoming',
    targetDate: '2099-10-12',
    progressPercentage: 0,
    checklist: [],
    documents: [],
    messages: [],
  },
];

const ROOMS = [
  { id: LIBRARY, name: 'Library & lounge', sort_order: 0, floor_area_sqft: 320 },
  { id: ENTRY, name: 'Entry & stair hall', sort_order: 1, floor_area_sqft: 180 },
];

/** The paper the library door is shut on — furnishings authorization No. 7. */
const AUTHORIZATION = {
  id: 'prop-7',
  title: 'Furnishings authorization No. 7',
  project_id: PROJECT_ID,
  document_kind: 'furnishings_authorization',
  commercial_state: 'sent',
  status: 'sent',
  total_amount: 689000,
  sent_at: '2026-08-04',
  updated_at: '2026-08-04',
  version: 1,
} as unknown as Proposal;

const SIGNED_AGREEMENT = {
  id: 'prop-1',
  title: 'Design services agreement',
  project_id: PROJECT_ID,
  document_kind: 'design_services',
  commercial_state: 'executed',
  status: 'accepted',
  total_amount: 1200000,
  sent_at: '2026-05-20',
  signed_at: '2026-05-30',
  updated_at: '2026-05-30',
  version: 1,
} as unknown as Proposal;

const CREDENZA: ClientSelection = {
  id: 'sel-credenza',
  kind: 'furnishings',
  name: 'Walnut credenza',
  roomId: LIBRARY,
  roomName: 'Library & lounge',
  quantity: 1,
  clientUnitPriceCents: 840000,
  clientLineTotalCents: 840000,
  itemType: 'furniture',
  logisticsStatus: 'in_production',
  tradeJourney: null,
  allowance: null,
  instrument: {
    documentId: 'doc-7',
    proposalId: 'prop-7',
    name: 'Furnishings authorization No. 7',
    executedAt: null,
  },
  productId: null,
  imageUrl: null,
  docCode: 'FA-7',
};

const PAINTWORK: ClientSelection = {
  id: 'sel-paint',
  kind: 'trade',
  name: 'The paintwork',
  roomId: ENTRY,
  roomName: 'Entry & stair hall',
  quantity: 1,
  clientUnitPriceCents: 720000,
  clientLineTotalCents: 720000,
  itemType: 'trade',
  logisticsStatus: 'not_started',
  tradeJourney: 'substantially_complete',
  allowance: null,
  instrument: {
    documentId: 'doc-paint',
    proposalId: 'prop-paint',
    name: 'Paintwork scope',
    executedAt: '2026-06-02',
  },
  productId: null,
  imageUrl: null,
  docCode: 'TS-2',
};

const INVOICE = {
  id: 'inv-4',
  invoice_number: 'Invoice No. 4',
  status: 'partially_paid',
  total_cents: 1825000,
  amount_paid_cents: 912500,
  due_date: '2026-08-15',
  updated_at: '2026-08-04T10:00:00Z',
} as unknown as Invoice;

/** A letter for no house at all — the studio's own (ruling S1). */
const STUDIO_INVOICE = {
  id: 'inv-31',
  project_id: null,
  studio_id: 'studio-1',
  designer_id: 'designer-nora',
  client_id: 'client-1',
  invoice_number: 'Invoice No. 31',
  title: 'Design consultation · 12 September 2026',
  status: 'sent',
  currency: 'USD',
  total_cents: 45_000,
  amount_paid_cents: 0,
  due_date: '2026-08-10',
  sent_at: '2026-08-05T10:00:00Z',
  created_at: '2026-08-05T10:00:00Z',
  updated_at: '2026-08-05T10:00:00Z',
} as unknown as Invoice;

const NOTE = {
  id: 'note-1',
  projectId: PROJECT_ID,
  authorId: 'user-nora',
  body: 'Three last pieces for the library — sign and I’ll have them ordered by Friday.',
  enclosures: [{ kind: 'proposal' as const, id: 'prop-7' }],
  state: 'standing' as const,
  sentAt: '2026-08-04T09:00:00Z',
  answeredAt: null,
  retiredAt: null,
};

/** The trade bundle behind the wall — the maker, and the draw her name releases. */
const TRADE_BUNDLE = {
  document: { kind: 'trade_scope' },
  tradeScope: {
    party: { displayName: 'Prairie Coat Painting' },
    progress: { state: 'substantially_complete' },
    draws: [
      { amountCents: 320000, gatesOnAcceptance: false, invoicePaidCents: 320000 },
      { amountCents: 144000, gatesOnAcceptance: true, invoicePaidCents: 0 },
    ],
  },
};

const AUTHORIZATION_BUNDLE = {
  document: { kind: 'furnishings_authorization' },
  furnishings: { depositRequiredCents: 344500, items: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }] },
};

function settled<T>(data: T) {
  // `refetch` is real on every query the letterbox is handed; the merged
  // re-read calls both of them.
  return { data, isPending: false, isLoading: false, isError: false, refetch: jest.fn() };
}

/**
 * The bundles the RPC would return, keyed by proposal. Both the gates' hook
 * and the ledger's `useQueries` read this one map, so a test changes what the
 * house knows in one place. An id absent from it is a bundle still in flight.
 */
let bundles: Record<string, unknown> = {};

function renderThreshold(
  milestones: MilestoneDetail[] = MILESTONES,
  otherHouses: { id: string; name: string }[] = [],
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Threshold
        projectId={PROJECT_ID}
        project={PROJECT}
        milestones={milestones}
        otherHouses={otherHouses}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  approvalsMock.mockReturnValue({ data: [], isLoading: false, isError: false });
  authMock.mockReturnValue({
    user: { id: 'client-1', name: 'Harper Vale' },
    signOut: jest.fn(),
  });
  proposalsMock.mockReturnValue(settled([AUTHORIZATION, SIGNED_AGREEMENT]));
  selectionsMock.mockReturnValue(
    settled({ origin: 'commercial', selections: [CREDENZA, PAINTWORK] }),
  );
  invoicesMock.mockReturnValue(settled([INVOICE]));
  clientInvoicesMock.mockReturnValue(settled([]));
  ordersMock.mockReturnValue(settled([]));
  roomsMock.mockReturnValue(settled(ROOMS));
  notesMock.mockReturnValue(settled([NOTE]));
  planMock.mockReturnValue(
    settled({
      publishedAt: '2026-06-01',
      rooms: ['Library & lounge'],
      lines: [
        {
          id: 'line-1',
          roomName: 'Library & lounge',
          category: 'seating',
          targetCents: 2380000,
          scheduledCents: 0,
          authorizedCents: 0,
          liveAuthorizedCents: 0,
        },
      ],
      liveAuthorizedTotalCents: 6140000,
    }),
  );
  identityMock.mockReturnValue(settled({ name: 'Quist Interiors', source: 'studio' }));
  teamMock.mockReturnValue(
    settled([{ id: 'tm-1', role: 'lead_designer', user: { full_name: 'Nora Quist' } }]),
  );
  partiesMock.mockReturnValue(
    settled([
      {
        id: 'party-1',
        display_name: 'Prairie Coat Painting',
        company_name: 'Prairie Coat Painting',
        party_kind: 'sub',
        trade: null,
        show_to_client: true,
      },
    ]),
  );
  markReadMock.mockReturnValue({ mutate: jest.fn(), isPending: false });
  correspondenceMock.mockReturnValue({
    threadId: null,
    muted: false,
    letters: [],
    notices: [],
    hasEarlierLetters: false,
    readEarlierLetters: jest.fn(),
    isReadingEarlierLetters: false,
    unreadNoticeIds: [],
    sentAts: [],
    isPending: false,
  });
  markNoticesReadMock.mockReturnValue(jest.fn());
  markLettersReadMock.mockReturnValue(jest.fn());
  writeBackMock.mockReturnValue({ send: jest.fn(), isPending: false });
  muteLettersMock.mockReturnValue({ toggle: jest.fn(), isPending: false });
  previousMarkMock.mockReturnValue({ data: undefined, isPending: false, isError: false });
  // The doorstep ask answers in place; jest.config resets mocks per test, so
  // its six hooks are re-armed here rather than at the factory.
  (useConfirmProjectApprovalReview as jest.Mock).mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
  (useRespondProjectApproval as jest.Mock).mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
  (useSetDecisionSnooze as jest.Mock).mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
  (useDecisionSnooze as jest.Mock).mockReturnValue({ data: null });
  (useDecisionComments as jest.Mock).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  });
  (useCreateDecisionComment as jest.Mock).mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
  });
  (useDecisionRealtime as jest.Mock).mockReturnValue(undefined);
  (useProjectWorkingBudget as jest.Mock).mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
  });
  bundles = {
    'prop-7': AUTHORIZATION_BUNDLE,
    'prop-paint': TRADE_BUNDLE,
    'prop-tile': TILE_BUNDLE,
  };
  bundleMock.mockImplementation((proposalId: string) =>
    proposalId in bundles
      ? settled(bundles[proposalId])
      : { data: undefined, isPending: true, isLoading: true, isError: false },
  );
  queryOptionsMock.mockImplementation((proposalId: string) => ({
    queryKey: ['client-bundle', proposalId],
    // An id with no fixture never settles — that is what "still in flight"
    // means here, and it keeps the pending assertion honest.
    queryFn: () =>
      proposalId in bundles
        ? Promise.resolve(bundles[proposalId])
        : new Promise(() => {}),
    initialData: bundles[proposalId],
    staleTime: Infinity,
  }));
  acceptMock.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  // L6 — the review and scope-change asks, reset to "nothing pending" for
  // every test in this file (the suite's jest config resets mocks between
  // tests, so the module factory's own default never survives past the
  // first). A test in the L6 describe block below overrides one of these.
  pendingReviewMock.mockReturnValue({ data: [], isLoading: false, isPending: false });
  submittedReviewMock.mockReturnValue({ data: [], isLoading: false, isPending: false });
  submitReviewMock.mockReturnValue({ mutate: jest.fn(), isPending: false });
  scopeChangesMock.mockReturnValue({ data: [], isLoading: false, isPending: false });
  approveScopeChangeMock.mockReturnValue({ mutate: jest.fn(), isPending: false });
  declineScopeChangeMock.mockReturnValue({ mutate: jest.fn(), isPending: false });
  createScopeChangeMock.mockReturnValue({ mutate: jest.fn(), isPending: false });
  reviewBundleMock.mockReturnValue({ data: null, isLoading: false, isError: false });
  reviewFeedbackMock.mockReturnValue({ mutate: jest.fn(), isPending: false });
});

describe('Threshold — which house', () => {
  // Path B's sheet is two columns: a story-pole rail on the left and the house
  // on the right. The pole therefore comes FIRST in the DOM and is not part of
  // the reading order at all — so the order below is asserted over the house
  // column, and the rail is asserted separately as a rail.
  it('draws the house, in reading order, once the rooms have come back', () => {
    const { container } = renderThreshold();

    const house = container.querySelector('#doorstep')!.parentElement!;
    const ordered = [
      container.querySelector('#doorplate')!,
      ...Array.from(
        house.querySelectorAll(
          '#doorstep, #key, section[id^="room-"], #road, #note, #previously, #mat',
        ),
      ),
    ].map((node) => node.id);

    expect(ordered).toEqual([
      'doorplate',
      'doorstep',
      'key',
      `room-${LIBRARY}`,
      `room-${ENTRY}`,
      'road',
      'note',
      'previously',
      'mat',
    ]);
    expect(screen.queryByTestId('ground-floor')).not.toBeInTheDocument();
  });

  it('stands the story pole beside the whole house, as a sticky left rail', () => {
    const { container } = renderThreshold();

    const pole = container.querySelector('#story-pole')!;
    const rail = pole.parentElement!;
    expect(rail.className).toContain('sticky');

    // The rail is the first column, so it precedes the house in the DOM…
    const doorstep = container.querySelector('#doorstep')!;
    expect(pole.compareDocumentPosition(doorstep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // …and it is a SIBLING of the whole house column, not a child of its head,
    // so it stands beside the room bands and the mat too.
    expect(rail.parentElement).toBe(doorstep.parentElement!.parentElement);
    expect(rail.parentElement!.contains(container.querySelector('#mat'))).toBe(true);
  });

  it('falls to the ground floor when the rooms have settled empty', () => {
    roomsMock.mockReturnValue(settled([]));
    renderThreshold();

    expect(screen.getByTestId('ground-floor')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-key')).not.toBeInTheDocument();
    expect(screen.getByTestId('doorstep')).toBeInTheDocument();
  });

  it('holds the house’s place while the rooms are still coming — never the ground floor', () => {
    roomsMock.mockReturnValue({ data: undefined, isPending: true, isLoading: true, isError: false });
    renderThreshold();

    expect(screen.getByTestId('doorstep')).toBeInTheDocument();
    expect(screen.getByTestId('threshold-hold')).toBeInTheDocument();
    expect(screen.queryByTestId('ground-floor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('plan-key')).not.toBeInTheDocument();
  });

  // React Query drops `isPending` on error. A failed register that settles
  // into an empty one tells the client her house has no rooms because a read
  // failed — a failure dressed as a fact.
  it('says the rooms could not be read rather than standing an empty house', () => {
    roomsMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isLoading: false,
      isError: true,
    });
    renderThreshold();

    expect(screen.getByTestId('threshold-rooms-error')).toHaveTextContent(
      'Couldn’t load your rooms. Please refresh.',
    );
    expect(screen.queryByTestId('ground-floor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('plan-key')).not.toBeInTheDocument();
  });

  it('says what she bought direct could not be read rather than “Nothing on the road.”', () => {
    ordersMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });
    renderThreshold();

    expect(screen.getByTestId('road-orders-error')).toBeInTheDocument();
    expect(screen.queryByText('Nothing on the road.')).not.toBeInTheDocument();
  });

  it('says nothing at all while the queries are in flight', () => {
    notesMock.mockReturnValue({ data: undefined, isPending: true, isLoading: true, isError: false });
    renderThreshold();

    expect(screen.getByTestId('doorstep-sentence-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('doorstep-sentence')).not.toBeInTheDocument();
  });
});

describe('Threshold — the five facts', () => {
  it('prints all five where the client reads them', () => {
    const { container } = renderThreshold();

    // 1 · the authorization, and what it is worth
    expect(screen.getByTestId('door-total')).toHaveTextContent('$6,890');
    // 2 · the maker whose finished work is waiting
    expect(container.textContent).toContain('Prairie Coat Painting');
    // 3 · the draw her acceptance releases
    expect(container.textContent).toContain(
      'The draw of $1,440 releases on your acceptance.',
    );
    // 4 · the balance and the day it falls due
    expect(screen.getByTestId('letterbox-body')).toHaveTextContent(
      'Balance $9,125, due August 15',
    );
    // 5 · the chapter the house stands in
    expect(screen.getByTestId('doorplate-sub')).toHaveTextContent('Procurement');
  });

  it('addresses the plate to the client the session names, and to nobody without one', () => {
    const { unmount } = renderThreshold();
    expect(screen.getByTestId('doorplate-line')).toHaveTextContent('prepared for Harper Vale');
    unmount();

    authMock.mockReturnValue({ user: { name: null }, signOut: jest.fn() });
    renderThreshold();
    expect(screen.getByTestId('doorplate-line')).not.toHaveTextContent('prepared for');
  });

  it('gives the first door and the first wall the page-level anchors', () => {
    const { container } = renderThreshold();

    expect(container.querySelectorAll('#door')).toHaveLength(1);
    expect(container.querySelectorAll('#wall')).toHaveLength(1);
  });

  it('sets the note’s body once, and pins only its opening to the door', () => {
    renderThreshold();

    expect(screen.getAllByTestId('note-body')).toHaveLength(1);
    expect(screen.getAllByTestId('door-note-pin')).toHaveLength(1);
    expect(screen.getByTestId('door-note-read')).toHaveAttribute('href', '#note');
  });

  it('pins nothing on the ground floor, where the letter is already set above', () => {
    roomsMock.mockReturnValue(settled([]));
    renderThreshold();

    expect(screen.getByTestId('ground-floor')).toBeInTheDocument();
    expect(screen.getAllByTestId('note-body')).toHaveLength(1);
    expect(screen.queryByTestId('door-note-pin')).not.toBeInTheDocument();
  });
});

describe('Threshold — the reading mark', () => {
  it('marks the project read exactly once, after hydration', () => {
    const mutate = jest.fn();
    markReadMock.mockReturnValue({ mutate, isPending: false });

    const { rerender } = renderThreshold();
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <Threshold projectId={PROJECT_ID} project={PROJECT} milestones={MILESTONES} />
      </QueryClientProvider>,
    );

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ projectId: PROJECT_ID });
  });

  it('offers no "since yesterday" on a first visit', () => {
    // null = the mark resolved and there was no prior one.
    previousMarkMock.mockReturnValue({ data: null, isPending: false, isError: false });
    renderThreshold();

    expect(
      screen.queryByRole('button', { name: /what changed since yesterday/i }),
    ).not.toBeInTheDocument();
  });

  it('offers it once a previous reading exists', () => {
    previousMarkMock.mockReturnValue({
      data: '2026-08-04T00:00:00Z',
      isPending: false,
      isError: false,
    });
    renderThreshold();

    expect(
      screen.getByRole('button', { name: /what changed since yesterday/i }),
    ).toBeInTheDocument();
  });

  it('dates that reading beside the control', () => {
    // Noon UTC: the mark is a timestamptz and is read as the LOCAL calendar day
    // the client stood here, so a midnight-UTC fixture would be the day before
    // in every American zone.
    previousMarkMock.mockReturnValue({
      data: '2026-08-04T12:00:00Z',
      isPending: false,
      isError: false,
    });
    renderThreshold();

    expect(screen.getByTestId('doorstep-reading-mark')).toHaveTextContent(
      'Read here on the fourth of August.',
    );
  });

  it('dates nothing on a first visit', () => {
    previousMarkMock.mockReturnValue({ data: null, isPending: false, isError: false });
    renderThreshold();

    expect(screen.queryByTestId('doorstep-reading-mark')).not.toBeInTheDocument();
  });
});

/* ── The pole with no register behind it ────────────────────────────────────
   Most real projects carry no `project_phases` rows. The page must still rule
   a pole, and it must rule the house's own six chapters — this is the call
   site, not the helper. ─────────────────────────────────────────────────── */

describe('the story pole when the studio never opened the phase register', () => {
  it('graduates the house’s six canonical chapters', () => {
    renderThreshold([]);

    const rail = screen.getByTestId('story-pole-rail');
    expect(rail.querySelectorAll('li')).toHaveLength(6);
    expect(rail).toHaveTextContent('Discovery');
    expect(rail).toHaveTextContent('Completion');
  });

  it('holds the chapter the project itself names', () => {
    renderThreshold([]);

    expect(screen.getByTestId('story-pole-graduation-procurement')).toHaveAttribute(
      'data-held',
      'true',
    );
    expect(screen.queryByTestId('story-pole-span-procurement')).not.toBeInTheDocument();
  });
});

/* ── What stands on the doorstep ────────────────────────────────────────────
   Two kinds of ask carry no room: a phase approval, which has only a phase,
   and a paper whose lines land in no room the drawing knows. Both stand on
   the doorstep rather than being filed into a band they do not belong to.
   ────────────────────────────────────────────────────────────────────────── */

const PHASE_APPROVAL = {
  decisionId: 'dec-1',
  projectId: PROJECT_ID,
  phaseId: 'ph-4',
  artifactTitle: 'Library elevations',
  artifactVersion: 3,
  question: 'Do the library elevations read right to you?',
  dueAt: '2026-08-20',
  lifecycleStatus: 'pending',
  outcome: null,
  disposition: 'active',
  completedReviewCount: 1,
  requiredReviewCount: 1,
  authorityRevision: 3,
  artifactChecksum: 'a'.repeat(64),
  costCentsDelta: 0,
  scheduleDaysDelta: 0,
  leadTimeDaysDelta: 0,
  context: null,
  respondedAt: null,
  updatedAt: '2026-08-12T10:00:00Z',
} as unknown as ProjectApprovalReview;

function renderWithApprovals(
  approvals: ProjectApprovalReview[],
  { error = false }: { error?: boolean } = {},
) {
  // The house reads its own approvals now — `list_my_project_decision_reviews`
  // is caller-global, so the rows come back for every project this client has
  // and the Threshold filters them to this one.
  approvalsMock.mockReturnValue({
    data: approvals,
    isLoading: false,
    isError: error,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Threshold projectId={PROJECT_ID} project={PROJECT} milestones={MILESTONES} />
    </QueryClientProvider>,
  );
}

describe('Threshold — the doorstep’s own asks', () => {
  it('stands a phase approval on the doorstep, with its own act', () => {
    renderWithApprovals([PHASE_APPROVAL]);

    const gate = screen.getByTestId('doorstep-approval');
    expect(gate).toHaveTextContent('Do the library elevations read right to you?');
    // The artifact is a plate now: named, dated, and marked at the frame's
    // edge. The due date stands under the ask, not inside the picture.
    const plate = within(gate).getByTestId('approval-plate');
    expect(plate).toHaveTextContent('Library elevations');
    // This fixture carries no issue date, and the plate says so by saying
    // nothing — an edition is never dated with a day nobody recorded.
    expect(plate).toHaveTextContent('Edition 3');
    expect(plate).not.toHaveTextContent('Issued');
    expect(gate).toHaveTextContent('Due August 20');
    // The ask is answered where it stands — no link off the page.
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /respond/i })).not.toBeInTheDocument();
  });

  it('reads a draft approval as a review rather than a response', () => {
    renderWithApprovals([
      {
        ...PHASE_APPROVAL,
        lifecycleStatus: 'draft',
        completedReviewCount: 0,
      } as ProjectApprovalReview,
    ]);

    expect(screen.getByTestId('doorstep-approval')).toHaveTextContent(
      'Your approval · read the edition first',
    );
    expect(
      screen.getByRole('button', { name: /review exact edition/i }),
    ).toBeInTheDocument();
  });

  it('hands the ask the lead designer’s given name and the studio’s own', () => {
    (useDecisionComments as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'c1',
          decision_id: 'dec-1',
          author_id: 'designer-9',
          body: 'I will bring both finishes on Thursday.',
          created_at: '2026-08-13T15:00:00Z',
          updated_at: '2026-08-13T15:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
    });
    renderWithApprovals([
      {
        ...PHASE_APPROVAL,
        lifecycleStatus: 'draft',
        completedReviewCount: 1,
        requiredReviewCount: 1,
      } as ProjectApprovalReview,
    ]);

    expect(screen.getByTestId('approval-awaiting-studio-issue')).toHaveTextContent(
      "You've confirmed edition 3. Nora issues it next. Nothing is waiting on you.",
    );
    expect(screen.getByRole('button', { name: /ask nora about this/i })).toBeInTheDocument();
    expect(screen.getByTestId('approval-discussion')).toHaveTextContent(
      'Nora · Quist Interiors',
    );
  });

  it('keeps the record of an approval answered on an earlier visit', () => {
    renderWithApprovals([
      {
        ...PHASE_APPROVAL,
        outcome: 'approved',
        lifecycleStatus: 'responded',
        respondedAt: '2026-08-14T12:00:00Z',
      } as ProjectApprovalReview,
    ]);

    expect(screen.queryByTestId('doorstep-approval')).not.toBeInTheDocument();
    expect(screen.getByTestId('approval-receipt-stamp')).toHaveTextContent('APPROVED 14 August');
  });

  it('says so where the asks would stand when the approvals cannot be read', () => {
    renderWithApprovals([], { error: true });

    expect(screen.getByTestId('threshold-approvals-error')).toHaveTextContent(
      'The approvals could not be read just now. Please refresh before taking action.',
    );
  });

  it('stands a roomless paper on the doorstep, not inside a band', () => {
    const roomless = {
      ...AUTHORIZATION,
      id: 'prop-9',
      title: 'Design services addendum',
      document_kind: 'service_addendum',
      total_amount: 250000,
    } as unknown as Proposal;
    proposalsMock.mockReturnValue(settled([AUTHORIZATION, roomless, SIGNED_AGREEMENT]));

    const { container } = renderThreshold();

    // The first door keeps `#door`; the roomless one is addressed by its mark
    // and sits above the key, outside every room band.
    const roomlessDoor = container.querySelector('#door-door-prop-9');
    expect(roomlessDoor).not.toBeNull();
    expect(roomlessDoor?.closest('section[id^="room-"]')).toBeNull();
  });

  // R30, carried to Wave 2 — THE PAPERS WITHOUT A HOUSE. A design services
  // agreement is bound to no project until it is countersigned, so a household
  // that already has a house and is sent a second origin agreement had it
  // filtered off every door she owns.
  describe('a paper that comes before a house', () => {
    const ORIGIN_AGREEMENT = {
      ...AUTHORIZATION,
      id: 'prop-origin',
      title: 'Design services agreement',
      project_id: null,
      document_kind: 'design_services',
      total_amount: 0,
    } as unknown as Proposal;

    it('stands on this house’s doorstep and says which paper it is', () => {
      proposalsMock.mockReturnValue(
        settled([AUTHORIZATION, ORIGIN_AGREEMENT, SIGNED_AGREEMENT]),
      );

      const { container } = renderThreshold();

      expect(container.querySelector('#door-door-prop-origin')).not.toBeNull();
      expect(screen.getByTestId('door-houseless')).toHaveTextContent(
        'This one comes before a house. It is addressed to you, so it waits on every door until you sign it.',
      );
    });

    // The shape the RPC actually sends: `list_client_proposals` OMITS
    // `project_id` when the column is NULL rather than sending `null`, so a
    // fixture that spells `project_id: null` proves less than it looks. This
    // one carries no such key at all.
    it('stands on the doorstep when the row carries no project_id key at all', () => {
      const ROW_WITHOUT_THE_KEY: Record<string, unknown> = {
        ...(ORIGIN_AGREEMENT as unknown as Record<string, unknown>),
      };
      delete ROW_WITHOUT_THE_KEY.project_id;
      proposalsMock.mockReturnValue(
        settled([
          AUTHORIZATION,
          ROW_WITHOUT_THE_KEY as unknown as Proposal,
          SIGNED_AGREEMENT,
        ]),
      );

      const { container } = renderThreshold();

      expect(container.querySelector('#door-door-prop-origin')).not.toBeNull();
      expect(screen.getByTestId('door-houseless')).toBeInTheDocument();
    });

    it('leaves an addendum with no project off this house’s doors', () => {
      proposalsMock.mockReturnValue(
        settled([
          {
            ...ORIGIN_AGREEMENT,
            id: 'prop-addendum',
            document_kind: 'service_addendum',
          } as unknown as Proposal,
          SIGNED_AGREEMENT,
        ]),
      );

      const { container } = renderThreshold();

      expect(container.querySelector('#door-door-prop-addendum')).toBeNull();
      expect(container.querySelector('#door')).toBeNull();
    });

    /* Wave 3. A turnkey prime is project-less through her signature for the
       same reason a design-services agreement is — the project appears at
       countersignature — so it is a paper that comes before a house too, and
       the R30 defect would otherwise repeat itself on the one paper that
       prices a whole job. */
    it('stands the turnkey prime on the doorstep too', () => {
      proposalsMock.mockReturnValue(
        settled([
          AUTHORIZATION,
          {
            ...ORIGIN_AGREEMENT,
            id: 'prop-turnkey',
            title: 'Halvorsen kitchen and mudroom',
            document_kind: 'design_build',
          } as unknown as Proposal,
          SIGNED_AGREEMENT,
        ]),
      );

      const { container } = renderThreshold();

      expect(container.querySelector('#door-door-prop-turnkey')).not.toBeNull();
      expect(screen.getByTestId('door-houseless')).toBeInTheDocument();
    });

    /* W3R1-02, then R50 — AND THE SAME PAPER AFTER SHE HAS SIGNED IT.
       At `client_signed` the paper leaves `pending` for `accepted`, and the
       receipts filter was project-scoped: the walk signed a houseless
       design-build prime, reloaded, and found the door, the house and THE
       PAPERS all empty over a paper carrying her own signature. Round 1 gave
       it a receipt row; round 2 (W3R2-02) found the DOOR still gone — and with
       it the post-signature region: KEEP A COPY, the deposit offer and the pay
       link, none of which stands anywhere else on the page.

       So the door stands too, until the countersign that gives the paper a
       project. It is not asking: `signedAlready` is what tells it so before
       its own bundle answers. */
    it('keeps a signed, project-less prime in the record on every house', () => {
      proposalsMock.mockReturnValue(
        settled([
          AUTHORIZATION,
          {
            ...ORIGIN_AGREEMENT,
            id: 'prop-turnkey',
            title: 'Halvorsen kitchen and mudroom',
            document_kind: 'design_build',
            commercial_state: 'client_signed',
            status: 'accepted',
          } as unknown as Proposal,
          SIGNED_AGREEMENT,
        ]),
      );

      const { container } = renderThreshold();

      // R50 — the door stands, opened on her name, and it does not ask again.
      const door = container.querySelector('#door-door-prop-turnkey');
      expect(door).not.toBeNull();
      expect(door).toHaveTextContent('Open. It opened on your name.');
      expect(
        (door as HTMLElement).querySelector('[data-testid="door-sign-name"]'),
      ).toBeNull();
      // W3R1-02's receipt row stands with it.
      expect(document.querySelector('#previously')).toHaveTextContent(
        'Design-build agreement · Halvorsen kitchen and mudroom',
      );
    });

    it('leaves a signed addendum with no project off the record, as before', () => {
      proposalsMock.mockReturnValue(
        settled([
          AUTHORIZATION,
          {
            ...ORIGIN_AGREEMENT,
            id: 'prop-addendum',
            title: 'A change to the work',
            document_kind: 'service_addendum',
            commercial_state: 'client_signed',
            status: 'accepted',
          } as unknown as Proposal,
        ]),
      );

      renderThreshold();

      expect(document.querySelector('#previously')?.textContent ?? '').not.toContain(
        'A change to the work',
      );
    });

    it('leaves a signed paper belonging to ANOTHER house off this one', () => {
      proposalsMock.mockReturnValue(
        settled([
          AUTHORIZATION,
          {
            ...SIGNED_AGREEMENT,
            id: 'prop-elsewhere',
            title: 'Another house’s agreement',
            project_id: 'project-elsewhere',
          } as unknown as Proposal,
        ]),
      );

      renderThreshold();

      expect(document.querySelector('#previously')?.textContent ?? '').not.toContain(
        'Another house’s agreement',
      );
    });

    /* R47 — A QUESTION FROM THE ORIGIN DOOR FILES TO THE AGREEMENT'S STUDIO.
       A houseless paper stands on the doorstep of every house she owns, so
       handing its acts the house she happens to be reading would file a
       question about a brand new engagement into an unrelated project's
       thread. `DoorActs` picks `rpc_start_direct_thread` when it is given a
       studio and no project (door-acts.test.tsx:280-299); this is the wiring
       that gives it one. */
    it('hands the houseless door its studio, and no project to ask in', () => {
      proposalsMock.mockReturnValue(
        settled([
          AUTHORIZATION,
          {
            ...ORIGIN_AGREEMENT,
            designer_id: 'designer-nora',
          } as unknown as Proposal,
          SIGNED_AGREEMENT,
        ]),
      );

      const { container } = renderThreshold();

      const houselessActs = container.querySelector(
        '#door-door-prop-origin [data-testid="door-acts-stub"]',
      );
      expect(houselessActs).not.toBeNull();
      expect(houselessActs?.getAttribute('data-project-id')).toBe('');
      expect(houselessActs?.getAttribute('data-studio-profile-id')).toBe(
        'designer-nora',
      );

      // And the house's own paper still asks in the house's thread.
      const housedActs = container.querySelector(
        '#door [data-testid="door-acts-stub"]',
      );
      expect(housedActs?.getAttribute('data-project-id')).toBe(PROJECT_ID);
      expect(housedActs?.getAttribute('data-studio-profile-id')).toBe('');
    });
  });
});

describe('Threshold — the acts the house owes', () => {
  it('turns the since reading on and off from the doorstep', () => {
    previousMarkMock.mockReturnValue({
      data: '2026-08-04T00:00:00Z',
      isPending: false,
      isError: false,
    });
    renderThreshold();

    fireEvent.click(screen.getByRole('button', { name: /what changed since yesterday/i }));
    expect(
      screen.getByRole('button', { name: /show the whole house/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show the whole house/i }));
    expect(
      screen.getByRole('button', { name: /what changed since yesterday/i }),
    ).toBeInTheDocument();
  });

  it('leaves the house through the mat — the only way out on this route', () => {
    const signOut = jest.fn();
    authMock.mockReturnValue({ user: { name: 'Harper Vale' }, signOut });
    renderThreshold();

    fireEvent.click(screen.getByRole('button', { name: /leave the house/i }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('names the papers on the mat, each pointing at its own section', () => {
    renderThreshold();

    const papers = screen.getByTestId('mat-papers');
    expect(papers).toHaveTextContent('The drawing set');
    expect(papers).toHaveTextContent('Furnishings authorization No. 7');
    expect(papers).toHaveTextContent('Invoice No. 4');
  });

  it('lays the papers over the house from the mat, and takes them away again', async () => {
    renderThreshold();

    const act = screen.getByRole('button', { name: /the papers, in full/i });
    expect(act).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(act);
    expect(screen.getByTestId('papers-sheet-stub')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /the papers, in full/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: /dismiss the papers/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stands a capture in every room, and the strays after the last one', () => {
    renderThreshold();

    const captures = screen.getAllByTestId('room-capture-stub');
    expect(captures).toHaveLength(screen.getAllByTestId('room-band-lintel').length);
    expect(captures.every((capture) => capture.getAttribute('data-room-id'))).toBe(true);
    expect(screen.getByTestId('stray-captures-stub')).toBeInTheDocument();
  });

  it('resolves an invoice enclosure on the note from the invoice cache', () => {
    notesMock.mockReturnValue(
      settled([{ ...NOTE, enclosures: [{ kind: 'invoice' as const, id: 'inv-4' }] }]),
    );
    renderThreshold();

    expect(screen.getByTestId('note-enclosures')).toHaveTextContent('Invoice No. 4');
  });
});

/* ── What the house holds, and what moved ───────────────────────────────────
   Three figures the model cannot read off a selection row: the draw held
   behind each trade instrument (one RPC deeper), the room's target where the
   published plan is silent, and when a line last moved. ─────────────────── */

const SECOND_TRADE: ClientSelection = {
  ...PAINTWORK,
  id: 'sel-tile',
  name: 'The tilework',
  roomId: LIBRARY,
  roomName: 'Library & lounge',
  clientLineTotalCents: 410000,
  instrument: {
    documentId: 'doc-tile',
    proposalId: 'prop-tile',
    name: 'Tilework scope',
    executedAt: '2026-06-10',
  },
};

const TILE_BUNDLE = {
  document: { kind: 'trade_scope' },
  tradeScope: {
    party: { displayName: 'Ridge Tile Co.' },
    progress: { state: 'substantially_complete' },
    draws: [{ amountCents: 96000, gatesOnAcceptance: true, invoicePaidCents: 0 }],
  },
};

describe('Threshold — the held draws', () => {
  it('totals what two instruments hold, one bundle read each', () => {
    selectionsMock.mockReturnValue(
      settled({ origin: 'commercial', selections: [CREDENZA, PAINTWORK, SECOND_TRADE] }),
    );
    renderThreshold();

    // $1,440 on the paintwork + $960 on the tilework.
    expect(screen.getByTestId('house-ledger-held')).toHaveTextContent(
      'Held on finished work',
    );
    expect(screen.getByTestId('house-ledger-held')).toHaveTextContent('$2,400');
  });

  it('counts one instrument once, however many of its lines are waiting', () => {
    // Two trade lines under the SAME scope: the draw is held once, not twice.
    const sameScope: ClientSelection = {
      ...PAINTWORK,
      id: 'sel-paint-2',
      name: 'The stair paintwork',
      roomId: LIBRARY,
      roomName: 'Library & lounge',
    };
    selectionsMock.mockReturnValue(
      settled({ origin: 'commercial', selections: [PAINTWORK, sameScope] }),
    );

    renderThreshold();

    expect(screen.getByTestId('house-ledger-held')).toHaveTextContent('$1,440');
  });

  it('holds the whole house while the bundles are unread, not just the held row', () => {
    bundles = {};

    renderThreshold();

    expect(screen.getByTestId('threshold-hold')).toBeInTheDocument();
    expect(screen.queryByTestId('house-ledger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('house-ledger-held')).not.toBeInTheDocument();
  });
});

describe('Threshold — a room’s target', () => {
  it('prefers the published plan’s figure for a room it names', () => {
    renderThreshold();

    // $24,900 agreed against the plan's $23,800 → about eleven hundred past.
    expect(screen.getByTestId('house-ledger-top')).toHaveTextContent(
      'The house stands at $61,400 agreed of',
    );
    expect(screen.getByTestId('house-ledger-top')).toHaveTextContent('$23,800 planned');
  });

  it('falls back to the room’s own budget where the plan says nothing', () => {
    planMock.mockReturnValue(
      settled({ publishedAt: null, rooms: [], lines: [], liveAuthorizedTotalCents: 6140000 }),
    );
    roomsMock.mockReturnValue(
      settled([
        { ...ROOMS[0], budget_cents: 2380000 },
        { ...ROOMS[1], budget_cents: 720000 },
      ]),
    );

    renderThreshold();

    expect(screen.getByTestId('house-ledger-top')).toHaveTextContent('$31,000 planned');
  });

  it('stands on the agreed figure alone when nothing is planned', () => {
    planMock.mockReturnValue(
      settled({ publishedAt: null, rooms: [], lines: [], liveAuthorizedTotalCents: 6140000 }),
    );
    roomsMock.mockReturnValue(settled([{ ...ROOMS[0], budget_cents: 0 }]));

    renderThreshold();

    expect(screen.getByTestId('house-ledger-top')).toHaveTextContent(
      'The house stands at $61,400 agreed.',
    );
    expect(screen.getByTestId('house-ledger-top')).not.toHaveTextContent('planned');
  });
});

describe('Threshold — what moved since', () => {
  it('ticks the band a moved piece belongs to', () => {
    previousMarkMock.mockReturnValue({
      data: '2026-08-03T00:00:00Z',
      isPending: false,
      isError: false,
    });
    selectionsMock.mockReturnValue(
      settled({
        origin: 'commercial',
        selections: [
          { ...CREDENZA, updatedAt: '2026-08-04T12:00:00Z' },
          { ...PAINTWORK, updatedAt: '2026-07-01T12:00:00Z' },
        ],
      }),
    );

    const { container } = renderThreshold();

    fireEvent.click(screen.getByRole('button', { name: /what changed since yesterday/i }));

    expect(container.querySelector(`#room-${LIBRARY}`)).toHaveAttribute('data-changed', 'true');
    expect(container.querySelector(`#room-${ENTRY}`)).not.toHaveAttribute('data-changed');
  });

  it('ticks nothing when no line carries a timestamp', () => {
    previousMarkMock.mockReturnValue({
      data: '2026-08-03T00:00:00Z',
      isPending: false,
      isError: false,
    });

    const { container } = renderThreshold();

    fireEvent.click(screen.getByRole('button', { name: /what changed since yesterday/i }));

    expect(container.querySelector(`#room-${LIBRARY}`)).not.toHaveAttribute('data-changed');
  });
});

/* ── Never reverse ──────────────────────────────────────────────────────────
   "Nothing in the letterbox." and "Nothing stands open on this drawing." are
   assertions, not blanks. A client who reads either and then watches $9,125
   and two open marks arrive has been told something untrue. The house speaks
   only once every source it speaks FROM has answered. ──────────────────── */

const IN_FLIGHT = { data: undefined, isPending: true, isLoading: true, isError: false };

describe('Threshold — never reverse', () => {
  it('says nothing about the letterbox while the invoices are in flight', () => {
    invoicesMock.mockReturnValue(IN_FLIGHT);
    renderThreshold();

    expect(screen.queryByTestId('letterbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing in the letterbox/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('threshold-hold')).toBeInTheDocument();
  });

  it('says nothing about the drawing while the papers are in flight', () => {
    proposalsMock.mockReturnValue(IN_FLIGHT);
    renderThreshold();

    expect(screen.queryByTestId('plan-key')).not.toBeInTheDocument();
    expect(screen.queryByText(/stands open on this drawing/i)).not.toBeInTheDocument();
  });

  it('holds the same way for the goods, the rooms and the letter', () => {
    for (const mock of [selectionsMock, roomsMock, notesMock]) {
      mock.mockReturnValue(IN_FLIGHT);
      const { unmount } = renderThreshold();

      expect(screen.getByTestId('doorstep')).toBeInTheDocument();
      expect(screen.getByTestId('threshold-hold')).toBeInTheDocument();
      expect(screen.queryByTestId('house-ledger')).not.toBeInTheDocument();
      expect(screen.queryByTestId('letterbox')).not.toBeInTheDocument();
      expect(screen.queryByTestId('ground-floor')).not.toBeInTheDocument();

      unmount();
      mock.mockReturnValue(settled([]));
    }
  });

  it('holds the house while the plan is in flight — targets decide every variance', () => {
    planMock.mockReturnValue(IN_FLIGHT);
    renderThreshold();

    expect(screen.getByTestId('threshold-hold')).toBeInTheDocument();
    expect(screen.queryByTestId('house-ledger-top')).not.toBeInTheDocument();
    expect(screen.queryByTestId('house-ledger-overage')).not.toBeInTheDocument();
    expect(screen.queryByText(/past its target/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('room-band-ledger')).not.toBeInTheDocument();
  });

  /* W3R1-05 — A FAILED READ IS NOT AN EMPTY DOORSTEP.
     `useClientProposals` inherits `retry: 2`; after the third failure React
     Query drops `isPending`, so the house settled and printed "Nothing waits
     for your name." over papers it had simply been unable to read — with no
     error, no retry and no degraded state anywhere. R30 · N2 already ruled
     this for the household door; the house reads the same rule now. */
  it('never says nothing waits for her name over papers it could not read', () => {
    proposalsMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });

    renderThreshold();

    expect(screen.getByTestId('papers-unread')).toHaveTextContent(
      'Your papers could not be drawn just now. Nothing on them has changed.',
    );
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nothing waits for your name.')).not.toBeInTheDocument();
  });

  it('asks for the read again when the retry is taken', () => {
    const refetch = jest.fn();
    proposalsMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isLoading: false,
      isError: true,
      refetch,
    });

    renderThreshold();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(refetch).toHaveBeenCalled();
  });

  it('holds the doorplate up throughout — the house is always named', () => {
    invoicesMock.mockReturnValue(IN_FLIGHT);
    renderThreshold();

    expect(screen.getByTestId('doorplate-title')).toHaveTextContent('The Vale Residence');
    expect(screen.getByTestId('doorstep-sentence-pending')).toBeInTheDocument();
  });
});

/* ── A wall with nowhere to hang ────────────────────────────────────────────
   A trade line filed under a room the drawing does not draw used to render
   nowhere while the standing sentence went on counting it. ───────────────── */

describe('Threshold — a wall the drawing cannot place', () => {
  it('stands it on the doorstep, outside every band', () => {
    selectionsMock.mockReturnValue(
      settled({
        origin: 'commercial',
        selections: [CREDENZA, { ...PAINTWORK, roomId: 'room-archived' }],
      }),
    );

    const { container } = renderThreshold();

    const wall = container.querySelector('#wall');
    expect(wall).not.toBeNull();
    expect(wall?.closest('section[id^="room-"]')).toBeNull();
    expect(container.textContent).toContain('Prairie Coat Painting');
  });

  it('stands every wall on the doorstep of a house with no rooms', () => {
    roomsMock.mockReturnValue(settled([]));

    const { container } = renderThreshold();

    expect(screen.getByTestId('ground-floor')).toBeInTheDocument();
    expect(container.querySelector('#wall')).not.toBeNull();
    expect(container.querySelector('#door')).not.toBeNull();
  });
});

/* ── The note's enclosures and the doorstep's one line of history ────────── */

describe('Threshold — enclosures and history', () => {
  it('keeps a signed enclosure in the letter, pointing at Previously', () => {
    notesMock.mockReturnValue(
      settled([{ ...NOTE, enclosures: [{ kind: 'proposal' as const, id: 'prop-1' }] }]),
    );

    const enclosures = renderThreshold().container.querySelector(
      '[data-testid="note-enclosures"]',
    )!;
    expect(enclosures.textContent).toContain('Design services agreement');
    expect(enclosures.querySelector('a')).toHaveAttribute('href', '#previously');
  });

  it('encloses a trade scope by its own name, not by one of its lines', () => {
    notesMock.mockReturnValue(
      settled([{ ...NOTE, enclosures: [{ kind: 'trade_scope' as const, id: 'prop-paint' }] }]),
    );
    renderThreshold();

    expect(screen.getByTestId('note-enclosures')).toHaveTextContent('Paintwork scope');
    expect(screen.getByTestId('note-enclosures')).not.toHaveTextContent('The paintwork');
  });

  it('prints an instrument on the doorstep’s Previously line, never a note body', () => {
    notesMock.mockReturnValue(
      settled([
        NOTE,
        {
          ...NOTE,
          id: 'note-old',
          body: 'A very long line that would run right off the doorstep if it were printed there.',
          state: 'retired' as const,
          retiredAt: '2026-08-02T09:00:00Z',
        },
      ]),
    );

    renderThreshold();

    const line = screen.getByTestId('doorstep-previously');
    expect(line).toHaveTextContent('Design services agreement');
    expect(line).not.toHaveTextContent('run right off the doorstep');
  });
});

/* ── The door that opened on her name ───────────────────────────────────────
   W3-01 / W3-02. Signing takes the paper out of the open papers, and the
   refetch that follows used to end the whole door section about half a second
   after the leaf swung — taking P-19's sentence and the delivery recovery with
   it, to nowhere. The page keeps the mark now, so the receipt is a plate that
   stands, not a frame that flickers. ─────────────────────────────────────── */

describe('Threshold — the door that opened on her name', () => {
  /** The same paper, as the refetch after a signature returns it. */
  const SIGNED_AUTHORIZATION = {
    ...AUTHORIZATION,
    commercial_state: 'executed',
    status: 'accepted',
    signed_at: '2026-08-06',
    updated_at: '2026-08-06',
  } as unknown as Proposal;

  const theDoor = () =>
    document.querySelector('[data-threshold-unit="door"]') as HTMLElement;

  function drawHouse() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const tree = () => (
      <QueryClientProvider client={client}>
        <Threshold projectId={PROJECT_ID} project={PROJECT} milestones={MILESTONES} />
      </QueryClientProvider>
    );
    const view = render(tree());
    return { redraw: () => view.rerender(tree()) };
  }

  /** Type the name, tick the line, hold the act out (P-18). */
  async function signTheDoor() {
    fireEvent.change(within(theDoor()).getByLabelText('Type your full name'), {
      target: { value: 'Harper Vale' },
    });
    fireEvent.click(within(theDoor()).getByRole('checkbox'));
    const held = within(theDoor()).getByRole('button', { name: /^Sign/ });
    jest.useFakeTimers();
    fireEvent.pointerDown(held, { clientX: 4, clientY: 4 });
    act(() => {
      jest.advanceTimersByTime(HOLD_MS);
    });
    jest.useRealTimers();
    await act(async () => {
      fireEvent.pointerUp(held);
    });
  }

  beforeEach(() => {
    // Reduced motion: the leaf goes at once, so the refetch is released on the
    // same tick the signature lands — the tightest version of the race.
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })) as unknown as typeof window.matchMedia;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        projectId: PROJECT_ID,
        notificationDelivery: { state: 'pending_retry' },
      }),
    }) as unknown as typeof fetch;
  });

  it('leaves the receipt and the delivery recovery standing after the paper is gone', async () => {
    const { redraw } = drawHouse();
    await signTheDoor();

    expect(within(theDoor()).getByTestId('door-receipt')).toHaveTextContent(
      'Quist Interiors has your signature. You’ll have a copy.',
    );

    // The refetch: the paper is no longer one of the papers waiting for her.
    proposalsMock.mockReturnValue(settled([SIGNED_AUTHORIZATION, SIGNED_AGREEMENT]));
    redraw();

    // The record has it now — which is exactly what used to end the section.
    await waitFor(() =>
      expect(document.querySelector('#previously')).toHaveTextContent(
        'Furnishings authorization',
      ),
    );
    expect(theDoor()).not.toBeNull();
    expect(within(theDoor()).getByTestId('door-receipt')).toHaveTextContent(
      'has your signature',
    );
    expect(within(theDoor()).getByTestId('door-delivery-pending')).toHaveTextContent(
      'confirmation delivery is still pending',
    );
    // The leaf is gone — the plate is what stands, not the act.
    expect(within(theDoor()).queryByTestId('door-leaf')).not.toBeInTheDocument();
  });

  it('stops counting a signed door among the papers still asking', async () => {
    const { redraw } = drawHouse();
    await signTheDoor();
    proposalsMock.mockReturnValue(settled([SIGNED_AUTHORIZATION, SIGNED_AGREEMENT]));
    redraw();

    const mat = screen.getByTestId('mat-papers');
    const listed = within(mat).getAllByText(/Furnishings authorization No\. 7/);
    expect(listed).toHaveLength(1);
    expect(listed[0].closest('a')).toHaveAttribute('href', '#previously');
  });
});

/* ── The post, where the page files it ──────────────────────────────────────
   The seam these assert is the CALL SITE's, not the component's: a React
   element is truthy even when it renders nothing, so only the page can decide
   whether Previously has back matter and where the reply belongs. ────────── */

describe('Threshold — the post', () => {
  const LETTER = {
    id: 'm-1',
    body: 'The sconces ship Friday.',
    from: 'studio' as const,
    authorName: 'Nora Quist',
    sentAt: new Date(2026, 7, 4, 9, 0, 0),
    enclosures: [],
  };

  function post(over: Record<string, unknown> = {}) {
    correspondenceMock.mockReturnValue({
      threadId: null,
      muted: false,
      letters: [],
      notices: [],
      hasEarlierLetters: false,
      readEarlierLetters: jest.fn(),
      isReadingEarlierLetters: false,
      unreadNoticeIds: [],
      sentAts: [],
      isPending: false,
      ...over,
    });
  }

  it('keeps Previously silent when there is neither back matter nor post', () => {
    proposalsMock.mockReturnValue(settled([]));
    notesMock.mockReturnValue(settled([]));
    post();

    const { container } = renderThreshold();
    expect(container.querySelector('#previously')).toBeNull();
  });

  it('files the letters in Previously when there are any', () => {
    post({ threadId: 'thr-1', letters: [LETTER] });
    renderThreshold();
    expect(screen.getByTestId('previously-correspondence')).toHaveTextContent(
      'The sconces ship Friday.',
    );
  });

  it('keeps the reply under the note while one is standing', () => {
    post({ threadId: 'thr-1', letters: [LETTER] });
    renderThreshold();

    const note = screen.getByTestId('write-back').closest('#note');
    expect(note).not.toBeNull();
  });

  it('heads the record with the reply when no note is standing', () => {
    notesMock.mockReturnValue(settled([]));
    post({ threadId: 'thr-1', letters: [LETTER] });

    const { container } = renderThreshold();
    expect(container.querySelector('#note')).toBeNull();
    expect(screen.getByTestId('write-back').closest('#previously')).not.toBeNull();
  });

  it('marks this house’s thread and its own unread notices read, once', () => {
    const markLetters = jest.fn();
    const markNotices = jest.fn();
    markLettersReadMock.mockReturnValue(markLetters);
    markNoticesReadMock.mockReturnValue(markNotices);
    post({ threadId: 'thr-1', letters: [LETTER], unreadNoticeIds: ['n-1', 'n-2'] });

    renderThreshold();

    expect(markLetters).toHaveBeenCalledTimes(1);
    expect(markLetters).toHaveBeenCalledWith('thr-1');
    expect(markNotices).toHaveBeenCalledTimes(1);
    expect(markNotices).toHaveBeenCalledWith(['n-1', 'n-2']);
  });

  it('marks nothing read while the post is still arriving', () => {
    const markLetters = jest.fn();
    const markNotices = jest.fn();
    markLettersReadMock.mockReturnValue(markLetters);
    markNoticesReadMock.mockReturnValue(markNotices);
    post({ threadId: 'thr-1', unreadNoticeIds: ['n-1'], isPending: true });

    renderThreshold();

    expect(markLetters).not.toHaveBeenCalled();
    expect(markNotices).not.toHaveBeenCalled();
  });
});

/* ── The RPC's own shape ────────────────────────────────────────────────────
   `updatedAt` reaches the page through `adaptClientSelections`, so the test
   feeds a RAW row the way 00565's get_client_project_selections emits it —
   not a pre-shaped ClientSelection — and asserts the tick lands. ─────────── */

describe('Threshold — updatedAt off the raw payload', () => {
  it('ticks a band from a timestamp the adapter read out of the RPC row', () => {
    previousMarkMock.mockReturnValue({
      data: '2026-08-03T00:00:00Z',
      isPending: false,
      isError: false,
    });
    selectionsMock.mockReturnValue(
      settled(
        adaptClientSelections({
          origin: 'commercial',
          selections: [
            {
              id: 'sel-credenza',
              kind: 'furnishings',
              name: 'Walnut credenza',
              roomId: LIBRARY,
              roomName: 'Library & lounge',
              quantity: 1,
              clientUnitPriceCents: 840000,
              clientLineTotalCents: 840000,
              itemType: 'furniture',
              logisticsStatus: 'in_production',
              tradeJourney: null,
              allowance: null,
              instrument: {
                documentId: 'doc-7',
                proposalId: 'prop-7',
                name: 'Furnishings authorization No. 7',
                executedAt: null,
              },
              productId: null,
              imageUrl: null,
              docCode: 'FA-7',
              updatedAt: '2026-08-04T12:00:00Z',
            },
          ],
        }),
      ),
    );

    const { container } = renderThreshold();

    fireEvent.click(screen.getByRole('button', { name: /what changed since yesterday/i }));

    expect(container.querySelector(`#room-${LIBRARY}`)).toHaveAttribute('data-changed', 'true');
    expect(container.querySelector(`#room-${ENTRY}`)).not.toHaveAttribute('data-changed');
  });
});

describe('Threshold — L6, the review and scope-change asks mounted in place', () => {
  it('stands the studio review request on the doorstep, naming this project', () => {
    pendingReviewMock.mockReturnValue({
      data: [
        {
          id: 'rev-1',
          request_status: 'sent',
          project: { id: PROJECT_ID, name: 'Vale Residence' },
          designer: { full_name: 'Nora Quist', business_name: null, avatar_url: null },
          custom_message: null,
        },
      ],
      isLoading: false,
      isPending: false,
    });

    renderThreshold();

    expect(screen.getByTestId('studio-review-ask')).toHaveAttribute('id', 'review-rev-1');
  });

  it('stands a studio-sent scope change on the doorstep, not inside a band', () => {
    scopeChangesMock.mockReturnValue({
      data: [
        {
          id: 'sc-1',
          title: 'Add a runner to the stair hall',
          description: 'A runner underfoot in the stair hall.',
          status: 'sent',
          request_origin: 'designer_amendment',
          additional_ffe_budget_cents: 0,
          additional_design_fee_cents: 0,
          timeline_impact_weeks: 0,
          new_total_budget_cents: 0,
        },
      ],
      isLoading: false,
      isPending: false,
    });

    const { container } = renderThreshold();

    const ask = container.querySelector('#scope-change-sc-1');
    expect(ask).not.toBeNull();
    expect(ask?.closest('section[id^="room-"]')).toBeNull();
  });

  it('offers "Ask for a change" on the mat', () => {
    renderThreshold();

    expect(within(screen.getByTestId('mat')).getByText('Ask for a change')).toBeInTheDocument();
  });

  it('offers "Ask for a change" inside a room band, naming the room', () => {
    renderThreshold();

    const band = document.querySelector(`#room-${LIBRARY}`);
    expect(band).not.toBeNull();
    expect(within(band as HTMLElement).getByText(/Ask for a change in/)).toBeInTheDocument();
  });

  // Finding #10 — the settle gate must hold the whole house, asks included,
  // while any of the three ask queries this file mocks is still in flight,
  // not just the sources `loading` already covered.
  it('holds the house while a pending scope-change is still in flight', () => {
    scopeChangesMock.mockReturnValue(IN_FLIGHT);
    renderThreshold();

    expect(screen.getByTestId('threshold-hold')).toBeInTheDocument();
    expect(screen.getByTestId('doorstep-sentence-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('mat')).not.toBeInTheDocument();
  });

  // Finding #27 — SubmittedReviewsPrevious and SelectionEditionAsk were
  // mounted into threshold.tsx with no test exercising either mount point.
  it('lines a submitted review up in Previously', () => {
    submittedReviewMock.mockReturnValue({
      data: [
        {
          id: 's1',
          project: { id: PROJECT_ID },
          rating: 5,
          review_text: null,
          created_at: '2026-08-01T00:00:00Z',
        },
      ],
      isLoading: false,
      isPending: false,
    });

    renderThreshold();

    expect(screen.getByTestId('submitted-reviews-previously')).toBeInTheDocument();
  });

  it('mounts the selection-edition ask off ?review= on the URL', () => {
    window.history.pushState({}, '', `/projects/${PROJECT_ID}?review=ed-1`);
    reviewBundleMock.mockReturnValue({
      data: {
        projectId: PROJECT_ID,
        editionId: 'ed-1',
        publishedAt: null,
        status: 'published',
        items: [
          {
            id: 'item-1',
            name: 'Wingback chair',
            roomName: 'Library',
            imageUrl: null,
            clientPriceCents: null,
            currency: 'USD',
            verdict: null,
            comment: null,
            mediaAssetIds: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    renderThreshold();

    expect(screen.getByTestId('review-edition-ask')).toBeInTheDocument();
    window.history.pushState({}, '', `/projects/${PROJECT_ID}`);
  });
});

describe('the settle gate — a query that cannot answer may not hold the house', () => {
  // A DISABLED TanStack v5 query reports `status: 'pending'` for as long as it
  // is mounted: it never runs, so it never resolves. Reading `isPending`
  // straight off one puts the whole page behind a query that will not answer.
  it('opens the house while a disabled query reports pending forever', () => {
    authMock.mockReturnValue({ user: undefined, signOut: jest.fn() });
    // `useMyPendingReviewRequests` / `useMySubmittedReviews` are
    // `enabled: !!clientUserId` — with no user they are disabled, and this is
    // exactly what they report.
    pendingReviewMock.mockReturnValue({ data: undefined, isLoading: true, isPending: true });
    submittedReviewMock.mockReturnValue({ data: undefined, isLoading: true, isPending: true });

    renderThreshold();

    expect(screen.queryByTestId('threshold-hold')).not.toBeInTheDocument();
    expect(document.querySelector('#doorstep')).toBeInTheDocument();
  });

  it('does not hold on the edition bundle when no ?review= link came', () => {
    reviewBundleMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isPending: true,
      isError: false,
    });

    renderThreshold();

    expect(screen.queryByTestId('threshold-hold')).not.toBeInTheDocument();
  });

  it('still holds while a query that CAN answer has not', () => {
    // The control: an enabled query that is genuinely in flight holds, or the
    // gate would prove nothing.
    invoicesMock.mockReturnValue({
      data: undefined,
      isPending: true,
      isLoading: true,
      isError: false,
    });

    renderThreshold();

    expect(screen.getByTestId('threshold-hold')).toBeInTheDocument();
  });
});

describe('the reply, when the record is empty', () => {
  it('stands the reply on its own line rather than heading an empty Previously', () => {
    correspondenceMock.mockReturnValue({
      threadId: 'thread-1',
      muted: false,
      letters: [],
      notices: [],
      hasEarlierLetters: false,
      readEarlierLetters: jest.fn(),
      isReadingEarlierLetters: false,
      unreadNoticeIds: [],
      sentAts: [],
      isPending: false,
    });
    notesMock.mockReturnValue(settled([]));

    renderThreshold();

    const reply = screen.getByTestId('standing-reply');
    expect(reply).toBeInTheDocument();
    // Not inside Previously: a record with nothing previous in it may not be
    // opened just to carry the reply.
    expect(document.querySelector('#previously')?.contains(reply) ?? false).toBe(false);
    expect(document.querySelector('#previously')).not.toHaveTextContent('Write back');
  });
});


/* ── The studio's own letters ────────────────────────────────────────────────
   An invoice drawn against no house belongs to the relationship, not to a
   project. It stands in exactly ONE of the client's houses — the adopted one,
   the lowest project id she can open — so the same letter is never read twice
   and never settled twice. `proj-vale` sorts after `proj-ash`, so the house
   this suite stands in adopts them only while it is alone.
   ────────────────────────────────────────────────────────────────────────── */

describe("Threshold — the studio's own letters", () => {
  it('stands a studio letter in the letterbox of the adopted house', () => {
    clientInvoicesMock.mockReturnValue(settled([STUDIO_INVOICE]));

    renderThreshold();

    expect(screen.getByTestId('letterbox-from-studio')).toHaveTextContent(
      'From the studio · not for a house',
    );
    expect(screen.getByTestId('letterbox-regarding')).toHaveTextContent(
      'Design consultation · 12 September 2026',
    );
    expect(screen.getByTestId('letterbox-body')).toHaveTextContent('Invoice No. 31');
  });

  it("keeps this house's own letter behind the studio's, not instead of it", () => {
    clientInvoicesMock.mockReturnValue(settled([STUDIO_INVOICE]));

    renderThreshold();

    fireEvent.click(screen.getByRole('button', { name: 'Earlier invoices' }));
    expect(screen.getByText(/Invoice No\. 4/)).toBeInTheDocument();
  });

  // The adopted house belongs to one studio; the letter standing in its
  // letterbox may have been drawn by another. The plate is the HOUSE's and the
  // payee is the LETTER's, and neither may borrow the other's studio.
  it("makes the check out to the letter's studio while the plate keeps the house's", async () => {
    paymentOptionsMock.mockReturnValue({
      isPending: false,
      data: { card_surcharge_bps: 300, check_remit_to: null },
    });
    startCheckoutMock.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    notifyCheckIntentMock.mockReturnValue({ mutateAsync: jest.fn() });
    identityMock.mockImplementation(({ studioId }: { studioId: string | null }) =>
      settled({
        name: studioId === 'studio-ash' ? 'The Ash Studio' : 'Quist Interiors',
        source: 'studio',
      }),
    );
    clientInvoicesMock.mockReturnValue(
      settled([{ ...STUDIO_INVOICE, studio_id: 'studio-ash' }]),
    );

    renderThreshold();

    expect(screen.getByTestId('doorplate-line')).toHaveTextContent('Quist Interiors');

    fireEvent.click(screen.getByRole('button', { name: /open the letterbox/i }));
    fireEvent.click(screen.getByRole('radio', { name: /check/i }));

    expect(
      await screen.findByRole('button', {
        name: 'Let The Ash Studio know a check is coming',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Let Quist Interiors know/ }),
    ).not.toBeInTheDocument();
  });

  it('leaves the studio letters out of a house that has not adopted them', () => {
    clientInvoicesMock.mockReturnValue(settled([STUDIO_INVOICE]));

    renderThreshold(MILESTONES, [{ id: 'proj-ash', name: 'The Ash cottage' }]);

    expect(screen.queryByTestId('letterbox-from-studio')).not.toBeInTheDocument();
    expect(screen.getByTestId('letterbox-body')).toHaveTextContent('Invoice No. 4');
  });

  // The letter is summed into this house's owed figure because it stands in
  // this house's letterbox. The row has to say which of that money was never
  // drawn against the house at all.
  it('discloses the studio letter on the owed row it is summed into', () => {
    clientInvoicesMock.mockReturnValue(settled([STUDIO_INVOICE]));

    renderThreshold();

    expect(screen.getByTestId('house-ledger-owed')).toHaveTextContent(
      'Owed across two open invoices, one from the studio',
    );
  });

  it('leaves the owed row alone in a house that has not adopted them', () => {
    clientInvoicesMock.mockReturnValue(settled([STUDIO_INVOICE]));

    renderThreshold(MILESTONES, [{ id: 'proj-ash', name: 'The Ash cottage' }]);

    const row = screen.getByTestId('house-ledger-owed');
    expect(row).toHaveTextContent('Owed on the open invoice');
    expect(row).not.toHaveTextContent('studio');
  });

  it('never mistakes a house invoice for a studio one', () => {
    clientInvoicesMock.mockReturnValue(settled([{ ...INVOICE, project_id: 'proj-other' }]));

    renderThreshold();

    expect(screen.queryByTestId('letterbox-from-studio')).not.toBeInTheDocument();
    expect(screen.getByTestId('letterbox-body')).toHaveTextContent('Invoice No. 4');
  });
});

/* ── The front door, when there is no house ──────────────────────────────────
   A household the studio never opened a project for still gets sent money.
   `ProjectsEmptyState` mounts no letterbox, so she would be told she has no
   projects and the return from the till would never be read. ─────────────── */

describe('LetterboxDoor — the letterbox IS the front door', () => {
  const originalLocation = window.location;

  function standAt(search: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { search, href: `https://client.test/${search}`, pathname: '/', hash: '' },
    });
  }

  function renderDoor() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <LetterboxDoor />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    resetCheckoutReturn();
    standAt('');
    jest.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    identityMock.mockReturnValue(settled({ name: 'Middle West Studio', source: 'studio' }));
    paymentOptionsMock.mockReturnValue({ isPending: false, data: { card_surcharge_bps: 300 } });
    startCheckoutMock.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    notifyCheckIntentMock.mockReturnValue({ mutateAsync: jest.fn() });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('stands the studio letterhead and the letter, with nothing above them', () => {
    clientInvoicesMock.mockReturnValue(settled([STUDIO_INVOICE]));

    renderDoor();

    expect(screen.getByTestId('doorplate-title')).toHaveTextContent('Middle West Studio');
    expect(screen.getByText('One letter is waiting for you.')).toBeInTheDocument();
    expect(screen.getByTestId('letterbox-regarding')).toHaveTextContent(
      'Design consultation · 12 September 2026',
    );
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  // 00571 gives `p_studio_id` precedence over both derivations. A designer who
  // belongs to two studios has a primary one, and it is not necessarily the
  // one this letter was drawn for — so the letterhead is asked for by the
  // letter's OWN studio, with the designer only as the fallback leg.
  it('takes the letterhead from the letter’s own studio, not the designer’s primary', () => {
    clientInvoicesMock.mockReturnValue(settled([STUDIO_INVOICE]));

    renderDoor();

    expect(identityMock).toHaveBeenCalledWith({
      studioId: 'studio-1',
      designerId: 'designer-nora',
    });
  });

  it('reads the return from the till, which the empty state never could', () => {
    standAt('?checkout=success&invoice=inv-31');
    clientInvoicesMock.mockReturnValue(
      settled([{ ...STUDIO_INVOICE, status: 'paid', amount_paid_cents: 45_000 }]),
    );

    renderDoor();

    expect(screen.getByTestId('letterbox-receipt')).toHaveTextContent('Payment confirmed');
  });

  it('meets a household with no letter with the empty state, not an empty letterbox', () => {
    clientInvoicesMock.mockReturnValue(settled([]));

    renderDoor();

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('letterbox')).not.toBeInTheDocument();
  });

  it('never opens the door on a house invoice, or on a draft', () => {
    clientInvoicesMock.mockReturnValue(
      settled([
        { ...INVOICE, project_id: 'proj-vale' },
        { ...STUDIO_INVOICE, id: 'inv-32', status: 'draft' },
      ]),
    );

    renderDoor();

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  /* A household can hold letters from two studios at once — two designers, or
     one designer's two studios. The plate names a studio and the slot holds a
     letter; if they are resolved from different rows the plate signs another
     studio's name over this studio's money. */

  it('names the studio of the letter in the slot, not the newest letter’s', () => {
    identityMock.mockImplementation(({ studioId }: { studioId: string | null }) =>
      settled({
        name: studioId === 'studio-ash' ? 'The Ash Studio' : 'Middle West Studio',
        source: 'studio',
      }),
    );
    // Settled first in the list (the hook orders by created_at desc) and from
    // another studio; nothing is owed on it, so it is not the letter standing
    // in the slot.
    clientInvoicesMock.mockReturnValue(
      settled([
        {
          ...STUDIO_INVOICE,
          id: 'inv-30',
          studio_id: 'studio-ash',
          status: 'paid',
          amount_paid_cents: 45_000,
        },
        STUDIO_INVOICE,
      ]),
    );

    renderDoor();

    expect(identityMock).toHaveBeenCalledWith({
      studioId: 'studio-1',
      designerId: 'designer-nora',
    });
    expect(identityMock).not.toHaveBeenCalledWith({
      studioId: 'studio-ash',
      designerId: 'designer-nora',
    });
    expect(screen.getByTestId('doorplate-title')).toHaveTextContent('Middle West Studio');
  });

  it('follows the letter the address named to that letter’s studio', () => {
    standAt('?invoice=inv-32');
    identityMock.mockImplementation(({ studioId }: { studioId: string | null }) =>
      settled({
        name: studioId === 'studio-ash' ? 'The Ash Studio' : 'Middle West Studio',
        source: 'studio',
      }),
    );
    // `inv-31` is due first, so the slot would hold it unasked; the address
    // asks for the other studio's letter.
    clientInvoicesMock.mockReturnValue(
      settled([
        STUDIO_INVOICE,
        {
          ...STUDIO_INVOICE,
          id: 'inv-32',
          studio_id: 'studio-ash',
          designer_id: 'designer-nora',
          invoice_number: 'Invoice No. 32',
          title: 'Retainer · October',
          due_date: '2026-09-01',
        },
      ]),
    );

    renderDoor();

    expect(identityMock).toHaveBeenCalledWith({
      studioId: 'studio-ash',
      designerId: 'designer-nora',
    });
    expect(screen.getByTestId('doorplate-title')).toHaveTextContent('The Ash Studio');
    expect(screen.getByTestId('letterbox-regarding')).toHaveTextContent('Retainer · October');
  });

  it('holds rather than showing the empty state while the letters are still coming', () => {
    clientInvoicesMock.mockReturnValue({
      data: undefined,
      isPending: true,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    });

    renderDoor();

    expect(screen.getByTestId('letterbox-door-hold')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });
});

/* ── R30 · The origin agreement reaches the homeowner ────────────────────────
   A design-services agreement is `proposals.project_id NULL` until the studio
   countersigns it — countersigning is what CREATES the project (00331, 00566).
   So the first paper a household is ever sent arrives before it has a house,
   and the front door was project-scoped: she met "no active projects yet" over
   a signature the studio was waiting on. The door reads it through the same
   client-scoped reads the house uses, and hangs the SAME DoorGate. ───────── */

describe('LetterboxDoor — the origin agreement, before there is a house', () => {
  const originalLocation = window.location;

  /** Sent, pending, and bound to no project — `list_client_proposals` strips
   *  the key entirely (jsonb_strip_nulls), so the fixture omits it too. */
  const ORIGIN_AGREEMENT = {
    id: 'prop-origin',
    title: 'Design services agreement',
    designer_id: 'designer-nora',
    document_kind: 'design_services',
    commercial_state: 'sent',
    status: 'sent',
    total_amount: 1_200_000,
    sent_at: '2026-09-04',
    updated_at: '2026-09-04',
    version: 1,
  } as unknown as Proposal;

  const SECOND_ORIGIN = {
    ...ORIGIN_AGREEMENT,
    id: 'prop-origin-2',
    title: 'Consultation agreement',
  } as unknown as Proposal;

  /** The same paper the moment the studio countersigns: the project now
   *  exists, and `list_client_proposals` coalesces its binding into project_id. */
  const COUNTERSIGNED = {
    ...ORIGIN_AGREEMENT,
    project_id: PROJECT_ID,
    commercial_state: 'executed',
    status: 'accepted',
  } as unknown as Proposal;

  const theDoor = () =>
    document.querySelector('[data-threshold-unit="door"]') as HTMLElement;

  function renderDoor(namedProposalId: string | null = null) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const tree = () => (
      <QueryClientProvider client={client}>
        <LetterboxDoor namedProposalId={namedProposalId} />
      </QueryClientProvider>
    );
    const view = render(tree());
    return { redraw: () => view.rerender(tree()) };
  }

  beforeEach(() => {
    resetCheckoutReturn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { search: '', href: 'https://client.test/', pathname: '/', hash: '' },
    });
    jest.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    identityMock.mockReturnValue(settled({ name: 'Middle West Studio', source: 'studio' }));
    clientInvoicesMock.mockReturnValue(settled([]));
    proposalsMock.mockReturnValue(settled([ORIGIN_AGREEMENT]));
    bundles = { 'prop-origin': { document: { kind: 'design_services' } } };
    bundles['prop-origin-2'] = { document: { kind: 'design_services' } };
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })) as unknown as typeof window.matchMedia;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projectId: null, notificationDelivery: { state: 'delivered' } }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('stands the agreement at #door, with the plate off its own studio', () => {
    renderDoor();

    expect(identityMock).toHaveBeenCalledWith({
      studioId: null,
      designerId: 'designer-nora',
    });
    expect(screen.getByTestId('doorplate-title')).toHaveTextContent('Middle West Studio');
    expect(screen.getByText('One agreement is waiting for you.')).toBeInTheDocument();
    expect(theDoor()).toHaveAttribute('id', 'door');
    expect(
      within(theDoor()).getByRole('heading', { name: 'Design services agreement' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  // The signature line and the consent are the whole point: a door that draws
  // the paper but cannot take her name is the same dead end by another route.
  it('offers the same signature line and consent a project-bound agreement gets', () => {
    renderDoor();

    expect(within(theDoor()).getByLabelText('Type your full name')).toBeInTheDocument();
    const consent = within(theDoor()).getByRole('checkbox');
    expect(consent).toBeInTheDocument();
    expect(
      within(theDoor()).getByText(
        'I agree to these design-services terms and understand my signature alone does not authorize work until the studio countersigns.',
      ),
    ).toBeInTheDocument();
    expect(
      within(theDoor()).getByRole('button', { name: /^Sign and accept/ }),
    ).toBeInTheDocument();
  });

  it('signs end to end and keeps the receipt after the paper leaves the list', async () => {
    const { redraw } = renderDoor();

    fireEvent.change(within(theDoor()).getByLabelText('Type your full name'), {
      target: { value: 'Harper Vale' },
    });
    fireEvent.click(within(theDoor()).getByRole('checkbox'));
    const held = within(theDoor()).getByRole('button', { name: /^Sign/ });
    jest.useFakeTimers();
    fireEvent.pointerDown(held, { clientX: 4, clientY: 4 });
    act(() => {
      jest.advanceTimersByTime(HOLD_MS);
    });
    jest.useRealTimers();
    await act(async () => {
      fireEvent.pointerUp(held);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/proposals/prop-origin/sign',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(within(theDoor()).getByTestId('door-receipt')).toHaveTextContent(
      'Middle West Studio has your signature.',
    );

    // The invalidation refetches this very list, and a client-signed paper is
    // no longer pending. The door has to survive its own success.
    proposalsMock.mockReturnValue(
      settled([{ ...ORIGIN_AGREEMENT, commercial_state: 'client_signed' } as unknown as Proposal]),
    );
    redraw();

    expect(theDoor()).not.toBeNull();
    expect(within(theDoor()).getByTestId('door-receipt')).toHaveTextContent(
      'has your signature',
    );
    expect(screen.getByTestId('doorplate-title')).toHaveTextContent('Middle West Studio');
    // R30-11. Nothing IS waiting — but the sentence may not be printed
    // directly over a door that carries her signature and the studio's
    // receipt for it; there it reads as though the ceremony had not happened.
    // It steps aside while the sealed door stands.
    expect(screen.queryByText('Nothing is waiting for you.')).not.toBeInTheDocument();
    // R30-10, recorded rather than removed: on this one render the paper
    // stands twice — the sealed door with its receipt, and the record it has
    // just become. `threshold.tsx` keeps `sealedDoors` alongside the receipts
    // it derives from `accepted` in exactly this way, so this is the house's
    // own idiom and not a double render. The next visit settles to the line
    // alone (the test below).
    expect(screen.getByTestId('previously-line')).toBeInTheDocument();
  });

  /* ── WAVE 3 · THE TURNKEY PRIME IS AN ORIGIN AGREEMENT TOO ───────────────
     `proposals.project_id` is NULL on a design-build prime through her
     signature — the project is minted at countersignature (walk steps 12 and
     15) — so it arrives at a household with no house exactly as a
     design-services agreement does. Left out of `ORIGIN_DOCUMENT_KINDS` it
     would have been drawn by no door at all: the household's very first
     paper, priced at $84,134, reachable from nowhere. This is the R30 defect
     on the largest paper in the program, and E2E-2 (which mints a
     project-less turnkey agreement and opens `/#door`) cannot pass without
     these two cases holding. ─────────────────────────────────────────────── */
  const TURNKEY_ORIGIN = {
    ...ORIGIN_AGREEMENT,
    id: 'prop-turnkey',
    title: 'Halvorsen kitchen and mudroom',
    document_kind: 'design_build',
    total_amount: 8_413_400,
  } as unknown as Proposal;

  it('stands a turnkey prime at the door, in its own words', () => {
    proposalsMock.mockReturnValue(settled([TURNKEY_ORIGIN]));
    bundles['prop-turnkey'] = { document: { kind: 'design_build' } };

    renderDoor();

    expect(screen.getByText('One agreement is waiting for you.')).toBeInTheDocument();
    expect(
      within(theDoor()).getByRole('heading', { name: 'Halvorsen kitchen and mudroom' }),
    ).toBeInTheDocument();
    // The turnkey sentence, not the design-services one and not the generic
    // fallback — a missed branch on the signing surface looks exactly like
    // the latter.
    expect(
      within(theDoor()).getByText(
        'I agree to these design-build terms and understand my signature alone does not authorize work until the studio countersigns.',
      ),
    ).toBeInTheDocument();
    expect(within(theDoor()).getByLabelText('Type your full name')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  /* The visit after she signs (walk step 13, amended round 1). The record
     stands, nothing says the agreement is incomplete for want of money, and
     the deposit — project-less exactly as the prime is — is a LETTER in this
     door's own letterbox with its own act. That is the offer's persistent
     half; the post-signature sentence belongs to the moment of signing. */
  it('keeps the signed turnkey record, with the deposit standing as a letter', () => {
    proposalsMock.mockReturnValue(
      settled([
        {
          ...TURNKEY_ORIGIN,
          commercial_state: 'client_signed',
          status: 'accepted',
          updated_at: '2026-09-07',
        } as unknown as Proposal,
      ]),
    );
    bundles['prop-turnkey'] = { document: { kind: 'design_build' } };
    clientInvoicesMock.mockReturnValue(
      settled([{ ...STUDIO_INVOICE, id: 'inv-deposit', title: 'Deposit at signing' }]),
    );

    renderDoor();

    const line = screen.getByTestId('previously-line');
    expect(line).toHaveTextContent('Design-build agreement · Halvorsen kitchen and mudroom');
    expect(within(line).getByTestId('previously-state')).toHaveTextContent('SIGNED');
    expect(screen.getByTestId('letterbox')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    // Nothing on the page holds the record behind the money.
    expect(screen.queryByText(/payment required/i)).not.toBeInTheDocument();
  });

  // Countersigning creates the project, so `/` opens the house from that point
  // on. What this door must never do is keep drawing the paper the house has
  // taken over — the same agreement, twice, on two surfaces.
  it('drops the agreement the moment countersigning binds it to a house', () => {
    proposalsMock.mockReturnValue(settled([COUNTERSIGNED]));

    renderDoor();

    expect(document.querySelector('[data-threshold-unit="door"]')).toBeNull();
    // The record goes with the paper: the house keeps both from here on.
    expect(screen.queryByTestId('previously-line')).not.toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('gives #door to the agreement the address named, not the first in the list', () => {
    proposalsMock.mockReturnValue(settled([ORIGIN_AGREEMENT, SECOND_ORIGIN]));

    renderDoor('prop-origin-2');

    expect(screen.getByText('Two agreements are waiting for you.')).toBeInTheDocument();
    const anchored = document.querySelector('#door') as HTMLElement;
    expect(
      within(anchored).getByRole('heading', { name: 'Consultation agreement' }),
    ).toBeInTheDocument();
  });

  it('stands the letter and the agreement together, under one plate', () => {
    clientInvoicesMock.mockReturnValue(settled([STUDIO_INVOICE]));

    renderDoor();

    expect(screen.getAllByTestId('doorplate-title')).toHaveLength(1);
    expect(
      screen.getByText('One agreement is waiting for you. One letter is waiting for you.'),
    ).toBeInTheDocument();
    expect(theDoor()).not.toBeNull();
    expect(screen.getByTestId('letterbox-regarding')).toBeInTheDocument();
  });

  /* R30 round-2 amendment: the studio invoice "renders beside the origin
     agreement, never blank behind it". The papers are a SECOND read, and
     holding an already-drawable letter for it puts a blank page over a money
     surface for as long as `list_client_proposals` takes —
     `useClientSafeProposals` sets no retry, so a failing read is three tries
     and their backoff. An agreement arriving beside a letter only adds a
     sentence; it can never take the letter away. */
  it('draws the letter while the papers are still coming, never blank behind them', () => {
    clientInvoicesMock.mockReturnValue(settled([STUDIO_INVOICE]));
    proposalsMock.mockReturnValue({
      data: undefined,
      isPending: true,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    });

    renderDoor();

    expect(screen.queryByTestId('letterbox-door-hold')).not.toBeInTheDocument();
    expect(screen.getByTestId('doorplate-title')).toHaveTextContent('Middle West Studio');
    expect(screen.getByText('One letter is waiting for you.')).toBeInTheDocument();
    expect(screen.getByTestId('letterbox-regarding')).toBeInTheDocument();
  });

  // An addendum amends a standing engagement, so it always has a house to be
  // read in; it is out of R30's scope by ruling and must not surface here.
  it('never opens on an addendum, or on a paper still in draft', () => {
    proposalsMock.mockReturnValue(
      settled([
        { ...ORIGIN_AGREEMENT, id: 'prop-add', document_kind: 'service_addendum' } as unknown as Proposal,
        { ...ORIGIN_AGREEMENT, id: 'prop-draft', commercial_state: 'draft', status: 'draft' } as unknown as Proposal,
      ]),
    );

    renderDoor();

    expect(document.querySelector('[data-threshold-unit="door"]')).toBeNull();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('holds rather than saying nothing is waiting while the papers are coming', () => {
    proposalsMock.mockReturnValue({
      data: undefined,
      isPending: true,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    });

    renderDoor();

    expect(screen.getByTestId('letterbox-door-hold')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  /* ── THE ORIGIN DOOR CAN ASK ITS STUDIO A QUESTION (R30 · N1) ─────────────
     The acts row withholds "Ask a question" when there is no thread to ask in,
     and an origin agreement has no project — so the household's first paper
     was the one door in the house offering three acts where every other door
     offers four. It has a studio; it simply had not been handed one. ────── */
  it('hands the acts the studio to ask, in place of the project it has not got', () => {
    renderDoor();

    const acts = screen.getByTestId('door-acts-stub');
    expect(acts).toHaveAttribute('data-project-id', '');
    expect(acts).toHaveAttribute('data-studio-profile-id', 'designer-nora');
  });

  /* ── WHEN THE PAPERS CANNOT BE READ (R30 · N2) ────────────────────────────
     `useClientSafeProposals` sets no `retry`, so it inherits the app's
     `retry: 2` and, after the third failure, settles with `isPending` false
     and no data. The hold above covers the PENDING window; this covers the
     FAILED one — where `origins` and `kept` are empty for a reason that has
     nothing to do with what she owns, and the empty state would tell her she
     has no projects over the very agreement this door exists to reach. ──── */
  function failedPapers() {
    return {
      data: undefined,
      isPending: false,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    };
  }

  it('says it could not draw the papers rather than saying she has none', () => {
    proposalsMock.mockReturnValue(failedPapers());

    renderDoor();

    expect(screen.getByTestId('papers-unread')).toHaveTextContent(
      'Your papers could not be drawn just now. Nothing on them has changed.',
    );
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing is waiting for you.')).not.toBeInTheDocument();
  });

  it('offers the read again, and asks for it', () => {
    const query = failedPapers();
    proposalsMock.mockReturnValue(query);

    renderDoor();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  /* A letter standing in the slot draws the page — and the page still has to
     say that it does not know about the papers, rather than let the letter's
     own sentence stand in for an answer it never gave. */
  it('says so beside a letter, without holding the letter back', () => {
    clientInvoicesMock.mockReturnValue(settled([STUDIO_INVOICE]));
    proposalsMock.mockReturnValue(failedPapers());

    renderDoor();

    expect(screen.getByTestId('letterbox-regarding')).toBeInTheDocument();
    expect(screen.getByText('One letter is waiting for you.')).toBeInTheDocument();
    expect(screen.getByTestId('papers-unread')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  it('keeps the empty state for a household that genuinely has nothing', () => {
    proposalsMock.mockReturnValue(settled([]));

    renderDoor();

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('papers-unread')).not.toBeInTheDocument();
  });

  /* Her signature does not create the house — the studio's countersignature
     does, days later. Between the two acts the agreement is `client_signed`
     and STILL bound to no project, and pending is the only thing a door draws.
     Without a record kept here she signs, comes back the next morning, and is
     told she has no projects over the paper she just put her name to. The
     house never does that: an accepted document is a lasting line in
     Previously, and this door keeps its own the same way. */
  it('keeps the signed agreement on the next visit, before the studio countersigns', () => {
    /* The payload `list_client_proposals` actually emits in this window:
       `signed_at` is written only by
       `_countersign_design_services_agreement_impl`, so it is absent (and
       jsonb_strip_nulls drops the key) from her signature until the studio's.
       `_sign_design_services_agreement_authorized` stamps `updated_at` — the
       only date on this row that her own act put there. */
    proposalsMock.mockReturnValue(
      settled([
        {
          ...ORIGIN_AGREEMENT,
          commercial_state: 'client_signed',
          status: 'accepted',
          updated_at: '2026-09-06',
        } as unknown as Proposal,
      ]),
    );

    renderDoor();

    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    expect(screen.getByTestId('doorplate-title')).toHaveTextContent('Middle West Studio');
    const line = screen.getByTestId('previously-line');
    expect(line).toHaveTextContent('Design services agreement · Design services agreement');
    expect(within(line).getByTestId('previously-state')).toHaveTextContent('SIGNED');
    // Dated, not an em dash: the record says when she signed it. The bundle
    // fixture for this paper carries no signatures, so this is the LIST's own
    // answer — the fallback the test below reaches past.
    expect(within(line).getByTestId('previously-date')).toHaveTextContent('6 September');
    // It is a record, not an ask: nothing is waiting for her hand any more,
    // and with no door on the page the sentence that says so is printed.
    expect(document.querySelector('[data-threshold-unit="door"]')).toBeNull();
    expect(screen.getByText('Nothing is waiting for you.')).toBeInTheDocument();
  });

  /* R30 round-2 amendment: the kept record's date reads from the CLIENT'S OWN
     signature row — `commercial_document_signatures.signed_at`, party
     `client` — never from `proposals.signed_at`, which only
     `_countersign_design_services_agreement_impl` writes. The list row cannot
     carry that signature (`list_client_proposals` projects none), so the
     bundle is read for it through the same query options the unfold uses.
     Here the list's own `updated_at` is a DIFFERENT day from the signature, so
     the assertion can only pass off the signature row: `update_proposals_
     updated_at` is an unqualified BEFORE UPDATE trigger, and any future writer
     of the row would silently re-date her signature if the line still read it. */
  it('dates the kept record from her signature row, not the row’s last touch', () => {
    proposalsMock.mockReturnValue(
      settled([
        {
          ...ORIGIN_AGREEMENT,
          commercial_state: 'client_signed',
          status: 'accepted',
          updated_at: '2026-09-11',
        } as unknown as Proposal,
      ]),
    );
    // What the bundle RPC actually returns in this window: one signature, the
    // client's. The studio's does not exist yet — countersigning is what would
    // write it, and it creates the project, which takes the paper off this
    // door altogether.
    bundles['prop-origin'] = {
      document: { kind: 'design_services' },
      signatures: [
        {
          party: 'client',
          signerName: 'Harper Vale',
          signedAt: '2026-09-06T16:02:04.054052+00:00',
          consentVersion: 'v1',
          documentFingerprint: 'f'.repeat(64),
          signedOnPaper: false,
          paperSignedOn: null,
          paperScanDocumentId: null,
        },
      ],
    };

    renderDoor();

    const line = screen.getByTestId('previously-line');
    expect(within(line).getByTestId('previously-date')).toHaveTextContent('6 September');
  });

  /* Two studios reach one household — here, two origin agreements from two of
     them, which the standing sentence already pluralises for. The receipt is
     the sentence that says who holds her signature, so it is read off the
     paper's OWN designer; off the page's plate it would tell her the studio
     she happens to have another paper from now holds her name. */
  it('names each agreement’s own studio on the receipt for its signature', async () => {
    identityMock.mockImplementation(({ designerId }: { designerId: string | null }) =>
      settled({
        name: designerId === 'designer-ash' ? 'The Ash Studio' : 'Middle West Studio',
        source: 'studio',
      }),
    );
    proposalsMock.mockReturnValue(
      settled([
        ORIGIN_AGREEMENT,
        { ...SECOND_ORIGIN, designer_id: 'designer-ash' } as unknown as Proposal,
      ]),
    );

    // The address names the Ash agreement, so that one carries `#door`.
    renderDoor('prop-origin-2');

    // The plate reads the first agreement's studio, as it always has.
    expect(screen.getByTestId('doorplate-title')).toHaveTextContent('Middle West Studio');

    const ashDoor = document.querySelector('#door') as HTMLElement;
    expect(
      within(ashDoor).getByRole('heading', { name: 'Consultation agreement' }),
    ).toBeInTheDocument();

    fireEvent.change(within(ashDoor).getByLabelText('Type your full name'), {
      target: { value: 'Harper Vale' },
    });
    fireEvent.click(within(ashDoor).getByRole('checkbox'));
    const held = within(ashDoor).getByRole('button', { name: /^Sign/ });
    jest.useFakeTimers();
    fireEvent.pointerDown(held, { clientX: 4, clientY: 4 });
    act(() => {
      jest.advanceTimersByTime(HOLD_MS);
    });
    jest.useRealTimers();
    await act(async () => {
      fireEvent.pointerUp(held);
    });

    expect(within(ashDoor).getByTestId('door-receipt')).toHaveTextContent(
      'The Ash Studio has your signature.',
    );
  });
});

describe('Threshold — the landmark ledger and the story pole’s sections', () => {
  /** The landmarks as rendered: [label, href]. */
  function landmarks(container: HTMLElement): Array<[string, string | null]> {
    return Array.from(
      container.querySelectorAll('[data-testid="landmark-ledger"] a'),
    ).map((link) => [link.textContent?.trim() ?? '', link.getAttribute('href')]);
  }

  it('strikes the ledger directly under the doorplate, above the doorstep', () => {
    const { container } = renderThreshold();

    const ledger = screen.getByTestId('landmark-ledger');
    const doorplate = container.querySelector('#doorplate')!;
    const doorstep = container.querySelector('#doorstep')!;

    expect(doorplate.compareDocumentPosition(ledger) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(ledger.compareDocumentPosition(doorstep) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('points every landmark at an id that is actually on the page', () => {
    const { container } = renderThreshold();

    const struck = landmarks(container);
    expect(struck.length).toBeGreaterThan(0);
    for (const [, href] of struck) {
      expect(container.querySelector(href!)).not.toBeNull();
    }
  });

  it('sends "What needs you" to the first gate that drew, and keeps the money undimmable', () => {
    const { container } = renderThreshold();

    expect(landmarks(container)).toEqual(
      expect.arrayContaining([
        ['Where we are', '#doorstep'],
        ['What you owe', '#letterbox'],
        ['What needs you', '#wall'],
        ['The papers', '#mat-papers'],
      ]),
    );
    expect(
      container.querySelector('[data-testid="landmark-ledger"] a[href="#letterbox"]'),
    ).toHaveAttribute('data-never-dim');
  });

  it('gives the house holding its place no landmarks at all', () => {
    roomsMock.mockReturnValue({ data: undefined, isPending: true, isLoading: true, isError: false });
    renderThreshold();

    expect(screen.getByTestId('threshold-hold')).toBeInTheDocument();
    expect(screen.queryByTestId('landmark-ledger')).not.toBeInTheDocument();
  });

  it('renames no anchor — the id set the redirect map holds is unchanged', () => {
    const { container } = renderThreshold();

    for (const id of [
      'doorstep',
      'key',
      'letterbox',
      'wall',
      'door',
      'road',
      'note',
      'previously',
      'mat',
      'mat-papers',
      'ledger',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it('sends the pole’s Installation to the first room band, not to the key', () => {
    const { container } = renderThreshold();

    const installation = screen.getByTestId('story-pole-link-ph-5');
    expect(installation).toHaveAttribute('href', `#room-${LIBRARY}`);
    expect(container.querySelector(`#room-${LIBRARY}`)).not.toBeNull();

    for (const link of Array.from(
      container.querySelectorAll('[data-testid="story-pole"] a'),
    )) {
      expect(link.getAttribute('href')).not.toBe('#key');
    }
  });

  it('draws no chapter link at a key a house whose rooms failed never prints', () => {
    roomsMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isLoading: false,
      isError: true,
    });
    const { container } = renderThreshold();

    expect(screen.getByTestId('threshold-rooms-error')).toBeInTheDocument();
    expect(container.querySelector('#key')).toBeNull();

    for (const link of Array.from(
      container.querySelectorAll('[data-testid="story-pole"] a'),
    )) {
      expect(container.querySelector(link.getAttribute('href')!)).not.toBeNull();
    }
  });

  it('gives the caret the money and the ask to land on', () => {
    const observed: string[] = [];
    const original = window.IntersectionObserver;
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      configurable: true,
      value: class {
        unobserve = jest.fn();
        disconnect = jest.fn();
        constructor(_callback: unknown) {}
        observe(node: Element) {
          observed.push(node.id);
        }
      },
    });

    try {
      renderThreshold();
      expect(observed).toContain('letterbox');
      expect(observed).toContain('wall');
      expect(observed).toContain('doorstep');
      expect(observed).toContain('mat');
    } finally {
      Object.defineProperty(window, 'IntersectionObserver', {
        writable: true,
        configurable: true,
        value: original,
      });
    }
  });
});
