/**
 * Test factories for Notification-related data
 * Use these to create consistent mock data for tests
 */

import type { AppNotification, NotificationType } from '@/hooks/use-notifications';

// Counter for generating unique IDs
let idCounter = 0;
const generateId = (prefix: string) => `${prefix}-${++idCounter}`;

// Reset counter between test suites
export const resetIdCounter = () => {
  idCounter = 0;
};

/**
 * Create a single notification
 */
export const createNotification = (
  overrides: Partial<AppNotification> = {}
): AppNotification => ({
  id: generateId('notif'),
  type: 'message' as NotificationType,
  title: 'New Message',
  message: 'You have received a new message',
  timestamp: new Date(),
  read: false,
  actionUrl: undefined,
  metadata: undefined,
  ...overrides,
});

/**
 * Create an approval notification
 */
export const createApprovalNotification = (
  overrides: Partial<AppNotification> = {}
): AppNotification =>
  createNotification({
    type: 'approval',
    title: 'Approval Required',
    message: 'Fabric selection needs your approval',
    actionUrl: `/projects/${generateId('project')}/approvals/${generateId('approval')}`,
    metadata: {
      projectId: generateId('project'),
      approvalId: generateId('approval'),
      priority: 'high',
    },
    ...overrides,
  });

/**
 * Create a milestone notification
 */
export const createMilestoneNotification = (
  overrides: Partial<AppNotification> = {}
): AppNotification =>
  createNotification({
    type: 'milestone',
    title: 'Milestone Completed',
    message: 'Design phase has been completed!',
    metadata: {
      milestoneId: generateId('milestone'),
      milestoneTitle: 'Design Phase Complete',
    },
    ...overrides,
  });

/**
 * Create a celebration notification
 */
export const createCelebrationNotification = (
  overrides: Partial<AppNotification> = {}
): AppNotification =>
  createNotification({
    type: 'celebration',
    title: 'Project Milestone Achieved!',
    message: 'Congratulations on reaching a major milestone',
    metadata: {
      milestoneId: generateId('milestone'),
      achievementType: 'first_milestone',
    },
    ...overrides,
  });

/**
 * Create an alert notification
 */
export const createAlertNotification = (
  overrides: Partial<AppNotification> = {}
): AppNotification =>
  createNotification({
    type: 'alert',
    title: 'Action Required',
    message: 'Your project needs attention',
    actionUrl: `/projects/${generateId('project')}`,
    ...overrides,
  });

/**
 * Create a message notification
 */
export const createMessageNotification = (
  overrides: Partial<AppNotification> = {}
): AppNotification =>
  createNotification({
    type: 'message',
    title: 'New Message from Designer',
    message: 'Designer Sarah sent you a message about your project',
    actionUrl: `/messages/${generateId('thread')}`,
    metadata: {
      threadId: generateId('thread'),
      senderId: generateId('user'),
      senderName: 'Designer Sarah',
    },
    ...overrides,
  });

/**
 * Create multiple notifications with various types and states
 */
export const createNotificationList = (
  count = 5,
  options: {
    includeUnread?: boolean;
    includeRead?: boolean;
    types?: NotificationType[];
  } = {}
): AppNotification[] => {
  const { includeUnread = true, includeRead = true, types } = options;
  const availableTypes: NotificationType[] = types || [
    'approval',
    'milestone',
    'message',
    'alert',
    'celebration',
  ];

  const notifications: AppNotification[] = [];

  for (let i = 0; i < count; i++) {
    const type = availableTypes[i % availableTypes.length];
    const read = includeRead && includeUnread
      ? i % 2 === 0
      : includeRead;

    let notification: AppNotification;

    switch (type) {
      case 'approval':
        notification = createApprovalNotification({ read });
        break;
      case 'milestone':
        notification = createMilestoneNotification({ read });
        break;
      case 'celebration':
        notification = createCelebrationNotification({ read });
        break;
      case 'alert':
        notification = createAlertNotification({ read });
        break;
      case 'message':
      default:
        notification = createMessageNotification({ read });
        break;
    }

    // Adjust timestamp to be progressively older
    const timestamp = new Date();
    timestamp.setMinutes(timestamp.getMinutes() - i * 15);
    notification.timestamp = timestamp;

    notifications.push(notification);
  }

  return notifications;
};

/**
 * Create notifications in specific state for testing
 */
export const createNotificationsWithState = (
  unreadCount: number,
  readCount: number
): AppNotification[] => {
  const notifications: AppNotification[] = [];

  for (let i = 0; i < unreadCount; i++) {
    notifications.push(createNotification({ read: false }));
  }

  for (let i = 0; i < readCount; i++) {
    notifications.push(createNotification({ read: true }));
  }

  return notifications;
};

/**
 * Notification counts summary
 */
export interface NotificationCounts {
  total: number;
  unread: number;
  byType: Record<NotificationType, number>;
}

export const getNotificationCounts = (
  notifications: AppNotification[]
): NotificationCounts => {
  const byType: Record<NotificationType, number> = {
    approval: 0,
    milestone: 0,
    message: 0,
    alert: 0,
    celebration: 0,
  };

  let unread = 0;

  for (const notification of notifications) {
    byType[notification.type]++;
    if (!notification.read) {
      unread++;
    }
  }

  return {
    total: notifications.length,
    unread,
    byType,
  };
};
