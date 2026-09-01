import { fireEvent, render, screen } from '@testing-library/react';
import type { BoardRoomControllerApi } from '@/components/portal/scope-builder/board-room-controller';
import {
  BoardRoomInspector,
  resolveBoardRoomInspectorPosition,
} from './board-room-inspector';

// BoardImageInspectorActions (rendered for any single-item selection) calls this via
// react-query; stub it so single-selection tests don't need a QueryClientProvider.
jest.mock('@/hooks/use-background-removal', () => ({
  useBackgroundRemovalCapability: () => ({ data: undefined, isLoading: false }),
  useRemoveBoardItemBackground: () => ({ mutateAsync: jest.fn(), isPending: false, error: null }),
}));

jest.mock('@patina/supabase', () => ({
  usePromoteBoardReferenceToSelection: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

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

    const deleteButton = screen.getByRole('button', { name: 'Delete reference' });
    // VD11: destructive action carries the clay/error tone, not the plain
    // ghost text color the benign actions above it use.
    expect(deleteButton.className).toContain('text-[var(--color-clay-ink)]');
    fireEvent.click(deleteButton);
    expect(api.deleteItems).toHaveBeenCalled();
  });
});

describe('BoardRoomInspector project placement lifecycle', () => {
  it('removes only the board placement for a linked project selection', () => {
    const api = controllerApi();
    api.state = {
      ...api.state!,
      owner: { kind: 'project', id: 'project-1' },
      items: [{
        ...api.state!.items[0],
        projectFfeItemId: 'selection-1',
        productId: 'product-1',
      }],
    };
    api.selectedItemIds = ['chair'];

    render(
      <div className="relative h-[600px] w-[800px]">
        <BoardRoomInspector api={api} owner={{ kind: 'project', id: 'project-1' }} />
      </div>,
    );

    expect(screen.getByText(/removing this pin removes only the board placement/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove placement' }));
    expect(api.deleteItems).toHaveBeenCalledWith();
  });
});

describe('BoardRoomInspector geometry fields', () => {
  function singleSelectionApi() {
    const api = controllerApi();
    api.selectedItemIds = ['chair'];
    return api;
  }

  it('retains focus and the in-progress draft when a committed width lands mid-edit', () => {
    const api = singleSelectionApi();
    const { rerender } = render(
      <div className="relative h-[600px] w-[800px]">
        <BoardRoomInspector api={api} />
      </div>,
    );

    const width = screen.getByLabelText('Width') as HTMLInputElement;
    width.focus();
    fireEvent.change(width, { target: { value: '555' } });

    // A canvas-drag (or anything else) commits a new width on the same item mid-type.
    const nextApi = singleSelectionApi();
    nextApi.state = {
      ...nextApi.state!,
      items: nextApi.state!.items.map((item) => (item.id === 'chair' ? { ...item, width: 250 } : item)),
    };
    rerender(
      <div className="relative h-[600px] w-[800px]">
        <BoardRoomInspector api={nextApi} />
      </div>,
    );

    const widthAfter = screen.getByLabelText('Width') as HTMLInputElement;
    expect(widthAfter).toBe(width);
    expect(document.activeElement).toBe(width);
    expect(widthAfter.value).toBe('555');
    expect(api.updateItem).not.toHaveBeenCalled();
  });

  it('commits the parsed width via api.updateItem on Enter', () => {
    const api = singleSelectionApi();
    render(
      <div className="relative h-[600px] w-[800px]">
        <BoardRoomInspector api={api} />
      </div>,
    );

    const width = screen.getByLabelText('Width') as HTMLInputElement;
    width.focus();
    fireEvent.change(width, { target: { value: '321' } });
    fireEvent.keyDown(width, { key: 'Enter' });

    expect(api.updateItem).toHaveBeenCalledWith('chair', { width: 321 });
    expect(document.activeElement).not.toBe(width);
  });

  it('commits the parsed rotation via api.rotateItem on blur', () => {
    const api = singleSelectionApi();
    render(
      <div className="relative h-[600px] w-[800px]">
        <BoardRoomInspector api={api} />
      </div>,
    );

    const rotation = screen.getByLabelText('Rotation') as HTMLInputElement;
    rotation.focus();
    fireEvent.change(rotation, { target: { value: '42' } });
    fireEvent.blur(rotation);

    expect(api.rotateItem).toHaveBeenCalledWith('chair', 42);
  });

  it('reverts the draft on Escape without committing, and never reaches a window keydown listener', () => {
    const api = singleSelectionApi();
    render(
      <div className="relative h-[600px] w-[800px]">
        <BoardRoomInspector api={api} />
      </div>,
    );

    const width = screen.getByLabelText('Width') as HTMLInputElement;
    width.focus();
    fireEvent.change(width, { target: { value: '900' } });

    const windowKeyDown = jest.fn();
    window.addEventListener('keydown', windowKeyDown);
    fireEvent.keyDown(width, { key: 'Escape' });
    window.removeEventListener('keydown', windowKeyDown);

    expect(width.value).toBe('200'); // the chair item's width in controllerApi()
    expect(api.updateItem).not.toHaveBeenCalled();
    expect(windowKeyDown).not.toHaveBeenCalled();
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
