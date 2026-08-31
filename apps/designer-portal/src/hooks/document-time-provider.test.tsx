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
let runningTimerRow: {
  id: string;
  project_id: string;
  started_at: string;
  source?: string;
} | null = null;

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

const discardTimerMutateAsync = jest.fn(async (input: { entryId: string }) => {
  events.push(`discardTimer:${runningTimerRow?.project_id}`);
  runningTimerRow = null;
  return { id: input.entryId };
});

jest.mock('@/hooks/use-time-tracking', () => ({
  useRunningTimer: () => ({ data: null }),
  useStartTimer: () => ({ mutateAsync: startTimerMutateAsync }),
  useStopTimer: () => ({ mutateAsync: stopTimerMutateAsync }),
  useDiscardTimer: () => ({ mutateAsync: discardTimerMutateAsync }),
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
    discardTimerMutateAsync.mockClear();
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

  it('awaits the runningTimer invalidation on the discard_silently path too, not just stop/start', async () => {
    const { result } = renderHook(() => useDocumentTime(), { wrapper });

    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(1));

    // A designer who glances at a document for under a minute: mark the row
    // auto-started and elapsed stays near-zero, so closeOutTimer rules
    // 'discard_silently' (source === 'timer_auto' && elapsed < 60) instead of
    // 'offer' — this is the branch stopTimer's hardening did NOT reach.
    if (runningTimerRow) runningTimerRow.source = 'timer_auto';

    act(() => {
      result.current.hold({ projectId: 'project-b', projectName: 'B', phaseKey: null });
    });
    await waitFor(() => expect(discardTimerMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(2));

    // discardTimer never touches stopTimer, and the runningTimer cache
    // invalidation for the discard is awaited BEFORE project-b's start
    // fires — the same ordering guarantee the stop/start path already had.
    expect(stopTimerMutateAsync).not.toHaveBeenCalled();
    expect(events).toEqual([
      'startTimer:project-a',
      'invalidateRunningTimer',
      'discardTimer:project-a',
      'invalidateRunningTimer',
      'startTimer:project-b',
      'invalidateRunningTimer',
    ]);
  });
});

/**
 * D-B54 — who owns the thumb edge, driven through the REAL provider.
 *
 * This is the falsifier the W7 correctness review found missing. The rule the
 * prod defect turned on now lives in `offerOwnsThumbEdge`, and until this
 * suite existed nothing anywhere exercised it: replacing the derivation with
 * a bare `offer !== null` — i.e. re-introducing the exact defect Kody hit —
 * left the whole portal suite green.
 *
 * Every case below reaches its state through `hold`/`release` rather than by
 * setting the boolean, so what is asserted is the provider's own arithmetic
 * over a real offer and a real held document.
 */
describe('DocumentTimeProvider — who owns the thumb edge (D-B54)', () => {
  let qc: QueryClient;

  beforeEach(() => {
    events.length = 0;
    runningTimerRow = null;
    stopTimerMutateAsync.mockClear();
    startTimerMutateAsync.mockClear();
    discardTimerMutateAsync.mockClear();
    qc = new QueryClient();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <DocumentTimeProvider>{children}</DocumentTimeProvider>
    </QueryClientProvider>
  );

  it('no offer standing: nothing owns the edge, so the bar keeps it', async () => {
    const { result } = renderHook(() => useDocumentTime(), { wrapper });

    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(1));

    expect(result.current.offer).toBeNull();
    expect(result.current.offerOwnsEdge).toBe(false);
  });

  it('an offer on ANOTHER project while this one is held: the offer does NOT own the edge', async () => {
    // Kody's screen. A timer runs on A; opening B chains A out into an offer,
    // and `LogStrip` will refuse to paint it over the document in hand — so
    // the bar must NOT yield, or the phone has no bottom chrome at all.
    const { result } = renderHook(() => useDocumentTime(), { wrapper });

    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.hold({ projectId: 'project-b', projectName: 'B', phaseKey: null });
    });
    await waitFor(() => expect(stopTimerMutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.offer).not.toBeNull());

    expect(result.current.offer?.projectId).toBe('project-a');
    expect(result.current.heldProjectId).toBe('project-b');
    expect(result.current.offerOwnsEdge).toBe(false);
  });

  it('an offer with NOTHING held: the offer owns the edge (the Desk)', async () => {
    const { result } = renderHook(() => useDocumentTime(), { wrapper });

    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.release();
    });
    await waitFor(() => expect(result.current.offer).not.toBeNull());

    expect(result.current.offer?.projectId).toBe('project-a');
    expect(result.current.heldProjectId).toBeNull();
    expect(result.current.offerOwnsEdge).toBe(true);
  });

  it('an offer on the project that is BACK in hand: the offer owns the edge', async () => {
    const { result } = renderHook(() => useDocumentTime(), { wrapper });

    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.release();
    });
    await waitFor(() => expect(result.current.offer).not.toBeNull());

    // Picking the SAME document back up: the offer is this project's, so the
    // strip paints it and the bar rightly yields.
    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(2));

    expect(result.current.offer?.projectId).toBe('project-a');
    expect(result.current.heldProjectId).toBe('project-a');
    expect(result.current.offerOwnsEdge).toBe(true);
  });
});
