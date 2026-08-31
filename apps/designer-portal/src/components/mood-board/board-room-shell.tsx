'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  BoardComposition,
  BoardRoomCanvas,
  fitBoardGeometry,
  resolveMoodBoardGeometry,
  type BoardItemsDroppedCommit,
  type MoodBoardRasterInput,
} from '@patina/design-system';
import type { BoardOwnerRef, BoardPoint, EditableMoodBoardItem } from '@patina/types';
import {
  useAddProposalItem,
  useBoard,
  useBoardFeedback,
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
import { buildSendToScheduleArgs, findScheduleTwin } from '@/lib/scope/board-schedule';
import {
  createMoodBoardCoverLifecycle,
  type MoodBoardCoverSnapshot,
} from '@/lib/mood-board-assets/board-cover-lifecycle';
import { BoardAddRail, uploadFilesAsBoardItems, type BoardAddSource } from './board-add-rail';
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

function VerdictBadge({ feedback }: { feedback: ItemFeedback | undefined }) {
  const chip = verdictChipSpec(feedback?.verdict, feedback?.resolved_at);
  if (!chip) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/95 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.04em] shadow-sm"
      style={{ color: chip.color }}
      data-board-verdict={feedback?.verdict}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {chip.label}
    </span>
  );
}

function InlineNoteEditor({
  item,
  onCommit,
  onFocus,
}: {
  item: EditableMoodBoardItem;
  onCommit: (content: string) => void;
  onFocus: () => void;
}) {
  const [draft, setDraft] = useState(item.content ?? '');
  useEffect(() => setDraft(item.content ?? ''), [item.content, item.id]);
  const commit = () => {
    if (draft !== (item.content ?? '')) onCommit(draft);
  };
  return (
    <textarea
      aria-label="Edit note"
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onFocus={onFocus}
      onBlur={commit}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          commit();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraft(item.content ?? '');
          event.currentTarget.blur();
        }
      }}
      className="h-full w-full resize-none overflow-auto rounded-sm border border-[#E0D2B8] bg-[#F3E9D5] p-3 text-[0.78rem] leading-[1.5] text-[#4A4137] shadow-sm outline-none focus:ring-2 focus:ring-[var(--color-clay)]"
      style={{ fontFamily: 'var(--font-body)' }}
    />
  );
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
      trapTabWithin(event, root);
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
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(name);
          event.currentTarget.blur();
        }
      }}
      className="h-11 min-w-[120px] border-transparent bg-transparent px-1 font-heading text-[15px] hover:border-[var(--border-default)] focus:border-[var(--color-clay)]"
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
}) {
  const router = useRouter();
  const { user } = useAuth();
  const rootRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetIdRef = useRef<string | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  const [surfaceNotice, setSurfaceNotice] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [tidySession, setTidySession] = useState<TidySpacingSession | null>(null);
  const upsertBoard = useUpsertBoard();
  const applyBoardState = useApplyBoardRoomState();
  const boardQuery = useBoard(api.state?.boardId);
  const proposalQuery = useProposal(owner.kind === 'proposal' ? owner.id : '');
  const projectQuery = useProject(owner.kind === 'project' ? owner.id : '');
  const sourceProposalId = owner.kind === 'proposal'
    ? owner.id
    : projectQuery.data?.proposal_id ?? null;
  const unpreparedReviewMediaCount = useMemo(() => {
    if (owner.kind !== 'project') return 0;
    const itemCount = (api.state?.items ?? []).filter((item) =>
      !item.projectFfeItemId &&
      (item.type === 'image' || item.type === 'room_scan') &&
      Boolean(item.imageUrl) &&
      typeof item.data?.review_media_asset_id !== 'string').length;
    const coverCount = boardQuery.data?.cover_image_url &&
      !boardQuery.data.cover_review_media_asset_id ? 1 : 0;
    return itemCount + coverCount;
  }, [api.state?.items, boardQuery.data?.cover_image_url,
    boardQuery.data?.cover_review_media_asset_id, owner.kind]);
  const scheduleQuery = useProposalScheduleItems(owner.kind === 'proposal' ? owner.id : undefined);
  const addScheduleItem = useAddProposalItem();
  const feedbackQuery = useBoardFeedback(owner.kind === 'proposal' ? owner.id : undefined);
  const feedback = feedbackQuery.data ?? [];
  const feedbackByItem = useMemo(() => latestFeedback(feedback), [feedback]);
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
    const handleTidyShortcut = (event: KeyboardEvent) => {
      if (api.mode !== 'edit' || isTextEntryTarget(event.target)) return;
      if (event.key === 'Escape' && tidySession) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setTidySession(null);
        return;
      }
      if (!event.shiftKey || event.key.toLowerCase() !== 't') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      runTidy();
    };
    window.addEventListener('keydown', handleTidyShortcut, true);
    return () => window.removeEventListener('keydown', handleTidyShortcut, true);
  }, [api.mode, runTidy, tidySession]);

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

  const sendToSchedule = useCallback(async (item: EditableMoodBoardItem) => {
    if (owner.kind !== 'proposal' || (item.type !== 'product' && item.type !== 'capture')) return;
    setSurfaceNotice(null);
    setSurfaceError(null);
    try {
      const refreshed = await scheduleQuery.refetch();
      if (refreshed.error) throw refreshed.error;
      const lines = refreshed.data ?? [];
      const snapshot = scheduleSnapshotForBoardItem(item);
      const scopeRoomId = boardQuery.data?.scope_room_id ?? null;
      const twin = findScheduleTwin(lines, snapshot.productId, scopeRoomId);
      if (twin) {
        setSurfaceNotice(`Already on the schedule${twin.doc_code ? ` · ${twin.doc_code}` : ''}`);
        return;
      }
      const args = buildSendToScheduleArgs({
        proposalId: owner.id,
        snap: snapshot,
        boardScopeRoomId: scopeRoomId,
        existingCodes: lines.map((line) => line.doc_code),
      });
      await addScheduleItem.mutateAsync(args);
      setSurfaceNotice(`Added to the schedule · ${args.docCode}`);
    } catch (cause) {
      setSurfaceError(cause instanceof Error ? cause.message : 'Could not add this pin to the schedule.');
    }
  }, [addScheduleItem, boardQuery.data?.scope_room_id, owner, scheduleQuery]);

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

  useEffect(() => {
    const guard = (items: readonly EditableMoodBoardItem[]) => {
      if (owner.kind === 'proposal' && !feedbackQuery.isSuccess) {
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
  }, [deleteGuardRef, feedback, feedbackQuery, owner.kind]);

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
          <h1 className="font-heading text-xl">This board is unavailable</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">It may not exist, or you may not have access.</p>
          <Button className="mt-4" variant="secondary" onClick={() => router.push('/desk')}>Return to the Desk</Button>
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
    return {
      x: ((rect?.width ?? 800) / 2 - api.view.pan.x) / api.view.zoom - 130,
      y: ((rect?.height ?? 600) / 2 - api.view.pan.y) / api.view.zoom - 150,
    };
  };
  const nextZ = () => Math.max(-1, ...state.items.map((item) => item.zIndex ?? 0)) + 1;

  const addFromRail = (items: readonly EditableMoodBoardItem[], addSource: BoardAddSource) => {
    api.addItems(items, { source: addSource });
  };

  const fit = () => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    const geometry = resolveMoodBoardGeometry({
      canvasWidth: state.canvasWidth,
      canvasHeight: state.canvasHeight,
      backgroundColor: state.backgroundColor,
      sections: state.sections,
      items: state.items,
    });
    const next = fitBoardGeometry(geometry, {
      width: rect?.width ?? 800,
      height: rect?.height ?? 600,
    });
    api.canvasProps?.onViewChange?.(next, 'fit');
  };

  const renderVerdictOverlay = (item: { id?: string }) => (
    item.id ? <VerdictBadge feedback={feedbackByItem.get(item.id)} /> : null
  );
  const originalRenderItem = api.canvasProps.renderItem;
  const editRenderItem = (item: EditableMoodBoardItem): ReactNode => (
    <div className="relative h-full w-full">
      {item.type === 'note' && api.selectedItemIds.includes(item.id) ? (
        <InlineNoteEditor
          item={item}
          onFocus={() => {
            api.setFocusedItemId(item.id);
            api.setSelection([item.id]);
          }}
          onCommit={(content) => api.updateItem(item.id, { content })}
        />
      ) : originalRenderItem(item)}
      {feedbackByItem.has(item.id) && (
        <span className="pointer-events-none absolute right-1 top-1 z-20">
          <VerdictBadge feedback={feedbackByItem.get(item.id)} />
        </span>
      )}
    </div>
  );

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
      aria-label={`${state.name} mood board room`}
      className="fixed inset-0 z-[40] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-contain bg-[var(--bg-primary)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] outline-none"
    >
      <header className="relative z-50 flex min-h-14 shrink-0 items-center gap-2 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-2 sm:px-4">
        <div className="min-w-0 flex-1 sm:max-w-[300px]"><BoardNameField api={api} /></div>
        <span className="hidden max-w-[180px] truncate rounded-full border border-[var(--border-default)] px-2.5 py-1 font-mono text-[8px] uppercase text-[var(--text-muted)] sm:block">
          {ownerLabel}
        </span>

        {api.mode === 'present' ? (
          <label className="hidden min-h-11 min-w-11 items-center justify-center gap-1.5 text-[10px] text-[var(--text-muted)] sm:flex">
            <input type="checkbox" checked={api.showNotes} onChange={(event) => api.setShowNotes(event.target.checked)} />
            Notes
          </label>
        ) : (
          <>
            <button type="button" onClick={toggleRail} className="hidden min-h-11 min-w-11 px-2 font-mono text-[9px] uppercase text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)] md:block">
              {railCollapsed ? 'Sources' : 'Hide sources'}
            </button>
            <button type="button" disabled={!api.canUndo} onClick={api.undo} className="hidden min-h-11 min-w-11 px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)] disabled:opacity-30 sm:block" aria-label="Undo">↶</button>
            <button type="button" disabled={!api.canRedo} onClick={api.redo} className="hidden min-h-11 min-w-11 px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)] disabled:opacity-30 sm:block" aria-label="Redo">↷</button>
            <span className="hidden min-w-10 text-center font-mono text-[9px] tabular-nums text-[var(--text-muted)] lg:block">{Math.round(api.view.zoom * 100)}%</span>
            <Button variant="ghost" size="sm" className="hidden min-h-11 min-w-11 lg:inline-flex" onClick={fit}>Fit</Button>
            <button type="button" aria-pressed={showGrid} onClick={toggleGrid} className="hidden min-h-11 min-w-11 px-2 font-mono text-[8px] uppercase text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)] xl:block">Grid</button>
            <button type="button" aria-pressed={snapToGrid} onClick={toggleSnap} className="hidden min-h-11 min-w-11 px-2 font-mono text-[8px] uppercase text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)] xl:block">Snap</button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden min-h-11 min-w-11 xl:inline-flex"
              disabled={!tidyTarget.enabled}
              onClick={runTidy}
            >
              Tidy
            </Button>
          </>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" className="min-h-11 min-w-11" onClick={() => setShareOpen(true)}>Share</Button>
          {api.mode === 'edit' && <Button variant="ghost" size="sm" className="hidden min-h-11 min-w-11 sm:inline-flex" onClick={() => setExportOpen(true)}>Export</Button>}
          <Button variant={api.mode === 'present' ? 'secondary' : 'ghost'} size="sm" className="min-h-11 min-w-11" onClick={api.togglePresent}>
            {api.mode === 'present' ? 'Edit' : 'Present'}
          </Button>
          {api.mode === 'edit' && (
            <BoardRoomSectionsMenu
              api={api}
              showGrid={showGrid}
              snapToGrid={snapToGrid}
              onToggleGrid={toggleGrid}
              onToggleSnap={toggleSnap}
              tidyEnabled={tidyTarget.enabled}
              onTidy={runTidy}
              onSaveTemplate={() => setTemplateOpen(true)}
            />
          )}
          <Button variant="primary" size="sm" className="min-h-11 min-w-11" disabled={api.isExiting} onClick={() => void api.requestExit()}>
            {api.isExiting ? 'Saving…' : 'Done'}
          </Button>
        </div>
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
              Dismiss reverted change
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
          {unpreparedReviewMediaCount} visual {unpreparedReviewMediaCount === 1 ? 'reference needs' : 'references need'} review-media preparation before this board can be published.
        </div>
      )}

      {dropUploadProgress && (
        <div role="status" className="relative z-40 shrink-0 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
          Uploading {dropUploadProgress}
        </div>
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
        {api.mode === 'edit' && !railCollapsed && (
          <aside className="flex max-h-48 w-full shrink-0 flex-col border-b border-[var(--border-default)] bg-[var(--bg-surface)] md:max-h-none md:w-[264px] md:border-b-0 md:border-r">
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
            />
          </aside>
        )}

        <div
          ref={workspaceRef}
          className={`relative min-h-0 flex-1 ${api.mode === 'present' ? 'overflow-y-auto sm:overflow-hidden' : 'overflow-hidden'}`}
        >
          {api.mode === 'edit' && tidySession && (
            <div
              role="group"
              aria-label="Tidy spacing"
              className="absolute left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 shadow-lg"
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
                className="min-h-8 min-w-8 rounded-full text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
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
                  className="pointer-events-none absolute bottom-3 right-3 z-40 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)] shadow-sm"
                >
                  Loading images {presentPrefetchProgress.loaded}/{presentPrefetchProgress.total}
                </div>
              )}
              {!presentPrefetchProgress && presentPrefetchResult && presentPrefetchResult.failed > 0 && (
                <div
                  role="status"
                  aria-live="polite"
                  className="absolute bottom-3 right-3 z-40 flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)] shadow-sm"
                >
                  <span>
                    {presentPrefetchResult.failed} image{presentPrefetchResult.failed === 1 ? '' : 's'} may load during presentation
                  </span>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => setPresentPrefetchResult(null)}
                    className="min-h-4 min-w-4 text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
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
              className="h-full min-h-0"
            />
          )}
          <BoardRoomInspector
            api={api}
            owner={owner}
            scopeRoomId={boardQuery.data?.project_room_id ?? boardQuery.data?.scope_room_id ?? null}
            onOpenProduct={openProduct}
            onReplaceImage={replaceImage}
          />
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {api.announcement || (api.persistenceState === 'saving' || api.persistenceState === 'dirty'
          ? 'Saving board changes'
          : api.persistenceState === 'saved'
            ? 'Board changes saved'
            : '')}
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
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        flush={api.flushPending}
      />
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
            setDropUploadProgress(`${index + 1}/${total} · ${file.name} · ${stage}`);
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
  }, [boardId, boardQuery.data?.project_room_id, owner, placeProjectProduct, resolveUrl]);

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
            dropUploadProgress={dropUploadProgress}
            externalNotice={externalNotice}
            onConsumeExternalNotice={() => setExternalNotice(null)}
          />
        );
      }}
    </BoardRoomController>
  );
}
