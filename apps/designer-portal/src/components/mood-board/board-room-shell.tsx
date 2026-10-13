'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  BoardComposition,
  BoardRoomCanvas,
  findBoardCascadePlacement,
  fitBoardGeometry,
  resolveMoodBoardGeometry,
  zoomBoardViewAtPoint,
  type BoardItemsDroppedCommit,
  type MoodBoardRasterInput,
} from '@patina/design-system';
import type { BoardOwnerRef, BoardPoint, EditableMoodBoardItem } from '@patina/types';
import {
  useAddProposalItem,
  useBoard,
  useBoardItemFeedbackByBoard,
  useBoardItemDirectionsByBoard,
  countUnresolvedDirectionsByItem,
  useApplyBoardRoomState,
  usePlaceProductInProjectV2,
  useProject,
  useProposal,
  useProposalScheduleItems,
  useUpsertBoard,
  type ItemFeedback,
} from '@patina/supabase';
import { Button, Input } from '@/components/ui/controls';
import {
  BoardRoomController,
  validateBoardImageFiles,
  type BoardRoomControllerApi,
  type BoardRoomCommandCommittedEvent,
  type BoardRoomMode,
  type BoardRoomUrlPasteControls,
} from '@/components/portal/scope-builder/board-room-controller';
import {
  BOARD_ROOM_CLIPBOARD_MIME,
  parseBoardRoomClipboard,
} from '@/components/portal/scope-builder/board-room-command-engine';
import { verdictChipSpec } from '@/lib/document/verdict-chip';
import { moodBoardEvents } from '@/lib/analytics/mood-board-events';
import { lockBodyScroll, trapTabWithin } from '@/lib/full-screen-boundary';
import {
  topActiveModalDialog,
  topDismissiblePopover,
} from '@/components/document/overlays/active-dialog';
import {
  consumeMaterializedTemplateFlag,
  moodBoardOpenSource,
  resolveMoodBoardReturnTarget,
} from '@/lib/mood-board/navigation';
import { useMoodBoardUrlUnfurl } from '@/hooks/use-mood-board-url-unfurl';
import { useAuth } from '@/hooks/use-auth';
import {
  buildMoodBoardUrlFallbackNote,
  buildMoodBoardUrlPlaceholder,
  buildResolvedMoodBoardUrlItem,
  moodBoardUrlFallbackNotice,
} from '@/lib/mood-board/url-unfurl';
import {
  generateAndUploadMoodBoardCover,
  createMoodBoardCoverStorage,
} from '@/lib/mood-board-assets/board-cover';
import {
  createBoardAssetStorage,
  prepareAndUploadBoardImages,
} from '@/lib/mood-board-assets/upload-board-assets';
import { prepareProjectReviewMedia } from '@/lib/mood-board-assets/project-review-media';
import {
  beginScheduleSend,
  buildSendToScheduleArgs,
  endScheduleSend,
  findExistingScheduleLine,
  scheduleRoomIdForBoard,
} from '@/lib/scope/board-schedule';
import {
  createMoodBoardCoverLifecycle,
  type MoodBoardCoverSnapshot,
} from '@/lib/mood-board-assets/board-cover-lifecycle';
import { BoardAddRail, uploadFilesAsBoardItems, type BoardAddSource } from './board-add-rail';
import { BoardApprovedPinsPanel } from './board-approved-pins-panel';
import { BoardDeckImportSheet } from './board-deck-import-sheet';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import {
  DECK_COPY,
  DECK_IMPORT_FLAG,
  DECK_OPEN_EVENT,
  deckFileKind,
  deckPinHoldReason,
  takePendingDeck,
  useBoardDeckImportLayout,
  type PreparedDeck,
} from '@/hooks/use-board-deck-import-layout';
import { BoardPromoteAllPanel } from './board-promote-all-panel';
import { BoardDeckImportLedger, DeckPieceActs } from './board-deck-import-ledger';
import {
  canvasCaption,
  howPhrase,
  roomHeadLine,
  useBoardDeckImportReview,
  useDeckImportDecisions,
  type DeckReviewRoom,
} from '@/hooks/use-board-deck-import-review';
import { DocumentAction } from '@/components/document/document-action';
import { EmptyState } from '@/components/document/empty-state';
import { TesterSlot } from '@/components/tester/tester-slot';
import { BoardRoomInspector } from './board-room-inspector';
import { BoardRoomSectionsMenu } from './board-room-sections-menu';
import { BoardShareDialog } from './board-share-dialog';
import { BoardExportDialog } from './board-export-dialog';
import { BoardTemplateDialog } from './board-template-dialog';
import { scheduleSnapshotForBoardItem } from './board-schedule-inspector-action';
import {
  BOARD_ROOM_DEFAULT_TIDY_GAP,
  BOARD_ROOM_MAX_TIDY_GAP,
  BOARD_ROOM_MIN_TIDY_GAP,
  resolveBoardRoomTidyTarget,
} from './board-room-tidy';
import {
  collectPresentPrefetchTargets,
  warmPresentImages,
  type PresentPrefetchHandle,
} from '@/lib/mood-board/present-prefetch';

const RAIL_COLLAPSED_KEY = 'patina:mood-board:add-rail-collapsed';
const GRID_VISIBLE_KEY = 'patina:mood-board:grid-visible';
const SNAP_TO_GRID_KEY = 'patina:mood-board:snap-to-grid';
const FEEDBACK_UNAVAILABLE_MESSAGE = 'Client feedback is still loading or unavailable. Try delete again after it finishes loading.';

function generatedId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * VD3: plain language for the unprepared-review-media banner. It used to
 * read "N visual references need review-media preparation" — internal
 * pipeline jargon a designer has no reason to know. This just says what's
 * missing and what to do about it.
 */
export function reviewMediaBannerCopy(count: number): string {
  return `${count} ${count === 1 ? 'pin still needs' : 'pins still need'} a real photo before this board can be published.`;
}

function boardRasterInput(api: BoardRoomControllerApi): MoodBoardRasterInput | null {
  if (!api.state) return null;
  return {
    canvasWidth: api.state.canvasWidth,
    canvasHeight: api.state.canvasHeight,
    backgroundColor: api.state.backgroundColor,
    sections: api.state.sections,
    items: api.state.items,
  };
}

function latestFeedback(rows: readonly ItemFeedback[]): Map<string, ItemFeedback> {
  const result = new Map<string, ItemFeedback>();
  for (const row of rows) {
    if (row.board_item_id) result.set(row.board_item_id, row);
  }
  return result;
}

/**
 * The client's verdict as an ink state word (US-28 S12; V20 U-Q13): no pill,
 * no dot, no colour grading — the word already says which it is. In Edit it
 * stands in the item's caption; in Present (`onPlate`) BoardComposition
 * places it over the plate, where it keeps a paper ground and a 1px edge for
 * legibility over a photograph, never a shadow.
 */
function VerdictBadge({ feedback, onPlate = false }: { feedback: ItemFeedback | undefined; onPlate?: boolean }) {
  const chip = verdictChipSpec(feedback?.verdict, feedback?.resolved_at);
  if (!chip) return null;
  const fromGuest = Boolean(feedback?.guest_share_id);
  return (
    <span
      className={onPlate ? 'word br-verdict br-verdict--plate' : 'word br-verdict'}
      data-board-verdict={feedback?.verdict}
      data-verdict-source={fromGuest ? 'guest' : 'client'}
    >
      {chip.label}
      {fromGuest && (
        <span className="word--quiet"> · guest link</span>
      )}
    </span>
  );
}

/**
 * Unresolved-direction count as a caption word (board-paths W3c, DV6). Wired
 * ONLY into editRenderItem below — never into renderVerdictOverlay, which is
 * the Present-mode (and guest-share) render path via BoardComposition.
 * Internal direction must never render there.
 */
function DirectionIndicator({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      aria-label={`${count} unresolved direction note${count === 1 ? '' : 's'}`}
      className="word br-directions"
    >
      {count} {count === 1 ? 'direction' : 'directions'} open
    </span>
  );
}

/**
 * Edits a note's text where the note actually sits (CI-24). Reached by
 * double-clicking the pin; the inspector's textarea remains the alternate
 * path. Commit semantics match the inspector's: blur and Cmd/Ctrl+Enter
 * commit, Escape reverts — and because a whole editing session commits once,
 * on the way out, it costs exactly one undo step.
 *
 * It deliberately mounts only while THIS note is being edited, never merely
 * because it is selected. Mounted on selection, the browser's native
 * focus-on-click landed in this textarea the instant a shift-click added the
 * note to a multi-selection, and the focus handler then collapsed the
 * selection back to the single note — the aria-pressed multi-select failure
 * that only ever reproduced in a real browser.
 */
function InlineNoteEditor({
  item,
  onCommit,
  onFocus,
  onDone,
}: {
  item: EditableMoodBoardItem;
  onCommit: (content: string) => void;
  onFocus: () => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(item.content ?? '');
  useEffect(() => setDraft(item.content ?? ''), [item.content, item.id]);
  const commit = () => {
    if (draft !== (item.content ?? '')) onCommit(draft);
  };
  return (
    <textarea
      aria-label="Edit note"
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onFocus={onFocus}
      onBlur={() => {
        commit();
        onDone();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          commit();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraft(item.content ?? '');
          event.currentTarget.blur();
        }
      }}
      className="h-full w-full resize-none overflow-auto bg-transparent py-1 pl-4 pr-0 text-[0.875rem] leading-[1.5] text-[var(--text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)]"
      style={{ fontFamily: 'var(--font-body)', borderLeft: 'var(--edge-note)' }}
    />
  );
}

const WIDE_ROOM_QUERY = '(min-width: 768px)';
function subscribeWideRoom(onChange: () => void) {
  const query = window.matchMedia(WIDE_ROOM_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
/**
 * md and up: Zoom and Fit live in Tools › View; below md they sit under the
 * board (US-28 S12, frame p7). One set is mounted at a time, so the zoom
 * word and its controls exist once in the room at any width.
 */
function useWideRoom(): boolean {
  return useSyncExternalStore(
    subscribeWideRoom,
    () => window.matchMedia(WIDE_ROOM_QUERY).matches,
    () => true,
  );
}

/**
 * Marks every region of the room outside the sheet `inert` (the veil stays live
 * so a tap on it still puts the sheet back), including regions that mount while
 * the sheet is open. Returns the undo, which clears only what it marked.
 */
function inertRoomOutside(root: HTMLElement, sheet: HTMLElement): () => void {
  const path: HTMLElement[] = [];
  for (let node: HTMLElement | null = sheet; node && node !== root; node = node.parentElement) {
    path.push(node);
  }
  const marked = new Set<Element>();
  const mark = () => {
    for (const kept of path) {
      for (const sibling of Array.from(kept.parentElement?.children ?? [])) {
        if (path.includes(sibling as HTMLElement) || sibling.classList.contains('veil')) continue;
        if (sibling.hasAttribute('inert')) continue;
        sibling.setAttribute('inert', '');
        marked.add(sibling);
      }
    }
  };
  mark();
  const observer = new MutationObserver(mark);
  for (const kept of path) {
    if (kept.parentElement) observer.observe(kept.parentElement, { childList: true });
  }
  return () => {
    observer.disconnect();
    marked.forEach((element) => element.removeAttribute('inert'));
  };
}

/**
 * Below md the open Tools Section is a modal sheet over the veil (R3): it wears
 * dialog semantics, the room's Tab trap narrows to it (useBoardRoomBoundary),
 * the rest of the room goes inert, and Escape from anywhere puts it back. At md
 * and up it stays the side column.
 */
export function useToolsSheetModal(
  rootRef: MutableRefObject<HTMLElement | null>,
  sheetRef: MutableRefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  const wide = useWideRoom();
  const modal = open && !wide;
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!modal) return;
    const root = rootRef.current;
    const sheet = sheetRef.current;
    if (!root || !sheet || !root.contains(sheet)) return;
    return inertRoomOutside(root, sheet);
  }, [modal, rootRef, sheetRef]);
  useEffect(() => {
    if (!modal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // A sheet or popover opened over the Tools sheet takes its own Escape.
      if (topActiveModalDialog() !== sheetRef.current || topDismissiblePopover()) return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modal, sheetRef]);
  return modal ? ({ role: 'dialog', 'aria-modal': true } as const) : {};
}

/**
 * The room's Tidy keys: Shift+T tidies the selection, Escape ends an open
 * spacing session. Window capture, so they run before the canvas — and so
 * they stand down entirely while a modal (the narrow Tools sheet) holds the
 * room: Escape then belongs to the modal and Shift+T acts on nothing behind it.
 */
export function useTidyShortcuts({
  enabled,
  sessionOpen,
  suppressed,
  onTidy,
  onEndSession,
}: {
  enabled: boolean;
  sessionOpen: boolean;
  suppressed: boolean;
  onTidy: () => void;
  onEndSession: () => void;
}) {
  useEffect(() => {
    if (!enabled || suppressed) return;
    const handleTidyShortcut = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) return;
      if (event.key === 'Escape' && sessionOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onEndSession();
        return;
      }
      if (!event.shiftKey || event.key.toLowerCase() !== 't') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onTidy();
    };
    window.addEventListener('keydown', handleTidyShortcut, true);
    return () => window.removeEventListener('keydown', handleTidyShortcut, true);
  }, [enabled, onEndSession, onTidy, sessionOpen, suppressed]);
}

/** Route-level focus and scroll isolation; portalled nested dialogs keep their own trap. */
export function useBoardRoomBoundary(
  ref: MutableRefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const unlockBodyScroll = lockBodyScroll();
    const frame = requestAnimationFrame(() => root.focus({ preventScroll: true }));
    const handleKeyDown = (event: KeyboardEvent) => {
      // A modal inside the room (the narrow Tools sheet) narrows the trap to itself.
      const scope = root.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]') ?? root;
      trapTabWithin(event, scope);
    };
    document.addEventListener('keydown', handleKeyDown, true);
    // A drop that misses the canvas must never navigate the browser to the dragged
    // URL/file. React delegates at the app root, so canvas onDragOver/onDrop run
    // before this window bubble listener — defaultPrevented cleanly distinguishes
    // accepted drops. This also covers Present mode (where the canvas prevents nothing).
    // Editable targets (board name, note textarea, inspector fields) bail out too, or
    // a native text-drag into the room's own inputs would be dead while it's mounted.
    const swallow = (event: DragEvent) => {
      if (event.defaultPrevented || isTextEntryTarget(event.target)) return;
      event.preventDefault();
      if (event.type === 'dragover' && event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
      unlockBodyScroll();
    };
  }, [active, ref]);
}

function BoardNameField({ api }: { api: BoardRoomControllerApi }) {
  const name = api.state?.name ?? 'Mood board';
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) api.renameBoard(trimmed);
    else setDraft(name);
  };
  return (
    <Input
      value={draft}
      aria-label="Board name"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      // A rail piece carries its envelope as text/plain too; dropped on the
      // (now heading-wide) name field it must never become the board's name.
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(BOARD_ROOM_CLIPBOARD_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'none';
      }}
      onDrop={(event) => {
        if (event.dataTransfer.types.includes(BOARD_ROOM_CLIPBOARD_MIME)) event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(name);
          event.currentTarget.blur();
        }
      }}
      // The board's name is the room's heading (US-28 S12): Playfair at the
      // house display step, edited in place — input chrome only on focus.
      // The face is set inline because Input pins the body face inline.
      className="br-name h-11 w-full min-w-[120px] border-transparent bg-transparent px-1 text-[20px] font-medium leading-[1.2] shadow-none hover:border-transparent focus:border-[var(--clay-ink)] md:text-[26px]"
      style={{ fontFamily: 'var(--font-display)' }}
    />
  );
}

interface SessionMetrics {
  commands: number;
  usedUndo: boolean;
  usedMultiselect: boolean;
  usedTidy: boolean;
  usedHandles: boolean;
}

interface TidySpacingSession {
  targetKey: string;
  itemIds: string[];
  gap: number;
  gestureId: string;
  committedAt: number;
}

interface BoardRoomItemActions {
  sendToSchedule: (item: EditableMoodBoardItem) => void;
  openProduct: (item: EditableMoodBoardItem) => void;
  replaceImage: (item: EditableMoodBoardItem) => void;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.matches('input, textarea, select') || target.isContentEditable
  );
}

function BoardRoomSurface({
  api,
  owner,
  source,
  returnTarget,
  exitHandlerRef,
  deleteGuardRef,
  metricsRef,
  lastCommand,
  itemActionsRef,
  dropUploadProgress,
  externalNotice,
  onConsumeExternalNotice,
  justMaterialized,
  onDismissJustMaterialized,
  onBringInDeck,
}: {
  api: BoardRoomControllerApi;
  owner: BoardOwnerRef;
  source: ReturnType<typeof moodBoardOpenSource>;
  returnTarget: string;
  exitHandlerRef: MutableRefObject<(() => Promise<void>) | null>;
  deleteGuardRef: MutableRefObject<((items: readonly EditableMoodBoardItem[]) => boolean) | null>;
  metricsRef: MutableRefObject<SessionMetrics>;
  lastCommand: BoardRoomCommandCommittedEvent | null;
  itemActionsRef: MutableRefObject<BoardRoomItemActions | null>;
  dropUploadProgress: string | null;
  externalNotice: string | null;
  onConsumeExternalNotice: () => void;
  /** DV3 — true right after a template materialized onto THIS project board. */
  justMaterialized: boolean;
  onDismissJustMaterialized: () => void;
  /** Set only while `board-deck-import` is on. */
  onBringInDeck?: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const rootRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetIdRef = useRef<string | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  /** Below md the Tools Section is one sheet over the veil (US-28 S12). */
  const [toolsSheetOpen, setToolsSheetOpen] = useState(false);
  const toolsActRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);
  const toolsHeadRef = useRef<HTMLParagraphElement | null>(null);
  const toolsSheetRef = useRef<HTMLElement | null>(null);
  const wideRoom = useWideRoom();
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  const [surfaceNotice, setSurfaceNotice] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [tidySession, setTidySession] = useState<TidySpacingSession | null>(null);
  /** The one note currently being edited in place on the canvas (CI-24). */
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  /** Mirrors the canvas's pointer-gesture state so the room-scoped view
   *  shortcuts stay out of the way mid-drag, exactly as the edit shortcuts
   *  already do (CI-17). */
  const gestureActiveRef = useRef(false);
  const roomShortcutsSuppressedRef = useRef(false);
  const upsertBoard = useUpsertBoard();
  const applyBoardState = useApplyBoardRoomState();
  const boardQuery = useBoard(api.state?.boardId);
  const proposalQuery = useProposal(owner.kind === 'proposal' ? owner.id : '');
  const projectQuery = useProject(owner.kind === 'project' ? owner.id : '');
  const sourceProposalId = owner.kind === 'proposal'
    ? owner.id
    : projectQuery.data?.proposal_id ?? null;
  // VD3: item ids kept alongside the count so the banner can jump straight
  // to the first pin that still needs a real photo, not just report a total.
  const unpreparedReviewMediaItemIds = useMemo(() => {
    if (owner.kind !== 'project') return [] as string[];
    return (api.state?.items ?? []).filter((item) =>
      !item.projectFfeItemId &&
      (item.type === 'image' || item.type === 'room_scan') &&
      Boolean(item.imageUrl) &&
      typeof item.data?.review_media_asset_id !== 'string').map((item) => item.id);
  }, [api.state?.items, owner.kind]);
  const unpreparedReviewMediaCoverNeedsPrep = Boolean(
    boardQuery.data?.cover_image_url && !boardQuery.data.cover_review_media_asset_id,
  );
  const unpreparedReviewMediaCount =
    unpreparedReviewMediaItemIds.length + (unpreparedReviewMediaCoverNeedsPrep ? 1 : 0);
  const scheduleQuery = useProposalScheduleItems(owner.kind === 'proposal' ? owner.id : undefined);
  const addScheduleItem = useAddProposalItem();
  const feedbackQuery = useBoardItemFeedbackByBoard(api.state?.boardId);
  const feedback = feedbackQuery.data ?? [];
  const feedbackByItem = useMemo(() => latestFeedback(feedback), [feedback]);
  // Internal direction layer (board-paths W3c, DV6) — studio-only, never
  // read in Present (see renderVerdictOverlay below, which never touches it).
  const directionsQuery = useBoardItemDirectionsByBoard(api.state?.boardId);
  const directions = directionsQuery.data ?? [];
  const unresolvedDirectionCountByItem = useMemo(
    () => countUnresolvedDirectionsByItem(directions),
    [directions],
  );
  const openedRef = useRef(false);
  const startedAtRef = useRef(performance.now());
  const presentStartedRef = useRef<number | null>(null);
  const previousModeRef = useRef(api.mode);
  // Present-entry image prefetch (VD12/AC2.1 program, W2d part 3) — a
  // separate previous-mode ref from `previousModeRef` above: that ref is
  // consumed (read-then-overwritten) by the analytics effect earlier in this
  // component, so a second effect reading it in the same render would always
  // see it already equal to `api.mode`. Seeded to `null` — a sentinel outside
  // BoardRoomMode's 'edit' | 'present' union — rather than `api.mode`, so a
  // room that ever mounts directly into Present (e.g. a future
  // defaultMode:'present') still sees a real transition and warms on that
  // very first render instead of `previous === current` skipping it.
  const presentPrefetchPreviousModeRef = useRef<BoardRoomMode | null>(null);
  const presentPrefetchWarmedRef = useRef<Set<string>>(new Set());
  const presentPrefetchHandleRef = useRef<PresentPrefetchHandle | null>(null);
  const [presentPrefetchProgress, setPresentPrefetchProgress] = useState<
    { loaded: number; total: number } | null
  >(null);
  // Set once warming settles with at least one failure (a 404/expired
  // signed URL/etc still "completes" a warm — see warmPresentImages) so
  // "Loading images n/n" doesn't silently read as a full success when some
  // images will still have to stream in live. Auto-dismissed on the
  // viewer's first interaction with the room; never blocks anything.
  const [presentPrefetchResult, setPresentPrefetchResult] = useState<
    { failed: number } | null
  >(null);
  const upsertCoverRef = useRef(upsertBoard.mutateAsync);
  const applyBoardStateRef = useRef(applyBoardState.mutateAsync);
  const preferenceScope = user?.id;
  const railPreferenceKey = preferenceScope ? `${RAIL_COLLAPSED_KEY}:${preferenceScope}` : null;
  const gridPreferenceKey = preferenceScope ? `${GRID_VISIBLE_KEY}:${preferenceScope}` : null;
  const snapPreferenceKey = preferenceScope ? `${SNAP_TO_GRID_KEY}:${preferenceScope}` : null;
  const coverWriteRef = useRef<(snapshot: MoodBoardCoverSnapshot) => Promise<void>>(
    async () => undefined,
  );
  const coverLifecycleRef = useRef<ReturnType<typeof createMoodBoardCoverLifecycle> | null>(null);

  useEffect(() => {
    if (!externalNotice) return;
    setSurfaceError(null);
    setSurfaceNotice(externalNotice);
    onConsumeExternalNotice();
  }, [externalNotice, onConsumeExternalNotice]);
  upsertCoverRef.current = upsertBoard.mutateAsync;
  applyBoardStateRef.current = applyBoardState.mutateAsync;
  coverWriteRef.current = async (snapshot) => {
    const coverStorage = createMoodBoardCoverStorage(owner.kind === 'project'
      ? { bucket: 'project-ffe-working' }
      : {});
    const generated = await generateAndUploadMoodBoardCover({
      ownerId: owner.id,
      boardId: snapshot.boardId,
      input: snapshot.input,
      storage: coverStorage,
    });
    let reviewMediaPrepared = false;
    try {
      if (owner.kind === 'project') {
        if (!api.state || api.state.boardId !== snapshot.boardId) {
          throw new Error('The active project board is unavailable.');
        }
        const reviewMedia = await prepareProjectReviewMedia({
          projectId: owner.id,
          sourcePath: generated.path,
        });
        reviewMediaPrepared = true;
        await applyBoardStateRef.current({
          boardId: snapshot.boardId,
          owner,
          state: {
            name: api.state.name,
            canvasWidth: api.state.canvasWidth,
            canvasHeight: api.state.canvasHeight,
            backgroundColor: api.state.backgroundColor,
            coverImageUrl: generated.path,
            coverReviewMediaAssetId: reviewMedia.assetId,
            sections: api.state.sections,
            items: api.state.items,
          },
        });
      } else {
        await upsertCoverRef.current({
          boardId: snapshot.boardId,
          owner,
          coverImageUrl: generated.url,
        });
      }
    } catch (error) {
      if (owner.kind === 'project' && !reviewMediaPrepared) {
        await coverStorage.remove(generated.path).catch(() => undefined);
      }
      throw error;
    }
  };
  if (coverLifecycleRef.current === null) {
    coverLifecycleRef.current = createMoodBoardCoverLifecycle({
      write: (snapshot) => coverWriteRef.current(snapshot),
      onError: (error) => console.warn('Mood-board cover generation failed', error),
    });
  }

  const tidyTarget = useMemo(
    () => resolveBoardRoomTidyTarget(api.state?.items ?? [], api.selectedItemIds),
    [api.selectedItemIds, api.state?.items],
  );
  const runTidy = useCallback(() => {
    if (!tidyTarget.enabled) return;
    const session: TidySpacingSession = {
      targetKey: tidyTarget.key,
      itemIds: tidyTarget.itemIds,
      gap: BOARD_ROOM_DEFAULT_TIDY_GAP,
      gestureId: generatedId('tidy-spacing'),
      committedAt: Date.now(),
    };
    api.tidy(session.itemIds, {
      gap: session.gap,
      gestureId: session.gestureId,
      committedAt: session.committedAt,
    });
    setTidySession(session);
  }, [api, tidyTarget]);

  useEffect(() => {
    setTidySession((current) =>
      current && (current.targetKey !== tidyTarget.key || api.mode !== 'edit')
        ? null
        : current,
    );
  }, [api.mode, tidyTarget.key]);

  useEffect(() => {
    setTidySession((current) => {
      if (!current || !lastCommand) return current;
      return lastCommand.direction === 'apply' &&
        lastCommand.command.kind === 'tidy' &&
        lastCommand.command.id === current.gestureId
        ? current
        : null;
    });
  }, [lastCommand]);

  useEffect(() => {
    if (!railPreferenceKey || !gridPreferenceKey || !snapPreferenceKey) return;
    try {
      setRailCollapsed(window.localStorage.getItem(railPreferenceKey) === 'true');
      setShowGrid(window.localStorage.getItem(gridPreferenceKey) === 'true');
      setSnapToGrid(window.localStorage.getItem(snapPreferenceKey) === 'true');
    } catch {
      // Local persistence is optional.
    }
  }, [gridPreferenceKey, railPreferenceKey, snapPreferenceKey]);

  const toggleRail = () => {
    setRailCollapsed((current) => {
      const next = !current;
      if (railPreferenceKey) {
        try {
          window.localStorage.setItem(railPreferenceKey, String(next));
        } catch {
          // Keep the current-session preference.
        }
      }
      return next;
    });
  };

  /** "Put back": close the Tools sheet and return focus to the "Tools" act. */
  const closeToolsSheet = () => {
    setToolsSheetOpen(false);
    requestAnimationFrame(() => toolsActRef.current?.focus());
  };
  const toolsSheetModalProps = useToolsSheetModal(
    rootRef,
    toolsSheetRef,
    api.mode === 'edit' && toolsSheetOpen,
    closeToolsSheet,
  );
  /** While the narrow Tools sheet is a modal, the room's shortcuts stand down (R3b). */
  const toolsSheetModal = 'aria-modal' in toolsSheetModalProps;
  roomShortcutsSuppressedRef.current = toolsSheetModal;
  const endTidySession = useCallback(() => setTidySession(null), []);
  useTidyShortcuts({
    enabled: api.mode === 'edit',
    sessionOpen: tidySession !== null,
    suppressed: toolsSheetModal,
    onTidy: runTidy,
    onEndSession: endTidySession,
  });

  const toggleGrid = () => {
    setShowGrid((current) => {
      const next = !current;
      if (gridPreferenceKey) {
        try { window.localStorage.setItem(gridPreferenceKey, String(next)); } catch { /* optional */ }
      }
      return next;
    });
  };
  const toggleSnap = () => {
    setSnapToGrid((current) => {
      const next = !current;
      if (snapPreferenceKey) {
        try { window.localStorage.setItem(snapPreferenceKey, String(next)); } catch { /* optional */ }
      }
      return next;
    });
  };

  // The pin may change while a send is in flight; stamp onto its latest data.
  const latestItemsRef = useRef(api.state?.items);
  latestItemsRef.current = api.state?.items;
  const { updateItem } = api;
  const stampScheduleBacklink = useCallback((itemId: string, proposalItemId: string) => {
    const current = latestItemsRef.current?.find((candidate) => candidate.id === itemId);
    if (!current || current.data?.proposalItemId === proposalItemId) return;
    updateItem(itemId, { data: { ...(current.data ?? {}), proposalItemId } });
  }, [updateItem]);

  // `quiet` is the deck ledger's bulk loop: same path and in-flight guard,
  // outcome returned instead of written to the room's notice line.
  const sendToSchedule = useCallback(async (
    item: EditableMoodBoardItem,
    options: { quiet?: boolean } = {},
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    if (owner.kind !== 'proposal' || (item.type !== 'product' && item.type !== 'capture')) {
      return { ok: false, message: 'Only a product pin goes on the schedule.' };
    }
    // Already sending this pin — no-op; that send reports itself (SQ-368 F15).
    if (!beginScheduleSend(item.id)) return { ok: true };
    const quiet = options.quiet === true;
    if (!quiet) {
      setSurfaceNotice(null);
      setSurfaceError(null);
    }
    const hold = deckPinHoldReason(item);
    if (hold) {
      if (!quiet) setSurfaceNotice(hold);
      endScheduleSend(item.id);
      return { ok: false, message: hold };
    }
    try {
      const refreshed = await scheduleQuery.refetch();
      if (refreshed.error) throw refreshed.error;
      const lines = refreshed.data ?? [];
      const snapshot = scheduleSnapshotForBoardItem(item);
      const scopeRoomId = scheduleRoomIdForBoard(boardQuery.data);
      const twin = findExistingScheduleLine(lines, snapshot, scopeRoomId);
      if (twin) {
        if (!quiet) setSurfaceNotice(`Already on the schedule${twin.doc_code ? ` · ${twin.doc_code}` : ''}`);
        return { ok: true };
      }
      const args = buildSendToScheduleArgs({
        proposalId: owner.id,
        snap: snapshot,
        boardScopeRoomId: scopeRoomId,
        existingCodes: lines.map((line) => line.doc_code),
      });
      const line = await addScheduleItem.mutateAsync(args);
      if (typeof line?.id === 'string') stampScheduleBacklink(item.id, line.id);
      if (!quiet) setSurfaceNotice(`Added to the schedule · ${args.docCode}`);
      return { ok: true };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not add this pin to the schedule.';
      if (!quiet) setSurfaceError(message);
      return { ok: false, message };
    } finally {
      endScheduleSend(item.id);
    }
  }, [addScheduleItem, boardQuery.data, owner, scheduleQuery, stampScheduleBacklink]);

  // Bring in a Deck (US-15 W3) — review. `onBringInDeck` is set only while
  // the `board-deck-import` flag is on, so off/loading reads nothing.
  const deckImportOn = Boolean(onBringInDeck);
  const [deckLedgerOpen, setDeckLedgerOpen] = useState(false);
  const deckReview = useBoardDeckImportReview(api.state?.boardId, deckImportOn);
  const { replaceItem: replaceRoomItem, addItems: addRoomItems, flushPending } = api;
  const deckRoom = useMemo<DeckReviewRoom>(() => ({
    pins: () => latestItemsRef.current ?? [],
    replaceItem: replaceRoomItem,
    addItems: (items) => { addRoomItems(items, { select: false }); },
    flush: flushPending,
  }), [addRoomItems, flushPending, replaceRoomItem]);
  const deckDecisions = useDeckImportDecisions(deckReview.deckImport?.id, deckRoom);
  const deckItemByPin = useMemo(() => new Map(
    deckReview.items.filter((item) => item.boardItemId).map((item) => [item.boardItemId as string, item]),
  ), [deckReview.items]);
  const deckHead = deckImportOn ? roomHeadLine(deckReview.deckImport?.status ?? null, deckReview.items) : null;

  const openProduct = useCallback((item: EditableMoodBoardItem) => {
    if (!item.productId) return;
    window.open(`/library/${encodeURIComponent(item.productId)}`, '_blank', 'noopener,noreferrer');
  }, []);

  const replaceImage = useCallback((item: EditableMoodBoardItem) => {
    if (item.type !== 'image' && item.type !== 'room_scan') return;
    replaceTargetIdRef.current = item.id;
    replaceInputRef.current?.click();
  }, []);

  const uploadReplacement = useCallback(async (file: File) => {
    const itemId = replaceTargetIdRef.current;
    replaceTargetIdRef.current = null;
    if (!itemId || !api.state) return;
    setSurfaceNotice(null);
    setSurfaceError(null);
    try {
      validateBoardImageFiles([file]);
      const projectStorage = owner.kind === 'project'
        ? createBoardAssetStorage({ bucket: 'project-ffe-working' })
        : null;
      const [asset] = await prepareAndUploadBoardImages({
        ownerId: owner.id,
        boardId: api.state.boardId,
        files: [file],
        ...(projectStorage ? { storage: projectStorage } : {}),
      });
      if (!asset) throw new Error('The replacement image was not created.');
      let reviewMediaAssetId: string | null = null;
      if (owner.kind === 'project') {
        try {
          reviewMediaAssetId = (await prepareProjectReviewMedia({
            projectId: owner.id,
            sourcePath: asset.assets.display.path,
          })).assetId;
        } catch (error) {
          await projectStorage?.remove([
            asset.assets.display.path,
            asset.assets.thumbnail.path,
          ]).catch(() => undefined);
          throw error;
        }
      }
      const current = api.state.items.find((item) => item.id === itemId);
      if (!current) throw new Error('That pin is no longer on the board.');
      const data = {
        ...(current.data ?? {}),
        image_url: asset.image_url,
        thumbnail_url: asset.data.thumbnail_url,
        ...(owner.kind === 'project' ? {
          working_image_path: asset.assets.display.path,
          working_thumbnail_path: asset.assets.thumbnail.path,
          review_media_asset_id: reviewMediaAssetId,
          review_media_status: 'prepared' as const,
        } : {}),
      };
      delete data.original_image_url;
      api.updateItem(itemId, { imageUrl: asset.image_url, data });
      setSurfaceNotice('Image replaced.');
    } catch (cause) {
      setSurfaceError(cause instanceof Error ? cause.message : 'The image could not be replaced.');
    }
  }, [api, owner]);

  useEffect(() => {
    const handlers: BoardRoomItemActions = {
      sendToSchedule: (item) => { void sendToSchedule(item); },
      openProduct,
      replaceImage,
    };
    itemActionsRef.current = handlers;
    return () => {
      if (itemActionsRef.current === handlers) itemActionsRef.current = null;
    };
  }, [itemActionsRef, openProduct, replaceImage, sendToSchedule]);

  useEffect(() => {
    if (!api.state || openedRef.current) return;
    openedRef.current = true;
    moodBoardEvents.opened({
      source,
      board_id: api.state.boardId,
      item_count: api.state.items.length,
      owner_kind: owner.kind,
    });
  }, [api.state, owner.kind, source]);

  useEffect(() => {
    if (api.selectedItemIds.length > 1) metricsRef.current.usedMultiselect = true;
  }, [api.selectedItemIds.length]);

  // The in-place editor closes as soon as its note stops being the single
  // selection, is deleted, or the room leaves edit mode (CI-24).
  useEffect(() => {
    if (!editingNoteId) return;
    const stillEditable =
      api.mode === 'edit' &&
      api.selectedItemIds.length === 1 &&
      api.selectedItemIds[0] === editingNoteId &&
      (api.state?.items.some((item) => item.id === editingNoteId) ?? false);
    if (!stillEditable) setEditingNoteId(null);
  }, [api.mode, api.selectedItemIds, api.state?.items, editingNoteId]);

  // Defined above the loading guard so the room-scoped view shortcuts below
  // can close over them; the toolbar buttons use the same two functions.
  const zoomBy = useCallback((delta: number) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    const size = { width: rect?.width ?? 800, height: rect?.height ?? 600 };
    api.canvasProps?.onViewChange?.(
      zoomBoardViewAtPoint(
        api.view,
        { x: size.width / 2, y: size.height / 2 },
        api.view.zoom + delta,
      ),
      'zoom',
    );
  }, [api]);

  const fittedView = useCallback(() => {
    const current = api.state;
    if (!current) return null;
    const rect = workspaceRef.current?.getBoundingClientRect();
    const geometry = resolveMoodBoardGeometry({
      canvasWidth: current.canvasWidth,
      canvasHeight: current.canvasHeight,
      backgroundColor: current.backgroundColor,
      sections: current.sections,
      items: current.items,
    });
    const size = { width: rect?.width ?? 800, height: rect?.height ?? 600 };
    return { view: fitBoardGeometry(geometry, size), size };
  }, [api.state]);

  const fit = useCallback(() => {
    const fitted = fittedView();
    if (fitted) api.canvasProps?.onViewChange?.(fitted.view, 'fit');
  }, [api, fittedView]);

  // The room opens at fit (US-28 walk-fix): every zone and piece inside the
  // window at 1440 and at 390, never a fragment of the first zone. Once per
  // board, after layout gives the window its size; a board smaller than the
  // window opens centred at 100% rather than blown up past it.
  const openedAtFitRef = useRef<string | null>(null);
  const boardIdForFit = api.state?.boardId ?? null;
  useEffect(() => {
    if (!boardIdForFit || openedAtFitRef.current === boardIdForFit) return;
    const frame = requestAnimationFrame(() => {
      const rect = workspaceRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const fitted = fittedView();
      if (!fitted) return;
      openedAtFitRef.current = boardIdForFit;
      const { view, size } = fitted;
      api.canvasProps?.onViewChange?.(
        view.zoom > 1
          ? zoomBoardViewAtPoint(view, { x: size.width / 2, y: size.height / 2 }, 1)
          : view,
        'fit',
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [api.canvasProps, boardIdForFit, fittedView]);

  // View shortcuts are room-scoped, not canvas-scoped: after a click in the
  // rail or the inspector, Cmd+0, 1 and the zoom keys kept working for edit
  // commands but silently died for the view (CI-17). Window level, with the
  // same guards the edit shortcuts use — the canvas's own handler calls
  // preventDefault first, so a focused canvas never double-applies.
  //
  // Scoped to the room's own subtree (A2): Cmd +/-/0 is the browser's page
  // zoom, a primary low-vision affordance. Swallowing it for the whole route
  // — dialogs, header, anything portalled outside the room — would take that
  // away. Only a keystroke aimed INSIDE the room is ours.
  const resetZoom = useCallback(() => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    api.canvasProps?.onViewChange?.(
      zoomBoardViewAtPoint(
        api.view,
        { x: (rect?.width ?? 800) / 2, y: (rect?.height ?? 600) / 2 },
        1,
      ),
      'reset',
    );
  }, [api]);
  // Held in a ref so the window listener registers once instead of on every
  // render (A14).
  const viewShortcutsRef = useRef({ fit, zoomBy, resetZoom });
  viewShortcutsRef.current = { fit, zoomBy, resetZoom };
  useEffect(() => {
    const handleViewKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTextEntryTarget(event.target)) return;
      const root = rootRef.current;
      const target = event.target;
      if (!root || !(target instanceof Node) || !root.contains(target)) return;
      // No view change while a pointer gesture is in flight — zoom or fit
      // re-anchors the frame the gesture was measured against. Bare '1'
      // needed this as much as the mod+ combos did (A3).
      if (gestureActiveRef.current || roomShortcutsSuppressedRef.current) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod && event.key === '1') {
        event.preventDefault();
        viewShortcutsRef.current.fit();
        return;
      }
      if (mod && event.key === '0') {
        event.preventDefault();
        viewShortcutsRef.current.resetZoom();
        return;
      }
      if (mod && (event.key === '+' || event.key === '=' || event.key === '-')) {
        event.preventDefault();
        viewShortcutsRef.current.zoomBy(event.key === '-' ? -0.1 : 0.1);
      }
    };
    window.addEventListener('keydown', handleViewKeyDown);
    return () => window.removeEventListener('keydown', handleViewKeyDown);
  }, []);

  useEffect(() => {
    const guard = (items: readonly EditableMoodBoardItem[]) => {
      // Was proposal-owners-only. A project board's pins can now carry guest
      // link reactions, so deleting them destroys real client feedback there
      // too — the guard has to wait for the feed on both owner kinds.
      if (!feedbackQuery.isSuccess) {
        setSurfaceError(FEEDBACK_UNAVAILABLE_MESSAGE);
        void feedbackQuery.refetch();
        return false;
      }
      const ids = new Set(items.map((item) => item.id));
      const verdictCount = feedback.filter((entry) =>
        entry.board_item_id ? ids.has(entry.board_item_id) : false,
      ).length;
      if (verdictCount === 0) return true;
      return window.confirm(
        `${verdictCount} client feedback ${verdictCount === 1 ? 'entry is' : 'entries are'} attached to this selection. Deleting will permanently remove ${verdictCount === 1 ? 'it' : 'them'}. Continue?`,
      );
    };
    deleteGuardRef.current = guard;
    return () => {
      if (deleteGuardRef.current === guard) deleteGuardRef.current = null;
    };
  }, [deleteGuardRef, feedback, feedbackQuery]);

  useEffect(() => {
    if (feedbackQuery.isSuccess) {
      setSurfaceError((current) => current === FEEDBACK_UNAVAILABLE_MESSAGE ? null : current);
    }
  }, [feedbackQuery.isSuccess]);

  useEffect(() => {
    const previous = previousModeRef.current;
    if (previous === api.mode) return;
    previousModeRef.current = api.mode;
    if (api.mode === 'present') {
      presentStartedRef.current = performance.now();
      return;
    }
    if (previous === 'present' && presentStartedRef.current !== null && api.state) {
      moodBoardEvents.presented({
        board_id: api.state.boardId,
        item_count: api.state.items.length,
        section_count: api.state.sections.length,
        surface: 'room',
        duration_ms: Math.max(0, Math.round(performance.now() - presentStartedRef.current)),
        owner_kind: owner.kind,
        owner_id: owner.id,
        proposal_id: sourceProposalId,
        source_proposal_id: sourceProposalId,
        project_id: owner.kind === 'project' ? owner.id : null,
      });
      presentStartedRef.current = null;
    }
  }, [api.mode, api.state, owner.id, owner.kind, sourceProposalId]);

  // Warm every item image (+ cover) the instant Present is entered — from
  // either the toolbar toggle or the 'p' shortcut, both of which land here as
  // an `api.mode` flip. Never blocks the switch: `warmPresentImages` returns
  // synchronously and Present renders immediately; this only shortens the
  // window where a pin is still a gray box mid-load. `presentPrefetchWarmedRef`
  // persists for the life of the room session, so re-entering Present never
  // re-requests a URL already warmed.
  useEffect(() => {
    const previous = presentPrefetchPreviousModeRef.current;
    presentPrefetchPreviousModeRef.current = api.mode;
    if (api.mode !== 'present') {
      if (previous === 'present') {
        presentPrefetchHandleRef.current?.cancel();
        presentPrefetchHandleRef.current = null;
        setPresentPrefetchProgress(null);
        setPresentPrefetchResult(null);
      }
      return;
    }
    if (previous === 'present' || !api.state) return;

    setPresentPrefetchResult(null); // clear any stale note from a prior session
    const targets = collectPresentPrefetchTargets(
      api.state.items,
      boardQuery.data?.cover_image_url ?? null,
    );
    presentPrefetchHandleRef.current = warmPresentImages(targets, presentPrefetchWarmedRef.current, {
      onProgress: (loaded, total) => setPresentPrefetchProgress({ loaded, total }),
      onSettled: (failed) => {
        setPresentPrefetchProgress(null);
        if (failed > 0) setPresentPrefetchResult({ failed });
      },
    });
  }, [api.mode, api.state, boardQuery.data?.cover_image_url]);

  // Auto-dismiss the "may load during presentation" note on the viewer's
  // first interaction with the room — it's informational, never modal.
  useEffect(() => {
    if (!presentPrefetchResult) return;
    const node = workspaceRef.current;
    if (!node) return;
    const dismiss = () => setPresentPrefetchResult(null);
    node.addEventListener('pointerdown', dismiss, { once: true });
    node.addEventListener('keydown', dismiss, { once: true });
    return () => {
      node.removeEventListener('pointerdown', dismiss);
      node.removeEventListener('keydown', dismiss);
    };
  }, [presentPrefetchResult]);

  useEffect(() => () => presentPrefetchHandleRef.current?.cancel(), []);

  const input = useMemo(() => boardRasterInput(api), [api]);
  useBoardRoomBoundary(
    rootRef,
    !api.isLoading &&
      !!api.state &&
      !!api.canvasProps &&
      !!api.compositionBoard &&
      !!input,
  );
  const coverSignature = useMemo(
    () => api.state ? JSON.stringify({
      canvasWidth: api.state.canvasWidth,
      canvasHeight: api.state.canvasHeight,
      backgroundColor: api.state.backgroundColor,
      sections: api.state.sections,
      items: api.state.items,
    }) : null,
    [api.state],
  );

  const writeCover = useCallback(async (force = false) => {
    if (coverSignature && input && api.state) {
      // Capture the render-current state synchronously. A Done click can land
      // before the observation effect below has run for the latest edit.
      coverLifecycleRef.current?.update({
        boardId: api.state.boardId,
        signature: coverSignature,
        input,
      });
    }
    await coverLifecycleRef.current?.flush(force);
  }, [api.state, coverSignature, input]);

  useEffect(() => {
    if (!coverSignature || !input || !api.state) return;
    coverLifecycleRef.current?.update({
      boardId: api.state.boardId,
      signature: coverSignature,
      input,
    });
  }, [api.state, coverSignature, input]);

  useEffect(() => () => coverLifecycleRef.current?.dispose(), []);

  const finishPresentation = useCallback(() => {
    if (presentStartedRef.current === null || !api.state) return;
    moodBoardEvents.presented({
      board_id: api.state.boardId,
      item_count: api.state.items.length,
      section_count: api.state.sections.length,
      surface: 'room',
      duration_ms: Math.max(0, Math.round(performance.now() - presentStartedRef.current)),
      owner_kind: owner.kind,
      owner_id: owner.id,
      proposal_id: sourceProposalId,
      source_proposal_id: sourceProposalId,
      project_id: owner.kind === 'project' ? owner.id : null,
    });
    presentStartedRef.current = null;
  }, [api.state, owner.id, owner.kind, sourceProposalId]);

  const completeExit = useCallback(async () => {
    if (!api.state) return;
    finishPresentation();
    await writeCover(true);
    moodBoardEvents.done({
      board_id: api.state.boardId,
      duration_ms: Math.max(0, Math.round(performance.now() - startedAtRef.current)),
      item_count: api.state.items.length,
      command_count: metricsRef.current.commands,
      used_undo: metricsRef.current.usedUndo,
      used_multiselect: metricsRef.current.usedMultiselect,
      used_tidy: metricsRef.current.usedTidy,
      used_handles: metricsRef.current.usedHandles,
    });
    router.push(returnTarget);
  }, [api.state, finishPresentation, returnTarget, router, writeCover]);

  useEffect(() => {
    exitHandlerRef.current = completeExit;
    return () => {
      if (exitHandlerRef.current === completeExit) exitHandlerRef.current = null;
    };
  }, [completeExit, exitHandlerRef]);

  const ownerLabel = owner.kind === 'proposal'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ((proposalQuery.data as any)?.title ?? (proposalQuery.data as any)?.project?.name ?? 'Proposal board')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : ((projectQuery.data as any)?.name ?? 'Project board');

  if (api.persistenceError && !api.state) {
    return (
      <main className="fixed inset-0 flex h-[100dvh] items-center justify-center bg-[var(--bg-primary)] p-8">
        <div className="max-w-md text-center">
          <h1 className="font-heading text-xl">This design board is unavailable</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">It may not exist, or you may not have access.</p>
          <Button className="mt-4" variant="secondary" onClick={() => router.push('/desk')}>Return to studio overview</Button>
        </div>
      </main>
    );
  }
  if (api.isLoading || !api.state || !api.canvasProps || !api.compositionBoard || !input) {
    return <div className="fixed inset-0 h-[100dvh] animate-pulse bg-[var(--bg-muted)]" aria-label="Loading mood board" />;
  }

  const state = api.state;
  const nextPoint = (): BoardPoint => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    const base = {
      x: ((rect?.width ?? 800) / 2 - api.view.pan.x) / api.view.zoom - 130,
      y: ((rect?.height ?? 600) / 2 - api.view.pan.y) / api.view.zoom - 150,
    };
    // Section-band bounds (label included) are also avoided, so a click-add
    // never lands under a band.
    const geometry = resolveMoodBoardGeometry({
      canvasWidth: state.canvasWidth,
      canvasHeight: state.canvasHeight,
      backgroundColor: state.backgroundColor,
      sections: state.sections,
      items: state.items,
    });
    // Cascades by (24, 24) past whatever already occupies the centre point,
    // so repeated click-adds don't stack invisibly on top of each other (CI-11).
    return findBoardCascadePlacement(
      base,
      state.items.map((item) => ({ x: item.x, y: item.y })),
      { avoidRects: geometry.sections.map((section) => section.bounds) },
    );
  };
  const nextZ = () => Math.max(-1, ...state.items.map((item) => item.zIndex ?? 0)) + 1;

  const addFromRail = (items: readonly EditableMoodBoardItem[], addSource: BoardAddSource) => {
    api.addItems(items, { source: addSource });
  };

  const renderVerdictOverlay = (item: { id?: string }) => (
    item.id ? <VerdictBadge feedback={feedbackByItem.get(item.id)} onPlate /> : null
  );
  const originalRenderItem = api.canvasProps.renderItem;
  const deckCaption = (item: EditableMoodBoardItem): string | null => {
    const deckItem = deckItemByPin.get(item.id);
    return deckItem ? canvasCaption(deckItem, deckReview.products) : null;
  };
  const renderDeckActions = (item: EditableMoodBoardItem): ReactNode => {
    const deckItem = deckItemByPin.get(item.id);
    if (!deckItem || deckItem.role !== 'product' || deckItem.state === 'pending' || deckItem.state === 'removed') {
      return null;
    }
    return (
      <div data-deck-inspector-acts className="space-y-1 rounded-[4px] border border-[var(--border-default)] px-2.5 py-2">
        <p className="font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)]">{howPhrase(deckItem)}</p>
        <DeckPieceActs
          item={deckItem}
          products={deckReview.products}
          decisions={deckDecisions}
          pins={state.items}
          compact
        />
      </div>
    );
  };
  // The item's state as caption words beneath it (US-28 S12; SPEC §S12.2.4):
  // the verdict, the open-direction count and the deck caption no longer sit
  // over the plate as badges, and nothing in them truncates.
  const editRenderItem = (item: EditableMoodBoardItem): ReactNode => {
    const directionCount = unresolvedDirectionCountByItem.get(item.id) ?? 0;
    const caption = deckCaption(item);
    const hasWords = feedbackByItem.has(item.id) || directionCount > 0 || Boolean(caption);
    return (
      <div className="flex h-full w-full flex-col">
        <div className="relative min-h-0 flex-1">
          {item.type === 'note' && editingNoteId === item.id ? (
            <InlineNoteEditor
              item={item}
              onFocus={() => api.setFocusedItemId(item.id)}
              onCommit={(content) => api.updateItem(item.id, { content })}
              onDone={() => setEditingNoteId(null)}
            />
          ) : originalRenderItem(item)}
        </div>
        {hasWords && (
          <p className="br-item-words pointer-events-none">
            {feedbackByItem.has(item.id) && <VerdictBadge feedback={feedbackByItem.get(item.id)} />}
            <DirectionIndicator count={directionCount} />
            {caption && (
              <span data-deck-caption className="br-deck-caption">
                {caption}
              </span>
            )}
          </p>
        )}
      </div>
    );
  };

  const adjustTidyGap = (gap: number) => {
    if (!tidySession) return;
    api.tidy(tidySession.itemIds, {
      gap,
      gestureId: tidySession.gestureId,
      committedAt: tidySession.committedAt,
    });
    setTidySession({ ...tidySession, gap });
  };

  const focusFeedbackItem = (itemId: string) => {
    const item = state.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    api.setSelection([itemId]);
    api.setFocusedItemId(itemId);
    const rect = workspaceRef.current?.getBoundingClientRect();
    api.canvasProps?.onViewChange?.({
      zoom: api.view.zoom,
      pan: {
        x: (rect?.width ?? 800) / 2 - (item.x + item.width / 2) * api.view.zoom,
        y: (rect?.height ?? 600) / 2 - (item.y + (item.height ?? item.width) / 2) * api.view.zoom,
      },
    }, 'reset');
  };

  return (
    <main
      ref={rootRef}
      tabIndex={-1}
      aria-label={`${state.name} design board workspace`}
      className="fixed inset-0 z-[40] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-contain bg-[var(--bg-primary)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] outline-none"
    >
      {/* The house Header line (US-28 S12; SPEC §S12.4): the job as an
          eyebrow, the board's name in Playfair, and three acts — Present and
          Save and close scored, Share tertiary. No filled act. Every tool
          lives in the Tools Section below; below md the "Tools" act opens it
          as one sheet. */}
      <header className="br-head relative z-50 shrink-0">
        <div className="hline br-hline">
          <div className="hline-l br-hline-l">
            {/* Back to the job (boardroom-p1): the same leave as Save and
                close, so the board and its cover are written before it goes. */}
            <DocumentAction
              actionKey="board-room-back"
              surfaceKey="board-room"
              regionKey="board-room-head"
              variant="tertiary"
              leading="←"
              className="br-back"
              disabled={api.isExiting}
              onClick={() => void api.requestExit()}
            >
              {ownerLabel}
            </DocumentAction>
            <div className="br-name-wrap"><BoardNameField api={api} /></div>
          </div>
          <div className="hline-r br-hline-r">
            {api.mode === 'edit' && (
              <DocumentAction
                ref={toolsActRef}
                actionKey="board-room-tools"
                surfaceKey="board-room"
                regionKey="board-room-head"
                variant="tertiary"
                className={railCollapsed ? 'br-tools-act br-tools-act--folded' : 'br-tools-act'}
                aria-expanded={toolsSheetOpen}
                aria-controls="board-room-tools"
                onClick={() => {
                  // Below md the act opens the sheet; at md and up it unfolds
                  // the side Section the designer folded away.
                  if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
                    if (railCollapsed) toggleRail();
                    return;
                  }
                  setToolsSheetOpen(true);
                  requestAnimationFrame(() => toolsHeadRef.current?.focus());
                }}
              >
                Tools
              </DocumentAction>
            )}
            {api.mode === 'present' && (
              <label className="br-check">
                <input type="checkbox" checked={api.showNotes} onChange={(event) => api.setShowNotes(event.target.checked)} />
                Show notes
              </label>
            )}
            <DocumentAction
              actionKey={api.mode === 'present' ? 'board-room-back-to-editing' : 'board-room-present'}
              surfaceKey="board-room"
              regionKey="board-room-head"
              variant="secondary"
              onClick={api.togglePresent}
            >
              {api.mode === 'present' ? 'Back to editing' : 'Present'}
            </DocumentAction>
            <DocumentAction
              actionKey="board-room-save-and-close"
              surfaceKey="board-room"
              regionKey="board-room-head"
              variant="secondary"
              disabled={api.isExiting}
              onClick={() => void api.requestExit()}
            >
              {api.isExiting ? 'Saving…' : 'Save and close'}
            </DocumentAction>
            <DocumentAction
              actionKey="board-room-share"
              surfaceKey="board-room"
              regionKey="board-room-head"
              variant="tertiary"
              aria-label="Share design board"
              onClick={() => setShareOpen(true)}
            >
              Share
            </DocumentAction>
            {/* The room sheds the docks and covers the page, so the TESTER
                mark takes its place here, one more act in this wrapping row:
                it covers no control, and the sheets and dialogs still stand
                over it (SQ-865). */}
            <TesterSlot kind="board" />
          </div>
        </div>
        <div className="rule-strong br-rule" role="presentation" />
      </header>

      {(surfaceError || api.persistenceError) && (
        <div role="alert" className="relative z-40 flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-clay)] bg-[var(--bg-surface)] px-4 py-2 text-[11px] text-[var(--color-clay-ink)]">
          <span>{surfaceError ?? api.persistenceError}</span>
          <span className="flex shrink-0 items-center gap-1">
            {api.persistenceError && !surfaceError && (
              <button
                type="button"
                disabled={api.isRetryingPersistence}
                className="min-h-11 min-w-11 shrink-0 font-mono text-[9px] uppercase underline underline-offset-2 disabled:no-underline disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
                onClick={() => { void api.retryPersistence(); }}
              >
                {api.isRetryingPersistence ? 'Trying…' : 'Try again'}
              </button>
            )}
            <button
              type="button"
              className="min-h-11 min-w-11 shrink-0 font-mono text-[9px] uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
              onClick={() => {
                setSurfaceError(null);
                api.discardPersistenceError();
              }}
            >
              Dismiss reverted-change notice
            </button>
          </span>
        </div>
      )}

      {surfaceNotice && !surfaceError && !api.persistenceError && (
        <div role="status" className="relative z-40 flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
          <span>{surfaceNotice}</span>
          <button
            type="button"
            aria-label="Dismiss board notice"
            className="min-h-11 min-w-11 shrink-0 font-mono text-[9px] uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
            onClick={() => setSurfaceNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {unpreparedReviewMediaCount > 0 && !surfaceError && !api.persistenceError && (
        <div role="status" className="relative z-40 shrink-0 border-b border-[var(--color-clay)] bg-[var(--bg-surface)] px-4 py-2 text-[11px] text-[var(--color-clay-ink)]">
          {unpreparedReviewMediaItemIds[0] ? (
            <button
              type="button"
              onClick={() => focusFeedbackItem(unpreparedReviewMediaItemIds[0])}
              className="min-h-11 text-left underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
            >
              {reviewMediaBannerCopy(unpreparedReviewMediaCount)}
            </button>
          ) : (
            <span>{reviewMediaBannerCopy(unpreparedReviewMediaCount)}</span>
          )}
        </div>
      )}

      {dropUploadProgress && (
        <div role="status" className="relative z-40 shrink-0 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 font-mono text-[11px] text-[var(--text-muted)]">
          {dropUploadProgress}
        </div>
      )}

      {!dropUploadProgress && deckHead && (
        <div role="status" data-deck-room-head className="relative z-40 shrink-0 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 font-mono text-[11px] text-[var(--text-muted)]">
          {deckHead.text}
          {deckHead.review && (
            <>
              {' — '}
              <button
                type="button"
                onClick={() => setDeckLedgerOpen(true)}
                className="min-h-8 text-[var(--color-clay-ink)] underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
              >
                Review import
              </button>
            </>
          )}
        </div>
      )}

      {owner.kind === 'project' && !surfaceError && !api.persistenceError && (
        <BoardPromoteAllPanel
          projectId={owner.id}
          scopeRoomId={boardQuery.data?.project_room_id ?? boardQuery.data?.scope_room_id ?? null}
          items={state.items}
          justMaterialized={justMaterialized}
          onDismissJustMaterialized={onDismissJustMaterialized}
          onPromoted={(itemId, selectionId) => api.updateItem(itemId, { projectFfeItemId: selectionId })}
        />
      )}

      {owner.kind === 'project' && !surfaceError && !api.persistenceError && (
        <BoardApprovedPinsPanel
          boardId={state.boardId}
          projectId={owner.id}
          scopeRoomId={boardQuery.data?.project_room_id ?? boardQuery.data?.scope_room_id ?? null}
          items={state.items}
          onPromoted={(itemId, selectionId) => api.updateItem(itemId, { projectFfeItemId: selectionId })}
        />
      )}

      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose replacement image"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void uploadReplacement(file);
          event.currentTarget.value = '';
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {api.mode === 'edit' && toolsSheetOpen && (
          <div
            aria-hidden
            className="veil br-tools-veil md:hidden"
            onClick={() => closeToolsSheet()}
          />
        )}
        {api.mode === 'edit' && (
          // The Tools Section (US-28 S12; SPEC §S12.4, frames p1 and p8): at md
          // and up it is the side column; below md it is one sheet over the
          // veil, opened by the header's "Tools" act and put back by its own.
          <aside
            ref={toolsSheetRef}
            id="board-room-tools"
            aria-labelledby="board-room-tools-head"
            {...toolsSheetModalProps}
            data-open={toolsSheetOpen ? 'true' : 'false'}
            data-folded={railCollapsed ? 'true' : 'false'}
            className="section br-tools"
          >
            <div className="sec-head">
              <p className="eb" id="board-room-tools-head" ref={toolsHeadRef} tabIndex={-1}>
                <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false"><path d="M0 2h34M0 6h28M0 10h20" /></svg>
                <span>Tools</span>
              </p>
              <button type="button" className="br-tool br-tools-fold" onClick={toggleRail}>Fold tools</button>
              <button type="button" className="br-tool br-tools-putback" onClick={() => closeToolsSheet()}>Put back</button>
            </div>
            <div className="br-tools-group br-tools-group--first" role="group" aria-labelledby="br-tools-bring">
              <p className="eb" id="br-tools-bring">Bring pieces in</p>
              <BoardAddRail
                owner={owner}
                boardId={state.boardId}
                projectRoomId={owner.kind === 'project' ? boardQuery.data?.project_room_id ?? null : null}
                items={state.items}
                preferenceScope={preferenceScope}
                nextPoint={nextPoint}
                nextZ={nextZ}
                onAddItems={addFromRail}
                onSelectItem={focusFeedbackItem}
                onBringInDeck={onBringInDeck}
              />
            </div>
            <div className="br-tools-group" role="group" aria-labelledby="br-tools-view">
              <p className="eb" id="br-tools-view">View</p>
              <div className="br-tool-acts">
                <button type="button" className="br-tool" disabled={!api.canUndo} onClick={api.undo} aria-label="Undo">Undo</button>
                <button type="button" className="br-tool" disabled={!api.canRedo} onClick={api.redo} aria-label="Redo">Redo</button>
                {wideRoom && !railCollapsed && (
                <span className="br-zoom-tools">
                  <button type="button" className="br-tool" aria-label="Zoom out" onClick={() => zoomBy(-0.1)}>−</button>
                  <span className="br-zoom-word">{Math.round(api.view.zoom * 100)}%</span>
                  <button type="button" className="br-tool" aria-label="Zoom in" onClick={() => zoomBy(0.1)}>+</button>
                  <button type="button" className="br-tool" onClick={fit}>Fit to screen</button>
                </span>
                )}
                <button type="button" className="br-tool" aria-label="Show grid" aria-pressed={showGrid} onClick={toggleGrid}>Grid</button>
                <button type="button" className="br-tool" aria-label="Snap to grid" aria-pressed={snapToGrid} onClick={toggleSnap}>Snap</button>
              </div>
            </div>
            <BoardRoomSectionsMenu
              api={api}
              tidyEnabled={tidyTarget.enabled}
              onTidy={runTidy}
              onExport={() => setExportOpen(true)}
              onSaveTemplate={() => setTemplateOpen(true)}
            />
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          ref={workspaceRef}
          className={`relative min-h-0 flex-1 ${api.mode === 'present' ? 'overflow-y-auto sm:overflow-hidden' : 'overflow-hidden'}`}
        >
          {api.mode === 'edit' && state.items.length === 0 && (
            // The one empty state, on the surface (frame p6) — not a canvas
            // item, and transparent to the pointer so a drop still lands.
            <div className="br-empty pointer-events-none">
              <EmptyState eyebrow="An empty board">
                Nothing on this board yet. Bring pieces in from Tools, or drop a photo or a link here.
              </EmptyState>
            </div>
          )}
          {api.mode === 'edit' && tidySession && (
            <div
              role="group"
              aria-label="Tidy spacing"
              className="br-line absolute left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-2 px-3 py-2"
            >
              <label className="flex items-center gap-2 font-mono text-[9px] uppercase text-[var(--text-muted)]">
                Spacing
                <input
                  type="range"
                  aria-label="Tidy spacing in pixels"
                  min={BOARD_ROOM_MIN_TIDY_GAP}
                  max={BOARD_ROOM_MAX_TIDY_GAP}
                  step={2}
                  value={tidySession.gap}
                  onChange={(event) => adjustTidyGap(Number(event.currentTarget.value))}
                  className="w-32 accent-[var(--color-clay)]"
                />
              </label>
              <output className="min-w-8 font-mono text-[9px] tabular-nums text-[var(--text-primary)]">
                {tidySession.gap}px
              </output>
              <button
                type="button"
                aria-label="Close Tidy spacing"
                onClick={() => setTidySession(null)}
                className="min-h-11 min-w-11 text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
              >
                ×
              </button>
            </div>
          )}
          {api.mode === 'present' ? (
            <>
              <BoardComposition
                board={api.compositionBoard}
                sections={state.sections}
                canvasWidth={state.canvasWidth}
                canvasHeight={state.canvasHeight}
                backgroundColor={state.backgroundColor}
                renderPinOverlay={renderVerdictOverlay}
                fullBleed
                fit="contain"
                showNotes={api.showNotes}
                className="h-full"
              />
              {presentPrefetchProgress && (
                <div
                  role="status"
                  aria-live="polite"
                  className="br-line pointer-events-none absolute bottom-3 right-3 z-40 px-3 py-1"
                >
                  Loading images {presentPrefetchProgress.loaded}/{presentPrefetchProgress.total}
                </div>
              )}
              {!presentPrefetchProgress && presentPrefetchResult && presentPrefetchResult.failed > 0 && (
                <div
                  role="status"
                  aria-live="polite"
                  className="br-line absolute bottom-3 right-3 z-40 flex items-center gap-2 px-3 py-1"
                >
                  <span>
                    {presentPrefetchResult.failed} image{presentPrefetchResult.failed === 1 ? '' : 's'} may load during presentation
                  </span>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => setPresentPrefetchResult(null)}
                    className="min-h-11 min-w-11 text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
                  >
                    ×
                  </button>
                </div>
              )}
            </>
          ) : (
            <BoardRoomCanvas
              {...api.canvasProps}
              renderItem={editRenderItem}
              showGrid={showGrid}
              snapToGrid={snapToGrid}
              showViewControls={false}
              onAnnounce={api.announce}
              onGestureActiveChange={(active) => {
                gestureActiveRef.current = active;
                api.canvasProps?.onGestureActiveChange?.(active);
              }}
              onItemActivate={(item) => {
                // Double-click a note and the caret lands in the note itself
                // (CI-24); everything else keeps the controller's activation.
                if (item.type === 'note') {
                  api.setSelection([item.id]);
                  api.setFocusedItemId(item.id);
                  setEditingNoteId(item.id);
                  return;
                }
                api.canvasProps?.onItemActivate?.(item);
              }}
              className="h-full min-h-0"
            />
          )}
          <BoardRoomInspector
            api={api}
            owner={owner}
            scopeRoomId={boardQuery.data?.project_room_id ?? boardQuery.data?.scope_room_id ?? null}
            scheduleRoomId={scheduleRoomIdForBoard(boardQuery.data)}
            onOpenProduct={openProduct}
            onReplaceImage={replaceImage}
            onScheduleSent={stampScheduleBacklink}
            directions={directions}
            renderDeckActions={deckImportOn ? renderDeckActions : undefined}
          />
        </div>
        {api.mode === 'edit' && (!wideRoom || railCollapsed) && (
          // Zoom and Fit stay visible at every width (CI-02): at md and up in
          // Tools › View, below md (or with Tools folded) here, under the board
          // (frame p7).
          <div className="br-viewbar" role="group" aria-label="Board view">
            <button type="button" className="br-tool" aria-label="Zoom out" onClick={() => zoomBy(-0.1)}>−</button>
            <span className="br-zoom-word">{Math.round(api.view.zoom * 100)}%</span>
            <button type="button" className="br-tool" aria-label="Zoom in" onClick={() => zoomBy(0.1)}>+</button>
            <button type="button" className="br-tool" onClick={fit}>Fit to screen</button>
          </div>
        )}
        </div>
      </div>

      {/* Persistence status keeps its OWN region. Sharing one with the
          announcements meant a routed canvas announcement — which fires on
          every click — permanently masked "Saving"/"Saved" behind it (A4).
          This one is derived from state, so it clears itself. */}
      <div role="status" aria-live="polite" className="sr-only">
        {api.persistenceState === 'saving' || api.persistenceState === 'dirty'
          ? 'Saving board changes'
          : api.persistenceState === 'saved'
            ? 'Board changes saved'
            : ''}
      </div>

      {/* The room's ONE announcement region — the canvas routes its own here
          rather than rendering a second one that talks over it (CI-14). It
          also carries the exit guard, and shows itself when it does: the
          "press again" prompt used to be audible to a screen reader and
          invisible to everyone else (CI-20). */}
      <div
        aria-live="polite"
        aria-atomic="true"
        data-testid="board-room-live-region"
        className={api.exitPromptArmed
          ? 'br-line pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 px-4 py-2'
          : 'sr-only'}
      >
        {api.announcement}
      </div>

      <BoardShareDialog
        boardId={state.boardId}
        boardName={state.name}
        owner={owner}
        sourceProposalId={sourceProposalId}
        open={shareOpen}
        onOpenChange={setShareOpen}
        flush={api.flushPending}
      />
      <BoardExportDialog
        boardId={state.boardId}
        boardName={state.name}
        owner={owner}
        input={input}
        open={exportOpen}
        onOpenChange={setExportOpen}
        flush={api.flushPending}
      />
      <BoardTemplateDialog
        boardId={state.boardId}
        boardName={state.name}
        itemCount={state.items.length}
        sectionCount={state.sections.length}
        items={state.items}
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        flush={api.flushPending}
      />
      {deckImportOn && (
        <BoardDeckImportLedger
          open={deckLedgerOpen}
          onClose={() => setDeckLedgerOpen(false)}
          owner={owner}
          scopeRoomId={boardQuery.data?.project_room_id ?? boardQuery.data?.scope_room_id ?? null}
          importId={deckReview.deckImport?.id ?? null}
          items={deckReview.items}
          products={deckReview.products}
          decisions={deckDecisions}
          pins={state.items}
          onPromoted={(itemId, selectionId) => api.updateItem(itemId, { projectFfeItemId: selectionId })}
          sendToSchedule={(pin) => sendToSchedule(pin, { quiet: true })}
        />
      )}
    </main>
  );
}

export function MoodBoardRoom({
  owner,
  boardId,
}: {
  owner: BoardOwnerRef;
  boardId: string;
}) {
  const apiRef = useRef<BoardRoomControllerApi | null>(null);
  const itemActionsRef = useRef<BoardRoomItemActions | null>(null);
  const exitHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const deleteGuardRef = useRef<((items: readonly EditableMoodBoardItem[]) => boolean) | null>(null);
  const unfurl = useMoodBoardUrlUnfurl();
  const boardQuery = useBoard(boardId);
  const placeProjectProduct = usePlaceProductInProjectV2();
  const [dropUploadProgress, setDropUploadProgress] = useState<string | null>(null);
  const [externalNotice, setExternalNotice] = useState<string | null>(null);
  // Bring in a Deck (US-15 W2) — fail-closed: off or loading hides every
  // entry point, and a dropped deck only gets a plain note.
  const { value: deckImportOn } = useFeatureFlag(DECK_IMPORT_FLAG);
  const [deckFile, setDeckFile] = useState<File | null>(null);
  const deckInputRef = useRef<HTMLInputElement>(null);
  const deckLayout = useBoardDeckImportLayout({ owner, boardId, upload: uploadFilesAsBoardItems });
  const openDeck = useCallback((file: File) => {
    if (!deckImportOn) {
      setExternalNotice(DECK_COPY.notSupported);
      return;
    }
    if (deckFileKind(file) === 'resave') {
      setExternalNotice(DECK_COPY.resave);
      return;
    }
    setDeckFile(file);
  }, [deckImportOn]);
  const chooseDeck = useCallback(() => deckInputRef.current?.click(), []);
  useEffect(() => {
    if (!deckImportOn) return;
    const pending = takePendingDeck(boardId);
    if (pending) setDeckFile(pending);
    const onOpen = () => chooseDeck();
    window.addEventListener(DECK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(DECK_OPEN_EVENT, onOpen);
  }, [boardId, chooseDeck, deckImportOn]);
  const layOutDeck = useCallback((deck: PreparedDeck, pastedLinks: string) => {
    const api = apiRef.current;
    if (!api?.state) return;
    void deckLayout.layOut({
      deck,
      pastedLinks,
      room: {
        sections: api.state.sections,
        items: api.state.items,
        commit: (sections, items) => {
          apiRef.current?.addItems(items, {
            id: generatedId('deck'),
            sections,
            select: false,
            source: 'file_drop',
          });
        },
        flush: () => apiRef.current?.flushPending() ?? Promise.resolve(),
      },
    }).catch((cause) => {
      setExternalNotice(cause instanceof Error && cause.message
        ? `The deck could not be laid out: ${cause.message}`
        : 'The deck could not be laid out.');
    });
  }, [deckLayout]);
  const metricsRef = useRef<SessionMetrics>({
    commands: 0,
    usedUndo: false,
    usedMultiselect: false,
    usedTidy: false,
    usedHandles: false,
  });
  const lastCommandRef = useRef<BoardRoomCommandCommittedEvent | null>(null);

  const observeCommand = useCallback((event: BoardRoomCommandCommittedEvent) => {
    const { command, direction } = event;
    lastCommandRef.current = event;
    metricsRef.current.commands += 1;
    if (direction === 'undo') metricsRef.current.usedUndo = true;
    if (command.kind === 'tidy') metricsRef.current.usedTidy = true;
    if (command.kind === 'resize' || command.kind === 'rotate') {
      metricsRef.current.usedHandles = true;
    }
    if (direction === 'apply' && command.kind === 'tidy') {
      moodBoardEvents.arranged({
        board_id: boardId,
        scope: command.scope ?? 'board',
        item_count: command.touches.length || command.after.items.length,
      });
    }
  }, [boardId]);

  const observeItemsAdded = useCallback((
    items: readonly EditableMoodBoardItem[],
    source: Parameters<typeof moodBoardEvents.itemAdded>[0]['source'],
  ) => {
    const byType = new Map<EditableMoodBoardItem['type'], number>();
    for (const item of items) byType.set(item.type, (byType.get(item.type) ?? 0) + 1);
    for (const [type, count] of byType) {
      moodBoardEvents.itemAdded({ board_id: boardId, type, source, count });
    }
  }, [boardId]);
  // DV3 — set once from the `materialized=template` query param BoardsBuilder
  // appends on its post-materialize redirect. Dismissible (either an
  // explicit dismiss or a completed "Promote all" run) but never recomputed
  // from the URL again — a one-shot banner, not a persistent read of `search`.
  const [justMaterialized, setJustMaterialized] = useState(() => {
    if (typeof window === 'undefined') return false;
    return consumeMaterializedTemplateFlag({
      pathname: window.location.pathname,
      search: window.location.search,
    }).present;
  });
  const materializedRouter = useRouter();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { strippedHref } = consumeMaterializedTemplateFlag({
      pathname: window.location.pathname,
      search: window.location.search,
    });
    if (!strippedHref) return;
    // Strip the param immediately — otherwise a refresh or a bookmark of
    // THIS url re-triggers the "just materialized" framing forever; this
    // read is meant to fire exactly once per real materialize-then-redirect.
    materializedRouter.replace(strippedHref, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // `?present=1` opens the room straight into Present (US-28 S12: the job's
  // boards tab links a board's "Present" act here). Read once, like
  // `navigation` below; the controller only takes it as its initial mode.
  const [startMode] = useState<BoardRoomMode>(() => {
    if (typeof window === 'undefined') return 'edit';
    return new URLSearchParams(window.location.search).get('present') === '1' ? 'present' : 'edit';
  });
  const [navigation] = useState(() => {
    if (typeof window === 'undefined') {
      return { source: 'direct_url' as const, returnTarget: owner.kind === 'proposal' ? `/drafting/${owner.id}` : `/doc/${owner.id}` };
    }
    const search = new URLSearchParams(window.location.search);
    return {
      source: moodBoardOpenSource(search.get('source')),
      returnTarget: resolveMoodBoardReturnTarget({
        explicitFrom: search.get('from'),
        referrer: document.referrer,
        currentOrigin: window.location.origin,
        owner,
      }),
    };
  });

  const resolveUrl = useCallback(async (
    url: string,
    point: BoardPoint,
    controls: BoardRoomUrlPasteControls,
  ) => {
    const api = apiRef.current;
    const placeholder = buildMoodBoardUrlPlaceholder({
      id: generatedId('url'),
      url,
      x: point.x - 140,
      y: point.y - 160,
      zIndex: api?.state ? Math.max(-1, ...api.state.items.map((item) => item.zIndex ?? 0)) + 1 : 0,
    });
    controls.addPlaceholder(placeholder);
    try {
      const result = await unfurl.mutateAsync({ url });
      const resolved = buildResolvedMoodBoardUrlItem({ placeholder, result });
      controls.replaceItem(resolved);
      observeItemsAdded([resolved], 'paste');
      moodBoardEvents.urlUnfurled({ board_id: boardId, host: result.host, outcome: 'resolved' });
    } catch (error) {
      const fallback = buildMoodBoardUrlFallbackNote({ placeholder, url });
      controls.replaceItem(fallback);
      observeItemsAdded([fallback], 'paste');
      setExternalNotice(moodBoardUrlFallbackNotice(error));
      let host = 'unknown';
      try { host = new URL(url).hostname; } catch { /* normalized upstream */ }
      moodBoardEvents.urlUnfurled({ board_id: boardId, host, outcome: 'failed' });
    }
  }, [boardId, observeItemsAdded, unfurl]);

  const dropped = useCallback(async (commit: BoardItemsDroppedCommit) => {
    const api = apiRef.current;
    if (!api?.state) return;
    // Always intercepted, flag on or off: a deck never reaches the image pipeline.
    const deck = commit.files.find((file) => deckFileKind(file));
    if (deck) {
      openDeck(deck);
      return;
    }
    if (commit.files.length > 0) {
      const startZ = Math.max(-1, ...api.state.items.map((item) => item.zIndex ?? 0)) + 1;
      try {
        return await uploadFilesAsBoardItems({
          ownerId: owner.id,
          ownerKind: owner.kind,
          boardId,
          files: commit.files,
          point: { x: commit.point.x - 140, y: commit.point.y - 100 },
          startZ,
          onProgress: ({ file, index, total, stage }) => {
            setDropUploadProgress(`Uploading ${index + 1}/${total} · ${file.name} · ${stage}`);
          },
        });
      } finally {
        setDropUploadProgress(null);
      }
    }
    const railEnvelope = commit.dataTransfer.getData(BOARD_ROOM_CLIPBOARD_MIME);
    if (railEnvelope) {
      const parsed = parseBoardRoomClipboard(railEnvelope);
      const lead = parsed?.items[0]?.item;
      if (!parsed || !lead) return;
      const height = lead.height ?? lead.width * (lead.type === 'image' || lead.type === 'room_scan' ? 0.72 : 1.15);
      if (owner.kind === 'project' && lead.type === 'capture' && lead.captureId) {
        const x = commit.point.x - lead.width / 2;
        const y = commit.point.y - height / 2;
        const projectRoomId = boardQuery.data?.project_room_id ?? null;
        const response = await placeProjectProduct.mutateAsync({
          projectId: owner.id,
          productId: lead.productId ?? null,
          captureId: lead.captureId,
          itemType: 'fixed',
          roleConfigurationIdentity: 'default',
          assignmentScope: projectRoomId ? 'room' : 'unassigned',
          roomId: projectRoomId,
          boardId,
          disposition: 'candidate',
          duplicateMode: 'reuse',
          placement: { x, y, width: lead.width },
          idempotencyKey: `capture-drag:${boardId}:${lead.id}`,
        });
        if (!response.selectionId || !response.placementId) {
          throw new Error('The captured product was held and was not added to the board.');
        }
        const placedItem: EditableMoodBoardItem = {
          ...lead,
          id: response.placementId,
          type: 'product',
          x,
          y,
          height,
          projectFfeItemId: response.selectionId,
        };
        return [placedItem];
      }
      await api.pasteAt(
        { x: commit.point.x - lead.width / 2, y: commit.point.y - height / 2 },
        railEnvelope,
        'rail_drag',
      );
      return;
    }
    const value = commit.dataTransfer.getData('text/uri-list') || commit.dataTransfer.getData('text/plain');
    if (!value) return;
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      await resolveUrl(url.toString(), commit.point, {
        addPlaceholder: (item) => { api.addItems([item]); },
        replaceItem: (item) => api.replaceItem(item),
        removeItem: (itemId) => api.deleteItems([itemId]),
      });
    } catch {
      return;
    }
  }, [boardId, boardQuery.data?.project_room_id, openDeck, owner, placeProjectProduct, resolveUrl]);

  const pasteImages = useCallback(async (files: readonly File[], point: BoardPoint) => {
    const api = apiRef.current;
    if (!api?.state) return [];
    const startZ = Math.max(-1, ...api.state.items.map((item) => item.zIndex ?? 0)) + 1;
    const items = await uploadFilesAsBoardItems({
      ownerId: owner.id,
      ownerKind: owner.kind,
      boardId,
      files,
      point: { x: point.x - 140, y: point.y - 100 },
      startZ,
    });
    return items;
  }, [boardId, owner.id, owner.kind]);

  return (
    <BoardRoomController
      owner={owner}
      boardId={boardId}
      defaultMode={startMode}
      onExit={() => exitHandlerRef.current?.()}
      onItemsDropped={dropped}
      onPasteImages={pasteImages}
      onPasteUrl={resolveUrl}
      onSendToSchedule={(item) => itemActionsRef.current?.sendToSchedule(item)}
      onOpenProduct={(item) => itemActionsRef.current?.openProduct(item)}
      onReplaceImage={(item) => itemActionsRef.current?.replaceImage(item)}
      onBeforeDelete={(items) => deleteGuardRef.current?.(items) ?? owner.kind !== 'proposal'}
      onItemsAdded={observeItemsAdded}
      onCommandCommitted={observeCommand}
    >
      {(api) => {
        apiRef.current = api;
        return (
          <>
            <BoardRoomSurface
              api={api}
              owner={owner}
              source={navigation.source}
              returnTarget={navigation.returnTarget}
              exitHandlerRef={exitHandlerRef}
              deleteGuardRef={deleteGuardRef}
              metricsRef={metricsRef}
              lastCommand={lastCommandRef.current}
              itemActionsRef={itemActionsRef}
              dropUploadProgress={deckLayout.progress ?? dropUploadProgress}
              externalNotice={externalNotice}
              onConsumeExternalNotice={() => setExternalNotice(null)}
              justMaterialized={justMaterialized}
              onDismissJustMaterialized={() => setJustMaterialized(false)}
              onBringInDeck={deckImportOn ? chooseDeck : undefined}
            />
            {deckImportOn && (
              <>
                <input
                  ref={deckInputRef}
                  type="file"
                  accept=".pptx,.ppsx,.potx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  data-deck-import-input
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) openDeck(file);
                  }}
                />
                <BoardDeckImportSheet
                  file={deckFile}
                  boardId={boardId}
                  onClose={() => setDeckFile(null)}
                  onLayOut={layOutDeck}
                />
              </>
            )}
          </>
        );
      }}
    </BoardRoomController>
  );
}
