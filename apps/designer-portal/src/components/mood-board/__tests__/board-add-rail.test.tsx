import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProposalCapture } from '@patina/supabase';
import type { BoardOwnerRef, EditableMoodBoardItem } from '@patina/types';
import type { ProductPickResult } from '@/components/portal/proposals/product-picker-modal';
import {
  BoardAddRail,
  boardItemThumbnail,
  captureToBoardItem,
  productPickToBoardItem,
  projectSelectionToBoardItem,
} from '../board-add-rail';

const placeProduct = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        in: () => ({ order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
        eq: () => ({ order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
      }),
    }),
  }),
  useBoardFeedback: () => ({ data: [] }),
  usePalettes: () => ({ data: [], isLoading: false }),
  useProposal: () => ({ data: undefined, isLoading: false }),
  useProposalCaptures: () => ({
    data: [
      {
        id: 'capture-1',
        product_id: 'product-1',
        thumbnail_url: 'https://images.example/capture.jpg',
        source_url: 'https://maker.example/chair',
        raw_payload: { productName: 'Oak chair' },
      },
    ],
  }),
  useProjectFFEItems: () => ({ data: [], isLoading: false }),
  usePlaceProductInProjectV2: () => ({ mutateAsync: placeProduct, isPending: false }),
  useRoomScans: () => ({
    data: [
      { id: 'scan-1', name: 'Living room', room_type: 'living', thumbnail_url: 'https://images.example/scan.jpg' },
    ],
    isLoading: false,
    isError: false,
  }),
  useTaughtAlternatives: () => ({ data: [] }),
  useLogSuggestionEvent: () => ({ mutate: jest.fn(), mutateAsync: jest.fn() }),
}));

describe('mood-board add rail item provenance', () => {
  it('keeps extension capture lineage and source metadata on the canvas item', () => {
    const capture = {
      id: 'capture-1',
      product_id: 'product-1',
      thumbnail_url: 'https://images.example/capture.jpg',
      source_url: 'https://maker.example/chair',
      raw_payload: {
        productName: 'Oak chair',
        vendorName: 'Maker Studio',
      },
    } as ProposalCapture;

    expect(captureToBoardItem(capture, { x: 120, y: 80 }, 4)).toEqual(
      expect.objectContaining({
        type: 'capture',
        x: 120,
        y: 80,
        zIndex: 4,
        captureId: 'capture-1',
        productId: 'product-1',
        imageUrl: 'https://images.example/capture.jpg',
        data: expect.objectContaining({
          name: 'Oak chair',
          vendor_name: 'Maker Studio',
          source_url: 'https://maker.example/chair',
        }),
      }),
    );
  });

  it('distinguishes catalog products from capture-backed picker results', () => {
    const base: ProductPickResult = {
      productId: 'product-2',
      name: 'Linen sofa',
      imageUrl: 'https://images.example/sofa.jpg',
      priceCents: 420_000,
      vendorName: 'Atelier',
      scopeRoomId: null,
    };

    expect(productPickToBoardItem(base, { x: 0, y: 0 }, 1)).toEqual(
      expect.objectContaining({ type: 'product', productId: 'product-2', captureId: null }),
    );
    expect(
      productPickToBoardItem({ ...base, captureId: 'capture-2' }, { x: 0, y: 0 }, 1),
    ).toEqual(
      expect.objectContaining({
        type: 'capture',
        productId: 'product-2',
        captureId: 'capture-2',
      }),
    );
  });

  it('uses the bounded thumbnail in rail cards and falls back for legacy pins', () => {
    const base = {
      id: 'image-1',
      type: 'image' as const,
      x: 0,
      y: 0,
      width: 240,
      imageUrl: 'https://images.example/display.webp',
    };
    expect(boardItemThumbnail({
      ...base,
      data: { thumbnail_url: 'https://images.example/thumb.webp' },
    })).toBe('https://images.example/thumb.webp');
    expect(boardItemThumbnail(base)).toBe('https://images.example/display.webp');
  });

  it('links an In project placement to the existing selection identity', () => {
    const item = projectSelectionToBoardItem({
      id: 'selection-1', projectId: 'project-1', productId: 'product-1', projectRoomId: null,
      name: 'Oak chair', quantity: 2, status: 'specified', designDisposition: 'selected',
      assignmentScope: 'throughout', selectionThreadId: 'thread-1', supersedesFfeItemId: null,
      createdAt: '2026-08-10T00:00:00Z', product: { id: 'product-1', name: 'Oak chair', images: ['https://images.example/chair.jpg'] },
    }, { x: 40, y: 60 }, 3);
    expect(item).toEqual(expect.objectContaining({
      productId: 'product-1',
      projectFfeItemId: 'selection-1',
      x: 40,
      y: 60,
      zIndex: 3,
    }));
  });
});

const owner: BoardOwnerRef = { kind: 'project', id: 'project-1' };

const uploadedImage: EditableMoodBoardItem = {
  id: 'image-1',
  type: 'image',
  x: 0,
  y: 0,
  width: 240,
  height: 180,
  zIndex: 1,
  rotation: 0,
  locked: false,
  productId: null,
  captureId: null,
  paletteId: null,
  imageUrl: 'https://images.example/display.webp',
  content: null,
  data: { thumbnail_url: 'https://images.example/thumb.webp' },
};

function renderRail(onAddItems = jest.fn()) {
  return render(
    <BoardAddRail
      owner={owner}
      boardId="board-1"
      items={[uploadedImage]}
      nextPoint={() => ({ x: 0, y: 0 })}
      nextZ={() => 1}
      onAddItems={onAddItems}
    />,
  );
}

// Rail thumbnails are the drag source for the canvas via beginRailDrag on the
// parent div, not the browser's own image drag — an img left draggable would
// contribute a competing native text/uri-list payload to the same gesture.
describe('BoardAddRail thumbnails carry no native browser drag payload', () => {
  beforeEach(() => {
    placeProduct.mockReset();
    placeProduct.mockResolvedValue({
      outcome: 'created', selectionId: 'selection-1', threadId: 'thread-1', placementId: 'placement-1',
    });
  });

  it('creates the project selection and placement before adding a capture product locally', async () => {
    const onAddItems = jest.fn();
    renderRail(onAddItems);
    fireEvent.click(screen.getByRole('tab', { name: 'captures' }));
    fireEvent.click(screen.getByRole('button', { name: /Oak chair/i }));

    await waitFor(() => expect(placeProduct).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      productId: 'product-1',
      captureId: 'capture-1',
      boardId: 'board-1',
      assignmentScope: 'unassigned',
      duplicateMode: 'reuse',
    })));
    expect(onAddItems).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'placement-1', productId: 'product-1', projectFfeItemId: 'selection-1', type: 'product',
      }),
    ], 'rail_click');
  });

  it('captures tab thumbnail is draggable={false}', () => {
    renderRail();
    fireEvent.click(screen.getByRole('tab', { name: 'captures' }));
    expect(screen.getByAltText('')).toHaveAttribute('draggable', 'false');
  });

  it('uploads tab thumbnail is draggable={false}', () => {
    renderRail();
    fireEvent.click(screen.getByRole('tab', { name: 'uploads' }));
    expect(screen.getByAltText('')).toHaveAttribute('draggable', 'false');
  });

  it('scans tab thumbnail is draggable={false}', () => {
    renderRail();
    fireEvent.click(screen.getByRole('tab', { name: 'scans' }));
    expect(screen.getByAltText('')).toHaveAttribute('draggable', 'false');
  });
});

// Cascade placement (CI-11) lives in the shared `findBoardCascadePlacement`
// geometry helper and the shell's `nextPoint`; the rail's job is simply to
// call the passed-in `nextPoint` fresh for every single-add click rather than
// caching one point across clicks — otherwise every add would still stack.
describe('BoardAddRail requests a fresh point on every click-add (CI-11)', () => {
  it('calls nextPoint again for a second Add Note click, landing at a different point', () => {
    const onAddItems = jest.fn();
    let calls = 0;
    const nextPoint = jest.fn(() => {
      calls += 1;
      return { x: calls * 24, y: calls * 24 };
    });
    render(
      <BoardAddRail
        owner={owner}
        boardId="board-1"
        items={[uploadedImage]}
        nextPoint={nextPoint}
        nextZ={() => 1}
        onAddItems={onAddItems}
      />,
    );
    const addNote = screen.getByRole('button', { name: '+ Note' });
    fireEvent.click(addNote);
    fireEvent.click(addNote);

    expect(nextPoint).toHaveBeenCalledTimes(2);
    expect(onAddItems).toHaveBeenCalledTimes(2);
    const firstItems = onAddItems.mock.calls[0]![0] as EditableMoodBoardItem[];
    const secondItems = onAddItems.mock.calls[1]![0] as EditableMoodBoardItem[];
    expect(firstItems[0]!.x).toBe(24);
    expect(secondItems[0]!.x).toBe(48);
    expect(firstItems[0]!.x).not.toBe(secondItems[0]!.x);
  });
});
