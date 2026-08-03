import type { EditableMoodBoardItem } from '@patina/types';
import {
  addBoardRoomItems,
  alignBoardRoomItems,
  altDragDuplicateBoardRoomItems,
  changeBoardRoomZOrder,
  commitItemPatches,
  createBoardRoomHistory,
  deleteBoardRoomItems,
  duplicateBoardRoomItems,
  growBoardRoomCanvas,
  moveBoardRoomSectionBand,
  nudgeBoardRoomItems,
  parseBoardRoomClipboard,
  pasteBoardRoomItems,
  redoBoardRoomCommand,
  sectionIdAtPoint,
  serializeBoardRoomSelection,
  setBoardRoomSectionMembership,
  tidyBoardRoomItems,
  toggleBoardRoomLock,
  trimBoardRoomCanvas,
  undoBoardRoomCommand,
  updateBoardRoomItemFields,
  replaceBoardRoomItem,
  updateBoardRoomSections,
  BOARD_ROOM_CLIPBOARD_MAX_BYTES,
  type BoardRoomHistory,
  type BoardRoomState,
} from './board-room-command-engine';

function item(id: string, x: number, y: number, extras: Partial<EditableMoodBoardItem> = {}): EditableMoodBoardItem {
  return {
    id,
    type: 'product',
    x,
    y,
    width: 100,
    height: 100,
    zIndex: Number(id.replace(/\D/g, '')) || 0,
    rotation: 0,
    locked: false,
    productId: `product-${id}`,
    captureId: null,
    paletteId: null,
    imageUrl: `https://cdn.example/${id}.jpg`,
    content: null,
    data: { source_url: `https://maker.example/${id}`, name: id },
    ...extras,
  };
}

function state(overrides: Partial<BoardRoomState> = {}): BoardRoomState {
  return {
    boardId: 'board-a',
    owner: { kind: 'proposal', id: 'owner-a' },
    name: 'Concept',
    canvasWidth: 1200,
    canvasHeight: 800,
    backgroundColor: '#FAF8F5',
    sections: [
      { id: 'section-a', name: 'Seating' },
      { id: 'section-b', name: 'Lighting' },
    ],
    items: [item('i1', 100, 100), item('i2', 300, 200), item('i3', 600, 300)],
    ...overrides,
  };
}

function positions(history: BoardRoomHistory): Record<string, [number, number]> {
  return Object.fromEntries(history.present.items.map((entry) => [entry.id, [entry.x, entry.y]]));
}

describe('board room semantic history', () => {
  it('aligns a multi-selection as one command and restores every position with one undo (AC1.17)', () => {
    const initial = createBoardRoomHistory(state());
    const aligned = alignBoardRoomItems(initial, ['i1', 'i2', 'i3'], 'left', { id: 'align-1', committedAt: 10 });
    expect(aligned.history.past).toHaveLength(1);
    expect(aligned.history.present.items.map((entry) => entry.x)).toEqual([100, 100, 100]);

    const undone = undoBoardRoomCommand(aligned.history);
    expect(positions(undone.history)).toEqual(positions(initial));
  });

  it('records one completed 400px drag and supports exact undo/redo (AC1.18)', () => {
    const initial = createBoardRoomHistory(state());
    const moved = commitItemPatches(initial, { i1: { x: 500 } }, {
      id: 'drag-pointer-7',
      kind: 'move',
      lane: 'layout',
      committedAt: 10,
    });
    expect(moved.history.past).toHaveLength(1);
    expect(moved.history.present.items[0].x).toBe(500);
    const undone = undoBoardRoomCommand(moved.history);
    expect(undone.history.present.items[0].x).toBe(100);
    expect(redoBoardRoomCommand(undone.history).history.present.items[0].x).toBe(500);
  });

  it('drops a stale drag after delete and undo resurrects the original id (AC1.19/AC1.20)', () => {
    const initial = createBoardRoomHistory(state());
    const deleted = deleteBoardRoomItems(initial, ['i1'], { id: 'delete-1', committedAt: 10 });
    const stale = commitItemPatches(deleted.history, { i1: { x: 900 } }, {
      id: 'old-drag',
      kind: 'move',
      lane: 'layout',
      requireExisting: ['i1'],
      committedAt: 11,
    });
    expect(stale.rejected).toBe('stale');
    expect(stale.history.past).toHaveLength(1);
    expect(stale.history.present.items.some((entry) => entry.id === 'i1')).toBe(false);

    const resurrected = undoBoardRoomCommand(stale.history).history;
    expect(resurrected.present.items.find((entry) => entry.id === 'i1')).toMatchObject({
      id: 'i1',
      x: 100,
      productId: 'product-i1',
    });
  });

  it('caps history at 100 and clears redo after a new command', () => {
    let history = createBoardRoomHistory(state());
    for (let index = 0; index < 105; index += 1) {
      history = updateBoardRoomItemFields(history, 'i1', { content: String(index) }, {
        id: `content-${index}`,
        committedAt: index * 1_000,
      }).history;
    }
    expect(history.past).toHaveLength(100);
    const undone = undoBoardRoomCommand(history).history;
    expect(undone.future).toHaveLength(1);
    const branched = updateBoardRoomItemFields(undone, 'i1', { content: 'branch' }, {
      id: 'branch',
      committedAt: 200_000,
    }).history;
    expect(branched.future).toHaveLength(0);
  });
});

describe('duplicate, clipboard and keyboard command groups', () => {
  it('duplicates by 24/24 and Alt-drag leaves originals in place (AC1.21)', () => {
    const initial = createBoardRoomHistory(state());
    const duplicate = duplicateBoardRoomItems(initial, ['i1', 'i2'], (_source, index) => `copy-${index}`, {
      id: 'duplicate-1',
      committedAt: 1,
    });
    expect(duplicate.createdIds).toEqual(['copy-0', 'copy-1']);
    expect(duplicate.history.present.items.find((entry) => entry.id === 'copy-0')).toMatchObject({ x: 124, y: 124 });
    expect(duplicate.history.present.items.find((entry) => entry.id === 'i1')).toMatchObject({ x: 100, y: 100 });

    const alt = altDragDuplicateBoardRoomItems(initial, ['i1'], { x: 70, y: -20 }, () => 'alt-copy', {
      id: 'alt-drag-1',
      committedAt: 2,
    });
    expect(alt.history.present.items.find((entry) => entry.id === 'alt-copy')).toMatchObject({ x: 170, y: 80 });
    expect(alt.history.present.items.find((entry) => entry.id === 'i1')).toMatchObject({ x: 100, y: 100 });
    expect(alt.history.past).toHaveLength(1);
  });

  it('preserves geometry/FKs within an owner and strips only FKs across owners (AC1.22)', () => {
    const source = state({
      items: [
        item('i1', 100, 100, { data: { section_id: 'section-a', source_url: 'https://maker.example/chair' } }),
        item('i2', 340, 220, { type: 'image', productId: null, imageUrl: 'https://cdn.example/reference.jpg' }),
      ],
    });
    const serialized = serializeBoardRoomSelection(source, ['i1', 'i2']);
    const envelope = parseBoardRoomClipboard(serialized!);
    expect(envelope).not.toBeNull();

    const sameOwnerTarget = createBoardRoomHistory(state({ boardId: 'board-b', items: [] }));
    const sameOwner = pasteBoardRoomItems(sameOwnerTarget, envelope!, { x: 500, y: 400 }, (_item, index) => `same-${index}`, {
      id: 'paste-same',
      committedAt: 1,
    });
    const sameFirst = sameOwner.history.present.items[0];
    const sameSecond = sameOwner.history.present.items[1];
    expect(sameFirst.productId).toBe('product-i1');
    expect(sameFirst.data?.section_id).toBe('section-a');
    expect(sameSecond.x - sameFirst.x).toBe(240);
    expect(sameSecond.y - sameFirst.y).toBe(120);
    expect(sameSecond.imageUrl).toBe('https://cdn.example/reference.jpg');

    const projectTarget = createBoardRoomHistory(state({
      boardId: 'board-project',
      owner: { kind: 'project', id: 'project-1' },
      items: [],
    }));
    const crossOwner = pasteBoardRoomItems(projectTarget, envelope!, { x: 20, y: 30 }, (_item, index) => `cross-${index}`, {
      id: 'paste-cross',
      committedAt: 2,
    });
    expect(crossOwner.history.present.items[0]).toMatchObject({
      productId: null,
      captureId: null,
      paletteId: null,
    });
    expect(crossOwner.history.present.items[0].data?.source_url).toBe('https://maker.example/chair');
    expect(crossOwner.history.present.items[1].imageUrl).toBe('https://cdn.example/reference.jpg');
  });

  it('rejects oversized and malformed clipboard envelopes before they reach history', () => {
    expect(parseBoardRoomClipboard('x'.repeat(BOARD_ROOM_CLIPBOARD_MAX_BYTES + 1))).toBeNull();
    expect(parseBoardRoomClipboard(JSON.stringify({
      namespace: 'com.patina.board-items',
      version: 1,
      owner: { kind: 'proposal', id: 'proposal-1' },
      originBoardId: 'board-1',
      items: [{
        item: { id: 'bad', type: 'script', x: 0, y: 0, width: -10, data: { __proto__: { polluted: true } } },
        offset: { x: Number.POSITIVE_INFINITY, y: 0 },
        sectionName: null,
      }],
    }))).toBeNull();
  });

  it('coalesces ten rapid nudges into one 10px undo step (AC1.23)', () => {
    let history = createBoardRoomHistory(state());
    for (let index = 0; index < 10; index += 1) {
      history = nudgeBoardRoomItems(history, ['i1'], { x: 1, y: 0 }, {
        id: 'nudge:i1:right',
        committedAt: index * 40,
      }).history;
    }
    expect(history.past).toHaveLength(1);
    expect(history.present.items[0].x).toBe(110);
    expect(undoBoardRoomCommand(history).history.present.items[0].x).toBe(100);
  });

  it('supports z-order, lock and field edits as reversible semantic commands', () => {
    let history = createBoardRoomHistory(state());
    history = changeBoardRoomZOrder(history, ['i1'], 'front', { id: 'z', committedAt: 1 }).history;
    expect(history.present.items.find((entry) => entry.id === 'i1')?.zIndex).toBe(2);
    history = toggleBoardRoomLock(history, ['i1'], { id: 'lock', committedAt: 1_000 }).history;
    expect(history.present.items.find((entry) => entry.id === 'i1')?.locked).toBe(true);
    history = updateBoardRoomItemFields(history, 'i1', { content: 'Designer note' }, { id: 'content', committedAt: 2_000 }).history;
    expect(history.present.items.find((entry) => entry.id === 'i1')?.content).toBe('Designer note');
    expect(undoBoardRoomCommand(history).history.present.items.find((entry) => entry.id === 'i1')?.content).toBeNull();
  });

  it('replaces an optimistic URL placeholder with the same id as one undoable command', () => {
    const initial = createBoardRoomHistory(state({
      items: [item('url-1', 80, 90, { type: 'capture', content: 'Loading…' })],
    }));
    const resolved = item('url-1', 80, 90, {
      type: 'product',
      content: null,
      productId: 'resolved-product',
      data: { source_url: 'https://maker.example/resolved', name: 'Resolved chair' },
    });
    const replacement = replaceBoardRoomItem(initial, resolved, { id: 'url-resolve', committedAt: 1 });
    expect(replacement.history.past).toHaveLength(1);
    expect(replacement.history.present.items[0]).toMatchObject({
      id: 'url-1',
      type: 'product',
      x: 80,
      y: 90,
      productId: 'resolved-product',
    });
    expect(undoBoardRoomCommand(replacement.history).history.present.items[0]).toMatchObject({
      id: 'url-1',
      type: 'capture',
      content: 'Loading…',
    });
  });
});

describe('sections, tidy and canvas commands', () => {
  it('derives implicit membership from section geometry and clears it outside (AC1.26)', () => {
    const bands = [{ id: 'section-a', bounds: { x: 100, y: 100, width: 300, height: 200 } }];
    expect(sectionIdAtPoint(bands, { x: 250, y: 150 })).toBe('section-a');
    expect(sectionIdAtPoint(bands, { x: 20, y: 20 })).toBeNull();

    let history = createBoardRoomHistory(state());
    history = setBoardRoomSectionMembership(history, 'i1', 'section-a', { id: 'membership-in', committedAt: 1 }).history;
    expect(history.present.items[0].data?.section_id).toBe('section-a');
    history = setBoardRoomSectionMembership(history, 'i1', null, { id: 'membership-out', committedAt: 1_000 }).history;
    expect(history.present.items[0].data?.section_id).toBeNull();
  });

  it('moves a section and all members as one undoable command (AC1.27)', () => {
    const initial = createBoardRoomHistory(state({
      items: [
        item('i1', 100, 100, { data: { section_id: 'section-a' } }),
        item('i2', 300, 200, { data: { section_id: 'section-a' } }),
        item('i3', 600, 300),
      ],
    }));
    const moved = moveBoardRoomSectionBand(initial, 'section-a', { x: 50, y: -20 }, { id: 'band-drag', committedAt: 1 });
    expect(moved.history.past).toHaveLength(1);
    expect(positions(moved.history)).toEqual({ i1: [150, 80], i2: [350, 180], i3: [600, 300] });
    expect(positions(undoBoardRoomCommand(moved.history).history)).toEqual(positions(initial));
  });

  it('deletes a section and clears membership in one command, with exact undo', () => {
    const initial = createBoardRoomHistory(state({
      items: [item('i1', 100, 100, { data: { section_id: 'section-a' } })],
    }));
    const deleted = updateBoardRoomSections(initial, { type: 'delete', sectionId: 'section-a' }, {
      id: 'section-delete',
      committedAt: 1,
    });
    expect(deleted.history.present.sections.map((section) => section.id)).toEqual(['section-b']);
    expect(deleted.history.present.items[0].data?.section_id).toBeNull();
    const undo = undoBoardRoomCommand(deleted.history).history;
    expect(undo.present.sections.map((section) => section.id)).toEqual(['section-a', 'section-b']);
    expect(undo.present.items[0].data?.section_id).toBe('section-a');
  });

  it('tidy is one exact undo step (AC1.25)', () => {
    const initial = createBoardRoomHistory(state());
    const tidy = tidyBoardRoomItems(initial, [
      { id: 'i1', x: 32, y: 32 },
      { id: 'i2', x: 156, y: 32 },
      { id: 'i3', x: 280, y: 32 },
    ], { id: 'tidy-gesture', committedAt: 1 });
    expect(tidy.history.past).toHaveLength(1);
    expect(positions(undoBoardRoomCommand(tidy.history).history)).toEqual(positions(initial));
  });

  it('coalesces a drag and its canvas growth into one step with translated origin (AC1.8)', () => {
    const initial = createBoardRoomHistory(state({ canvasWidth: 700, canvasHeight: 500 }));
    const moved = commitItemPatches(initial, { i1: { x: -40, y: -30 } }, {
      id: 'gesture-grow',
      kind: 'move',
      lane: 'layout',
      committedAt: 10,
    });
    const growth = growBoardRoomCanvas(moved.history, {
      canvas: { width: 980, height: 770 },
      translation: { x: 280, y: 270 },
      items: moved.history.present.items.map((entry) => ({
        id: entry.id,
        x: entry.x + 280,
        y: entry.y + 270,
      })),
    }, { id: 'gesture-grow', committedAt: 11 });
    expect(growth.history.past).toHaveLength(1);
    expect(growth.history.present).toMatchObject({ canvasWidth: 980, canvasHeight: 770 });
    expect(growth.history.present.items[0]).toMatchObject({ x: 240, y: 240 });
    expect(undoBoardRoomCommand(growth.history).history.present).toMatchObject({
      canvasWidth: 700,
      canvasHeight: 500,
    });
    expect(undoBoardRoomCommand(growth.history).history.present.items[0]).toMatchObject({ x: 100, y: 100 });
  });

  it('trims to item bounds plus margin as a reversible canvas command', () => {
    const initial = createBoardRoomHistory(state());
    const trimmed = trimBoardRoomCanvas(initial, { id: 'trim', committedAt: 1, margin: 20 });
    expect(trimmed.history.present).toMatchObject({ canvasWidth: 640, canvasHeight: 340 });
    expect(trimmed.history.present.items[0]).toMatchObject({ x: 20, y: 20 });
    expect(undoBoardRoomCommand(trimmed.history).history.present).toMatchObject({
      canvasWidth: 1200,
      canvasHeight: 800,
    });
  });

  it('restores an explicit-id add through ordinary history', () => {
    const initial = createBoardRoomHistory(state({ items: [] }));
    const added = addBoardRoomItems(initial, [item('stable-id', 20, 30)], {
      id: 'add',
      kind: 'add',
      lane: 'structural',
      committedAt: 1,
    });
    expect(added.history.present.items[0].id).toBe('stable-id');
    expect(redoBoardRoomCommand(undoBoardRoomCommand(added.history).history).history.present.items[0].id).toBe('stable-id');
  });
});
