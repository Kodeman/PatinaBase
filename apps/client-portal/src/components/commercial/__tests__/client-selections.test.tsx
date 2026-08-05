import { render, screen } from '@testing-library/react';
import { useClientSelections } from '@/hooks/use-commercial-client';
import type { ClientSelection } from '@/lib/commercial-documents';
import { ClientSelections } from '../client-selections';

jest.mock('@/hooks/use-commercial-client', () => ({
  useClientSelections: jest.fn(),
}));

const mockUseClientSelections = useClientSelections as jest.Mock;

function selection(overrides: Partial<ClientSelection> = {}): ClientSelection {
  return {
    id: 'sel-1',
    name: 'Meadow linen sectional',
    roomId: 'room-1',
    roomName: 'Living room',
    quantity: 1,
    clientUnitPriceCents: 480_000,
    clientLineTotalCents: 480_000,
    itemType: 'furniture',
    status: 'ordered',
    allowance: null,
    instrument: null,
    productId: 'prod-1',
    imageUrl: null,
    docCode: null,
    ...overrides,
  };
}

describe('ClientSelections', () => {
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
});
