import { fireEvent, render, screen, within } from '@testing-library/react';
import type { FFEStageKey } from '@patina/types';

import type { ClientProjectOverview, MilestoneDetail } from '@/types/project';
import type { ProjectApprovalReview } from '@patina/supabase';

// ── Boundaries ──────────────────────────────────────────────────────────────
// Everything below the surface is a query. Mock the four hooks it composes
// from — not the adapters underneath them — so the assertions are about the
// composition (what renders, in what order, from which hook) and not about
// Supabase. Specifiers match the modules `the-making.tsx` actually imports; a
// near-miss here silently no-ops (patina-testing).

jest.mock('next/link', () => ({
  __esModule: true,
  default: function MockLink({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  } & Record<string, unknown>) {
    return (
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault();
          onClick?.(event);
        }}
        {...rest}
      >
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
}));

jest.mock('@/hooks/use-commercial-client', () => ({
  __esModule: true,
  useClientSelections: jest.fn(),
  useClientCommercialDocument: jest.fn(),
  useAcceptTradeScope: jest.fn(),
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
}));

import { useProjectInvoices, useClientSafeProposals } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import {
  useAcceptTradeScope,
  useClientCommercialDocument,
  useClientSelections,
} from '@/hooks/use-commercial-client';
import { clientEvents, makingEvents } from '@/lib/analytics/events';

import { TheMaking } from '../the-making';

const invoicesMock = useProjectInvoices as jest.Mock;
const proposalsMock = useClientSafeProposals as jest.Mock;
const selectionsMock = useClientSelections as jest.Mock;
const bundleMock = useClientCommercialDocument as jest.Mock;
const acceptMock = useAcceptTradeScope as jest.Mock;
const authMock = useAuth as jest.Mock;

// ── Fixtures — the Vale residence ───────────────────────────────────────────

const PROJECT_ID = 'proj-vale';

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
  approvalsPending: 2,
  unreadMessages: 0,
  nextMilestone: { id: 'ph-5', title: 'Installation', targetDate: '2099-10-12', status: 'upcoming' },
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
    tags: [],
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
    tags: [],
  },
  {
    id: 'ph-5',
    index: 4,
    // The studio's own naming, as `project_phases.name` really carries it.
    title: 'Construction Administration',
    phase: 'installation',
    status: 'upcoming',
    targetDate: '2099-10-12',
    progressPercentage: 0,
    checklist: [],
    documents: [],
    messages: [],
    tags: [],
  },
];

const FURNISHINGS_PROPOSAL = {
  id: 'prop-7',
  title: 'Furnishings authorization No. 7',
  status: 'sent',
  project_id: PROJECT_ID,
  kind: 'furnishings_authorization',
  state: 'sent',
  total_amount: 689000,
  version: 7,
};

const EXECUTED_PROPOSAL = {
  id: 'prop-1',
  title: 'Design services agreement',
  status: 'accepted',
  project_id: PROJECT_ID,
  kind: 'design_services',
  state: 'executed',
  executed_at: '2026-02-02',
  total_amount: 1200000,
  version: 1,
};

const OPEN_INVOICE = {
  id: 'inv-4',
  invoice_number: 'Invoice No. 4',
  total_cents: 1825000,
  amount_paid_cents: 912500,
  due_date: '2099-08-15',
  status: 'sent',
  currency: 'USD',
};

function selection(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sel-1',
    kind: 'furnishings',
    name: 'Walnut credenza',
    roomId: null,
    roomName: 'Library',
    quantity: 1,
    clientUnitPriceCents: 840000,
    clientLineTotalCents: 840000,
    itemType: 'furniture',
    status: 'production' as FFEStageKey,
    tradeJourney: null,
    allowance: null,
    instrument: null,
    productId: null,
    imageUrl: null,
    docCode: null,
    ...over,
  };
}

const TRADE_READY = selection({
  id: 'sel-trade',
  kind: 'trade',
  name: 'Paintwork — library & stair hall',
  clientLineTotalCents: 720000,
  status: 'approved' as FFEStageKey,
  tradeJourney: 'substantially_complete',
  instrument: { documentId: 'doc-2', proposalId: 'prop-9', name: 'Trade scope', executedAt: null },
});

/** Every query resolved, nothing found — the thinnest honest project. */
function bare() {
  proposalsMock.mockReturnValue({ data: [], isPending: false, isError: false });
  selectionsMock.mockReturnValue({
    data: { origin: 'commercial', selections: [] },
    isPending: false,
    isError: false,
  });
  invoicesMock.mockReturnValue({ data: [], isPending: false, isError: false });
  bundleMock.mockReturnValue({ data: null, isPending: false, isError: false });
  acceptMock.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  authMock.mockReturnValue({ user: { id: 'u-1', name: 'Harper Vale' } });
}

beforeEach(() => {
  // resetMocks: true wipes return values between tests, so every default is
  // installed here rather than at module scope.
  bare();
});

function renderSurface(projectApprovals: ProjectApprovalReview[] = []) {
  return render(
    <TheMaking
      projectId={PROJECT_ID}
      project={PROJECT}
      milestones={MILESTONES}
      projectApprovals={projectApprovals}
    />,
  );
}

function projectApproval(
  over: Partial<ProjectApprovalReview> = {},
): ProjectApprovalReview {
  return {
    decisionId: 'decision-1',
    projectId: PROJECT_ID,
    phaseId: 'ph-4',
    sectionKey: null,
    artifactKind: 'plan_issue',
    artifactId: 'issue-1',
    artifactVersion: 7,
    artifactChecksum: 'a'.repeat(64),
    artifactTitle: 'Issued set',
    question: 'Approve issued set 7?',
    context: null,
    dueAt: '2026-08-01T12:00:00.000Z',
    costCentsDelta: 0,
    scheduleDaysDelta: 0,
    leadTimeDaysDelta: 0,
    lifecycleStatus: 'pending',
    outcome: null,
    disposition: 'active',
    isOverdue: true,
    completedReviewCount: 1,
    requiredReviewCount: 1,
    authorityRevision: 1,
    predecessorDecisionId: null,
    successorDecisionId: null,
    createdAt: '2026-07-20T12:00:00.000Z',
    sentAt: '2026-07-20T12:01:00.000Z',
    respondedAt: null,
    updatedAt: '2026-07-20T12:01:00.000Z',
    ...over,
  };
}

/** The open chapter's entries, in document order, by their testid. */
function openChapterOrder(): string[] {
  const chapter = screen.getByTestId('spine-open-chapter');
  return Array.from(chapter.querySelectorAll('[data-testid]'))
    .map((node) => node.getAttribute('data-testid') ?? '')
    .filter((id) =>
      ['making-project-approval-gate', 'spine-gate', 'spine-toll', 'tracking-row', 'making-pieces-head', 'making-pieces-settled'].includes(
        id,
      ),
    );
}

// ── The masthead ────────────────────────────────────────────────────────────

describe('TheMaking — the masthead', () => {
  it('names the project and rules the vitals from server data', () => {
    renderSurface();
    expect(screen.getByTestId('making-masthead-title')).toHaveTextContent('The Vale Residence');
    // currentPhase is the DB phase_key; the client reads its own label
    expect(screen.getByTestId('making-masthead-vitals')).toHaveTextContent(
      'Oak Park, Illinois · Procurement',
    );
  });

  it('takes the phase vital from the open phase row, not the studio’s free text', () => {
    // project.currentPhase is `project_phases.name || phase_key` — on a real
    // project it is the studio's own naming, which normalizePhaseSlug cannot
    // place and silently answered 'consultation' for. The spine reads the open
    // row's phase_key; the masthead must read the same thing or the same
    // screen says "Discovery" up top and "Procurement" three inches below.
    render(
      <TheMaking
        projectId={PROJECT_ID}
        project={{ ...PROJECT, currentPhase: 'Construction Documentation' }}
        milestones={MILESTONES}
      />,
    );

    expect(screen.getByTestId('making-masthead-vitals')).toHaveTextContent('Procurement');
    expect(screen.getByTestId('making-masthead-vitals')).not.toHaveTextContent('Discovery');
    expect(screen.getByTestId('spine-marker')).toHaveTextContent(
      'Procurement — the open chapter.',
    );
  });

  it('addresses the letterhead to the client reading it', () => {
    renderSurface();
    expect(screen.getByTestId('making-masthead-attribution')).toHaveTextContent(
      'Prepared for Harper Vale.',
    );
  });

  it('omits the attribution when the session does not name the client', () => {
    authMock.mockReturnValue({ user: { id: 'u-1', name: null } });
    renderSurface();
    expect(screen.queryByTestId('making-masthead-attribution')).not.toBeInTheDocument();
  });

  it('speaks one standing sentence composed from the live counts', () => {
    proposalsMock.mockReturnValue({
      data: [FURNISHINGS_PROPOSAL],
      isPending: false,
      isError: false,
    });
    selectionsMock.mockReturnValue({
      data: { origin: 'commercial', selections: [selection()] },
      isPending: false,
      isError: false,
    });
    invoicesMock.mockReturnValue({ data: [OPEN_INVOICE], isPending: false, isError: false });

    renderSurface();

    const sentence = screen.getByTestId('making-standing-sentence').textContent ?? '';
    expect(sentence).toContain('Your Walnut credenza is in production');
    expect(sentence).toContain('one paper waits for your name');
    expect(sentence).toContain('a balance of $9,125 stands open');
    expect(screen.getByTestId('making-standing-subline')).toHaveTextContent(
      '1 unanswered · balance of $9,125 open',
    );
  });

  it('names what comes next in the client’s vocabulary, never the studio’s', () => {
    renderSurface();

    const sentence = screen.getByTestId('making-standing-sentence').textContent ?? '';
    // project.nextMilestone.title is `project_phases.name` — "Construction
    // Administration" is an AIA-practice term, and the ruled D-voice line must
    // not print it.
    expect(sentence).toContain('Installation comes next');
    expect(sentence).not.toContain('Construction Administration');
  });

  it('holds the sentence back while the counts are still in flight', () => {
    invoicesMock.mockReturnValue({ data: undefined, isPending: true, isError: false });
    renderSurface();
    expect(screen.queryByTestId('making-standing-sentence')).not.toBeInTheDocument();
    expect(screen.getByTestId('making-standing-pending')).toBeInTheDocument();
  });
});

// ── The open chapter ────────────────────────────────────────────────────────

describe('TheMaking — the open chapter', () => {
  it('puts an exact Stage-2 artifact decision before every other gate', () => {
    proposalsMock.mockReturnValue({
      data: [FURNISHINGS_PROPOSAL],
      isPending: false,
      isError: false,
    });
    const approval = projectApproval();

    renderSurface([approval]);

    expect(openChapterOrder().slice(0, 2)).toEqual([
      'making-project-approval-gate',
      'spine-gate',
    ]);
    expect(screen.getByText('A gate · your response is required · Overdue')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Respond' })).toHaveAttribute(
      'href',
      '/decisions/decision-1',
    );
  });

  it('partitions current, future, and unmatched approvals by exact phase id', () => {
    renderSurface([
      projectApproval({ decisionId: 'current', question: 'Current approval?' }),
      projectApproval({
        decisionId: 'future',
        phaseId: 'ph-5',
        question: 'Future approval?',
        isOverdue: false,
      }),
      projectApproval({
        decisionId: 'unmatched',
        phaseId: 'phase-not-on-spine',
        question: 'Unmatched approval?',
        isOverdue: false,
      }),
    ]);

    const open = within(screen.getByTestId('spine-open-chapter'));
    expect(open.getByText('Current approval?')).toBeInTheDocument();
    expect(open.queryByText('Future approval?')).not.toBeInTheDocument();
    expect(open.queryByText('Unmatched approval?')).not.toBeInTheDocument();

    const later = within(screen.getByTestId('making-later-approvals'));
    expect(later.getByText('Future approval?')).toBeInTheDocument();
    expect(later.getByText(/Installation/)).toBeInTheDocument();

    const other = within(screen.getByTestId('making-other-approvals'));
    expect(other.getByText('Unmatched approval?')).toBeInTheDocument();
    expect(other.getByText(/Phase not available/)).toBeInTheDocument();
  });

  it('never infers an open approval from project.currentPhase when no phase row is open', () => {
    const noOpenMilestones = MILESTONES.map((milestone) =>
      milestone.id === 'ph-4'
        ? { ...milestone, status: 'upcoming' as const }
        : milestone,
    );

    render(
      <TheMaking
        projectId={PROJECT_ID}
        project={PROJECT}
        milestones={noOpenMilestones}
        projectApprovals={[projectApproval()]}
      />,
    );

    expect(screen.queryByTestId('spine-open-chapter')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('making-later-approvals')).getByText(
        'Approve issued set 7?',
      ),
    ).toBeInTheDocument();
  });

  it('keeps deferred approval work semantic and reflow-safe at 320px', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 320,
    });
    const { container } = renderSurface([
      projectApproval({
        decisionId: 'future',
        phaseId: 'ph-5',
        question: 'Review the long future immutable edition?',
      }),
      projectApproval({
        decisionId: 'unmatched',
        phaseId: 'missing',
        question: 'Review the unmatched immutable edition?',
      }),
    ]);

    expect(
      screen.getByRole('list', { name: 'Later approvals' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Other project approvals' }),
    ).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: /immutable edition/i })) {
      expect(link).toHaveClass('min-h-11', 'break-words');
    }
    expect(container.querySelector('[class*="shadow"]')).toBeNull();
    expect(container.querySelector('[class*="overflow-x"]')).toBeNull();
  });

  it('reads gates first, then tolls, then the pieces in motion', () => {
    proposalsMock.mockReturnValue({
      data: [FURNISHINGS_PROPOSAL],
      isPending: false,
      isError: false,
    });
    selectionsMock.mockReturnValue({
      data: { origin: 'commercial', selections: [selection(), TRADE_READY] },
      isPending: false,
      isError: false,
    });
    invoicesMock.mockReturnValue({ data: [OPEN_INVOICE], isPending: false, isError: false });

    renderSurface();

    expect(openChapterOrder()).toEqual([
      'spine-gate', // the paper awaiting a signature
      'spine-gate', // the finished work awaiting acceptance
      'spine-toll', // the open balance
      'making-pieces-head',
      'tracking-row',
    ]);
  });

  it('breaks the line at every gate and nowhere else', () => {
    proposalsMock.mockReturnValue({
      data: [FURNISHINGS_PROPOSAL],
      isPending: false,
      isError: false,
    });
    renderSurface();

    const gateRow = screen.getByTestId('making-gate-row');
    // capTop + capBottom collapses the row's own rule to nothing; the gate's
    // square stop and lighter resumption are the only marks on the line.
    expect(gateRow.querySelector('[data-spine-cap]')).toHaveAttribute('data-spine-cap', 'both');
    expect(screen.getByTestId('spine-gate-stop')).toBeInTheDocument();
    expect(screen.getByTestId('spine-gate-resume')).toBeInTheDocument();
  });

  it('carries the paper’s figures and the piece count into the caption', () => {
    proposalsMock.mockReturnValue({
      data: [FURNISHINGS_PROPOSAL],
      isPending: false,
      isError: false,
    });
    bundleMock.mockReturnValue({
      data: {
        furnishings: {
          depositRequiredCents: 344500,
          items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        },
        tradeScope: null,
      },
      isPending: false,
      isError: false,
    });

    renderSurface();

    expect(screen.getByTestId('spine-gate-vitals')).toHaveTextContent(
      'Furnishings authorization · $6,890',
    );
    expect(screen.getByTestId('spine-gate-deposit')).toHaveTextContent('$3,445 on signing');
    expect(screen.getByTestId('spine-gate-caption')).toHaveTextContent(
      'Three pieces order the moment you sign.',
    );
    expect(screen.getByRole('link', { name: /sign/i })).toHaveAttribute(
      'href',
      '/proposals/prop-7/sign',
    );
  });

  it('hosts the acceptance act inline — there is no acceptance route to link to', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({});
    acceptMock.mockReturnValue({ mutateAsync, isPending: false });
    selectionsMock.mockReturnValue({
      data: { origin: 'commercial', selections: [TRADE_READY] },
      isPending: false,
      isError: false,
    });
    bundleMock.mockReturnValue({
      data: {
        furnishings: null,
        tradeScope: {
          draws: [
            { id: 'd1', amountCents: 200000, invoicePaidCents: 200000, gatesOnAcceptance: false },
            { id: 'd2', amountCents: 144000, invoicePaidCents: 0, gatesOnAcceptance: true },
          ],
        },
      },
      isPending: false,
      isError: false,
    });

    renderSurface();

    expect(screen.getByTestId('spine-gate')).toHaveAttribute('data-gate-variant', 'acceptance');
    expect(screen.getByTestId('spine-gate-caption')).toHaveTextContent(
      'One draw is paid. The draw of $1,440 releases on your acceptance.',
    );

    const field = screen.getByTestId('accept-trade-scope-name');
    fireEvent.change(field, { target: { value: 'Harper Vale' } });
    fireEvent.click(screen.getByRole('button', { name: /accept the finished work/i }));

    expect(mutateAsync).toHaveBeenCalledWith('Harper Vale');
    expect(makingEvents.gateFollowed).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      proposalId: 'prop-9',
      kind: 'trade_acceptance',
    });
  });

  it('refuses an acceptance without a name, and does not post one', () => {
    const mutateAsync = jest.fn();
    acceptMock.mockReturnValue({ mutateAsync, isPending: false });
    selectionsMock.mockReturnValue({
      data: { origin: 'commercial', selections: [TRADE_READY] },
      isPending: false,
      isError: false,
    });

    renderSurface();
    fireEvent.click(screen.getByRole('button', { name: /accept the finished work/i }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Type your full name');
  });

  it('settles the balance at the invoice, soonest due first', () => {
    invoicesMock.mockReturnValue({
      data: [
        { ...OPEN_INVOICE, id: 'inv-9', invoice_number: 'Invoice No. 9', due_date: '2099-12-01' },
        OPEN_INVOICE,
      ],
      isPending: false,
      isError: false,
    });

    renderSurface();

    const tolls = screen.getAllByTestId('spine-toll');
    expect(tolls[0]).toHaveAttribute('data-invoice-id', 'inv-4');
    expect(tolls[1]).toHaveAttribute('data-invoice-id', 'inv-9');

    fireEvent.click(within(tolls[0]).getByRole('link', { name: /settle the balance/i }));
    expect(makingEvents.tollFollowed).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      invoiceId: 'inv-4',
      balanceCents: 912500,
    });
  });

  it('leaves draft and settled invoices off the line entirely', () => {
    invoicesMock.mockReturnValue({
      data: [
        { ...OPEN_INVOICE, id: 'inv-d', status: 'draft' },
        { ...OPEN_INVOICE, id: 'inv-p', status: 'paid' },
        { ...OPEN_INVOICE, id: 'inv-v', status: 'void' },
      ],
      isPending: false,
      isError: false,
    });
    renderSurface();
    expect(screen.queryByTestId('spine-toll')).not.toBeInTheDocument();
  });

  it('compresses placed pieces to one quiet line instead of six more stamps', () => {
    selectionsMock.mockReturnValue({
      data: {
        origin: 'commercial',
        selections: [
          selection({ id: 'a', status: 'installed' as FFEStageKey }),
          selection({ id: 'b', status: 'installed' as FFEStageKey }),
        ],
      },
      isPending: false,
      isError: false,
    });

    renderSurface();

    expect(screen.queryByTestId('tracking-row')).not.toBeInTheDocument();
    expect(screen.getByTestId('making-pieces-settled')).toHaveTextContent(
      'two pieces are installed and placed',
    );
  });

  it('orders the pieces in motion by how far along they are', () => {
    selectionsMock.mockReturnValue({
      data: {
        origin: 'commercial',
        selections: [
          selection({ id: 'a', name: 'Agreed chair', status: 'approved' as FFEStageKey }),
          selection({ id: 'b', name: 'Shipped rug', status: 'shipped' as FFEStageKey }),
          selection({ id: 'c', name: 'Credenza', status: 'production' as FFEStageKey }),
        ],
      },
      isPending: false,
      isError: false,
    });

    renderSurface();

    expect(
      screen.getAllByTestId('tracking-row').map((row) => row.getAttribute('data-journey-stop')),
    ).toEqual(['Shipped', 'In production', 'Agreed']);
  });
});

// ── Grace under thin data ───────────────────────────────────────────────────

describe('TheMaking — grace under thin data', () => {
  it('holds a quiet skeleton, never a gate, while the queries are in flight', () => {
    proposalsMock.mockReturnValue({ data: undefined, isPending: true, isError: false });
    renderSurface();
    expect(screen.getByTestId('making-open-chapter-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('spine-gate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spine-toll')).not.toBeInTheDocument();
  });

  it('says nothing at all when the project has agreed to nothing yet', () => {
    renderSurface();
    // Absence is silence. A design-services-only engagement never has
    // furnishings, and announcing that in mono caps is the system-label
    // register the surface exists to displace.
    expect(screen.queryByTestId('spine-open-chapter')).not.toBeInTheDocument();
    expect(screen.queryByText(/no pieces/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('spine-gate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spine-toll')).not.toBeInTheDocument();
    // and the sentence carries the whole state instead
    expect(screen.getByTestId('making-standing-sentence')).toHaveTextContent(
      'Nothing waits on you today.',
    );
  });

  it('runs the spine unbroken when there is no open chapter at all', () => {
    selectionsMock.mockReturnValue({
      data: { origin: 'legacy', selections: [] },
      isPending: false,
      isError: false,
    });
    renderSurface();
    expect(screen.queryByTestId('spine-open-chapter')).not.toBeInTheDocument();
    expect(screen.getByTestId('spine-marker')).toBeInTheDocument();
  });

  it('keeps the selection-derived regions out on a legacy-origin project', () => {
    selectionsMock.mockReturnValue({
      data: { origin: 'legacy', selections: [selection(), TRADE_READY] },
      isPending: false,
      isError: false,
    });
    invoicesMock.mockReturnValue({ data: [OPEN_INVOICE], isPending: false, isError: false });

    renderSurface();

    expect(screen.queryByTestId('tracking-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spine-gate')).not.toBeInTheDocument();
    // the ledger is independent of the origin and still runs
    expect(screen.getByTestId('spine-toll')).toBeInTheDocument();
  });

  it('states plainly that the ledger could not be read rather than hiding it', () => {
    invoicesMock.mockReturnValue({ data: undefined, isPending: false, isError: true });
    renderSurface();
    expect(screen.getByTestId('making-ledger-unavailable')).toBeInTheDocument();
  });
});

// ── The settled past and the horizon ────────────────────────────────────────

describe('TheMaking — receipts and the horizon', () => {
  it('merges executed instruments into the settled block beside the closed phases', () => {
    proposalsMock.mockReturnValue({
      data: [EXECUTED_PROPOSAL],
      isPending: false,
      isError: false,
    });

    renderSurface();

    const settled = within(screen.getByTestId('spine-settled'));
    expect(settled.getByText('Discovery closed')).toBeInTheDocument();
    expect(settled.getByText('Design services agreement executed')).toBeInTheDocument();
  });

  it('never draws an executed instrument as a gate', () => {
    proposalsMock.mockReturnValue({
      data: [EXECUTED_PROPOSAL],
      isPending: false,
      isError: false,
    });
    renderSurface();
    expect(screen.queryByTestId('spine-gate')).not.toBeInTheDocument();
  });

  it('closes on the horizon sentence when a target end date exists', () => {
    renderSurface();
    expect(screen.getByTestId('spine-horizon')).toHaveTextContent(
      'If nothing changes, we walk through your finished rooms the week of October 12.',
    );
  });
});

// ── Telemetry ───────────────────────────────────────────────────────────────

describe('TheMaking — telemetry', () => {
  it('leaves client_project_view to the switch — one open, one event', () => {
    renderSurface();
    // ProjectSurfaceSwitch is the sole emitter (see its own suite). Firing it
    // here as well double-counted every flagged open, because the switch
    // renders today's tree for at least one commit while the flag resolves.
    expect(clientEvents.projectView).not.toHaveBeenCalled();
  });

  it('reports the shape of the surface once per mount, after the data lands', () => {
    proposalsMock.mockReturnValue({
      data: [FURNISHINGS_PROPOSAL],
      isPending: false,
      isError: false,
    });
    selectionsMock.mockReturnValue({
      data: { origin: 'commercial', selections: [selection()] },
      isPending: false,
      isError: false,
    });
    invoicesMock.mockReturnValue({ data: [OPEN_INVOICE], isPending: false, isError: false });

    const { rerender } = renderSurface();
    rerender(<TheMaking projectId={PROJECT_ID} project={PROJECT} milestones={MILESTONES} />);

    expect(makingEvents.surfaceViewed).toHaveBeenCalledTimes(1);
    expect(makingEvents.surfaceViewed).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      gateCount: 1,
      tollCount: 1,
      trackingCount: 1,
    });
  });

  it('does not report a surface it has not finished reading', () => {
    invoicesMock.mockReturnValue({ data: undefined, isPending: true, isError: false });
    renderSurface();
    expect(makingEvents.surfaceViewed).not.toHaveBeenCalled();
  });

  it('reports the follow when a gate is taken', () => {
    proposalsMock.mockReturnValue({
      data: [FURNISHINGS_PROPOSAL],
      isPending: false,
      isError: false,
    });
    renderSurface();
    fireEvent.click(screen.getByRole('link', { name: /sign/i }));
    expect(makingEvents.gateFollowed).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      proposalId: 'prop-7',
      kind: 'furnishings_authorization',
    });
  });
});
