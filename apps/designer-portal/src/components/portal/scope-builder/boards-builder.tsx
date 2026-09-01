'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';
import {
  useBoards,
  useProjectOwnedBoards,
  useUpsertBoard,
  type ProposalBoardSummary,
} from '@patina/supabase';
import type { BoardOwnerRef } from '@patina/types';
import { Button } from '@/components/ui/controls';
import { boardRoomHref } from '@/lib/mood-board/navigation';
import { moodBoardEvents } from '@/lib/analytics/mood-board-events';
import { BoardVerdictSummary } from '@/components/mood-board/board-verdict-summary';
import { BoardCoverArt } from '@/components/mood-board/board-cover-art';
import { BoardCreatePickerDialog } from './board-create-picker-dialog';

interface BoardsBuilderProps {
  /** Pass exactly one owner. Both legs launch the same dedicated board room. */
  proposalId?: string;
  projectId?: string;
}

function BoardCover({ board }: { board: ProposalBoardSummary }) {
  return (
    <BoardCoverArt
      name={board.name}
      coverUrl={board.cover_image_url}
      fallbackUrls={
        board.cover_fallback_urls ?? (board.cover_fallback_url ? [board.cover_fallback_url] : [])
      }
      className="h-[112px]"
    />
  );
}

/**
 * The drafting facet is now a launcher, never an embedded editor. This keeps
 * the proposal page calm and makes every board open through the one canonical
 * full-viewport room.
 */
export function BoardsBuilder({ proposalId, projectId }: BoardsBuilderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isProject = Boolean(projectId);
  const owner: BoardOwnerRef | null = projectId
    ? { kind: 'project', id: projectId }
    : proposalId
      ? { kind: 'proposal', id: proposalId }
      : null;

  // Hook order stays stable across owner kinds; the inactive query is disabled.
  const proposalBoards = useBoards(isProject ? null : proposalId);
  const projectBoards = useProjectOwnedBoards(isProject ? projectId : null);
  const boardsQuery = isProject ? projectBoards : proposalBoards;
  const boards = (boardsQuery.data ?? []).filter((board) => board.status !== 'archived');
  const archivedCount = (boardsQuery.data ?? []).length - boards.length;

  const unarchiveBoard = useUpsertBoard();
  const [pickerOpen, setPickerOpen] = useState(false);
  const draftingTouchRecorded = useRef(false);

  // IA-7 — archived boards had no "view archived" affordance anywhere; the
  // count rendered as plain text and archived rows were unreachable.
  const archivedBoards = (boardsQuery.data ?? []).filter((board) => board.status === 'archived');
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);
  const [unarchiveError, setUnarchiveError] = useState<string | null>(null);

  // FacetSection lazy-mounts this launcher on the first real visit. Emit one
  // explicit event after its active-board read settles so M1 has a durable,
  // session-deduplicatable denominator instead of relying on autocapture.
  // Empty-state visits intentionally count: opening the board surface to start
  // a first board is a real adoption opportunity; `has_board` keeps the two
  // cohorts independently queryable.
  useEffect(() => {
    if (
      !proposalId ||
      boardsQuery.isLoading ||
      boardsQuery.isError ||
      draftingTouchRecorded.current
    ) return;
    draftingTouchRecorded.current = true;
    moodBoardEvents.draftingTouched({
      proposal_id: proposalId,
      board_count: boards.length,
      has_board: boards.length > 0,
      surface: 'drafting_facet',
      touch_type: 'facet_visit',
    });
  }, [boards.length, boardsQuery.isError, boardsQuery.isLoading, proposalId]);

  const source = isProject ? 'project_surface' : 'drafting_strip';
  const hrefFor = (boardId: string) =>
    boardRoomHref({ boardId, from: pathname, source });

  // DV3 — a template materialized onto a project board strips owner links
  // from every product pin; `materialized=template` flags the room to offer
  // a one-shot bulk "Promote all" right on arrival.
  const handleCreated = (boardId: string, meta: { materialized: boolean }) => {
    const href =
      meta.materialized && owner?.kind === 'project'
        ? `${hrefFor(boardId)}&materialized=template`
        : hrefFor(boardId);
    router.push(href);
  };

  const handleUnarchive = async (boardId: string) => {
    setUnarchiveError(null);
    setUnarchivingId(boardId);
    try {
      // IA-7 — only proposal-owned boards can flip status back directly;
      // project-owned board writes are RPC-only (guard_project_board_rpc_
      // mutation, 00436) and apply_board_room_state carries no status field,
      // so there is no backend path for a project-owned unarchive today.
      // The archived list stays read-only for that leg (no button renders).
      await unarchiveBoard.mutateAsync({ boardId, status: 'active' });
    } catch (cause) {
      setUnarchiveError(
        cause instanceof Error ? cause.message : 'This board could not be restored.',
      );
    } finally {
      setUnarchivingId(null);
    }
  };

  if (!owner) {
    return <p className="text-sm text-[var(--text-muted)]">The board owner is unavailable.</p>;
  }

  if (boardsQuery.isLoading) {
    return (
      <div aria-label="Loading mood boards" className="flex gap-3 overflow-hidden">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            aria-hidden
            className="h-[174px] w-[210px] shrink-0 animate-pulse rounded-[5px] bg-[var(--bg-muted)] motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[12px] text-[var(--text-muted)]">
            Open a board in its room to compose, present, share, and export.
          </p>
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setArchivedOpen(true)}
              className="mt-1 min-h-6 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-primary)]"
            >
              {archivedCount} archived
            </button>
          )}
        </div>
        <Button variant="primary" size="sm" onClick={() => setPickerOpen(true)}>
          New board
        </Button>
      </div>

      {boards.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {boards.map((board) => (
            <Link
              key={board.id}
              href={hrefFor(board.id)}
              className="group w-[210px] shrink-0 overflow-hidden rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-surface)] transition-colors hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
              aria-label={`Open mood board ${board.name}`}
            >
              <BoardCover board={board} />
              <div className="px-3 py-2.5">
                <p className="truncate font-heading text-[14px] text-[var(--text-primary)]">
                  {board.name}
                </p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                  {board.item_count} {board.item_count === 1 ? 'piece' : 'pieces'} · Open room
                </p>
                <BoardVerdictSummary counts={board.verdict_counts} className="mt-2" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="w-full rounded-[5px] border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-9 text-center transition-colors hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
        >
          <span className="block font-heading text-[16px] text-[var(--text-primary)]">
            Start the first mood board
          </span>
          <span className="mt-1 block text-[12px] text-[var(--text-muted)]">
            Begin blank or use a Patina or studio template.
          </span>
        </button>
      )}

      <BoardCreatePickerDialog
        owner={owner}
        boardsCount={boards.length}
        sortOrderSeed={(boardsQuery.data ?? []).length}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onCreated={handleCreated}
      />

      <Dialog open={archivedOpen} onOpenChange={setArchivedOpen}>
        <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Archived boards</DialogTitle>
            <DialogDescription>
              {isProject
                ? 'Read-only for now — restoring a project-owned board needs a backend path that does not exist yet.'
                : 'Archiving is a one-way door in the boards list; restore one from here.'}
            </DialogDescription>
          </DialogHeader>

          {archivedBoards.length === 0 ? (
            <p className="mt-2 text-[12px] text-[var(--text-muted)]">No archived boards.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {archivedBoards.map((board) => (
                <li
                  key={board.id}
                  className="flex items-center gap-3 rounded-[5px] border border-[var(--border-default)] p-2"
                >
                  <div className="h-12 w-16 shrink-0 overflow-hidden rounded-[3px]">
                    <BoardCover board={board} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-heading text-[13px] text-[var(--text-primary)]">
                      {board.name}
                    </p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      {/* proposal_boards has no dedicated archived_at column;
                          updated_at is the best available proxy for "when". */}
                      Archived · {new Date(board.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  {!isProject && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={unarchivingId === board.id}
                      onClick={() => void handleUnarchive(board.id)}
                    >
                      {unarchivingId === board.id ? 'Restoring…' : 'Unarchive'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {unarchiveError && (
            <p role="alert" className="mt-2 text-[12px] text-[var(--color-clay-ink)]">
              {unarchiveError}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
