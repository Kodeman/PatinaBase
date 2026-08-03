'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import {
  BoardComposition,
  BoardRoomCanvas,
  type BoardCompositionBoard,
  type BoardContextMenuRequest,
  type BoardItemsDroppedCommit,
  type BoardRoomCanvasProps,
  type BoardView,
} from '@patina/design-system';
import {
  useApplyBoardRoomState,
  useBoard,
  useSaveBoardLayout,
  useUpsertBoard,
  type BoardLayoutPosition,
  type ProposalBoardItem,
} from '@patina/supabase';
import type {
  BoardCommandKind,
  BoardCommandLane,
  BoardOwnerRef,
  BoardPoint,
  EditableMoodBoardItem,
} from '@patina/types';
import { useBufferedAutosave, type BufferedAutosaveState } from '@/hooks/use-buffered-autosave';
import {
  flushBoardOwnerAutosaves,
  runBoardOwnerAutosaveAction,
} from '@/lib/proposal-autosave-registry';
import {
  addBoardRoomItems,
  alignBoardRoomItems,
  altDragDuplicateBoardRoomItems,
  changeBoardRoomZOrder,
  cloneBoardRoomState,
  commitItemPatches,
  createBoardRoomHistory,
  deleteBoardRoomItems,
  distributeBoardRoomItems,
  duplicateBoardRoomItems,
  growBoardRoomCanvas,
  moveBoardRoomSectionBand,
  nudgeBoardRoomItems,
  parseBoardRoomClipboard,
  pasteBoardRoomItems,
  replaceBoardRoomItem,
  redoBoardRoomCommand,
  serializeBoardRoomSelection,
  tidyBoardRoomItems,
  toggleBoardRoomLock,
  trimBoardRoomCanvas,
  undoBoardRoomCommand,
  updateBoardRoomItemFields,
  updateBoardRoomFields,
  updateBoardRoomSections,
  BOARD_ROOM_CLIPBOARD_MIME,
  BOARD_ROOM_HISTORY_LIMIT,
  type BoardItemPatch,
  type BoardRoomAlignment,
  type BoardRoomCommandResult,
  type BoardRoomCommand,
  type BoardRoomDistribution,
  type BoardRoomHistory,
  type BoardRoomMode,
  type BoardRoomState,
  type BoardSectionOperation,
  type BoardZOrderAction,
} from './board-room-command-engine';
import { arrangeBoardItems } from './board-arrange';
import { renderBoardRoomItem } from './board-item-renderer';

export type { BoardRoomMode } from './board-room-command-engine';

type LayoutEnvelope = Record<
  string,
  { generation: number; position: BoardLayoutPosition }
>;

interface CanvasPatch {
  canvasWidth?: number;
  canvasHeight?: number;
}

export interface BoardRoomContextMenuState extends BoardContextMenuRequest {
  open: boolean;
}

export interface BoardRoomAddOptions {
  id?: string;
  kind?: 'add' | 'paste' | 'duplicate';
  select?: boolean;
  source?: BoardRoomItemAddSource;
}

export type BoardRoomItemAddSource =
  | 'rail_drag'
  | 'rail_click'
  | 'file_drop'
  | 'paste'
  | 'duplicate'
  | 'suggestion';

export interface BoardRoomCommandCommittedEvent {
  command: BoardRoomCommand;
  direction: StructuralTransitionDirection;
}

export interface BoardRoomTidyOptions {
  gap?: number;
  /** Reuse while the transient spacing control is active to replace one step. */
  gestureId?: string;
}

export interface BoardRoomControllerOptions {
  owner: BoardOwnerRef;
  boardId: string;
  mode?: BoardRoomMode;
  defaultMode?: BoardRoomMode;
  showNotes?: boolean;
  defaultShowNotes?: boolean;
  onModeChange?: (mode: BoardRoomMode) => void;
  onShowNotesChange?: (showNotes: boolean) => void;
  onExit?: () => void | Promise<void>;
  onItemActivate?: (item: EditableMoodBoardItem) => void;
  onError?: (error: Error) => void;
  /** Upload adapter. Returned rows enter history as one add command. */
  onItemsDropped?: (
    commit: BoardItemsDroppedCommit,
  ) => Promise<readonly EditableMoodBoardItem[] | void>;
  onPasteImages?: (
    files: readonly File[],
    point: BoardPoint,
  ) => Promise<readonly EditableMoodBoardItem[] | void>;
  /** Phase-3 URL seam. Phase 1 leaves this undefined and URL paste is a no-op. */
  onPasteUrl?: (
    url: string,
    point: BoardPoint,
    controls: BoardRoomUrlPasteControls,
  ) => Promise<readonly EditableMoodBoardItem[] | void>;
  onSendToSchedule?: (item: EditableMoodBoardItem) => void;
  onOpenProduct?: (item: EditableMoodBoardItem) => void;
  onReplaceImage?: (item: EditableMoodBoardItem) => void;
  /** Central guard shared by keyboard, context-menu, cut, and inspector deletes. */
  onBeforeDelete?: (items: readonly EditableMoodBoardItem[]) => boolean;
  onItemsAdded?: (
    items: readonly EditableMoodBoardItem[],
    source: BoardRoomItemAddSource,
  ) => void;
  onCommandCommitted?: (event: BoardRoomCommandCommittedEvent) => void;
}

export interface BoardRoomUrlPasteControls {
  addPlaceholder: (item: EditableMoodBoardItem) => void;
  replaceItem: (item: EditableMoodBoardItem) => void;
  removeItem: (itemId: string) => void;
}

export interface BoardRoomControllerProps extends BoardRoomControllerOptions {
  className?: string;
  children?: (api: BoardRoomControllerApi) => ReactNode;
}

export interface BoardRoomControllerApi {
  state: BoardRoomState | null;
  mode: BoardRoomMode;
  showNotes: boolean;
  view: BoardView;
  selectedItemIds: string[];
  focusedItemId: string | null;
  contextMenu: BoardRoomContextMenuState | null;
  isLoading: boolean;
  isExiting: boolean;
  persistenceState: BufferedAutosaveState | 'saving';
  persistenceError: string | null;
  announcement: string;
  canUndo: boolean;
  canRedo: boolean;
  canvasProps: BoardRoomCanvasProps | null;
  compositionBoard: BoardCompositionBoard | null;
  setMode: (mode: BoardRoomMode) => void;
  togglePresent: () => void;
  setShowNotes: (showNotes: boolean) => void;
  setSelection: (ids: readonly string[]) => void;
  setFocusedItemId: (id: string | null) => void;
  closeContextMenu: () => void;
  flushPending: () => Promise<void>;
  requestExit: () => Promise<boolean>;
  undo: () => void;
  redo: () => void;
  addItems: (items: readonly EditableMoodBoardItem[], options?: BoardRoomAddOptions) => string[];
  deleteItems: (ids?: readonly string[]) => void;
  duplicateItems: (ids?: readonly string[]) => string[];
  altDragItems: (ids: readonly string[], delta: BoardPoint, gestureId?: string) => string[];
  copyItems: (ids?: readonly string[]) => Promise<string | null>;
  cutItems: (ids?: readonly string[]) => Promise<void>;
  pasteAt: (
    point: BoardPoint,
    serialized?: string,
    source?: BoardRoomItemAddSource,
  ) => Promise<string[]>;
  moveItems: (
    patches: Readonly<Record<string, Pick<BoardItemPatch, 'x' | 'y'>>>,
    id?: string,
  ) => void;
  resizeItem: (id: string, patch: BoardItemPatch, gestureId?: string) => void;
  rotateItem: (id: string, rotation: number, gestureId?: string) => void;
  alignItems: (alignment: BoardRoomAlignment, ids?: readonly string[]) => void;
  distributeItems: (distribution: BoardRoomDistribution, ids?: readonly string[]) => void;
  nudgeItems: (delta: BoardPoint, ids?: readonly string[]) => void;
  changeZOrder: (action: BoardZOrderAction, ids?: readonly string[]) => void;
  toggleLock: (ids?: readonly string[]) => void;
  updateItem: (id: string, patch: BoardItemPatch) => void;
  replaceItem: (item: EditableMoodBoardItem) => void;
  renameBoard: (name: string) => void;
  tidy: (ids?: readonly string[], options?: BoardRoomTidyOptions) => void;
  setSectionMembership: (itemId: string, sectionId: string | null) => void;
  setItemsSectionMembership: (itemIds: readonly string[], sectionId: string | null) => void;
  updateSections: (operation: BoardSectionOperation) => void;
  moveSectionBand: (sectionId: string, delta: BoardPoint) => void;
  trimCanvas: () => void;
  /** Clears a surfaced error after the failed structural change was reverted. */
  discardPersistenceError: () => void;
}

function boardItemFromRow(row: ProposalBoardItem): EditableMoodBoardItem {
  return {
    id: row.id,
    type: row.type,
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: row.height == null ? null : Number(row.height),
    zIndex: row.z_index,
    rotation: Number(row.rotation),
    locked: row.locked,
    productId: row.product_id,
    captureId: row.capture_id,
    paletteId: row.palette_id,
    imageUrl: row.image_url,
    content: row.content,
    data: row.data ?? {},
  };
}

function layoutPosition(boardId: string, item: EditableMoodBoardItem): BoardLayoutPosition {
  return {
    id: item.id,
    board_id: boardId,
    type: item.type,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height ?? null,
    z_index: item.zIndex ?? 0,
    rotation: item.rotation ?? 0,
  };
}

function compositionBoard(state: BoardRoomState): BoardCompositionBoard {
  return {
    id: state.boardId,
    name: state.name,
    canvas_width: state.canvasWidth,
    canvas_height: state.canvasHeight,
    background_color: state.backgroundColor,
    sections: state.sections,
    items: state.items.map((item) => ({
      id: item.id,
      type: item.type,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height ?? null,
      z_index: item.zIndex ?? 0,
      rotation: item.rotation ?? 0,
      locked: item.locked ?? false,
      image_url: item.imageUrl ?? null,
      content: item.content ?? null,
      data: item.data ?? {},
    })),
  };
}

function stableString(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function sameGeometry(a: EditableMoodBoardItem, b: EditableMoodBoardItem): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width &&
    (a.height ?? null) === (b.height ?? null) &&
    (a.zIndex ?? 0) === (b.zIndex ?? 0) &&
    (a.rotation ?? 0) === (b.rotation ?? 0);
}

function sameStructuralItem(a: EditableMoodBoardItem, b: EditableMoodBoardItem): boolean {
  return a.type === b.type &&
    (a.locked ?? false) === (b.locked ?? false) &&
    (a.productId ?? null) === (b.productId ?? null) &&
    (a.captureId ?? null) === (b.captureId ?? null) &&
    (a.paletteId ?? null) === (b.paletteId ?? null) &&
    (a.imageUrl ?? null) === (b.imageUrl ?? null) &&
    (a.content ?? null) === (b.content ?? null) &&
    stableString(a.data) === stableString(b.data);
}

function sameValue(a: unknown, b: unknown): boolean {
  return stableString(a) === stableString(b);
}

function atomicBoardState(state: BoardRoomState) {
  return {
    name: state.name,
    canvasWidth: state.canvasWidth,
    canvasHeight: state.canvasHeight,
    backgroundColor: state.backgroundColor,
    sections: state.sections.map((section) => ({ ...section })),
    items: state.items.map((item) => ({
      id: item.id,
      type: item.type,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height ?? null,
      zIndex: item.zIndex ?? 0,
      rotation: item.rotation ?? 0,
      locked: item.locked ?? false,
      productId: item.productId ?? null,
      captureId: item.captureId ?? null,
      paletteId: item.paletteId ?? null,
      imageUrl: item.imageUrl ?? null,
      content: item.content ?? null,
      data: item.data ?? {},
    })),
  };
}

export type StructuralTransitionDirection = 'apply' | 'undo' | 'redo';

function recoveryCommand(
  command: BoardRoomCommand,
  before: BoardRoomState,
  after: BoardRoomState,
): BoardRoomCommand {
  return {
    id: `recovery:${command.id}:${Date.now()}`,
    kind: 'content',
    lane: 'structural',
    touches: [...command.touches],
    before: cloneBoardRoomState(before),
    after: cloneBoardRoomState(after),
    committedAt: Date.now(),
  };
}

/** Keep the unaffected history prefix instead of erasing all undo state. */
function historyAfterStructuralFailure(
  history: BoardRoomHistory,
  command: BoardRoomCommand,
  direction: StructuralTransitionDirection,
  reverted: BoardRoomState,
): BoardRoomHistory {
  if (direction === 'undo') {
    const futureIndex = history.future.findIndex((entry) => entry.id === command.id);
    if (futureIndex >= 0 && sameValue(history.present, command.before)) {
      return {
        present: cloneBoardRoomState(reverted),
        past: [...history.past, command].slice(-BOARD_ROOM_HISTORY_LIMIT),
        future: history.future.filter((_, index) => index !== futureIndex),
      };
    }
    const recovery = recoveryCommand(command, history.present, reverted);
    return {
      present: cloneBoardRoomState(reverted),
      past: [...history.past, recovery].slice(-BOARD_ROOM_HISTORY_LIMIT),
      future: [],
    };
  }

  let commandIndex = -1;
  for (let index = history.past.length - 1; index >= 0; index -= 1) {
    if (history.past[index]?.id === command.id) {
      commandIndex = index;
      break;
    }
  }
  if (commandIndex >= 0) {
    const prefix = history.past.slice(0, commandIndex);
    const cleanBase = command.before;
    const hasLaterEffectiveEdits = !sameValue(cleanBase, reverted);
    const past = hasLaterEffectiveEdits
      ? [...prefix, recoveryCommand(command, cleanBase, reverted)]
      : prefix;
    return {
      present: cloneBoardRoomState(reverted),
      past: past.slice(-BOARD_ROOM_HISTORY_LIMIT),
      future: direction === 'redo' && !hasLaterEffectiveEdits
        ? [command, ...history.future]
        : [],
    };
  }

  return createBoardRoomHistory(reverted);
}

function cloneValue<Value>(value: Value): Value {
  if (typeof structuredClone === 'function') return structuredClone(value);
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as Value;
}

/**
 * Three-way inverse for a failed immediate write. Later unrelated local edits
 * survive; an item whose create failed is removed even if it was edited later.
 */
export function revertFailedStructuralTransition(
  current: BoardRoomState,
  before: BoardRoomState,
  after: BoardRoomState,
): BoardRoomState {
  const reverted = cloneBoardRoomState(current);
  const currentRecord = reverted as unknown as Record<string, unknown>;
  const beforeRecord = before as unknown as Record<string, unknown>;
  const afterRecord = after as unknown as Record<string, unknown>;
  for (const key of ['name', 'canvasWidth', 'canvasHeight', 'backgroundColor', 'sections']) {
    if (sameValue(currentRecord[key], afterRecord[key])) {
      currentRecord[key] = cloneValue(beforeRecord[key]);
    }
  }

  const beforeById = new Map(before.items.map((item) => [item.id, item]));
  const afterById = new Map(after.items.map((item) => [item.id, item]));
  const currentById = new Map(reverted.items.map((item) => [item.id, item]));
  const result = new Map<string, EditableMoodBoardItem>();
  const keys: Array<keyof EditableMoodBoardItem> = [
    'type',
    'x',
    'y',
    'width',
    'height',
    'zIndex',
    'rotation',
    'locked',
    'productId',
    'captureId',
    'paletteId',
    'imageUrl',
    'imageKey',
    'content',
    'data',
  ];

  for (const [id, currentItem] of currentById) {
    const previous = beforeById.get(id);
    const failed = afterById.get(id);
    if (!previous && failed) continue;
    if (!previous || !failed) {
      result.set(id, currentItem);
      continue;
    }
    const next = cloneBoardRoomState({ ...current, items: [currentItem] }).items[0];
    const nextRecord = next as unknown as Record<string, unknown>;
    const previousRecord = previous as unknown as Record<string, unknown>;
    const failedRecord = failed as unknown as Record<string, unknown>;
    for (const key of keys) {
      if (sameValue(nextRecord[key], failedRecord[key])) {
        nextRecord[key] = cloneValue(previousRecord[key]);
      }
    }
    result.set(id, next);
  }

  for (const item of before.items) {
    if (!afterById.has(item.id) && !result.has(item.id)) {
      result.set(item.id, cloneBoardRoomState({ ...before, items: [item] }).items[0]);
    }
  }
  const orderedIds = [
    ...before.items.map((item) => item.id),
    ...reverted.items.map((item) => item.id).filter((id) => !beforeById.has(id)),
  ];
  reverted.items = orderedIds.flatMap((id) => result.get(id) ? [result.get(id)!] : []);
  return reverted;
}

function generatedId(prefix = 'board-item'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element && (
    element.isContentEditable ||
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT'
  );
}

async function writeClipboardJson(value: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return;
  if ('write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          [BOARD_ROOM_CLIPBOARD_MIME]: new Blob([value], { type: BOARD_ROOM_CLIPBOARD_MIME }),
          'text/plain': new Blob([value], { type: 'text/plain' }),
        }),
      ]);
      return;
    } catch {
      // Some browsers reject custom clipboard MIME types. The namespaced,
      // fully validated text envelope remains interoperable.
    }
  }
  await navigator.clipboard.writeText(value);
}

interface BoardClipboardPayload {
  text: string | null;
  images: File[];
}

const BOARD_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
]);
const BOARD_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export function validateBoardImageFiles(files: readonly File[]): void {
  const invalidType = files.find((file) => !BOARD_IMAGE_TYPES.has(file.type));
  if (invalidType) {
    throw new Error(
      `${invalidType.name || 'That file'} is not supported. Use PNG, JPEG, WebP, GIF, or AVIF.`,
    );
  }
  const tooLarge = files.find((file) => file.size > BOARD_IMAGE_MAX_BYTES);
  if (tooLarge) throw new Error(`${tooLarge.name || 'That image'} exceeds the 20MB limit.`);
}

async function readClipboardPayload(): Promise<BoardClipboardPayload> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return { text: null, images: [] };
  }
  const clipboard = navigator.clipboard as unknown as {
    read?: () => Promise<ClipboardItem[]>;
    readText: () => Promise<string>;
  };
  if (typeof clipboard.read === 'function') {
    const entries = await clipboard.read();
    let text: string | null = null;
    const images: File[] = [];
    for (const entry of entries) {
      const imageType = entry.types.find((type) => BOARD_IMAGE_TYPES.has(type));
      if (imageType) {
        const blob = await entry.getType(imageType);
        images.push(new File([blob], `clipboard.${imageType.split('/')[1]}`, { type: imageType }));
      }
      const type = entry.types.includes(BOARD_ROOM_CLIPBOARD_MIME)
        ? BOARD_ROOM_CLIPBOARD_MIME
        : entry.types.includes('text/plain')
          ? 'text/plain'
          : null;
      if (type && text === null) text = await (await entry.getType(type)).text();
    }
    return { text, images };
  }
  return { text: await clipboard.readText(), images: [] };
}

export function useBoardRoomController({
  owner: ownerInput,
  boardId,
  mode: controlledMode,
  defaultMode = 'edit',
  showNotes: controlledShowNotes,
  defaultShowNotes = true,
  onModeChange,
  onShowNotesChange,
  onExit,
  onItemActivate,
  onError,
  onItemsDropped,
  onPasteImages,
  onPasteUrl,
  onBeforeDelete,
  onItemsAdded,
  onCommandCommitted,
}: BoardRoomControllerOptions): BoardRoomControllerApi {
  const owner = useMemo<BoardOwnerRef>(
    () => ({ kind: ownerInput.kind, id: ownerInput.id }),
    [ownerInput.id, ownerInput.kind],
  );
  const identityKey = `${owner.kind}:${owner.id}:${boardId}`;
  const boardQuery = useBoard(boardId);
  const saveLayoutMutation = useSaveBoardLayout();
  const upsertBoardMutation = useUpsertBoard();
  const applyStateMutation = useApplyBoardRoomState();

  const [history, setHistory] = useState<BoardRoomHistory | null>(null);
  const historyRef = useRef<BoardRoomHistory | null>(null);
  const stateRef = useRef<BoardRoomState | null>(null);
  const initializedIdentityRef = useRef<string | null>(null);
  const generationsRef = useRef(new Map<string, number>());
  const structuralTasksRef = useRef(new Set<Promise<unknown>>());
  const structuralQueueRef = useRef<Promise<void>>(Promise.resolve());
  const structuralWriteGateRef = useRef<Promise<void> | null>(null);
  const [structuralSaving, setStructuralSaving] = useState(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [internalMode, setInternalMode] = useState(defaultMode);
  const [internalShowNotes, setInternalShowNotes] = useState(defaultShowNotes);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<BoardRoomContextMenuState | null>(null);
  const [view, setView] = useState<BoardView>({ pan: { x: 32, y: 32 }, zoom: 1 });
  const [isExiting, setIsExiting] = useState(false);
  const lastPointerRef = useRef<BoardPoint | null>(null);
  const activeSemanticGestureRef = useRef<string | null>(null);
  const transitionBarrierRef = useRef<() => Promise<void>>(async () => {});
  const mode = controlledMode ?? internalMode;
  const showNotes = controlledShowNotes ?? internalShowNotes;

  const reportError = useCallback((error: unknown) => {
    const normalized = error instanceof Error ? error : new Error('The board change could not be saved.');
    setPersistenceError(normalized.message);
    onError?.(normalized);
  }, [onError]);

  const layoutBuffer = useBufferedAutosave<string, LayoutEnvelope>({
    owner,
    generationKey: `${identityKey}:layout`,
    delay: 600,
    save: useCallback(async (targetBoardId: string, envelope: LayoutEnvelope) => {
      await structuralWriteGateRef.current;
      const current = stateRef.current;
      if (!current || current.boardId !== targetBoardId) return;
      const live = new Set(current.items.map((item) => item.id));
      const positions = Object.values(envelope)
        .filter(({ generation, position }) =>
          live.has(position.id) && generationsRef.current.get(position.id) === generation,
        )
        .map(({ position }) => position);
      if (positions.length === 0) return;
      await saveLayoutMutation.mutateAsync({ boardId: targetBoardId, owner, positions });
    }, [owner, saveLayoutMutation]),
  });

  const canvasBuffer = useBufferedAutosave<string, CanvasPatch>({
    owner,
    generationKey: `${identityKey}:canvas`,
    delay: 1_000,
    save: useCallback(async (targetBoardId: string, patch: CanvasPatch) => {
      await structuralWriteGateRef.current;
      await upsertBoardMutation.mutateAsync({ boardId: targetBoardId, owner, ...patch });
    }, [owner, upsertBoardMutation]),
  });

  useEffect(() => {
    const board = boardQuery.data;
    if (!board || initializedIdentityRef.current === identityKey) return;
    const actualOwner: BoardOwnerRef | null = board.project_id
      ? { kind: 'project', id: board.project_id }
      : board.proposal_id
        ? { kind: 'proposal', id: board.proposal_id }
        : null;
    if (!actualOwner || actualOwner.kind !== owner.kind || actualOwner.id !== owner.id) {
      reportError(new Error('This board does not belong to the requested owner.'));
      return;
    }
    const initialState: BoardRoomState = {
      boardId: board.id,
      owner,
      name: board.name,
      canvasWidth: Number(board.canvas_width),
      canvasHeight: Number(board.canvas_height),
      backgroundColor: board.background_color,
      sections: (board.sections ?? []).map((section) => ({ ...section })),
      items: (board.items ?? []).map(boardItemFromRow),
    };
    const initialHistory = createBoardRoomHistory(initialState);
    generationsRef.current = new Map(initialState.items.map((item) => [item.id, 0]));
    historyRef.current = initialHistory;
    stateRef.current = initialHistory.present;
    initializedIdentityRef.current = identityKey;
    setHistory(initialHistory);
    setSelectedItemIds([]);
    setFocusedItemId(null);
    setPersistenceError(null);
  }, [boardQuery.data, identityKey, owner, reportError]);

  const scheduleStructural = useCallback((
    before: BoardRoomState,
    after: BoardRoomState,
    command: BoardRoomCommand,
    direction: StructuralTransitionDirection,
  ): void => {
    const previous = structuralQueueRef.current;
    const task = previous.catch(() => undefined).then(async () => {
      try {
        await runBoardOwnerAutosaveAction(owner, () => {
          // Snapshot at execution time. A later queued command therefore
          // rebases on any rollback that occurred ahead of it.
          const live = stateRef.current ?? after;
          const write = applyStateMutation.mutateAsync({
            boardId,
            owner,
            state: atomicBoardState(live),
          });
          const gate = write.then(() => undefined, () => undefined);
          structuralWriteGateRef.current = gate;
          return write.finally(() => {
            if (structuralWriteGateRef.current === gate) structuralWriteGateRef.current = null;
          });
        });
      } catch (error) {
        const current = stateRef.current;
        if (current) {
          const reverted = revertFailedStructuralTransition(current, before, after);
          const activeHistory = historyRef.current ?? createBoardRoomHistory(current);
          const reconciled = historyAfterStructuralFailure(
            activeHistory,
            command,
            direction,
            reverted,
          );
          historyRef.current = reconciled;
          stateRef.current = reconciled.present;
          generationsRef.current = new Map(
            reverted.items.map((item) => [item.id, generationsRef.current.get(item.id) ?? 0]),
          );
          setHistory(reconciled);
          setSelectedItemIds((ids) => ids.filter((id) => reverted.items.some((item) => item.id === id)));
        }
        const normalized = error instanceof Error ? error : new Error('The board change could not be saved.');
        reportError(new Error(`That change was reverted because it could not be saved. ${normalized.message}`));
        throw error;
      }
    });
    structuralQueueRef.current = task.then(() => undefined, () => undefined);
    structuralTasksRef.current.add(task);
    setStructuralSaving(true);
    void task.catch(() => undefined).finally(() => {
      structuralTasksRef.current.delete(task);
      setStructuralSaving(structuralTasksRef.current.size > 0);
    });
  }, [applyStateMutation, boardId, owner, reportError]);

  const persistTransition = useCallback((
    before: BoardRoomState,
    after: BoardRoomState,
    command: BoardRoomCommand,
    direction: StructuralTransitionDirection,
  ) => {
    const beforeById = new Map(before.items.map((item) => [item.id, item]));
    const afterById = new Map(after.items.map((item) => [item.id, item]));
    let structural = before.items.length !== after.items.length ||
      before.name !== after.name ||
      before.backgroundColor !== after.backgroundColor ||
      stableString(before.sections) !== stableString(after.sections);
    for (const removed of before.items.filter((item) => !afterById.has(item.id))) {
      generationsRef.current.set(removed.id, (generationsRef.current.get(removed.id) ?? 0) + 1);
    }
    for (const added of after.items.filter((item) => !beforeById.has(item.id))) {
      if (!generationsRef.current.has(added.id)) generationsRef.current.set(added.id, 0);
    }

    const layoutEnvelope: LayoutEnvelope = {};
    for (const next of after.items) {
      const previous = beforeById.get(next.id);
      if (!previous) continue;
      if (!sameGeometry(previous, next)) {
        layoutEnvelope[next.id] = {
          generation: generationsRef.current.get(next.id) ?? 0,
          position: layoutPosition(boardId, next),
        };
      }
      if (!sameStructuralItem(previous, next)) {
        structural = true;
      }
    }

    // While a full-state write is queued, keep subsequent geometry on the same
    // serialized path. This prevents a late layout request from racing an item
    // create/delete snapshot.
    if (structural || structuralTasksRef.current.size > 0) {
      scheduleStructural(before, after, command, direction);
      return;
    }

    if (Object.keys(layoutEnvelope).length > 0) layoutBuffer.queue(boardId, layoutEnvelope);

    if (before.canvasWidth !== after.canvasWidth || before.canvasHeight !== after.canvasHeight) {
      canvasBuffer.queue(boardId, {
        canvasWidth: after.canvasWidth,
        canvasHeight: after.canvasHeight,
      });
    }
  }, [
    boardId,
    canvasBuffer,
    layoutBuffer,
    scheduleStructural,
  ]);

  const applyResult = useCallback((result: BoardRoomCommandResult, selection?: readonly string[]) => {
    const previous = historyRef.current;
    if (!previous || !result.command) return result;
    historyRef.current = result.history;
    stateRef.current = result.history.present;
    setPersistenceError(null);
    setHistory(result.history);
    if (selection) setSelectedItemIds([...selection]);
    else setSelectedItemIds((ids) => ids.filter((id) => result.history.present.items.some((item) => item.id === id)));
    persistTransition(previous.present, result.history.present, result.command, 'apply');
    setAnnouncement(`${result.command.kind.replaceAll('-', ' ')} applied`);
    onCommandCommitted?.({ command: result.command, direction: 'apply' });
    return result;
  }, [onCommandCommitted, persistTransition]);

  const execute = useCallback((
    create: (current: BoardRoomHistory) => BoardRoomCommandResult,
    selection?: readonly string[],
  ): BoardRoomCommandResult | null => {
    const current = historyRef.current;
    if (!current) return null;
    return applyResult(create(current), selection);
  }, [applyResult]);

  const setMode = useCallback((next: BoardRoomMode) => {
    if (controlledMode === undefined) setInternalMode(next);
    onModeChange?.(next);
  }, [controlledMode, onModeChange]);
  const togglePresent = useCallback(() => {
    if (mode === 'present') {
      setMode('edit');
      return;
    }
    void transitionBarrierRef.current()
      .then(() => setMode('present'))
      .catch(reportError);
  }, [mode, reportError, setMode]);
  const setShowNotes = useCallback((next: boolean) => {
    if (controlledShowNotes === undefined) setInternalShowNotes(next);
    onShowNotesChange?.(next);
  }, [controlledShowNotes, onShowNotesChange]);

  const setSelection = useCallback((ids: readonly string[]) => {
    const current = stateRef.current;
    if (!current) return;
    const live = new Set(current.items.map((item) => item.id));
    setSelectedItemIds([...new Set(ids)].filter((id) => live.has(id)));
  }, []);

  const undo = useCallback(() => {
    const current = historyRef.current;
    if (!current) return;
    const step = undoBoardRoomCommand(current);
    if (!step.command) return;
    historyRef.current = step.history;
    stateRef.current = step.history.present;
    setHistory(step.history);
    setSelectedItemIds((ids) => ids.filter((id) => step.history.present.items.some((item) => item.id === id)));
    persistTransition(current.present, step.history.present, step.command, 'undo');
    setAnnouncement(`Undid ${step.command.kind.replaceAll('-', ' ')}`);
    onCommandCommitted?.({ command: step.command, direction: 'undo' });
  }, [onCommandCommitted, persistTransition]);

  const redo = useCallback(() => {
    const current = historyRef.current;
    if (!current) return;
    const step = redoBoardRoomCommand(current);
    if (!step.command) return;
    historyRef.current = step.history;
    stateRef.current = step.history.present;
    setHistory(step.history);
    setSelectedItemIds((ids) => ids.filter((id) => step.history.present.items.some((item) => item.id === id)));
    persistTransition(current.present, step.history.present, step.command, 'redo');
    setAnnouncement(`Redid ${step.command.kind.replaceAll('-', ' ')}`);
    onCommandCommitted?.({ command: step.command, direction: 'redo' });
  }, [onCommandCommitted, persistTransition]);

  const addItems = useCallback((items: readonly EditableMoodBoardItem[], options: BoardRoomAddOptions = {}) => {
    const normalized = items.map((item) => ({ ...item, id: item.id || generatedId() }));
    const ids = normalized.map((item) => item.id);
    const result = execute(
      (current) => addBoardRoomItems(current, normalized, {
        id: options.id ?? generatedId('add'),
        kind: options.kind ?? 'add',
        lane: 'structural',
      }),
      options.select === false ? undefined : ids,
    );
    if (result?.command && options.source) onItemsAdded?.(normalized, options.source);
    return ids;
  }, [execute, onItemsAdded]);

  const deleteItems = useCallback((ids: readonly string[] = selectedItemIds) => {
    const current = stateRef.current;
    const targets = current?.items.filter((item) => ids.includes(item.id)) ?? [];
    if (targets.length === 0 || onBeforeDelete?.(targets) === false) return;
    execute((current) => deleteBoardRoomItems(current, ids, { id: generatedId('delete') }), []);
  }, [execute, onBeforeDelete, selectedItemIds]);

  const duplicateItems = useCallback((ids: readonly string[] = selectedItemIds) => {
    const current = historyRef.current;
    if (!current) return [];
    const result = duplicateBoardRoomItems(current, ids, () => generatedId(), { id: generatedId('duplicate') });
    applyResult(result, result.createdIds);
    if (result.command) {
      const created = result.history.present.items.filter((item) => result.createdIds.includes(item.id));
      onItemsAdded?.(created, 'duplicate');
    }
    return result.createdIds;
  }, [applyResult, onItemsAdded, selectedItemIds]);

  const altDragItems = useCallback((ids: readonly string[], delta: BoardPoint, gestureId?: string) => {
    const current = historyRef.current;
    if (!current) return [];
    const result = altDragDuplicateBoardRoomItems(current, ids, delta, () => generatedId(), { id: gestureId ?? generatedId('alt-drag') });
    applyResult(result, result.createdIds);
    if (result.command) {
      const created = result.history.present.items.filter((item) => result.createdIds.includes(item.id));
      onItemsAdded?.(created, 'duplicate');
    }
    return result.createdIds;
  }, [applyResult, onItemsAdded]);

  const copyItems = useCallback(async (ids: readonly string[] = selectedItemIds) => {
    const current = stateRef.current;
    if (!current) return null;
    const serialized = serializeBoardRoomSelection(current, ids);
    if (serialized) await writeClipboardJson(serialized);
    return serialized;
  }, [selectedItemIds]);

  const cutItems = useCallback(async (ids: readonly string[] = selectedItemIds) => {
    const serialized = await copyItems(ids);
    if (serialized) deleteItems(ids);
  }, [copyItems, deleteItems, selectedItemIds]);

  const pasteAt = useCallback(async (
    point: BoardPoint,
    serialized?: string,
    source: BoardRoomItemAddSource = 'paste',
  ) => {
    const payload = serialized === undefined
      ? await readClipboardPayload()
      : { text: serialized, images: [] };
    if (payload.images.length > 0 && onPasteImages) {
      validateBoardImageFiles(payload.images);
      const items = await onPasteImages(payload.images, point);
      if (items?.length) return addItems(items, { id: generatedId('paste-images'), kind: 'paste', source });
    }
    const value = payload.text;
    if (!value) return [];
    const envelope = parseBoardRoomClipboard(value);
    const current = historyRef.current;
    if (envelope && current) {
      const result = pasteBoardRoomItems(current, envelope, point, () => generatedId(), { id: generatedId('paste') });
      applyResult(result, result.createdIds);
      if (result.command) {
        const created = result.history.present.items.filter((item) => result.createdIds.includes(item.id));
        onItemsAdded?.(created, source);
      }
      return result.createdIds;
    }
    try {
      const url = new URL(value.trim());
      if (!onPasteUrl || !['http:', 'https:'].includes(url.protocol)) return [];
      const items = await onPasteUrl(url.toString(), point, {
        addPlaceholder: (item) => { addItems([item], { id: generatedId('url-placeholder') }); },
        replaceItem: (item) => {
          execute((active) => replaceBoardRoomItem(active, item, { id: generatedId('url-resolve') }));
        },
        removeItem: (itemId) => deleteItems([itemId]),
      });
      return items ? addItems(items, { kind: 'paste' }) : [];
    } catch {
      return [];
    }
  }, [addItems, applyResult, deleteItems, execute, onItemsAdded, onPasteImages, onPasteUrl]);

  const commitPatches = useCallback((
    patches: Readonly<Record<string, BoardItemPatch>>,
    kind: BoardCommandKind,
    lane: BoardCommandLane,
    id = generatedId(kind),
  ) => {
    execute((current) => commitItemPatches(current, patches, { id, kind, lane }));
  }, [execute]);

  const moveItems = useCallback((
    patches: Readonly<Record<string, Pick<BoardItemPatch, 'x' | 'y'>>>,
    id?: string,
  ) => commitPatches(patches, 'move', 'layout', id), [commitPatches]);
  const resizeItem = useCallback((id: string, patch: BoardItemPatch, gestureId?: string) =>
    commitPatches({ [id]: patch }, 'resize', 'layout', gestureId), [commitPatches]);
  const rotateItem = useCallback((id: string, rotation: number, gestureId?: string) =>
    commitPatches({ [id]: { rotation } }, 'rotate', 'layout', gestureId), [commitPatches]);

  const alignItems = useCallback((alignment: BoardRoomAlignment, ids: readonly string[] = selectedItemIds) => {
    execute((current) => alignBoardRoomItems(current, ids, alignment, { id: generatedId('align') }));
  }, [execute, selectedItemIds]);
  const distributeItems = useCallback((distribution: BoardRoomDistribution, ids: readonly string[] = selectedItemIds) => {
    execute((current) => distributeBoardRoomItems(current, ids, distribution, { id: generatedId('distribute') }));
  }, [execute, selectedItemIds]);
  const nudgeItems = useCallback((delta: BoardPoint, ids: readonly string[] = selectedItemIds) => {
    const direction = `${Math.sign(delta.x)}:${Math.sign(delta.y)}:${Math.max(Math.abs(delta.x), Math.abs(delta.y))}`;
    execute((current) => nudgeBoardRoomItems(current, ids, delta, {
      id: `nudge:${[...ids].sort().join(',')}:${direction}`,
    }));
  }, [execute, selectedItemIds]);
  const changeZOrder = useCallback((action: BoardZOrderAction, ids: readonly string[] = selectedItemIds) => {
    execute((current) => changeBoardRoomZOrder(current, ids, action, { id: generatedId('z-order') }));
  }, [execute, selectedItemIds]);
  const toggleLock = useCallback((ids: readonly string[] = selectedItemIds) => {
    execute((current) => toggleBoardRoomLock(current, ids, { id: generatedId('lock') }));
  }, [execute, selectedItemIds]);
  const updateItem = useCallback((id: string, patch: BoardItemPatch) => {
    execute((current) => updateBoardRoomItemFields(current, id, patch, { id: generatedId('content') }));
  }, [execute]);
  const replaceItem = useCallback((item: EditableMoodBoardItem) => {
    execute((current) => replaceBoardRoomItem(current, item, { id: generatedId('replace') }));
  }, [execute]);
  const renameBoard = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    execute((current) => updateBoardRoomFields(current, { name: trimmed }, { id: generatedId('rename') }));
  }, [execute]);
  const tidy = useCallback((
    ids: readonly string[] = selectedItemIds,
    options: BoardRoomTidyOptions = {},
  ) => {
    const current = historyRef.current;
    if (!current) return;
    const scoped = ids.length >= 2 ? ids : undefined;
    const selected = scoped
      ? current.present.items.filter((item) => scoped.includes(item.id))
      : [];
    const origin = selected.length > 0
      ? { x: Math.min(...selected.map((item) => item.x)), y: Math.min(...selected.map((item) => item.y)) }
      : undefined;
    const positions = arrangeBoardItems(current.present.items.map((item) => ({
      ...item,
      height: item.height ?? null,
    })), current.present.sections, {
      canvasWidth: current.present.canvasWidth,
      itemIds: scoped,
      origin,
      gap: options.gap,
    });
    applyResult(tidyBoardRoomItems(current, positions, {
      id: options.gestureId ?? generatedId('tidy'),
    }));
  }, [applyResult, selectedItemIds]);
  const commitItemsSectionMembership = useCallback((itemIds: readonly string[], sectionId: string | null, gestureId: string) => {
    execute((current) => {
      const patches = Object.fromEntries(current.present.items
        .filter((item) => itemIds.includes(item.id))
        .map((item) => [item.id, { data: { ...(item.data ?? {}), section_id: sectionId } }]));
      return commitItemPatches(current, patches, {
        id: gestureId,
        kind: 'section-membership',
        lane: 'structural',
      });
    });
  }, [execute]);
  const setSectionMembership = useCallback((itemId: string, sectionId: string | null) => {
    commitItemsSectionMembership([itemId], sectionId, generatedId('membership'));
  }, [commitItemsSectionMembership]);
  const setItemsSectionMembership = useCallback((itemIds: readonly string[], sectionId: string | null) => {
    commitItemsSectionMembership(itemIds, sectionId, generatedId('membership'));
  }, [commitItemsSectionMembership]);
  const updateSections = useCallback((operation: BoardSectionOperation) => {
    execute((current) => updateBoardRoomSections(current, operation, { id: generatedId('section') }));
  }, [execute]);
  const moveSectionBand = useCallback((sectionId: string, delta: BoardPoint) => {
    execute((current) => moveBoardRoomSectionBand(current, sectionId, delta, { id: generatedId('band-drag') }));
  }, [execute]);
  const trimCanvas = useCallback(() => {
    execute((current) => trimBoardRoomCanvas(current, { id: generatedId('trim') }));
  }, [execute]);

  const armSemanticGesture = useCallback((id: string) => {
    activeSemanticGestureRef.current = id;
    queueMicrotask(() => {
      if (activeSemanticGestureRef.current === id) activeSemanticGestureRef.current = null;
    });
  }, []);

  const flushPending = useCallback(async () => {
    await Promise.all([layoutBuffer.flushAll(), canvasBuffer.flushAll()]);
    await Promise.all([...structuralTasksRef.current]);
    await flushBoardOwnerAutosaves(owner);
    if (persistenceError) throw new Error(persistenceError);
  }, [canvasBuffer, layoutBuffer, owner, persistenceError]);
  transitionBarrierRef.current = flushPending;

  const requestExit = useCallback(async () => {
    if (isExiting) return false;
    if (persistenceError) {
      reportError(new Error(persistenceError));
      return false;
    }
    setIsExiting(true);
    try {
      await flushPending();
      await onExit?.();
      return true;
    } catch (error) {
      reportError(error);
      return false;
    } finally {
      setIsExiting(false);
    }
  }, [flushPending, isExiting, onExit, persistenceError, reportError]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (event.key === 'Escape') {
        event.preventDefault();
        if (contextMenu?.open) setContextMenu(null);
        else if (mode === 'present') {
          setSelectedItemIds([]);
          setMode('edit');
        }
        else if (selectedItemIds.length > 0) setSelectedItemIds([]);
        else void requestExit();
        return;
      }
      if (key === 'p' && !mod && !event.altKey) {
        event.preventDefault();
        togglePresent();
        return;
      }
      if (mode !== 'edit') return;
      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (event.ctrlKey && key === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && key === 'd') {
        event.preventDefault();
        duplicateItems();
      } else if (mod && key === 'c') {
        event.preventDefault();
        void copyItems().catch(reportError);
      } else if (mod && key === 'x') {
        event.preventDefault();
        void cutItems().catch(reportError);
      } else if (mod && key === 'v') {
        event.preventDefault();
        const current = stateRef.current;
        const point = lastPointerRef.current ?? {
          x: (current?.canvasWidth ?? 1200) / 2,
          y: (current?.canvasHeight ?? 800) / 2,
        };
        void pasteAt(point).catch(reportError);
      } else if (mod && key === 'l') {
        event.preventDefault();
        toggleLock();
      } else if (mod && (event.key === ']' || event.key === '[')) {
        event.preventDefault();
        changeZOrder(event.key === ']'
          ? event.shiftKey ? 'front' : 'forward'
          : event.shiftKey ? 'back' : 'backward');
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedItemIds.length > 0) {
        event.preventDefault();
        deleteItems();
      } else if (event.shiftKey && key === 't') {
        event.preventDefault();
        tidy();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    changeZOrder,
    contextMenu?.open,
    copyItems,
    cutItems,
    deleteItems,
    duplicateItems,
    mode,
    pasteAt,
    redo,
    reportError,
    requestExit,
    selectedItemIds.length,
    setMode,
    tidy,
    toggleLock,
    togglePresent,
    undo,
  ]);

  const state = history?.present ?? null;
  const canvasProps = useMemo<BoardRoomCanvasProps | null>(() => state ? {
    boardName: state.name,
    items: state.items,
    sections: state.sections,
    canvasWidth: state.canvasWidth,
    canvasHeight: state.canvasHeight,
    backgroundColor: state.backgroundColor,
    selectedItemIds,
    view,
    onViewChange: setView,
    onSelectionChange: (ids) => setSelection(ids),
    onItemsMoved: (commit) => {
      const id = commit.reason === 'keyboard'
        ? `nudge:${[...commit.itemIds].sort().join(',')}:${Math.sign(commit.delta.x)}:${Math.sign(commit.delta.y)}:${Math.max(Math.abs(commit.delta.x), Math.abs(commit.delta.y))}`
        : generatedId(commit.reason);
      armSemanticGesture(id);
      const kind: BoardCommandKind = commit.reason === 'align'
        ? 'align'
        : commit.reason === 'distribute'
          ? 'distribute'
          : 'move';
      const patches: Record<string, BoardItemPatch> = Object.fromEntries(
        commit.after.map((position) => [position.id, { x: position.x, y: position.y }]),
      );
      for (const patch of commit.zIndexPatches ?? []) {
        patches[patch.id] = { ...(patches[patch.id] ?? {}), zIndex: patch.zIndex };
      }
      commitPatches(
        patches,
        kind,
        'layout',
        id,
      );
    },
    onItemsAltDragged: (commit) => {
      const id = generatedId('alt-drag');
      armSemanticGesture(id);
      return altDragItems(commit.itemIds, commit.delta, id);
    },
    onItemResized: (commit) => {
      const id = generatedId('resize');
      armSemanticGesture(id);
      resizeItem(commit.itemId, {
        x: commit.after.x,
        y: commit.after.y,
        width: commit.after.width,
        height: commit.after.height,
        data: {
          ...(state.items.find((item) => item.id === commit.itemId)?.data ?? {}),
          resolved_height: commit.after.resolvedHeight,
        },
      }, id);
    },
    onItemsResized: (commit) => {
      const id = generatedId('resize');
      armSemanticGesture(id);
      commitPatches(Object.fromEntries(commit.after.map((item) => [item.id, {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        data: {
          ...(state.items.find((candidate) => candidate.id === item.id)?.data ?? {}),
          resolved_height: item.resolvedHeight,
        },
      }])), 'resize', 'layout', id);
    },
    onItemRotated: (commit) => {
      const id = generatedId('rotate');
      armSemanticGesture(id);
      rotateItem(commit.itemId, commit.after, id);
    },
    onSectionMembership: ({ itemId, sectionId }) => commitItemsSectionMembership(
      [itemId],
      sectionId,
      activeSemanticGestureRef.current ?? generatedId('membership'),
    ),
    onCanvasGrow: (growth) => {
      const id = activeSemanticGestureRef.current ?? generatedId('grow');
      if (growth.translation.x !== 0 || growth.translation.y !== 0) {
        setView((current) => ({
          ...current,
          pan: {
            x: current.pan.x - growth.translation.x * current.zoom,
            y: current.pan.y - growth.translation.y * current.zoom,
          },
        }));
      }
      execute((current) => growBoardRoomCanvas(current, growth, { id }));
    },
    onItemsDropped: onItemsDropped ? (commit) => {
      lastPointerRef.current = commit.point;
      try {
        validateBoardImageFiles(commit.files);
      } catch (error) {
        reportError(error);
        return;
      }
      void onItemsDropped(commit)
        .then((items) => {
          if (items?.length) {
            addItems(items, { id: generatedId('drop'), select: true, source: 'file_drop' });
          }
        })
        .catch(reportError);
    } : undefined,
    onItemActivate: (item) => {
      setFocusedItemId(item.id);
      setSelection([item.id]);
      onItemActivate?.(item);
    },
    onContextMenuRequest: (request) => {
      if (request.itemId && !selectedItemIds.includes(request.itemId)) setSelection([request.itemId]);
      setContextMenu({ ...request, open: true });
    },
    onPointerMoveCapture: (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      lastPointerRef.current = {
        x: (event.clientX - rect.left - view.pan.x) / view.zoom,
        y: (event.clientY - rect.top - view.pan.y) / view.zoom,
      };
    },
    renderItem: renderBoardRoomItem,
  } : null, [
    addItems,
    altDragItems,
    armSemanticGesture,
    commitPatches,
    execute,
    onItemActivate,
    onItemsDropped,
    reportError,
    resizeItem,
    rotateItem,
    selectedItemIds,
    commitItemsSectionMembership,
    setSelection,
    state,
    view,
  ]);

  const effectiveError = persistenceError ?? layoutBuffer.error ?? canvasBuffer.error ??
    (boardQuery.error instanceof Error ? boardQuery.error.message : null);
  const persistenceState: BoardRoomControllerApi['persistenceState'] = structuralSaving
    ? 'saving'
    : layoutBuffer.state === 'error' || canvasBuffer.state === 'error'
      ? 'error'
      : layoutBuffer.state === 'saving' || canvasBuffer.state === 'saving'
        ? 'saving'
        : layoutBuffer.state === 'dirty' || canvasBuffer.state === 'dirty'
          ? 'dirty'
          : layoutBuffer.state === 'saved' || canvasBuffer.state === 'saved'
            ? 'saved'
            : 'idle';

  return {
    state,
    mode,
    showNotes,
    view,
    selectedItemIds,
    focusedItemId,
    contextMenu,
    isLoading: boardQuery.isLoading || (!state && !effectiveError),
    isExiting,
    persistenceState,
    persistenceError: effectiveError,
    announcement,
    canUndo: !!history?.past.length,
    canRedo: !!history?.future.length,
    canvasProps,
    compositionBoard: state ? compositionBoard(state) : null,
    setMode,
    togglePresent,
    setShowNotes,
    setSelection,
    setFocusedItemId,
    closeContextMenu: () => setContextMenu(null),
    flushPending,
    requestExit,
    undo,
    redo,
    addItems,
    deleteItems,
    duplicateItems,
    altDragItems,
    copyItems,
    cutItems,
    pasteAt,
    moveItems,
    resizeItem,
    rotateItem,
    alignItems,
    distributeItems,
    nudgeItems,
    changeZOrder,
    toggleLock,
    updateItem,
    replaceItem,
    renameBoard,
    tidy,
    setSectionMembership,
    setItemsSectionMembership,
    updateSections,
    moveSectionBand,
    trimCanvas,
    discardPersistenceError: () => setPersistenceError(null),
  };
}

function BoardRoomContextMenu({
  api,
  onSendToSchedule,
  onOpenProduct,
  onReplaceImage,
}: {
  api: BoardRoomControllerApi;
  onSendToSchedule?: (item: EditableMoodBoardItem) => void;
  onOpenProduct?: (item: EditableMoodBoardItem) => void;
  onReplaceImage?: (item: EditableMoodBoardItem) => void;
}) {
  const menu = api.contextMenu;
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    if (!menu?.open) return;
    const frame = requestAnimationFrame(() => buttonRefs.current[0]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [menu?.open]);
  if (!menu?.open || !api.state) return null;
  const selected = api.state.items.filter((item) => api.selectedItemIds.includes(item.id));
  const lead = selected[0];
  const entries: Array<{ label: string; action: () => void; hidden?: boolean }> = [
    { label: 'Bring forward', action: () => api.changeZOrder('forward') },
    { label: 'Send backward', action: () => api.changeZOrder('backward') },
    { label: 'Bring to front', action: () => api.changeZOrder('front') },
    { label: 'Send to back', action: () => api.changeZOrder('back') },
    { label: selected.some((item) => !item.locked) ? 'Lock' : 'Unlock', action: () => api.toggleLock() },
    { label: 'Duplicate', action: () => api.duplicateItems() },
    { label: 'Copy', action: () => { void api.copyItems(); } },
    { label: 'Cut', action: () => { void api.cutItems(); } },
    { label: 'Delete', action: () => api.deleteItems() },
    ...api.state.sections.map((section) => ({
      label: `Add to ${section.name}`,
      action: () => api.setItemsSectionMembership(api.selectedItemIds, section.id),
    })),
    { label: 'Remove from section', action: () => api.setItemsSectionMembership(api.selectedItemIds, null) },
    { label: 'Send to schedule', action: () => lead && onSendToSchedule?.(lead), hidden: !lead || !onSendToSchedule },
    { label: 'Open product', action: () => lead && onOpenProduct?.(lead), hidden: !lead || !onOpenProduct || !['product', 'capture'].includes(lead.type) },
    { label: 'Replace image', action: () => lead && onReplaceImage?.(lead), hidden: !lead || !onReplaceImage || !['image', 'room_scan'].includes(lead.type) },
  ].filter((entry) => !entry.hidden);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = buttonRefs.current.findIndex((button) => button === document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      api.closeContextMenu();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? entries.length - 1
        : event.key === 'ArrowDown'
          ? (current + 1 + entries.length) % entries.length
          : (current - 1 + entries.length) % entries.length;
    buttonRefs.current[next]?.focus();
  };

  return (
    <div
      role="menu"
      aria-label="Board item actions"
      className="fixed z-[90] min-w-48 rounded-md border border-black/10 bg-white p-1 shadow-xl"
      style={{ left: menu.clientPoint.x, top: menu.clientPoint.y }}
      onKeyDown={handleKeyDown}
    >
      {entries.map((entry, index) => (
        <button
          key={entry.label}
          ref={(node) => { buttonRefs.current[index] = node; }}
          type="button"
          role="menuitem"
          tabIndex={index === 0 ? 0 : -1}
          className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-black/5 focus:bg-black/5 focus:outline-none"
          onClick={() => {
            entry.action();
            api.closeContextMenu();
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

/** Data/persistence/controller binding. Route chrome can wrap it via children. */
export function BoardRoomController(props: BoardRoomControllerProps) {
  const api = useBoardRoomController(props);
  let content: ReactNode;
  if (props.children) {
    content = props.children(api);
  } else if (api.persistenceError && !api.state) {
    content = (
      <div role="alert" className="flex h-full items-center justify-center p-8 text-sm text-red-700">
        {api.persistenceError}
      </div>
    );
  } else if (api.isLoading || !api.state || !api.canvasProps || !api.compositionBoard) {
    content = (
      <div role="status" className="flex h-full items-center justify-center p-8 text-sm text-black/60">
        Loading board…
      </div>
    );
  } else if (api.mode === 'present') {
    content = (
      <BoardComposition
        board={api.compositionBoard}
        sections={api.state.sections}
        canvasWidth={api.state.canvasWidth}
        canvasHeight={api.state.canvasHeight}
        backgroundColor={api.state.backgroundColor}
        fullBleed
        fit="contain"
        showNotes={api.showNotes}
        className="h-[100dvh]"
      />
    );
  } else {
    content = <BoardRoomCanvas {...api.canvasProps} />;
  }

  return (
    <div
      className={props.className ?? 'relative h-full min-h-0 w-full'}
      data-board-room-controller="true"
      data-board-room-mode={api.mode}
    >
      {content}
      <BoardRoomContextMenu
        api={api}
        onSendToSchedule={props.onSendToSchedule}
        onOpenProduct={props.onOpenProduct}
        onReplaceImage={props.onReplaceImage}
      />
      <div aria-live="polite" className="sr-only">
        {api.persistenceError
          ? `Board changes could not be saved: ${api.persistenceError}`
          : api.persistenceState === 'saving'
            ? 'Saving board changes'
            : api.persistenceState === 'saved'
              ? 'Board changes saved'
              : ''}
      </div>
    </div>
  );
}
