import { render, screen } from '@testing-library/react';
import { useClientPlan } from '@/hooks/use-commercial-client';
import type { ClientPlan, ClientPlanLine } from '@/lib/commercial-documents';
import { ClientPlanGrid } from '../client-plan-grid';

jest.mock('@/hooks/use-commercial-client', () => ({
  useClientPlan: jest.fn(),
}));

const mockUseClientPlan = useClientPlan as jest.Mock;

function line(overrides: Partial<ClientPlanLine> = {}): ClientPlanLine {
  return {
    id: 'line-1',
    roomName: 'Living room',
    category: 'Seating',
    targetCents: 500_000,
    scheduledCents: 480_000,
    authorizedCents: 480_000,
    liveAuthorizedCents: 480_000,
    ...overrides,
  };
}

function plan(overrides: Partial<ClientPlan> = {}): ClientPlan {
  const lines = overrides.lines ?? [line()];
  return {
    publishedAt: '2026-08-01T00:00:00Z',
    rooms: ['Living room'],
    liveAuthorizedTotalCents: lines.reduce((sum, l) => sum + l.liveAuthorizedCents, 0),
    ...overrides,
    lines,
  };
}

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
      data: plan({ publishedAt }),
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

  // The defect this fences: publish_budget_checkpoint stamps authorized_cents
  // at PUBLICATION, and a checkpoint has to be published and acknowledged
  // before any furnishings release can be drawn against it — so the stamp is
  // necessarily 0 when it is taken and stays 0 until the next publish. A client
  // who had just executed a $7,000 authorization was shown "$0 agreed so far".
  it('shows what has been agreed NOW, not the figure stamped at publication', () => {
    mockUseClientPlan.mockReturnValue({
      data: plan({
        lines: [
          line({ targetCents: 530_000, authorizedCents: 0, liveAuthorizedCents: 400_000 }),
          line({
            id: 'line-2',
            category: 'Casegoods',
            targetCents: 250_000,
            authorizedCents: 0,
            liveAuthorizedCents: 100_000,
          }),
        ],
      }),
      isLoading: false,
      isError: false,
    });
    render(<ClientPlanGrid projectId="project-1" />);

    expect(screen.getByText('$4,000')).toBeInTheDocument();
    expect(screen.getByText('$1,000')).toBeInTheDocument();
    // The stamped zero must not be what the client reads.
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
    expect(screen.getByTestId('client-plan-agreed-total')).toHaveTextContent(
      '$5,000 agreed so far',
    );
  });

  it('omits the agreed total until something has actually been agreed', () => {
    mockUseClientPlan.mockReturnValue({
      data: plan({
        lines: [line({ authorizedCents: 0, liveAuthorizedCents: 0 })],
      }),
      isLoading: false,
      isError: false,
    });
    render(<ClientPlanGrid projectId="project-1" />);

    expect(screen.queryByTestId('client-plan-agreed-total')).not.toBeInTheDocument();
  });

  it('states an over-target line in words, never with a red/alarm treatment', () => {
    mockUseClientPlan.mockReturnValue({
      data: plan({
        lines: [
          line({ targetCents: 400_000, scheduledCents: 450_000, liveAuthorizedCents: 450_000 }),
        ],
      }),
      isLoading: false,
      isError: false,
    });
    render(<ClientPlanGrid projectId="project-1" />);

    const overNote = screen.getByText(/\$500 over the room/);
    // Stated in words — no color-coded alarm styling anywhere in the note.
    expect(overNote.className).not.toMatch(/terracotta|danger|red/);
  });

  // Over-target is measured against what has been agreed NOW; a stale stamp
  // would either hide a real overrun or invent one that no longer exists.
  it('measures over-target against the live figure, not the stamp', () => {
    mockUseClientPlan.mockReturnValue({
      data: plan({
        lines: [
          line({ targetCents: 400_000, authorizedCents: 900_000, liveAuthorizedCents: 400_000 }),
        ],
      }),
      isLoading: false,
      isError: false,
    });
    render(<ClientPlanGrid projectId="project-1" />);

    expect(screen.queryByText(/over the room/)).not.toBeInTheDocument();
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
