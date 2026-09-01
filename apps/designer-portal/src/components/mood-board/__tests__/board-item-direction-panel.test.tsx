import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BoardItemDirectionPanel } from '../board-item-direction-panel';

const addMutateAsync = jest.fn();
const resolveMutateAsync = jest.fn();
const reopenMutateAsync = jest.fn();
// DirectionMeta resolves author_id -> name via useProfileName -> useQuery,
// same convention as doc-colophon.test.tsx: mock the react-query hook itself
// rather than standing up a real QueryClient for a component test.
const useQueryMock = jest.fn(() => ({ data: null }));

jest.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(),
  useAddBoardItemDirection: () => ({ mutateAsync: addMutateAsync, isPending: false }),
  useResolveBoardItemDirection: () => ({ mutateAsync: resolveMutateAsync, isPending: false }),
  useReopenBoardItemDirection: () => ({ mutateAsync: reopenMutateAsync, isPending: false }),
}));

function direction(overrides: Partial<{
  id: string;
  board_item_id: string;
  author_id: string;
  body: string;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}> = {}) {
  return {
    id: 'direction-1',
    board_item_id: 'pin-1',
    author_id: 'user-1',
    body: 'Swap the sconce for the brass one.',
    resolved: false,
    resolved_at: null,
    resolved_by: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  addMutateAsync.mockReset().mockResolvedValue(direction());
  resolveMutateAsync.mockReset().mockResolvedValue(direction({ resolved: true }));
  reopenMutateAsync.mockReset().mockResolvedValue(direction({ resolved: false }));
  useQueryMock.mockReset().mockReturnValue({ data: null });
});

describe('BoardItemDirectionPanel', () => {
  it('shows an unresolved-count badge on the collapsed toggle and hides the thread', () => {
    render(
      <BoardItemDirectionPanel
        boardId="board-1"
        boardItemId="pin-1"
        directions={[direction({ id: 'a' }), direction({ id: 'b', resolved: true })]}
      />,
    );
    expect(screen.getByText('Direction · 2')).toBeInTheDocument();
    expect(screen.getByLabelText('1 unresolved direction note')).toBeInTheDocument();
    expect(screen.queryByText('Swap the sconce for the brass one.')).not.toBeInTheDocument();
  });

  it('expands to show the thread, and adds a trimmed note against the pin', async () => {
    render(
      <BoardItemDirectionPanel boardId="board-1" boardItemId="pin-1" directions={[direction()]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /direction/i }));
    expect(screen.getByText('Swap the sconce for the brass one.')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Direction for the studio — not visible to the client'), {
      target: { value: '  Check the rug pairing too.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() =>
      expect(addMutateAsync).toHaveBeenCalledWith({
        boardId: 'board-1',
        boardItemId: 'pin-1',
        body: 'Check the rug pairing too.',
      }),
    );
  });

  it('resolves an open note and reopens a resolved one', () => {
    render(
      <BoardItemDirectionPanel
        boardId="board-1"
        boardItemId="pin-1"
        directions={[
          direction({ id: 'open', resolved: false }),
          direction({ id: 'closed', resolved: true, body: 'Already handled.' }),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /direction/i }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Resolve' })[0]);
    expect(resolveMutateAsync).toHaveBeenCalledWith({ boardId: 'board-1', directionId: 'open' });

    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(reopenMutateAsync).toHaveBeenCalledWith({ boardId: 'board-1', directionId: 'closed' });
  });

  it('shows the empty state and no badge when there is no direction on the pin', () => {
    render(<BoardItemDirectionPanel boardId="board-1" boardItemId="pin-1" directions={[]} />);
    expect(screen.getByText('Direction')).toBeInTheDocument();
    expect(screen.queryByLabelText(/unresolved direction/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /direction/i }));
    expect(
      screen.getByText('No direction on this pin yet. Studio-only — never shown to a client or a guest link.'),
    ).toBeInTheDocument();
  });

  it('attributes each note to its resolved author name (C10 — DV6 is lead→junior)', () => {
    useQueryMock.mockReturnValue({ data: 'Direction Junior' });
    render(
      <BoardItemDirectionPanel
        boardId="board-1"
        boardItemId="pin-1"
        directions={[direction({ author_id: 'user-2' })]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /direction/i }));
    expect(screen.getByText(/Direction Junior/)).toBeInTheDocument();
  });

  it('surfaces a resolve failure instead of a silent unhandled rejection (C3)', async () => {
    resolveMutateAsync.mockReset().mockRejectedValue(new Error('only a studio co-member may resolve direction'));
    render(
      <BoardItemDirectionPanel boardId="board-1" boardItemId="pin-1" directions={[direction()]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /direction/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'only a studio co-member may resolve direction',
      ),
    );
  });

  it('surfaces a reopen failure the same way, with a fallback message for a non-Error rejection', async () => {
    reopenMutateAsync.mockReset().mockRejectedValue('boom');
    render(
      <BoardItemDirectionPanel
        boardId="board-1"
        boardItemId="pin-1"
        directions={[direction({ resolved: true })]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /direction/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not reopen this note.'),
    );
  });
});
