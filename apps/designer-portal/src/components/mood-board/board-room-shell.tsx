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
  useBoardFeedback,
  useProject,
  useProposal,
  useUpsertBoard,
  type ItemFeedback,
} from '@patina/supabase';
import { Button, Input } from '@/components/ui/controls';
import {
  BoardRoomController,
  type BoardRoomControllerApi,
  type BoardRoomCommandCommittedEvent,
  type BoardRoomUrlPasteControls,
} from '@/components/portal/scope-builder/board-room-controller';
import {
  BOARD_ROOM_CLIPBOARD_MIME,
  parseBoardRoomClipboard,
} from '@/components/portal/scope-builder/board-room-command-engine';
import { verdictChipSpec } from '@/lib/document/verdict-chip';
import { moodBoardEvents } from '@/lib/analytics/mood-board-events';
import {
  moodBoardOpenSource,
  resolveMoodBoardReturnTarget,
} from '@/lib/mood-board/navigation';
import { useMoodBoardUrlUnfurl } from '@/hooks/use-mood-board-url-unfurl';
import {
  buildMoodBoardUrlFallbackNote,
  buildMoodBoardUrlPlaceholder,
  buildResolvedMoodBoardUrlItem,
} from '@/lib/mood-board/url-unfurl';
import { generateAndUploadMoodBoardCover } from '@/lib/mood-board-assets/board-cover';
import { BoardAddRail, uploadFilesAsBoardItems, type BoardAddSource } from './board-add-rail';
import { BoardRoomInspector } from './board-room-inspector';
import { BoardRoomSectionsMenu } from './board-room-sections-menu';
import { BoardShareDialog } from './board-share-dialog';
import { BoardExportDialog } from './board-export-dialog';
import { BoardTemplateDialog } from './board-template-dialog';

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

/** Route-level scroll isolation; Radix dialogs own their portal focus traps. */
function useBoardRoomBoundary(ref: MutableRefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    if (scrollbar > 0) {
      const padding = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${padding + scrollbar}px`;
    }
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => root.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
    };
  }, [ref]);
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
      className="h-9 min-w-[120px] border-transparent bg-transparent px-1 font-heading text-[15px] hover:border-[var(--border-default)] focus:border-[var(--color-clay)]"
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

function BoardRoomSurface({
  api,
  owner,
  source,
  returnTarget,
  exitHandlerRef,
  deleteGuardRef,
  metricsRef,
}: {
  api: BoardRoomControllerApi;
  owner: BoardOwnerRef;
  source: ReturnType<typeof moodBoardOpenSource>;
  returnTarget: string;
  exitHandlerRef: MutableRefObject<(() => Promise<void>) | null>;
  deleteGuardRef: MutableRefObject<((items: readonly EditableMoodBoardItem[]) => boolean) | null>;
  metricsRef: MutableRefObject<SessionMetrics>;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const upsertBoard = useUpsertBoard();
  const proposalQuery = useProposal(owner.kind === 'proposal' ? owner.id : '');
  const projectQuery = useProject(owner.kind === 'project' ? owner.id : '');
  const feedbackQuery = useBoardFeedback(owner.kind === 'proposal' ? owner.id : undefined);
  const feedback = feedbackQuery.data ?? [];
  const feedbackByItem = useMemo(() => latestFeedback(feedback), [feedback]);
  const openedRef = useRef(false);
  const startedAtRef = useRef(performance.now());
  const presentStartedRef = useRef<number | null>(null);
  const previousModeRef = useRef(api.mode);
  const coverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstCoverSignatureRef = useRef<string | null>(null);
  const lastCoverSignatureRef = useRef<string | null>(null);
  const coverInFlightRef = useRef<Promise<void> | null>(null);
  const latestApiRef = useRef(api);
  const upsertCoverRef = useRef(upsertBoard.mutateAsync);
  latestApiRef.current = api;
  upsertCoverRef.current = upsertBoard.mutateAsync;

  useBoardRoomBoundary(rootRef);

  useEffect(() => {
    try {
      setRailCollapsed(window.localStorage.getItem(RAIL_COLLAPSED_KEY) === 'true');
      setShowGrid(window.localStorage.getItem(GRID_VISIBLE_KEY) === 'true');
      setSnapToGrid(window.localStorage.getItem(SNAP_TO_GRID_KEY) === 'true');
    } catch {
      // Local persistence is optional.
    }
  }, []);

  const toggleRail = () => {
    setRailCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(RAIL_COLLAPSED_KEY, String(next));
      } catch {
        // Keep the current-session preference.
      }
      return next;
    });
  };

  const toggleGrid = () => {
    setShowGrid((current) => {
      const next = !current;
      try { window.localStorage.setItem(GRID_VISIBLE_KEY, String(next)); } catch { /* optional */ }
      return next;
    });
  };
  const toggleSnap = () => {
    setSnapToGrid((current) => {
      const next = !current;
      try { window.localStorage.setItem(SNAP_TO_GRID_KEY, String(next)); } catch { /* optional */ }
      return next;
    });
  };

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
      });
      presentStartedRef.current = null;
    }
  }, [api.mode, api.state]);

  const input = useMemo(() => boardRasterInput(api), [api]);
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
    const latestApi = latestApiRef.current;
    const latestInput = boardRasterInput(latestApi);
    const signature = latestApi.state ? JSON.stringify({
      canvasWidth: latestApi.state.canvasWidth,
      canvasHeight: latestApi.state.canvasHeight,
      backgroundColor: latestApi.state.backgroundColor,
      sections: latestApi.state.sections,
      items: latestApi.state.items,
    }) : null;
    if (!latestInput || !latestApi.state || !signature) return;
    if (!force && signature === lastCoverSignatureRef.current) return;
    if (coverInFlightRef.current) await coverInFlightRef.current;
    if (!force && signature === lastCoverSignatureRef.current) return;
    const coverOwner: BoardOwnerRef = { kind: owner.kind, id: owner.id };
    const task = (async () => {
      const generated = await generateAndUploadMoodBoardCover({
        ownerId: coverOwner.id,
        boardId: latestApi.state!.boardId,
        input: latestInput,
      });
      await upsertCoverRef.current({
        boardId: latestApi.state!.boardId,
        owner: coverOwner,
        coverImageUrl: generated.url,
      });
      lastCoverSignatureRef.current = signature;
    })();
    coverInFlightRef.current = task;
    try {
      await task;
    } catch (error) {
      // Covers are a derived convenience. Composition persistence remains authoritative.
      console.warn('Mood-board cover generation failed', error);
    } finally {
      if (coverInFlightRef.current === task) coverInFlightRef.current = null;
    }
  }, [owner.id, owner.kind]);

  useEffect(() => {
    if (!coverSignature) return;
    if (firstCoverSignatureRef.current === null) {
      firstCoverSignatureRef.current = coverSignature;
      return;
    }
    if (coverTimerRef.current) clearTimeout(coverTimerRef.current);
    coverTimerRef.current = setTimeout(() => void writeCover(), 30_000);
    return () => {
      if (coverTimerRef.current) clearTimeout(coverTimerRef.current);
      coverTimerRef.current = null;
    };
  }, [coverSignature, writeCover]);

  const finishPresentation = useCallback(() => {
    if (presentStartedRef.current === null || !api.state) return;
    moodBoardEvents.presented({
      board_id: api.state.boardId,
      item_count: api.state.items.length,
      section_count: api.state.sections.length,
      surface: 'room',
      duration_ms: Math.max(0, Math.round(performance.now() - presentStartedRef.current)),
    });
    presentStartedRef.current = null;
  }, [api.state]);

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

  const tidyBoard = () => {
    api.tidy();
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
          <label className="hidden items-center gap-1.5 text-[10px] text-[var(--text-muted)] sm:flex">
            <input type="checkbox" checked={api.showNotes} onChange={(event) => api.setShowNotes(event.target.checked)} />
            Notes
          </label>
        ) : (
          <>
            <button type="button" onClick={toggleRail} className="hidden min-h-11 px-2 font-mono text-[9px] uppercase text-[var(--text-muted)] md:block">
              {railCollapsed ? 'Sources' : 'Hide sources'}
            </button>
            <button type="button" disabled={!api.canUndo} onClick={api.undo} className="hidden min-h-11 px-2 text-sm disabled:opacity-30 sm:block" aria-label="Undo">↶</button>
            <button type="button" disabled={!api.canRedo} onClick={api.redo} className="hidden min-h-11 px-2 text-sm disabled:opacity-30 sm:block" aria-label="Redo">↷</button>
            <span className="hidden min-w-10 text-center font-mono text-[9px] tabular-nums text-[var(--text-muted)] lg:block">{Math.round(api.view.zoom * 100)}%</span>
            <Button variant="ghost" size="sm" className="hidden lg:inline-flex" onClick={fit}>Fit</Button>
            <button type="button" aria-pressed={showGrid} onClick={toggleGrid} className="hidden min-h-11 px-2 font-mono text-[8px] uppercase text-[var(--text-muted)] xl:block">Grid</button>
            <button type="button" aria-pressed={snapToGrid} onClick={toggleSnap} className="hidden min-h-11 px-2 font-mono text-[8px] uppercase text-[var(--text-muted)] xl:block">Snap</button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden xl:inline-flex"
              onClick={tidyBoard}
            >
              Tidy
            </Button>
          </>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setShareOpen(true)}>Share</Button>
          {api.mode === 'edit' && <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => setExportOpen(true)}>Export</Button>}
          <Button variant={api.mode === 'present' ? 'secondary' : 'ghost'} size="sm" onClick={api.togglePresent}>
            {api.mode === 'present' ? 'Edit' : 'Present'}
          </Button>
          <BoardRoomSectionsMenu
            api={api}
            showGrid={showGrid}
            snapToGrid={snapToGrid}
            onToggleGrid={toggleGrid}
            onToggleSnap={toggleSnap}
            onTidy={tidyBoard}
            onSaveTemplate={() => setTemplateOpen(true)}
          />
          <Button variant="primary" size="sm" disabled={api.isExiting} onClick={() => void api.requestExit()}>
            {api.isExiting ? 'Saving…' : 'Done'}
          </Button>
        </div>
      </header>

      {(surfaceError || api.persistenceError) && (
        <div role="alert" className="relative z-40 flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-clay)] bg-[var(--bg-surface)] px-4 py-2 text-[11px] text-[var(--color-clay)]">
          <span>{surfaceError ?? api.persistenceError}</span>
          <button
            type="button"
            className="min-h-9 shrink-0 font-mono text-[9px] uppercase"
            onClick={() => {
              setSurfaceError(null);
              api.discardPersistenceError();
            }}
          >
            Dismiss reverted change
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {api.mode === 'edit' && !railCollapsed && (
          <aside className="flex max-h-48 w-full shrink-0 flex-col border-b border-[var(--border-default)] bg-[var(--bg-surface)] md:max-h-none md:w-[264px] md:border-b-0 md:border-r">
            <BoardAddRail
              owner={owner}
              boardId={state.boardId}
              items={state.items}
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
          {api.mode === 'present' ? (
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
          <BoardRoomInspector api={api} />
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
  const exitHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const deleteGuardRef = useRef<((items: readonly EditableMoodBoardItem[]) => boolean) | null>(null);
  const unfurl = useMoodBoardUrlUnfurl();
  const metricsRef = useRef<SessionMetrics>({
    commands: 0,
    usedUndo: false,
    usedMultiselect: false,
    usedTidy: false,
    usedHandles: false,
  });

  const observeCommand = useCallback(({ command, direction }: BoardRoomCommandCommittedEvent) => {
    metricsRef.current.commands += 1;
    if (direction === 'undo') metricsRef.current.usedUndo = true;
    if (command.kind === 'tidy') metricsRef.current.usedTidy = true;
    if (command.kind === 'resize' || command.kind === 'rotate') {
      metricsRef.current.usedHandles = true;
    }
    if (
      direction === 'apply' &&
      ['tidy', 'align', 'distribute'].includes(command.kind)
    ) {
      moodBoardEvents.arranged({
        board_id: boardId,
        scope: command.touches.length > 0 && command.touches.length < command.after.items.length
          ? 'selection'
          : 'board',
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
      const items = await uploadFilesAsBoardItems({
        ownerId: owner.id,
        boardId,
        files: commit.files,
        point: { x: commit.point.x - 140, y: commit.point.y - 100 },
        startZ,
      });
      return items;
    }
    const railEnvelope = commit.dataTransfer.getData(BOARD_ROOM_CLIPBOARD_MIME);
    if (railEnvelope) {
      const parsed = parseBoardRoomClipboard(railEnvelope);
      const lead = parsed?.items[0]?.item;
      if (!parsed || !lead) return;
      const height = lead.height ?? lead.width * (lead.type === 'image' || lead.type === 'room_scan' ? 0.72 : 1.15);
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
  }, [boardId, owner.id, resolveUrl]);

  const pasteImages = useCallback(async (files: readonly File[], point: BoardPoint) => {
    const api = apiRef.current;
    if (!api?.state) return [];
    const startZ = Math.max(-1, ...api.state.items.map((item) => item.zIndex ?? 0)) + 1;
    const items = await uploadFilesAsBoardItems({
      ownerId: owner.id,
      boardId,
      files,
      point: { x: point.x - 140, y: point.y - 100 },
      startZ,
    });
    return items;
  }, [boardId, owner.id]);

  return (
    <BoardRoomController
      owner={owner}
      boardId={boardId}
      onExit={() => exitHandlerRef.current?.()}
      onItemsDropped={dropped}
      onPasteImages={pasteImages}
      onPasteUrl={resolveUrl}
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
          />
        );
      }}
    </BoardRoomController>
  );
}
