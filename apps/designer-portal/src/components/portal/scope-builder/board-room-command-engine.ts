import type {
  BoardCommandKind,
  BoardCommandLane,
  BoardOwnerRef,
  BoardPoint,
  BoardRect,
  EditableMoodBoardItem,
  MoodBoardItemData,
  MoodBoardSection,
} from '@patina/types';

export const BOARD_ROOM_HISTORY_LIMIT = 100;
export const BOARD_ROOM_COALESCE_MS = 500;
export const BOARD_ROOM_DUPLICATE_OFFSET = 24;
export const BOARD_ROOM_CANVAS_MARGIN = 240;
export const BOARD_ROOM_CLIPBOARD_MIME = 'application/vnd.patina.board-items+json';
export const BOARD_ROOM_CLIPBOARD_NAMESPACE = 'com.patina.board-items';
export const BOARD_ROOM_CLIPBOARD_MAX_BYTES = 1024 * 1024;

export type BoardRoomMode = 'edit' | 'present';

/** The complete immutable state governed by the room command stack. */
export interface BoardRoomState {
  boardId: string;
  owner: BoardOwnerRef;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  sections: MoodBoardSection[];
  items: EditableMoodBoardItem[];
}

export interface BoardRoomCommand {
  id: string;
  kind: BoardCommandKind;
  lane: BoardCommandLane;
  touches: string[];
  before: BoardRoomState;
  after: BoardRoomState;
  committedAt: number;
  /** Total canvas-origin translation represented by this undo step. */
  viewTranslation?: BoardPoint;
  /** Semantic target for commands whose analytics distinguish selection vs board. */
  scope?: 'selection' | 'board';
}

export interface BoardRoomHistory {
  present: BoardRoomState;
  past: BoardRoomCommand[];
  future: BoardRoomCommand[];
}

export interface BoardRoomCommandOptions {
  id: string;
  kind: BoardCommandKind;
  lane: BoardCommandLane;
  touches?: readonly string[];
  /** Stale gesture commits are rejected when any required item is absent. */
  requireExisting?: readonly string[];
  committedAt?: number;
  /** Canvas-origin translation applied by this individual transition. */
  viewTranslation?: BoardPoint;
  scope?: 'selection' | 'board';
}

export interface BoardRoomCommandResult {
  history: BoardRoomHistory;
  command: BoardRoomCommand | null;
  rejected: 'stale' | 'noop' | null;
  /** Canvas-origin translation applied only by this result. */
  viewTranslationDelta?: BoardPoint;
}

export interface BoardRoomHistoryStep {
  history: BoardRoomHistory;
  command: BoardRoomCommand | null;
}

export type BoardItemPatch = Partial<Omit<EditableMoodBoardItem, 'id' | 'type'>>;

function cloneData(data: MoodBoardItemData | null | undefined): MoodBoardItemData | null {
  if (data == null) return null;
  if (typeof structuredClone === 'function') return structuredClone(data);
  return JSON.parse(JSON.stringify(data)) as MoodBoardItemData;
}

export function cloneBoardItem(item: EditableMoodBoardItem): EditableMoodBoardItem {
  return { ...item, data: cloneData(item.data) };
}

export function cloneBoardRoomState(state: BoardRoomState): BoardRoomState {
  return {
    ...state,
    owner: { ...state.owner },
    sections: state.sections.map((section) => ({ ...section })),
    items: state.items.map(cloneBoardItem),
  };
}

function stateFingerprint(state: BoardRoomState): string {
  return JSON.stringify(state);
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function nonZeroPoint(point: BoardPoint | undefined): BoardPoint | undefined {
  if (!point || (point.x === 0 && point.y === 0)) return undefined;
  return { x: point.x, y: point.y };
}

function addPoints(
  first: BoardPoint | undefined,
  second: BoardPoint | undefined,
): BoardPoint | undefined {
  if (!first) return nonZeroPoint(second);
  if (!second) return nonZeroPoint(first);
  return nonZeroPoint({ x: first.x + second.x, y: first.y + second.y });
}

export function createBoardRoomHistory(state: BoardRoomState): BoardRoomHistory {
  return { present: cloneBoardRoomState(state), past: [], future: [] };
}

/**
 * The one mutation gate for local board state. A late gesture naming a deleted
 * id is rejected here, before it can enter history or any persistence buffer.
 */
export function commitBoardRoomCommand(
  history: BoardRoomHistory,
  options: BoardRoomCommandOptions,
  mutate: (state: BoardRoomState) => BoardRoomState,
): BoardRoomCommandResult {
  const existing = new Set(history.present.items.map((item) => item.id));
  if ((options.requireExisting ?? []).some((id) => !existing.has(id))) {
    return { history, command: null, rejected: 'stale' };
  }

  const before = cloneBoardRoomState(history.present);
  const after = cloneBoardRoomState(mutate(cloneBoardRoomState(history.present)));
  if (stateFingerprint(before) === stateFingerprint(after)) {
    return { history, command: null, rejected: 'noop' };
  }

  const committedAt = options.committedAt ?? Date.now();
  const viewTranslationDelta = nonZeroPoint(options.viewTranslation);
  const command: BoardRoomCommand = {
    id: options.id,
    kind: options.kind,
    lane: options.lane,
    touches: distinct(options.touches ?? []),
    before,
    after,
    committedAt,
    ...(viewTranslationDelta ? { viewTranslation: viewTranslationDelta } : {}),
    ...(options.scope ? { scope: options.scope } : {}),
  };
  const previous = history.past[history.past.length - 1];
  const coalesces =
    previous?.id === command.id &&
    committedAt - previous.committedAt >= 0 &&
    committedAt - previous.committedAt <= BOARD_ROOM_COALESCE_MS;
  const mergedViewTranslation = coalesces
    ? addPoints(previous?.viewTranslation, command.viewTranslation)
    : command.viewTranslation;
  const merged = coalesces
    ? {
        ...command,
        before: previous.before,
        touches: distinct([...previous.touches, ...command.touches]),
        ...(mergedViewTranslation
          ? { viewTranslation: mergedViewTranslation }
          : { viewTranslation: undefined }),
      }
    : command;
  const past = coalesces
    ? [...history.past.slice(0, -1), merged]
    : [...history.past, merged].slice(-BOARD_ROOM_HISTORY_LIMIT);

  return {
    history: { present: after, past, future: [] },
    command: merged,
    rejected: null,
    ...(viewTranslationDelta ? { viewTranslationDelta } : {}),
  };
}

export function undoBoardRoomCommand(history: BoardRoomHistory): BoardRoomHistoryStep {
  const command = history.past[history.past.length - 1];
  if (!command) return { history, command: null };
  return {
    history: {
      present: cloneBoardRoomState(command.before),
      past: history.past.slice(0, -1),
      future: [command, ...history.future],
    },
    command,
  };
}

export function redoBoardRoomCommand(history: BoardRoomHistory): BoardRoomHistoryStep {
  const command = history.future[0];
  if (!command) return { history, command: null };
  return {
    history: {
      present: cloneBoardRoomState(command.after),
      past: [...history.past, command].slice(-BOARD_ROOM_HISTORY_LIMIT),
      future: history.future.slice(1),
    },
    command,
  };
}

export function commitItemPatches(
  history: BoardRoomHistory,
  patches: Readonly<Record<string, BoardItemPatch>>,
  options: Omit<BoardRoomCommandOptions, 'touches'>,
): BoardRoomCommandResult {
  const ids = Object.keys(patches);
  return commitBoardRoomCommand(
    history,
    { ...options, touches: ids, requireExisting: options.requireExisting ?? ids },
    (state) => ({
      ...state,
      items: state.items.map((item) => {
        const patch = patches[item.id];
        if (!patch) return item;
        return {
          ...item,
          ...patch,
          data: patch.data === undefined ? item.data : cloneData(patch.data),
        };
      }),
    }),
  );
}

export function addBoardRoomItems(
  history: BoardRoomHistory,
  items: readonly EditableMoodBoardItem[],
  options: Omit<BoardRoomCommandOptions, 'touches' | 'requireExisting'>,
): BoardRoomCommandResult {
  const ids = items.map((item) => item.id);
  return commitBoardRoomCommand(history, { ...options, touches: ids }, (state) => {
    const existing = new Set(state.items.map((item) => item.id));
    return {
      ...state,
      items: [...state.items, ...items.filter((item) => !existing.has(item.id)).map(cloneBoardItem)],
    };
  });
}

export function deleteBoardRoomItems(
  history: BoardRoomHistory,
  itemIds: readonly string[],
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): BoardRoomCommandResult {
  const ids = distinct(itemIds);
  return commitBoardRoomCommand(
    history,
    { ...options, kind: 'delete', lane: 'structural', touches: ids },
    (state) => ({ ...state, items: state.items.filter((item) => !ids.includes(item.id)) }),
  );
}

export interface DuplicateBoardItemsResult extends BoardRoomCommandResult {
  createdIds: string[];
}

export function duplicateBoardRoomItems(
  history: BoardRoomHistory,
  itemIds: readonly string[],
  createId: (source: EditableMoodBoardItem, index: number) => string,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'> & {
    delta?: BoardPoint;
    kind?: 'duplicate' | 'paste';
  },
): DuplicateBoardItemsResult {
  const selected = history.present.items.filter((item) => itemIds.includes(item.id));
  const delta = options.delta ?? {
    x: BOARD_ROOM_DUPLICATE_OFFSET,
    y: BOARD_ROOM_DUPLICATE_OFFSET,
  };
  const copies = selected.map((item, index) => ({
    ...cloneBoardItem(item),
    id: createId(item, index),
    x: item.x + delta.x,
    y: item.y + delta.y,
    zIndex: Math.max(0, ...history.present.items.map((candidate) => candidate.zIndex ?? 0)) + index + 1,
  }));
  const result = addBoardRoomItems(history, copies, {
    ...options,
    kind: options.kind ?? 'duplicate',
    lane: 'structural',
  });
  return { ...result, createdIds: copies.map((item) => item.id) };
}

export function altDragDuplicateBoardRoomItems(
  history: BoardRoomHistory,
  itemIds: readonly string[],
  delta: BoardPoint,
  createId: (source: EditableMoodBoardItem, index: number) => string,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): DuplicateBoardItemsResult {
  return duplicateBoardRoomItems(history, itemIds, createId, {
    ...options,
    kind: 'duplicate',
    delta,
  });
}

export function nudgeBoardRoomItems(
  history: BoardRoomHistory,
  itemIds: readonly string[],
  delta: BoardPoint,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): BoardRoomCommandResult {
  const patches = Object.fromEntries(
    history.present.items
      .filter((item) => itemIds.includes(item.id) && !item.locked)
      .map((item) => [item.id, { x: item.x + delta.x, y: item.y + delta.y }]),
  );
  return commitItemPatches(history, patches, {
    ...options,
    kind: 'move',
    lane: 'layout',
  });
}

export type BoardZOrderAction = 'forward' | 'backward' | 'front' | 'back';

export function changeBoardRoomZOrder(
  history: BoardRoomHistory,
  itemIds: readonly string[],
  action: BoardZOrderAction,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): BoardRoomCommandResult {
  const ordered = [...history.present.items].sort(
    (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0),
  );
  const selected = new Set(itemIds);
  if (action === 'front' || action === 'back') {
    const moving = ordered.filter((item) => selected.has(item.id));
    const fixed = ordered.filter((item) => !selected.has(item.id));
    const next = action === 'front' ? [...fixed, ...moving] : [...moving, ...fixed];
    const patches = Object.fromEntries(next.map((item, zIndex) => [item.id, { zIndex }]));
    return commitItemPatches(history, patches, { ...options, kind: 'z-order', lane: 'layout' });
  }
  const next = [...ordered];
  const indices = action === 'forward'
    ? [...next.keys()].reverse()
    : [...next.keys()];
  for (const index of indices) {
    if (!selected.has(next[index].id)) continue;
    const target = action === 'forward' ? index + 1 : index - 1;
    if (target < 0 || target >= next.length || selected.has(next[target].id)) continue;
    [next[index], next[target]] = [next[target], next[index]];
  }
  return commitItemPatches(
    history,
    Object.fromEntries(next.map((item, zIndex) => [item.id, { zIndex }])),
    { ...options, kind: 'z-order', lane: 'layout' },
  );
}

export function toggleBoardRoomLock(
  history: BoardRoomHistory,
  itemIds: readonly string[],
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): BoardRoomCommandResult {
  const selected = history.present.items.filter((item) => itemIds.includes(item.id));
  const shouldLock = selected.some((item) => !item.locked);
  return commitItemPatches(
    history,
    Object.fromEntries(selected.map((item) => [item.id, { locked: shouldLock }])),
    { ...options, kind: 'lock', lane: 'structural' },
  );
}

function itemResolvedHeight(item: EditableMoodBoardItem): number {
  if (item.height != null) return item.height;
  const measured = Number(item.data?.resolved_height);
  if (Number.isFinite(measured) && measured > 0) return measured;
  return item.width * (item.type === 'image' || item.type === 'room_scan' ? 0.72 : 1.15);
}

function rotatedRect(item: EditableMoodBoardItem): BoardRect {
  const width = item.width;
  const height = itemResolvedHeight(item);
  const radians = (((item.rotation ?? 0) % 360) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const rotatedWidth = width * cos + height * sin;
  const rotatedHeight = width * sin + height * cos;
  return {
    x: item.x + width / 2 - rotatedWidth / 2,
    y: item.y + height / 2 - rotatedHeight / 2,
    width: rotatedWidth,
    height: rotatedHeight,
  };
}

function unionRects(rects: readonly BoardRect[]): BoardRect | null {
  if (rects.length === 0) return null;
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function growBoardRoomStateToFitItems(
  state: BoardRoomState,
  margin = BOARD_ROOM_CANVAS_MARGIN,
): { state: BoardRoomState; translation: BoardPoint } {
  const bounds = unionRects(state.items.map(rotatedRect));
  if (!bounds) return { state, translation: { x: 0, y: 0 } };
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const leftGrowth = bounds.x < 0 ? -bounds.x + margin : 0;
  const topGrowth = bounds.y < 0 ? -bounds.y + margin : 0;
  const rightGrowth = right > state.canvasWidth
    ? right - state.canvasWidth + margin
    : 0;
  const bottomGrowth = bottom > state.canvasHeight
    ? bottom - state.canvasHeight + margin
    : 0;
  const translation = { x: leftGrowth, y: topGrowth };
  if (
    leftGrowth === 0 &&
    topGrowth === 0 &&
    rightGrowth === 0 &&
    bottomGrowth === 0
  ) {
    return { state, translation };
  }
  return {
    state: {
      ...state,
      canvasWidth: Math.ceil(
        state.canvasWidth + leftGrowth + rightGrowth,
      ),
      canvasHeight: Math.ceil(
        state.canvasHeight + topGrowth + bottomGrowth,
      ),
      items: state.items.map((item) => ({
        ...item,
        x: item.x + translation.x,
        y: item.y + translation.y,
      })),
    },
    translation,
  };
}

export type BoardRoomAlignment =
  | 'left'
  | 'horizontal-center'
  | 'right'
  | 'top'
  | 'vertical-center'
  | 'bottom';

export function alignBoardRoomItems(
  history: BoardRoomHistory,
  itemIds: readonly string[],
  alignment: BoardRoomAlignment,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): BoardRoomCommandResult {
  const selected = history.present.items.filter((item) => itemIds.includes(item.id));
  const bounds = unionRects(selected.map(rotatedRect));
  if (!bounds || selected.length < 2) return { history, command: null, rejected: 'noop' };
  const patches: Record<string, BoardItemPatch> = {};
  for (const item of selected) {
    if (item.locked) continue;
    const box = rotatedRect(item);
    let dx = 0;
    let dy = 0;
    if (alignment === 'left') dx = bounds.x - box.x;
    if (alignment === 'horizontal-center') dx = bounds.x + bounds.width / 2 - (box.x + box.width / 2);
    if (alignment === 'right') dx = bounds.x + bounds.width - (box.x + box.width);
    if (alignment === 'top') dy = bounds.y - box.y;
    if (alignment === 'vertical-center') dy = bounds.y + bounds.height / 2 - (box.y + box.height / 2);
    if (alignment === 'bottom') dy = bounds.y + bounds.height - (box.y + box.height);
    patches[item.id] = { x: item.x + dx, y: item.y + dy };
  }
  return commitItemPatches(history, patches, { ...options, kind: 'align', lane: 'layout' });
}

export type BoardRoomDistribution =
  | 'horizontal-centers'
  | 'vertical-centers'
  | 'horizontal-gaps'
  | 'vertical-gaps';

export function distributeBoardRoomItems(
  history: BoardRoomHistory,
  itemIds: readonly string[],
  distribution: BoardRoomDistribution,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): BoardRoomCommandResult {
  const horizontal = distribution.startsWith('horizontal');
  const selected = history.present.items
    .filter((item) => itemIds.includes(item.id))
    .map((item) => ({ item, box: rotatedRect(item) }))
    .sort((a, b) => horizontal ? a.box.x - b.box.x : a.box.y - b.box.y);
  if (selected.length < 3) return { history, command: null, rejected: 'noop' };
  const first = selected[0].box;
  const last = selected[selected.length - 1].box;
  const patches: Record<string, BoardItemPatch> = {};
  if (distribution.endsWith('centers')) {
    const start = horizontal ? first.x + first.width / 2 : first.y + first.height / 2;
    const end = horizontal ? last.x + last.width / 2 : last.y + last.height / 2;
    const step = (end - start) / (selected.length - 1);
    selected.forEach(({ item, box }, index) => {
      if (index === 0 || index === selected.length - 1 || item.locked) return;
      const center = horizontal ? box.x + box.width / 2 : box.y + box.height / 2;
      const delta = start + step * index - center;
      patches[item.id] = horizontal ? { x: item.x + delta } : { y: item.y + delta };
    });
  } else {
    const span = horizontal
      ? last.x + last.width - first.x
      : last.y + last.height - first.y;
    const occupied = selected.reduce(
      (sum, entry) => sum + (horizontal ? entry.box.width : entry.box.height),
      0,
    );
    const gap = (span - occupied) / (selected.length - 1);
    let cursor = horizontal ? first.x + first.width + gap : first.y + first.height + gap;
    selected.slice(1, -1).forEach(({ item, box }) => {
      if (!item.locked) {
        const delta = cursor - (horizontal ? box.x : box.y);
        patches[item.id] = horizontal ? { x: item.x + delta } : { y: item.y + delta };
      }
      cursor += (horizontal ? box.width : box.height) + gap;
    });
  }
  return commitItemPatches(history, patches, { ...options, kind: 'distribute', lane: 'layout' });
}

export function tidyBoardRoomItems(
  history: BoardRoomHistory,
  positions: ReadonlyArray<{ id: string; x: number; y: number }>,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt' | 'scope'>,
): BoardRoomCommandResult {
  return commitItemPatches(
    history,
    Object.fromEntries(positions.map((position) => [position.id, { x: position.x, y: position.y }])),
    { ...options, kind: 'tidy', lane: 'layout' },
  );
}

export function updateBoardRoomItemFields(
  history: BoardRoomHistory,
  itemId: string,
  patch: BoardItemPatch,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): BoardRoomCommandResult {
  return commitItemPatches(history, { [itemId]: patch }, {
    ...options,
    kind: 'content',
    lane: 'structural',
  });
}

export function replaceBoardRoomItem(
  history: BoardRoomHistory,
  replacement: EditableMoodBoardItem,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): BoardRoomCommandResult {
  return commitBoardRoomCommand(
    history,
    {
      ...options,
      kind: 'content',
      lane: 'structural',
      touches: [replacement.id],
      requireExisting: [replacement.id],
    },
    (state) => ({
      ...state,
      items: state.items.map((item) =>
        item.id === replacement.id ? cloneBoardItem(replacement) : item,
      ),
    }),
  );
}

export function updateBoardRoomFields(
  history: BoardRoomHistory,
  patch: Partial<Pick<BoardRoomState, 'name' | 'backgroundColor'>>,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): BoardRoomCommandResult {
  return commitBoardRoomCommand(
    history,
    { ...options, kind: 'content', lane: 'structural' },
    (state) => ({ ...state, ...patch }),
  );
}

export function setBoardRoomSectionMembership(
  history: BoardRoomHistory,
  itemId: string,
  sectionId: string | null,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): BoardRoomCommandResult {
  const item = history.present.items.find((candidate) => candidate.id === itemId);
  if (!item) return { history, command: null, rejected: 'stale' };
  return commitItemPatches(
    history,
    { [itemId]: { data: { ...(item.data ?? {}), section_id: sectionId } } },
    { ...options, kind: 'section-membership', lane: 'structural' },
  );
}

export function sectionIdAtPoint(
  sections: ReadonlyArray<{ id: string; bounds: BoardRect }>,
  point: BoardPoint,
): string | null {
  return sections.find(({ bounds }) =>
    point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y && point.y <= bounds.y + bounds.height,
  )?.id ?? null;
}

export function moveBoardRoomSectionBand(
  history: BoardRoomHistory,
  sectionId: string,
  delta: BoardPoint,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): BoardRoomCommandResult {
  const members = history.present.items.filter((item) => item.data?.section_id === sectionId);
  return commitItemPatches(
    history,
    Object.fromEntries(members.map((item) => [item.id, { x: item.x + delta.x, y: item.y + delta.y }])),
    { ...options, kind: 'move', lane: 'layout' },
  );
}

export type BoardSectionOperation =
  | { type: 'create'; section: MoodBoardSection }
  | { type: 'update'; sectionId: string; patch: Partial<Omit<MoodBoardSection, 'id'>> }
  | { type: 'delete'; sectionId: string }
  | { type: 'reorder'; orderedIds: readonly string[] };

export function updateBoardRoomSections(
  history: BoardRoomHistory,
  operation: BoardSectionOperation,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): BoardRoomCommandResult {
  const kind: BoardCommandKind = operation.type === 'create'
    ? 'section-create'
    : operation.type === 'delete'
      ? 'section-delete'
      : operation.type === 'reorder'
        ? 'section-reorder'
        : 'section-update';
  const memberIds = operation.type === 'delete'
    ? history.present.items.filter((item) => item.data?.section_id === operation.sectionId).map((item) => item.id)
    : [];
  return commitBoardRoomCommand(
    history,
    { ...options, kind, lane: 'structural', touches: memberIds },
    (state) => {
      if (operation.type === 'create') {
        return { ...state, sections: [...state.sections, { ...operation.section }] };
      }
      if (operation.type === 'update') {
        return {
          ...state,
          sections: state.sections.map((section) =>
            section.id === operation.sectionId ? { ...section, ...operation.patch } : section,
          ),
        };
      }
      if (operation.type === 'delete') {
        return {
          ...state,
          sections: state.sections.filter((section) => section.id !== operation.sectionId),
          items: state.items.map((item) => item.data?.section_id === operation.sectionId
            ? { ...item, data: { ...(item.data ?? {}), section_id: null } }
            : item),
        };
      }
      const order = new Map(operation.orderedIds.map((id, index) => [id, index]));
      return {
        ...state,
        sections: [...state.sections].sort(
          (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        ),
      };
    },
  );
}

export interface BoardCanvasGrowth {
  canvas: { width: number; height: number };
  translation: BoardPoint;
  items: Array<{ id?: string; x: number; y: number }>;
}

export function growBoardRoomCanvas(
  history: BoardRoomHistory,
  growth: BoardCanvasGrowth,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): BoardRoomCommandResult {
  const translated = growth.items.filter((item): item is { id: string; x: number; y: number } => !!item.id);
  const ids = translated.map((item) => item.id);
  const positions = new Map(translated.map((item) => [item.id, item]));
  return commitBoardRoomCommand(
    history,
    {
      ...options,
      kind: 'canvas-grow',
      lane: 'canvas',
      touches: ids,
      requireExisting: ids,
      viewTranslation: growth.translation,
    },
    (state) => ({
      ...state,
      canvasWidth: growth.canvas.width,
      canvasHeight: growth.canvas.height,
      items: state.items.map((item) => {
        const position = positions.get(item.id);
        return position ? { ...item, x: position.x, y: position.y } : item;
      }),
    }),
  );
}

export function trimBoardRoomCanvas(
  history: BoardRoomHistory,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'> & { margin?: number },
): BoardRoomCommandResult {
  const margin = options.margin ?? BOARD_ROOM_CANVAS_MARGIN;
  const bounds = unionRects(history.present.items.map(rotatedRect));
  if (!bounds) return { history, command: null, rejected: 'noop' };
  const dx = margin - bounds.x;
  const dy = margin - bounds.y;
  const ids = history.present.items.map((item) => item.id);
  return commitBoardRoomCommand(
    history,
    { ...options, kind: 'canvas-trim', lane: 'canvas', touches: ids, requireExisting: ids },
    (state) => ({
      ...state,
      canvasWidth: Math.max(1, Math.ceil(bounds.width + margin * 2)),
      canvasHeight: Math.max(1, Math.ceil(bounds.height + margin * 2)),
      items: state.items.map((item) => ({ ...item, x: item.x + dx, y: item.y + dy })),
    }),
  );
}

export interface BoardRoomClipboardItem {
  item: EditableMoodBoardItem;
  offset: BoardPoint;
  sectionName: string | null;
}

export interface BoardRoomClipboardEnvelope {
  namespace: typeof BOARD_ROOM_CLIPBOARD_NAMESPACE;
  version: 1;
  owner: BoardOwnerRef;
  originBoardId: string;
  items: BoardRoomClipboardItem[];
}

function sameOwner(a: BoardOwnerRef, b: BoardOwnerRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export function serializeBoardRoomSelection(
  state: BoardRoomState,
  itemIds: readonly string[],
): string | null {
  const selected = state.items.filter((item) => itemIds.includes(item.id));
  if (selected.length === 0) return null;
  const bounds = unionRects(selected.map(rotatedRect))!;
  const sectionNames = new Map(state.sections.map((section) => [section.id, section.name]));
  const envelope: BoardRoomClipboardEnvelope = {
    namespace: BOARD_ROOM_CLIPBOARD_NAMESPACE,
    version: 1,
    owner: { ...state.owner },
    originBoardId: state.boardId,
    items: selected.map((item) => {
      const sectionId = typeof item.data?.section_id === 'string' ? item.data.section_id : null;
      return {
        item: cloneBoardItem(item),
        offset: { x: item.x - bounds.x, y: item.y - bounds.y },
        sectionName: sectionId ? sectionNames.get(sectionId) ?? null : null,
      };
    }),
  };
  const serialized = JSON.stringify(envelope);
  const bytes = typeof TextEncoder === 'undefined'
    ? serialized.length * 2
    : new TextEncoder().encode(serialized).byteLength;
  return bytes <= BOARD_ROOM_CLIPBOARD_MAX_BYTES ? serialized : null;
}

function clipboardRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clipboardString(value: unknown, max = 2_048): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function clipboardNullableString(value: unknown, max = 100_000): value is string | null | undefined {
  return value == null || (typeof value === 'string' && value.length <= max);
}

function clipboardNumber(value: unknown, options: { positive?: boolean } = {}): value is number {
  return typeof value === 'number' && Number.isFinite(value) &&
    Math.abs(value) <= 10_000_000 && (!options.positive || value > 0);
}

function safeClipboardJson(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value == null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 100_000;
  if (Array.isArray(value)) {
    return value.length <= 1_000 && value.every((entry) => safeClipboardJson(entry, depth + 1));
  }
  if (!clipboardRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 1_000 && entries.every(([key, entry]) =>
    !['__proto__', 'prototype', 'constructor'].includes(key) &&
    key.length <= 256 &&
    safeClipboardJson(entry, depth + 1),
  );
}

const CLIPBOARD_ITEM_TYPES = new Set([
  'product',
  'capture',
  'image',
  'palette',
  'note',
  'room_scan',
]);

function parseClipboardItem(value: unknown): EditableMoodBoardItem | null {
  if (!clipboardRecord(value)) return null;
  if (!clipboardString(value.id) || !CLIPBOARD_ITEM_TYPES.has(String(value.type))) return null;
  if (
    !clipboardNumber(value.x) ||
    !clipboardNumber(value.y) ||
    !clipboardNumber(value.width, { positive: true }) ||
    !(value.height == null || clipboardNumber(value.height, { positive: true })) ||
    !(value.zIndex == null || clipboardNumber(value.zIndex)) ||
    !(value.rotation == null || clipboardNumber(value.rotation)) ||
    !(value.locked == null || typeof value.locked === 'boolean') ||
    !clipboardNullableString(value.productId) ||
    !clipboardNullableString(value.captureId) ||
    !clipboardNullableString(value.paletteId) ||
    !clipboardNullableString(value.imageUrl) ||
    !clipboardNullableString(value.imageKey) ||
    !clipboardNullableString(value.content) ||
    !(value.data == null || (clipboardRecord(value.data) && safeClipboardJson(value.data)))
  ) return null;
  return {
    id: value.id,
    type: value.type as EditableMoodBoardItem['type'],
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height as number | null | undefined,
    zIndex: (value.zIndex as number | undefined) ?? 0,
    rotation: (value.rotation as number | undefined) ?? 0,
    locked: (value.locked as boolean | undefined) ?? false,
    productId: (value.productId as string | null | undefined) ?? null,
    captureId: (value.captureId as string | null | undefined) ?? null,
    paletteId: (value.paletteId as string | null | undefined) ?? null,
    imageUrl: (value.imageUrl as string | null | undefined) ?? null,
    imageKey: (value.imageKey as string | null | undefined) ?? null,
    content: (value.content as string | null | undefined) ?? null,
    data: (value.data as MoodBoardItemData | null | undefined) ?? {},
  };
}

export function parseBoardRoomClipboard(value: string): BoardRoomClipboardEnvelope | null {
  try {
    const bytes = typeof TextEncoder === 'undefined'
      ? value.length * 2
      : new TextEncoder().encode(value).byteLength;
    if (bytes > BOARD_ROOM_CLIPBOARD_MAX_BYTES) return null;
    const envelope = JSON.parse(value) as unknown;
    if (
      !clipboardRecord(envelope) ||
      envelope.namespace !== BOARD_ROOM_CLIPBOARD_NAMESPACE ||
      envelope.version !== 1 ||
      !clipboardRecord(envelope.owner) ||
      (envelope.owner.kind !== 'proposal' && envelope.owner.kind !== 'project') ||
      !clipboardString(envelope.owner.id) ||
      !clipboardString(envelope.originBoardId) ||
      !Array.isArray(envelope.items) ||
      envelope.items.length === 0 ||
      envelope.items.length > 1_000
    ) return null;
    const items: BoardRoomClipboardItem[] = [];
    for (const entry of envelope.items) {
      if (
        !clipboardRecord(entry) ||
        !clipboardRecord(entry.offset) ||
        !clipboardNumber(entry.offset.x) ||
        !clipboardNumber(entry.offset.y) ||
        !(entry.sectionName == null || (typeof entry.sectionName === 'string' && entry.sectionName.length <= 256))
      ) return null;
      const item = parseClipboardItem(entry.item);
      if (!item) return null;
      items.push({
        item,
        offset: { x: entry.offset.x, y: entry.offset.y },
        sectionName: (entry.sectionName as string | null | undefined) ?? null,
      });
    }
    return {
      namespace: BOARD_ROOM_CLIPBOARD_NAMESPACE,
      version: 1,
      owner: { kind: envelope.owner.kind, id: envelope.owner.id },
      originBoardId: envelope.originBoardId,
      items,
    };
  } catch {
    return null;
  }
}

export interface PasteBoardRoomItemsResult extends BoardRoomCommandResult {
  createdIds: string[];
  /** Existing and pasted pins are translated together for left/top growth. */
  translation: BoardPoint;
}

export function pasteBoardRoomItems(
  history: BoardRoomHistory,
  envelope: BoardRoomClipboardEnvelope,
  point: BoardPoint,
  createId: (source: EditableMoodBoardItem, index: number) => string,
  options: Pick<BoardRoomCommandOptions, 'id' | 'committedAt'>,
): PasteBoardRoomItemsResult {
  const preserveForeignKeys = sameOwner(envelope.owner, history.present.owner);
  const sections = new Map(history.present.sections.map((section) => [section.name, section.id]));
  const maxZ = Math.max(0, ...history.present.items.map((item) => item.zIndex ?? 0));
  const created = envelope.items.map((entry, index): EditableMoodBoardItem => {
    const sectionId = entry.sectionName ? sections.get(entry.sectionName) ?? null : null;
    const data = { ...(cloneData(entry.item.data) ?? {}), section_id: sectionId };
    return {
      ...cloneBoardItem(entry.item),
      id: createId(entry.item, index),
      x: point.x + entry.offset.x,
      y: point.y + entry.offset.y,
      zIndex: maxZ + index + 1,
      productId: preserveForeignKeys ? entry.item.productId ?? null : null,
      captureId: preserveForeignKeys ? entry.item.captureId ?? null : null,
      paletteId: preserveForeignKeys ? entry.item.paletteId ?? null : null,
      data,
    };
  });
  const createdIds = created.map((item) => item.id);
  const existing = new Set(history.present.items.map((item) => item.id));
  const fitted = growBoardRoomStateToFitItems({
    ...history.present,
    items: [
      ...history.present.items,
      ...created
        .filter((item) => !existing.has(item.id))
        .map(cloneBoardItem),
    ],
  });
  const translation = fitted.translation;
  const result = commitBoardRoomCommand(
    history,
    {
      ...options,
      kind: 'paste',
      lane: 'structural',
      touches: createdIds,
      viewTranslation: translation,
    },
    () => fitted.state,
  );
  return { ...result, createdIds, translation };
}
