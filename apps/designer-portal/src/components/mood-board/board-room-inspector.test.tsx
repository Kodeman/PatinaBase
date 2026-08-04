import { fireEvent, render, screen } from '@testing-library/react';
import type { BoardRoomControllerApi } from '@/components/portal/scope-builder/board-room-controller';
import {
  BoardRoomInspector,
  resolveBoardRoomInspectorPosition,
} from './board-room-inspector';

function controllerApi(): BoardRoomControllerApi {
  return {
    state: {
      boardId: 'board-1',
      owner: { kind: 'proposal', id: 'proposal-1' },
      name: 'Concept',
      canvasWidth: 1200,
      canvasHeight: 800,
      backgroundColor: '#faf8f5',
      sections: [
        { id: 'living', name: 'Living', color: '#a66d4f' },
        { id: 'dining', name: 'Dining', color: '#526b5f' },
      ],
      items: [
        {
          id: 'chair', type: 'product', x: 100, y: 100, width: 200, height: 220,
          zIndex: 1, rotation: 15, locked: false, data: { section_id: 'living', name: 'Chair' },
        },
        {
          id: 'rug', type: 'image', x: 360, y: 120, width: 240, height: 160,
          zIndex: 2, rotation: 0, locked: true, data: { section_id: 'dining', name: 'Rug' },
        },
      ],
    },
    mode: 'edit',
    showNotes: true,
    view: { pan: { x: 0, y: 0 }, zoom: 1 },
    selectedItemIds: ['chair', 'rug'],
    focusedItemId: null,
    contextMenu: null,
    isLoading: false,
    isExiting: false,
    persistenceState: 'idle',
    persistenceError: null,
    announcement: '',
    canUndo: true,
    canRedo: false,
    canvasProps: null,
    compositionBoard: null,
    setMode: jest.fn(),
    togglePresent: jest.fn(),
    setShowNotes: jest.fn(),
    setSelection: jest.fn(),
    setFocusedItemId: jest.fn(),
    closeContextMenu: jest.fn(),
    flushPending: jest.fn().mockResolvedValue(undefined),
    requestExit: jest.fn().mockResolvedValue(true),
    undo: jest.fn(),
    redo: jest.fn(),
    addItems: jest.fn().mockReturnValue([]),
    deleteItems: jest.fn(),
    duplicateItems: jest.fn().mockReturnValue([]),
    altDragItems: jest.fn().mockReturnValue([]),
    copyItems: jest.fn().mockResolvedValue(null),
    cutItems: jest.fn().mockResolvedValue(undefined),
    pasteAt: jest.fn().mockResolvedValue([]),
    moveItems: jest.fn(),
    resizeItem: jest.fn(),
    rotateItem: jest.fn(),
    alignItems: jest.fn(),
    distributeItems: jest.fn(),
    nudgeItems: jest.fn(),
    changeZOrder: jest.fn(),
    toggleLock: jest.fn(),
    updateItem: jest.fn(),
    replaceItem: jest.fn(),
    renameBoard: jest.fn(),
    tidy: jest.fn(),
    setSectionMembership: jest.fn(),
    setItemsSectionMembership: jest.fn(),
    updateSections: jest.fn(),
    moveSectionBand: jest.fn(),
    trimCanvas: jest.fn(),
    discardPersistenceError: jest.fn(),
  };
}

describe('BoardRoomInspector multi-selection', () => {
  it('shows shared lock, section, align, distribute, and delete controls only', () => {
    const api = controllerApi();
    render(
      <div className="relative h-[600px] w-[800px]">
        <BoardRoomInspector api={api} />
      </div>,
    );

    expect(screen.getByText('2 pins')).toBeInTheDocument();
    expect(screen.queryByLabelText('Width')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Rotation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Left' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'H gaps' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lock 2 pins' }));
    expect(api.toggleLock).toHaveBeenCalledWith(['chair', 'rug']);

    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'living' } });
    expect(api.setItemsSectionMembership).toHaveBeenCalledWith(['chair', 'rug'], 'living');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(api.deleteItems).toHaveBeenCalled();
  });
});

describe('resolveBoardRoomInspectorPosition', () => {
  it('flips left and above when right/bottom placement would leave the workspace', () => {
    expect(resolveBoardRoomInspectorPosition({
      selection: { x: 700, y: 500, width: 80, height: 60 },
      view: { pan: { x: 0, y: 0 }, zoom: 1 },
      workspace: { width: 800, height: 600 },
      panel: { width: 286, height: 200 },
    })).toEqual({
      left: 396,
      top: 282,
      horizontal: 'left',
      vertical: 'above',
    });
  });

  it('keeps the normal right/aligned placement when it fits', () => {
    expect(resolveBoardRoomInspectorPosition({
      selection: { x: 100, y: 80, width: 120, height: 100 },
      view: { pan: { x: 10, y: 20 }, zoom: 1 },
      workspace: { width: 900, height: 700 },
      panel: { width: 286, height: 200 },
    })).toMatchObject({
      left: 248,
      top: 100,
      horizontal: 'right',
      vertical: 'aligned',
    });
  });
});
