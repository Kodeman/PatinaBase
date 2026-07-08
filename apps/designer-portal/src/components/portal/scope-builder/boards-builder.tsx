'use client';

import { useCallback, useState } from 'react';
import { Button, IconButton, Input, Select } from '@/components/ui/controls';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@patina/design-system';
import { EmptyState, useHelpContent } from '@patina/help-system';
import {
  useBoards,
  useProjectOwnedBoards,
  useUpsertBoard,
  useDuplicateBoard,
  useDeleteBoard,
  useProposalScopeRooms,
  type ProposalBoardSummary,
  type ProposalScopeRoom,
} from '@patina/supabase';
import { downloadSpecPdf } from '@/lib/scope/spec-pdf-client';
import { BoardEditor } from './board-editor';

type StatusFilter = 'active' | 'archived';

// CMS surface key for the zero-boards state (probe-then-fallback, mirroring
// the FF&E board empty-state pattern).
const BOARDS_EMPTY_SURFACE_KEY = 'designer-portal/scope-builder/boards/empty';

interface BoardsBuilderProps {
  /**
   * Owner — pass EXACTLY ONE (B8). proposalId mounts the proposal-stage builder;
   * projectId mounts the same builder on a live project-owned board (00272),
   * hiding the proposal-only affordances (linked room · duplicate).
   */
  proposalId?: string;
  projectId?: string;
}

export function BoardsBuilder({ proposalId, projectId }: BoardsBuilderProps) {
  const isProject = !!projectId;
  // Both hooks are called (hook rules); the inactive owner passes null.
  const proposalBoards = useBoards(isProject ? null : proposalId);
  const projectBoards = useProjectOwnedBoards(isProject ? projectId : null);
  const { data: boards = [], isLoading } = isProject ? projectBoards : proposalBoards;
  // Scope rooms are proposal-only; disabled (and hidden) in project mode.
  const { data: roomsData = [] } = useProposalScopeRooms(isProject ? null : proposalId);
  const rooms = roomsData as ProposalScopeRoom[];
  const upsertBoard = useUpsertBoard();
  const duplicateBoard = useDuplicateBoard();
  const deleteBoard = useDeleteBoard();

  // The owner arg for INSERTs (new board). Updates key on boardId and ignore it.
  const ownerArg = isProject ? { projectId } : { proposalId };

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const activeCount = boards.filter((b) => b.status !== 'archived').length;
  const archivedCount = boards.length - activeCount;

  // Fall back to Active whenever nothing is archived, so unarchiving the last
  // board can't strand the view on an empty Archived tab.
  const effectiveFilter: StatusFilter = archivedCount === 0 ? 'active' : statusFilter;

  // Boards matching the current filter (archived boards stay editable, behind
  // the Archived tab). The active board is chosen from the shown set so an
  // archive/unarchive that moves a board out of view falls back cleanly.
  const shown = boards.filter((b) =>
    effectiveFilter === 'archived' ? b.status === 'archived' : b.status !== 'archived',
  );
  const active = shown.find((b) => b.id === activeBoardId) ?? shown[0] ?? null;

  const handleNewBoard = useCallback(async () => {
    const result = await upsertBoard.mutateAsync({
      ...ownerArg,
      name: `Board ${activeCount + 1}`,
      sortOrder: boards.length,
    });
    if (result?.id) {
      setStatusFilter('active');
      setActiveBoardId(result.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upsertBoard, proposalId, projectId, activeCount, boards.length]);

  const handleDuplicate = useCallback(
    (boardId: string) => {
      // Duplicate is proposal-only (useDuplicateBoard inserts proposal_id).
      if (!proposalId) return;
      duplicateBoard.mutate(
        { proposalId, boardId },
        {
          onSuccess: (b) => {
            setStatusFilter('active');
            setActiveBoardId(b.id);
          },
        },
      );
    },
    [duplicateBoard, proposalId],
  );

  const handleArchiveToggle = useCallback(
    (board: ProposalBoardSummary) => {
      const next = board.status === 'archived' ? 'active' : 'archived';
      // Update path — keys on boardId; owner is ignored but passed for typing.
      upsertBoard.mutate({ ...ownerArg, boardId: board.id, status: next });
      // Leaving the current filter's view — drop the selection so `active`
      // falls back to the first still-shown board.
      if (activeBoardId === board.id) setActiveBoardId(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upsertBoard, proposalId, projectId, activeBoardId],
  );

  const handleRename = useCallback(
    (boardId: string, name: string) => {
      const next = name.trim();
      if (!next) return;
      upsertBoard.mutate({ ...ownerArg, boardId, name: next });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upsertBoard, proposalId, projectId],
  );

  const handleLinkRoom = useCallback(
    (boardId: string, scopeRoomId: string | null) => {
      // Linked room is proposal-only (FK targets proposal_scope_rooms).
      if (!proposalId) return;
      upsertBoard.mutate({ proposalId, boardId, scopeRoomId });
    },
    [upsertBoard, proposalId],
  );

  const handleExport = useCallback(
    async (board: ProposalBoardSummary) => {
      setPdfBusy(true);
      setPdfError(null);
      try {
        await downloadSpecPdf(
          { kind: 'board', ...ownerArg, boardId: board.id },
          `board-${board.name || board.id}.pdf`,
        );
      } catch (err) {
        setPdfError(err instanceof Error ? err.message : 'Could not export the board.');
      } finally {
        setPdfBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proposalId, projectId],
  );

  const [deleteTarget, setDeleteTarget] = useState<ProposalBoardSummary | null>(null);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteBoard.mutate({ boardId: deleteTarget.id, proposalId: proposalId ?? '' });
    if (activeBoardId === deleteTarget.id) setActiveBoardId(null);
    setDeleteTarget(null);
  }, [deleteBoard, proposalId, activeBoardId, deleteTarget]);

  if (isLoading) {
    return (
      <p className="text-sm text-[var(--text-muted)]">Loading boards…</p>
    );
  }

  if (boards.length === 0) {
    return <BoardsEmpty onCreate={() => void handleNewBoard()} creating={upsertBoard.isPending} />;
  }

  return (
    <div className="space-y-4">
      {archivedCount > 0 && (
        <div className="inline-flex overflow-hidden rounded-md border border-[var(--border-default)] text-xs">
          {(
            [
              ['active', `Active · ${activeCount}`],
              ['archived', `Archived · ${archivedCount}`],
            ] as Array<[StatusFilter, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={effectiveFilter === value}
              onClick={() => {
                setStatusFilter(value);
                setActiveBoardId(null);
              }}
              className={`px-3 py-1.5 transition-colors ${
                effectiveFilter === value
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <BoardList
        boards={shown}
        activeId={active?.id ?? null}
        showNew={effectiveFilter === 'active'}
        onSelect={setActiveBoardId}
        onNew={() => void handleNewBoard()}
        onRename={handleRename}
        onDelete={setDeleteTarget}
      />

      {shown.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          No {effectiveFilter} boards.
        </p>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete board</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteTarget?.name}</strong>? Its{' '}
              {deleteTarget?.item_count === 1
                ? 'item'
                : `${deleteTarget?.item_count ?? 0} items`}{' '}
              will also be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBoard.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDelete();
              }}
              disabled={deleteBoard.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBoard.isPending ? 'Deleting…' : 'Delete board'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {active && (
        <>
          {/* Board-level acts: room link · export · duplicate · archive.
              Room link + Duplicate are proposal-only (project boards have no
              proposal scope rooms, and duplicate inserts proposal_id). */}
          <div className="flex flex-wrap items-center gap-3">
            {!isProject && (
              <>
                <label
                  htmlFor="board-room-link"
                  className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]"
                >
                  Linked room
                </label>
                <Select
                  id="board-room-link"
                  value={active.scope_room_id ?? ''}
                  onChange={(e) => handleLinkRoom(active.id, e.target.value || null)}
                  wrapperClassName="w-auto"
                >
                  <option value="">Whole home (no room)</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={pdfBusy}
                onClick={() => void handleExport(active)}
              >
                {pdfBusy ? 'Exporting…' : 'Export PDF'}
              </Button>
              {!isProject && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={duplicateBoard.isPending}
                  onClick={() => handleDuplicate(active.id)}
                >
                  {duplicateBoard.isPending ? 'Duplicating…' : 'Duplicate'}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => handleArchiveToggle(active)}>
                {active.status === 'archived' ? 'Unarchive' : 'Archive'}
              </Button>
            </div>
          </div>

          {pdfError && (
            <p className="text-xs text-[var(--color-clay,#a5552f)]" role="alert">
              {pdfError}
            </p>
          )}

          {/* key={id} so switching boards remounts the editor (flushes the
              previous board's pending layout saves on unmount). */}
          <BoardEditor
            key={active.id}
            proposalId={isProject ? undefined : proposalId}
            projectId={projectId}
            boardId={active.id}
          />
        </>
      )}
    </div>
  );
}

// ─── Board list strip ────────────────────────────────────────────────────────

interface BoardListProps {
  boards: ProposalBoardSummary[];
  activeId: string | null;
  showNew: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (boardId: string, name: string) => void;
  onDelete: (board: ProposalBoardSummary) => void;
}

function BoardList({ boards, activeId, showNew, onSelect, onNew, onRename, onDelete }: BoardListProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  const commitRename = (boardId: string) => {
    onRename(boardId, nameDraft);
    setRenamingId(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {boards.map((b) => (
        <div
          key={b.id}
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            b.id === activeId
              ? 'border-[var(--accent-primary)] bg-[var(--bg-surface)]'
              : 'border-[var(--border-default)] bg-[var(--bg-muted)]'
          }`}
        >
          <BoardCoverThumb board={b} />
          {renamingId === b.id ? (
            <Input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => commitRename(b.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(b.id);
                if (e.key === 'Escape') setRenamingId(null);
              }}
              className="h-7 w-36"
              aria-label="Board name"
            />
          ) : (
            <button onClick={() => onSelect(b.id)} className="font-medium">
              {b.name}
            </button>
          )}
          <span className="font-mono text-[0.6rem] text-[var(--text-muted)]">
            {b.item_count} item{b.item_count === 1 ? '' : 's'}
          </span>
          {b.id === activeId && renamingId !== b.id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRenamingId(b.id);
                setNameDraft(b.name);
              }}
            >
              Rename
            </Button>
          )}
          <IconButton
            label="Delete board"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(b)}
          >
            ×
          </IconButton>
        </div>
      ))}
      {showNew && (
        <button
          onClick={onNew}
          className="rounded-md border border-dashed border-[var(--border-default)] px-3 py-2 text-sm hover:border-[var(--accent-primary)]"
        >
          + New Board
        </button>
      )}
    </div>
  );
}

/**
 * Board-list thumbnail: the set cover, else the first image item on the board,
 * else a monogram of the board name's first letter.
 */
function BoardCoverThumb({ board }: { board: ProposalBoardSummary }) {
  const src = board.cover_image_url ?? board.cover_fallback_url ?? null;
  if (src) {
    return (
      <span className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-sm bg-[var(--bg-muted)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm bg-[var(--bg-muted)] font-display text-xs text-[var(--text-muted)]"
    >
      {board.name.trim().charAt(0).toUpperCase() || 'B'}
    </span>
  );
}

// ─── Empty state (CMS probe → fallback copy) ─────────────────────────────────

function BoardsEmpty({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  const { data, isLoading } = useHelpContent(BOARDS_EMPTY_SURFACE_KEY, 'emptyState');

  return (
    <div className="rounded-md border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-10 text-center">
      {!isLoading && data ? (
        <EmptyState surfaceKey={BOARDS_EMPTY_SURFACE_KEY} />
      ) : (
        <>
          <h4 className="font-display text-lg">No mood boards yet</h4>
          <p className="mx-auto mt-1 max-w-md type-body-small text-[var(--text-muted)]">
            Boards are freeform canvases for products, captures, palettes, room scans, and
            notes — one per room, or one for the whole home.
          </p>
        </>
      )}
      <div className="mt-4">
        <Button variant="primary" onClick={onCreate} disabled={creating}>
          {creating ? 'Creating…' : 'Create your first board'}
        </Button>
      </div>
    </div>
  );
}
