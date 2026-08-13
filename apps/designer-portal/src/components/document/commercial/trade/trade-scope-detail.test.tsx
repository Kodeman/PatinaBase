import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  TradeScopeDrawView,
  TradeScopeView,
} from '@/lib/document/project-commerce';

const engage = jest.fn();
const markInProgress = jest.fn();
const recordCompletion = jest.fn();
const issueDraw = jest.fn();
const voidScope = jest.fn();
const executeTradeScopeOnPaper = jest.fn();
const recordTradeAcceptanceOnPaper = jest.fn();
let mockWorkspace: Record<string, unknown> = { data: null };
let mockCommercialDocument: Record<string, unknown> = { data: undefined, isLoading: false };

const mutation = (fn: jest.Mock) => ({ mutateAsync: fn, isPending: false });

// Engagement states its schedule impact before the act (R110); the resolver's
// one door reads through React Query, which these tests do not provide.
// Mutable so one case can hand the sheet a REAL chain and pin the computable
// R110 path — the branch that actually hardens.
const scheduleStub: {
  phases: unknown[];
  milestones: unknown[];
  isLoading: boolean;
  isError: boolean;
} = { phases: [], milestones: [], isLoading: false, isError: false };

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useResolvedSchedule: () => ({
    phases: scheduleStub.phases,
    milestones: scheduleStub.milestones,
    resolved: null,
    isLoading: scheduleStub.isLoading,
    isError: scheduleStub.isError,
  }),
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  useTradeScopeWorkspace: () => mockWorkspace,
  useCommercialDocument: () => mockCommercialDocument,
  useEngageTradeScope: () => mutation(engage),
  useMarkTradeScopeInProgress: () => mutation(markInProgress),
  useRecordSubstantialCompletion: () => mutation(recordCompletion),
  useIssueTradeDrawInvoice: () => mutation(issueDraw),
  useVoidTradeScope: () => mutation(voidScope),
  // RecordOnPaperSheet mounts unconditionally and calls all four paper
  // hooks up front regardless of `kind` — stub every one.
  useRecordPaperClientSignature: () => mutation(jest.fn()),
  useExecuteFurnishingsAuthorizationOnPaper: () => mutation(jest.fn()),
  useExecuteTradeScopeOnPaper: () => mutation(executeTradeScopeOnPaper),
  useRecordPaperTradeAcceptance: () => mutation(recordTradeAcceptanceOnPaper),
  uploadPaperScanDocument: jest.fn(),
}));

import { TradeScopeDetail } from './trade-scope-detail';

const draw = (
  overrides: Partial<TradeScopeDrawView> = {},
): TradeScopeDrawView => ({
  id: 'draw-1',
  label: 'Deposit · on signature',
  percentage: 50,
  amountCents: 340_000,
  sortOrder: 0,
  gatesOnAcceptance: false,
  invoiceId: null,
  invoiceStatus: null,
  invoicePaidCents: 0,
  ...overrides,
});

const scope = (overrides: Partial<TradeScopeView> = {}): TradeScopeView => ({
  documentId: 'pcd-1',
  proposalId: 'proposal-1',
  number: 1,
  title: 'Drapery fabrication & install',
  state: 'executed',
  progressState: 'none',
  partyDisplayName: 'Atelier Marchand',
  clientPriceCents: 680_000,
  currency: 'USD',
  depositInvoiceId: 'invoice-1',
  depositPaid: true,
  draws: [
    draw({ invoiceId: 'invoice-1', invoiceStatus: 'paid', invoicePaidCents: 340_000 }),
    draw({
      id: 'draw-2',
      label: 'Final · on acceptance',
      sortOrder: 1,
      gatesOnAcceptance: true,
    }),
  ],
  drawCount: 2,
  drawsIssued: 1,
  drawsPaid: 1,
  sectionRoomIds: ['room-1'],
  ...overrides,
});

const workspaceData = {
  terms: {
    proposalId: 'proposal-1',
    partyId: 'party-1',
    partyDisplayName: 'Atelier Marchand',
    partyCompanyName: null,
    partyTrade: 'drapery',
    clientPriceCents: 680_000,
    currency: 'USD',
    terms: 'Prices on this scope are fixed.',
    progressState: 'none' as const,
    engagedAt: null,
    substantialCompletionAt: null,
    acceptedAt: null,
    acceptedSignedName: null,
  },
  sections: [
    {
      id: 'section-1',
      projectRoomId: 'room-1',
      roomName: 'Living',
      prose: 'Fabricate and hang pinch-pleat drapery to five windows.',
      allocationCents: 490_000,
      sortOrder: 0,
    },
  ],
  bids: [],
  draws: [],
};

const renderDetail = (view: TradeScopeView) =>
  render(
    <TradeScopeDetail
      projectId="project-1"
      projectName="Ellsworth Residence"
      clientName="Harper Vale"
      scope={view}
      open
      onClose={jest.fn()}
    />,
  );

describe('TradeScopeDetail', () => {
  beforeEach(() => {
    engage.mockReset().mockResolvedValue({});
    markInProgress.mockReset().mockResolvedValue({});
    recordCompletion.mockReset().mockResolvedValue({});
    issueDraw.mockReset().mockResolvedValue({});
    voidScope.mockReset().mockResolvedValue({});
    executeTradeScopeOnPaper.mockReset().mockResolvedValue({});
    recordTradeAcceptanceOnPaper.mockReset().mockResolvedValue({});
    scheduleStub.phases = [];
    scheduleStub.milestones = [];
    scheduleStub.isLoading = false;
    scheduleStub.isError = false;
    mockWorkspace = { data: workspaceData };
    mockCommercialDocument = { data: undefined, isLoading: false };
  });

  it('walks the journey band and states the figures', () => {
    renderDetail(scope({ progressState: 'in_progress' }));

    expect(screen.getByText('Trade scope № 1')).toBeVisible();
    const band = screen.getByRole('list', { name: 'Trade scope journey' });
    expect(band).toHaveTextContent('Authorized');
    expect(band).toHaveTextContent('Final payment');

    expect(screen.getByText('$6,800')).toBeVisible();
    // The deposit figure reads Paid, and so does the draw it came from.
    expect(screen.getAllByText('Paid')).toHaveLength(2);
    expect(screen.getByText('1 of 2')).toBeVisible();
  });

  it('engages the trade by name once the deposit has landed', async () => {
    renderDetail(scope());

    const act = screen.getByRole('button', { name: /Engage Atelier Marchand/ });
    expect(act).not.toBeDisabled();
    fireEvent.click(act);
    // R110: the act carries what the IMPACT block stated. With no chain to
    // compute against, the honest disclosure is null — the server proposes.
    await waitFor(() =>
      expect(engage).toHaveBeenCalledWith({
        proposalId: 'proposal-1',
        disclosedImpact: null,
      }),
    );
    expect(screen.getByRole('group', { name: 'Impact' })).toBeVisible();
  });

  it('states a computed impact on a real chain, and passes exactly what it stated', async () => {
    scheduleStub.phases = [
      {
        id: 'phase-main',
        name: 'Design development',
        lane: 'main',
        sort_order: 0,
        duration_days: 14,
        duration_weeks: null,
        follows_phase_id: null,
        anchor_date: null,
        start_date: '2026-06-01',
        target_end_date: null,
        status: 'in_progress',
      },
      {
        id: 'phase-thread',
        name: 'Procurement thread',
        lane: 'thread',
        sort_order: 1,
        duration_days: 30,
        duration_weeks: null,
        follows_phase_id: 'phase-main',
        anchor_date: null,
        start_date: null,
        target_end_date: null,
        status: 'pending',
      },
    ];
    renderDetail(scope());

    const block = screen.getByRole('group', { name: 'Impact' });
    expect(block).toHaveAttribute('data-schedule-impact', 'computed');
    const stated = block.textContent ?? '';
    expect(stated).toContain('Procurement thread anchored');

    fireEvent.click(screen.getByRole('button', { name: /Engage Atelier Marchand/ }));
    await waitFor(() => expect(engage).toHaveBeenCalled());
    const passed = engage.mock.calls[0][0] as {
      disclosedImpact: { sentence: string; kind: string; anchorDate: string } | null;
    };
    expect(passed.disclosedImpact).not.toBeNull();
    expect(passed.disclosedImpact?.kind).toBe('phase-anchor');
    // What the sheet SAID is what the RPC receives — R110's whole point.
    expect(stated).toContain(passed.disclosedImpact?.sentence ?? '__none__');
  });

  it('holds the act while the schedule is still being read (R110)', () => {
    scheduleStub.isLoading = true;
    renderDetail(scope());
    expect(
      screen.getByRole('button', { name: /Engage Atelier Marchand/ }),
    ).toBeDisabled();
    expect(screen.getByRole('group', { name: 'Impact' })).toHaveAttribute(
      'data-schedule-impact',
      'reading',
    );
    expect(screen.getByText('Reading the schedule…')).toBeVisible();
  });

  it('holds the act when the schedule read failed — that is not "uncomputable"', () => {
    scheduleStub.isError = true;
    renderDetail(scope());
    expect(
      screen.getByRole('button', { name: /Engage Atelier Marchand/ }),
    ).toBeDisabled();
    expect(screen.getByRole('group', { name: 'Impact' })).toHaveAttribute(
      'data-schedule-impact',
      'unavailable',
    );
  });

  it('holds engagement with its reason when the deposit has not been paid', () => {
    renderDetail(scope({ depositPaid: false }));

    expect(
      screen.getByRole('button', { name: /Engage Atelier Marchand/ }),
    ).toBeDisabled();
    expect(screen.getByText('the deposit is not paid yet')).toBeVisible();
  });

  it('records the two studio progress acts, each behind its gate', async () => {
    const { unmount } = renderDetail(scope());
    expect(screen.getByRole('button', { name: 'Mark in progress' })).toBeDisabled();
    expect(screen.getAllByText('engage the trade first')).toHaveLength(2);
    unmount();

    renderDetail(scope({ progressState: 'engaged' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark in progress' }));
    await waitFor(() =>
      expect(markInProgress).toHaveBeenCalledWith('proposal-1'),
    );
  });

  it('records substantial completion once the work is under way', async () => {
    renderDetail(scope({ progressState: 'in_progress' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Record substantial completion' }),
    );
    await waitFor(() =>
      expect(recordCompletion).toHaveBeenCalledWith('proposal-1'),
    );
  });

  it('leaves acceptance to the client and says so', () => {
    renderDetail(scope({ progressState: 'substantially_complete' }));
    expect(
      screen.queryByRole('button', { name: /Accept the work/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Acceptance is the client/)).toBeVisible();
  });

  it("shows the paper tell for the scope's own execution, dated to the day on the paper", () => {
    mockCommercialDocument = {
      data: {
        signatures: [
          {
            party: 'client', signerName: 'Jamie Client', executedOnPaper: true,
            // Signed in January, written down in August. The scope must say
            // January — that is when the client authorized the work.
            signedAt: '2026-08-05T14:20:00Z', paperSignedOn: '2026-01-15',
            paperScanDocumentId: null,
          },
        ],
      },
      isLoading: false,
    };
    renderDetail(scope());
    expect(
      screen.getByText('Signed Jan 15, 2026 on paper · recorded by the studio.'),
    ).toBeVisible();
  });

  /**
   * A paper acceptance stores its day as midnight UTC (00425:
   * `accepted_at = p_paper_signed_on::timestamptz`). Read through `when` —
   * timezone-aware — a studio in Chicago sees 9 February for a 10 February
   * acceptance. The header line reads it as a DAY instead.
   */
  describe('west of UTC', () => {
    const originalTz = process.env.TZ;
    beforeEach(() => {
      process.env.TZ = 'America/Chicago';
    });
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it('dates a paper acceptance to the day it was accepted, not the day before', () => {
      mockWorkspace = {
        data: {
          ...workspaceData,
          terms: {
            ...workspaceData.terms,
            progressState: 'accepted',
            acceptedAt: '2026-02-10T00:00:00Z',
            acceptedSignedName: 'Jamie Client',
            acceptedOnPaper: true,
            acceptanceRecordedByName: 'Morgan Designer',
          },
        },
      };
      renderDetail(scope({ progressState: 'accepted' }));
      expect(screen.getByText(/accepted Feb 10, 2026/)).toBeVisible();
      expect(screen.queryByText(/accepted Feb 9, 2026/)).not.toBeInTheDocument();
    });

    it('leaves an online acceptance in the studio\'s own timezone — it is a moment, not a day', () => {
      mockWorkspace = {
        data: {
          ...workspaceData,
          terms: {
            ...workspaceData.terms,
            progressState: 'accepted',
            acceptedAt: '2026-02-10T00:00:00Z',
            acceptedSignedName: 'Jamie Client',
            acceptedOnPaper: false,
          },
        },
      };
      renderDetail(scope({ progressState: 'accepted' }));
      expect(screen.getByText(/accepted Feb 9, 2026/)).toBeVisible();
    });
  });

  it('shows the acceptance note and recorder name once a paper acceptance is on record', () => {
    mockWorkspace = {
      data: {
        ...workspaceData,
        terms: {
          ...workspaceData.terms,
          progressState: 'accepted',
          acceptedAt: '2026-08-01T00:00:00Z',
          acceptedSignedName: 'Jamie Client',
          acceptedOnPaper: true,
          acceptanceRecordedByName: 'Morgan Designer',
        },
      },
    };
    renderDetail(scope({ progressState: 'accepted' }));
    expect(
      screen.getByTestId('trade-acceptance-paper-note'),
    ).toHaveTextContent('Signed on paper · recorded by the studio. Recorded by Morgan Designer.');
  });

  it('shows no acceptance paper note for an online acceptance', () => {
    mockWorkspace = {
      data: {
        ...workspaceData,
        terms: {
          ...workspaceData.terms,
          progressState: 'accepted',
          acceptedAt: '2026-08-01T00:00:00Z',
          acceptedSignedName: 'Jamie Client',
          acceptedOnPaper: false,
        },
      },
    };
    renderDetail(scope({ progressState: 'accepted' }));
    expect(screen.queryByTestId('trade-acceptance-paper-note')).not.toBeInTheDocument();
  });

  it('offers to record executed on paper only while sent, and records it', async () => {
    const { unmount } = renderDetail(scope());
    expect(
      screen.queryByRole('button', { name: 'Record the signature' }),
    ).not.toBeInTheDocument();
    unmount();

    renderDetail(scope({ state: 'sent', progressState: 'none' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Record the signature' }),
    );

    // Parity with the design-services act: prefilled from the document.
    expect(await screen.findByLabelText('Signed by')).toHaveValue('Harper Vale');
    fireEvent.click(screen.getByRole('button', { name: 'Record & execute' }));

    await waitFor(() =>
      expect(executeTradeScopeOnPaper).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: 'proposal-1',
          signedName: 'Harper Vale',
        }),
      ),
    );
  });

  it('offers to record a paper acceptance only once substantially complete, and records it', async () => {
    const { unmount } = renderDetail(scope({ progressState: 'in_progress' }));
    expect(
      screen.queryByRole('button', { name: 'Record the acceptance' }),
    ).not.toBeInTheDocument();
    unmount();

    renderDetail(scope({ progressState: 'substantially_complete' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Record the acceptance' }),
    );

    expect(await screen.findByLabelText('Accepted by')).toHaveValue('Harper Vale');
    fireEvent.click(
      screen.getByRole('button', { name: 'Record accepted' }),
    );

    await waitFor(() =>
      expect(recordTradeAcceptanceOnPaper).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: 'proposal-1',
          signedName: 'Harper Vale',
        }),
      ),
    );
  });

  it('holds the final draw until the client has accepted', () => {
    renderDetail(scope({ progressState: 'substantially_complete' }));

    expect(
      screen.getByText('the client has not accepted the work yet'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Issue draw' })).toBeDisabled();
  });

  it('issues the final draw once acceptance has landed', async () => {
    renderDetail(scope({ progressState: 'accepted' }));

    const act = screen.getByRole('button', { name: 'Issue draw' });
    expect(act).not.toBeDisabled();
    fireEvent.click(act);
    await waitFor(() =>
      expect(issueDraw).toHaveBeenCalledWith({
        proposalId: 'proposal-1',
        drawId: 'draw-2',
      }),
    );
  });

  it('shows the rooms the work happens in', () => {
    renderDetail(scope());
    expect(screen.getByText('Living')).toBeVisible();
    expect(
      screen.getByText(
        'Fabricate and hang pinch-pleat drapery to five windows.',
      ),
    ).toBeVisible();
    expect(screen.getByText('$4,900')).toBeVisible();
  });

  it('opens the work order for the trade', () => {
    renderDetail(scope());
    fireEvent.click(screen.getByRole('button', { name: 'Work order' }));
    expect(screen.getByText('Work order · Trade scope № 1')).toBeVisible();
  });

  it('voids only a draft or sent scope, behind a typed confirmation', async () => {
    const { unmount } = renderDetail(scope());
    expect(
      screen.queryByRole('button', { name: /Void & supersede/ }),
    ).not.toBeInTheDocument();
    unmount();

    renderDetail(scope({ state: 'sent', progressState: 'none' }));
    fireEvent.click(screen.getByRole('button', { name: /Void & supersede/ }));

    const submit = screen.getByRole('button', { name: 'Void TS1' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/moved the drapery/), {
      target: { value: 'The client moved this out of the phase.' },
    });
    fireEvent.change(
      screen.getByLabelText('Type VOID TS1 to confirm the void'),
      { target: { value: 'VOID TS1' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Void TS1' }));

    await waitFor(() =>
      expect(voidScope).toHaveBeenCalledWith({
        proposalId: 'proposal-1',
        reason: 'The client moved this out of the phase.',
      }),
    );
  });

  it('renders nothing without a scope', () => {
    const { container } = render(
      <TradeScopeDetail
        projectId="project-1"
        scope={null}
        open
        onClose={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
