import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { EditableMoodBoardItem } from '@patina/types';
import { BoardApprovedPinsPanel } from '../board-approved-pins-panel';

const promoteMutateAsync = jest.fn();
let boardFeedbackData: Array<{
  id: string;
  board_item_id: string | null;
  client_id: string;
  verdict: string;
  created_at: string;
}> = [];

jest.mock('@patina/supabase', () => {
  const actual = jest.requireActual('@patina/supabase');
  return {
    // Real derivation — this is exactly what the panel's "approved" filter
    // should exercise; only the network-backed hooks below are stubbed.
    deriveApprovedBoardItemIds: actual.deriveApprovedBoardItemIds,
    useBoardItemFeedbackByBoard: () => ({ data: boardFeedbackData }),
    usePromoteBoardReferenceToSelection: () => ({
      mutateAsync: promoteMutateAsync,
      isPending: false,
    }),
  };
});

function pin(overrides: Partial<EditableMoodBoardItem> = {}): EditableMoodBoardItem {
  return {
    id: 'pin-1',
    type: 'product',
    x: 0,
    y: 0,
    width: 100,
    data: { name: 'Oak chair' },
    ...overrides,
  };
}

beforeEach(() => {
  promoteMutateAsync.mockReset();
  promoteMutateAsync.mockResolvedValue({ outcome: 'created', selectionId: 'selection-1' });
  boardFeedbackData = [];
});

describe('BoardApprovedPinsPanel', () => {
  it('renders nothing when no pin has an approved verdict', () => {
    boardFeedbackData = [];
    const { container } = render(
      <BoardApprovedPinsPanel
        boardId="board-1"
        projectId="project-1"
        scopeRoomId={null}
        items={[pin()]}
        onPromoted={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders only pins with a current approved verdict', () => {
    boardFeedbackData = [
      { id: 'f1', board_item_id: 'pin-1', client_id: 'client-1', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
      { id: 'f2', board_item_id: 'pin-2', client_id: 'client-1', verdict: 'rejected', created_at: '2026-08-01T00:00:00Z' },
    ];
    render(
      <BoardApprovedPinsPanel
        boardId="board-1"
        projectId="project-1"
        scopeRoomId={null}
        items={[pin({ id: 'pin-1', data: { name: 'Oak chair' } }), pin({ id: 'pin-2', data: { name: 'Linen swatch' } })]}
        onPromoted={jest.fn()}
      />,
    );
    expect(screen.getByText('Oak chair')).toBeInTheDocument();
    expect(screen.queryByText('Linen swatch')).not.toBeInTheDocument();
  });

  it('shows an already-scheduled pin as inert (no Send action)', () => {
    boardFeedbackData = [
      { id: 'f1', board_item_id: 'pin-1', client_id: 'client-1', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
    ];
    render(
      <BoardApprovedPinsPanel
        boardId="board-1"
        projectId="project-1"
        scopeRoomId={null}
        items={[pin({ id: 'pin-1', projectFfeItemId: 'ffe-1' })]}
        onPromoted={jest.fn()}
      />,
    );
    expect(screen.getByText('On schedule')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send to schedule/i })).not.toBeInTheDocument();
  });

  it('sends a single approved, not-yet-scheduled pin via the promotion mutation', async () => {
    boardFeedbackData = [
      { id: 'f1', board_item_id: 'pin-1', client_id: 'client-1', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
    ];
    const onPromoted = jest.fn();
    render(
      <BoardApprovedPinsPanel
        boardId="board-1"
        projectId="project-1"
        scopeRoomId="room-1"
        items={[pin({ id: 'pin-1' })]}
        onPromoted={onPromoted}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /send to schedule/i }));
    await waitFor(() => expect(promoteMutateAsync).toHaveBeenCalledTimes(1));
    expect(promoteMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        boardItemId: 'pin-1',
        assignmentScope: 'room',
        roomId: 'room-1',
        disposition: 'candidate',
        duplicateMode: 'reuse',
      }),
    );
    await waitFor(() => expect(onPromoted).toHaveBeenCalledWith('pin-1', 'selection-1'));
  });

  it('the bulk action calls the mutation once per eligible pin, skipping already-scheduled ones', async () => {
    boardFeedbackData = [
      { id: 'f1', board_item_id: 'pin-1', client_id: 'client-1', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
      { id: 'f2', board_item_id: 'pin-2', client_id: 'client-1', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
      { id: 'f3', board_item_id: 'pin-3', client_id: 'client-1', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
    ];
    render(
      <BoardApprovedPinsPanel
        boardId="board-1"
        projectId="project-1"
        scopeRoomId={null}
        items={[
          pin({ id: 'pin-1' }),
          pin({ id: 'pin-2' }),
          pin({ id: 'pin-3', projectFfeItemId: 'already-scheduled' }),
        ]}
        onPromoted={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /send all approved \(2\)/i }));
    await waitFor(() => expect(promoteMutateAsync).toHaveBeenCalledTimes(2));
    const calledItemIds = promoteMutateAsync.mock.calls.map((call) => call[0].boardItemId);
    expect(calledItemIds.sort()).toEqual(['pin-1', 'pin-2']);
  });

  it('a mid-batch failure is not erased by a later item succeeding in the same batch', async () => {
    boardFeedbackData = [
      { id: 'f1', board_item_id: 'pin-1', client_id: 'client-1', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
      { id: 'f2', board_item_id: 'pin-2', client_id: 'client-1', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
    ];
    promoteMutateAsync.mockImplementation((args: { boardItemId: string }) => {
      if (args.boardItemId === 'pin-1') {
        return Promise.reject(new Error('Vendor lookup failed for this pin.'));
      }
      return Promise.resolve({ outcome: 'created', selectionId: 'selection-2' });
    });

    render(
      <BoardApprovedPinsPanel
        boardId="board-1"
        projectId="project-1"
        scopeRoomId={null}
        items={[
          pin({ id: 'pin-1', data: { name: 'Failing chair' } }),
          pin({ id: 'pin-2', data: { name: 'Succeeding lamp' } }),
        ]}
        onPromoted={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /send all approved \(2\)/i }));
    await waitFor(() => expect(promoteMutateAsync).toHaveBeenCalledTimes(2));

    // The later success (pin-2) must not clear the earlier failure (pin-1):
    // the aggregate names exactly the one that failed, out of the two attempted.
    const alert = await screen.findByText(/could not be sent/i);
    expect(alert).toHaveTextContent('1 of 2 could not be sent: Failing chair');
    expect(alert).not.toHaveTextContent('Succeeding lamp');
  });

  it('a full-batch success shows no aggregate failure message', async () => {
    boardFeedbackData = [
      { id: 'f1', board_item_id: 'pin-1', client_id: 'client-1', verdict: 'approved', created_at: '2026-08-01T00:00:00Z' },
    ];
    render(
      <BoardApprovedPinsPanel
        boardId="board-1"
        projectId="project-1"
        scopeRoomId={null}
        items={[pin({ id: 'pin-1' })]}
        onPromoted={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /send to schedule/i }));
    await waitFor(() => expect(promoteMutateAsync).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/could not be sent/i)).not.toBeInTheDocument();
  });
});
