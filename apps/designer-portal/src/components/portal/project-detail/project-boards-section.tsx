'use client';

import {
  useProjectBoards,
  type ProjectBoard,
  type ProjectBoardItem,
} from '@patina/supabase';
import {
  BoardStatic,
  type BoardItem,
  type BoardStaticItem,
} from '@patina/design-system';
import { renderBoardItem } from '@/components/portal/scope-builder/board-item-renderer';

interface ProjectBoardsSectionProps {
  /** Pass null for non-UUID (mock/slug) projects to skip the query. */
  projectId: string | null;
}

/**
 * Read-only mood boards carried onto an activated project (project_boards
 * snapshot rows — migration 00180). Renders nothing while loading or when
 * the project has no non-empty boards.
 */
export function ProjectBoardsSection({ projectId }: ProjectBoardsSectionProps) {
  const { data: boards = [], isLoading } = useProjectBoards(projectId);

  const visible = boards.filter((b) => (b.items?.length ?? 0) > 0);
  if (isLoading || visible.length === 0) return null;

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

      <div className="space-y-4">
        {visible.map((board) => (
          <ProjectBoardCard key={board.id} board={board} />
        ))}
      </div>
    </section>
  );
}

function ProjectBoardCard({ board }: { board: ProjectBoard }) {
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
        <span className="font-mono text-[0.55rem] uppercase tracking-wider text-[var(--text-muted)]">
          {board.items.length} {board.items.length === 1 ? 'item' : 'items'}
        </span>
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
