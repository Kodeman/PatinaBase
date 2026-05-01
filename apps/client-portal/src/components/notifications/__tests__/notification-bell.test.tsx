/**
 * Tests for NotificationBell component
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

jest.mock('@patina/design-system', () => ({
  Button: ({ children, onClick, ...rest }: any) => (
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

jest.mock('date-fns', () => ({
  formatDistanceToNow: jest.fn(() => '5 minutes ago'),
}));

const mockUseClientNotifications = jest.fn();
const mockMarkRead = jest.fn();
const mockMarkAllRead = jest.fn();

jest.mock('@patina/supabase', () => ({
  useClientNotifications: () => mockUseClientNotifications(),
  useMarkClientNotificationRead: () => ({ mutate: mockMarkRead }),
  useMarkAllClientNotificationsRead: () => ({ mutate: mockMarkAllRead }),
}));

import { NotificationBell } from '../notification-bell';

const mockNotifications = [
  {
    id: 'decision-1',
    kind: 'decision' as const,
    title: 'Decision needed',
    message: 'Fabric selection',
    url: '/decisions/1',
    created_at: '2024-02-14T10:30:00Z',
    read_at: null,
  },
  {
    id: 'proposal-2',
    kind: 'proposal' as const,
    title: 'Proposal awaiting review',
    message: 'Living room',
    url: '/proposals/2',
    created_at: '2024-02-13T15:00:00Z',
    read_at: '2024-02-13T16:00:00Z',
  },
  {
    id: 'scope_change-3',
    kind: 'scope_change' as const,
    title: 'Scope change to review',
    message: 'Bathroom',
    url: '/projects/p1/scope-change/3',
    created_at: '2024-02-12T09:00:00Z',
    read_at: null,
  },
];

describe('NotificationBell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseClientNotifications.mockReturnValue({
      data: mockNotifications,
      isLoading: false,
    });

    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
  });

  it('renders the bell button', () => {
    render(<NotificationBell />);
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
  });

  it('shows unread count badge', () => {
    render(<NotificationBell />);
    const badge = screen.getByTestId('notification-bell-count');
    expect(badge).toHaveTextContent('2');
  });

  it('hides badge when no unread notifications', () => {
    mockUseClientNotifications.mockReturnValue({
      data: mockNotifications.map((n) => ({ ...n, read_at: '2024-02-14T11:00:00Z' })),
      isLoading: false,
    });
    render(<NotificationBell />);
    expect(screen.queryByTestId('notification-bell-count')).not.toBeInTheDocument();
  });

  it('opens dropdown on click and shows notifications', () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByText(/Decision needed/)).toBeInTheDocument();
    expect(screen.getByText(/Proposal awaiting review/)).toBeInTheDocument();
    expect(screen.getByText(/Scope change to review/)).toBeInTheDocument();
  });

  it('renders empty state when no notifications', () => {
    mockUseClientNotifications.mockReturnValue({
      data: [],
      isLoading: false,
    });
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByText(/caught up/i)).toBeInTheDocument();
  });

  it('calls markRead when a notification is clicked', () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    const items = screen.getAllByTestId('notification-item');
    fireEvent.click(items[0]);
    expect(mockMarkRead).toHaveBeenCalledWith('decision-1');
  });

  it('calls markAllRead when "Mark all read" is clicked', () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    fireEvent.click(screen.getByTestId('notification-mark-all-read'));
    expect(mockMarkAllRead).toHaveBeenCalledWith(['decision-1', 'scope_change-3']);
  });
});
