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
let mockWorkspace: Record<string, unknown> = { data: null };

const mutation = (fn: jest.Mock) => ({ mutateAsync: fn, isPending: false });

jest.mock('@/hooks/use-commercial-documents', () => ({
  useTradeScopeWorkspace: () => mockWorkspace,
  useEngageTradeScope: () => mutation(engage),
  useMarkTradeScopeInProgress: () => mutation(markInProgress),
  useRecordSubstantialCompletion: () => mutation(recordCompletion),
  useIssueTradeDrawInvoice: () => mutation(issueDraw),
  useVoidTradeScope: () => mutation(voidScope),
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
    mockWorkspace = { data: workspaceData };
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
    await waitFor(() => expect(engage).toHaveBeenCalledWith('proposal-1'));
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
