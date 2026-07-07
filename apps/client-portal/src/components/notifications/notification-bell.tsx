'use client';

/**
 * NotificationBell — the single client-portal notification surface.
 *
 * Merges two sources into one deduped, read-aware feed:
 *   (a) DERIVED "needs attention" items — pending decisions, awaiting proposals,
 *       pending scope changes (useClientNotifications). Read state is persisted
 *       client-side in localStorage (no per-row read column on those tables).
 *   (b) INBOX rows — durable notification_log rows (useInboxNotifications). Read
 *       state lives server-side in metadata.read_at, toggled via /api/inbox/mark-read.
 *
 * Dedupe: when an inbox row targets the same deep link as a derived item they are
 * the same underlying event, so the server-backed inbox row wins and the derived
 * duplicate is dropped. This replaces the previous two-bell layout (a separate
 * InboxBell + this bell) that showed users two inconsistent unread counts.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  FileText,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

import {
  useClientNotifications,
  useInboxNotifications,
  useInboxNotificationsRealtime,
  useMarkClientNotificationRead,
  useMarkAllClientNotificationsRead,
  type ClientNotification,
  type ClientNotificationKind,
  type InboxNotification,
} from '@patina/supabase';

interface NotificationBellProps {
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Merge model
// ─────────────────────────────────────────────────────────────────────────────

export interface UnifiedNotification {
  /** Stable React key. */
  key: string;
  source: 'derived' | 'inbox';
  kind: ClientNotificationKind | 'inbox';
  title: string;
  message: string;
  url: string | null;
  created_at: string;
  read: boolean;
  /** Present when source === 'derived' — the localStorage read-state id. */
  derivedId?: string;
  /** Present when source === 'inbox' — the notification_log row id. */
  inboxId?: string;
}

function formatType(type: string): string {
  return type.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function inboxPreview(n: InboxNotification): { title: string; message: string } {
  const md = n.metadata ?? {};
  const title =
    (md.subject as string | undefined) ||
    (md.headline as string | undefined) ||
    (md.title as string | undefined) ||
    formatType(n.type);
  const message =
    (md.preview as string | undefined) ||
    (md.message as string | undefined) ||
    (md.body as string | undefined) ||
    '';
  return { title, message };
}

function inboxDeepLink(n: InboxNotification): string | null {
  const md = n.metadata ?? {};
  return (md.deep_link as string | undefined) ?? (md.url as string | undefined) ?? null;
}

/**
 * Merge derived items and inbox rows into one feed, newest first. An inbox row
 * that shares a deep link with a derived item wins (the derived duplicate is
 * dropped) so the same event never appears twice.
 */
export function mergeNotifications(
  derived: ClientNotification[],
  inbox: InboxNotification[],
): UnifiedNotification[] {
  const inboxItems: UnifiedNotification[] = inbox.map((n) => {
    const { title, message } = inboxPreview(n);
    return {
      key: `inbox-${n.id}`,
      source: 'inbox',
      kind: 'inbox',
      title,
      message,
      url: inboxDeepLink(n),
      created_at: n.created_at,
      read: !!n.metadata?.read_at,
      inboxId: n.id,
    };
  });

  const inboxLinks = new Set(
    inboxItems.map((i) => i.url).filter((u): u is string => !!u),
  );

  const derivedItems: UnifiedNotification[] = derived
    .filter((d) => !(d.url && inboxLinks.has(d.url)))
    .map((d) => ({
      key: d.id,
      source: 'derived',
      kind: d.kind,
      title: d.title,
      message: d.message,
      url: d.url ?? null,
      created_at: d.created_at,
      read: !!d.read_at,
      derivedId: d.id,
    }));

  return [...inboxItems, ...derivedItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentation
// ─────────────────────────────────────────────────────────────────────────────

const ICON_BY_KIND = {
  decision: AlertCircle,
  proposal: FileText,
  scope_change: ClipboardList,
  inbox: Bell,
} as const;

const COLOR_BY_KIND = {
  decision: 'text-amber-600 bg-amber-50',
  proposal: 'text-blue-600 bg-blue-50',
  scope_change: 'text-purple-600 bg-purple-50',
  inbox: 'text-gray-600 bg-gray-100',
} as const;

export function NotificationBell({ className = '' }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useInboxNotificationsRealtime();
  const { data: derived = [], isLoading: loadingDerived } = useClientNotifications();
  const { data: inbox = [], isLoading: loadingInbox } = useInboxNotifications();
  const markRead = useMarkClientNotificationRead();
  const markAllRead = useMarkAllClientNotificationsRead();

  const notifications = useMemo(
    () => mergeNotifications(derived, inbox),
    [derived, inbox],
  );
  const isLoading = loadingDerived || loadingInbox;

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function markInboxRead(ids: string[]) {
    if (ids.length === 0) return;
    try {
      await fetch('/api/inbox/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    } finally {
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
    }
  }

  function handleNotificationClick(notification: UnifiedNotification) {
    if (!notification.read) {
      if (notification.source === 'derived' && notification.derivedId) {
        markRead.mutate(notification.derivedId);
      } else if (notification.source === 'inbox' && notification.inboxId) {
        void markInboxRead([notification.inboxId]);
      }
    }
    setIsOpen(false);
    if (notification.url) {
      window.location.href = notification.url;
    }
  }

  function handleMarkAllRead() {
    const derivedUnread = notifications
      .filter((n) => !n.read && n.source === 'derived' && n.derivedId)
      .map((n) => n.derivedId as string);
    const inboxUnread = notifications
      .filter((n) => !n.read && n.source === 'inbox' && n.inboxId)
      .map((n) => n.inboxId as string);

    if (derivedUnread.length > 0) markAllRead.mutate(derivedUnread);
    if (inboxUnread.length > 0) void markInboxRead(inboxUnread);
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        data-testid="notification-bell"
      >
        <Bell className="h-5 w-5 text-gray-600" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-[#C77B6E] rounded-full"
            data-testid="notification-bell-count"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-[var(--accent-primary)] hover:opacity-80 font-medium flex items-center gap-1"
                data-testid="notification-mark-all-read"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="py-12 px-4 text-center">
                <p className="text-gray-500 text-sm">Loading…</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <CheckCircle2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">You&rsquo;re all caught up</p>
                <p className="text-gray-400 text-xs mt-1">
                  Decisions, proposals, and updates will appear here when they need your
                  attention.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.key}
                    notification={notification}
                    onClick={() => handleNotificationClick(notification)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-center">
            <Link
              href="/inbox"
              onClick={() => setIsOpen(false)}
              className="text-xs font-medium text-[var(--accent-primary)] hover:opacity-80"
              data-testid="notification-view-all"
            >
              View all in inbox
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onClick,
}: {
  notification: UnifiedNotification;
  onClick: () => void;
}) {
  const Icon = ICON_BY_KIND[notification.kind];
  const colorClass = COLOR_BY_KIND[notification.kind];
  const isRead = notification.read;

  return (
    <li className={isRead ? 'bg-white' : 'bg-blue-50/30'}>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
        data-testid="notification-item"
      >
        <div className="flex gap-3">
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${colorClass}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p
                className={`text-sm ${isRead ? 'text-gray-700' : 'text-gray-900 font-medium'}`}
              >
                {notification.title}
              </p>
              {!isRead && (
                <span className="flex-shrink-0 w-2 h-2 rounded-full bg-[var(--accent-primary)] mt-1.5" />
              )}
            </div>
            {notification.message ? (
              <p className="text-sm text-gray-500 line-clamp-2 mt-0.5">{notification.message}</p>
            ) : null}
            <p className="text-xs text-gray-400 mt-1">
              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
      </button>
    </li>
  );
}

export default NotificationBell;
