import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TradeScopeBidView } from '@/lib/document/project-commerce';
import type { TradeRfqView } from '@/hooks/use-commercial-documents';

let mockParties: { data: Record<string, unknown>[] } = { data: [] };
let mockRfqs: { data: TradeRfqView[] } = { data: [] };
const sendRfqMutateAsync = jest.fn();
let sendRfqIsPending = false;
let sendRfqVariables: { partyId: string } | undefined;

jest.mock('@patina/supabase', () => ({
  useProjectParties: () => mockParties,
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  useTradeRfqs: () => mockRfqs,
  useSendTradeRfq: () => ({
    mutateAsync: sendRfqMutateAsync,
    isPending: sendRfqIsPending,
    variables: sendRfqVariables,
  }),
}));

import { BidLedger } from './bid-ledger';

const bid = (overrides: Partial<TradeScopeBidView> = {}): TradeScopeBidView => ({
  id: 'bid-1',
  partyId: 'party-1',
  partyDisplayName: 'Atelier Marchand',
  amountCents: 415_000,
  status: 'selected',
  source: 'recorded',
  note: null,
  notedAt: '2026-07-07T00:00:00Z',
  respondedAt: null,
  ...overrides,
});

const rfq = (overrides: Partial<TradeRfqView> = {}): TradeRfqView => ({
  id: 'rfq-1',
  proposalId: 'scope-1',
  partyId: 'party-1',
  partyDisplayName: 'Atelier Marchand',
  status: 'sent',
  message: null,
  timeline: null,
  sentAt: '2026-07-07T00:00:00Z',
  respondedAt: null,
  closedAt: null,
  createdAt: '2026-07-07T00:00:00Z',
  ...overrides,
});

const parties = [
  {
    id: 'party-1',
    display_name: 'Atelier Marchand',
    party_kind: 'sub',
    trade: 'drapery',
    company_name: null,
    profile_id: null,
  },
  {
    id: 'party-9',
    display_name: 'Hardwick Supply',
    party_kind: 'vendor',
    trade: null,
    company_name: null,
    profile_id: null,
  },
];

const renderLedger = (props: Partial<Parameters<typeof BidLedger>[0]> = {}) =>
  render(
    <BidLedger
      projectId="project-1"
      proposalId="scope-1"
      bids={[]}
      editable
      onRecord={jest.fn()}
      onSelect={jest.fn()}
      {...props}
    />,
  );

describe('BidLedger', () => {
  beforeEach(() => {
    mockParties = { data: parties };
    mockRfqs = { data: [] };
    sendRfqIsPending = false;
    sendRfqVariables = undefined;
    sendRfqMutateAsync.mockReset();
  });

  it('says the ledger never leaves the drawer', () => {
    renderLedger();
    expect(screen.getByText('No bids recorded yet.')).toBeVisible();
    expect(
      screen.getByText('Their numbers never appear on client documents.'),
    ).toBeVisible();
  });

  it('lists each bid with its number, its note and its date, one selected', () => {
    renderLedger({
      bids: [
        bid(),
        bid({
          id: 'bid-2',
          partyDisplayName: 'Winfield Workroom',
          amountCents: 460_000,
          status: 'quoted',
          note: 'No install date',
        }),
      ],
    });

    expect(screen.getByText('$4,150')).toBeVisible();
    expect(screen.getByText('$4,600')).toBeVisible();
    expect(screen.getByText(/Selected/)).toBeVisible();
    expect(screen.getByText(/No install date/)).toBeVisible();

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
  });

  it('marks a bid that came back from the party itself', () => {
    renderLedger({
      bids: [
        bid({
          id: 'bid-3',
          status: 'quoted',
          source: 'party_response',
          respondedAt: '2026-07-09T00:00:00Z',
        }),
      ],
    });
    expect(screen.getByText('Answered')).toBeVisible();
  });

  it('selects a bid through its caller', async () => {
    const onSelect = jest.fn().mockResolvedValue(undefined);
    renderLedger({ bids: [bid({ status: 'quoted' })], onSelect });
    fireEvent.click(screen.getByRole('radio'));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('bid-1'));
  });

  it('records a bid against a sub, refusing one with no number', async () => {
    const onRecord = jest.fn().mockResolvedValue(undefined);
    renderLedger({ onRecord });

    fireEvent.click(screen.getByText('Record a bid'));
    // Only trades are offered — a vendor is not a candidate for trade work.
    expect(screen.getByRole('option', { name: /Atelier Marchand/ })).toBeVisible();
    expect(
      screen.queryByRole('option', { name: /Hardwick Supply/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Record the bid'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Whose number is this?'),
    );

    fireEvent.change(screen.getByLabelText('Whose number'), {
      target: { value: 'party-1' },
    });
    fireEvent.click(screen.getByText('Record the bid'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Record what they quoted.',
      ),
    );

    fireEvent.change(screen.getByLabelText('What they quoted'), {
      target: { value: '4,150' },
    });
    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'Includes a return visit' },
    });
    fireEvent.click(screen.getByText('Record the bid'));

    await waitFor(() =>
      expect(onRecord).toHaveBeenCalledWith({
        partyId: 'party-1',
        partyDisplayName: 'Atelier Marchand',
        amountCents: 415_000,
        note: 'Includes a return visit',
      }),
    );
  });

  it('reads only, once the scope has been released', () => {
    renderLedger({ bids: [bid()], editable: false });
    expect(screen.queryByText('Record a bid')).not.toBeInTheDocument();
    expect(screen.getByRole('radio')).toBeDisabled();
  });

  describe('asking a party for a number', () => {
    it('offers a sub or installer a request, but not a vendor', () => {
      renderLedger();
      expect(screen.getByText('Ask for a number')).toBeVisible();
      expect(screen.getByText('Atelier Marchand')).toBeVisible();
      expect(screen.queryByText('Hardwick Supply')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send a request' })).toBeVisible();
    });

    it('sends a request through its caller', async () => {
      sendRfqMutateAsync.mockResolvedValue({
        rfqId: 'rfq-1',
        recipient: 'sub@example.com',
        emailSent: true,
      });
      renderLedger();
      fireEvent.click(screen.getByRole('button', { name: 'Send a request' }));
      await waitFor(() =>
        expect(sendRfqMutateAsync).toHaveBeenCalledWith({ partyId: 'party-1' }),
      );
    });

    it('shows a quiet "requested" badge once an ask is sent, with a Resend act beside it instead of "Send a request"', () => {
      mockRfqs = { data: [rfq({ status: 'sent', sentAt: '2026-07-07T00:00:00Z' })] };
      renderLedger();
      // Date rendering is exercised elsewhere (project-commerce's `when`);
      // this only pins the badge's own text, not a timezone-sensitive day.
      expect(screen.getByText(/^Requested /)).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Send a request' }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Resend' })).toBeVisible();
    });

    it('resends against the SAME ask id, not a fresh prepare_trade_rfq call', async () => {
      sendRfqMutateAsync.mockResolvedValue({
        rfqId: 'rfq-1',
        recipient: 'sub@example.com',
        emailSent: true,
      });
      mockRfqs = { data: [rfq({ status: 'sent', sentAt: '2026-07-07T00:00:00Z' })] };
      renderLedger();
      fireEvent.click(screen.getByRole('button', { name: 'Resend' }));
      await waitFor(() =>
        expect(sendRfqMutateAsync).toHaveBeenCalledWith({
          partyId: 'party-1',
          existingRfqId: 'rfq-1',
        }),
      );
    });

    it('offers no Resend act once the scope has been released', () => {
      mockRfqs = { data: [rfq({ status: 'sent', sentAt: '2026-07-07T00:00:00Z' })] };
      renderLedger({ editable: false });
      expect(screen.queryByRole('button', { name: 'Resend' })).not.toBeInTheDocument();
    });

    it('offers no Resend act once a party has answered', () => {
      mockRfqs = {
        data: [
          rfq({
            status: 'responded',
            sentAt: '2026-07-07T00:00:00Z',
            respondedAt: '2026-07-09T00:00:00Z',
          }),
        ],
      };
      renderLedger();
      expect(screen.queryByRole('button', { name: 'Resend' })).not.toBeInTheDocument();
    });

    it('shows the answer with its amount once a party responds', () => {
      mockRfqs = {
        data: [
          rfq({
            status: 'responded',
            sentAt: '2026-07-07T00:00:00Z',
            respondedAt: '2026-07-09T00:00:00Z',
          }),
        ],
      };
      renderLedger({
        bids: [
          bid({
            id: 'bid-3',
            source: 'party_response',
            amountCents: 415_000,
            respondedAt: '2026-07-09T00:00:00Z',
          }),
        ],
      });
      expect(screen.getByText(/^Responded \$4,150 · /)).toBeVisible();
    });

    it('surfaces a failed send inline, scoped to that party, without blocking the rest of the ledger', async () => {
      sendRfqMutateAsync.mockRejectedValue(
        new Error('No email on file for this party — add one and try again.'),
      );
      renderLedger();
      fireEvent.click(screen.getByRole('button', { name: 'Send a request' }));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('No email on file'),
      );
      // The rest of the ledger — recording a bid by hand — stays available.
      expect(screen.getByText('Record a bid')).toBeVisible();
    });

    it('offers no request act once the scope has been released', () => {
      renderLedger({ editable: false });
      expect(
        screen.queryByRole('button', { name: 'Send a request' }),
      ).not.toBeInTheDocument();
    });
  });
});
