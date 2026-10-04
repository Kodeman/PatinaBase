import { act, render, waitFor } from '@testing-library/react';
import type { EditableMoodBoardItem, MoodBoardSection } from '@patina/types';
import {
  BoardRoomController,
  type BoardRoomControllerApi,
} from '@/components/portal/scope-builder/board-room-controller';
import { resetProposalAutosaveRegistryForTests } from '@/lib/proposal-autosave-registry';

const mockApplyBoardRoomState = jest.fn();

const mockBoard = {
  id: 'board-1',
  proposal_id: null,
  project_id: 'project-1',
  name: 'Living room',
  scope_room_id: null,
  cover_image_url: null,
  canvas_width: 1200,
  canvas_height: 800,
  background_color: '#FAF8F5',
  sort_order: 0,
  sections: [],
  status: 'active',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  items: [
    {
      id: 'item-1',
      board_id: 'board-1',
      type: 'note',
      x: 10,
      y: 20,
      width: 200,
      height: 120,
      z_index: 0,
      rotation: 0,
      locked: false,
      product_id: null,
      capture_id: null,
      palette_id: null,
      image_url: null,
      content: 'Already here',
      data: {},
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    },
  ],
};

jest.mock('@patina/design-system', () => ({
  BoardRoomCanvas: () => <div data-testid="edit-canvas" />,
  BoardComposition: () => <div data-testid="present-composition" />,
}));

jest.mock('@patina/supabase', () => ({
  useBoard: () => ({ data: mockBoard, isLoading: false, error: null }),
  useSaveBoardLayout: () => ({ mutateAsync: jest.fn().mockResolvedValue(undefined) }),
  useUpsertBoard: () => ({ mutateAsync: jest.fn().mockResolvedValue(mockBoard) }),
  useApplyBoardRoomState: () => ({ mutateAsync: mockApplyBoardRoomState }),
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockApplyBoardRoomState.mockReset();
  mockApplyBoardRoomState.mockResolvedValue(undefined);
});

afterEach(() => {
  resetProposalAutosaveRegistryForTests();
  jest.useRealTimers();
});

function renderRoom(options: {
  onItemsDropped?: jest.Mock;
  onError?: jest.Mock;
} = {}) {
  let api: BoardRoomControllerApi | null = null;
  render(
    <BoardRoomController
      owner={{ kind: 'project', id: 'project-1' }}
      boardId="board-1"
      onItemsDropped={options.onItemsDropped}
      onError={options.onError}
    >
      {(value) => {
        api = value;
        return <div data-testid="edit-canvas-host" />;
      }}
    </BoardRoomController>,
  );
  return () => api;
}

describe('deck drop intercept (board room)', () => {
  it('hands a dropped deck to the room instead of failing image validation', async () => {
    const onItemsDropped = jest.fn().mockResolvedValue([]);
    const onError = jest.fn();
    const api = renderRoom({ onItemsDropped, onError });
    await waitFor(() => expect(api()?.canvasProps?.onItemsDropped).toBeDefined());

    const deck = new File(['pk'], 'Living Room.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    await act(async () => {
      api()!.canvasProps!.onItemsDropped!({ files: [deck], point: { x: 40, y: 40 } } as never);
    });
    expect(onError).not.toHaveBeenCalled();
    expect(onItemsDropped).toHaveBeenCalledWith(expect.objectContaining({ files: [deck] }));
  });

  it('still refuses a non-image, non-deck drop before upload', async () => {
    const onItemsDropped = jest.fn().mockResolvedValue([]);
    const onError = jest.fn();
    const api = renderRoom({ onItemsDropped, onError });
    await waitFor(() => expect(api()?.canvasProps?.onItemsDropped).toBeDefined());

    await act(async () => {
      api()!.canvasProps!.onItemsDropped!({
        files: [new File(['x'], 'brief.docx', { type: 'application/msword' })],
        point: { x: 0, y: 0 },
      } as never);
    });
    expect(onItemsDropped).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('is not supported'),
    }));
  });
});

describe('deck lay-out as one undo batch', () => {
  it('adds sections and pins in one command that a single undo removes', async () => {
    const api = renderRoom();
    await waitFor(() => expect(api()?.state).not.toBeNull());

    const sections: MoodBoardSection[] = [
      { id: 'section-a', name: 'Living room', x: 0, y: 236, width: 1200, height: 600 } as MoodBoardSection,
      { id: 'section-b', name: 'Primary bedroom', x: 0, y: 932, width: 1200, height: 600 } as MoodBoardSection,
    ];
    const items: EditableMoodBoardItem[] = [
      {
        id: 'pin-a', type: 'capture', x: 100, y: 300, width: 300, height: 200, zIndex: 1,
        rotation: 0, locked: false, content: null,
        data: { section_id: 'section-a', provenance: 'imported_deck', deck_import: { state: 'to_confirm' } },
      },
      {
        id: 'pin-b', type: 'image', x: 100, y: 2900, width: 300, height: 200, zIndex: 2,
        rotation: 0, locked: false, content: null,
        data: { section_id: 'section-b', provenance: 'imported_deck', deck_import: { state: 'reference' } },
      },
      {
        id: 'note-a', type: 'note', x: 100, y: 250, width: 200, height: 80, zIndex: 3,
        rotation: 0, locked: false, content: 'Warm oak throughout',
        data: { section_id: 'section-a', provenance: 'imported_deck' },
      },
    ] as EditableMoodBoardItem[];

    act(() => {
      api()!.addItems(items, { id: 'deck-1', sections, select: false, source: 'file_drop' });
    });
    expect(api()!.state!.sections.map((section) => section.name)).toEqual(['Living room', 'Primary bedroom']);
    expect(api()!.state!.items.map((item) => item.id)).toEqual(['item-1', 'pin-a', 'pin-b', 'note-a']);
    // The canvas grows to hold the lowest pin.
    expect(api()!.state!.canvasHeight).toBeGreaterThanOrEqual(3100);

    act(() => api()!.undo());
    expect(api()!.state!.sections).toEqual([]);
    expect(api()!.state!.items.map((item) => item.id)).toEqual(['item-1']);

    act(() => api()!.redo());
    expect(api()!.state!.items.map((item) => item.id)).toEqual(['item-1', 'pin-a', 'pin-b', 'note-a']);
    expect(api()!.state!.sections).toHaveLength(2);

    await act(async () => {
      await api()!.flushPending();
    });
    await waitFor(() => expect(mockApplyBoardRoomState).toHaveBeenLastCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        sections: expect.arrayContaining([expect.objectContaining({ id: 'section-a' })]),
        items: expect.arrayContaining([expect.objectContaining({ id: 'pin-a' })]),
      }),
    })));
  });
});
