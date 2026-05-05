'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, MessageSquare, CheckCheck, Inbox as InboxIcon } from 'lucide-react';
import {
  useInboxNotifications,
  useInboxMessages,
  useInboxNotificationsRealtime,
  useUnreadInboxCount,
  type InboxNotification,
  type InboxMessage,
} from '@patina/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { StrataMark } from '@/components/portal/strata-mark';

type Tab = 'notifications' | 'messages';

function relTime(value: string): string {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(value).toLocaleDateString();
}

function notificationPreview(n: InboxNotification): { title: string; body: string } {
  const md = n.metadata ?? {};
  const title =
    (md.subject as string | undefined) ||
    (md.headline as string | undefined) ||
    (md.title as string | undefined) ||
    formatType(n.type);
  const body =
    (md.preview as string | undefined) ||
    (md.message as string | undefined) ||
    (md.body as string | undefined) ||
    '';
  return { title, body };
}

function formatType(type: string): string {
  return type
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function deepLinkFor(n: InboxNotification): string | null {
  const md = n.metadata ?? {};
  const link = (md.deep_link as string | undefined) ?? (md.url as string | undefined);
  return link ?? null;
}

export default function InboxPage() {
  const [tab, setTab] = useState<Tab>('notifications');
  const qc = useQueryClient();
  const router = useRouter();

  useInboxNotificationsRealtime();
  const { data: notifications = [], isLoading: loadingN } = useInboxNotifications({ limit: 50 });
  const { data: messages = [], isLoading: loadingM } = useInboxMessages(50);
  const { data: unreadCount = 0 } = useUnreadInboxCount();

  const unreadIds = useMemo(
    () => notifications.filter((n) => !n.metadata?.read_at).map((n) => n.id),
    [notifications]
  );

  const messagesByThread = useMemo(() => {
    const map = new Map<string, InboxMessage>();
    for (const m of messages) {
      const existing = map.get(m.thread_id);
      if (!existing || new Date(m.created_at) > new Date(existing.created_at)) {
        map.set(m.thread_id, m);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [messages]);

  const unreadMessageThreads = messagesByThread.filter((m) => m.is_unread).length;

  async function markRead(ids: string[] | 'all') {
    if (Array.isArray(ids) && ids.length === 0) return;
    try {
      await fetch('/api/inbox/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    } finally {
      qc.invalidateQueries({ queryKey: ['inbox'] });
    }
  }

  function handleClickNotification(n: InboxNotification) {
    if (!n.metadata?.read_at) {
      void markRead([n.id]);
    }
    const link = deepLinkFor(n);
    if (link) {
      if (link.startsWith('http')) {
        window.location.href = link;
      } else {
        router.push(link as never);
      }
    }
  }

  return (
    <div className="pt-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="type-section-head">Inbox</h1>
          <p className="type-body-small mt-1">
            {tab === 'notifications'
              ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
              : `${unreadMessageThreads} unread message thread${unreadMessageThreads === 1 ? '' : 's'}`}
          </p>
        </div>
        {tab === 'notifications' && unreadIds.length > 0 && (
          <button
            type="button"
            onClick={() => markRead('all')}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] px-3 py-1.5 text-[0.7rem] uppercase tracking-wider text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            data-testid="inbox-mark-all-read"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        )}
      </div>

      <div className="mt-6 flex gap-1 border-b border-[var(--border-default)]">
        <TabButton
          active={tab === 'notifications'}
          onClick={() => setTab('notifications')}
          icon={<Bell className="h-3.5 w-3.5" />}
          label="Notifications"
          badge={unreadCount}
        />
        <TabButton
          active={tab === 'messages'}
          onClick={() => setTab('messages')}
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label="Messages"
          badge={unreadMessageThreads}
        />
      </div>

      <StrataMark variant="mini" />

      {tab === 'notifications' ? (
        <div>
          {loadingN ? (
            <EmptyState text="Loading notifications…" />
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={<InboxIcon className="h-8 w-8 opacity-40" />}
              text="You’re all caught up"
              hint="Decisions, deliveries, and updates will appear here."
            />
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onClick={() => handleClickNotification(n)}
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div>
          {loadingM ? (
            <EmptyState text="Loading messages…" />
          ) : messagesByThread.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-8 w-8 opacity-40" />}
              text="No messages yet"
              hint="Direct messages and project threads will appear here."
            />
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {messagesByThread.map((m) => (
                <MessageRow key={m.thread_id} message={m} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-3 py-2 text-[0.75rem] transition-colors ${
        active
          ? 'border-[var(--accent-primary)] font-medium text-[var(--text-primary)]'
          : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-[#D4A090] px-1.5 py-0.5 font-mono text-[0.55rem] text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

function NotificationRow({
  notification,
  onClick,
}: {
  notification: InboxNotification;
  onClick: () => void;
}) {
  const { title, body } = notificationPreview(notification);
  const isRead = !!notification.metadata?.read_at;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`block w-full px-3 py-4 text-left transition-colors hover:bg-[var(--bg-hover)] ${
          !isRead ? 'bg-[var(--bg-surface)]' : ''
        }`}
        data-testid="inbox-notification-row"
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
              isRead ? 'bg-transparent' : 'bg-[var(--accent-primary)]'
            }`}
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={`truncate text-sm ${isRead ? 'text-[var(--text-secondary)]' : 'font-medium text-[var(--text-primary)]'}`}
              >
                {title}
              </span>
              <span className="type-meta-small flex-shrink-0">
                {relTime(notification.created_at)}
              </span>
            </div>
            {body ? (
              <p className="mt-1 line-clamp-2 type-body-small">{body}</p>
            ) : null}
            <div className="mt-1 flex items-center gap-2 type-meta-small">
              <span className="uppercase tracking-wider">{formatType(notification.type)}</span>
              <span aria-hidden>·</span>
              <span>{notification.channel}</span>
              <span aria-hidden>·</span>
              <span>{notification.status}</span>
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

function MessageRow({ message }: { message: InboxMessage }) {
  const senderName = message.sender?.full_name ?? (message.system ? 'System' : 'Unknown');
  const threadTitle =
    message.thread?.title ??
    (message.thread?.kind === 'project'
      ? 'Project conversation'
      : message.thread?.kind === 'vendor_brief'
        ? 'Vendor brief'
        : 'Direct message');
  const href = `/portal/communications`;
  return (
    <li>
      <Link
        href={href}
        className={`block px-3 py-4 transition-colors hover:bg-[var(--bg-hover)] ${
          message.is_unread ? 'bg-[var(--bg-surface)]' : ''
        }`}
        data-testid="inbox-message-row"
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
              message.is_unread ? 'bg-[var(--accent-primary)]' : 'bg-transparent'
            }`}
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={`truncate text-sm ${message.is_unread ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
              >
                {senderName}
              </span>
              <span className="type-meta-small flex-shrink-0">
                {relTime(message.created_at)}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 type-body-small">
              {message.deleted_at ? '(message deleted)' : message.body || '(no content)'}
            </p>
            <div className="mt-1 type-meta-small uppercase tracking-wider">{threadTitle}</div>
          </div>
        </div>
      </Link>
    </li>
  );
}

function EmptyState({
  icon,
  text,
  hint,
}: {
  icon?: React.ReactNode;
  text: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      {icon ?? null}
      <p className="text-sm text-[var(--text-primary)]">{text}</p>
      {hint ? <p className="type-body-small">{hint}</p> : null}
    </div>
  );
}
