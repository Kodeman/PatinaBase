import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  filterProjectUnbilledEntries,
  isRatePendingTimeEntry,
  useCreateTimeEntry,
  useStartTimer,
  useStopTimer,
  type UnbilledTimeRow,
} from "@patina/supabase";

const mockCreateBrowserClient = jest.fn();

// The hooks live in @patina/supabase now and reach for the client through the
// package's own ./client module, so that is what has to be mocked — mocking
// the package barrel would replace the hooks under test.
jest.mock("@patina/supabase/client", () => ({
  createBrowserClient: () => mockCreateBrowserClient(),
}));

describe("authority-aware time writes", () => {
  it("stops a timer without writing server-owned classification or rate fields", async () => {
    let written: Record<string, unknown> | null = null;
    const from = jest.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "entry-1",
              project_id: "project-1",
              user_id: "user-1",
              started_at: "2026-08-03T12:00:00.000Z",
              duration_minutes: null,
            },
            error: null,
          }),
        }),
      }),
      update: (updates: Record<string, unknown>) => {
        written = updates;
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({
                data: {
                  id: "entry-1",
                  project_id: "project-1",
                  duration_minutes: 30,
                },
                error: null,
              }),
            }),
          }),
        };
      },
    }));
    mockCreateBrowserClient.mockReturnValue({ from });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useStopTimer(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        entryId: "entry-1",
        durationMinutesOverride: 30,
        rawSeconds: 1_800,
      });
    });

    expect(from).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenNthCalledWith(1, "project_time_entries");
    expect(from).toHaveBeenNthCalledWith(2, "project_time_entries");
    expect(written).toEqual({ duration_minutes: 30, raw_seconds: 1_800 });
    expect(written).not.toEqual(
      expect.objectContaining({
        billing_authority_id: expect.anything(),
        authority_rate_id: expect.anything(),
        billing_state: expect.anything(),
        rated_amount_cents: expect.anything(),
        hourly_rate_cents: expect.anything(),
      }),
    );
  });

  // HT-1 (migrations 00599-00601): the server owns the rate on every project
  // kind, and 00600's guard REJECTS a caller-supplied rate_source or
  // rated_amount_cents on INSERT outright. W3 (00608) moved the write onto the
  // `log_time` RPC — a caller-minted id so a replay is idempotent — so what is
  // pinned here is the RPC ARGUMENT LIST: none of the five server-owned names
  // may appear on it, `p_billable` is stated (HT-11 — the `?? true` default is
  // gone), and `p_rate_role` (HT-41) is the member's to send and passes through.
  it("logs an entry through log_time without sending any rate, amount, billing state or provenance", async () => {
    let args: Record<string, unknown> | null = null;
    const rpc = jest.fn(async (_fn: string, params: Record<string, unknown>) => {
      args = params;
      return {
        data: {
          id: params.p_entry_id,
          project_id: "project-1",
          duration_minutes: 45,
          billable: true,
        },
        error: null,
      };
    });
    mockCreateBrowserClient.mockReturnValue({ rpc });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateTimeEntry(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        projectId: "project-1",
        durationMinutes: 45,
        startedAt: "2026-09-11T12:00:00.000Z",
        billable: true,
        source: "command_bar",
        rateRole: "support_designer",
      });
    });

    expect(rpc).toHaveBeenCalledWith("log_time", expect.any(Object));
    expect(Object.keys(args ?? {}).sort()).toEqual([
      "p_activity",
      "p_billable",
      "p_duration_minutes",
      "p_entry_id",
      "p_notes",
      "p_phase_key",
      "p_project_id",
      "p_rate_role",
      "p_source",
      "p_started_at",
      // W4 (HT-15) — the studio an internal hour belongs to. NULL here, because
      // this hour names a project and takes its studio from that project.
      "p_studio_id",
      "p_task_id",
    ]);
    expect(args).toEqual(
      expect.objectContaining({
        p_rate_role: "support_designer",
        p_billable: true,
        p_source: "command_bar",
      }),
    );
    // The caller mints the id, so a retry re-reads rather than re-writes.
    expect(typeof (args as Record<string, unknown>).p_entry_id).toBe("string");
  });

  // 00608 — the replay contract, from the hook's side: the same id sent twice
  // returns the row that already exists rather than a second hour.
  it("honours a caller-minted id so a replayed log reads back the stored hour", async () => {
    const stored = {
      id: "11111111-2222-4333-8444-555555555555",
      project_id: "project-1",
      duration_minutes: 45,
      billable: false,
    };
    const rpc = jest.fn(async () => ({ data: stored, error: null }));
    mockCreateBrowserClient.mockReturnValue({ rpc });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateTimeEntry(), { wrapper });

    let first: unknown;
    let second: unknown;
    await act(async () => {
      first = await result.current.mutateAsync({
        entryId: stored.id,
        projectId: "project-1",
        durationMinutes: 45,
        billable: false,
      });
      second = await result.current.mutateAsync({
        entryId: stored.id,
        projectId: "project-1",
        durationMinutes: 999,
        billable: false,
      });
    });

    expect(first).toEqual(stored);
    expect(second).toEqual(stored);
    expect(rpc.mock.calls.every(([, p]) => (p as Record<string, unknown>).p_entry_id === stored.id)).toBe(true);
  });

  // 00608 — start_timer is one transaction: it stops the incumbent and hands
  // BOTH rows back, so the caller can still raise the log-offer strip for the
  // hour it chained out (R20). The 23505 branch this hook used to carry is gone.
  it("starts a timer through start_timer and returns the row it chained out", async () => {
    const started = { id: "running-2", project_id: "project-2", started_at: "x" };
    const stopped = { id: "running-1", project_id: "project-1", duration_minutes: 12 };
    const rpc = jest.fn(async () => ({ data: [{ started, stopped }], error: null }));
    mockCreateBrowserClient.mockReturnValue({ rpc });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useStartTimer(), { wrapper });

    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync({
        projectId: "project-2",
        billable: false,
        source: "timer_auto",
      });
    });

    expect(rpc).toHaveBeenCalledWith(
      "start_timer",
      expect.objectContaining({ p_project_id: "project-2", p_billable: false }),
    );
    expect(out).toEqual({ started, stopped });
  });
});

describe("project unbilled selection", () => {
  const entry = (
    overrides: Partial<UnbilledTimeRow>,
  ): UnbilledTimeRow => ({
    id: "entry-1",
    project_id: "winky-loft",
    phase_key: null,
    task_id: null,
    user_id: "designer-1",
    started_at: "2026-08-06T15:00:00.000Z",
    duration_minutes: 90,
    notes: "Winky Loft site review",
    resolved_rate_cents: 20_000,
    amount_cents: 30_000,
    billing_state: "authorized",
    ...overrides,
  });

  it("keeps completed, billable, unclaimed Winky Loft entries without leaking another project", () => {
    const rows = [
      entry({ id: "winky-eligible" }),
      entry({ id: "winky-pending", billing_state: "pending_authorization" }),
      entry({ id: "other-project", project_id: "other-project" }),
    ];

    expect(filterProjectUnbilledEntries(rows, "winky-loft")).toEqual([
      expect.objectContaining({ id: "winky-eligible", project_id: "winky-loft" }),
    ]);
  });

  // MS-01 — an hour NOTHING priced. It is billable, un-invoiced, has a duration
  // and, on a non-services project, is billing_state 'authorized', so every
  // eligibility test above admits it while the rate and the amount are NULL and
  // the view COALESCEs both to 0. `useUnbilledTime` holds these out of `entries`
  // so no surface can tick them; `claim_time_entries` (00617) refuses them too.
  it("calls an hour nothing priced rate-pending, and only that hour", () => {
    expect(isRatePendingTimeEntry({ rate_source: "none" })).toBe(true);
    // A pre-00600 legacy row carries a real snapshot and is NOT pending.
    expect(isRatePendingTimeEntry({ rate_source: null })).toBe(false);
    expect(isRatePendingTimeEntry({})).toBe(false);
    expect(isRatePendingTimeEntry({ rate_source: "studio_member" })).toBe(false);
    expect(isRatePendingTimeEntry({ rate_source: "authority" })).toBe(false);
    expect(isRatePendingTimeEntry({ rate_source: "profile_default" })).toBe(false);
  });
});
