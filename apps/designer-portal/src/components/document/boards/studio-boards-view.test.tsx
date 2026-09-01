import { render, screen } from '@testing-library/react';
import { StudioBoardsView } from './studio-boards-view';

let searchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

const useStudioBoardsOverview = jest.fn();

jest.mock('@patina/supabase', () => ({
  useStudioBoardsOverview: (...args: unknown[]) => useStudioBoardsOverview(...args),
}));

function emptyVerdicts() {
  return {
    approved: 0,
    rejected: 0,
    comment: 0,
    total: 0,
    bySource: {
      client: { approved: 0, rejected: 0, comment: 0, total: 0 },
      guest: { approved: 0, rejected: 0, comment: 0, total: 0 },
    },
  };
}

function board(overrides: Record<string, unknown> = {}) {
  return {
    id: 'board-1',
    name: 'Living room direction',
    ownerKind: 'project' as const,
    ownerId: 'project-1',
    ownerName: 'Lake House',
    coverImageUrl: null,
    updatedAt: '2026-08-01T00:00:00Z',
    reactionStatus: null,
    verdicts: emptyVerdicts(),
    unresolvedDirectionCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  searchParams = new URLSearchParams();
  useStudioBoardsOverview.mockReset();
});

describe('StudioBoardsView', () => {
  it('shows a loading state before the overview resolves', () => {
    useStudioBoardsOverview.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    render(<StudioBoardsView />);
    expect(screen.getByRole('status')).toHaveTextContent('Reading the boards…');
  });

  it('lists every active board with its owner, and links into the room', () => {
    useStudioBoardsOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { boards: [board()], capped: false },
    });
    render(<StudioBoardsView />);
    expect(screen.getByText('Living room direction')).toBeInTheDocument();
    expect(screen.getByText('Lake House')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Living room direction/ });
    expect(link).toHaveAttribute('href', '/board/board-1?source=studio_boards&from=%2Fboards');
  });

  it('shows the client/guest verdict split and the unresolved-direction count', () => {
    useStudioBoardsOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        boards: [
          board({
            reactionStatus: 'reactions_in',
            verdicts: {
              approved: 2,
              rejected: 0,
              comment: 0,
              total: 2,
              bySource: {
                client: { approved: 1, rejected: 0, comment: 0, total: 1 },
                guest: { approved: 1, rejected: 0, comment: 0, total: 1 },
              },
            },
            unresolvedDirectionCount: 3,
          }),
        ],
        capped: false,
      },
    });
    render(<StudioBoardsView />);
    expect(screen.getAllByText('Reactions in').length).toBeGreaterThan(0);
    expect(screen.getByText(/2 approved/)).toBeInTheDocument();
    expect(screen.getByText(/1 client · 1 guest/)).toBeInTheDocument();
    expect(screen.getByLabelText('3 unresolved direction notes')).toBeInTheDocument();
  });

  it('filters to the ?status= bucket from the desk rollup link', () => {
    searchParams = new URLSearchParams('status=approved_pipeline');
    useStudioBoardsOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        boards: [
          board({ id: 'board-a', name: 'Awaiting board', reactionStatus: 'awaiting_reaction' }),
          board({ id: 'board-b', name: 'Approved board', reactionStatus: 'approved_pipeline' }),
        ],
        capped: false,
      },
    });
    render(<StudioBoardsView />);
    expect(screen.getByText('Approved board')).toBeInTheDocument();
    expect(screen.queryByText('Awaiting board')).not.toBeInTheDocument();
  });

  it('shows a capped note when the read stopped short of every active board', () => {
    useStudioBoardsOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { boards: [board()], capped: true },
    });
    render(<StudioBoardsView />);
    expect(screen.getByText('Showing the most recently updated boards only.')).toBeInTheDocument();
  });

  it('shows an empty state when no boards are active', () => {
    useStudioBoardsOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { boards: [], capped: false },
    });
    render(<StudioBoardsView />);
    expect(screen.getByText('No active boards yet.')).toBeInTheDocument();
  });
});
