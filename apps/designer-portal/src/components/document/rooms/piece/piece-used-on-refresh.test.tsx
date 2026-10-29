/**
 * US-28 R11 — the piece page keeps "Used on" mounted while the Add sheet
 * places the piece, so a successful add must refresh that read. The real
 * AddToProjectSheet, usePlaceInDocument and usePieceUsage run here; only the
 * Supabase edge (the placement RPC and the two reads) is stubbed.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** The lines on jobs the piece is on — what `project_ffe_items` returns. */
let liveLines: Array<{
  product_id: string;
  project_id: string;
  project: { name: string };
}> = [];
const placeRpc = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

jest.mock("@patina/supabase", () => ({
  fetchAllRows: jest.requireActual("@patina/supabase").fetchAllRows,
  boundedIn: jest.requireActual("@patina/supabase").boundedIn,
  useProjects: () => ({
    data: [{ id: "project-1", name: "Holloway Den", status: "active" }],
    isLoading: false,
  }),
  usePlaceProductInProjectV2: () => ({ mutateAsync: placeRpc }),
  createBrowserClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        in: () => chain,
        is: () => chain,
        order: () => chain,
        range: (from: number, to: number) => Promise.resolve({ data: liveLines.slice(from, to + 1), error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({
          data: [{ project_id: "project-1", client_name: "The Hollowways", active_section: "proposal" }],
          error: null,
        }).then(resolve),
      };
      return chain;
    },
  }),
}));

jest.mock("@/lib/analytics/events", () => ({
  productEvents: { addToProject: jest.fn() },
}));
jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock("@/lib/help-system/open-help", () => ({ openHelp: jest.fn() }));

import { AddToProjectSheet } from "./add-to-project-sheet";
import { PieceUsedOn } from "../library/piece-used-on";

describe("Used on refreshes after the Add sheet places the piece (R11)", () => {
  beforeEach(() => {
    liveLines = [];
    placeRpc.mockReset();
  });

  it("the mounted Used on names the job once the add succeeds", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    placeRpc.mockImplementation(async () => {
      liveLines = [
        {
          product_id: "product-1",
          project_id: "project-1",
          project: { name: "Holloway Den" },
        },
      ];
      return { outcome: "created", selectionId: "selection-1" };
    });

    render(
      <QueryClientProvider client={client}>
        <PieceUsedOn productId="product-1" />
        <AddToProjectSheet
          open
          onClose={jest.fn()}
          piece={{ id: "product-1", name: "Oak chair" }}
          onAdded={jest.fn()}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Not on a job yet.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Holloway Den/i }));

    await waitFor(() => expect(placeRpc).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("link", { name: "Holloway Den" }),
    ).toHaveAttribute("href", "/doc/project-1");
    expect(screen.queryByText("Not on a job yet.")).toBeNull();
  });
});
