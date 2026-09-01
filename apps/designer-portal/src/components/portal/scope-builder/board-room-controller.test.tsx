import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BoardRoomControllerApi } from './board-room-controller';
import { BoardRoomController, revertFailedStructuralTransition } from './board-room-controller';
import type { BoardRoomState } from './board-room-command-engine';
import { serializeBoardRoomSelection } from './board-room-command-engine';
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
const secondBoardRow = {
  ...mockBoard.items[0],
  id: 'item-2',
  x: 310,
  y: 120,
  width: 100,
  height: 100,
  z_index: 4,
  product_id: 'product-2',
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

  it('suspends mod+ edit shortcuts while a pointer gesture is in flight, and restores them on gesture end', async () => {
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

    // The canvas reports a gesture in flight (drag/resize/rotate/marquee/pan).
    act(() => mockCanvasProps!.onGestureActiveChange?.(true));
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    // Cmd+Z is a no-op: undo must not fire against gesture-local state that
    // hasn't committed, and this is also what the Ctrl/Cmd suppress-snap
    // modifier could otherwise collide with mid-drag.
    expect(screen.getByTestId('edit-canvas')).toHaveTextContent('edit-x:410;selected:1');

    // Pointer-up: the canvas reports the gesture has ended.
    act(() => mockCanvasProps!.onGestureActiveChange?.(false));
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(screen.getByTestId('edit-canvas')).toHaveTextContent('edit-x:10;selected:1');
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

  it('keeps a left/top rail drop visually anchored through undo and redo', async () => {
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="paste-items">{value.state?.items.length ?? 0}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());
    const serialized = serializeBoardRoomSelection({
      boardId: 'source-board',
      owner: { kind: 'project', id: 'project-1' },
      name: 'Rail source',
      canvasWidth: 100,
      canvasHeight: 100,
      backgroundColor: '#FAF8F5',
      sections: [],
      items: [{
        id: 'rail-source', type: 'image', x: 0, y: 0, width: 100, height: 100,
        zIndex: 0, rotation: 0, locked: false, productId: null, captureId: null,
        paletteId: null, imageUrl: 'https://cdn.example/rail.jpg', content: null, data: {},
      }],
    }, ['rail-source']);

    await act(async () => {
      await api!.pasteAt({ x: -50, y: -30 }, serialized!, 'rail_drag');
    });
    expect(screen.getByTestId('paste-items')).toHaveTextContent('2');
    expect(api!.view.pan).toEqual({ x: -258, y: -238 });

    act(() => api!.undo());
    expect(screen.getByTestId('paste-items')).toHaveTextContent('1');
    expect(api!.view.pan).toEqual({ x: 32, y: 32 });

    act(() => api!.redo());
    expect(screen.getByTestId('paste-items')).toHaveTextContent('2');
    expect(api!.view.pan).toEqual({ x: -258, y: -238 });
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

  it('coalesces direct drag growth and compensates pan once through undo and redo (AC1.8)', async () => {
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
    act(() => {
      const canvas = api!.canvasProps!;
      canvas.onItemsMoved?.({
        itemIds: ['item-1'],
        before: [{ id: 'item-1', x: 10, y: 20 }],
        after: [{ id: 'item-1', x: -40, y: -30 }],
        delta: { x: -50, y: -50 },
        reason: 'drag',
        guides: [],
      });
      canvas.onCanvasGrow?.({
        grew: true,
        canvas: { width: 1480, height: 1070 },
        translation: { x: 280, y: 270 },
        items: [{ key: 'item-1', id: 'item-1', x: 240, y: 240 }],
        reason: 'move',
      });
    });
    expect(screen.getByTestId('pan')).toHaveTextContent('-248,-238');
    expect(api!.state).toMatchObject({ canvasWidth: 1480, canvasHeight: 1070 });
    expect(api!.state?.items[0]).toMatchObject({ x: 240, y: 240 });

    act(() => api!.undo());
    expect(api!.state).toMatchObject({ canvasWidth: 1200, canvasHeight: 800 });
    expect(api!.state?.items[0]).toMatchObject({ x: 10, y: 20 });
    expect(api!.view.pan).toEqual({ x: 32, y: 32 });
    expect(api!.canUndo).toBe(false);

    act(() => api!.undo());
    expect(api!.view.pan).toEqual({ x: 32, y: 32 });

    act(() => api!.redo());
    expect(api!.state).toMatchObject({ canvasWidth: 1480, canvasHeight: 1070 });
    expect(api!.state?.items[0]).toMatchObject({ x: 240, y: 240 });
    expect(api!.view.pan).toEqual({ x: -248, y: -238 });
    expect(api!.canRedo).toBe(false);

    act(() => api!.redo());
    expect(api!.view.pan).toEqual({ x: -248, y: -238 });

    await act(async () => {
      await api!.flushPending();
    });
  });

  it('accumulates repeated growth across a later no-growth coalesce', async () => {
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="cumulative-pan">{value.view.pan.x},{value.view.pan.y}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.canvasProps).not.toBeNull());

    act(() => {
      const canvas = api!.canvasProps!;
      canvas.onItemsMoved?.({
        itemIds: ['item-1'],
        before: [{ id: 'item-1', x: 10, y: 20 }],
        after: [{ id: 'item-1', x: -40, y: -30 }],
        delta: { x: -50, y: -50 },
        reason: 'keyboard',
        guides: [],
      });
      canvas.onCanvasGrow?.({
        grew: true,
        canvas: { width: 1480, height: 1070 },
        translation: { x: 280, y: 270 },
        items: [{ key: 'item-1', id: 'item-1', x: 240, y: 240 }],
        reason: 'move',
      });
      canvas.onCanvasGrow?.({
        grew: true,
        canvas: { width: 1500, height: 1080 },
        translation: { x: 20, y: 10 },
        items: [{ key: 'item-1', id: 'item-1', x: 260, y: 250 }],
        reason: 'move',
      });
      canvas.onItemsMoved?.({
        itemIds: ['item-1'],
        before: [{ id: 'item-1', x: 260, y: 250 }],
        after: [{ id: 'item-1', x: 210, y: 200 }],
        delta: { x: -50, y: -50 },
        reason: 'keyboard',
        guides: [],
      });
    });

    expect(api!.view.pan).toEqual({ x: -268, y: -248 });
    expect(api!.state).toMatchObject({ canvasWidth: 1500, canvasHeight: 1080 });
    expect(api!.state?.items[0]).toMatchObject({ x: 210, y: 200 });

    act(() => api!.undo());
    expect(api!.view.pan).toEqual({ x: 32, y: 32 });
    expect(api!.state?.items[0]).toMatchObject({ x: 10, y: 20 });
    expect(api!.canUndo).toBe(false);

    act(() => api!.redo());
    expect(api!.view.pan).toEqual({ x: -268, y: -248 });
    expect(api!.state?.items[0]).toMatchObject({ x: 210, y: 200 });

    await act(async () => {
      await api!.flushPending();
    });
  });

  it('does not apply stale compensation when a nudge id is reused after 500ms', async () => {
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="reused-id-pan">{value.view.pan.x},{value.view.pan.y}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.canvasProps).not.toBeNull());

    act(() => {
      const canvas = api!.canvasProps!;
      canvas.onItemsMoved?.({
        itemIds: ['item-1'],
        before: [{ id: 'item-1', x: 10, y: 20 }],
        after: [{ id: 'item-1', x: 9, y: 20 }],
        delta: { x: -1, y: 0 },
        reason: 'keyboard',
        guides: [],
      });
      canvas.onCanvasGrow?.({
        grew: true,
        canvas: { width: 1480, height: 1070 },
        translation: { x: 280, y: 270 },
        items: [{ key: 'item-1', id: 'item-1', x: 289, y: 290 }],
        reason: 'move',
      });
    });
    expect(api!.view.pan).toEqual({ x: -248, y: -238 });

    act(() => {
      jest.advanceTimersByTime(501);
      api!.canvasProps!.onItemsMoved?.({
        itemIds: ['item-1'],
        before: [{ id: 'item-1', x: 289, y: 290 }],
        after: [{ id: 'item-1', x: 288, y: 290 }],
        delta: { x: -1, y: 0 },
        reason: 'keyboard',
        guides: [],
      });
    });

    act(() => api!.undo());
    expect(api!.view.pan).toEqual({ x: -248, y: -238 });
    expect(api!.state?.items[0]).toMatchObject({ x: 289, y: 290 });

    act(() => api!.undo());
    expect(api!.view.pan).toEqual({ x: 32, y: 32 });
    expect(api!.state?.items[0]).toMatchObject({ x: 10, y: 20 });

    act(() => api!.redo());
    expect(api!.view.pan).toEqual({ x: -248, y: -238 });
    act(() => api!.redo());
    expect(api!.view.pan).toEqual({ x: -248, y: -238 });
    expect(api!.state?.items[0]).toMatchObject({ x: 288, y: 290 });

    await act(async () => {
      await api!.flushPending();
    });
  });

  it('reverses direct coalesced growth compensation once when persistence rolls back', async () => {
    const onError = jest.fn();
    mockApplyBoardRoomState.mockRejectedValue(
      new Error('injected growth transaction failure'),
    );
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController
        owner={{ kind: 'project', id: 'project-1' }}
        boardId="board-project"
        onError={onError}
      >
        {(value) => {
          api = value;
          return <span data-testid="rollback-pan">{value.view.pan.x},{value.view.pan.y}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.canvasProps).not.toBeNull());

    act(() => {
      const canvas = api!.canvasProps!;
      const created = canvas.onItemsAltDragged?.({
        itemIds: ['item-1'],
        before: [{ id: 'item-1', x: 10, y: 20 }],
        after: [{ id: 'item-1', x: -50, y: -30 }],
        delta: { x: -60, y: -50 },
        guides: [],
      }) ?? [];
      expect(created).toHaveLength(1);
      canvas.onCanvasGrow?.({
        grew: true,
        canvas: { width: 1490, height: 1070 },
        translation: { x: 290, y: 270 },
        items: [
          { key: 'item-1', id: 'item-1', x: 300, y: 290 },
          { key: created[0], id: created[0], x: 240, y: 240 },
        ],
        reason: 'move',
      });
    });
    expect(screen.getByTestId('rollback-pan')).toHaveTextContent('-258,-238');
    expect(api!.state).toMatchObject({ canvasWidth: 1490, canvasHeight: 1070 });
    expect(api!.state?.items).toHaveLength(2);

    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(api!.state).toMatchObject({ canvasWidth: 1200, canvasHeight: 800 });
      expect(api!.state?.items).toEqual([
        expect.objectContaining({ id: 'item-1', x: 10, y: 20 }),
      ]);
      expect(api!.view.pan).toEqual({ x: 32, y: 32 });
    });
    expect(onError).toHaveBeenCalled();
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
    mockApplyBoardRoomState.mockClear();

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
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenLastCalledWith(expect.objectContaining({
      state: expect.objectContaining({ items: expect.arrayContaining([
        expect.objectContaining({ id: 'item-1', x: 32 }),
        expect.objectContaining({ id: 'item-2', x: 272 }),
      ]) }),
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
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  });

  it('leaves the board only on a second Escape within the confirmation window', async () => {
    const onExit = jest.fn().mockResolvedValue(undefined);
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController
        owner={{ kind: 'project', id: 'project-1' }}
        boardId="board-project"
        onExit={onExit}
      >
        {(value) => {
          api = value;
          return <span data-testid="escape-announcement">{value.announcement}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByTestId('escape-announcement'))
      .toHaveTextContent('Press Escape again to leave the board');

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  });

  it('re-arms instead of exiting once the Escape confirmation window lapses', async () => {
    const onExit = jest.fn().mockResolvedValue(undefined);
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController
        owner={{ kind: 'project', id: 'project-1' }}
        boardId="board-project"
        onExit={onExit}
      >
        {(value) => {
          api = value;
          return <span data-testid="lapsed-announcement">{value.announcement}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('lapsed-announcement'))
      .toHaveTextContent('Press Escape again to leave the board');
    act(() => { jest.advanceTimersByTime(1_600); });
    fireEvent.keyDown(window, { key: 'Escape' });
    await act(async () => { await Promise.resolve(); });
    expect(onExit).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  });

  it('re-announces the exit prompt after the confirmation window lapses', async () => {
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="rearm-announcement">{value.announcement}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('rearm-announcement'))
      .toHaveTextContent('Press Escape again to leave the board');

    // The prompt retires with the window it describes, which is also what lets
    // the live region speak it again rather than bail on an identical string.
    act(() => { jest.advanceTimersByTime(1_600); });
    expect(screen.getByTestId('rearm-announcement')).toBeEmptyDOMElement();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('rearm-announcement'))
      .toHaveTextContent('Press Escape again to leave the board');
  });

  it('promotes a recreated item’s drag while its create is queued behind the delete', async () => {
    mockBoardResult = { ...mockBoard, items: [...mockBoard.items, secondBoardRow] };
    let settleDelete: () => void = () => undefined;
    mockApplyBoardRoomState.mockImplementationOnce(
      () => new Promise<void>((resolve) => { settleDelete = () => resolve(); }),
    );
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="recreated-items">{value.state?.items.map((item) => item.id).join(',')}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());

    act(() => api!.deleteItems(['item-2']));
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(1));
    act(() => api!.undo());
    expect(screen.getByTestId('recreated-items')).toHaveTextContent('item-1,item-2');
    act(() => api!.moveItems({ 'item-2': { x: 700, y: 120 } }));
    await act(async () => { jest.advanceTimersByTime(700); });
    expect(mockSaveLayout).not.toHaveBeenCalled();

    // The delete told the server to forget item-2, so the undo's recreate is
    // unsent: its geometry rides the queued full-state write, never a layout
    // upsert that would land ahead of the create as a partial row.
    await act(async () => { settleDelete(); await Promise.resolve(); });
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(3));
    expect(mockSaveLayout).not.toHaveBeenCalled();
    expect(mockApplyBoardRoomState).toHaveBeenLastCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ id: 'item-2', x: 700, y: 120 }),
        ]),
      }),
    }));
  });

  it('keeps a restored item on the atomic project path after its delete write fails', async () => {
    mockBoardResult = { ...mockBoard, items: [...mockBoard.items, secondBoardRow] };
    const onError = jest.fn();
    let failDelete: (error: Error) => void = () => undefined;
    mockApplyBoardRoomState.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => { failDelete = reject; }),
    );
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController
        owner={{ kind: 'project', id: 'project-1' }}
        boardId="board-project"
        onError={onError}
      >
        {(value) => {
          api = value;
          return <span data-testid="restored-items">{value.state?.items.map((item) => item.id).join(',')}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());

    act(() => api!.deleteItems(['item-2']));
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(1));
    await act(async () => {
      failDelete(new Error('injected transaction failure'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(screen.getByTestId('restored-items')).toHaveTextContent('item-1,item-2');

    // Project geometry still leaves through the complete-state RPC.
    act(() => api!.moveItems({ 'item-2': { x: 700, y: 120 } }));
    await act(async () => { jest.advanceTimersByTime(700); });
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(2));
    expect(mockSaveLayout).not.toHaveBeenCalled();
    expect(mockApplyBoardRoomState).toHaveBeenLastCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ id: 'item-2', x: 700 })]),
      }),
    }));
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
    expect(mockSaveLayout).not.toHaveBeenCalled();
    expect(mockApplyBoardRoomState).toHaveBeenCalledWith(expect.objectContaining({
      boardId: 'board-project',
      owner: { kind: 'project', id: 'project-1' },
      state: expect.objectContaining({
        name: 'Client-ready concept',
        items: expect.arrayContaining([
          expect.objectContaining({ id: 'item-1', x: 510, width: 200, height: 220 }),
        ]),
      }),
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

  it('keeps an unrelated drag on the atomic project path behind an in-flight delete', async () => {
    mockBoardResult = { ...mockBoard, items: [...mockBoard.items, secondBoardRow] };
    let settleDelete: () => void = () => undefined;
    mockApplyBoardRoomState.mockImplementationOnce(
      () => new Promise<void>((resolve) => { settleDelete = () => resolve(); }),
    );
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="gated-items">{value.state?.items.map((item) => item.id).join(',')}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());

    act(() => api!.deleteItems(['item-2']));
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(1));
    act(() => api!.moveItems({ 'item-1': { x: 640, y: 20 } }));
    await act(async () => { jest.advanceTimersByTime(700); });

    // The second complete-state command waits behind the in-flight delete.
    expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(1);
    expect(mockSaveLayout).not.toHaveBeenCalled();

    await act(async () => { settleDelete(); await Promise.resolve(); });
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(2));
    expect(mockApplyBoardRoomState).toHaveBeenLastCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        items: [expect.objectContaining({ id: 'item-1', x: 640 })],
      }),
    }));
  });

  it('orders a new item’s dragged geometry behind the create write', async () => {
    let settleCreate: () => void = () => undefined;
    mockApplyBoardRoomState.mockImplementationOnce(
      () => new Promise<void>((resolve) => { settleCreate = () => resolve(); }),
    );
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="created-items">{value.state?.items.map((item) => item.id).join(',')}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());

    act(() => api!.addItems([{
      id: 'item-new', type: 'note', x: 300, y: 40, width: 160, height: 100,
      zIndex: 1, rotation: 0, locked: false, content: 'New', data: {},
    }]));
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(1));
    act(() => api!.moveItems({ 'item-new': { x: 520, y: 90 } }));
    await act(async () => { jest.advanceTimersByTime(700); });
    expect(mockSaveLayout).not.toHaveBeenCalled();

    await act(async () => { settleCreate(); await Promise.resolve(); });
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(2));
    expect(mockApplyBoardRoomState).toHaveBeenLastCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ id: 'item-new', x: 520 })]),
      }),
    }));
  });

  it('promotes geometry for an item whose create has not reached the server yet', async () => {
    let settleFirst: () => void = () => undefined;
    mockApplyBoardRoomState.mockImplementationOnce(
      () => new Promise<void>((resolve) => { settleFirst = () => resolve(); }),
    );
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="fresh-items">{value.state?.items.map((item) => item.id).join(',')}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());

    act(() => {
      api!.addItems([{
        id: 'item-fresh', type: 'note', x: 300, y: 40, width: 160, height: 100,
        zIndex: 1, rotation: 0, locked: false, content: 'Fresh', data: {},
      }]);
      api!.moveItems({ 'item-fresh': { x: 520, y: 90 } });
    });
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(1));
    await act(async () => { settleFirst(); jest.advanceTimersByTime(700); });

    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(2));
    expect(mockSaveLayout).not.toHaveBeenCalled();
    expect(mockApplyBoardRoomState).toHaveBeenLastCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ id: 'item-fresh', x: 520, y: 90 }),
        ]),
      }),
    }));
  });

  it('persists an uninvolved item’s geometry after the structural write fails', async () => {
    mockBoardResult = { ...mockBoard, items: [...mockBoard.items, secondBoardRow] };
    const onError = jest.fn();
    let failDelete: (error: Error) => void = () => undefined;
    mockApplyBoardRoomState.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => { failDelete = reject; }),
    );
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController
        owner={{ kind: 'project', id: 'project-1' }}
        boardId="board-project"
        onError={onError}
      >
        {(value) => {
          api = value;
          return <span data-testid="reverted-items">{value.state?.items.map((item) => item.id).join(',')}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());

    act(() => api!.deleteItems(['item-2']));
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(1));
    act(() => api!.moveItems({ 'item-1': { x: 640, y: 20 } }));
    await act(async () => { jest.advanceTimersByTime(700); });
    expect(mockSaveLayout).not.toHaveBeenCalled();

    await act(async () => {
      failDelete(new Error('injected transaction failure'));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenCalledTimes(2));
    expect(mockApplyBoardRoomState).toHaveBeenLastCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ id: 'item-1', x: 640 }),
          expect.objectContaining({ id: 'item-2' }),
        ]),
      }),
    }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(screen.getByTestId('reverted-items')).toHaveTextContent('item-1,item-2');
  });
  it('surfaces the exit guard as a visible prompt flag, not only a spoken one (CI-20)', async () => {
    const onExit = jest.fn().mockResolvedValue(undefined);
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController
        owner={{ kind: 'project', id: 'project-1' }}
        boardId="board-project"
        onExit={onExit}
      >
        {(value) => {
          api = value;
          return <span data-testid="exit-armed">{String(value.exitPromptArmed)}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());
    expect(screen.getByTestId('exit-armed')).toHaveTextContent('false');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('exit-armed')).toHaveTextContent('true');

    // It retires with the window, so the visible chip never lingers.
    act(() => { jest.advanceTimersByTime(1_600); });
    expect(screen.getByTestId('exit-armed')).toHaveTextContent('false');
  });

  it('keeps the exit chip armed while other announcements come and go (A5)', async () => {
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return (
            <>
              <span data-testid="armed">{String(value.exitPromptArmed)}</span>
              <span data-testid="said">{value.announcement}</span>
            </>
          );
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('armed')).toHaveTextContent('true');

    // Anything else speaking must not silently disarm the guard — the old
    // string-equality derivation hid the chip here while Escape stayed live.
    act(() => api!.announce('1 item selected'));
    expect(screen.getByTestId('said')).toHaveTextContent('1 item selected');
    expect(screen.getByTestId('armed')).toHaveTextContent('true');
  });

  it('retires a stale announcement so it cannot sit in the live region (A4)', async () => {
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="stale">{value.announcement}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());

    act(() => api!.announce('Moved 2 items 10 pixels'));
    expect(screen.getByTestId('stale')).toHaveTextContent('Moved 2 items 10 pixels');
    act(() => { jest.advanceTimersByTime(5_100); });
    expect(screen.getByTestId('stale')).toBeEmptyDOMElement();
  });

  it('announces board changes in human copy, not command-engine vocabulary (CI-14)', async () => {
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="human-announcement">{value.announcement}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());

    act(() => api!.moveItems({ 'item-1': { x: 640, y: 20 } }));
    expect(screen.getByTestId('human-announcement')).toHaveTextContent('Moved');
    expect(screen.getByTestId('human-announcement')).not.toHaveTextContent('applied');

    act(() => api!.toggleLock(['item-1']));
    expect(screen.getByTestId('human-announcement')).toHaveTextContent('Lock changed');

    act(() => api!.undo());
    expect(screen.getByTestId('human-announcement')).toHaveTextContent('Undid: lock changed');
    // The engine's own kind strings never reach a listener.
    expect(screen.getByTestId('human-announcement')).not.toHaveTextContent('z order');
  });

  it('lets the canvas speak through the room\u2019s one live region (CI-14)', async () => {
    let api: BoardRoomControllerApi | null = null;
    render(
      <BoardRoomController owner={{ kind: 'project', id: 'project-1' }} boardId="board-project">
        {(value) => {
          api = value;
          return <span data-testid="routed-announcement">{value.announcement}</span>;
        }}
      </BoardRoomController>,
    );
    await waitFor(() => expect(api?.state).not.toBeNull());

    act(() => api!.announce('Moved 2 items 10 pixels'));
    expect(screen.getByTestId('routed-announcement')).toHaveTextContent('Moved 2 items 10 pixels');
  });
});
