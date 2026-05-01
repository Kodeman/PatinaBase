'use client';

/**
 * NotificationBell — derived "needs attention" feed.
 * Aggregates pending decisions, awaiting proposals, and pending scope changes
 * from existing tables. Read state lives in localStorage (no notifications
 * pipeline in production yet).
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

import {
  useClientNotifications,
  useMarkClientNotificationRead,
  useMarkAllClientNotificationsRead,
  type ClientNotification,
} from '@patina/supabase';

interface NotificationBellProps {
  className?: string;
}

const ICON_BY_KIND = {
  decision: AlertCircle,
  proposal: FileText,
  scope_change: ClipboardList,
} as const;

const COLOR_BY_KIND = {
  decision: 'text-amber-600 bg-amber-50',
  proposal: 'text-blue-600 bg-blue-50',
  scope_change: 'text-purple-600 bg-purple-50',
} as const;

export function NotificationBell({ className = '' }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: notifications = [], isLoading } = useClientNotifications();
  const markRead = useMarkClientNotificationRead();
  const markAllRead = useMarkAllClientNotificationsRead();

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read_at).length,
    [notifications]
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

  function handleNotificationClick(notification: ClientNotification) {
    markRead.mutate(notification.id);
    setIsOpen(false);
    if (notification.url) {
      window.location.href = notification.url;
    }
  }

  function handleMarkAllRead() {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length > 0) {
      markAllRead.mutate(unreadIds);
    }
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
                    key={notification.id}
                    notification={notification}
                    onClick={() => handleNotificationClick(notification)}
                  />
                ))}
              </ul>
            )}
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
  notification: ClientNotification;
  onClick: () => void;
}) {
  const Icon = ICON_BY_KIND[notification.kind];
  const colorClass = COLOR_BY_KIND[notification.kind];
  const isRead = !!notification.read_at;

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
            <p className="text-sm text-gray-500 line-clamp-2 mt-0.5">{notification.message}</p>
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
