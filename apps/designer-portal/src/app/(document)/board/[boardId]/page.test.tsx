import { render, screen } from '@testing-library/react';
import MoodBoardPage from './page';

const mockUseBoard = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useBoard: (...args: unknown[]) => mockUseBoard(...args),
}));

jest.mock('@/components/mood-board/board-room-shell', () => ({
  MoodBoardRoom: ({ boardId }: { boardId: string }) => (
    <div data-testid="mood-board-room">Room · {boardId}</div>
  ),
}));

const fulfilledParams = {
  status: 'fulfilled',
  value: { boardId: 'board-1' },
  then: () => undefined,
} as unknown as Promise<{ boardId: string }>;

function queryState(overrides: Record<string, unknown>) {
  const isPending = Boolean(overrides.isPending);
  const isError = Boolean(overrides.isError);
  // Mirrors RQ v5's mutually-exclusive status flags: unless a test overrides
  // isSuccess explicitly, it's true whenever the mock isn't pending or errored.
  const isSuccess = 'isSuccess' in overrides ? Boolean(overrides.isSuccess) : !isPending && !isError;
  return {
    data: undefined,
    isPending,
    isError,
    isSuccess,
    ...overrides,
  };
}

describe('MoodBoardPage', () => {
  beforeEach(() => {
    mockUseBoard.mockReset();
  });

  it('shows the loading skeleton while the initial fetch is pending', () => {
    mockUseBoard.mockReturnValue(queryState({ isPending: true }));

    render(<MoodBoardPage params={fulfilledParams} />);

    expect(screen.getByLabelText('Loading mood board')).toBeVisible();
    expect(screen.queryByTestId('mood-board-room')).not.toBeInTheDocument();
  });

  it('renders the room once the board resolves', () => {
    mockUseBoard.mockReturnValue(
      queryState({ data: { project_id: 'project-1', proposal_id: null } }),
    );

    render(<MoodBoardPage params={fulfilledParams} />);

    expect(screen.getByTestId('mood-board-room')).toHaveTextContent('Room · board-1');
  });

  it('keeps the room mounted through a background-refetch error', () => {
    // RQ v5 keeps the last-good `data` around when a background refetch
    // fails — the room must not read `isError` and unmount underneath undo/
    // zoom/selection state over a hiccup that already resolved once.
    mockUseBoard.mockReturnValue(
      queryState({ data: { project_id: 'project-1', proposal_id: null }, isError: true }),
    );

    render(<MoodBoardPage params={fulfilledParams} />);

    expect(screen.getByTestId('mood-board-room')).toBeInTheDocument();
    expect(screen.queryByText('This board is unavailable')).not.toBeInTheDocument();
  });

  it('keeps the room mounted via the last-good ref when a refetch errors with no data', () => {
    // A background refetch that fails is the transient case the ref exists
    // for — the room must stay mounted on the last-good board, not unmount.
    mockUseBoard.mockReturnValue(
      queryState({ data: { project_id: 'project-1', proposal_id: null } }),
    );
    const { rerender } = render(<MoodBoardPage params={fulfilledParams} />);
    expect(screen.getByTestId('mood-board-room')).toBeInTheDocument();

    mockUseBoard.mockReturnValue(queryState({ data: undefined, isError: true }));
    rerender(<MoodBoardPage params={fulfilledParams} />);

    expect(screen.getByTestId('mood-board-room')).toBeInTheDocument();
    expect(screen.queryByText('This board is unavailable')).not.toBeInTheDocument();
  });

  it('releases the ref and shows UnavailableBoard when a SUCCESSFUL refetch resolves no row', () => {
    // useBoard's .maybeSingle() resolves a deleted-or-revoked board as a
    // SUCCESSFUL null, not an error — that's authoritative, unlike the
    // isError case above, so the mounted room must give way to
    // UnavailableBoard instead of pinning the stale board forever.
    mockUseBoard.mockReturnValue(
      queryState({ data: { project_id: 'project-1', proposal_id: null } }),
    );
    const { rerender } = render(<MoodBoardPage params={fulfilledParams} />);
    expect(screen.getByTestId('mood-board-room')).toBeInTheDocument();

    mockUseBoard.mockReturnValue(queryState({ data: undefined, isSuccess: true }));
    rerender(<MoodBoardPage params={fulfilledParams} />);

    expect(screen.getByText('This board is unavailable')).toBeVisible();
    expect(screen.queryByTestId('mood-board-room')).not.toBeInTheDocument();
  });

  it('shows UnavailableBoard when no board has ever loaded', () => {
    mockUseBoard.mockReturnValue(
      queryState({ data: undefined, isPending: false, isSuccess: true }),
    );

    render(<MoodBoardPage params={fulfilledParams} />);

    expect(screen.getByText('This board is unavailable')).toBeVisible();
    expect(screen.queryByTestId('mood-board-room')).not.toBeInTheDocument();
  });
});
