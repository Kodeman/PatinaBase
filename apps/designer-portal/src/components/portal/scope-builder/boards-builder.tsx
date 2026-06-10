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
  useUpsertBoard,
  useDeleteBoard,
  useProposalScopeRooms,
  type ProposalBoardSummary,
  type ProposalScopeRoom,
} from '@patina/supabase';
import { BoardEditor } from './board-editor';

// CMS surface key for the zero-boards state (probe-then-fallback, mirroring
// the FF&E board empty-state pattern).
const BOARDS_EMPTY_SURFACE_KEY = 'designer-portal/scope-builder/boards/empty';

interface BoardsBuilderProps {
  proposalId: string;
}

export function BoardsBuilder({ proposalId }: BoardsBuilderProps) {
  const { data: boards = [], isLoading } = useBoards(proposalId);
  // useProposalScopeRooms returns untyped rows (same cast as ffe-schedule-builder).
  const { data: roomsData = [] } = useProposalScopeRooms(proposalId);
  const rooms = roomsData as ProposalScopeRoom[];
  const upsertBoard = useUpsertBoard();
  const deleteBoard = useDeleteBoard();

  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const active =
    boards.find((b) => b.id === activeBoardId) ?? boards[0] ?? null;

  const handleNewBoard = useCallback(async () => {
    const result = await upsertBoard.mutateAsync({
      proposalId,
      name: `Board ${boards.length + 1}`,
      sortOrder: boards.length,
    });
    if (result?.id) setActiveBoardId(result.id);
  }, [upsertBoard, proposalId, boards.length]);

  const handleRename = useCallback(
    (boardId: string, name: string) => {
      const next = name.trim();
      if (!next) return;
      upsertBoard.mutate({ proposalId, boardId, name: next });
    },
    [upsertBoard, proposalId],
  );

  const handleLinkRoom = useCallback(
    (boardId: string, scopeRoomId: string | null) => {
      upsertBoard.mutate({ proposalId, boardId, scopeRoomId });
    },
    [upsertBoard, proposalId],
  );

  const [deleteTarget, setDeleteTarget] = useState<ProposalBoardSummary | null>(null);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteBoard.mutate({ boardId: deleteTarget.id, proposalId });
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
      <BoardList
        boards={boards}
        activeId={active?.id ?? null}
        onSelect={setActiveBoardId}
        onNew={() => void handleNewBoard()}
        onRename={handleRename}
        onDelete={setDeleteTarget}
      />

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
          {/* Room link */}
          <div className="flex flex-wrap items-center gap-3">
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
          </div>

          {/* key={id} so switching boards remounts the editor (flushes the
              previous board's pending layout saves on unmount). */}
          <BoardEditor key={active.id} proposalId={proposalId} boardId={active.id} />
        </>
      )}
    </div>
  );
}

// ─── Board list strip ────────────────────────────────────────────────────────

interface BoardListProps {
  boards: ProposalBoardSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (boardId: string, name: string) => void;
  onDelete: (board: ProposalBoardSummary) => void;
}

function BoardList({ boards, activeId, onSelect, onNew, onRename, onDelete }: BoardListProps) {
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
      <button
        onClick={onNew}
        className="rounded-md border border-dashed border-[var(--border-default)] px-3 py-2 text-sm hover:border-[var(--accent-primary)]"
      >
        + New Board
      </button>
    </div>
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
