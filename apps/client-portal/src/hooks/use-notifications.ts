'use client';

/**
 * In-app notification system hook
 * Handles real-time notifications for approvals, milestones, messages
 */

import { useCallback, useEffect, useState } from 'react';
import { useWebSocket } from '@/lib/websocket';

export interface AppNotification {
  id: string;
  type: 'approval' | 'milestone' | 'message' | 'alert' | 'celebration';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  metadata?: {
    projectId?: string;
    milestoneId?: string;
    approvalId?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  };
}

interface UseNotificationsOptions {
  projectId?: string;
  maxNotifications?: number;
  persistToStorage?: boolean;
}

const STORAGE_KEY = 'patina_notifications';

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { projectId, maxNotifications = 50, persistToStorage = true } = options;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const {
    onMilestoneCompleted,
    onApprovalUpdate,
    onActivityUpdate,
    isConnected,
  } = useWebSocket();

  // Load notifications from storage on mount
  useEffect(() => {
    if (persistToStorage && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setNotifications(parsed.map((n: any) => ({
            ...n,
            timestamp: new Date(n.timestamp),
          })));
        }
      } catch (error) {
        console.error('Failed to load notifications:', error);
      }
    }
  }, [persistToStorage]);

  // Save notifications to storage
  useEffect(() => {
    if (persistToStorage && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    }
    setUnreadCount(notifications.filter(n => !n.read).length);
  }, [notifications, persistToStorage]);

  // Add a notification
  const addNotification = useCallback((notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: AppNotification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      read: false,
    };

    setNotifications(prev => {
      const updated = [newNotification, ...prev].slice(0, maxNotifications);
      return updated;
    });

    // Request browser notification permission and show if granted
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/icons/notification-icon.png',
        badge: '/icons/badge-icon.png',
        tag: newNotification.id,
      });
    }

    return newNotification;
  }, [maxNotifications]);

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, read: true } : n))
    );
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  // Clear notification
  const clearNotification = useCallback((notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  }, []);

  // Clear all notifications
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Subscribe to WebSocket events
  useEffect(() => {
    if (!isConnected) return;

    const unsubMilestone = onMilestoneCompleted((data: any) => {
      if (projectId && data.projectId !== projectId) return;

      addNotification({
        type: 'celebration',
        title: 'Milestone Completed!',
        message: `"${data.title || 'A milestone'}" has been completed.`,
        actionUrl: `/projects/${data.projectId}`,
        metadata: {
          projectId: data.projectId,
          milestoneId: data.milestoneId,
        },
      });
    });

    const unsubApproval = onApprovalUpdate((data: any) => {
      if (projectId && data.projectId !== projectId) return;

      const typeMessages: Record<string, string> = {
        pending: 'A new approval is waiting for your review.',
        approved: 'Your approval has been processed.',
        rejected: 'An approval requires your attention.',
        needs_discussion: 'An approval needs discussion.',
      };

      addNotification({
        type: 'approval',
        title: data.status === 'pending' ? 'New Approval Required' : 'Approval Updated',
        message: typeMessages[data.status] || 'Approval status changed.',
        actionUrl: `/projects/${data.projectId}?approval=${data.approvalId}`,
        metadata: {
          projectId: data.projectId,
          approvalId: data.approvalId,
          priority: data.status === 'pending' ? 'high' : 'normal',
        },
      });
    });

    const unsubActivity = onActivityUpdate((data: any) => {
      if (projectId && data.projectId !== projectId) return;

      // Only notify for important activities
      if (data.type === 'message' || data.type === 'document') {
        addNotification({
          type: 'message',
          title: data.type === 'message' ? 'New Message' : 'New Document',
          message: data.title || 'New activity on your project.',
          actionUrl: `/projects/${data.projectId}`,
          metadata: {
            projectId: data.projectId,
          },
        });
      }
    });

    return () => {
      unsubMilestone();
      unsubApproval();
      unsubActivity();
    };
  }, [isConnected, projectId, addNotification, onMilestoneCompleted, onApprovalUpdate, onActivityUpdate]);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }, []);

  return {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAll,
    requestPermission,
    isConnected,
  };
}
