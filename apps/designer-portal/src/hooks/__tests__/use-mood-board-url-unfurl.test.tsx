import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

const mockInvoke = jest.fn();

// @patina/supabase is not a tsconfig path alias in designer-portal, so this
// uses ordinary workspace resolution and the package-level mock applies.
jest.mock("@patina/supabase", () => ({
  createBrowserClient: () => ({
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  }),
}));

import { useMoodBoardUrlUnfurl } from "../use-mood-board-url-unfurl";
import { MoodBoardUrlUnfurlError } from "@/lib/mood-board/url-unfurl";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: 4, retryDelay: 0 },
    },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useMoodBoardUrlUnfurl", () => {
  beforeEach(() => mockInvoke.mockReset());

  it("invokes capture-from-url in capture mode and returns a typed result", async () => {
    mockInvoke.mockResolvedValue({
      data: {
        name: "Lounge Chair",
        brand: "Example",
        images: ["https://cdn.example.com/chair.jpg"],
        sourceUrl: "https://example.com/chair",
      },
      error: null,
    });
    const { result } = renderHook(() => useMoodBoardUrlUnfurl(), {
      wrapper: createWrapper(),
    });

    let resolved:
      | Awaited<ReturnType<typeof result.current.mutateAsync>>
      | undefined;
    await act(async () => {
      resolved = await result.current.mutateAsync({
        url: " https://example.com/chair ",
      });
    });

    expect(mockInvoke).toHaveBeenCalledWith("capture-from-url", {
      body: { url: "https://example.com/chair", mode: "capture" },
    });
    expect(resolved).toEqual({
      sourceUrl: "https://example.com/chair",
      host: "example.com",
      name: "Lounge Chair",
      brand: "Example",
      description: null,
      priceRetailCents: null,
      images: ["https://cdn.example.com/chair.jpg"],
    });
  });

  it("surfaces structured rate limits and never automatically retries", async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        context: {
          status: 429,
          headers: { get: () => "120" },
          json: async () => ({
            code: "url_unfurl_rate_limited",
            rate_limit: {
              reason: "daily_limit",
              limit: 100,
              remaining: 0,
              retry_after_seconds: 120,
              reset_at: "2026-08-04T00:00:00.000Z",
            },
          }),
        },
      },
    });
    const { result } = renderHook(() => useMoodBoardUrlUnfurl(), {
      wrapper: createWrapper(),
    });
    let thrown: unknown;

    await act(async () => {
      try {
        await result.current.mutateAsync({ url: "https://example.com/chair" });
      } catch (error) {
        thrown = error;
      }
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(thrown).toBeInstanceOf(MoodBoardUrlUnfurlError);
    expect(thrown).toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: 120,
      resetAt: "2026-08-04T00:00:00.000Z",
    });
  });
});
