'use client';

/**
 * Studio-wide boards status view (board-paths W3c, DV8/DV10). The desk
 * rollup's "N awaiting reaction / N with reactions in / N approved" counts
 * used to expand inline into a bare name list (desk-boards-reaction-rollup.tsx);
 * this page is now what they link to — a real cross-project surface with
 * cover, owner, the same reaction-status chip a board card uses, the client/
 * guest verdict split, and the unresolved-direction count from the internal
 * direction layer (00550). `?status=<bucket>` (set by the desk rollup's
 * links) narrows the list to one bucket; omit it to see every active board.
 */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  useStudioBoardsOverview,
  type BoardReactionStatus,
  type StudioBoardOverviewEntry,
} from '@patina/supabase';
import { boardRoomHref } from '@/lib/mood-board/navigation';
import { BoardCoverArt } from '@/components/mood-board/board-cover-art';
import { BoardReactionStatusChip } from '@/components/mood-board/board-reaction-status-chip';
import { verdictChipSpec } from '@/lib/document/verdict-chip';

const LABEL =
  'font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]';

const STATUS_FILTERS: ReadonlyArray<{ key: BoardReactionStatus; label: string }> = [
  { key: 'awaiting_reaction', label: 'Awaiting reaction' },
  { key: 'reactions_in', label: 'Reactions in' },
  { key: 'approved_pipeline', label: 'Approved · pipeline' },
];

function isBoardReactionStatus(value: string | null): value is BoardReactionStatus {
  return value === 'awaiting_reaction' || value === 'reactions_in' || value === 'approved_pipeline';
}

/** "2 approved (1 client · 1 guest)" — client/guest split, W3c/DV10. Omits
 * the parenthetical when every verdict of that kind came from one source. */
function VerdictSplitLine({ verdicts }: { verdicts: StudioBoardOverviewEntry['verdicts'] }) {
  const kinds = (['approved', 'rejected', 'comment'] as const).flatMap((verdict) => {
    const count = verdicts[verdict];
    const spec = verdictChipSpec(verdict);
    if (!count || !spec) return [];
    const client = verdicts.bySource.client[verdict];
    const guest = verdicts.bySource.guest[verdict];
    const split = client > 0 && guest > 0 ? ` (${client} client · ${guest} guest)` : '';
    return [{ verdict, count, spec, split }];
  });

  if (kinds.length === 0) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
        No reactions yet
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {kinds.map(({ verdict, count, spec, split }) => (
        <span key={verdict} className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: spec.color }} />
          {count} {spec.label.toLowerCase()}
          {split}
        </span>
      ))}
    </span>
  );
}

function StudioBoardRow({
  board,
  activeStatus,
}: {
  board: StudioBoardOverviewEntry;
  /** The live `?status=` filter, if any (C13) — carried into the room's
   * `from` so returning from the board keeps the filtered view, not the
   * unfiltered list. */
  activeStatus: BoardReactionStatus | null;
}) {
  const from = activeStatus ? `/boards?status=${activeStatus}` : '/boards';
  return (
    <Link
      href={boardRoomHref({ boardId: board.id, from, source: 'studio_boards' })}
      className="flex min-h-[76px] w-full items-center gap-3 border-b border-[var(--color-pearl)] py-2.5 text-left last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
    >
      <BoardCoverArt
        name={board.name}
        coverUrl={board.coverImageUrl}
        className="h-14 w-14 shrink-0 rounded-[3px]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate font-heading text-[15px] text-[var(--color-charcoal)]">
            {board.name}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            {board.ownerName}
          </span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <BoardReactionStatusChip status={board.reactionStatus} />
          <VerdictSplitLine verdicts={board.verdicts} />
          {board.unresolvedDirectionCount > 0 && (
            <span
              aria-label={`${board.unresolvedDirectionCount} unresolved direction note${board.unresolvedDirectionCount === 1 ? '' : 's'}`}
              className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--color-clay-ink)]"
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--color-clay)]" />
              {board.unresolvedDirectionCount} direction
              {board.unresolvedDirectionCount === 1 ? '' : 's'}
            </span>
          )}
        </span>
      </span>
      <span aria-hidden className="font-mono text-[13px] text-[var(--color-clay-ink)]">
        →
      </span>
    </Link>
  );
}

export function StudioBoardsView() {
  const searchParams = useSearchParams();
  const rawStatus = searchParams.get('status');
  const activeStatus = isBoardReactionStatus(rawStatus) ? rawStatus : null;

  const overview = useStudioBoardsOverview();

  const boards = overview.data?.boards ?? [];
  const filtered = activeStatus
    ? boards.filter((board) => board.reactionStatus === activeStatus)
    : boards;
  const activeFilterLabel = STATUS_FILTERS.find((f) => f.key === activeStatus)?.label ?? null;

  return (
    <main className="min-h-screen bg-[var(--doc-paper)] text-[var(--color-charcoal)]">
      <header className="sticky top-0 z-20 border-b border-[var(--color-pearl)] bg-[var(--doc-paper)]/95 px-4 py-3 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-4">
          <Link
            href="/desk"
            className="inline-flex min-h-11 items-center py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)] hover:text-[var(--color-clay-ink)]"
          >
            ← Desk
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-xl">Studio boards</h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {overview.isLoading
                ? 'Reading the boards…'
                : activeFilterLabel
                  ? `${filtered.length} ${activeFilterLabel.toLowerCase()}`
                  : `${boards.length} active board${boards.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        {!overview.isLoading && boards.length > 0 && (
          <div className="mx-auto mt-2 flex max-w-[1100px] flex-wrap items-center gap-x-2 gap-y-0">
            <Link
              href="/boards"
              className={`inline-flex min-h-11 items-center font-mono text-[10px] uppercase tracking-[0.05em] underline decoration-dotted underline-offset-4 hover:text-[var(--color-clay-ink)] ${
                activeStatus ? 'text-[var(--text-muted)]' : 'text-[var(--color-clay-ink)]'
              }`}
            >
              All
            </Link>
            {STATUS_FILTERS.map((filter) => (
              <Link
                key={filter.key}
                href={`/boards?status=${filter.key}`}
                className={`inline-flex min-h-11 items-center font-mono text-[10px] uppercase tracking-[0.05em] underline decoration-dotted underline-offset-4 hover:text-[var(--color-clay-ink)] ${
                  activeStatus === filter.key ? 'text-[var(--color-clay-ink)]' : 'text-[var(--text-muted)]'
                }`}
              >
                {filter.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      <div className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 md:px-8">
        {overview.isLoading ? (
          <p role="status" aria-live="polite" className={LABEL}>
            Reading the boards…
          </p>
        ) : overview.isError ? (
          <p role="alert" className="font-heading text-[1.05rem] italic text-[var(--color-clay-ink)]">
            The studio's boards are unavailable right now. Try again in a moment.
          </p>
        ) : filtered.length === 0 ? (
          <p className="font-heading text-[1.05rem] italic text-[var(--text-muted)]">
            {activeFilterLabel ? `No boards are ${activeFilterLabel.toLowerCase()}.` : 'No active boards yet.'}
          </p>
        ) : (
          <div className="border-t border-[var(--color-pearl)]">
            {filtered.map((board) => (
              <StudioBoardRow key={board.id} board={board} activeStatus={activeStatus} />
            ))}
          </div>
        )}
        {overview.data?.capped && (
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
            Showing the most recently updated boards only.
          </p>
        )}
      </div>
    </main>
  );
}
