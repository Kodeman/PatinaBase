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
import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
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
  /** W3 — the row's own billable answer, restated on the stop payload. */
  billable: boolean;
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
  useRunningTimer: () => ({ data: null }),
  useStartTimer: () => ({ mutateAsync: startTimerMutateAsync }),
  useStopTimer: () => ({ mutateAsync: stopTimerMutateAsync }),
  useDiscardTimer: () => ({ mutateAsync: discardTimerMutateAsync }),
  useCreateTimeEntry: () => ({ mutateAsync: createEntryMutateAsync }),
  useUpdateTimeEntry: () => ({ mutateAsync: jest.fn() }),
  useDeleteTimeEntry: () => ({ mutateAsync: jest.fn() }),
  // HT-35 — the provider now asks whether this member declined the automatic
  // timer before it opens one.
  timeAutostartKeys: { preference: ['time-autostart-preference'] },
  fetchTimeAutostartPreference: async () => autostartPreference,
  useTimeAutostartPreference: () => ({
    preference: autostartPreference,
    optedOut: autostartPreference.optedOut,
    disclosedAt: autostartPreference.disclosedAt,
    isSettled: true,
  }),
  useMarkTimeAutostartDisclosed: () => ({ mutate: markDisclosedMutate }),
}));

/** HT-35 — default on and already disclosed, so every case that is not about
 *  the ruling keeps measuring the shipped spine (R19/D11). */
let autostartPreference: { optedOut: boolean; disclosedAt: string | null } = {
  optedOut: false,
  disclosedAt: '2026-01-01T00:00:00.000Z',
};
const markDisclosedMutate = jest.fn();

/** What the stop payload actually carried, per call — W3 asserts two fields
 *  on it that the close-out used to leave implicit. */
const stopPayloads: Array<Record<string, unknown>> = [];

const stopTimerMutateAsync = jest.fn(async (input: Record<string, unknown>) => {
  stopPayloads.push(input);
  events.push(`stopTimer:${runningTimerRow?.project_id}`);
  const stopped = runningTimerRow;
  runningTimerRow = null;
  return {
    id: input.entryId as string,
    project_id: stopped?.project_id,
    duration_minutes: 12,
    billable: false,
    hourly_rate_cents: null,
    rate_source: 'none',
    rate_role: null,
    rated_amount_cents: null,
  };
});

/** 00608 — start_timer is ONE call that returns BOTH rows. A row another tab
 *  opened in the gap comes back as `stopped`; set this to simulate that. */
let concurrentIncumbent: Record<string, unknown> | null = null;

const startTimerMutateAsync = jest.fn(async (input: { projectId: string }) => {
  events.push(`startTimer:${input.projectId}`);
  const stopped = concurrentIncumbent;
  concurrentIncumbent = null;
  runningTimerRow = {
    id: `entry-${input.projectId}`,
    project_id: input.projectId,
    started_at: new Date().toISOString(),
    billable: false,
  };
  return { started: runningTimerRow, stopped };
});

const discardTimerMutateAsync = jest.fn(async (input: { entryId: string }) => {
  events.push(`discardTimer:${runningTimerRow?.project_id}`);
  runningTimerRow = null;
  return { id: input.entryId };
});

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: { authority: (id: string) => ['project-authority', id] },
  fetchProjectBillingAuthority: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/document/authority-hours', () => ({
  automaticTimeBillingIntent: () => ({ billable: false, reason: 'no_authority' }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    time: {
      timerStarted: (...a: unknown[]) => timerStartedCalls.push(a[0] as object),
      timerStopped: (...a: unknown[]) => timerStoppedCalls.push(a[0] as object),
      autostartDisclosed: (...a: unknown[]) =>
        autostartDisclosedCalls.push(a[0] as object),
    },
  },
}));

const timerStartedCalls: object[] = [];
const timerStoppedCalls: object[] = [];
const autostartDisclosedCalls: object[] = [];
const createEntryMutateAsync = jest.fn(async (input: Record<string, unknown>) => ({
  id: 'typed-entry',
  project_id: input.projectId,
  duration_minutes: input.durationMinutes,
  billable: input.billable,
}));

function isRunningTimerKey(key: unknown): boolean {
  return Array.isArray(key) && key[0] === 'time' && key[1] === 'running-timer';
}

describe('DocumentTimeProvider — A3 queue hardening', () => {
  let qc: QueryClient;

  beforeEach(() => {
    events.length = 0;
    runningTimerRow = null;
    concurrentIncumbent = null;
    stopPayloads.length = 0;
    timerStartedCalls.length = 0;
    timerStoppedCalls.length = 0;
    createEntryMutateAsync.mockClear();
    markDisclosedMutate.mockClear();
    autostartDisclosedCalls.length = 0;
    autostartPreference = {
      optedOut: false,
      disclosedAt: '2026-01-01T00:00:00.000Z',
    };
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
    concurrentIncumbent = null;
    stopPayloads.length = 0;
    createEntryMutateAsync.mockClear();
    markDisclosedMutate.mockClear();
    autostartDisclosedCalls.length = 0;
    autostartPreference = {
      optedOut: false,
      disclosedAt: '2026-01-01T00:00:00.000Z',
    };
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

/**
 * W3 — what the provider must still do once `start_timer` (00608) owns the
 * slot, and the two things it did not do before: name the billable answer and
 * the activity on the stop payload, and log a typed hour with NOTHING held.
 */
describe('DocumentTimeProvider — W3 capture', () => {
  let qc: QueryClient;

  beforeEach(() => {
    events.length = 0;
    runningTimerRow = null;
    concurrentIncumbent = null;
    stopPayloads.length = 0;
    timerStartedCalls.length = 0;
    timerStoppedCalls.length = 0;
    createEntryMutateAsync.mockClear();
    markDisclosedMutate.mockClear();
    autostartDisclosedCalls.length = 0;
    autostartPreference = {
      optedOut: false,
      disclosedAt: '2026-01-01T00:00:00.000Z',
    };
    stopTimerMutateAsync.mockClear();
    startTimerMutateAsync.mockClear();
    qc = new QueryClient();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <DocumentTimeProvider>{children}</DocumentTimeProvider>
    </QueryClientProvider>
  );

  it('still raises the log-offer strip on a chain-out, carrying the stored rate (R20/§0.22)', async () => {
    const { result } = renderHook(() => useDocumentTime(), { wrapper });

    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.hold({ projectId: 'project-b', projectName: 'B', phaseKey: null });
    });
    await waitFor(() => expect(result.current.offer).not.toBeNull());

    expect(result.current.offer?.projectId).toBe('project-a');
    // The offer now carries the SERVER's answers, so the strip can print them.
    expect(result.current.offer?.billable).toBe(false);
    expect(result.current.offer?.rateSource).toBe('none');
  });

  it('carries activity and billable on the stop payload (HT-11/HT-24)', async () => {
    const { result } = renderHook(() => useDocumentTime(), { wrapper });

    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.release();
    });
    await waitFor(() => expect(stopTimerMutateAsync).toHaveBeenCalledTimes(1));

    expect(stopPayloads[0]).toEqual(
      expect.objectContaining({ activity: null, billable: false }),
    );
  });

  it('raises a strip for a row another tab opened, which start_timer had to stop', async () => {
    const { result } = renderHook(() => useDocumentTime(), { wrapper });

    // Nothing running as far as THIS session can see; the RPC finds one.
    concurrentIncumbent = {
      id: 'other-tab-entry',
      project_id: 'project-z',
      duration_minutes: 7,
      billable: true,
      hourly_rate_cents: 12_000,
      rate_source: 'studio_member',
      rate_role: null,
      rated_amount_cents: 1_400,
    };

    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });

    await waitFor(() => expect(result.current.offer).not.toBeNull());
    expect(result.current.offer?.entryId).toBe('other-tab-entry');
    expect(result.current.offer?.projectId).toBe('project-z');
    expect(result.current.offer?.suggestedMinutes).toBe(7);
  });

  it('logs a typed hour with NOTHING in hand (HT-14)', async () => {
    const { result } = renderHook(() => useDocumentTime(), { wrapper });

    let written: unknown;
    await act(async () => {
      written = await result.current.manualLog({
        projectId: 'project-q',
        minutes: 45,
        activity: 'client',
        billable: false,
      });
    });

    expect(result.current.heldProjectId).toBeNull();
    expect(createEntryMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-q',
        durationMinutes: 45,
        activity: 'client',
        billable: false,
        source: 'manual_entry',
      }),
    );
    expect(written).toEqual(expect.objectContaining({ id: 'typed-entry' }));
  });

  it('refuses a typed hour with no document rather than clearing as though it saved', async () => {
    const { result } = renderHook(() => useDocumentTime(), { wrapper });

    await expect(
      result.current.manualLog({
        projectId: '',
        minutes: 45,
        activity: null,
        billable: false,
      }),
    ).rejects.toThrow(/document/i);
    expect(createEntryMutateAsync).not.toHaveBeenCalled();
  });

  it('instruments the timer without touching R64\'s number (HT-17)', async () => {
    const { result } = renderHook(() => useDocumentTime(), { wrapper });

    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(timerStartedCalls).toHaveLength(1));

    act(() => {
      result.current.release();
    });
    await waitFor(() => expect(timerStoppedCalls).toHaveLength(1));

    expect(timerStartedCalls[0]).toEqual(
      expect.objectContaining({ surface: 'document', source: 'timer_auto', billable: false }),
    );
    // The cumulative-idle ratio is REPORTED. Nothing acts on it.
    expect(timerStoppedCalls[0]).toEqual(
      expect.objectContaining({ surface: 'document' }),
    );
    expect(timerStoppedCalls[0]).toHaveProperty('idle_ratio');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HT-35 — the automatic timer is disclosed once, and a member may decline it.
// "Off" is never "no timer": the same clock, waiting for her hand.
// ═══════════════════════════════════════════════════════════════════════════
describe('DocumentTimeProvider — HT-35, the clock she was told about', () => {
  let qc: QueryClient;

  beforeEach(() => {
    events.length = 0;
    runningTimerRow = null;
    concurrentIncumbent = null;
    startTimerMutateAsync.mockClear();
    stopTimerMutateAsync.mockClear();
    markDisclosedMutate.mockReset();
    autostartDisclosedCalls.length = 0;
    autostartPreference = {
      optedOut: false,
      disclosedAt: '2026-01-01T00:00:00.000Z',
    };
    qc = new QueryClient();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <DocumentTimeProvider>{children}</DocumentTimeProvider>
    </QueryClientProvider>
  );

  it('starts the clock for a member who never touched the setting', async () => {
    const { result } = renderHook(() => useDocumentTime(), { wrapper });
    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(1));
    expect(result.current.autostartOptedOut).toBe(false);
  });

  it('opens NO timer for a member who declined it', async () => {
    autostartPreference = { optedOut: true, disclosedAt: '2026-01-01T00:00:00.000Z' };
    const { result } = renderHook(() => useDocumentTime(), { wrapper });
    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(result.current.autostartOptedOut).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(startTimerMutateAsync).not.toHaveBeenCalled();
  });

  it('leaves her the same clock under her own thumb — never "no timer"', async () => {
    autostartPreference = { optedOut: true, disclosedAt: '2026-01-01T00:00:00.000Z' };
    const { result } = renderHook(() => useDocumentTime(), { wrapper });
    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(result.current.autostartOptedOut).toBe(true));

    act(() => {
      result.current.startManually();
    });
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(1));
    // timer_manual, not timer_auto: a clock she started by hand must not be
    // discarded under a minute by R4's sub-60s rule.
    expect(startTimerMutateAsync.mock.calls[0][0]).toEqual(
      expect.objectContaining({ projectId: 'project-a', source: 'timer_manual' }),
    );
  });

  it('and the one-tap start is offered on the page while she holds a document', async () => {
    autostartPreference = { optedOut: true, disclosedAt: '2026-01-01T00:00:00.000Z' };
    const { result } = renderHook(() => useDocumentTime(), { wrapper });
    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() =>
      expect(screen.getByText('Start the clock')).toBeInTheDocument(),
    );
  });

  it('discloses the automatic timer once, stamping it as it renders', async () => {
    autostartPreference = { optedOut: false, disclosedAt: null };
    const { result } = renderHook(() => useDocumentTime(), { wrapper });
    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() =>
      expect(screen.getByText(/Patina keeps the time for you/)).toBeInTheDocument(),
    );
    expect(markDisclosedMutate).toHaveBeenCalledTimes(1);
    expect(autostartDisclosedCalls).toEqual([{ surface: 'document' }]);
  });

  it('holds the sentence up while its own stamp round-trips back', async () => {
    autostartPreference = { optedOut: false, disclosedAt: null };
    // The real `useMarkTimeAutostartDisclosed` invalidates the preference
    // query, so the stamp it just wrote comes straight back as a non-null
    // `disclosed_at`. Before the latch that round trip unmounted the band on
    // the very next render: "once and never again", with the once spent on a
    // flash nobody could read and `Understood` never reachable.
    markDisclosedMutate.mockImplementation(() => {
      autostartPreference = {
        optedOut: false,
        disclosedAt: '2026-09-13T12:00:00.000Z',
      };
    });
    const { result, rerender } = renderHook(() => useDocumentTime(), { wrapper });
    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() =>
      expect(screen.getByText(/Patina keeps the time for you/)).toBeInTheDocument(),
    );
    expect(markDisclosedMutate).toHaveBeenCalledTimes(1);

    // The stamp has landed and the preference now reads disclosed. The
    // sentence stays until she says so.
    act(() => {
      rerender();
    });
    expect(
      screen.getByText(/Patina keeps the time for you/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Understood' }));
    await waitFor(() =>
      expect(
        screen.queryByText(/Patina keeps the time for you/),
      ).not.toBeInTheDocument(),
    );
    // Her hand took it down, and the profile carries exactly one stamp.
    expect(markDisclosedMutate).toHaveBeenCalledTimes(1);
  });

  it('stops asserting the automatic clock the moment she declines it, and offers her the manual one instead', async () => {
    // She follows the sentence's own instruction. The Account sheet is an
    // always-mounted overlay in the (document) layout, not a route, so the
    // document is still held and the band is still latched when the preference
    // comes back opted out.
    autostartPreference = { optedOut: false, disclosedAt: null };
    markDisclosedMutate.mockImplementation(() => {
      autostartPreference = {
        optedOut: false,
        disclosedAt: '2026-09-13T12:00:00.000Z',
      };
    });
    const { result, rerender } = renderHook(() => useDocumentTime(), { wrapper });
    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() =>
      expect(screen.getByText(/Patina keeps the time for you/)).toBeInTheDocument(),
    );

    act(() => {
      autostartPreference = {
        optedOut: true,
        disclosedAt: '2026-09-13T12:00:00.000Z',
      };
      rerender();
    });

    expect(
      screen.queryByText(/Patina keeps the time for you/),
    ).not.toBeInTheDocument();
    expect(screen.getByText('The clock is yours to start on this document.'))
      .toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start the clock' }),
    ).toBeInTheDocument();
  });

  it('does not follow her onto the next document if she never dismissed it', async () => {
    autostartPreference = { optedOut: false, disclosedAt: null };
    markDisclosedMutate.mockImplementation(() => {
      autostartPreference = {
        optedOut: false,
        disclosedAt: '2026-09-13T12:00:00.000Z',
      };
    });
    const { result } = renderHook(() => useDocumentTime(), { wrapper });
    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() =>
      expect(screen.getByText(/Patina keeps the time for you/)).toBeInTheDocument(),
    );

    act(() => {
      result.current.release();
    });
    await waitFor(() =>
      expect(
        screen.queryByText(/Patina keeps the time for you/),
      ).not.toBeInTheDocument(),
    );

    act(() => {
      result.current.hold({ projectId: 'project-b', projectName: 'B', phaseKey: null });
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(
      screen.queryByText(/Patina keeps the time for you/),
    ).not.toBeInTheDocument();
    expect(markDisclosedMutate).toHaveBeenCalledTimes(1);
  });

  it('and never again once the stamp is on her profile', async () => {
    const { result } = renderHook(() => useDocumentTime(), { wrapper });
    act(() => {
      result.current.hold({ projectId: 'project-a', projectName: 'A', phaseKey: null });
    });
    await waitFor(() => expect(startTimerMutateAsync).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText(/Patina keeps the time for you/),
    ).not.toBeInTheDocument();
    expect(markDisclosedMutate).not.toHaveBeenCalled();
  });

  it('says nothing at all on the Desk, where no document is held', async () => {
    autostartPreference = { optedOut: false, disclosedAt: null };
    renderHook(() => useDocumentTime(), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(
      screen.queryByText(/Patina keeps the time for you/),
    ).not.toBeInTheDocument();
    expect(markDisclosedMutate).not.toHaveBeenCalled();
  });
});
