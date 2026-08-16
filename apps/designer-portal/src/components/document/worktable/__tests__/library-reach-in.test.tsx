/**
 * W3 3c — The Library Reach-In.
 *
 * Pins the lane's contract: the scored line renders quiet; typing enough
 * characters lays the sheet over the paper and hands the query to the
 * library's cross-layer search hook; pressing a result adds a line through
 * the FF&E facet's own creation path (buildProposalItemFromPick →
 * useAddProposalItem, with the proposalId); Esc puts the sheet back without
 * unmounting the paper beneath; a repeated add keeps the sheet open and
 * prints the quiet added line.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LibraryReachIn } from "../library-reach-in";

const mutateAsync = jest.fn();
const searchHook = jest.fn();
const refreshDraftingSummary = jest.fn();
const itemAdded = jest.fn();

jest.mock("@patina/supabase", () => ({
  useCrossLayerSearch: (opts: unknown) => searchHook(opts),
  useAddProposalItem: () => ({ mutateAsync, isPending: false }),
  useProposalScheduleItems: () => ({
    data: [
      {
        id: "line-1",
        product_id: null,
        doc_code: "SOF-01",
        scope_room_id: null,
        name: "Existing sofa",
        ffe_category: null,
      },
    ],
  }),
}));

jest.mock("@/hooks/use-drafting-facet-invalidation", () => ({
  useDraftingFacetInvalidation: () => refreshDraftingSummary,
}));

jest.mock("@/lib/analytics", () => ({
  proposalEvents: {
    itemAdded: (p: unknown) => itemAdded(p),
  },
}));

const ROW = {
  id: "prod-1",
  name: "Verellen Sofa",
  brand: "Verellen",
  price_retail: 120000,
  price_trade: 90000,
  images: ["https://img.example/sofa.jpg"],
  source_url: null,
  status: "published",
  category: "seating",
  configuration_mode: "standard",
  configuration_summary: null,
  layer: "studio",
  owner_user_id: null,
  studio_id: "studio-1",
  created_at: "2026-01-01T00:00:00Z",
};

const EMPTY = {
  byLayer: { personal: [], studio: [], catalog: [] },
  counts: { personal: 0, studio: 0, catalog: 0 },
  total: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  mutateAsync.mockResolvedValue({ id: "new-line" });
  searchHook.mockImplementation((opts) => {
    const { query } = opts as { query: string };
    return {
      data:
        query === "sofa"
          ? {
              byLayer: { personal: [], studio: [ROW], catalog: [] },
              counts: { personal: 0, studio: 1, catalog: 0 },
              total: 1,
            }
          : EMPTY,
      isLoading: false,
      isError: false,
    };
  });
});

const typeIntoLine = (value: string) =>
  fireEvent.change(screen.getByTestId("library-reach-in-line"), {
    target: { value },
  });

const openSheetWith = async (value: string) => {
  typeIntoLine(value);
  return screen.findByRole("dialog");
};

describe("LibraryReachIn", () => {
  it("renders the quiet scored search line with no sheet laid", () => {
    render(<LibraryReachIn proposalId="prop-1" />);

    expect(
      screen.getByPlaceholderText(/reach into the library/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays put below the typing threshold", () => {
    render(<LibraryReachIn proposalId="prop-1" />);

    typeIntoLine("s");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("typing opens the sheet over the paper and hands the query to the search hook", async () => {
    render(<LibraryReachIn proposalId="prop-1" />);

    await openSheetWith("sofa");

    // The search reaches the hook once the quiet debounce settles.
    await waitFor(() =>
      expect(searchHook).toHaveBeenCalledWith(
        expect.objectContaining({ query: "sofa" }),
      ),
    );
    expect(
      await screen.findByRole("button", { name: /verellen sofa/i }),
    ).toBeInTheDocument();
  });

  it("selecting a result adds the line through the facet creation path with the proposalId", async () => {
    render(<LibraryReachIn proposalId="prop-1" />);
    await openSheetWith("sofa");

    fireEvent.click(
      await screen.findByRole("button", { name: /verellen sofa/i }),
    );

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: "prop-1",
          productId: "prod-1",
          name: "Verellen Sofa",
          itemType: "fixed",
          quantity: 1,
          unitPrice: 120000,
          vendorName: "Verellen",
          scopeRoomId: null,
          docCode: expect.any(String),
        }),
      ),
    );
    // The facet's own follow-through: analytics + drafting-summary refresh.
    await waitFor(() => expect(refreshDraftingSummary).toHaveBeenCalled());
    expect(itemAdded).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: "prop-1",
        itemType: "fixed",
        hasProduct: true,
      }),
    );
  });

  it("Esc closes the sheet only — the paper beneath stays mounted", async () => {
    render(
      <div>
        <div data-testid="paper">the paper</div>
        <LibraryReachIn proposalId="prop-1" />
      </div>,
    );
    await openSheetWith("sofa");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("paper")).toBeInTheDocument();
    expect(screen.getByTestId("library-reach-in-line")).toBeInTheDocument();
  });

  it("a repeated add keeps the sheet open and prints the quiet added line", async () => {
    render(<LibraryReachIn proposalId="prop-1" />);
    await openSheetWith("sofa");

    const row = await screen.findByRole("button", { name: /verellen sofa/i });
    fireEvent.click(row);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    fireEvent.click(row);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("library-reach-in-status")).toHaveTextContent(
      /verellen sofa · added to the scheme/i,
    );
    // Both adds went through the same creation path for the same proposal.
    expect(mutateAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ proposalId: "prop-1", productId: "prod-1" }),
    );
  });
});
