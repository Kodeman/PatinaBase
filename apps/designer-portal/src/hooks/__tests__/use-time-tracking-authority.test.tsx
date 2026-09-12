import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  filterProjectUnbilledEntries,
  useCreateTimeEntry,
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
  // rated_amount_cents on INSERT outright. The insert row builder sends none of
  // them today; this pins that, so a future edit cannot quietly reintroduce one.
  // rate_role (HT-41) IS the member's to send, and is asserted to pass through.
  it("creates an entry without sending any rate, amount, billing state or provenance", async () => {
    let inserted: Record<string, unknown> | null = null;
    const from = jest.fn(() => ({
      insert: (row: Record<string, unknown>) => {
        inserted = row;
        return {
          select: () => ({
            single: async () => ({
              data: { id: "entry-2", project_id: "project-1", duration_minutes: 45 },
              error: null,
            }),
          }),
        };
      },
    }));
    mockCreateBrowserClient.mockReturnValue({
      from,
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    });

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
        source: "manual_entry",
        rateRole: "support_designer",
      });
    });

    expect(from).toHaveBeenCalledWith("project_time_entries");
    expect(Object.keys(inserted ?? {}).sort()).toEqual([
      "billable",
      "duration_minutes",
      "notes",
      "phase_key",
      "project_id",
      "rate_role",
      "source",
      "started_at",
      "task_id",
      "user_id",
    ]);
    expect(inserted).toEqual(
      expect.objectContaining({ rate_role: "support_designer", user_id: "user-1" }),
    );
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
});
