/**
 * A3 (doc-polish) — hardening pins, not a reproduction of the reported live
 * symptom. Static tracing found a real gap: useStopTimer/useStartTimer's own
 * `onSuccess` fires `invalidateQueries` without awaiting or returning it
 * (confirmed against @tanstack/query-core's mutation.execute — it only
 * awaits what the hook's onSuccess callback itself RETURNS), so a caller
 * that awaits mutateAsync can still observe a stale runningTimer cache. This
 * suite pins two things: (1) the pre-existing queue invariant — a navigation
 * from one held project to another still stops the old timer before
 * starting the new one — continues to hold with the added awaits in place,
 * and (2) the two hardening changes actually fire: the runningTimer cache is
 * explicitly invalidated (and awaited) after each stop/start, and a queued
 * operation that throws is now surfaced via console.error instead of
 * vanishing into `enqueue`'s swallowed catch.
 *
 * What this suite does NOT establish: the exact live-only mechanism behind
 * the reported "attributes to the previous document" symptom. See the A3
 * report-back for why (no live browser/Supabase session available to this
 * lane) and what remains unconfirmed.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DocumentTimeProvider, useDocumentTime } from './document-time-provider';

const events: string[] = [];

// The single running-timer row, as the raw supabase `.maybeSingle()` read in
// `fetchRunning` would see it — the actual source hold()/release() reason
// over, distinct from (and not kept in sync with) the mocked useRunningTimer
// react-query hook below, exactly as in the real split (see A3 hazards).
let runningTimerRow: { id: string; project_id: string; started_at: string } | null = null;

const authGetUser = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } });

function chainBuilder() {
  const builder: Record<string, jest.Mock> & { then?: (resolve: (v: unknown) => void) => void } =
    {};
  ['select', 'is', 'eq', 'gte', 'not', 'order'].forEach((method) => {
    builder[method] = jest.fn(() => builder);
  });
  (builder as { maybeSingle: () => Promise<unknown> }).maybeSingle = jest.fn(async () => ({
    data: runningTimerRow,
    error: null,
  }));
  // The "today minutes" query awaits the builder directly (no .maybeSingle());
  // give the thenable a harmless empty-rows resolution for that path.
  builder.then = ((resolve: (v: unknown) => void) => resolve({ data: [], error: null })) as any;
  return builder;
}

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    auth: { getUser: authGetUser },
    from: jest.fn(() => chainBuilder()),
  }),
}));

const stopTimerMutateAsync = jest.fn(async (input: { entryId: string }) => {
  events.push(`stopTimer:${runningTimerRow?.project_id}`);
  const stopped = runningTimerRow;
  runningTimerRow = null;
  return { id: input.entryId, project_id: stopped?.project_id };
});

const startTimerMutateAsync = jest.fn(async (input: { projectId: string }) => {
  events.push(`startTimer:${input.projectId}`);
  runningTimerRow = {
    id: `entry-${input.projectId}`,
    project_id: input.projectId,
    started_at: new Date().toISOString(),
  };
  return runningTimerRow;
});

jest.mock('@/hooks/use-time-tracking', () => ({
  useRunningTimer: () => ({ data: null }),
  useStartTimer: () => ({ mutateAsync: startTimerMutateAsync }),
  useStopTimer: () => ({ mutateAsync: stopTimerMutateAsync }),
  useDiscardTimer: () => ({ mutateAsync: jest.fn() }),
  useCreateTimeEntry: () => ({ mutateAsync: jest.fn() }),
  useUpdateTimeEntry: () => ({ mutateAsync: jest.fn() }),
  useDeleteTimeEntry: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: { authority: (id: string) => ['project-authority', id] },
  fetchProjectBillingAuthority: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/document/authority-hours', () => ({
  automaticTimeBillingIntent: () => ({ billable: false }),
}));

function isRunningTimerKey(key: unknown): boolean {
  return Array.isArray(key) && key[0] === 'time' && key[1] === 'running-timer';
}

describe('DocumentTimeProvider — A3 queue hardening', () => {
  let qc: QueryClient;

  beforeEach(() => {
    events.length = 0;
    runningTimerRow = null;
    stopTimerMutateAsync.mockClear();
    startTimerMutateAsync.mockClear();
    qc = new QueryClient();
    const originalInvalidate = qc.invalidateQueries.bind(qc);
    jest.spyOn(qc, 'invalidateQueries').mockImplementation((filters, options) => {
      if (isRunningTimerKey((filters as { queryKey?: unknown } | undefined)?.queryKey)) {
        events.push('invalidateRunningTimer');
      }
      return originalInvalidate(filters, options);
    });
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <DocumentTimeProvider>{children}</DocumentTimeProvider>
    </QueryClientProvider>
  );

  it('stops the outgoing project before starting the incoming one, awaiting a runningTimer invalidation after each mutation', async () => {
    const { result } = renderHook(() => useDocumentTime(), { wrapper });

    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.hold({ projectId: 'project-b', projectName: 'B', phaseKey: null });
    });
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(stopTimerMutateAsync).toHaveBeenCalledTimes(1));

    // The exact, ordered sequence: A starts; navigating to B stops A THEN
    // starts B — never interleaved, and a runningTimer invalidation is
    // awaited immediately after every stop/start, not batched or skipped.
    expect(events).toEqual([
      'startTimer:project-a',
      'invalidateRunningTimer',
      'stopTimer:project-a',
      'invalidateRunningTimer',
      'startTimer:project-b',
      'invalidateRunningTimer',
    ]);
  });

  it('surfaces a queued operation that throws instead of swallowing it silently', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useDocumentTime(), { wrapper });

    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(1));

    // Project A's stop fails (a network hiccup mid-navigation) — the pre-
    // existing `enqueue` catch used to swallow this with no trace anywhere.
    stopTimerMutateAsync.mockImplementationOnce(async () => {
      throw new Error('network hiccup');
    });

    act(() => {
      result.current.hold({ projectId: 'project-b', projectName: 'B', phaseKey: null });
    });

    await waitFor(() =>
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[document-time] a queued timer operation failed',
        expect.any(Error),
      ),
    );

    // Known, still-open gap this hardening does NOT close (reported, not
    // fixed): because the throw happens inside the SAME queued operation
    // that would go on to start B, a failed stop for A also skips B's
    // start entirely for this navigation — the queue survives (the test
    // above's ordering still holds on a LATER hold), but this one
    // navigation silently never starts B's timer either.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startTimerMutateAsync).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });
});
