import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/* The boundary is the hook modules `use-project-correspondence` imports —
   `@patina/supabase`'s comms/inbox hooks and `use-auth` — not supabase-js
   under them. Specifiers match the imports exactly; a near-miss silently
   no-ops (patina-testing). */
jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useThreads: jest.fn(),
  useThreadMessages: jest.fn(),
  useThreadRealtime: jest.fn(),
  useInboxNotifications: jest.fn(),
  useInboxNotificationsRealtime: jest.fn(),
  useSendMessage: jest.fn(),
  useMuteThread: jest.fn(),
  useMarkThreadRead: jest.fn(),
}));

jest.mock('@/hooks/use-auth', () => ({
  __esModule: true,
  useAuth: jest.fn(),
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  clientEvents: { messageSend: jest.fn() },
}));

import {
  useInboxNotifications,
  useInboxNotificationsRealtime,
  useMarkThreadRead,
  useMuteThread,
  useSendMessage,
  useThreadMessages,
  useThreadRealtime,
  useThreads,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { clientEvents } from '@/lib/analytics/events';

import {
  useMarkLettersRead,
  useMarkNoticesRead,
  useMuteLetters,
  useProjectCorrespondence,
  useWriteBack,
} from '../use-project-correspondence';

const threadsMock = useThreads as jest.Mock;
const messagesMock = useThreadMessages as jest.Mock;
const realtimeMock = useThreadRealtime as jest.Mock;
const noticesMock = useInboxNotifications as jest.Mock;
const noticesRealtimeMock = useInboxNotificationsRealtime as jest.Mock;
const sendMock = useSendMessage as jest.Mock;
const muteMock = useMuteThread as jest.Mock;
const markThreadReadMock = useMarkThreadRead as jest.Mock;
const authMock = useAuth as jest.Mock;

const PROJECT = 'proj-vale';
const READER = 'user-harper';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

const THREAD = {
  id: 'thr-1',
  kind: 'project',
  project_id: PROJECT,
  last_message_at: '2026-08-04T09:00:00.000Z',
  my_participant: { muted_at: null },
};

const MESSAGE = {
  id: 'm-1',
  thread_id: 'thr-1',
  sender_id: 'user-nora',
  body: 'The sconces ship Friday.',
  attachments: [],
  system: false,
  deleted_at: null,
  created_at: '2026-08-04T09:00:00.000Z',
  sender: { id: 'user-nora', full_name: 'Nora Quist', avatar_url: null },
};

const NOTICE = {
  id: 'n-1',
  user_id: READER,
  type: 'invoice_sent',
  channel: 'email',
  status: 'sent',
  template_id: null,
  metadata: { project_id: PROJECT, subject: 'Invoice No. 4 is ready' },
  opened_at: null,
  clicked_at: null,
  sent_at: '2026-08-02T09:00:00.000Z',
  created_at: '2026-08-02T09:00:00.000Z',
};

function messagesQuery(over: Record<string, unknown> = {}) {
  return {
    data: { pages: [[MESSAGE]] },
    isPending: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  authMock.mockReturnValue({ user: { id: READER } });
  threadsMock.mockReturnValue({ data: [THREAD], isPending: false });
  messagesMock.mockReturnValue(messagesQuery());
  realtimeMock.mockReturnValue(undefined);
  noticesMock.mockReturnValue({ data: [], isPending: false });
  noticesRealtimeMock.mockReturnValue(undefined);
  sendMock.mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue(undefined), isPending: false });
  muteMock.mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue(undefined), isPending: false });
  markThreadReadMock.mockReturnValue({ mutate: jest.fn(), isPending: false });
});

describe('useProjectCorrespondence', () => {
  it('reads this house’s thread, its letters and their moments', () => {
    const { result } = renderHook(() => useProjectCorrespondence(PROJECT), { wrapper });

    expect(threadsMock).toHaveBeenCalledWith({ projectId: PROJECT });
    expect(result.current.threadId).toBe('thr-1');
    expect(result.current.muted).toBe(false);
    expect(result.current.letters.map((letter) => letter.id)).toEqual(['m-1']);
    expect(result.current.sentAts).toEqual(['2026-08-04T09:00:00.000Z']);
    expect(result.current.isPending).toBe(false);
  });

  it('subscribes both halves of the post to their own realtime channels', () => {
    renderHook(() => useProjectCorrespondence(PROJECT), { wrapper });
    expect(realtimeMock).toHaveBeenCalledWith('thr-1');
    expect(noticesRealtimeMock).toHaveBeenCalled();
  });

  it('is silent, and never pending on the letters, when the house has no thread', () => {
    threadsMock.mockReturnValue({ data: [], isPending: false });
    messagesMock.mockReturnValue(messagesQuery({ data: undefined, isPending: true }));

    const { result } = renderHook(() => useProjectCorrespondence(PROJECT), { wrapper });

    expect(result.current.threadId).toBeNull();
    expect(result.current.letters).toEqual([]);
    expect(result.current.isPending).toBe(false);
  });

  it('is pending while the threads are still coming', () => {
    threadsMock.mockReturnValue({ data: undefined, isPending: true });
    const { result } = renderHook(() => useProjectCorrespondence(PROJECT), { wrapper });
    expect(result.current.isPending).toBe(true);
  });

  it('is pending while the notices are still coming — the region pops otherwise', () => {
    noticesMock.mockReturnValue({ data: undefined, isPending: true });
    const { result } = renderHook(() => useProjectCorrespondence(PROJECT), { wrapper });
    expect(result.current.isPending).toBe(true);
  });

  it('reports the mute state off the reader’s own participant row', () => {
    threadsMock.mockReturnValue({
      data: [{ ...THREAD, my_participant: { muted_at: '2026-08-04T00:00:00.000Z' } }],
      isPending: false,
    });
    const { result } = renderHook(() => useProjectCorrespondence(PROJECT), { wrapper });
    expect(result.current.muted).toBe(true);
  });

  it('files this house’s notices, names the unread ones, and leaves other houses alone', () => {
    noticesMock.mockReturnValue({
      data: [
        NOTICE,
        { ...NOTICE, id: 'n-read', metadata: { ...NOTICE.metadata, read_at: '2026-08-03' } },
        { ...NOTICE, id: 'n-other', metadata: { project_id: 'proj-other' } },
      ],
      isPending: false,
    });

    const { result } = renderHook(() => useProjectCorrespondence(PROJECT), { wrapper });

    expect(noticesMock).toHaveBeenCalledWith({ limit: 50 });
    expect(result.current.notices.map((notice) => notice.id)).toEqual(['n-1', 'n-read']);
    expect(result.current.notices[0].label).toBe('Invoice No. 4 is ready');
    expect(result.current.unreadNoticeIds).toEqual(['n-1']);
  });

  it('says the correspondence goes further back, and reads the next page on the act', () => {
    const fetchNextPage = jest.fn();
    messagesMock.mockReturnValue(messagesQuery({ hasNextPage: true, fetchNextPage }));

    const { result } = renderHook(() => useProjectCorrespondence(PROJECT), { wrapper });

    expect(result.current.hasEarlierLetters).toBe(true);
    result.current.readEarlierLetters();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});

describe('useWriteBack', () => {
  it('sends the letter and reports it the way /messages did', async () => {
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    sendMock.mockReturnValue({ mutateAsync, isPending: false });

    const { result } = renderHook(() => useWriteBack(), { wrapper });
    await result.current.send({ threadId: 'thr-1', body: 'Friday works.' });

    expect(mutateAsync).toHaveBeenCalledWith({ threadId: 'thr-1', body: 'Friday works.' });
    expect(clientEvents.messageSend).toHaveBeenCalledWith('thr-1');
  });
});

describe('useMuteLetters', () => {
  it('sends /messages’ own payload and refreshes the list the mat reads', async () => {
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    muteMock.mockReturnValue({ mutateAsync, isPending: false });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);

    const { result } = renderHook(() => useMuteLetters(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await result.current.toggle({ threadId: 'thr-1', muted: true });

    expect(mutateAsync).toHaveBeenCalledWith({ threadId: 'thr-1', muted: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['comms', 'threads'] });
  });

  it('lets a refusal reach the caller rather than swallowing it', async () => {
    muteMock.mockReturnValue({
      mutateAsync: jest.fn().mockRejectedValue(new Error('offline')),
      isPending: false,
    });

    const { result } = renderHook(() => useMuteLetters(), { wrapper });
    await expect(result.current.toggle({ threadId: 'thr-1', muted: true })).rejects.toThrow(
      'offline',
    );
  });
});

describe('useMarkLettersRead', () => {
  it('advances /messages’ own thread mark', () => {
    const mutate = jest.fn();
    markThreadReadMock.mockReturnValue({ mutate, isPending: false });

    const { result } = renderHook(() => useMarkLettersRead(), { wrapper });
    result.current('thr-1');

    expect(mutate).toHaveBeenCalledWith('thr-1');
  });
});

describe('useMarkNoticesRead', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts /inbox’s mark-read for this house’s notices alone', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useMarkNoticesRead(), { wrapper });
    result.current(['n-1', 'n-2']);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/inbox/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['n-1', 'n-2'] }),
    });
  });

  it('posts nothing at all when this house has no unread notice', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useMarkNoticesRead(), { wrapper });
    result.current([]);

    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
