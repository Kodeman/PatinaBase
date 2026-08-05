import { render, screen } from '@testing-library/react';
import { useClientPlan } from '@/hooks/use-commercial-client';
import { ClientPlanGrid } from '../client-plan-grid';

jest.mock('@/hooks/use-commercial-client', () => ({
  useClientPlan: jest.fn(),
}));

const mockUseClientPlan = useClientPlan as jest.Mock;

describe('ClientPlanGrid', () => {
  it('renders room, category, planned target, and agreed-so-far columns dated to the published checkpoint', () => {
    const publishedAt = '2026-08-01T12:00:00Z';
    // Computed via the same Date→toLocaleDateString conversion the component
    // uses, so this assertion isn't sensitive to the test runner's local
    // timezone (a fixed literal like "August 1, 2026" can render as "July 31"
    // in a negative-UTC-offset environment for a midnight-UTC timestamp).
    const expectedLabel = new Date(publishedAt).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    mockUseClientPlan.mockReturnValue({
      data: {
        publishedAt,
        rooms: ['Living room'],
        lines: [
          {
            id: 'line-1',
            roomName: 'Living room',
            category: 'Seating',
            targetCents: 500_000,
            scheduledCents: 480_000,
            authorizedCents: 480_000,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<ClientPlanGrid projectId="project-1" />);

    expect(screen.getByText('The plan')).toBeInTheDocument();
    expect(screen.getByText(`Budget as of ${expectedLabel}`)).toBeInTheDocument();
    expect(screen.getByText('Living room')).toBeInTheDocument();
    expect(screen.getByText('Seating')).toBeInTheDocument();
    expect(screen.getByText('$5,000')).toBeInTheDocument();
    expect(screen.getByText('$4,800')).toBeInTheDocument();
  });

  it('states an over-target line in words, never with a red/alarm treatment', () => {
    mockUseClientPlan.mockReturnValue({
      data: {
        publishedAt: '2026-08-01T00:00:00Z',
        rooms: ['Living room'],
        lines: [
          {
            id: 'line-1',
            roomName: 'Living room',
            category: 'Seating',
            targetCents: 400_000,
            scheduledCents: 450_000,
            authorizedCents: 450_000,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<ClientPlanGrid projectId="project-1" />);

    const overNote = screen.getByText(/\$500 over the room/);
    // Stated in words — no color-coded alarm styling anywhere in the note.
    expect(overNote.className).not.toMatch(/terracotta|danger|red/);
  });

  it('renders nothing when there is no published version yet', () => {
    mockUseClientPlan.mockReturnValue({ data: null, isLoading: false, isError: false });
    const { container } = render(<ClientPlanGrid projectId="project-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on error and a skeleton while loading', () => {
    mockUseClientPlan.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container, rerender } = render(<ClientPlanGrid projectId="project-1" />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();

    mockUseClientPlan.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    rerender(<ClientPlanGrid projectId="project-1" />);
    expect(screen.queryByTestId('client-plan-grid')).not.toBeInTheDocument();
  });
});
