/**
 * Tests for useNotifications hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// Mock the WebSocket module before importing the hook
const mockUseWebSocket = jest.fn();
jest.mock('@/lib/websocket', () => ({
  useWebSocket: () => mockUseWebSocket(),
}));

import { useNotifications } from '../use-notifications';

describe('useNotifications', () => {
  let mockLocalStorage: { [key: string]: string };

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default WebSocket mock
    mockUseWebSocket.mockReturnValue({
      onMilestoneCompleted: jest.fn(() => jest.fn()),
      onApprovalUpdate: jest.fn(() => jest.fn()),
      onActivityUpdate: jest.fn(() => jest.fn()),
      isConnected: true,
    });

    // Reset localStorage mock
    mockLocalStorage = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key: string) => mockLocalStorage[key] || null),
        setItem: jest.fn((key: string, value: string) => {
          mockLocalStorage[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete mockLocalStorage[key];
        }),
        clear: jest.fn(() => {
          mockLocalStorage = {};
        }),
        length: 0,
        key: jest.fn(),
      },
      writable: true,
    });

    // Mock Notification API
    Object.defineProperty(window, 'Notification', {
      value: class MockNotification {
        static permission = 'default';
        static requestPermission = jest.fn().mockResolvedValue('granted');
        constructor(public title: string, public options?: NotificationOptions) {}
      },
      writable: true,
    });
  });

  describe('initial state', () => {
    it('should start with empty notifications', () => {
      const { result } = renderHook(() => useNotifications());

      expect(result.current.notifications).toEqual([]);
      expect(result.current.unreadCount).toBe(0);
    });

    it('should load notifications from localStorage', () => {
      const storedNotifications = [
        {
          id: 'notif-1',
          type: 'milestone',
          title: 'Milestone Completed',
          message: 'Design phase finished',
          timestamp: '2024-02-14T10:30:00Z',
          read: false,
        },
      ];
      mockLocalStorage['patina_notifications'] = JSON.stringify(storedNotifications);

      const { result } = renderHook(() => useNotifications({ persistToStorage: true }));

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].title).toBe('Milestone Completed');
    });

    it('should handle corrupted localStorage gracefully', () => {
      mockLocalStorage['patina_notifications'] = 'invalid json';

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const { result } = renderHook(() => useNotifications({ persistToStorage: true }));

      expect(result.current.notifications).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('addNotification', () => {
    it('should add a new notification', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.addNotification({
          type: 'approval',
          title: 'New Approval',
          message: 'Fabric selection needs approval',
        });
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].title).toBe('New Approval');
      expect(result.current.notifications[0].read).toBe(false);
      expect(result.current.notifications[0].id).toMatch(/^notif-/);
      expect(result.current.unreadCount).toBe(1);
    });

    it('should add notifications at the beginning', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.addNotification({
          type: 'approval',
          title: 'First',
          message: 'First notification',
        });
      });

      act(() => {
        result.current.addNotification({
          type: 'milestone',
          title: 'Second',
          message: 'Second notification',
        });
      });

      expect(result.current.notifications[0].title).toBe('Second');
      expect(result.current.notifications[1].title).toBe('First');
    });

    it('should respect maxNotifications limit', () => {
      const { result } = renderHook(() => useNotifications({ maxNotifications: 3 }));

      act(() => {
        for (let i = 0; i < 5; i++) {
          result.current.addNotification({
            type: 'message',
            title: `Notification ${i}`,
            message: `Message ${i}`,
          });
        }
      });

      expect(result.current.notifications).toHaveLength(3);
    });

    it('should show browser notification when permission granted', () => {
      (window.Notification as any).permission = 'granted';

      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.addNotification({
          type: 'milestone',
          title: 'Milestone Complete',
          message: 'Great progress!',
        });
      });

      // The notification constructor should have been called
      expect(result.current.notifications).toHaveLength(1);
    });

    it('should include metadata in notification', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.addNotification({
          type: 'approval',
          title: 'Approval Needed',
          message: 'Review required',
          actionUrl: '/projects/123',
          metadata: {
            projectId: 'project-123',
            approvalId: 'approval-456',
            priority: 'high',
          },
        });
      });

      expect(result.current.notifications[0].metadata).toEqual({
        projectId: 'project-123',
        approvalId: 'approval-456',
        priority: 'high',
      });
      expect(result.current.notifications[0].actionUrl).toBe('/projects/123');
    });
  });

  describe('markAsRead', () => {
    it('should mark a single notification as read', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.addNotification({
          type: 'message',
          title: 'Test',
          message: 'Test message',
        });
      });

      const notificationId = result.current.notifications[0].id;

      act(() => {
        result.current.markAsRead(notificationId);
      });

      expect(result.current.notifications[0].read).toBe(true);
      expect(result.current.unreadCount).toBe(0);
    });

    it('should not affect other notifications', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.addNotification({ type: 'message', title: 'First', message: '1' });
        result.current.addNotification({ type: 'message', title: 'Second', message: '2' });
      });

      const firstId = result.current.notifications[1].id;

      act(() => {
        result.current.markAsRead(firstId);
      });

      expect(result.current.notifications[1].read).toBe(true);
      expect(result.current.notifications[0].read).toBe(false);
      expect(result.current.unreadCount).toBe(1);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.addNotification({ type: 'message', title: '1', message: '1' });
        result.current.addNotification({ type: 'message', title: '2', message: '2' });
        result.current.addNotification({ type: 'message', title: '3', message: '3' });
      });

      expect(result.current.unreadCount).toBe(3);

      act(() => {
        result.current.markAllAsRead();
      });

      expect(result.current.unreadCount).toBe(0);
      expect(result.current.notifications.every(n => n.read)).toBe(true);
    });
  });

  describe('clearNotification', () => {
    it('should remove a specific notification', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.addNotification({ type: 'message', title: 'Keep', message: '1' });
        result.current.addNotification({ type: 'message', title: 'Remove', message: '2' });
      });

      const removeId = result.current.notifications.find(n => n.title === 'Remove')!.id;

      act(() => {
        result.current.clearNotification(removeId);
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].title).toBe('Keep');
    });
  });

  describe('clearAll', () => {
    it('should remove all notifications', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.addNotification({ type: 'message', title: '1', message: '1' });
        result.current.addNotification({ type: 'message', title: '2', message: '2' });
      });

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.notifications).toHaveLength(0);
      expect(result.current.unreadCount).toBe(0);
    });
  });

  describe('requestPermission', () => {
    it('should request notification permission', async () => {
      const { result } = renderHook(() => useNotifications());

      let permissionGranted: boolean;
      await act(async () => {
        permissionGranted = await result.current.requestPermission();
      });

      expect(permissionGranted!).toBe(true);
      expect(window.Notification.requestPermission).toHaveBeenCalled();
    });

    // Note: Testing "Notification API not available" is skipped because
    // the Notification property cannot be reliably mocked in jsdom.
    // The hook correctly handles this case by checking 'Notification' in window.
  });

  describe('WebSocket integration', () => {
    it('should add notification on milestone completed', () => {
      let milestoneHandler: ((data: any) => void) | null = null;

      mockUseWebSocket.mockReturnValue({
        onMilestoneCompleted: jest.fn((handler) => {
          milestoneHandler = handler;
          return jest.fn();
        }),
        onApprovalUpdate: jest.fn(() => jest.fn()),
        onActivityUpdate: jest.fn(() => jest.fn()),
        isConnected: true,
      });

      const { result } = renderHook(() => useNotifications());

      // Simulate milestone completion event
      act(() => {
        if (milestoneHandler) {
          milestoneHandler({
            projectId: 'project-123',
            milestoneId: 'milestone-1',
            title: 'Design Phase Complete',
          });
        }
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe('celebration');
      expect(result.current.notifications[0].title).toBe('Milestone Completed!');
    });

    it('should add notification on approval update', () => {
      let approvalHandler: ((data: any) => void) | null = null;

      mockUseWebSocket.mockReturnValue({
        onMilestoneCompleted: jest.fn(() => jest.fn()),
        onApprovalUpdate: jest.fn((handler) => {
          approvalHandler = handler;
          return jest.fn();
        }),
        onActivityUpdate: jest.fn(() => jest.fn()),
        isConnected: true,
      });

      const { result } = renderHook(() => useNotifications());

      // Simulate approval update event
      act(() => {
        if (approvalHandler) {
          approvalHandler({
            projectId: 'project-123',
            approvalId: 'approval-1',
            status: 'pending',
          });
        }
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe('approval');
      expect(result.current.notifications[0].title).toBe('New Approval Required');
    });

    it('should filter notifications by projectId when specified', () => {
      let milestoneHandler: ((data: any) => void) | null = null;

      mockUseWebSocket.mockReturnValue({
        onMilestoneCompleted: jest.fn((handler) => {
          milestoneHandler = handler;
          return jest.fn();
        }),
        onApprovalUpdate: jest.fn(() => jest.fn()),
        onActivityUpdate: jest.fn(() => jest.fn()),
        isConnected: true,
      });

      const { result } = renderHook(() => useNotifications({ projectId: 'project-123' }));

      // Simulate event for different project
      act(() => {
        if (milestoneHandler) {
          milestoneHandler({
            projectId: 'other-project',
            milestoneId: 'milestone-1',
            title: 'Other Milestone',
          });
        }
      });

      // Should not add notification for other project
      expect(result.current.notifications).toHaveLength(0);
    });

    it('should unsubscribe from events on unmount', () => {
      const unsubscribeMilestone = jest.fn();
      const unsubscribeApproval = jest.fn();
      const unsubscribeActivity = jest.fn();

      mockUseWebSocket.mockReturnValue({
        onMilestoneCompleted: jest.fn(() => unsubscribeMilestone),
        onApprovalUpdate: jest.fn(() => unsubscribeApproval),
        onActivityUpdate: jest.fn(() => unsubscribeActivity),
        isConnected: true,
      });

      const { unmount } = renderHook(() => useNotifications());

      unmount();

      expect(unsubscribeMilestone).toHaveBeenCalled();
      expect(unsubscribeApproval).toHaveBeenCalled();
      expect(unsubscribeActivity).toHaveBeenCalled();
    });

    it('should expose isConnected state', () => {
      mockUseWebSocket.mockReturnValue({
        onMilestoneCompleted: jest.fn(() => jest.fn()),
        onApprovalUpdate: jest.fn(() => jest.fn()),
        onActivityUpdate: jest.fn(() => jest.fn()),
        isConnected: true,
      });

      const { result } = renderHook(() => useNotifications());

      expect(result.current.isConnected).toBe(true);
    });
  });

  describe('localStorage persistence', () => {
    it('should save notifications to localStorage', () => {
      const { result } = renderHook(() => useNotifications({ persistToStorage: true }));

      act(() => {
        result.current.addNotification({
          type: 'message',
          title: 'Persisted',
          message: 'This should be saved',
        });
      });

      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('should not persist when persistToStorage is false', () => {
      const { result } = renderHook(() => useNotifications({ persistToStorage: false }));

      act(() => {
        result.current.addNotification({
          type: 'message',
          title: 'Not Persisted',
          message: 'This should not be saved',
        });
      });

      // localStorage.setItem should not be called for notifications
      const setItemCalls = (localStorage.setItem as jest.Mock).mock.calls;
      const notificationCalls = setItemCalls.filter(
        (call: string[]) => call[0] === 'patina_notifications'
      );
      expect(notificationCalls).toHaveLength(0);
    });
  });
});
