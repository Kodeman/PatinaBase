/**
 * US-21 T-57 (S8, D16, Q10): the Finishes lens (a11), the painter's print,
 * and the reading of a room palette's swatches. Fixture: SPEC §5 frame 11,
 * the Bedroom of Whole Home Renovation.
 */
import { Suspense } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

const mockMutate = jest.fn();
let mockPalettes: Array<{ scope_room_id: string | null; swatches: unknown }> =
  [];

jest.mock("@patina/supabase", () => ({
  useProjectPalettes: () => ({ data: mockPalettes }),
  useSetRoomFinishes: () => ({ mutate: mockMutate, isPending: false }),
}));
jest.mock("@/hooks/use-document-rooms", () => ({
  useDocumentRooms: () => ({
    data: [
      { id: "hall", name: "Hall" },
      { id: "kitchen", name: "Kitchen" },
      { id: "bedroom", name: "Bedroom" },
    ],
  }),
}));
jest.mock("@/hooks/use-document-state", () => ({
  useDocumentEngagement: () => ({
    data: {
      kind: "engagement",
      row: { project_id: "project-1", title: "Whole Home Renovation" },
    },
  }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

import {
  FinishesLens,
  normalizeHex,
  readRoomFinishes,
  roomWallFinish,
} from "../finishes-lens";
import FinishesPrintPage from "@/app/(document)/doc/[id]/pieces/finishes/print/page";

const BEDROOM = {
  scope_room_id: "bedroom",
  swatches: [
    {
      surface: "Walls",
      product: "Farrow & Ball Setting Plaster No. 231",
      brand: null,
      brand_code: null,
      sheen: "Eggshell",
      hex: "#F2DCD2",
      sort_order: 0,
    },
    {
      surface: "Ceiling",
      product: "Benjamin Moore Chantilly Lace OC-65",
      brand: null,
      brand_code: null,
      sheen: "Flat",
      hex: "#F7F6F1",
      sort_order: 1,
    },
    {
      surface: "Trim and doors",
      product: "Chantilly Lace OC-65",
      brand: null,
      brand_code: null,
      sheen: "Satin",
      hex: "#F7F6F1",
      sort_order: 2,
    },
  ],
};

const KITCHEN = {
  scope_room_id: "kitchen",
  // An older palette row: {hex, name, role, brand, brand_code, sort_order}.
  swatches: [
    {
      hex: "#E8E4DA",
      name: "Pointing",
      role: "wall",
      brand: "Farrow & Ball",
      brand_code: "No. 2003",
      sort_order: 0,
    },
  ],
};

beforeEach(() => {
  mockMutate.mockReset();
  mockPalettes = [BEDROOM, KITCHEN];
});

const renderLens = (room: string | null = "bedroom") =>
  render(
    <FinishesLens
      docId="doc-1"
      projectId="project-1"
      room={room}
      canSeeMoney
    />,
  );

const lastWrite = () => mockMutate.mock.calls.at(-1)?.[0];

describe("the Finishes lens (a11)", () => {
  it("prints Bedroom · Finishes as SURFACE · PRODUCT · SHEEN · SWATCH, a 24×24 swatch per row", () => {
    renderLens();
    const table = screen.getByRole("table", { name: "Bedroom · Finishes" });
    expect(
      screen.getByRole("heading", { name: "Bedroom · Finishes" }),
    ).toBeInTheDocument();
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent)
        .slice(0, 4),
    ).toEqual(["Surface", "Product", "Sheen", "Swatch"]);

    const surfaces = within(table)
      .getAllByRole("textbox", { name: /^Surface \d/ })
      .map((input) => (input as HTMLInputElement).value);
    expect(surfaces).toEqual(["Walls", "Ceiling", "Trim and doors"]);
    expect(
      within(table).getByRole("combobox", { name: "Sheen for Walls" }),
    ).toHaveValue("Eggshell");

    const swatch = within(table).getByRole("img", {
      name: "Farrow & Ball Setting Plaster No. 231 swatch",
    });
    expect(swatch).toHaveAttribute("width", "24");
    expect(swatch).toHaveAttribute("height", "24");
    expect(swatch.querySelector("rect")).toHaveAttribute("fill", "#F2DCD2");
    // Only the room in hand.
    expect(
      screen.queryByRole("table", { name: "Kitchen · Finishes" }),
    ).not.toBeInTheDocument();
  });

  it("offers the print, addressed to the painter, and nothing more", () => {
    renderLens();
    const print = screen.getByRole("link", {
      name: "Print the paint and finish schedule",
    });
    expect(print).toHaveAttribute("href", "/doc/doc-1/pieces/finishes/print");
    expect(
      screen.getByText(
        "One page per room, addressed to the painter. Nothing else prints on it.",
      ),
    ).toBeInTheDocument();
  });

  it("saves a cell when she leaves it, writing the room's whole list through useSetRoomFinishes", () => {
    renderLens();
    const sheen = screen.getByRole("combobox", { name: "Sheen for Ceiling" });
    fireEvent.change(sheen, { target: { value: "Matte" } });
    fireEvent.blur(sheen);
    expect(mockMutate).toHaveBeenCalledTimes(1);
    const write = lastWrite();
    expect(write.projectId).toBe("project-1");
    expect(write.roomId).toBe("bedroom");
    expect(write.finishes.map((f: { surface: string }) => f.surface)).toEqual([
      "Walls",
      "Ceiling",
      "Trim and doors",
    ]);
    expect(write.finishes[1]).toMatchObject({
      surface: "Ceiling",
      product: "Benjamin Moore Chantilly Lace OC-65",
      sheen: "Matte",
      hex: "#F7F6F1",
    });
  });

  it("does not write a cell she left unchanged", () => {
    renderLens();
    fireEvent.blur(screen.getByRole("textbox", { name: "Product for Walls" }));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("adds a surface on Enter and takes her to its product", () => {
    renderLens();
    const entry = screen.getByRole("textbox", {
      name: "New surface in Bedroom",
    });
    fireEvent.change(entry, { target: { value: "Closet walls" } });
    fireEvent.keyDown(entry, { key: "Enter" });
    expect(lastWrite().finishes).toHaveLength(4);
    expect(lastWrite().finishes[3]).toMatchObject({
      surface: "Closet walls",
      product: null,
      sheen: null,
      hex: null,
    });
    expect(
      screen.getByRole("textbox", { name: "Product for Closet walls" }),
    ).toHaveFocus();
    expect(entry).toHaveValue("");
  });

  it("removes a surface", () => {
    renderLens();
    fireEvent.click(screen.getByRole("button", { name: "Remove Ceiling" }));
    expect(
      lastWrite().finishes.map((f: { surface: string }) => f.surface),
    ).toEqual(["Walls", "Trim and doors"]);
  });

  it("writes a swatch colour as #RRGGBB and refuses anything else, saying how", () => {
    renderLens();
    const hex = screen.getByRole("textbox", {
      name: "Swatch colour for Trim and doors",
    });
    fireEvent.change(hex, { target: { value: "eggshell white" } });
    fireEvent.blur(hex);
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Write the colour as #RRGGBB, for example #F2DCD2.",
    );
    expect(hex).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(hex, { target: { value: "fff" } });
    fireEvent.blur(hex);
    expect(lastWrite().finishes[2].hex).toBe("#FFFFFF");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lays every room out on the whole job, an empty room with only its entry row", () => {
    renderLens(null);
    expect(
      screen
        .getAllByRole("table")
        .map((t) => t.getAttribute("aria-labelledby")),
    ).toHaveLength(3);
    expect(
      screen.getByRole("heading", { name: "Hall · Finishes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "New surface in Hall" }),
    ).toBeInTheDocument();
  });

  it("sends a place that is not a room back to its rooms", () => {
    renderLens("unassigned");
    expect(
      screen.getByText(
        "Finishes are kept by room. Choose a room to note its surfaces.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("reading a room palette (00760)", () => {
  it("reads the lens's own rows as written", () => {
    expect(readRoomFinishes(BEDROOM.swatches)[0]).toEqual({
      surface: "Walls",
      product: "Farrow & Ball Setting Plaster No. 231",
      brand: null,
      brandCode: null,
      sheen: "Eggshell",
      hex: "#F2DCD2",
      sortOrder: 0,
    });
  });

  it("reads an older row's role as the surface and its brand, name and code as the product", () => {
    expect(readRoomFinishes(KITCHEN.swatches)).toEqual([
      {
        surface: "Walls",
        product: "Farrow & Ball Pointing No. 2003",
        brand: "Farrow & Ball",
        brandCode: "No. 2003",
        sheen: null,
        hex: "#E8E4DA",
        sortOrder: 0,
      },
    ]);
    expect(readRoomFinishes(null)).toEqual([]);
  });

  it("finds the wall's swatch, never a wall with no colour or wallpaper", () => {
    expect(roomWallFinish(readRoomFinishes(BEDROOM.swatches))?.hex).toBe(
      "#F2DCD2",
    );
    expect(
      roomWallFinish(
        readRoomFinishes([
          { surface: "Wallpaper", hex: "#111111", sort_order: 0 },
          { surface: "Walls", hex: null, sort_order: 1 },
        ]),
      ),
    ).toBeNull();
  });

  it("normalizes a colour", () => {
    expect(normalizeHex("#f2dcd2")).toBe("#F2DCD2");
    expect(normalizeHex("F2DCD2")).toBe("#F2DCD2");
    expect(normalizeHex("#fdc")).toBe("#FFDDCC");
    expect(normalizeHex("eggshell")).toBeNull();
  });
});

describe("the painter's print", () => {
  async function renderPrint() {
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <FinishesPrintPage params={Promise.resolve({ id: "doc-1" })} />
        </Suspense>,
      );
    });
  }

  it("renders one page per room with finishes, addressed to the painter", async () => {
    await renderPrint();
    const pages = await screen.findAllByTestId("finishes-print-page");
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.getAttribute("aria-label"))).toEqual([
      "Kitchen, for the painter",
      "Bedroom, for the painter",
    ]);
    const bedroom = pages[1];
    expect(
      within(bedroom).getByText("Paint and finish schedule · For the painter"),
    ).toBeInTheDocument();
    expect(
      within(bedroom).getByText("Whole Home Renovation"),
    ).toBeInTheDocument();
    expect(
      within(bedroom)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Surface", "Product", "Sheen", "Swatch"]);
    expect(within(bedroom).getAllByRole("row")).toHaveLength(4);
    expect(
      within(bedroom)
        .getByRole("img", {
          name: "Farrow & Ball Setting Plaster No. 231 swatch",
        })
        .querySelector("rect"),
    ).toHaveAttribute("fill", "#F2DCD2");
  });

  it("says so when no room has a finish yet", async () => {
    mockPalettes = [];
    await renderPrint();
    expect(
      await screen.findByText(/No finishes are noted yet\./),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("finishes-print-page")).not.toBeInTheDocument();
  });
});
