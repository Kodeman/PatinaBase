import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useStopTimer } from "../use-time-tracking";

const mockCreateBrowserClient = jest.fn();

jest.mock("@patina/supabase", () => ({
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
});
