/**
 * MSW handlers for Notification-related endpoints
 * Use these for integration tests and Storybook
 */

import { http, HttpResponse, delay } from 'msw';
import {
  createNotificationList,
  createNotification,
  type AppNotification,
} from '../../factories';
import type { NotificationType } from '@/hooks/use-notifications';

// In-memory notification store for testing
let mockNotifications: AppNotification[] = createNotificationList(5);

/**
 * Reset mock notifications to defaults
 */
export const resetNotificationMocks = () => {
  mockNotifications = createNotificationList(5);
};

/**
 * Set custom notifications for testing
 */
export const setMockNotifications = (notifications: AppNotification[]) => {
  mockNotifications = notifications;
};

/**
 * Add a notification to the mock store
 */
export const addMockNotification = (notification: Partial<AppNotification>) => {
  const newNotification = createNotification(notification);
  mockNotifications.unshift(newNotification);
  return newNotification;
};

/**
 * Get current mock notifications
 */
export const getMockNotifications = () => [...mockNotifications];

/**
 * Notification API handlers
 */
export const notificationHandlers = [
  // GET /api/notifications
  http.get('/api/notifications', async ({ request }) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';

    await delay(100);

    let filtered = [...mockNotifications];

    if (projectId) {
      filtered = filtered.filter(
        (n) => n.metadata?.projectId === projectId || !n.metadata?.projectId
      );
    }

    if (unreadOnly) {
      filtered = filtered.filter((n) => !n.read);
    }

    return HttpResponse.json({
      notifications: filtered.slice(0, limit),
      total: filtered.length,
      unreadCount: filtered.filter((n) => !n.read).length,
    });
  }),

  // GET /api/notifications/:id
  http.get('/api/notifications/:id', async ({ params }) => {
    const { id } = params;
    await delay(50);

    const notification = mockNotifications.find((n) => n.id === id);

    if (!notification) {
      return HttpResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json(notification);
  }),

  // PATCH /api/notifications/:id/read
  http.patch('/api/notifications/:id/read', async ({ params }) => {
    const { id } = params;
    await delay(50);

    const index = mockNotifications.findIndex((n) => n.id === id);

    if (index === -1) {
      return HttpResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    mockNotifications[index] = {
      ...mockNotifications[index],
      read: true,
    };

    return HttpResponse.json(mockNotifications[index]);
  }),

  // POST /api/notifications/mark-all-read
  http.post('/api/notifications/mark-all-read', async ({ request }) => {
    const body = await request.json() as { projectId?: string };
    await delay(100);

    mockNotifications = mockNotifications.map((n) => {
      if (body.projectId && n.metadata?.projectId !== body.projectId) {
        return n;
      }
      return { ...n, read: true };
    });

    return HttpResponse.json({
      success: true,
      markedCount: mockNotifications.length,
    });
  }),

  // DELETE /api/notifications/:id
  http.delete('/api/notifications/:id', async ({ params }) => {
    const { id } = params;
    await delay(50);

    const index = mockNotifications.findIndex((n) => n.id === id);

    if (index === -1) {
      return HttpResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    mockNotifications.splice(index, 1);

    return HttpResponse.json({ success: true });
  }),

  // DELETE /api/notifications (clear all)
  http.delete('/api/notifications', async ({ request }) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');

    await delay(100);

    if (projectId) {
      mockNotifications = mockNotifications.filter(
        (n) => n.metadata?.projectId !== projectId
      );
    } else {
      mockNotifications = [];
    }

    return HttpResponse.json({ success: true });
  }),

  // POST /api/notifications/preferences
  http.post('/api/notifications/preferences', async ({ request }) => {
    const preferences = await request.json();
    await delay(100);

    return HttpResponse.json({
      success: true,
      preferences,
    });
  }),

  // GET /api/notifications/preferences
  http.get('/api/notifications/preferences', async () => {
    await delay(50);

    return HttpResponse.json({
      email: true,
      push: true,
      inApp: true,
      types: {
        approval: true,
        milestone: true,
        message: true,
        alert: true,
        celebration: true,
      },
    });
  }),
];

/**
 * WebSocket event simulators
 * Use these to trigger real-time notification events in tests
 */
export const createWebSocketEventSimulators = () => {
  const handlers: ((event: string, data: unknown) => void)[] = [];

  return {
    /**
     * Register a handler for WebSocket events
     */
    onEvent: (handler: (event: string, data: unknown) => void) => {
      handlers.push(handler);
      return () => {
        const index = handlers.indexOf(handler);
        if (index > -1) handlers.splice(index, 1);
      };
    },

    /**
     * Simulate a milestone completed event
     */
    simulateMilestoneCompleted: (data: {
      projectId: string;
      milestoneId: string;
      title: string;
    }) => {
      handlers.forEach((h) => h('milestoneCompleted', data));
    },

    /**
     * Simulate an approval update event
     */
    simulateApprovalUpdate: (data: {
      projectId: string;
      approvalId: string;
      status: 'pending' | 'approved' | 'rejected';
    }) => {
      handlers.forEach((h) => h('approvalUpdate', data));
    },

    /**
     * Simulate a new message event
     */
    simulateNewMessage: (data: {
      projectId: string;
      threadId: string;
      senderId: string;
      senderName: string;
      preview: string;
    }) => {
      handlers.forEach((h) => h('newMessage', data));
    },

    /**
     * Simulate an activity update event
     */
    simulateActivityUpdate: (data: {
      projectId: string;
      activityType: string;
      description: string;
    }) => {
      handlers.forEach((h) => h('activityUpdate', data));
    },

    /**
     * Clear all handlers
     */
    clearHandlers: () => {
      handlers.length = 0;
    },
  };
};

/**
 * Error simulation handlers
 */
export const notificationErrorHandlers = [
  http.get('/api/notifications', async () => {
    await delay(100);
    return HttpResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }),

  http.patch('/api/notifications/:id/read', async () => {
    await delay(50);
    return HttpResponse.json(
      { error: 'Failed to mark as read' },
      { status: 500 }
    );
  }),
];
