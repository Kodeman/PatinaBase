import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  adaptProjectBillingAuthority,
  useCreateServiceAddendum,
} from "../use-commercial-documents";

const mockCreateBrowserClient = jest.fn();

jest.mock("@patina/supabase", () => ({
  createBrowserClient: () => mockCreateBrowserClient(),
}));

describe("project billing authority RPC adapter", () => {
  it("adapts the current nested 00406 envelope and drops raw activity", () => {
    const result = adaptProjectBillingAuthority({
      authority: {
        id: "authority-1",
        projectId: "project-1",
        agreementId: "agreement-1",
        state: "active",
        currency: "USD",
        ceilingCents: 1_000_000,
        retainerAmountCents: 100_000,
        retainerPaidCents: 100_000,
        retainerActivationPolicy: "retainer_paid",
        activeRateVersion: 2,
      },
      rates: [
        {
          id: "rate-1",
          proposalId: "agreement-1",
          version: 2,
          roleName: "Principal designer",
          hourlyRateCents: 20_000,
          effectiveAt: "2026-08-03T00:00:00.000Z",
        },
      ],
      summary: {
        authorizedCents: 700_000,
        accruedCents: 700_000,
        invoicedCents: 400_000,
        pendingAuthorizationCents: 50_000,
        remainingCents: 300_000,
        billingThrough: "Aug 3, 2026",
      },
      activitySummaries: [{ notes: "internal activity must not escape" }],
      includesRawEntries: false,
    });

    expect(result).toMatchObject({
      id: "authority-1",
      authorizedCents: 700_000,
      pendingAuthorizationCents: 50_000,
      rates: [{ roleName: "Principal designer", hourlyRateCents: 20_000 }],
    });
    expect(result).not.toHaveProperty("activitySummaries");
    expect(JSON.stringify(result)).not.toContain("internal activity");
    // R8: never fabricated — absent from the payload means null, not 0.
    expect(result?.furnishingsDepositPercent).toBeNull();
  });

  it("reads the furnishings deposit percent once the summary carries it", () => {
    const result = adaptProjectBillingAuthority({
      id: "authority-1",
      projectId: "project-1",
      agreementId: "agreement-1",
      state: "active",
      furnishings_deposit_percent: 50,
    });
    expect(result?.furnishingsDepositPercent).toBe(50);
  });

  it("fails closed on an unknown authority state", () => {
    expect(
      adaptProjectBillingAuthority({
        id: "authority-1",
        projectId: "project-1",
        agreementId: "agreement-1",
        state: "future_state",
      })?.state,
    ).toBe("superseded");
  });
});

describe("create services addendum RPC", () => {
  it("uses the exact project/title RPC contract without touching authority", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        proposalId: "proposal-addendum-1",
        documentId: "document-addendum-1",
        projectId: "project-1",
        documentKind: "service_addendum",
        commercialState: "draft",
      },
      error: null,
    });
    mockCreateBrowserClient.mockReturnValue({ rpc });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateServiceAddendum("project-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync("  August services addendum  ");
    });

    expect(rpc).toHaveBeenCalledWith("create_service_addendum", {
      p_project_id: "project-1",
      p_title: "August services addendum",
    });
    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["project-billing-authority", "project-1"],
      }),
    );
  });
});
