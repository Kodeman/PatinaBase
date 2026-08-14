import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { resolveSchedule } from '@patina/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — a real two-phase chain (anchored root + a follower) and one
// milestone, run through the REAL resolveSchedule so the expected RPC payload
// in these tests is derived the same way settleScheduleWrite derives its own,
// not hand-typed. Phase A is anchored, so both phases resolve independent of
// `today` — no flakiness from the clock.
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT_ID = 'project-settle-1';

const phaseARow = {
  id: 'phase-a',
  name: 'Schematic Design',
  duration_days: 5,
  duration_weeks: null,
  follows_phase_id: null,
  anchor_date: '2026-01-01',
  lane: 'main',
  start_date: null,
  target_end_date: null,
  sort_order: 0,
  status: 'pending',
};

const phaseBRow = {
  id: 'phase-b',
  name: 'Design Development',
  duration_days: 10,
  duration_weeks: null,
  follows_phase_id: 'phase-a',
  anchor_date: null,
  lane: 'main',
  start_date: null,
  target_end_date: null,
  sort_order: 1,
  status: 'pending',
};

// The raw milestone SELECT joins project_phases for the project_id filter —
// settleScheduleWrite strips that embed before mapping, mirroring
// useScheduleMilestones (use-schedule.ts) exactly.
const milestoneRow = {
  id: 'ms-1',
  phase_id: 'phase-b',
  name: 'Client sign-off',
  kind: 'signoff',
  offset_days: 2,
  anchor_date: null,
  status: 'upcoming',
  sort_order: 0,
  project_phases: { project_id: PROJECT_ID },
};

// ─────────────────────────────────────────────────────────────────────────────
// A minimal chainable + thenable query-builder mock, matching supabase-js's
// shape: select/eq/order return the same builder; awaiting the builder (or
// calling the terminal .maybeSingle()) resolves to the seeded result.
// ─────────────────────────────────────────────────────────────────────────────

function makeBuilder(result: { data: unknown; error: unknown }) {
  // `any`: select/eq/order close over `builder` before its own literal
  // finishes evaluating (self-reference), which defeats any precise
  // structural annotation here — the real supabase-js builder is untyped at
  // this boundary too (every hook in this package casts it `as any`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

interface FromOverrides {
  phasesError?: unknown;
  milestonesError?: unknown;
  projectError?: unknown;
  projectStartDate?: string | null;
}

function defaultFromImpl(overrides: FromOverrides = {}) {
  return (table: string) => {
    if (table === 'project_phases') {
      return makeBuilder(
        overrides.phasesError
          ? { data: null, error: overrides.phasesError }
          : { data: [phaseARow, phaseBRow], error: null },
      );
    }
    if (table === 'schedule_milestones') {
      return makeBuilder(
        overrides.milestonesError
          ? { data: null, error: overrides.milestonesError }
          : { data: [milestoneRow], error: null },
      );
    }
    if (table === 'projects') {
      return makeBuilder(
        overrides.projectError
          ? { data: null, error: overrides.projectError }
          : { data: { start_date: overrides.projectStartDate ?? null }, error: null },
      );
    }
    throw new Error(`schedule-write-settle.test: unexpected table "${table}"`);
  };
}

// Reassigned per-test with differently-shaped implementations (resolving,
// rejecting, resolving-with-error) — `any` avoids fighting vi.fn's per-call
// inference across those reassignments.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rpc: any = vi.fn();
let fromImpl: (table: string) => ReturnType<typeof makeBuilder> = defaultFromImpl();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    from: (table: string) => fromImpl(table),
    rpc: (...args: unknown[]) => rpc(...args),
  }),
}));

// vi.mock calls are hoisted above these imports by vitest's transform (the
// same pattern use-install-window.test.ts uses), so the module under test
// picks up the mocked '@supabase/ssr' via ../client.ts's createBrowserClient.
import { settleScheduleWrite } from '../schedule-write-settle';
import { mapMilestoneRowToScheduleInput, mapPhaseRowToScheduleInput } from '../use-schedule';

function makeQueryClient(): { queryClient: QueryClient; invalidateQueries: ReturnType<typeof vi.fn> } {
  const invalidateQueries = vi.fn();
  return { queryClient: { invalidateQueries } as unknown as QueryClient, invalidateQueries };
}

/** The expected resolved schedule — computed with the SAME mappers and the
 *  SAME resolver settleScheduleWrite calls internally, not hand-typed. */
function expectedResolved(projectStartDate: string | null = null) {
  return resolveSchedule(
    [phaseARow, phaseBRow].map(mapPhaseRowToScheduleInput as never),
    [milestoneRow].map(mapMilestoneRowToScheduleInput as never),
    { projectStartDate, today: new Date().toISOString().slice(0, 10) },
  );
}

describe('settleScheduleWrite', () => {
  beforeEach(() => {
    rpc = vi.fn(() => Promise.resolve({ data: 2, error: null }));
    fromImpl = defaultFromImpl();
  });

  it('calls materialize_schedule_dates with p_phases mapping every resolved phase (start→start_date, end→target_end_date)', async () => {
    const { queryClient } = makeQueryClient();

    await settleScheduleWrite(queryClient, PROJECT_ID);

    const resolved = expectedResolved();
    // Fixture sanity: both phases actually resolved to real dates, so the
    // assertion below isn't vacuously true on an empty/unresolved payload.
    expect(resolved.phases).toHaveLength(2);
    expect(resolved.phases.every((phase) => phase.start !== null)).toBe(true);

    expect(rpc).toHaveBeenCalledWith('materialize_schedule_dates', {
      p_project_id: PROJECT_ID,
      p_phases: resolved.phases.map((phase) => ({
        phase_id: phase.id,
        start_date: phase.start,
        target_end_date: phase.end,
      })),
    });
  });

  it('resolves with the same projectStartDate option useResolvedSchedule would pass', async () => {
    fromImpl = defaultFromImpl({ projectStartDate: '2026-02-01' });
    const { queryClient } = makeQueryClient();

    await settleScheduleWrite(queryClient, PROJECT_ID);

    const resolved = expectedResolved('2026-02-01');
    expect(rpc).toHaveBeenCalledWith('materialize_schedule_dates', {
      p_project_id: PROJECT_ID,
      p_phases: resolved.phases.map((phase) => ({
        phase_id: phase.id,
        start_date: phase.start,
        target_end_date: phase.end,
      })),
    });
  });

  it('invalidates the shared key set up front, and re-invalidates project-phases only after the rpc resolves', async () => {
    const { queryClient, invalidateQueries } = makeQueryClient();
    const callsAtRpcInvocation: unknown[][] = [];
    rpc = vi.fn(() => {
      // Snapshot every invalidateQueries call made SO FAR, before the rpc's
      // own promise resolves — proves the final project-phases invalidation
      // (step 4) cannot have run yet at this point.
      callsAtRpcInvocation.push(...invalidateQueries.mock.calls.map((c) => c[0].queryKey));
      return Promise.resolve({ data: 2, error: null });
    });

    await settleScheduleWrite(queryClient, PROJECT_ID);

    const allKeys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    const projectPhasesCallsBeforeRpc = callsAtRpcInvocation.filter(
      (k) => Array.isArray(k) && k[0] === 'project-phases',
    );
    const projectPhasesCallsTotal = allKeys.filter((k) => Array.isArray(k) && k[0] === 'project-phases');

    // Exactly the up-front invalidation has happened by the time the rpc is
    // invoked; the second (post-materialize) one has not.
    expect(projectPhasesCallsBeforeRpc).toHaveLength(1);
    // Both invalidations happened by the time settleScheduleWrite resolves.
    expect(projectPhasesCallsTotal).toHaveLength(2);

    expect(allKeys).toContainEqual(['project-phases', PROJECT_ID]);
    expect(allKeys).toContainEqual(['schedule-milestones', PROJECT_ID]);
    expect(allKeys).toContainEqual(['project-v2', PROJECT_ID]);
    expect(allKeys).toContainEqual(['schedule-revisions', PROJECT_ID]);
  });

  it('swallows a rejecting rpc call — never rethrows, logs instead', async () => {
    const { queryClient } = makeQueryClient();
    rpc = vi.fn(() => Promise.resolve({ data: null, error: new Error('materialize failed') }));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(settleScheduleWrite(queryClient, PROJECT_ID)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      'settleScheduleWrite: materialization failed',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('swallows an rpc call that itself REJECTS (network failure) — no unhandled rejection', async () => {
    const { queryClient } = makeQueryClient();
    rpc = vi.fn(() => Promise.reject(new Error('network exploded')));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(settleScheduleWrite(queryClient, PROJECT_ID)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      'settleScheduleWrite: materialization failed',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('swallows a rejecting fetch (project_phases select error) — never rethrows, and never reaches the rpc', async () => {
    fromImpl = defaultFromImpl({ phasesError: new Error('network down') });
    const { queryClient } = makeQueryClient();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(settleScheduleWrite(queryClient, PROJECT_ID)).resolves.toBeUndefined();

    expect(rpc).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'settleScheduleWrite: materialization failed',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
