import { fireEvent, render, screen } from '@testing-library/react';
import { DeskBoardsReactionRollup } from './desk-boards-reaction-rollup';

const useBoardsReactionRollup = jest.fn();

jest.mock('@patina/supabase', () => ({
  useBoardsReactionRollup: (...args: unknown[]) => useBoardsReactionRollup(...args),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/desk',
}));

describe('DeskBoardsReactionRollup', () => {
  beforeEach(() => {
    useBoardsReactionRollup.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { awaitingReaction: [], reactionsIn: [], approvedPipeline: [], capped: false },
    });
  });

  it('renders nothing while loading', () => {
    useBoardsReactionRollup.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    const { container } = render(<DeskBoardsReactionRollup />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on error', () => {
    useBoardsReactionRollup.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    const { container } = render(<DeskBoardsReactionRollup />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when every bucket is empty (all zeros)', () => {
    const { container } = render(<DeskBoardsReactionRollup />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows non-empty bucket counts and hides empty ones', () => {
    useBoardsReactionRollup.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        awaitingReaction: [
          { id: 'board-1', name: 'Living room direction', ownerName: 'Lake House', updatedAt: '2026-08-01T00:00:00Z' },
        ],
        reactionsIn: [],
        approvedPipeline: [
          { id: 'board-2', name: 'Dining alternates', ownerName: 'Lake House', updatedAt: '2026-08-02T00:00:00Z' },
          { id: 'board-3', name: 'Bedroom concept', ownerName: 'Elm Street', updatedAt: '2026-08-03T00:00:00Z' },
        ],
        capped: false,
      },
    });

    render(<DeskBoardsReactionRollup />);

    expect(screen.getByText('1 awaiting reaction')).toBeInTheDocument();
    expect(screen.getByText('2 approved awaiting pipeline')).toBeInTheDocument();
    expect(screen.queryByText(/with reactions in/)).not.toBeInTheDocument();
  });

  it('a count expands into a linked list of its boards', () => {
    useBoardsReactionRollup.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        awaitingReaction: [],
        reactionsIn: [
          { id: 'board-9', name: 'Kitchen refresh', ownerName: 'Lake House', updatedAt: '2026-08-01T00:00:00Z' },
        ],
        approvedPipeline: [],
        capped: false,
      },
    });

    render(<DeskBoardsReactionRollup />);

    expect(screen.queryByRole('link', { name: /kitchen refresh/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('1 with reactions in'));
    const link = screen.getByRole('link', { name: /kitchen refresh/i });
    expect(link).toHaveAttribute('href', '/board/board-9?source=desk_recents&from=%2Fdesk');
  });

  it('shows a capped note when the read stopped short of every active board', () => {
    useBoardsReactionRollup.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        awaitingReaction: [
          { id: 'board-1', name: 'Living room direction', ownerName: 'Lake House', updatedAt: '2026-08-01T00:00:00Z' },
        ],
        reactionsIn: [],
        approvedPipeline: [],
        capped: true,
      },
    });

    render(<DeskBoardsReactionRollup />);
    expect(screen.getByText('Showing the most recent boards only')).toBeInTheDocument();
  });
});
