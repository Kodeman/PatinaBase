import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const createScope = jest.fn();
const saveDraft = jest.fn();
const setParty = jest.fn();
const recordBid = jest.fn();
const selectBid = jest.fn();
const sendScope = jest.fn();
let mockWorkspace: Record<string, unknown> = { data: null };

const mutation = (fn: jest.Mock) => ({ mutateAsync: fn, isPending: false });

jest.mock('@/hooks/use-commercial-documents', () => ({
  useCreateTradeScope: () => mutation(createScope),
  useSaveTradeScopeDraft: () => mutation(saveDraft),
  useSetTradeScopeParty: () => mutation(setParty),
  useRecordTradeBid: () => mutation(recordBid),
  useSelectTradeBid: () => mutation(selectBid),
  useSendTradeScope: () => mutation(sendScope),
  useTradeScopeWorkspace: () => mockWorkspace,
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({
    data: [
      { id: 'room-1', name: 'Living', budget_cents: 0 },
      { id: 'room-2', name: 'Primary bedroom', budget_cents: 0 },
    ],
  }),
}));

jest.mock('./party-field', () => ({
  TRADE_PARTY_KINDS: ['sub', 'installer'],
  PartyField: ({
    partyId,
    onSelect,
  }: {
    partyId: string | null;
    onSelect: (id: string) => void;
  }) => (
    <button type="button" onClick={() => onSelect('party-1')}>
      party-field:{partyId ?? 'none'}
    </button>
  ),
}));

jest.mock('./bid-ledger', () => ({
  BidLedger: ({ bids }: { bids: unknown[] }) => (
    <div data-testid="bid-ledger">{bids.length} bids</div>
  ),
}));

import { TradeScopeDraftSheet } from './trade-scope-draft-sheet';

const workspace = (overrides: Record<string, unknown> = {}) => ({
  data: {
    terms: {
      proposalId: 'proposal-1',
      partyId: 'party-1',
      partyDisplayName: 'Atelier Marchand',
      partyCompanyName: null,
      partyTrade: 'drapery',
      clientPriceCents: 680_000,
      currency: 'USD',
      terms: 'Prices are fixed.',
      progressState: 'none',
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
        prose: 'Five windows, blackout lined.',
        allocationCents: null,
        sortOrder: 0,
      },
    ],
    bids: [{ id: 'bid-1' }],
    draws: [
      {
        id: 'draw-1',
        label: 'Deposit · on signature',
        percentage: 50,
        amountCents: 340_000,
        sortOrder: 0,
        gatesOnAcceptance: false,
        invoiceId: null,
        invoiceStatus: null,
        invoicePaidCents: 0,
      },
      {
        id: 'draw-2',
        label: 'Final · on acceptance',
        percentage: 50,
        amountCents: 340_000,
        sortOrder: 1,
        gatesOnAcceptance: true,
        invoiceId: null,
        invoiceStatus: null,
        invoicePaidCents: 0,
      },
    ],
    ...overrides,
  },
});

const renderSheet = (props: Record<string, unknown> = {}) =>
  render(
    <TradeScopeDraftSheet
      open
      projectId="project-1"
      proposalId="proposal-1"
      scopeNumber={1}
      onClose={jest.fn()}
      {...props}
    />,
  );

describe('TradeScopeDraftSheet', () => {
  beforeEach(() => {
    createScope.mockReset().mockResolvedValue({
      proposalId: 'proposal-1',
      documentId: 'pcd-1',
      projectId: 'project-1',
    });
    saveDraft.mockReset().mockResolvedValue({ proposalId: 'proposal-1' });
    setParty.mockReset().mockResolvedValue({});
    recordBid.mockReset().mockResolvedValue({});
    selectBid.mockReset().mockResolvedValue({});
    sendScope.mockReset().mockResolvedValue({});
    mockWorkspace = workspace();
  });

  it('asks for the work before anything can hang off it', async () => {
    mockWorkspace = { data: null };
    const onCreated = jest.fn();
    renderSheet({ proposalId: null, scopeNumber: null, onCreated });

    expect(screen.getByText('What is the work?')).toBeVisible();
    expect(screen.queryByText('The work')).not.toBeInTheDocument();

    const start = screen.getByRole('button', { name: 'Start this scope' });
    expect(start).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Scope'), {
      target: { value: 'Drapery fabrication & install' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start this scope' }));

    await waitFor(() =>
      expect(createScope).toHaveBeenCalledWith('Drapery fabrication & install'),
    );
    expect(onCreated).toHaveBeenCalledWith('proposal-1');
  });

  it('hydrates an existing draft: rooms, prose, price, terms and draws', () => {
    renderSheet();

    expect(screen.getByText('The work')).toBeVisible();
    expect(screen.getByDisplayValue('Five windows, blackout lined.')).toBeVisible();
    expect(screen.getByDisplayValue('6800')).toBeVisible();
    expect(screen.getByDisplayValue('Prices are fixed.')).toBeVisible();
    expect(screen.getByText('Deposit · on signature')).toBeVisible();
    expect(screen.getByText('Final · on acceptance')).toBeVisible();
    expect(screen.getByTestId('bid-ledger')).toHaveTextContent('1 bids');
    expect(screen.getByText('party-field:party-1')).toBeVisible();
  });

  it('adds and removes a room on the scope', () => {
    renderSheet();

    fireEvent.click(screen.getByText('Add a room to the scope'));
    expect(screen.getAllByLabelText(/^Scope for line/)).toHaveLength(2);

    fireEvent.click(screen.getAllByText('Remove this room')[1]);
    expect(screen.getAllByLabelText(/^Scope for line/)).toHaveLength(1);
  });

  it('stamps the party onto the scope the moment it is picked', async () => {
    renderSheet();
    fireEvent.click(screen.getByText('party-field:party-1'));
    await waitFor(() =>
      expect(setParty).toHaveBeenCalledWith({
        proposalId: 'proposal-1',
        partyId: 'party-1',
      }),
    );
  });

  it('saves the draft with computed draw amounts and drops empty rooms', async () => {
    renderSheet();
    fireEvent.click(screen.getByText('Add a room to the scope'));
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));

    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
    const input = saveDraft.mock.calls[0][0];
    expect(input.clientPriceCents).toBe(680_000);
    expect(input.draws).toEqual([
      {
        label: 'Deposit · on signature',
        percentage: 50,
        amountCents: 340_000,
        gatesOnAcceptance: false,
      },
      {
        label: 'Final · on acceptance',
        percentage: 50,
        amountCents: 340_000,
        gatesOnAcceptance: true,
      },
    ]);
    // The blank room is carried to the hook, which drops it before the write.
    expect(input.sections[0]).toMatchObject({
      projectRoomId: 'room-1',
      roomName: 'Living',
      prose: 'Five windows, blackout lined.',
    });
  });

  it('refuses to release an incomplete scope, and says what is missing', async () => {
    mockWorkspace = workspace({ sections: [], terms: null });
    renderSheet();

    fireEvent.click(
      screen.getByRole('button', { name: 'Release the trade scope' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Choose who does this work.',
      ),
    );
    expect(sendScope).not.toHaveBeenCalled();
  });

  it('saves and then sends when the scope is whole', async () => {
    renderSheet();
    fireEvent.click(
      screen.getByRole('button', { name: 'Release the trade scope' }),
    );

    await waitFor(() => expect(sendScope).toHaveBeenCalledWith('proposal-1'));
    expect(saveDraft).toHaveBeenCalled();
    expect(saveDraft.mock.invocationCallOrder[0]).toBeLessThan(
      sendScope.mock.invocationCallOrder[0],
    );
  });

  it('says the prices lock on release', () => {
    renderSheet();
    expect(screen.getByText('Prices lock on release.')).toBeVisible();
  });

  it('surfaces a failed release rather than closing over it', async () => {
    sendScope.mockRejectedValue(new Error('the fingerprint moved'));
    const onClose = jest.fn();
    renderSheet({ onClose });

    fireEvent.click(
      screen.getByRole('button', { name: 'Release the trade scope' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('the fingerprint moved'),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
