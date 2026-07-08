'use client';

import { useState } from 'react';
import {
  useProjectBoards,
  useProjectOwnedBoards,
  useContinueBoardInProject,
  type ProjectBoard,
  type ProjectBoardItem,
} from '@patina/supabase';
import {
  BoardStatic,
  type BoardItem,
  type BoardStaticItem,
} from '@patina/design-system';
import { Button } from '@/components/ui/controls';
import { renderBoardItem } from '@/components/portal/scope-builder/board-item-renderer';
import { BoardsBuilder } from '@/components/portal/scope-builder/boards-builder';

interface ProjectBoardsSectionProps {
  /** Pass null for non-UUID (mock/slug) projects to skip the query. */
  projectId: string | null;
}

/**
 * Mood boards on an activated project. Two tiers:
 *  - The FROZEN record snapshot carried at signing (project_boards, 00180),
 *    rendered read-only. Each can be "continued in the project" (B8) — cloned
 *    into a live, editable project-owned board while the snapshot stays the
 *    record.
 *  - The LIVE project-owned boards (00272), shown in the same board builder the
 *    proposal stage uses, in project context.
 */
export function ProjectBoardsSection({ projectId }: ProjectBoardsSectionProps) {
  const { data: boards = [], isLoading } = useProjectBoards(projectId);
  const { data: liveBoards = [] } = useProjectOwnedBoards(projectId);
  const continueBoard = useContinueBoardInProject();
  const [continuingId, setContinuingId] = useState<string | null>(null);

  const snapshotBoards = boards.filter((b) => (b.items?.length ?? 0) > 0);
  const hasLive = liveBoards.length > 0;

  if (isLoading || (snapshotBoards.length === 0 && !hasLive)) return null;

  const handleContinue = (boardId: string) => {
    if (!projectId) return;
    setContinuingId(boardId);
    continueBoard.mutate(
      { projectBoardId: boardId, projectId },
      { onSettled: () => setContinuingId(null) },
    );
  };

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h3
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 500,
            fontSize: '1.25rem',
            lineHeight: 1.35,
          }}
        >
          Mood Boards
        </h3>
        <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
          From signed proposal
        </span>
      </div>

      {snapshotBoards.length > 0 && (
        <div className="space-y-4">
          {snapshotBoards.map((board) => (
            <ProjectBoardCard
              key={board.id}
              board={board}
              onContinue={projectId ? () => handleContinue(board.id) : undefined}
              continuing={continuingId === board.id}
            />
          ))}
        </div>
      )}

      {/* Live, editable project-owned boards (B8). Mounted only once at least
          one board has been continued (or a fresh one added in the builder). */}
      {hasLive && (
        <div className="mt-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h4
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 500,
                fontSize: '1rem',
                lineHeight: 1.35,
              }}
            >
              Working boards
            </h4>
            <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
              Editable · continued in the project
            </span>
          </div>
          <BoardsBuilder projectId={projectId ?? undefined} />
        </div>
      )}
    </section>
  );
}

function ProjectBoardCard({
  board,
  onContinue,
  continuing,
}: {
  board: ProjectBoard;
  onContinue?: () => void;
  continuing?: boolean;
}) {
  // The JSONB snapshot items carry NO id/locked fields (the activation RPC
  // strips them — see migration 00180), so key by array index. The array is
  // pre-ordered by z_index then created_at.
  const items: BoardStaticItem[] = (board.items ?? []).map(
    (it: ProjectBoardItem, index: number) => ({
      id: index,
      type: it.type,
      position: { x: Number(it.x), y: Number(it.y) },
      // An undefined height falls through to CSS auto (image/card items size
      // to their content) — same convention as the board editor.
      size: {
        width: Number(it.width),
        height: it.height === null ? undefined : Number(it.height),
      } as { width: number; height: number },
      zIndex: it.z_index,
      rotation: Number(it.rotation),
      // renderBoardItem reads display fields (data snapshot, image_url,
      // content) off item.data — the embedded item has exactly those.
      data: it,
    }),
  );

  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)]">
      <div className="flex items-baseline justify-between border-b border-[var(--border-default)] px-4 py-2.5">
        <span className="font-body text-sm text-[var(--text-primary)]">{board.name}</span>
        <div className="flex items-center gap-3">
          {onContinue && (
            <Button variant="ghost" size="sm" disabled={continuing} onClick={onContinue}>
              {continuing ? 'Continuing…' : 'Continue this board in the project'}
            </Button>
          )}
          <span className="font-mono text-[0.55rem] uppercase tracking-wider text-[var(--text-muted)]">
            {board.items.length} {board.items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>
      <BoardStatic
        items={items}
        canvasWidth={board.canvas_width}
        canvasHeight={board.canvas_height}
        backgroundColor={board.background_color}
        renderItem={(item) => renderBoardItem(item as unknown as BoardItem)}
      />
    </div>
  );
}
