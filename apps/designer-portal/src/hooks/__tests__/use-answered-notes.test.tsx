/**
 * The day's line's own read — `project_notes.answered_at` inside the last day.
 *
 * What these cover: the window the query asks Postgres for (the filter is the
 * feature — a note answered last week is not "replied last night"), the shape
 * handed to the derivation, the refusal to pass through a half-row, and the
 * Desk's own 60s tick so the roster and the line re-read together.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}));

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: jest.fn((options: unknown) => actual.useQuery(options)),
  };
});

import { useQuery } from '@tanstack/react-query';
import {
  ANSWERED_NOTE_LIMIT,
  useAnsweredNotes,
} from '../use-answered-notes';
import { ANSWERED_NOTE_WINDOW_MS } from '@/lib/document/desk-roster-derivation';

interface Chain {
  select: jest.Mock;
  gte: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
}

function chainReturning(result: unknown): Chain {
  const chain = {} as Chain;
  chain.select = jest.fn(() => chain);
  chain.gte = jest.fn(() => chain);
  chain.order = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(result));
  return chain;
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useAnsweredNotes', () => {
  it('asks only for the last day of answered notes, newest first and capped', async () => {
    const chain = chainReturning({ data: [], error: null });
    mockFrom.mockReturnValue(chain);
    const before = Date.now();

    const { result } = renderHook(() => useAnsweredNotes(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith('project_notes');
    expect(chain.select).toHaveBeenCalledWith('project_id, answered_at');
    const [column, since] = chain.gte.mock.calls[0];
    expect(column).toBe('answered_at');
    // The floor is a day back from the read, not a fixed date.
    const floor = Date.parse(since as string);
    expect(before - ANSWERED_NOTE_WINDOW_MS - floor).toBeLessThanOrEqual(2_000);
    expect(floor).toBeLessThanOrEqual(Date.now() - ANSWERED_NOTE_WINDOW_MS);
    expect(chain.order).toHaveBeenCalledWith('answered_at', {
      ascending: false,
    });
    expect(chain.limit).toHaveBeenCalledWith(ANSWERED_NOTE_LIMIT);
  });

  it('hands the derivation project ids and times, and drops a half row', async () => {
    mockFrom.mockReturnValue(
      chainReturning({
        data: [
          { project_id: 'p-cedar', answered_at: '2026-09-08T04:00:00Z' },
          { project_id: null, answered_at: '2026-09-08T05:00:00Z' },
          { project_id: 'p-orphan', answered_at: null },
        ],
        error: null,
      }),
    );

    const { result } = renderHook(() => useAnsweredNotes(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      { projectId: 'p-cedar', answeredAt: '2026-09-08T04:00:00Z' },
    ]);
  });

  it('surfaces a failed read instead of resolving an empty day', async () => {
    mockFrom.mockReturnValue(
      chainReturning({ data: null, error: { message: 'denied' } }),
    );

    const { result } = renderHook(() => useAnsweredNotes(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('re-reads on the Desk’s own tick, and stays off when disabled', async () => {
    mockFrom.mockReturnValue(chainReturning({ data: [], error: null }));

    renderHook(() => useAnsweredNotes({ enabled: false }), { wrapper });

    const options = (useQuery as unknown as jest.Mock).mock.calls[0][0];
    expect(options.queryKey).toEqual(['project-notes', 'answered', 'desk']);
    expect(options.refetchInterval).toBe(60_000);
    expect(options.enabled).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
