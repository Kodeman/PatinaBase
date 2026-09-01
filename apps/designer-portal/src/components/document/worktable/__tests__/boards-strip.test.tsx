import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { BoardsStrip } from "../boards-strip";
import { boardRoomHref } from "@/lib/mood-board/navigation";

const push = jest.fn();
const upsert = jest.fn();
const runAutosaveAction = jest.fn(
  async (
    _owner: { kind: "proposal" | "project"; id: string },
    action: () => Promise<void>,
  ) => action(),
);

function makeBoard(
  overrides: Partial<{
    id: string;
    name: string;
    scope_room_id: string | null;
    item_count: number;
    status: string;
    sort_order: number;
  }>,
) {
  return {
    id: "board-1",
    proposal_id: "proposal-1",
    project_id: null,
    name: "Living room direction",
    scope_room_id: null,
    cover_image_url: null,
    cover_fallback_url: null,
    cover_fallback_urls: [],
    canvas_width: 1200,
    canvas_height: 800,
    background_color: "#FAF8F5",
    sort_order: 0,
    sections: [],
    status: "active",
    item_count: 4,
    verdict_counts: { approved: 0, rejected: 0, comment: 0, total: 0 },
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

let mockBoards: ReturnType<typeof makeBoard>[] = [];
let mockBoardsQueryState = { isLoading: false, isError: false };

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/doc/rel-1",
}));

jest.mock("@/lib/proposal-autosave-registry", () => ({
  runBoardOwnerAutosaveAction: (
    ...args: Parameters<typeof runAutosaveAction>
  ) => runAutosaveAction(...args),
}));

jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

jest.mock("@/lib/analytics/mood-board-events", () => ({
  moodBoardEvents: {
    templateUsed: jest.fn(),
  },
}));

// BoardCreatePickerDialog (IA-5 — the strip now opens the same picker the
// Drafting Room facet uses) needs the design-system Dialog primitives and a
// wider @patina/supabase surface than the strip's own reads.
jest.mock("@patina/design-system", () => ({
  Dialog: ({
    open,
    children,
  }: React.PropsWithChildren<{ open: boolean }>) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: React.PropsWithChildren) => (
    <p>{children}</p>
  ),
  DialogHeader: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

jest.mock("@patina/supabase", () => ({
  useBoards: () => ({ data: mockBoards, ...mockBoardsQueryState }),
  useUpsertBoard: () => ({ mutateAsync: upsert, isPending: false }),
  useOrganizations: () => ({ data: [{ id: "studio-1", type: "design_studio" }] }),
  useBoardTemplates: () => ({ data: [], isLoading: false, isError: false }),
  useCreateProjectBoard: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useMaterializeBoardTemplate: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const expectedHref = (boardId: string) =>
  boardRoomHref({ boardId, from: "/doc/rel-1", source: "drafting_strip" });

describe("BoardsStrip", () => {
  beforeEach(() => {
    push.mockReset();
    upsert.mockReset();
    runAutosaveAction.mockClear();
    mockBoardsQueryState = { isLoading: false, isError: false };
    mockBoards = [
      makeBoard({
        id: "board-1",
        name: "Living room direction",
        scope_room_id: "room-1",
      }),
      makeBoard({
        id: "board-2",
        name: "Kitchen textures",
        scope_room_id: "room-2",
        item_count: 1,
        sort_order: 1,
      }),
    ];
  });

  it("renders a tile per live board in the wide strip, opening through the facet room link", () => {
    const { container } = render(<BoardsStrip proposalId="proposal-1" />);

    const wide = container.querySelector(
      "[data-boards-strip-wide]",
    ) as HTMLElement;
    const tiles = within(wide).getAllByRole("link");
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveAccessibleName("Open board Living room direction");
    expect(tiles[0]).toHaveAttribute("href", expectedHref("board-1"));
    expect(tiles[1]).toHaveAttribute("href", expectedHref("board-2"));
    expect(within(wide).getByText("4 pieces")).toBeInTheDocument();
    expect(within(wide).getByText("1 piece")).toBeInTheDocument();
  });

  it("filters archived boards out of the strip", () => {
    mockBoards = [
      makeBoard({ id: "board-1", name: "Living room direction" }),
      makeBoard({
        id: "board-3",
        name: "Retired direction",
        status: "archived",
      }),
    ];
    const { container } = render(<BoardsStrip proposalId="proposal-1" />);

    const wide = container.querySelector(
      "[data-boards-strip-wide]",
    ) as HTMLElement;
    expect(within(wide).getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByText("Retired direction")).not.toBeInTheDocument();
  });

  it("starts a board through the SAME picker the facet uses, and lands in its room (IA-5)", async () => {
    upsert.mockResolvedValue({ id: "board-new" });
    render(<BoardsStrip proposalId="proposal-1" />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Start a board" })[0],
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Blank board A clean, flexible canvas. Choose",
      }),
    );

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(expectedHref("board-new")),
    );
    expect(runAutosaveAction).toHaveBeenCalledWith(
      { kind: "proposal", id: "proposal-1" },
      expect.any(Function),
    );
    expect(upsert).toHaveBeenCalledWith({
      proposalId: "proposal-1",
      name: "Board 3",
      sortOrder: 2,
    });
  });

  it("surfaces a creation failure without navigating", async () => {
    upsert.mockRejectedValue(new Error("RLS said no."));
    render(<BoardsStrip proposalId="proposal-1" />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Start a board" })[0],
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Blank board A clean, flexible canvas. Choose",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("RLS said no.");
    expect(push).not.toHaveBeenCalled();
  });

  it("prints the compact seam and expands it in place to the same tiles and start line", () => {
    const { container } = render(<BoardsStrip proposalId="proposal-1" />);

    const row = screen.getByRole("button", { name: /Boards 2 boards unfold/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(
      container.querySelector("[data-boards-strip-list]"),
    ).not.toBeInTheDocument();

    fireEvent.click(row);

    expect(row).toHaveAttribute("aria-expanded", "true");
    const list = container.querySelector(
      "[data-boards-strip-list]",
    ) as HTMLElement;
    const tiles = within(list).getAllByRole("link");
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveAttribute("href", expectedHref("board-1"));
    expect(
      within(list).getByRole("button", { name: "Start a board" }),
    ).toBeInTheDocument();

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(
      container.querySelector("[data-boards-strip-list]"),
    ).not.toBeInTheDocument();
  });

  it("lifts the lensed room’s boards to the front without hiding the rest", () => {
    const { container } = render(
      <BoardsStrip proposalId="proposal-1" roomFilter="room-2" />,
    );

    const wide = container.querySelector(
      "[data-boards-strip-wide]",
    ) as HTMLElement;
    const tiles = within(wide).getAllByRole("link");
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveAccessibleName("Open board Kitchen textures");
    expect(tiles[1]).toHaveAccessibleName("Open board Living room direction");
  });

  it("prints nothing while the read is unsettled", () => {
    mockBoardsQueryState = { isLoading: true, isError: false };
    const { container } = render(<BoardsStrip proposalId="proposal-1" />);
    expect(
      container.querySelector("[data-boards-strip]"),
    ).not.toBeInTheDocument();
  });
});
