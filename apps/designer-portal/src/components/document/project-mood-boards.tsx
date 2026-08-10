'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BoardComposition } from '@patina/design-system';
import {
  useContinueBoardInProject,
  useProjectBoards,
  useProjectOwnedBoards,
  type ProjectBoard,
  type ProposalBoardSummary,
} from '@patina/supabase';
import type { MoodBoardSection } from '@patina/types';
import { boardRoomHref } from '@/lib/mood-board/navigation';
import { moodBoardEvents } from '@/lib/analytics/mood-board-events';
import { BoardCoverArt } from '@/components/mood-board/board-cover-art';
import { GuidedEmptyState } from './guided-empty-state';
import { BoardsBuilder } from '@/components/portal/scope-builder/boards-builder';

type LiveBoardWithLineage = ProposalBoardSummary & {
  source_project_board_id?: string | null;
};

type FrozenBoardWithSections = ProjectBoard & {
  sections?: MoodBoardSection[];
};

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
export function ProjectMoodBoards({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const liveQuery = useProjectOwnedBoards(projectId);
  const frozenQuery = useProjectBoards(projectId);
  const continueBoard = useContinueBoardInProject();
  const [continuingId, setContinuingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingBoard, setStartingBoard] = useState(false);

  const liveBoards = (liveQuery.data ?? []) as LiveBoardWithLineage[];
  const frozenBoards = (frozenQuery.data ?? []) as FrozenBoardWithSections[];
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

  const isLoading = liveQuery.isLoading || frozenQuery.isLoading;
  if (isLoading) {
    return (
      <section aria-label="Mood boards" className="mt-9 border-t border-[var(--color-pearl)] pt-6">
        <div className="h-24 animate-pulse rounded-[5px] bg-[var(--bg-muted)] motion-reduce:animate-none" />
      </section>
    );
  }

  if (liveQuery.isError || frozenQuery.isError) {
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

  if (liveBoards.length === 0 && frozenBoards.length === 0) {
    return (
      <section aria-labelledby="project-mood-boards" className="mt-9 border-t border-[var(--color-pearl)] pt-6">
        <h2 id="project-mood-boards" className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">Mood boards</h2>
        {startingBoard ? (
          <div className="mt-3"><BoardsBuilder projectId={projectId} /></div>
        ) : (
          <GuidedEmptyState
            className="mt-3"
            title="Start the project’s visual direction"
            description="Use a working mood board to collect references, compose the room, and keep the visual decisions close to the project."
            inputs={['Room or purpose', 'References', 'A point of view']}
            action={{ key: 'start-project-board', label: 'Start a mood board', onClick: () => setStartingBoard(true) }}
          />
        )}
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

  return (
    <section aria-labelledby="project-mood-boards" className="mt-9 border-t border-[var(--color-pearl)] pt-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 id="project-mood-boards" className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">
            Mood boards
          </h2>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Live working boards and the direction frozen when the proposal was signed.
          </p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {liveBoards.length} live · {frozenBoards.length} frozen
        </span>
      </div>

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
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleContinue(snapshot)}
                      disabled={busy || continueBoard.isPending}
                      className="inline-flex min-h-11 items-center rounded-[4px] bg-[var(--color-clay)] px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-white disabled:cursor-wait disabled:opacity-60"
                    >
                      {busy ? 'Continuing…' : 'Continue in project'}
                    </button>
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
