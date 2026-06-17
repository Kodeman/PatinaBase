'use client';

/**
 * Threads (R52 / Track C) — the unified inbox over `use-comms` (the shared
 * thread model that also renders on the document margin, R27). Every
 * conversation in one list, scope-filtered (the prototype's all/direct/project/
 * vendor chips → the comms inbox/direct/project/vendor_brief scopes). Clicking a
 * row opens the ONE shared conversation (read + reply + realtime) — never a copy.
 *
 * Honors `pendingThreadId` (ThreadsViewProps): when a profile presses "Message",
 * the Room lands here with that id set and we open its conversation directly.
 */

import { useEffect, useMemo, useState } from 'react';
import { useThreads } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { ViewHeader } from '../view-shell';
import { ThreadRow } from '../ops/thread-row';
import { ThreadConversation } from '../ops/thread-conversation';
import { THREAD_SCOPES, toCommsScope, type ThreadScope } from '../ops/thread-bits';
import type { ThreadsViewProps } from '../types';

export function ThreadsView({ pendingThreadId, notify }: ThreadsViewProps) {
  const { user } = useAuth();
  const [scope, setScope] = useState<ThreadScope>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  // A pending thread (from a profile "Message") opens its conversation directly.
  useEffect(() => {
    if (pendingThreadId) setOpenId(pendingThreadId);
  }, [pendingThreadId]);

  const { data, isLoading } = useThreads({ scope: toCommsScope(scope) });

  const threads = useMemo(
    () =>
      [...(data ?? [])].sort(
        (a, b) =>
          new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
      ),
    [data],
  );

  if (openId) {
    return (
      <ThreadConversation
        threadId={openId}
        onBack={() => setOpenId(null)}
        notify={notify}
      />
    );
  }

  return (
    <>
      <ViewHeader
        title="Threads"
        sub="Every conversation in one inbox — client, project, and vendor threads, scope-filtered."
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {THREAD_SCOPES.map(([key, label]) => {
          const on = scope === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setScope(key)}
              aria-pressed={on}
              className={`rounded-[16px] border px-3 py-1.5 font-mono text-[0.5rem] font-semibold uppercase tracking-[0.05em] transition-colors ${
                on
                  ? 'border-[var(--color-charcoal)] bg-[var(--color-charcoal)] text-[var(--color-off-white)]'
                  : 'border-[var(--color-pearl)] bg-white text-[var(--color-aged-oak)] hover:border-[var(--color-clay)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <p className="px-1 py-6 text-[0.76rem] text-[var(--color-aged-oak)]">
          Gathering the conversations…
        </p>
      ) : threads.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--doc-ink-border)] bg-white/40 px-5 py-8 text-center">
          <p className="text-[0.76rem] leading-relaxed text-[var(--color-aged-oak)]">
            {scope === 'all'
              ? 'No conversations yet. Threads opened from a project, a vendor brief, or a profile gather here.'
              : `No ${scope} threads yet.`}
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {threads.map((t) => (
            <li key={t.id}>
              <ThreadRow
                thread={t}
                myId={user?.id}
                now={now}
                onOpen={() => setOpenId(t.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
