'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useThreads,
  useUnreadCount,
  useInboxRealtime,
  type ThreadSummary,
  type UseThreadsParams,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { SearchInput } from '@/components/portal/search-input';
import { FilterRow } from '@/components/portal/filter-row';
import { LoadingStrata } from '@/components/portal/loading-strata';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function counterpartName(thread: ThreadSummary, myId: string): string {
  const others = thread.participants.filter(
    (p) => p.profile_id !== myId && !p.left_at
  );
  if (others.length === 0) return thread.title ?? 'Conversation';
  return others
    .map((p) => p.profile?.full_name ?? 'Unknown')
    .join(', ');
}

const FILTER_OPTIONS: Array<{ key: UseThreadsParams['scope']; label: string }> = [
  { key: undefined, label: 'Inbox' },
  { key: 'direct', label: 'Direct' },
  { key: 'project', label: 'Projects' },
  { key: 'vendor_brief', label: 'Vendors' },
  { key: 'archived', label: 'Archived' },
];

function MessagesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const myId = user?.id ?? '';

  const scopeParam = searchParams.get('scope') as UseThreadsParams['scope'] | null;
  const scope: UseThreadsParams['scope'] = scopeParam ?? undefined;

  const [search, setSearch] = useState('');

  // Realtime keeps the inbox + unread badges fresh.
  useInboxRealtime();

  const { data: threads = [], isLoading } = useThreads({ scope, search });
  const { data: unread } = useUnreadCount();

  const sortedThreads = useMemo(() => {
    return [...threads].sort((a, b) => {
      // Unread first, then last_message_at desc.
      if (a.unread_count > 0 && b.unread_count === 0) return -1;
      if (a.unread_count === 0 && b.unread_count > 0) return 1;
      return (
        new Date(b.last_message_at).getTime() -
        new Date(a.last_message_at).getTime()
      );
    });
  }, [threads]);

  const setScope = (next: UseThreadsParams['scope']) => {
    if (!next) {
      router.replace('/portal/messages');
    } else {
      router.replace(`/portal/messages?scope=${next}`);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="type-page-title">Messages</h1>
            <p className="type-body-small mt-1">
              {unread?.total
                ? `${unread.total} unread across ${
                    Object.keys(unread.byThread).filter(
                      (id) => (unread.byThread[id] ?? 0) > 0
                    ).length
                  } conversation(s)`
                : 'All caught up.'}
            </p>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name or project"
            className="w-full sm:max-w-sm"
          />
          <FilterRow
            value={scope ?? 'all'}
            options={FILTER_OPTIONS.map((o) => ({
              key: o.key ?? 'all',
              label: o.label,
            }))}
            onChange={(key) =>
              setScope(key === 'all' ? undefined : (key as UseThreadsParams['scope']))
            }
          />
        </div>

        {isLoading ? (
          <LoadingStrata />
        ) : sortedThreads.length === 0 ? (
          <div className="rounded-lg border border-[var(--border-subtle)] p-12 text-center">
            <p className="type-body">No conversations in this view.</p>
            <p className="type-body-small mt-2">
              Open a project to start one with a client.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)]">
            {sortedThreads.map((thread) => {
              const name = counterpartName(thread, myId);
              const unreadHere = thread.unread_count;
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/portal/messages/${thread.id}`)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[rgba(196,165,123,0.06)]"
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-medium"
                      style={{
                        background: 'rgba(196, 165, 123, 0.15)',
                        color: 'var(--color-mocha, #6F4E37)',
                      }}
                    >
                      {getInitials(name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span
                          className={`truncate ${
                            unreadHere > 0
                              ? 'type-item-name font-semibold'
                              : 'type-item-name'
                          }`}
                        >
                          {name}
                        </span>
                        <span className="type-meta-small shrink-0">
                          {formatRelative(thread.last_message_at)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="type-meta-small text-[var(--text-muted)]">
                          {thread.kind === 'project'
                            ? 'Project conversation'
                            : thread.kind === 'vendor_brief'
                              ? 'Vendor brief'
                              : 'Direct message'}
                        </span>
                        {thread.my_participant?.muted_at && (
                          <span className="type-meta-small">muted</span>
                        )}
                        {thread.my_participant?.archived_at && (
                          <span className="type-meta-small">archived</span>
                        )}
                      </div>
                    </div>
                    {unreadHere > 0 && (
                      <span
                        className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-white"
                        style={{ background: 'var(--color-clay, #C4A57B)' }}
                      >
                        {unreadHere}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<LoadingStrata />}>
      <MessagesPageInner />
    </Suspense>
  );
}
