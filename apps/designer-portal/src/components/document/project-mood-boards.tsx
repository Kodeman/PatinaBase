'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BoardComposition } from '@patina/design-system';
import {
  useContinueBoardInProject,
  useCreateProjectBoard,
  useProjectBoards,
  useProjectFFEItems,
  useProjectFfeReadiness,
  useProjectReviewAttention,
  useProjectOwnedBoards,
  type ProjectBoard,
  type ProposalBoardSummary,
} from '@patina/supabase';
import type { MoodBoardSection } from '@patina/types';
import { boardRoomHref } from '@/lib/mood-board/navigation';
import { moodBoardEvents } from '@/lib/analytics/mood-board-events';
import { BoardCoverArt } from '@/components/mood-board/board-cover-art';
import { ffeEvents } from '@/lib/analytics/ffe-events';
import { DocumentAction } from './document-action';

type LiveBoardWithLineage = ProposalBoardSummary & {
  source_project_board_id?: string | null;
};

type FrozenBoardWithSections = ProjectBoard & {
  sections?: MoodBoardSection[];
};

interface ContinueItem {
  key: string;
  label: string;
  detail: string;
  href?: string;
  action?: () => void;
}

const EMPTY_LIVE_BOARDS: readonly LiveBoardWithLineage[] = [];
const EMPTY_FROZEN_BOARDS: readonly FrozenBoardWithSections[] = [];

function roomHref(boardId: string, pathname: string) {
  return boardRoomHref({
    boardId,
    from: pathname,
    source: 'project_surface',
  });
}

/**
 * Project-stage continuity surface: live boards remain editable in the room,
 * while signed snapshots stay visibly frozen and can be continued exactly
 * once through the idempotent database RPC.
 */
export function ProjectMoodBoards({
  projectId,
  rooms = [],
  canCreate = true,
}: {
  projectId: string;
  rooms?: Array<{ id: string; name: string }>;
  canCreate?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const liveQuery = useProjectOwnedBoards(projectId);
  const frozenQuery = useProjectBoards(projectId);
  const selectionsQuery = useProjectFFEItems(projectId);
  const activeSelectionRows = useMemo(
    () => ((selectionsQuery.data ?? []) as Array<Record<string, unknown>>)
      .filter((row) => row.removed_at == null)
      .filter((row) => !['not_selected', 'superseded'].includes(String(row.design_disposition))),
    [selectionsQuery.data],
  );
  const readinessQuery = useProjectFfeReadiness(
    activeSelectionRows.map((row) => String(row.id)),
  );
  const attentionQuery = useProjectReviewAttention(projectId);
  const continueBoard = useContinueBoardInProject();
  const createBoard = useCreateProjectBoard();
  const [continuingId, setContinuingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [boardName, setBoardName] = useState('');
  const [boardRoomId, setBoardRoomId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const liveBoards = useMemo(
    () => ((liveQuery.data ?? EMPTY_LIVE_BOARDS) as LiveBoardWithLineage[])
      .filter((board) => board.status !== 'archived'),
    [liveQuery.data],
  );
  const frozenBoards = (frozenQuery.data ?? EMPTY_FROZEN_BOARDS) as FrozenBoardWithSections[];
  const continuedBySnapshot = useMemo(
    () =>
      new Map(
        liveBoards.flatMap((board) =>
          board.source_project_board_id
            ? ([[board.source_project_board_id, board]] as const)
            : [],
        ),
      ),
    [liveBoards],
  );

  const isLoading = liveQuery.isLoading || frozenQuery.isLoading || selectionsQuery.isLoading ||
    readinessQuery.isLoading || attentionQuery.isLoading;

  const continueItems = useMemo<ContinueItem[]>(() => {
    const rows = activeSelectionRows;
    const result: ContinueItem[] = [];
    const attention = attentionQuery.data?.[0];
    if (attention) {
      result.push({
        key: `feedback:${attention.feedbackId}`,
        label: attention.verdict === 'rejected'
          ? 'Continue a client-requested change'
          : 'Answer a client question',
        detail: 'Open the selection from its latest published review.',
        href: `#ffe-selection-${attention.selectionId}`,
      });
    }
    const unsorted = rows
      .filter((row) => row.assignment_scope === 'unassigned')
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
    if (unsorted) {
      result.push({
        key: `unsorted:${String(unsorted.id)}`,
        label: 'Route the oldest Unsorted selection',
        detail: 'Choose a room, Throughout, or a compatible board.',
        href: `#ffe-selection-${String(unsorted.id)}`,
      });
    }
    const lastBoard = [...liveBoards].sort((a, b) =>
      String(b.updated_at).localeCompare(String(a.updated_at)),
    )[0];
    if (lastBoard) {
      result.push({
        key: `board:${lastBoard.id}`,
        label: `Continue ${lastBoard.name}`,
        detail: `${lastBoard.item_count} ${lastBoard.item_count === 1 ? 'piece' : 'pieces'} · working board`,
        href: roomHref(lastBoard.id, pathname),
      });
    }
    const readiness = new Map(
      (readinessQuery.data ?? []).map((row) => [row.selectionId, row]),
    );
    const releaseGap = rows
      .filter((row) => row.design_disposition === 'selected')
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .find((row) => readiness.get(String(row.id))?.ready === false);
    if (releaseGap) {
      result.push({
        key: `readiness:${String(releaseGap.id)}`,
        label: 'Complete a release-blocking specification',
        detail: 'Resolve the oldest selected line that is not ready for authorization.',
        href: `#ffe-selection-${String(releaseGap.id)}`,
      });
    }
    if (canCreate && rows.length === 0 && liveBoards.length === 0) {
      result.push({
        key: 'first-add',
        label: 'Make the first project selection',
        detail: 'Browse the Library, paste a link, or name a need.',
        action: () => window.dispatchEvent(new CustomEvent('document:open-add-to-project', { detail: { source: 'empty_state' } })),
      });
    }
    return result.slice(0, 3);
  }, [activeSelectionRows, attentionQuery.data, canCreate, liveBoards, pathname, readinessQuery.data]);

  useEffect(() => {
    const openCreator = () => { if (canCreate) setCreating(true); };
    window.addEventListener('document:new-project-board', openCreator);
    return () => window.removeEventListener('document:new-project-board', openCreator);
  }, [canCreate]);
  if (isLoading) {
    return (
      <section aria-label="Mood boards" className="mt-9 border-t border-[var(--color-pearl)] pt-6">
        <div className="h-24 animate-pulse rounded-[5px] bg-[var(--bg-muted)] motion-reduce:animate-none" />
      </section>
    );
  }

  if (liveQuery.isError || frozenQuery.isError || selectionsQuery.isError ||
      readinessQuery.isError || attentionQuery.isError) {
    return (
      <section aria-labelledby="project-mood-boards" className="mt-9 border-t border-[var(--color-pearl)] pt-6">
        <h2 id="project-mood-boards" className="font-heading text-[16px] text-[var(--color-charcoal)]">
          Mood boards
        </h2>
        <p role="alert" className="mt-2 text-[12px] text-[var(--color-clay)]">
          The project&apos;s mood boards could not be read.
        </p>
      </section>
    );
  }

  const handleContinue = async (snapshot: FrozenBoardWithSections) => {
    const existing = continuedBySnapshot.get(snapshot.id);
    if (existing) {
      router.push(roomHref(existing.id, pathname));
      return;
    }

    setContinuingId(snapshot.id);
    setError(null);
    try {
      const boardId = await continueBoard.mutateAsync({
        projectBoardId: snapshot.id,
        projectId,
      });
      moodBoardEvents.projectBoardContinued({
        project_id: projectId,
        source_board_id: snapshot.source_board_id ?? snapshot.id,
        new_board_id: boardId,
      });
      router.push(roomHref(boardId, pathname));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'This board could not be continued in the project.',
      );
    } finally {
      setContinuingId(null);
    }
  };

  const handleCreate = async () => {
    const name = boardName.trim() || `Board ${liveBoards.length + 1}`;
    setError(null);
    try {
      const boardId = await createBoard.mutateAsync({
        projectId,
        name,
        roomId: boardRoomId || null,
      });
      setBoardName('');
      setBoardRoomId('');
      setCreating(false);
      router.push(roomHref(boardId, pathname));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The board could not be created.');
      ffeEvents.failed({ project_id: projectId, operation: 'create_board', reason_code: 'rpc_error' });
    }
  };

  return (
    <section aria-labelledby="project-mood-boards" className="mt-9 border-t border-[var(--color-pearl)] pt-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 id="project-mood-boards" className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">
            Working boards
          </h2>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Compose references and project selections before publishing a review.
          </p>
        </div>
        <span className="flex items-center gap-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            {liveBoards.length} live · {frozenBoards.length} frozen
          </span>
          {canCreate && (
            <DocumentAction actionKey="new-project-board" surfaceKey="project" regionKey="working-boards" variant="primary" onClick={() => setCreating(true)}>
              New board
            </DocumentAction>
          )}
        </span>
      </div>

      {continueItems.length > 0 && (
        <div aria-label="Continue project FF&E work" className="mt-4 border-y border-[var(--color-pearl)]">
          {continueItems.map((item) => {
            const body = (
              <>
                <span className="font-heading text-[13px] text-[var(--color-charcoal)]">{item.label}</span>
                <span className="text-[10.5px] text-[var(--text-muted)]">{item.detail}</span>
                <span aria-hidden className="ml-auto text-[var(--color-clay)]">→</span>
              </>
            );
            return item.href ? (
              <Link key={item.key} href={item.href} className="flex min-h-12 items-center gap-3 border-b border-[var(--color-pearl)] py-2 last:border-b-0">{body}</Link>
            ) : (
              <button key={item.key} type="button" onClick={item.action} className="flex min-h-12 w-full items-center gap-3 border-b border-[var(--color-pearl)] py-2 text-left last:border-b-0">{body}</button>
            );
          })}
        </div>
      )}

      {canCreate && creating && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-y border-[var(--color-pearl)] py-3">
          <input
            autoFocus
            value={boardName}
            onChange={(event) => setBoardName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleCreate();
              if (event.key === 'Escape') setCreating(false);
            }}
            aria-label="Board name"
            placeholder={`Board ${liveBoards.length + 1}`}
            className="min-h-11 min-w-0 flex-1 rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-3 text-[13px] outline-none focus:border-[var(--color-clay)]"
          />
          <select
            value={boardRoomId}
            onChange={(event) => setBoardRoomId(event.target.value)}
            aria-label="Board room"
            className="min-h-11 rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-3 text-[13px] outline-none focus:border-[var(--color-clay)]"
          >
            <option value="">Project-wide</option>
            {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select>
          <DocumentAction actionKey="create-project-board" surfaceKey="project" regionKey="working-boards" variant="primary" loading={createBoard.isPending} onClick={() => void handleCreate()}>
            Start board
          </DocumentAction>
          <DocumentAction actionKey="cancel-project-board" surfaceKey="project" regionKey="working-boards" variant="tertiary" onClick={() => setCreating(false)}>
            Put back
          </DocumentAction>
        </div>
      )}

      {liveBoards.length > 0 && (
        <div className="mt-5">
          <h3 className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Working boards
          </h3>
          <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
            {liveBoards.map((board) => {
              return (
                <Link
                  key={board.id}
                  href={roomHref(board.id, pathname)}
                  className="group w-[184px] shrink-0 overflow-hidden rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
                  aria-label={`Open live mood board ${board.name}`}
                >
                  <BoardCoverArt
                    name={board.name}
                    coverUrl={board.cover_image_url}
                    fallbackUrls={
                      board.cover_fallback_urls ??
                      (board.cover_fallback_url ? [board.cover_fallback_url] : [])
                    }
                    className="h-[92px]"
                  />
                  <div className="px-3 py-2.5">
                    <p className="truncate font-heading text-[14px] text-[var(--text-primary)]">
                      {board.name}
                    </p>
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      {board.item_count} {board.item_count === 1 ? 'piece' : 'pieces'} · Open room
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {canCreate && liveBoards.length === 0 && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-5 w-full rounded-[5px] border border-dashed border-[var(--border-default)] px-6 py-8 text-center hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
        >
          <span className="block font-heading text-[15px] text-[var(--color-charcoal)]">Start the first working board</span>
          <span className="mt-1 block text-[11px] text-[var(--text-muted)]">References stay loose; Library and capture products become project selections as they are placed.</span>
        </button>
      )}

      {frozenBoards.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Signed direction
          </h3>
          {frozenBoards.map((snapshot) => {
            const continued = continuedBySnapshot.get(snapshot.id);
            const busy = continuingId === snapshot.id;
            return (
              <article
                key={snapshot.id}
                className="rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-heading text-[14px] text-[var(--text-primary)]">
                      {snapshot.name}
                    </h4>
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      Frozen at signing · {snapshot.items.length} {snapshot.items.length === 1 ? 'piece' : 'pieces'}
                    </p>
                  </div>
                  {continued ? (
                    <Link
                      href={roomHref(continued.id, pathname)}
                      className="inline-flex min-h-11 items-center rounded-[4px] border border-[var(--color-clay)] px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
                    >
                      Open continued board
                    </Link>
                  ) : canCreate ? (
                    <button
                      type="button"
                      onClick={() => void handleContinue(snapshot)}
                      disabled={busy || continueBoard.isPending}
                      className="inline-flex min-h-11 items-center rounded-[4px] bg-[var(--color-clay)] px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-white disabled:cursor-wait disabled:opacity-60"
                    >
                      {busy ? 'Continuing…' : 'Continue in project'}
                    </button>
                  ) : (
                    <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                      Historical
                    </span>
                  )}
                </div>

                {snapshot.items.length > 0 && (
                  <details className="mt-4 border-t border-[var(--border-subtle)] pt-3">
                    <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                      View frozen composition
                    </summary>
                    <BoardComposition
                      board={{
                        id: snapshot.id,
                        name: snapshot.name,
                        canvas_width: snapshot.canvas_width,
                        canvas_height: snapshot.canvas_height,
                        background_color: snapshot.background_color,
                        sections: snapshot.sections ?? [],
                        items: snapshot.items,
                      }}
                      sections={snapshot.sections ?? []}
                      fit="width"
                      interactive={false}
                      className="mt-4"
                    />
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[12px] text-[var(--color-clay)]">
          {error}
        </p>
      )}
    </section>
  );
}
