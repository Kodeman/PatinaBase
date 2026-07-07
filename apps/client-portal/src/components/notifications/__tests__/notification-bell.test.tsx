/**
 * Tests for the unified NotificationBell component.
 *
 * The bell merges two sources:
 *   (a) derived "needs attention" items (pending decisions / awaiting proposals /
 *       pending scope changes) from useClientNotifications — localStorage read state
 *   (b) notification_log rows from useInboxNotifications — server read state
 * deduped so a log row with the same deep_link as a derived item wins once.
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
const mockUseInboxNotifications = jest.fn();
const mockMarkRead = jest.fn();
const mockMarkAllRead = jest.fn();

jest.mock('@patina/supabase', () => ({
  useClientNotifications: () => mockUseClientNotifications(),
  useInboxNotifications: () => mockUseInboxNotifications(),
  useInboxNotificationsRealtime: () => undefined,
  useMarkClientNotificationRead: () => ({ mutate: mockMarkRead }),
  useMarkAllClientNotificationsRead: () => ({ mutate: mockMarkAllRead }),
}));

const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

import { NotificationBell, mergeNotifications } from '../notification-bell';

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

function makeInbox(overrides: Record<string, any> = {}) {
  return {
    id: 'log-1',
    user_id: 'u1',
    type: 'delivery_update',
    channel: 'in_app',
    status: 'sent',
    template_id: null,
    metadata: { subject: 'Delivery scheduled', preview: 'Your sofa ships Friday' },
    opened_at: null,
    clicked_at: null,
    sent_at: null,
    created_at: '2024-02-15T08:00:00Z',
    ...overrides,
  };
}

describe('NotificationBell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseClientNotifications.mockReturnValue({
      data: mockNotifications,
      isLoading: false,
    });
    mockUseInboxNotifications.mockReturnValue({ data: [], isLoading: false });

    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { updated: 1 } }),
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

  it('shows unread count badge (derived unread only when no inbox)', () => {
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
    mockUseClientNotifications.mockReturnValue({ data: [], isLoading: false });
    mockUseInboxNotifications.mockReturnValue({ data: [], isLoading: false });
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByText(/caught up/i)).toBeInTheDocument();
  });

  it('calls markRead (localStorage) when a derived notification is clicked', () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    const items = screen.getAllByTestId('notification-item');
    fireEvent.click(items[0]);
    expect(mockMarkRead).toHaveBeenCalledWith('decision-1');
  });

  it('calls markAllRead with the derived unread ids when "Mark all read" is clicked', () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    fireEvent.click(screen.getByTestId('notification-mark-all-read'));
    expect(mockMarkAllRead).toHaveBeenCalledWith(['decision-1', 'scope_change-3']);
  });

  // ── Unified-bell behaviors ────────────────────────────────────────────────

  it('shows inbox (notification_log) rows alongside derived items', () => {
    mockUseInboxNotifications.mockReturnValue({ data: [makeInbox()], isLoading: false });
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(screen.getByText(/Delivery scheduled/)).toBeInTheDocument();
    expect(screen.getByText(/Decision needed/)).toBeInTheDocument();
  });

  it('dedupes a log row against a derived item with the same deep_link (log wins, shown once)', () => {
    // notification_log row that points at the SAME decision as derived decision-1
    const dupe = makeInbox({
      id: 'log-dupe',
      type: 'decision_required',
      metadata: {
        subject: 'Server: decision needed',
        deep_link: '/decisions/1',
      },
    });
    mockUseInboxNotifications.mockReturnValue({ data: [dupe], isLoading: false });
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId('notification-bell'));

    // The server row title shows...
    expect(screen.getByText(/Server: decision needed/)).toBeInTheDocument();
    // ...and the derived duplicate ("Decision needed" → /decisions/1) is gone.
    expect(screen.queryByText(/^Decision needed$/)).not.toBeInTheDocument();
  });

  it('marks an inbox row read via the inbox API when clicked', () => {
    mockUseClientNotifications.mockReturnValue({ data: [], isLoading: false });
    mockUseInboxNotifications.mockReturnValue({
      data: [makeInbox({ metadata: { subject: 'Delivery scheduled', deep_link: '/orders/9' } })],
      isLoading: false,
    });
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    fireEvent.click(screen.getByTestId('notification-item'));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/inbox/mark-read',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ids: ['log-1'] }),
      }),
    );
    // Derived localStorage path was NOT used for a server row.
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('mark-all-read marks both derived (localStorage) and inbox (API) unread', () => {
    mockUseInboxNotifications.mockReturnValue({
      data: [makeInbox({ id: 'log-1' }), makeInbox({ id: 'log-2', metadata: { subject: 'Read one', read_at: '2024-01-01T00:00:00Z' } })],
      isLoading: false,
    });
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    fireEvent.click(screen.getByTestId('notification-mark-all-read'));

    expect(mockMarkAllRead).toHaveBeenCalledWith(['decision-1', 'scope_change-3']);
    // Only the unread log row (log-1) is sent to the API; the read one is skipped.
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/inbox/mark-read',
      expect.objectContaining({ body: JSON.stringify({ ids: ['log-1'] }) }),
    );
  });
});

describe('mergeNotifications', () => {
  const derived = [
    { id: 'decision-1', kind: 'decision' as const, title: 'Decision needed', message: 'x', url: '/decisions/1', created_at: '2024-02-14T10:30:00Z', read_at: null },
  ];

  it('keeps distinct derived + inbox items, newest first', () => {
    const inbox = [makeInbox({ id: 'log-1', created_at: '2024-02-15T00:00:00Z', metadata: { subject: 'A', deep_link: '/orders/1' } })];
    const merged = mergeNotifications(derived as any, inbox as any);
    expect(merged).toHaveLength(2);
    expect(merged[0].source).toBe('inbox'); // 02-15 newer than 02-14
    expect(merged[1].source).toBe('derived');
  });

  it('dedupes on deep_link — the inbox row wins and appears once', () => {
    const inbox = [makeInbox({ id: 'log-1', metadata: { subject: 'Server decision', deep_link: '/decisions/1' } })];
    const merged = mergeNotifications(derived as any, inbox as any);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('inbox');
    expect(merged[0].title).toBe('Server decision');
  });

  it('derives read state from read_at (derived) and metadata.read_at (inbox)', () => {
    const inbox = [makeInbox({ id: 'log-1', metadata: { subject: 'A', deep_link: '/orders/1', read_at: '2024-01-01T00:00:00Z' } })];
    const merged = mergeNotifications(derived as any, inbox as any);
    const inboxItem = merged.find((m) => m.source === 'inbox')!;
    const derivedItem = merged.find((m) => m.source === 'derived')!;
    expect(inboxItem.read).toBe(true);
    expect(derivedItem.read).toBe(false);
  });
});
