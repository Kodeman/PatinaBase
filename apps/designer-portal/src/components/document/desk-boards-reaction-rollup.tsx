'use client';

// Desk-level rollup line (board-paths W2b #3, DV10-lite): a single compact
// strip beside the recents strip summarizing every active board the designer
// can see into "N awaiting reaction · N with reactions in · N approved
// awaiting pipeline", each count expanding into the boards behind it. Reuses
// the SAME status derivation as the per-board chip (board-verdicts.ts) so a
// board's card and this line never disagree about its state.

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  useBoardsReactionRollup,
  type BoardReactionRollupEntry,
} from '@patina/supabase';
import { boardRoomHref } from '@/lib/mood-board/navigation';

type BucketKey = 'awaitingReaction' | 'reactionsIn' | 'approvedPipeline';

const BUCKETS: ReadonlyArray<{ key: BucketKey; label: (count: number) => string }> = [
  { key: 'awaitingReaction', label: (count) => `${count} awaiting reaction` },
  { key: 'reactionsIn', label: (count) => `${count} with reactions in` },
  { key: 'approvedPipeline', label: (count) => `${count} approved awaiting pipeline` },
];

export function DeskBoardsReactionRollup() {
  const pathname = usePathname();
  const { data: rollup, isLoading, isError } = useBoardsReactionRollup();
  const [openBucket, setOpenBucket] = useState<BucketKey | null>(null);

  if (isLoading || isError || !rollup) return null;

  const nonEmptyBuckets = BUCKETS.filter((bucket) => rollup[bucket.key].length > 0);
  if (nonEmptyBuckets.length === 0) return null;

  const expandedEntries: readonly BoardReactionRollupEntry[] = openBucket
    ? rollup[openBucket]
    : [];

  return (
    <div
      aria-label="Board reactions overview"
      className="mt-4 border-t border-[var(--color-pearl)] pt-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {nonEmptyBuckets.map(({ key, label }) => {
          const entries = rollup[key];
          const expanded = openBucket === key;
          return (
            <button
              key={key}
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpenBucket((current) => (current === key ? null : key))}
              className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)] underline decoration-dotted underline-offset-4 hover:text-[var(--color-clay-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
            >
              {label(entries.length)}
            </button>
          );
        })}
        {rollup.capped && (
          <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
            Showing the most recent boards only
          </span>
        )}
      </div>

      {openBucket && expandedEntries.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-[var(--color-pearl)] pt-2">
          {expandedEntries.map((board) => (
            <li key={board.id}>
              <Link
                href={boardRoomHref({
                  boardId: board.id,
                  from: pathname,
                  source: 'desk_recents',
                })}
                className="inline-flex min-h-8 items-center gap-2 font-heading text-[13px] text-[var(--color-charcoal)] hover:text-[var(--color-clay-ink)]"
              >
                {board.name}
                <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                  · {board.ownerName}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
