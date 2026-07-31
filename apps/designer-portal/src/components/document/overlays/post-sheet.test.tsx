import { act, fireEvent, render, screen } from '@testing-library/react';
import { openPost, PostSheet } from './post-sheet';

const mockRouterPush = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockUseInboxNotifications = jest.fn();
const mockUseProcurementNotifications = jest.fn();
const mockUseInboxMessages = jest.fn();
const mockMarkProcurementRead = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('@patina/supabase', () => ({
  useInboxNotifications: (...args: unknown[]) =>
    mockUseInboxNotifications(...args),
  useInboxMessages: (...args: unknown[]) => mockUseInboxMessages(...args),
  useInboxNotificationsRealtime: jest.fn(),
  useProcurementNotifications: (...args: unknown[]) =>
    mockUseProcurementNotifications(...args),
  useMarkProcurementNotificationRead: () => ({
    mutateAsync: mockMarkProcurementRead,
  }),
}));

jest.mock('@/lib/document/post-derivation', () => ({
  inboxRecordItem: (item: unknown) => item,
  procurementRecordItem: (item: unknown) => item,
  mergeRecordItems: (inbox: unknown[], procurement: unknown[]) => [
    ...inbox,
    ...procurement,
  ],
  letterHref: (message: { thread_id: string }) =>
    `/people?thread=${message.thread_id}`,
  letterTitle: () => 'Henderson brief',
  relTime: () => 'Now',
}));

jest.mock('@/lib/help-system/use-sheet-surface-key', () => ({
  useSheetSurfaceKey: jest.fn(),
}));

jest.mock('@/lib/help-system/open-help', () => ({
  openHelp: jest.fn(),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

const recordItem = {
  key: 'inbox:notice-1',
  source: 'inbox',
  id: 'notice-1',
  createdAt: '2026-07-31T12:00:00.000Z',
  read: false,
  title: 'A decision is overdue',
  body: 'The foyer finish still needs an answer.',
  typeLabel: 'Decision',
  row: {
    kind: 'cross_reference',
    href: '/desk',
    onDesk: true,
    needKind: 'overdue_decision',
  },
};

const letter = {
  thread_id: 'thread-1',
  created_at: '2026-07-31T13:00:00.000Z',
  is_unread: true,
  deleted_at: null,
  body: 'Could we revisit the entry console?',
  system: false,
  sender: { full_name: 'Mara Henderson' },
};

const originalFetch = global.fetch;

beforeEach(() => {
  mockRouterPush.mockReset();
  mockInvalidateQueries.mockReset();
  mockMarkProcurementRead.mockReset();
  mockUseInboxNotifications.mockReturnValue({
    data: [recordItem],
    isLoading: false,
  });
  mockUseProcurementNotifications.mockReturnValue({
    data: [],
    isLoading: false,
  });
  mockUseInboxMessages.mockReturnValue({ data: [letter], isLoading: false });
  global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;
});

afterEach(() => {
  global.fetch = originalFetch;
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
});

describe('PostSheet quiet ledger', () => {
  it('keeps page controls and Record/Letter rows in a readable two-line hierarchy', () => {
    render(<PostSheet />);
    act(() => openPost());

    expect(screen.getByRole('dialog', { name: /The Post/ })).toBeInTheDocument();
    const recordPage = screen.getByRole('button', { name: 'The Record' });
    const lettersPage = screen.getByRole('button', { name: 'Letters' });
    expect(recordPage).toHaveAttribute('aria-current', 'page');
    expect(recordPage).toHaveClass('min-h-[44px]');
    expect(lettersPage).toHaveClass('min-h-[44px]');

    const recordRow = screen.getByTestId('post-record-row');
    expect(recordRow).toHaveAttribute('data-overlay-post-row', 'record');
    expect(recordRow).toHaveAttribute('data-cross-reference', 'true');
    expect(recordRow).toHaveClass('min-h-11');
    expect(
      recordRow.querySelector('[data-overlay-post-row-title]'),
    ).toHaveClass('text-[14px]');
    expect(
      recordRow.querySelector('[data-overlay-post-row-body]'),
    ).toHaveClass('text-[14px]', 'line-clamp-1');
    expect(
      recordRow.querySelector('[data-overlay-post-row-meta]'),
    ).toHaveClass('text-[12px]');

    fireEvent.click(lettersPage);
    expect(lettersPage).toHaveAttribute('aria-current', 'page');
    const letterRow = screen.getByTestId('post-letter-row');
    expect(letterRow).toHaveAttribute('data-overlay-post-row', 'letter');
    expect(
      letterRow.querySelector('[data-overlay-post-row-title]'),
    ).toHaveClass('text-[14px]');
    expect(
      letterRow.querySelector('[data-overlay-post-row-meta]'),
    ).toHaveClass('text-[12px]');

    fireEvent.click(recordPage);
    fireEvent.click(screen.getByTestId('post-record-row'));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/inbox/mark-read',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockRouterPush).toHaveBeenCalledWith('/desk');
  });
});
