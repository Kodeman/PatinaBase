'use client';

/**
 * Studio-wide boards status view (board-paths W3c, DV8/DV10). The desk
 * rollup's "N awaiting reaction / N with reactions in / N approved" counts
 * link here: every active board across the studio, its reaction state, the
 * client/guest verdict split, and the unresolved-direction count from the
 * internal direction layer (00550). `?status=<bucket>` (set by the desk
 * rollup's links) narrows the list to one bucket; omit it to see every
 * active board.
 *
 * US-28 S11 (uplift.md (c) area 6; specimens/boards-1440 frame p1): Sections
 * by job, each board a plate and caption (U-Q20: the index is an unbounded,
 * browsed collection, so never Cards), status filters as underline words,
 * state as ink words (U-Q13). The overview read carries the job's name and
 * whether it is a proposal or a project, not its client or its stage, so the
 * eyebrow prints what the read knows.
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
import { EmptyState } from '@/components/document/empty-state';
import { verdictChipSpec } from '@/lib/document/verdict-chip';
import { StudioBoardsSkeleton, useLoadingRegister } from '@/components/loading';

const STATUS_FILTERS: ReadonlyArray<{
  key: BoardReactionStatus;
  label: string;
  countPhrase: (count: number) => string;
  emptyPhrase: string;
}> = [
  {
    key: 'awaiting_reaction',
    label: 'Awaiting board feedback',
    countPhrase: (count) => `${count} design board${count === 1 ? '' : 's'} awaiting board feedback`,
    emptyPhrase: 'No design boards awaiting board feedback.',
  },
  {
    key: 'reactions_in',
    label: 'Feedback received',
    countPhrase: (count) => `${count} design board${count === 1 ? '' : 's'} with feedback received`,
    emptyPhrase: 'No design boards with feedback received.',
  },
  {
    key: 'approved_pipeline',
    label: 'Approved items for item schedule',
    countPhrase: (count) => `${count} board${count === 1 ? '' : 's'} with approved items for the item schedule`,
    emptyPhrase: 'No design boards with approved items for the item schedule.',
  },
];

/** The board's state as its ink word: the filter's own words, so the caption
 * and the filter it sits under say the same thing. */
const STATE_WORD: Record<BoardReactionStatus, string> = {
  awaiting_reaction: 'Awaiting board feedback',
  reactions_in: 'Feedback received',
  approved_pipeline: 'Approved items',
};

function isBoardReactionStatus(value: string | null): value is BoardReactionStatus {
  return value === 'awaiting_reaction' || value === 'reactions_in' || value === 'approved_pipeline';
}

/** "2 approved (1 client · 1 guest) · 1 comment" — the client/guest split
 * (W3c/DV10) as a sentence in ink, no pigment. Omits the parenthetical when
 * every verdict of that kind came from one source. */
function verdictSentence(verdicts: StudioBoardOverviewEntry['verdicts']): string | null {
  const parts = (['approved', 'rejected', 'comment'] as const).flatMap((verdict) => {
    const count = verdicts[verdict];
    const spec = verdictChipSpec(verdict);
    if (!count || !spec) return [];
    const client = verdicts.bySource.client[verdict];
    const guest = verdicts.bySource.guest[verdict];
    const split = client > 0 && guest > 0 ? ` (${client} client · ${guest} guest)` : '';
    return [`${count} ${spec.label.toLowerCase()}${split}`];
  });
  return parts.length > 0 ? parts.join(' · ') : null;
}

interface JobGroup {
  key: string;
  ownerKind: StudioBoardOverviewEntry['ownerKind'];
  ownerName: string;
  boards: StudioBoardOverviewEntry[];
}

/** One Section per job, in the order the read returned their boards (the
 * most recently touched job first). */
function groupByJob(boards: readonly StudioBoardOverviewEntry[]): JobGroup[] {
  const groups = new Map<string, JobGroup>();
  for (const board of boards) {
    const key = `${board.ownerKind}:${board.ownerId}`;
    const group = groups.get(key);
    if (group) {
      group.boards.push(board);
    } else {
      groups.set(key, {
        key,
        ownerKind: board.ownerKind,
        ownerName: board.ownerName,
        boards: [board],
      });
    }
  }
  return Array.from(groups.values());
}

function BoardPlate({
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
  const href = boardRoomHref({ boardId: board.id, from, source: 'studio_boards' });
  const verdicts = verdictSentence(board.verdicts);
  const directions = board.unresolvedDirectionCount;
  return (
    <li data-board-plate={board.id}>
      {/* The plate opens the room too, for the hand that reaches for the
          picture; the caption's name is the one link a reader hears. */}
      <Link href={href} tabIndex={-1} aria-hidden className="plate">
        <BoardCoverArt name={board.name} coverUrl={board.coverImageUrl} />
      </Link>
      <div className="cap">
        <Link href={href} className="name t-d4 s11-hit">
          {board.name}
        </Link>
        <p className="s11-cap-line">
          <span className={board.reactionStatus ? 'word' : 'word word--quiet'}>
            {board.reactionStatus ? STATE_WORD[board.reactionStatus] : 'Not shared'}
          </span>
          {directions > 0 && (
            <span
              className="word"
              aria-label={`${directions} unresolved direction note${directions === 1 ? '' : 's'}`}
            >
              {directions} direction{directions === 1 ? '' : 's'}
            </span>
          )}
        </p>
        {verdicts && <p className="t-body-sm s11-cap-sentence">{verdicts}</p>}
      </div>
    </li>
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
  const activeFilter = STATUS_FILTERS.find((filter) => filter.key === activeStatus) ?? null;
  const jobs = groupByJob(filtered);
  // US-34 N10 — under the loading register the overview's read keeps the route fallback's shape
  // (one shape from fallback to data) and its loader words retire (PQ7). Off: today's words.
  const loadingRegister = useLoadingRegister();
  if (loadingRegister && overview.isLoading) return <StudioBoardsSkeleton />;

  return (
    <main className="min-h-screen bg-[var(--doc-paper)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-[1100px] px-4 pb-16 md:px-8">
        <header className="hline">
          <div className="hline-l">
            <Link
              href="/desk"
              className="inline-flex min-h-11 items-center t-meta uppercase text-[var(--text-muted)] hover:text-[var(--color-clay-ink)]"
            >
              ← Studio overview
            </Link>
            <h1 className="t-d2">Studio design boards</h1>
            <p className="t-meta uppercase text-[var(--text-subtle)]">
              {overview.isLoading
                ? 'Loading design boards…'
                : activeFilter
                  ? activeFilter.countPhrase(filtered.length)
                  : `${boards.length} active board${boards.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </header>
        <div className="rule-strong" />

        {!overview.isLoading && boards.length > 0 && (
          <nav className="filters s11-filters" aria-label="Board status">
            <Link
              href="/boards"
              aria-current={activeStatus ? undefined : 'page'}
              className="inline-flex min-h-11 min-w-11 items-center"
            >
              All design boards
            </Link>
            {STATUS_FILTERS.map((filter) => (
              <Link
                key={filter.key}
                href={`/boards?status=${filter.key}`}
                aria-current={activeStatus === filter.key ? 'page' : undefined}
                className="inline-flex min-h-11 min-w-11 items-center"
              >
                {filter.label}
              </Link>
            ))}
          </nav>
        )}

        {overview.isLoading ? (
          <p role="status" aria-live="polite" className="t-meta uppercase text-[var(--text-subtle)]">
            Reading the boards…
          </p>
        ) : overview.isError ? (
          <p role="alert" className="empty-t">
            The studio’s design boards could not be loaded. Please try again.
          </p>
        ) : jobs.length === 0 ? (
          <EmptyState eyebrow="Design boards">
            {activeFilter ? activeFilter.emptyPhrase : 'No active design boards yet.'}
          </EmptyState>
        ) : (
          jobs.map((job) => {
            const headingId = `studio-boards-${job.key.replace(/[^a-zA-Z0-9-]/g, '-')}`;
            return (
              <section key={job.key} className="section" aria-labelledby={headingId}>
                <div className="sec-head">
                  <h2 className="eb" id={headingId}>
                    <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
                      <path d="M0 2h34M0 6h28M0 10h20" />
                    </svg>
                    <span className={`tick st-${job.ownerKind} s11-eb-job`}>{job.ownerName}</span>
                    <span>{job.ownerKind === 'proposal' ? 'Proposal' : 'Project'}</span>
                  </h2>
                </div>
                <div className="plates-wrap">
                  <ul className="plates">
                    {job.boards.map((board) => (
                      <BoardPlate key={board.id} board={board} activeStatus={activeStatus} />
                    ))}
                  </ul>
                </div>
              </section>
            );
          })
        )}
        {overview.data?.capped && (
          <p className="mt-6 t-meta uppercase text-[var(--text-subtle)]">
            Showing the most recently updated design boards.
          </p>
        )}
      </div>
    </main>
  );
}
