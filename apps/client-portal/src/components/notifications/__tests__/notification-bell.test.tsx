/**
 * Tests for NotificationBell component
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// Mock @patina/design-system
jest.mock('@patina/design-system', () => ({
  Button: ({ children, onClick, variant, size, className }: any) => (
    <button onClick={onClick} data-variant={variant} data-size={size} className={className}>
      {children}
    </button>
  ),
}));

// Mock date-fns
jest.mock('date-fns', () => ({
  formatDistanceToNow: jest.fn(() => '5 minutes ago'),
}));

// Mock useNotifications hook
const mockUseNotifications = jest.fn();
jest.mock('@/hooks/use-notifications', () => ({
  useNotifications: (options: any) => mockUseNotifications(options),
}));

import { NotificationBell } from '../notification-bell';
import type { AppNotification } from '@/hooks/use-notifications';

// Mock notifications
const mockNotifications: AppNotification[] = [
  {
    id: 'notif-1',
    type: 'approval',
    title: 'Approval Required',
    message: 'Fabric selection needs your approval',
    timestamp: new Date('2024-02-14T10:30:00Z'),
    read: false,
    actionUrl: '/projects/123/approvals/456',
  },
  {
    id: 'notif-2',
    type: 'milestone',
    title: 'Milestone Completed',
    message: 'Design phase has been completed',
    timestamp: new Date('2024-02-13T15:00:00Z'),
    read: true,
  },
  {
    id: 'notif-3',
    type: 'message',
    title: 'New Message',
    message: 'Designer sent you a message about your project',
    timestamp: new Date('2024-02-12T09:00:00Z'),
    read: false,
  },
];

describe('NotificationBell', () => {
  const defaultMockReturn = {
    notifications: mockNotifications,
    unreadCount: 2,
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    clearNotification: jest.fn(),
    clearAll: jest.fn(),
    requestPermission: jest.fn().mockResolvedValue(true),
    isConnected: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNotifications.mockReturnValue(defaultMockReturn);

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
  });

  describe('bell button', () => {
    it('should render bell button', () => {
      render(<NotificationBell />);

      const button = screen.getByRole('button', { name: /notifications/i });
      expect(button).toBeInTheDocument();
    });

    it('should show unread count badge', () => {
      render(<NotificationBell />);

      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('should display "99+" when unread count exceeds 99', () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        unreadCount: 150,
      });

      render(<NotificationBell />);

      expect(screen.getByText('99+')).toBeInTheDocument();
    });

    it('should not show badge when unread count is 0', () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        unreadCount: 0,
      });

      render(<NotificationBell />);

      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('should show green connection indicator when connected', () => {
      render(<NotificationBell />);

      const indicator = screen.getByTitle('Connected');
      expect(indicator).toHaveClass('bg-green-400');
    });

    it('should show gray connection indicator when disconnected', () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        isConnected: false,
      });

      render(<NotificationBell />);

      const indicator = screen.getByTitle('Disconnected');
      expect(indicator).toHaveClass('bg-gray-300');
    });

    it('should include unread count in aria-label', () => {
      render(<NotificationBell />);

      const button = screen.getByRole('button', { name: /notifications \(2 unread\)/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe('dropdown toggle', () => {
    it('should open dropdown when bell is clicked', async () => {
      render(<NotificationBell />);

      const bellButton = screen.getByRole('button', { name: /notifications/i });
      await act(async () => {
        fireEvent.click(bellButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
      });
    });

    it('should close dropdown when bell is clicked again', async () => {
      render(<NotificationBell />);

      const bellButton = screen.getByRole('button', { name: /notifications/i });
      await act(async () => {
        fireEvent.click(bellButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(bellButton);
      });

      await waitFor(() => {
        expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
      });
    });

    it('should close dropdown when clicking outside', async () => {
      render(
        <div>
          <NotificationBell />
          <div data-testid="outside">Outside</div>
        </div>
      );

      const bellButton = screen.getByRole('button', { name: /notifications/i });
      await act(async () => {
        fireEvent.click(bellButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
      });

      fireEvent.mouseDown(screen.getByTestId('outside'));
      expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
    });
  });

  describe('notification list', () => {
    const openDropdown = async () => {
      render(<NotificationBell />);
      const bellButton = screen.getByRole('button', { name: /notifications/i });
      await act(async () => {
        fireEvent.click(bellButton);
      });
      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
      });
    };

    it('should display notifications', async () => {
      await openDropdown();
      expect(screen.getByText('Approval Required')).toBeInTheDocument();
      expect(screen.getByText('Milestone Completed')).toBeInTheDocument();
      expect(screen.getByText('New Message')).toBeInTheDocument();
    });

    it('should display notification messages', async () => {
      await openDropdown();
      expect(screen.getByText('Fabric selection needs your approval')).toBeInTheDocument();
    });

    it('should display timestamps in notification items', async () => {
      await openDropdown();
      // Check for timestamp elements (text-xs text-gray-400 class)
      const timestampElements = document.querySelectorAll('.text-gray-400.text-xs');
      expect(timestampElements.length).toBeGreaterThan(0);
    });

    it('should show "Mark all read" button when there are unread notifications', async () => {
      await openDropdown();
      expect(screen.getByText('Mark all read')).toBeInTheDocument();
    });

    it('should show "Clear" button when there are notifications', async () => {
      await openDropdown();
      expect(screen.getByText('Clear')).toBeInTheDocument();
    });

    it('should show "View all notifications" footer button', async () => {
      await openDropdown();
      expect(screen.getByText('View all notifications')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show empty state when no notifications', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [],
        unreadCount: 0,
      });

      render(<NotificationBell />);
      const bellButton = screen.getByRole('button', { name: /notifications/i });
      await act(async () => {
        fireEvent.click(bellButton);
      });

      await waitFor(() => {
        expect(screen.getByText('No notifications yet')).toBeInTheDocument();
      });
      expect(screen.getByText("We'll notify you about milestones and updates")).toBeInTheDocument();
    });

    it('should not show "Mark all read" when no unread notifications', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [{ ...mockNotifications[1] }], // Only read notification
        unreadCount: 0,
      });

      render(<NotificationBell />);
      const bellButton = screen.getByRole('button', { name: /notifications/i });
      await act(async () => {
        fireEvent.click(bellButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
      });
      expect(screen.queryByText('Mark all read')).not.toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should call markAllAsRead when "Mark all read" is clicked', async () => {
      const markAllAsRead = jest.fn();
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        markAllAsRead,
      });

      render(<NotificationBell />);
      const bellButton = screen.getByRole('button', { name: /notifications/i });
      await act(async () => {
        fireEvent.click(bellButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Mark all read')).toBeInTheDocument();
      });

      const markAllReadButton = screen.getByText('Mark all read');
      fireEvent.click(markAllReadButton);

      expect(markAllAsRead).toHaveBeenCalled();
    });

    it('should call clearAll when "Clear" is clicked', async () => {
      const clearAll = jest.fn();
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        clearAll,
      });

      render(<NotificationBell />);
      const bellButton = screen.getByRole('button', { name: /notifications/i });
      await act(async () => {
        fireEvent.click(bellButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Clear')).toBeInTheDocument();
      });

      const clearButton = screen.getByText('Clear');
      fireEvent.click(clearButton);

      expect(clearAll).toHaveBeenCalled();
    });

    it('should mark notification as read and navigate when clicked', async () => {
      const markAsRead = jest.fn();
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        markAsRead,
      });

      render(<NotificationBell />);
      const bellButton = screen.getByRole('button', { name: /notifications/i });
      await act(async () => {
        fireEvent.click(bellButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Approval Required')).toBeInTheDocument();
      });

      // Click the first notification (has actionUrl)
      const notificationButton = screen.getByText('Approval Required').closest('button');
      if (notificationButton) {
        fireEvent.click(notificationButton);
      }

      expect(markAsRead).toHaveBeenCalledWith('notif-1');
      expect(window.location.href).toBe('/projects/123/approvals/456');
    });

    it('should mark notification as read without navigation when no actionUrl', async () => {
      const markAsRead = jest.fn();
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        markAsRead,
      });

      render(<NotificationBell />);
      const bellButton = screen.getByRole('button', { name: /notifications/i });
      await act(async () => {
        fireEvent.click(bellButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Milestone Completed')).toBeInTheDocument();
      });

      // Click the milestone notification (no actionUrl)
      const notificationButton = screen.getByText('Milestone Completed').closest('button');
      if (notificationButton) {
        fireEvent.click(notificationButton);
      }

      expect(markAsRead).toHaveBeenCalledWith('notif-2');
    });

    it('should close dropdown after clicking a notification', async () => {
      render(<NotificationBell />);
      const bellButton = screen.getByRole('button', { name: /notifications/i });
      await act(async () => {
        fireEvent.click(bellButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Milestone Completed')).toBeInTheDocument();
      });

      const notificationButton = screen.getByText('Milestone Completed').closest('button');
      if (notificationButton) {
        fireEvent.click(notificationButton);
      }

      expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
    });
  });

  describe('notification permission', () => {
    beforeEach(() => {
      // Mock Notification API
      Object.defineProperty(window, 'Notification', {
        value: {
          permission: 'default',
        },
        writable: true,
      });
    });

    it('should request notification permission on first open when permission is default', async () => {
      const requestPermission = jest.fn().mockResolvedValue(true);
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        requestPermission,
      });

      render(<NotificationBell />);
      const bellButton = screen.getByRole('button', { name: /notifications/i });
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(requestPermission).toHaveBeenCalled();
      });
    });

    it('should not request permission when already granted', async () => {
      Object.defineProperty(window, 'Notification', {
        value: {
          permission: 'granted',
        },
        writable: true,
      });

      const requestPermission = jest.fn().mockResolvedValue(true);
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        requestPermission,
      });

      render(<NotificationBell />);
      const bellButton = screen.getByRole('button', { name: /notifications/i });
      fireEvent.click(bellButton);

      // requestPermission should not be called
      expect(requestPermission).not.toHaveBeenCalled();
    });
  });

  describe('notification item styling', () => {
    it('should apply different background for unread notifications', async () => {
      render(<NotificationBell />);
      const bellButton = screen.getByRole('button', { name: /notifications/i });
      await act(async () => {
        fireEvent.click(bellButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Approval Required')).toBeInTheDocument();
      });

      // Unread notification should have different background
      const unreadItem = screen.getByText('Approval Required').closest('li');
      expect(unreadItem).toHaveClass('bg-blue-50/30');

      // Read notification should have white background
      const readItem = screen.getByText('Milestone Completed').closest('li');
      expect(readItem).toHaveClass('bg-white');
    });

    it('should show unread indicator dot for unread notifications', async () => {
      render(<NotificationBell />);
      const bellButton = screen.getByRole('button', { name: /notifications/i });
      await act(async () => {
        fireEvent.click(bellButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Approval Required')).toBeInTheDocument();
      });

      // Check for blue dot indicator (unread marker)
      const unreadDots = document.querySelectorAll('.bg-primary-500');
      expect(unreadDots.length).toBeGreaterThan(0);
    });
  });

  describe('projectId filtering', () => {
    it('should pass projectId to useNotifications hook', () => {
      render(<NotificationBell projectId="project-123" />);

      expect(mockUseNotifications).toHaveBeenCalledWith({ projectId: 'project-123' });
    });

    it('should work without projectId', () => {
      render(<NotificationBell />);

      expect(mockUseNotifications).toHaveBeenCalledWith({ projectId: undefined });
    });
  });

  describe('custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(<NotificationBell className="custom-class" />);

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});
