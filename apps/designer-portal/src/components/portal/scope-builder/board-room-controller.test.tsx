import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BoardRoomControllerApi } from './board-room-controller';
import { BoardRoomController } from './board-room-controller';
import { resetProposalAutosaveRegistryForTests } from '@/lib/proposal-autosave-registry';

const mockSaveLayout = jest.fn();
const mockUpsertBoard = jest.fn();
const mockAddItem = jest.fn();
const mockUpdateItem = jest.fn();
const mockDeleteItem = jest.fn();
let mockCanvasProps: Record<string, any> | null = null;

const mockBoard = {
  id: 'board-project',
  proposal_id: null,
  project_id: 'project-1',
  name: 'Project concept',
  scope_room_id: null,
  cover_image_url: null,
  canvas_width: 1200,
  canvas_height: 800,
  background_color: '#FAF8F5',
  sort_order: 0,
  sections: [],
  status: 'active',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  items: [
    {
      id: 'item-1',
      board_id: 'board-project',
      type: 'product',
      x: 10,
      y: 20,
      width: 200,
      height: 220,
      z_index: 0,
      rotation: 0,
      locked: false,
      product_id: 'product-1',
      capture_id: null,
      palette_id: null,
      image_url: 'https://cdn.example/chair.jpg',
      content: null,
      data: { name: 'Chair', source_url: 'https://maker.example/chair' },
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    },
  ],
};

jest.mock('@patina/design-system', () => ({
  BoardRoomCanvas: (props: Record<string, any>) => {
    mockCanvasProps = props;
    const item = props.items[0];
    return (
      <div data-testid="edit-canvas">
        edit-x:{item?.x};selected:{props.selectedItemIds.length}
        <button
          type="button"
          onClick={() => props.onSelectionChange(['item-1'], { reason: 'item' })}
        >
          Select item
        </button>
        <button
          type="button"
          onClick={() => props.onItemsMoved({
            itemIds: ['item-1'],
            before: [{ id: 'item-1', x: item.x, y: item.y }],
            after: [{ id: 'item-1', x: 410, y: item.y }],
            delta: { x: 400, y: 0 },
            reason: 'drag',
            guides: [],
          })}
        >
          Move item
        </button>
      </div>
    );
  },
  BoardComposition: ({ board, showNotes }: Record<string, any>) => (
    <div data-testid="present-composition">
      present-x:{board.items[0]?.x};notes:{String(showNotes)}
    </div>
  ),
}));

jest.mock('@patina/supabase', () => ({
  useBoard: () => ({ data: mockBoard, isLoading: false, error: null }),
  useSaveBoardLayout: () => ({ mutateAsync: mockSaveLayout }),
  useUpsertBoard: () => ({ mutateAsync: mockUpsertBoard }),
  useAddBoardItem: () => ({ mutateAsync: mockAddItem }),
  useUpdateBoardItem: () => ({ mutateAsync: mockUpdateItem }),
  useDeleteBoardItem: () => ({ mutateAsync: mockDeleteItem }),
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockCanvasProps = null;
  mockSaveLayout.mockResolvedValue(undefined);
  mockUpsertBoard.mockResolvedValue(mockBoard);
  mockAddItem.mockImplementation(async (input) => ({ ...mockBoard.items[0], id: input.itemId }));
  mockUpdateItem.mockResolvedValue(mockBoard.items[0]);
  mockDeleteItem.mockResolvedValue(undefined);
});

afterEach(() => {
  resetProposalAutosaveRegistryForTests();
  jest.useRealTimers();
});

describe('BoardRoomController binding', () => {
  it('keeps live edits, selection and history across Edit/Present without a refetch (AC2.6)', async () => {
    render(
      <BoardRoomController
        owner={{ kind: 'project', id: 'project-1' }}
        boardId="board-project"
      />,
    );
    await screen.findByTestId('edit-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Select item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move item' }));
    expect(screen.getByTestId('edit-canvas')).toHaveTextContent('edit-x:410;selected:1');

    fireEvent.keyDown(window, { key: 'p' });
    expect(screen.getByTestId('present-composition')).toHaveTextContent('present-x:410');
    fireEvent.keyDown(window, { key: 'p' });
    expect(screen.getByTestId('edit-canvas')).toHaveTextContent('edit-x:410;selected:1');

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(screen.getByTestId('edit-canvas')).toHaveTextContent('edit-x:10;selected:1');
    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
    expect(screen.getByTestId('edit-canvas')).toHaveTextContent('edit-x:410;selected:1');
    expect(mockCanvasProps).not.toBeNull();
  });

  it('compensates pan for top/left canvas growth so the composition does not jump (AC1.8)', async () => {
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="pan">{value.view.pan.x},{value.view.pan.y}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.canvasProps).not.toBeNull());
    act(() => api!.canvasProps!.onCanvasGrow?.({
      grew: true,
      canvas: { width: 1480, height: 1070 },
      translation: { x: 280, y: 270 },
      items: [{ key: 'item-1', id: 'item-1', x: 290, y: 290 }],
      reason: 'move',
    }));
    expect(screen.getByTestId('pan')).toHaveTextContent('-248,-238');
    expect(api!.state).toMatchObject({ canvasWidth: 1480, canvasHeight: 1070 });
    expect(api!.state?.items[0]).toMatchObject({ x: 290, y: 290 });
  });

  it('uses the Present escape ladder before exiting the room', async () => {
    const onExit = jest.fn().mockResolvedValue(undefined);
    render(
      <BoardRoomController
        owner={{ kind: 'project', id: 'project-1' }}
        boardId="board-project"
        onExit={onExit}
      />,
    );
    await screen.findByTestId('edit-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Select item' }));
    fireEvent.keyDown(window, { key: 'p' });
    expect(screen.getByTestId('present-composition')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('edit-canvas')).toHaveTextContent('selected:0');
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  });

  it('flushes a project-owner layout before exit and supports shell rename (AC1.29)', async () => {
    let api: BoardRoomControllerApi | null = null;
    const onExit = jest.fn().mockResolvedValue(undefined);
    render(
      <BoardRoomController
        owner={{ kind: 'project', id: 'project-1' }}
        boardId="board-project"
        onExit={onExit}
      >
        {(value) => {
          api = value;
          return (
            <div>
              <span data-testid="board-name">{value.state?.name}</span>
              <button type="button" onClick={() => value.moveItems({ 'item-1': { x: 510, y: 20 } })}>
                Queue layout
              </button>
              <button type="button" onClick={() => value.renameBoard('  Client-ready concept  ')}>
                Rename
              </button>
              <button type="button" onClick={() => { void value.requestExit(); }}>
                Done
              </button>
            </div>
          );
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Queue layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByTestId('board-name')).toHaveTextContent('Client-ready concept');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    expect(mockSaveLayout).toHaveBeenCalledWith(expect.objectContaining({
      boardId: 'board-project',
      owner: { kind: 'project', id: 'project-1' },
      positions: [expect.objectContaining({ id: 'item-1', x: 510, width: 200, height: 220 })],
    }));
    expect(mockUpsertBoard).toHaveBeenCalledWith(expect.objectContaining({
      boardId: 'board-project',
      owner: { kind: 'project', id: 'project-1' },
      name: 'Client-ready concept',
    }));
  });

  it('rejects a late canvas commit after delete and resurrects the same id on undo', async () => {
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="item-count">{value.state?.items.length ?? 0}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());
    act(() => api!.deleteItems(['item-1']));
    expect(screen.getByTestId('item-count')).toHaveTextContent('0');
    act(() => api!.moveItems({ 'item-1': { x: 999, y: 20 } }, 'stale-drag'));
    expect(screen.getByTestId('item-count')).toHaveTextContent('0');
    act(() => api!.undo());
    expect(api!.state?.items[0]).toMatchObject({ id: 'item-1', x: 10 });
    await waitFor(() => expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'item-1',
      owner: { kind: 'project', id: 'project-1' },
    })));
    expect(mockSaveLayout).not.toHaveBeenCalledWith(expect.objectContaining({
      positions: [expect.objectContaining({ id: 'item-1', x: 999 })],
    }));
  });
});
