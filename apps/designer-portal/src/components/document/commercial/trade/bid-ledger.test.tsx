import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TradeScopeBidView } from '@/lib/document/project-commerce';

let mockParties: { data: Record<string, unknown>[] } = { data: [] };

jest.mock('@patina/supabase', () => ({
  useProjectParties: () => mockParties,
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

describe('BidLedger', () => {
  beforeEach(() => {
    mockParties = { data: parties };
  });

  it('says the ledger never leaves the drawer', () => {
    render(
      <BidLedger
        projectId="project-1"
        bids={[]}
        editable
        onRecord={jest.fn()}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByText('No bids recorded yet.')).toBeVisible();
    expect(
      screen.getByText('Their numbers never appear on client documents.'),
    ).toBeVisible();
  });

  it('lists each bid with its number, its note and its date, one selected', () => {
    render(
      <BidLedger
        projectId="project-1"
        bids={[
          bid(),
          bid({
            id: 'bid-2',
            partyDisplayName: 'Winfield Workroom',
            amountCents: 460_000,
            status: 'quoted',
            note: 'No install date',
          }),
        ]}
        editable
        onRecord={jest.fn()}
        onSelect={jest.fn()}
      />,
    );

    expect(screen.getByText('$4,150')).toBeVisible();
    expect(screen.getByText('$4,600')).toBeVisible();
    expect(screen.getByText(/Selected/)).toBeVisible();
    expect(screen.getByText(/No install date/)).toBeVisible();

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
  });

  it('marks a bid that came back from the party itself', () => {
    render(
      <BidLedger
        projectId="project-1"
        bids={[
          bid({
            id: 'bid-3',
            status: 'quoted',
            source: 'party_response',
            respondedAt: '2026-07-09T00:00:00Z',
          }),
        ]}
        editable
        onRecord={jest.fn()}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByText('Answered')).toBeVisible();
  });

  it('selects a bid through its caller', async () => {
    const onSelect = jest.fn().mockResolvedValue(undefined);
    render(
      <BidLedger
        projectId="project-1"
        bids={[bid({ status: 'quoted' })]}
        editable
        onRecord={jest.fn()}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole('radio'));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('bid-1'));
  });

  it('records a bid against a sub, refusing one with no number', async () => {
    const onRecord = jest.fn().mockResolvedValue(undefined);
    render(
      <BidLedger
        projectId="project-1"
        bids={[]}
        editable
        onRecord={onRecord}
        onSelect={jest.fn()}
      />,
    );

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
    render(
      <BidLedger
        projectId="project-1"
        bids={[bid()]}
        editable={false}
        onRecord={jest.fn()}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.queryByText('Record a bid')).not.toBeInTheDocument();
    expect(screen.getByRole('radio')).toBeDisabled();
  });
});
