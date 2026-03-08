'use client';

/**
 * NotificationBell - Notification indicator and dropdown
 * Shows unread count badge and notification list
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, CheckCheck, Trash2, X, PartyPopper, MessageSquare, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@patina/design-system';
import { useNotifications, type AppNotification } from '@/hooks/use-notifications';
import { formatDistanceToNow } from 'date-fns';

interface NotificationBellProps {
  projectId?: string;
  className?: string;
}

const notificationIcons = {
  approval: AlertCircle,
  milestone: CheckCircle2,
  message: MessageSquare,
  alert: AlertCircle,
  celebration: PartyPopper,
};

const notificationColors = {
  approval: 'text-amber-500 bg-amber-50',
  milestone: 'text-green-500 bg-green-50',
  message: 'text-blue-500 bg-blue-50',
  alert: 'text-red-500 bg-red-50',
  celebration: 'text-purple-500 bg-purple-50',
};

export function NotificationBell({ projectId, className = '' }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAll,
    requestPermission,
    isConnected,
  } = useNotifications({ projectId });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Request notification permission on first interaction
  const handleBellClick = async () => {
    if (!isOpen && 'Notification' in window && Notification.permission === 'default') {
      await requestPermission();
    }
    setIsOpen(!isOpen);
  };

  const handleNotificationClick = (notification: AppNotification) => {
    markAsRead(notification.id);
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Bell Button */}
      <button
        onClick={handleBellClick}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-5 w-5 text-gray-600" />

        {/* Unread badge */}
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-red-500 rounded-full"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Connection indicator */}
        <span
          className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white ${
            isConnected ? 'bg-green-400' : 'bg-gray-300'
          }`}
          title={isConnected ? 'Connected' : 'Disconnected'}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="font-semibold text-gray-900">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Notification List */}
            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  <Bell className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">No notifications yet</p>
                  <p className="text-gray-400 text-xs mt-1">
                    We'll notify you about milestones and updates
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {notifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onClick={() => handleNotificationClick(notification)}
                      onMarkRead={() => markAsRead(notification.id)}
                      onDelete={() => clearNotification(notification.id)}
                    />
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-sm"
                  onClick={() => {
                    setIsOpen(false);
                    // Navigate to full notification view if exists
                  }}
                >
                  View all notifications
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface NotificationItemProps {
  notification: AppNotification;
  onClick: () => void;
  onMarkRead: () => void;
  onDelete: () => void;
}

function NotificationItem({ notification, onClick, onMarkRead, onDelete }: NotificationItemProps) {
  const Icon = notificationIcons[notification.type];
  const colorClass = notificationColors[notification.type];

  return (
    <li
      className={`relative group ${
        notification.read ? 'bg-white' : 'bg-blue-50/30'
      }`}
    >
      <button
        onClick={onClick}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex gap-3">
          {/* Icon */}
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${colorClass}`}>
            <Icon className="h-5 w-5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm ${notification.read ? 'text-gray-700' : 'text-gray-900 font-medium'}`}>
                {notification.title}
              </p>
              {!notification.read && (
                <span className="flex-shrink-0 w-2 h-2 rounded-full bg-primary-500 mt-1.5" />
              )}
            </div>
            <p className="text-sm text-gray-500 line-clamp-2 mt-0.5">
              {notification.message}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
            </p>
          </div>
        </div>
      </button>

      {/* Action buttons (visible on hover) */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!notification.read && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead();
            }}
            className="p-1.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600"
            title="Mark as read"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1.5 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-600"
          title="Delete"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

export default NotificationBell;
