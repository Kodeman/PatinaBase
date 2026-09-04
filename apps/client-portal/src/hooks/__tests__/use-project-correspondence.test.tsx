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
  useSendMessage: jest.fn(),
  useMuteThread: jest.fn(),
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
  useMuteThread,
  useSendMessage,
  useThreadMessages,
  useThreadRealtime,
  useThreads,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { clientEvents } from '@/lib/analytics/events';

import {
  useMarkNoticesRead,
  useProjectCorrespondence,
  useWriteBack,
} from '../use-project-correspondence';

const threadsMock = useThreads as jest.Mock;
const messagesMock = useThreadMessages as jest.Mock;
const realtimeMock = useThreadRealtime as jest.Mock;
const noticesMock = useInboxNotifications as jest.Mock;
const sendMock = useSendMessage as jest.Mock;
const muteMock = useMuteThread as jest.Mock;
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

beforeEach(() => {
  jest.clearAllMocks();
  authMock.mockReturnValue({ user: { id: READER } });
  threadsMock.mockReturnValue({ data: [THREAD], isPending: false });
  messagesMock.mockReturnValue({ data: { pages: [[MESSAGE]] }, isPending: false });
  realtimeMock.mockReturnValue(undefined);
  noticesMock.mockReturnValue({ data: [], isPending: false });
  sendMock.mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue(undefined), isPending: false });
  muteMock.mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue(undefined), isPending: false });
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

  it('subscribes the thread to its own realtime channel', () => {
    renderHook(() => useProjectCorrespondence(PROJECT), { wrapper });
    expect(realtimeMock).toHaveBeenCalledWith('thr-1');
  });

  it('is silent, and never pending on the letters, when the house has no thread', () => {
    threadsMock.mockReturnValue({ data: [], isPending: false });
    messagesMock.mockReturnValue({ data: undefined, isPending: true });

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

  it('reports the mute state off the reader’s own participant row', () => {
    threadsMock.mockReturnValue({
      data: [{ ...THREAD, my_participant: { muted_at: '2026-08-04T00:00:00.000Z' } }],
      isPending: false,
    });
    const { result } = renderHook(() => useProjectCorrespondence(PROJECT), { wrapper });
    expect(result.current.muted).toBe(true);
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

describe('useMarkNoticesRead', () => {
  it('posts /inbox’s own mark-all-read', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useMarkNoticesRead(), { wrapper });
    result.current();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/inbox/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: 'all' }),
    });
  });
});
