'use client';

/**
 * A thread row (Track C) — the prototype's `.thread-row`: a counterpart avatar,
 * the "who" + a scope tag, the last line, and a terse time stamp. An unread
 * thread carries a gold left edge (no badge — D4/typography-first). Reuses the
 * shared Avatar (person-bits, never forked).
 */

import { useMemo } from 'react';
import type { ThreadSummary } from '@patina/supabase';
import { Avatar } from '../person-bits';
import { threadCounterpart, scopeLabel, relativeStamp } from './thread-bits';

export function ThreadRow({
  thread,
  myId,
  now,
  onOpen,
}: {
  thread: ThreadSummary;
  myId: string | undefined;
  now: Date;
  onOpen: () => void;
}) {
  const counterpart = useMemo(() => threadCounterpart(thread, myId), [thread, myId]);
  const unread = thread.unread_count > 0;
  // The list query doesn't hydrate the last message body (useThread does, on
  // open) — so the sub-line carries the title when set, then a quiet prompt.
  // The unread gold edge + the time stamp tell the freshness story instead.
  const subline =
    thread.title?.trim() ||
    (unread
      ? `${thread.unread_count} unread`
      : 'Open the conversation');

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3.5 border bg-white px-3.5 py-3 text-left transition-colors hover:border-[var(--color-clay)] ${
        unread
          ? 'rounded-[10px] border-[var(--color-pearl)] border-l-[3px] border-l-[var(--color-golden-hour)]'
          : 'rounded-[10px] border-[var(--color-pearl)]'
      }`}
    >
      <Avatar name={counterpart.name} role={counterpart.role} size={38} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[0.84rem] font-semibold text-[var(--color-charcoal)]">
            {counterpart.name}
          </span>
          <span className="shrink-0 rounded-[3px] border border-[var(--color-pearl)] px-1.5 py-px font-mono text-[0.42rem] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
            {scopeLabel(thread.kind)}
          </span>
        </span>
        <span
          className={`mt-[0.15rem] block truncate text-[0.7rem] ${
            unread
              ? 'font-medium text-[var(--color-mocha)]'
              : 'text-[var(--color-aged-oak)]'
          }`}
        >
          {subline}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[0.5rem] text-[var(--color-aged-oak)]">
        {relativeStamp(thread.last_message_at, now)}
      </span>
    </button>
  );
}
