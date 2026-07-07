'use client';

/**
 * The Post (R82) — the document-native home for what the Studio Drawer bell
 * used to bounce out to (`/portal/inbox`). A Drawer-weight charcoal SHEET (D14,
 * like Orders/Accounts/Hours/Account): it slides over whatever is in hand and
 * never unmounts it (D1). Opened from the drawer bell, the mobile bar bell, and
 * ⌘K — all via the `document:open-post` event, mirroring the Account sheet.
 *
 * Two R28 page links (DM-mono, never tabs):
 *   · Letters   — cross-document messages (`useInboxMessages`); a row opens the
 *                 ONE shared conversation in the People Room (`/people?thread=`),
 *                 never a copy.
 *   · the Record — a dated quiet ledger over TWO feeds merged as one list:
 *                 `useInboxNotifications` (notification_log) and
 *                 `useProcurementNotifications` (procurement_notifications,
 *                 00151 — deposits/balances due, deliveries, damage claims).
 *                 A notice whose subject the Desk already surfaces renders as
 *                 a quiet CROSS-REFERENCE ("on your Desk"), never its own act
 *                 (R82).
 *
 * Read-on-open (each feed's own mark-read path) on row click + a quiet "mark
 * all read" act spanning both. The clay dot stays awareness-not-count (D8):
 * unread is a dot per row, never a number, and the bell's own dot reads the
 * same two unread counts. Errors render as a quiet inline terracotta band at
 * the act site (R83), never a toast.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  useInboxNotifications,
  useInboxMessages,
  useInboxNotificationsRealtime,
  useProcurementNotifications,
  useMarkProcurementNotificationRead,
  type InboxMessage,
} from '@patina/supabase';
import { DocSheet } from './doc-sheet';
import {
  inboxRecordItem,
  procurementRecordItem,
  mergeRecordItems,
  type RecordItem,
  letterHref,
  letterTitle,
  relTime,
} from '@/lib/document/post-derivation';

type PostPage = 'record' | 'letters';

const PAGES: { key: PostPage; label: string }[] = [
  // Letters first per R82's naming, but the bell lands on the Record — the
  // notices are what its dot counts. See the open handler below.
  { key: 'letters', label: 'Letters' },
  { key: 'record', label: 'The Record' },
];

/** Open the Post from anywhere in the document model (the sheet listens). */
export function openPost() {
  window.dispatchEvent(new CustomEvent('document:open-post'));
}

export function PostSheet() {
  const router = useRouter();
  const qc = useQueryClient();
  // The bell's dot counts the Record's unread — so tapping it lands there.
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<PostPage>('record');
  const [markReadError, setMarkReadError] = useState<string | null>(null);

  useInboxNotificationsRealtime();
  const { data: notifications = [], isLoading: loadingInbox } = useInboxNotifications({
    limit: 50,
  });
  // No realtime leg for procurement (00151 hook is poll-only, staleTime 60 s).
  const { data: procurement = [], isLoading: loadingProcurement } =
    useProcurementNotifications({ limit: 50 });
  const markProcurementRead = useMarkProcurementNotificationRead();
  const { data: messages = [], isLoading: loadingLetters } = useInboxMessages(50);
  const loadingRecord = loadingInbox || loadingProcurement;

  useEffect(() => {
    const onOpen = () => {
      setPage('record');
      setMarkReadError(null);
      setOpen(true);
    };
    window.addEventListener('document:open-post', onOpen);
    return () => window.removeEventListener('document:open-post', onOpen);
  }, []);

  // The one dated ledger: both feeds merged, newest first.
  const record = useMemo(
    () =>
      mergeRecordItems(
        notifications.map(inboxRecordItem),
        procurement.map(procurementRecordItem),
      ),
    [notifications, procurement],
  );

  const unreadProcurementIds = useMemo(
    () =>
      record
        .filter((i) => i.source === 'procurement' && !i.read)
        .map((i) => i.id),
    [record],
  );
  const unreadCount = useMemo(
    () => record.reduce((sum, i) => (i.read ? sum : sum + 1), 0),
    [record],
  );

  // One row per thread — the latest message, newest thread first (the inbox
  // dedup, ported). Letters is a ledger of conversations, not of messages.
  const letters = useMemo(() => {
    const byThread = new Map<string, InboxMessage>();
    for (const m of messages) {
      const existing = byThread.get(m.thread_id);
      if (!existing || new Date(m.created_at) > new Date(existing.created_at)) {
        byThread.set(m.thread_id, m);
      }
    }
    return Array.from(byThread.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [messages]);

  async function markRead(ids: string[] | 'all') {
    if (Array.isArray(ids) && ids.length === 0) return;
    setMarkReadError(null);
    try {
      const res = await fetch('/api/inbox/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(`Mark read failed (${res.status})`);
      // Only refresh on success — a failed write leaves the unread state intact
      // rather than flashing a false "read" (the receivables-chase discipline).
      qc.invalidateQueries({ queryKey: ['inbox'] });
    } catch (err) {
      setMarkReadError(
        err instanceof Error ? err.message : 'Could not mark as read. Try again.',
      );
    }
  }

  // The procurement feed's own mark-read path (read_at on the 00151 row; the
  // hook invalidates ['procurement-notifications'] + ['procurement-unread-count']).
  async function markProcurementReadIds(ids: string[]) {
    if (ids.length === 0) return;
    setMarkReadError(null);
    try {
      await Promise.all(
        ids.map((notificationId) =>
          markProcurementRead.mutateAsync({ notificationId }),
        ),
      );
    } catch (err) {
      setMarkReadError(
        err instanceof Error ? err.message : 'Could not mark as read. Try again.',
      );
    }
  }

  function markAllRead() {
    void markRead('all');
    void markProcurementReadIds(unreadProcurementIds);
  }

  const navigate = (href: string) => {
    setOpen(false);
    if (href.startsWith('http')) {
      window.location.href = href;
    } else {
      router.push(href as never);
    }
  };

  function openRecordRow(item: RecordItem) {
    if (!item.read) {
      if (item.source === 'inbox') void markRead([item.id]);
      else void markProcurementReadIds([item.id]);
    }
    if (item.row.href) navigate(item.row.href);
  }

  function openLetter(m: InboxMessage) {
    // The People Room's Threads view marks the conversation read on open (its
    // own last_read_at path) — the Letter just carries the designer there.
    navigate(letterHref(m));
  }

  return (
    <DocSheet open={open} onClose={() => setOpen(false)} title="The Post">
      <div className="mx-auto max-w-xl">
        {/* Front matter — the literal name of the thing. */}
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-heading text-xl text-[var(--color-pearl)]">The Post</h2>
          {page === 'record' && unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.5)] transition-colors hover:text-[var(--color-clay)]"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* R28 page links — DM-mono, never tabs. */}
        <div className="mb-4 mt-4 flex flex-wrap items-baseline gap-x-4 border-b border-[rgba(250,247,242,0.1)] pb-2">
          {PAGES.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setMarkReadError(null);
                setPage(p.key);
              }}
              aria-current={page === p.key ? 'page' : undefined}
              className={`font-mono text-[9.5px] uppercase tracking-[0.08em] transition-colors ${
                page === p.key
                  ? 'text-[var(--color-clay)]'
                  : 'text-[rgba(250,247,242,0.45)] hover:text-[rgba(250,247,242,0.8)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* R83 — the failure grammar: a quiet inline terracotta band, never a toast. */}
        {markReadError && (
          <p
            role="alert"
            className="mb-3 rounded-[5px] border border-[var(--color-terracotta)] px-3 py-2 text-[12px] text-[var(--color-terracotta)]"
          >
            {markReadError}
          </p>
        )}

        {page === 'record' ? (
          <RecordList items={record} loading={loadingRecord} onOpen={openRecordRow} />
        ) : (
          <LetterList letters={letters} loading={loadingLetters} onOpen={openLetter} />
        )}
      </div>
    </DocSheet>
  );
}

// ─── The Record ────────────────────────────────────────────────────────────

function RecordList({
  items,
  loading,
  onOpen,
}: {
  items: RecordItem[];
  loading: boolean;
  onOpen: (item: RecordItem) => void;
}) {
  if (loading) return <QuietLine text="Gathering the record…" />;
  if (items.length === 0) {
    return (
      <QuietLine
        text="The record is clear."
        hint="Decisions, deliveries, and updates are noted here as they happen."
      />
    );
  }
  return (
    <ul className="divide-y divide-[rgba(250,247,242,0.08)]">
      {items.map((item) => (
        <RecordRow key={item.key} item={item} onOpen={() => onOpen(item)} />
      ))}
    </ul>
  );
}

function RecordRow({ item, onOpen }: { item: RecordItem; onOpen: () => void }) {
  const { read, title, body } = item;
  const isCrossRef = item.row.kind === 'cross_reference';

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-testid="post-record-row"
        data-cross-reference={isCrossRef ? 'true' : undefined}
        className="block w-full px-1 py-3.5 text-left transition-colors hover:bg-[rgba(250,247,242,0.04)]"
      >
        <div className="flex items-start gap-2.5">
          {/* Awareness dot, never a count (D8). */}
          <span
            aria-hidden
            className={`mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${
              read ? 'bg-transparent' : 'bg-[var(--color-clay)]'
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={`truncate text-[13px] ${
                  read
                    ? 'text-[rgba(250,247,242,0.6)]'
                    : 'font-medium text-[var(--color-pearl)]'
                }`}
              >
                {title}
              </span>
              <span className="flex-shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] text-[rgba(250,247,242,0.4)]">
                {relTime(item.createdAt)}
              </span>
            </div>
            {body ? (
              <p className="mt-1 line-clamp-2 text-[12px] text-[rgba(250,247,242,0.55)]">
                {body}
              </p>
            ) : null}
            <div className="mt-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.06em] text-[rgba(250,247,242,0.35)]">
              <span>{item.typeLabel}</span>
              {isCrossRef && (
                <>
                  <span aria-hidden>·</span>
                  {/* A quiet reference, not an act — the Desk already holds it. */}
                  <span className="text-[var(--color-clay)]">on your Desk ↗</span>
                </>
              )}
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

// ─── Letters ─────────────────────────────────────────────────────────────────

function LetterList({
  letters,
  loading,
  onOpen,
}: {
  letters: InboxMessage[];
  loading: boolean;
  onOpen: (m: InboxMessage) => void;
}) {
  if (loading) return <QuietLine text="Gathering the letters…" />;
  if (letters.length === 0) {
    return (
      <QuietLine
        text="No letters yet."
        hint="Messages from a project, a vendor brief, or a person gather here."
      />
    );
  }
  return (
    <ul className="divide-y divide-[rgba(250,247,242,0.08)]">
      {letters.map((m) => (
        <LetterRow key={m.thread_id} message={m} onOpen={() => onOpen(m)} />
      ))}
    </ul>
  );
}

function LetterRow({ message, onOpen }: { message: InboxMessage; onOpen: () => void }) {
  const sender = message.sender?.full_name ?? (message.system ? 'System' : 'Unknown');
  const title = letterTitle(message);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-testid="post-letter-row"
        className="block w-full px-1 py-3.5 text-left transition-colors hover:bg-[rgba(250,247,242,0.04)]"
      >
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden
            className={`mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${
              message.is_unread ? 'bg-[var(--color-clay)]' : 'bg-transparent'
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={`truncate text-[13px] ${
                  message.is_unread
                    ? 'font-medium text-[var(--color-pearl)]'
                    : 'text-[rgba(250,247,242,0.6)]'
                }`}
              >
                {sender}
              </span>
              <span className="flex-shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] text-[rgba(250,247,242,0.4)]">
                {relTime(message.created_at)}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] text-[rgba(250,247,242,0.55)]">
              {message.deleted_at ? '(message withdrawn)' : message.body || '(no content)'}
            </p>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-[rgba(250,247,242,0.35)]">
              {title}
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

function QuietLine({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-14 text-center">
      <p className="text-[13px] text-[rgba(250,247,242,0.65)]">{text}</p>
      {hint ? <p className="text-[12px] text-[rgba(250,247,242,0.4)]">{hint}</p> : null}
    </div>
  );
}
