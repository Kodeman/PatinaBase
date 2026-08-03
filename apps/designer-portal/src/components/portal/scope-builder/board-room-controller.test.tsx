import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BoardRoomControllerApi } from './board-room-controller';
import { BoardRoomController, revertFailedStructuralTransition } from './board-room-controller';
import type { BoardRoomState } from './board-room-command-engine';
import { resetProposalAutosaveRegistryForTests } from '@/lib/proposal-autosave-registry';

const mockSaveLayout = jest.fn();
const mockUpsertBoard = jest.fn();
const mockApplyBoardRoomState = jest.fn();
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
let mockBoardResult = mockBoard;

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
  useBoard: () => ({ data: mockBoardResult, isLoading: false, error: null }),
  useSaveBoardLayout: () => ({ mutateAsync: mockSaveLayout }),
  useUpsertBoard: () => ({ mutateAsync: mockUpsertBoard }),
  useApplyBoardRoomState: () => ({ mutateAsync: mockApplyBoardRoomState }),
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockCanvasProps = null;
  mockBoardResult = mockBoard;
  mockSaveLayout.mockResolvedValue(undefined);
  mockUpsertBoard.mockResolvedValue(mockBoard);
  mockApplyBoardRoomState.mockResolvedValue(undefined);
});

afterEach(() => {
  resetProposalAutosaveRegistryForTests();
  jest.useRealTimers();
});

describe('BoardRoomController binding', () => {
  it('three-way reverts a failed structural command without clobbering later unrelated edits', () => {
    const item = {
      id: 'item-1', type: 'note' as const, x: 10, y: 20, width: 200, height: 120,
      zIndex: 0, rotation: 0, locked: false, productId: null, captureId: null,
      paletteId: null, imageUrl: null, content: 'Before', data: {},
    };
    const before: BoardRoomState = {
      boardId: 'board-project', owner: { kind: 'project', id: 'project-1' },
      name: 'Before', canvasWidth: 1200, canvasHeight: 800,
      backgroundColor: '#fff', sections: [], items: [item],
    };
    const added = { ...item, id: 'item-added', content: 'Failed add', zIndex: 1 };
    const after: BoardRoomState = { ...before, name: 'Failed rename', items: [item, added] };
    const later = { ...item, id: 'item-later', content: 'Later local edit', zIndex: 2 };
    const current: BoardRoomState = { ...after, items: [item, { ...added, content: 'Edited later' }, later] };

    expect(revertFailedStructuralTransition(current, before, after)).toMatchObject({
      name: 'Before',
      items: [item, later],
    });
  });

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

    await act(async () => {
      fireEvent.keyDown(window, { key: 'p' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('present-composition')).toHaveTextContent('present-x:410');
    act(() => fireEvent.keyDown(window, { key: 'p' }));
    expect(screen.getByTestId('edit-canvas')).toHaveTextContent('edit-x:410;selected:1');

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(screen.getByTestId('edit-canvas')).toHaveTextContent('edit-x:10;selected:1');
    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
    expect(screen.getByTestId('edit-canvas')).toHaveTextContent('edit-x:410;selected:1');
    expect(mockCanvasProps).not.toBeNull();
  });

  it('wires Alt-drag through one structural duplicate command and preserves the original', async () => {
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="alt-items">{value.state?.items.length}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.canvasProps).not.toBeNull());

    let created: readonly string[] = [];
    act(() => {
      created = api!.canvasProps!.onItemsAltDragged?.({
        itemIds: ['item-1'],
        before: [{ id: 'item-1', x: 10, y: 20 }],
        after: [{ id: 'item-1', x: 110, y: 70 }],
        delta: { x: 100, y: 50 },
        guides: [],
      }) ?? [];
    });

    expect(created).toHaveLength(1);
    expect(api!.state?.items.find((item) => item.id === 'item-1')).toMatchObject({ x: 10, y: 20 });
    expect(api!.state?.items.find((item) => item.id === created[0])).toMatchObject({ x: 110, y: 70 });
    act(() => api!.undo());
    expect(screen.getByTestId('alt-items')).toHaveTextContent('1');
  });

  it('commits drag promotion with position and group resize patches as single undo steps', async () => {
    mockBoardResult = {
      ...mockBoard,
      items: [
        ...mockBoard.items,
        {
          ...mockBoard.items[0],
          id: 'item-2',
          x: 310,
          y: 120,
          width: 100,
          height: 100,
          z_index: 4,
          product_id: 'product-2',
        },
      ],
    };
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="gesture-state">{value.state?.items.map((item) => `${item.id}:${item.x}:${item.width}:${item.zIndex}`).join('|')}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.canvasProps).not.toBeNull());

    act(() => api!.canvasProps!.onItemsMoved?.({
      itemIds: ['item-1'],
      before: [{ id: 'item-1', x: 10, y: 20 }],
      after: [{ id: 'item-1', x: 60, y: 30 }],
      delta: { x: 50, y: 10 },
      reason: 'drag',
      guides: [],
      zIndexPatches: [{ id: 'item-1', zIndex: 5 }],
    }));
    expect(api!.state?.items[0]).toMatchObject({ x: 60, y: 30, zIndex: 5 });
    act(() => api!.undo());
    expect(api!.state?.items[0]).toMatchObject({ x: 10, y: 20, zIndex: 0 });

    act(() => api!.canvasProps!.onItemsResized?.({
      itemIds: ['item-1', 'item-2'],
      handle: 'se',
      before: [
        { id: 'item-1', x: 10, y: 20, width: 200, height: 220, resolvedHeight: 220 },
        { id: 'item-2', x: 310, y: 120, width: 100, height: 100, resolvedHeight: 100 },
      ],
      after: [
        { id: 'item-1', x: 10, y: 20, width: 300, height: 330, resolvedHeight: 330 },
        { id: 'item-2', x: 460, y: 170, width: 150, height: 150, resolvedHeight: 150 },
      ],
      guides: [],
    }));
    expect(api!.state?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'item-1', width: 300, height: 330 }),
      expect.objectContaining({ id: 'item-2', x: 460, width: 150, height: 150 }),
    ]));
    act(() => api!.undo());
    expect(api!.state?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'item-1', width: 200, height: 220 }),
      expect.objectContaining({ id: 'item-2', x: 310, width: 100, height: 100 }),
    ]));
  });

  it('keeps Present immutable when undo shortcuts are pressed', async () => {
    render(
      <BoardRoomController
        owner={{ kind: 'project', id: 'project-1' }}
        boardId="board-project"
      />,
    );
    await screen.findByTestId('edit-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Move item' }));
    await act(async () => {
      fireEvent.keyDown(window, { key: 'p' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('present-composition')).toHaveTextContent('present-x:410');
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(screen.getByTestId('present-composition')).toHaveTextContent('present-x:410');
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

  it('routes band drag and inline section edits through undoable persisted commands (AC1.27)', async () => {
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="section-state">{value.state?.sections[0]?.name}:{value.state?.items[0]?.x}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.canvasProps).not.toBeNull());

    act(() => api!.updateSections({
      type: 'create',
      section: { id: 'living', name: 'Living', color: '#a66d4f' },
    }));
    act(() => api!.setSectionMembership('item-1', 'living'));
    act(() => api!.canvasProps!.onSectionBandMoved?.({
      sectionId: 'living',
      itemIds: ['item-1'],
      delta: { x: 50, y: 30 },
    }));
    expect(api!.state?.items[0]).toMatchObject({ x: 60, y: 50 });

    act(() => api!.undo());
    expect(api!.state?.items[0]).toMatchObject({
      x: 10,
      y: 20,
      data: expect.objectContaining({ section_id: 'living' }),
    });

    act(() => api!.canvasProps!.onSectionUpdated?.({
      sectionId: 'living',
      patch: { name: 'Conversation area', color: '#526b5f' },
    }));
    expect(screen.getByTestId('section-state')).toHaveTextContent('Conversation area:10');
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenLastCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        sections: [expect.objectContaining({
          id: 'living',
          name: 'Conversation area',
          color: '#526b5f',
        })],
      }),
    })));
  });

  it('coalesces transient Tidy spacing into one undo step and persists the final gap', async () => {
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="tidy-positions">{value.state?.items.map((item) => item.x).join(',')}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());
    act(() => api!.addItems([{
      id: 'item-2', type: 'note', x: 500, y: 20, width: 100, height: 100,
      zIndex: 1, rotation: 0, locked: false, content: 'Second', data: {},
    }]));
    expect(screen.getByTestId('tidy-positions')).toHaveTextContent('10,500');
    await act(async () => {
      await api!.flushPending();
    });
    mockSaveLayout.mockClear();

    act(() => api!.tidy([], { gap: 24, gestureId: 'tidy-spacing', committedAt: 1 }));
    act(() => api!.tidy([], { gap: 40, gestureId: 'tidy-spacing', committedAt: 1 }));
    expect(screen.getByTestId('tidy-positions')).toHaveTextContent('32,272');

    act(() => api!.undo());
    expect(screen.getByTestId('tidy-positions')).toHaveTextContent('10,500');
    act(() => api!.redo());
    expect(screen.getByTestId('tidy-positions')).toHaveTextContent('32,272');

    await act(async () => {
      await api!.flushPending();
    });
    await waitFor(() => expect(mockSaveLayout).toHaveBeenLastCalledWith(expect.objectContaining({
      positions: expect.arrayContaining([
        expect.objectContaining({ id: 'item-1', x: 32 }),
        expect.objectContaining({ id: 'item-2', x: 272 }),
      ]),
    })));
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
    await act(async () => {
      fireEvent.keyDown(window, { key: 'p' });
      await Promise.resolve();
      await Promise.resolve();
    });
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
    expect(mockApplyBoardRoomState).toHaveBeenCalledWith(expect.objectContaining({
      boardId: 'board-project',
      owner: { kind: 'project', id: 'project-1' },
      state: expect.objectContaining({ name: 'Client-ready concept' }),
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
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenLastCalledWith(expect.objectContaining({
      owner: { kind: 'project', id: 'project-1' },
      state: expect.objectContaining({
        items: [expect.objectContaining({ id: 'item-1' })],
      }),
    })));
    expect(mockSaveLayout).not.toHaveBeenCalledWith(expect.objectContaining({
      positions: [expect.objectContaining({ id: 'item-1', x: 999 })],
    }));
  });

  it('rebases a queued structural snapshot after the earlier command rolls back', async () => {
    let api: BoardRoomControllerApi | null = null;
    let rejectFirst: (error: Error) => void = () => undefined;
    const first = new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
    mockApplyBoardRoomState
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);

    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="queued-items">{value.state?.items.map((item) => item.id).join(',')}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());
    act(() => {
      api!.addItems([{
        id: 'failed-a', type: 'note', x: 280, y: 20, width: 160, height: 100,
        zIndex: 1, rotation: 0, locked: false, content: 'A', data: {},
      }]);
    });
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(1));
    act(() => {
      api!.addItems([{
        id: 'kept-b', type: 'note', x: 470, y: 20, width: 160, height: 100,
        zIndex: 2, rotation: 0, locked: false, content: 'B', data: {},
      }]);
    });
    await act(async () => {
      rejectFirst(new Error('injected transaction failure'));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('queued-items')).toHaveTextContent('item-1,kept-b');
    expect(screen.getByTestId('queued-items')).not.toHaveTextContent('failed-a');
    expect(mockApplyBoardRoomState).toHaveBeenLastCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        items: [
          expect.objectContaining({ id: 'item-1' }),
          expect.objectContaining({ id: 'kept-b' }),
        ],
      }),
    }));
  });
});
