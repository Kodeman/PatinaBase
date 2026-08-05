import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAcceptTradeScope, useClientSelections } from '@/hooks/use-commercial-client';
import { adaptClientSelections, type ClientSelection } from '@/lib/commercial-documents';
import { ClientSelections } from '../client-selections';

jest.mock('@/hooks/use-commercial-client', () => ({
  useClientSelections: jest.fn(),
  useAcceptTradeScope: jest.fn(),
}));

const mockUseClientSelections = useClientSelections as jest.Mock;
const mockUseAcceptTradeScope = useAcceptTradeScope as jest.Mock;

function selection(overrides: Partial<ClientSelection> = {}): ClientSelection {
  return {
    id: 'sel-1',
    kind: 'furnishings',
    name: 'Meadow linen sectional',
    roomId: 'room-1',
    roomName: 'Living room',
    quantity: 1,
    clientUnitPriceCents: 480_000,
    clientLineTotalCents: 480_000,
    itemType: 'furniture',
    status: 'ordered',
    tradeJourney: null,
    allowance: null,
    instrument: null,
    productId: 'prod-1',
    imageUrl: null,
    docCode: null,
    ...overrides,
  };
}

function tradeSelection(overrides: Partial<ClientSelection> = {}): ClientSelection {
  return selection({
    id: 'trade-sel-1',
    kind: 'trade',
    name: 'Kitchen tile work — Kitchen',
    itemType: 'trade work',
    status: 'approved',
    tradeJourney: 'in_progress',
    instrument: { documentId: 'pcd-1', proposalId: 'prop-trade-1', name: 'Kitchen tile work', executedAt: '2026-07-01T00:00:00Z' },
    clientUnitPriceCents: 1_200_000,
    clientLineTotalCents: 1_200_000,
    ...overrides,
  });
}

describe('ClientSelections', () => {
  let mutateAsync: jest.Mock;

  beforeEach(() => {
    mutateAsync = jest.fn().mockResolvedValue({ ok: true });
    mockUseAcceptTradeScope.mockReturnValue({ mutateAsync, isPending: false });
  });

  it('renders the brand-voice empty state when there are no selections yet', () => {
    mockUseClientSelections.mockReturnValue({ data: { origin: 'commercial', selections: [] }, isLoading: false, isError: false });
    render(<ClientSelections projectId="project-1" />);
    expect(screen.getByTestId('client-selections-empty')).toHaveTextContent(
      'Nothing yet. Pieces appear here once you have agreed to them.',
    );
  });

  it('groups selections by room and shows the client price with a journey stepper', () => {
    mockUseClientSelections.mockReturnValue({
      data: {
        origin: 'commercial',
        selections: [
          selection({ id: 'sel-1', roomName: 'Living room', name: 'Meadow linen sectional', clientUnitPriceCents: 480_000 }),
          selection({ id: 'sel-2', roomName: 'Primary bedroom', name: 'Oak nightstand', clientUnitPriceCents: 62_000 }),
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<ClientSelections projectId="project-1" />);

    expect(screen.getByText('Living room')).toBeInTheDocument();
    expect(screen.getByText('Primary bedroom')).toBeInTheDocument();
    expect(screen.getByText('Meadow linen sectional')).toBeInTheDocument();
    expect(screen.getByText('$4,800')).toBeInTheDocument();
    expect(screen.getByText('Oak nightstand')).toBeInTheDocument();
    expect(screen.getAllByText('Agreed').length).toBeGreaterThan(0);
  });

  it('shows an unresolved allowance as "up to $X" instead of a piece price', () => {
    mockUseClientSelections.mockReturnValue({
      data: {
        origin: 'commercial',
        selections: [
          selection({
            id: 'sel-allowance',
            name: 'Coffee table allowance',
            allowance: { ceilingCents: 200_000, resolvedCents: null },
          }),
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<ClientSelections projectId="project-1" />);

    expect(screen.getByText('Allowance · up to $2,000')).toBeInTheDocument();
  });

  // The half of the allowance contract that lives in the RPC. This card's
  // "unresolved" branch keys strictly on NULL, so a resolvedCents of 0 — which
  // is exactly what project_ffe_items.line_total_cents DEFAULTs to (00066) —
  // renders as a settled price of nothing. That is why
  // get_client_project_selections must withhold the column entirely until the
  // schedule stops typing the line as an allowance, rather than passing it
  // through. Pinned here so the coupling is visible from the portal side too.
  it('treats resolvedCents 0 as resolved, not unresolved — the RPC must send null', () => {
    mockUseClientSelections.mockReturnValue({
      data: {
        origin: 'commercial',
        selections: [
          selection({
            id: 'sel-zero',
            name: 'Coffee table allowance',
            clientUnitPriceCents: 200_000,
            allowance: { ceilingCents: 200_000, resolvedCents: 0 },
          }),
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<ClientSelections projectId="project-1" />);

    expect(screen.queryByText(/up to/)).not.toBeInTheDocument();
  });

  it('shows a resolved allowance as the piece plus money back to the room', () => {
    mockUseClientSelections.mockReturnValue({
      data: {
        origin: 'commercial',
        selections: [
          selection({
            id: 'sel-resolved',
            name: 'Walnut coffee table',
            roomName: 'Living room',
            clientUnitPriceCents: 150_000,
            allowance: { ceilingCents: 200_000, resolvedCents: 150_000 },
          }),
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<ClientSelections projectId="project-1" />);

    expect(screen.getByText('Walnut coffee table')).toBeInTheDocument();
    expect(screen.getByText('$1,500 · $500 back to the Living room')).toBeInTheDocument();
  });

  it('omits the "back to the room" fragment once the resolved price meets the ceiling', () => {
    mockUseClientSelections.mockReturnValue({
      data: {
        origin: 'commercial',
        selections: [
          selection({
            id: 'sel-exact',
            name: 'Walnut coffee table',
            clientUnitPriceCents: 200_000,
            allowance: { ceilingCents: 200_000, resolvedCents: 200_000 },
          }),
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<ClientSelections projectId="project-1" />);

    expect(screen.getByText('$2,000')).toBeInTheDocument();
    expect(screen.queryByText(/back to the/)).not.toBeInTheDocument();
  });

  it('renders nothing extra on error and a skeleton while loading', () => {
    mockUseClientSelections.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container, rerender } = render(<ClientSelections projectId="project-1" />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();

    mockUseClientSelections.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    rerender(<ClientSelections projectId="project-1" />);
    expect(screen.queryByTestId('client-selections')).not.toBeInTheDocument();
  });

  describe('trade presence lines', () => {
    it('renders a trade card with its own journey stepper and no image or FF&E journey', () => {
      mockUseClientSelections.mockReturnValue({
        data: { origin: 'commercial', selections: [tradeSelection({ tradeJourney: 'engaged' })] },
        isLoading: false,
        isError: false,
      });
      render(<ClientSelections projectId="project-1" />);

      expect(screen.getByTestId('client-trade-selection-card')).toBeInTheDocument();
      expect(screen.getByText('Kitchen tile work — Kitchen')).toBeInTheDocument();
      expect(screen.getByText('$12,000')).toBeInTheDocument();
      expect(screen.getByText('Engaged')).toHaveAttribute('aria-current', 'step');
    });

    it('hides the accept act before the scope is substantially complete', () => {
      mockUseClientSelections.mockReturnValue({
        data: { origin: 'commercial', selections: [tradeSelection({ tradeJourney: 'in_progress' })] },
        isLoading: false,
        isError: false,
      });
      render(<ClientSelections projectId="project-1" />);

      expect(screen.queryByTestId('accept-trade-scope')).not.toBeInTheDocument();
    });

    it('shows "Accept the finished work" once the journey reaches substantially complete', () => {
      mockUseClientSelections.mockReturnValue({
        data: { origin: 'commercial', selections: [tradeSelection({ tradeJourney: 'substantially_complete' })] },
        isLoading: false,
        isError: false,
      });
      render(<ClientSelections projectId="project-1" />);

      expect(screen.getByTestId('accept-trade-scope')).toHaveTextContent('Accept the finished work');
    });

    it('posts the typed name to accept the finished work', async () => {
      mockUseClientSelections.mockReturnValue({
        data: { origin: 'commercial', selections: [tradeSelection({ tradeJourney: 'substantially_complete' })] },
        isLoading: false,
        isError: false,
      });
      render(<ClientSelections projectId="project-1" />);

      fireEvent.click(screen.getByTestId('accept-trade-scope'));
      fireEvent.change(screen.getByTestId('accept-trade-scope-name'), { target: { value: 'Jamie Homeowner' } });
      fireEvent.click(screen.getByTestId('accept-trade-scope-confirm'));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('Jamie Homeowner'));
      expect(mockUseAcceptTradeScope).toHaveBeenCalledWith('prop-trade-1', 'project-1');
    });

    // The card must gate on instrument.proposalId as it actually arrives from
    // get_client_project_selections — flat kind/tradeJourney on the selection
    // row, proposalId nested inside instrument (the P2 DB fix landing
    // alongside this one) — not on a hand-authored ClientSelection object.
    // This drives the raw RPC-shaped payload through the real adapter before
    // it ever reaches the component, so the seam between the two is proven,
    // not merely each half in isolation.
    it('drives the accept CTA end-to-end from the real RPC shape (flat kind/tradeJourney, instrument.proposalId)', async () => {
      const rawRpcPayload = {
        origin: 'commercial',
        selections: [
          {
            id: 'trade-sel-1',
            kind: 'trade',
            name: 'Kitchen tile work — Kitchen',
            roomId: 'room-1',
            roomName: 'Kitchen',
            clientLineTotalCents: 1_200_000,
            itemType: 'trade work',
            status: 'approved',
            tradeJourney: 'substantially_complete',
            instrument: {
              documentId: 'pcd-1',
              proposalId: 'prop-trade-1',
              name: 'Kitchen tile work',
              executedAt: '2026-07-01T00:00:00Z',
            },
          },
        ],
      };
      mockUseClientSelections.mockReturnValue({
        data: adaptClientSelections(rawRpcPayload),
        isLoading: false,
        isError: false,
      });

      render(<ClientSelections projectId="project-1" />);

      expect(screen.getByTestId('accept-trade-scope')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('accept-trade-scope'));
      fireEvent.change(screen.getByTestId('accept-trade-scope-name'), { target: { value: 'Jamie Homeowner' } });
      fireEvent.click(screen.getByTestId('accept-trade-scope-confirm'));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('Jamie Homeowner'));
      // useAcceptTradeScope must be called with the instrument's OWN proposal
      // id, not the project_commercial_documents id (documentId) — the accept
      // route is proposal-keyed.
      expect(mockUseAcceptTradeScope).toHaveBeenCalledWith('prop-trade-1', 'project-1');
    });

    it('hides the accept CTA when the RPC omits instrument.proposalId even at substantially_complete', () => {
      const rawRpcPayload = {
        origin: 'commercial',
        selections: [
          {
            id: 'trade-sel-1',
            kind: 'trade',
            name: 'Kitchen tile work — Kitchen',
            roomName: 'Kitchen',
            clientLineTotalCents: 1_200_000,
            tradeJourney: 'substantially_complete',
            instrument: { documentId: 'pcd-1', name: 'Kitchen tile work' },
          },
        ],
      };
      mockUseClientSelections.mockReturnValue({
        data: adaptClientSelections(rawRpcPayload),
        isLoading: false,
        isError: false,
      });

      render(<ClientSelections projectId="project-1" />);

      expect(screen.queryByTestId('accept-trade-scope')).not.toBeInTheDocument();
    });

    it('will not accept without a typed name', async () => {
      mockUseClientSelections.mockReturnValue({
        data: { origin: 'commercial', selections: [tradeSelection({ tradeJourney: 'substantially_complete' })] },
        isLoading: false,
        isError: false,
      });
      render(<ClientSelections projectId="project-1" />);

      fireEvent.click(screen.getByTestId('accept-trade-scope'));
      fireEvent.click(screen.getByTestId('accept-trade-scope-confirm'));

      expect(mutateAsync).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('Type your full name');
    });
  });
});
