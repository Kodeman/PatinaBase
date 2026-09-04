import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { Invoice, ProjectApprovalReview, Proposal } from '@patina/supabase';
import type { ClientProjectOverview, MilestoneDetail } from '@/types/project';
import type { ClientSelection } from '@/lib/commercial-documents';

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

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useProjectInvoices: jest.fn(),
  useClientSafeProposals: jest.fn(),
  useClientSafeProposalBundle: jest.fn(),
  useProjectRooms: jest.fn(),
  useProjectNotes: jest.fn(),
  useProjectNotesRealtime: jest.fn(),
  useProjectParties: jest.fn(),
  useProjectTeamMembers: jest.fn(),
  useStudioIdentity: jest.fn(),
  useMarkProjectRead: jest.fn(),
  usePreviousReadingMark: jest.fn(),
}));

jest.mock('@/hooks/use-commercial-client', () => ({
  __esModule: true,
  useClientSelections: jest.fn(),
  useClientPlan: jest.fn(),
  useClientCommercialDocument: jest.fn(),
  clientCommercialDocumentQueryOptions: jest.fn(),
  useAcceptTradeScope: jest.fn(),
  invalidateSignedCommercialDocument: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/hooks/use-auth', () => ({
  __esModule: true,
  useAuth: jest.fn(),
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  clientEvents: { projectView: jest.fn() },
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
  useMarkProjectRead,
  usePreviousReadingMark,
  useProjectInvoices,
  useProjectNotes,
  useProjectParties,
  useProjectRooms,
  useProjectTeamMembers,
  useStudioIdentity,
  useClientSafeProposals,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import {
  clientCommercialDocumentQueryOptions,
  useAcceptTradeScope,
  useClientCommercialDocument,
  useClientPlan,
  useClientSelections,
} from '@/hooks/use-commercial-client';

import { Threshold } from '../threshold';

const invoicesMock = useProjectInvoices as jest.Mock;
const proposalsMock = useClientSafeProposals as jest.Mock;
const roomsMock = useProjectRooms as jest.Mock;
const notesMock = useProjectNotes as jest.Mock;
const partiesMock = useProjectParties as jest.Mock;
const teamMock = useProjectTeamMembers as jest.Mock;
const identityMock = useStudioIdentity as jest.Mock;
const markReadMock = useMarkProjectRead as jest.Mock;
const previousMarkMock = usePreviousReadingMark as jest.Mock;
const selectionsMock = useClientSelections as jest.Mock;
const planMock = useClientPlan as jest.Mock;
const bundleMock = useClientCommercialDocument as jest.Mock;
const queryOptionsMock = clientCommercialDocumentQueryOptions as jest.Mock;
const acceptMock = useAcceptTradeScope as jest.Mock;
const authMock = useAuth as jest.Mock;

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
  return { data, isPending: false, isLoading: false, isError: false };
}

/**
 * The bundles the RPC would return, keyed by proposal. Both the gates' hook
 * and the ledger's `useQueries` read this one map, so a test changes what the
 * house knows in one place. An id absent from it is a bundle still in flight.
 */
let bundles: Record<string, unknown> = {};

function renderThreshold() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Threshold projectId={PROJECT_ID} project={PROJECT} milestones={MILESTONES} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  authMock.mockReturnValue({ user: { name: 'Harper Vale' }, signOut: jest.fn() });
  proposalsMock.mockReturnValue(settled([AUTHORIZATION, SIGNED_AGREEMENT]));
  selectionsMock.mockReturnValue(
    settled({ origin: 'commercial', selections: [CREDENZA, PAINTWORK] }),
  );
  invoicesMock.mockReturnValue(settled([INVOICE]));
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
  previousMarkMock.mockReturnValue({ data: undefined, isPending: false, isError: false });
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
});

describe('Threshold — which house', () => {
  it('draws the house, in reading order, once the rooms have come back', () => {
    const { container } = renderThreshold();

    const ordered = Array.from(
      container.querySelectorAll(
        '#doorplate, #doorstep, #key, #story-pole, section[id^="room-"], #road, #note, #previously, #mat',
      ),
    ).map((node) => node.id);

    expect(ordered).toEqual([
      'doorplate',
      'doorstep',
      'key',
      'story-pole',
      `room-${LIBRARY}`,
      `room-${ENTRY}`,
      'road',
      'note',
      'previously',
      'mat',
    ]);
    expect(screen.queryByTestId('ground-floor')).not.toBeInTheDocument();
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

  it('gives the first door and the first wall the page-level anchors', () => {
    const { container } = renderThreshold();

    expect(container.querySelectorAll('#door')).toHaveLength(1);
    expect(container.querySelectorAll('#wall')).toHaveLength(1);
  });

  it('prints the standing note once, not twice on a door leaf as well', () => {
    renderThreshold();

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
  completedReviewCount: 0,
  requiredReviewCount: 1,
} as unknown as ProjectApprovalReview;

function renderWithApprovals(approvals: ProjectApprovalReview[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Threshold
        projectId={PROJECT_ID}
        project={PROJECT}
        milestones={MILESTONES}
        projectApprovals={approvals}
      />
    </QueryClientProvider>,
  );
}

describe('Threshold — the doorstep’s own asks', () => {
  it('stands a phase approval on the doorstep, with its own act', () => {
    renderWithApprovals([PHASE_APPROVAL]);

    const gate = screen.getByTestId('doorstep-approval');
    expect(gate).toHaveTextContent('Do the library elevations read right to you?');
    expect(gate).toHaveTextContent('Library elevations · Edition 3 · Due August 20');
    expect(screen.getByRole('link', { name: /respond/i })).toHaveAttribute(
      'href',
      '/decisions/dec-1',
    );
  });

  it('reads a draft approval as a review rather than a response', () => {
    renderWithApprovals([
      { ...PHASE_APPROVAL, lifecycleStatus: 'draft' } as ProjectApprovalReview,
    ]);

    expect(screen.getByTestId('doorstep-approval')).toHaveTextContent(
      'your review is required',
    );
    expect(screen.getByRole('link', { name: /review exact edition/i })).toBeInTheDocument();
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

  it('says nothing about held money while the bundles are unread', () => {
    bundles = {};

    renderThreshold();

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

  it('plans nothing when neither the plan nor the room carries a figure', () => {
    planMock.mockReturnValue(
      settled({ publishedAt: null, rooms: [], lines: [], liveAuthorizedTotalCents: 6140000 }),
    );
    roomsMock.mockReturnValue(settled([{ ...ROOMS[0], budget_cents: 0 }]));

    renderThreshold();

    expect(screen.queryByTestId('house-ledger-top')).not.toBeInTheDocument();
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
