'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRecentBoards } from '@patina/supabase';
import { boardRoomHref } from '@/lib/mood-board/navigation';
import { formatRelativeTime } from '@/lib/utils';
import { SectionEyebrow } from './section-eyebrow';
import { BoardVerdictSummary } from '@/components/mood-board/board-verdict-summary';
import { BoardCoverArt } from '@/components/mood-board/board-cover-art';

/**
 * Desk-level doorway into the most recently touched mood boards. The query is
 * RLS-scoped and owner-unified, so proposal and live project boards can share
 * one quiet strip without leaking another studio's work.
 */
export function RecentBoardsStrip() {
  const pathname = usePathname();
  const { data: boards = [], isLoading, isError } = useRecentBoards(8);

  if (isError || (!isLoading && boards.length === 0)) return null;

  return (
    <section aria-labelledby="recent-mood-boards" className="mt-12">
      <SectionEyebrow count={boards.length || undefined}>
        <span id="recent-mood-boards">Recent boards</span>
      </SectionEyebrow>

      <div className="mt-[18px] flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {isLoading
          ? [0, 1, 2].map((index) => (
              <div
                key={index}
                aria-hidden
                className="h-[148px] w-[190px] shrink-0 animate-pulse rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-surface)] motion-reduce:animate-none"
              />
            ))
          : boards.map((board) => (
              <Link
                key={board.id}
                href={boardRoomHref({
                  boardId: board.id,
                  from: pathname,
                  source: 'desk_recents',
                })}
                className="group w-[190px] shrink-0 overflow-hidden rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-surface)] transition-colors hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
                aria-label={`Open mood board ${board.name}`}
              >
                <BoardCoverArt
                  name={board.name}
                  coverUrl={board.coverImageUrl}
                  fallbackUrls={board.coverFallbackUrls}
                  className="h-[92px] bg-[var(--doc-sheet-2,var(--bg-muted))]"
                  imageClassName="transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
                />
                <div className="px-3 py-2.5">
                  <p className="truncate font-heading text-[14px] text-[var(--text-primary)]">
                    {board.name}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    {board.roomName ?? board.ownerName}
                  </p>
                  <BoardVerdictSummary counts={board.verdictCounts} className="mt-1.5" />
                  <p
                    suppressHydrationWarning
                    className="mt-1 font-mono text-[9px] text-[var(--text-muted)]"
                  >
                    {formatRelativeTime(board.updatedAt)}
                  </p>
                </div>
              </Link>
            ))}
      </div>
    </section>
  );
}
