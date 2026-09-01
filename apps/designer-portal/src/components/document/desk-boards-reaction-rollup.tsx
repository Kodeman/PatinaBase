'use client';

// Desk-level rollup line (board-paths W2b #3, DV10-lite): a single compact
// strip beside the recents strip summarizing every active board the designer
// can see into "N awaiting reaction · N with reactions in · N approved
// awaiting pipeline". Reuses the SAME status derivation as the per-board chip
// (board-verdicts.ts) so a board's card and this line never disagree about
// its state.
//
// board-paths W3c (DV8/DV10): each count used to expand inline into a bare
// name list. That inline list is REPLACED here — the counts now link to
// /boards (optionally `?status=<bucket>`), the studio-wide boards view built
// in W3c, which is the real destination: cover, owner, the reaction chip,
// the client/guest verdict split, and the unresolved-direction count the
// inline list never had room for.

import Link from 'next/link';
import {
  useBoardsReactionRollup,
} from '@patina/supabase';

type BucketKey = 'awaitingReaction' | 'reactionsIn' | 'approvedPipeline';

const BUCKETS: ReadonlyArray<{
  key: BucketKey;
  statusParam: 'awaiting_reaction' | 'reactions_in' | 'approved_pipeline';
  label: (count: number) => string;
}> = [
  { key: 'awaitingReaction', statusParam: 'awaiting_reaction', label: (count) => `${count} awaiting reaction` },
  { key: 'reactionsIn', statusParam: 'reactions_in', label: (count) => `${count} with reactions in` },
  { key: 'approvedPipeline', statusParam: 'approved_pipeline', label: (count) => `${count} approved awaiting pipeline` },
];

export function DeskBoardsReactionRollup() {
  const { data: rollup, isLoading, isError } = useBoardsReactionRollup();

  if (isLoading || isError || !rollup) return null;

  const nonEmptyBuckets = BUCKETS.filter((bucket) => rollup[bucket.key].length > 0);
  if (nonEmptyBuckets.length === 0) return null;

  return (
    <div
      aria-label="Board reactions overview"
      className="mt-4 border-t border-[var(--color-pearl)] pt-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {nonEmptyBuckets.map(({ key, statusParam, label }) => {
          const entries = rollup[key];
          return (
            <Link
              key={key}
              href={`/boards?status=${statusParam}`}
              className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)] underline decoration-dotted underline-offset-4 hover:text-[var(--color-clay-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
            >
              {label(entries.length)}
            </Link>
          );
        })}
        {rollup.capped && (
          <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
            Showing the most recent boards only
          </span>
        )}
      </div>
    </div>
  );
}
