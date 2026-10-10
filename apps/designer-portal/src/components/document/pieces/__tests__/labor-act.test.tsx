/**
 * T-30 (S4, D4/D5, a7): ADD LABOR makes the indented ↳ labor line under its
 * piece through useAddLaborLine, with its own unit and rough price; it is
 * gated on the pieces add_labor_line refuses. And COM on the line: "This
 * piece takes COM" reuses the buy cell's pair (buying/com-piece.tsx).
 * Fixture: SPEC §4.2, R1 (wallpaper, 9 roll) and R1a (the hanger).
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FfePairLine } from "@patina/supabase";

const mockAddLabor = jest.fn();
const mockCreate = jest.fn();
const mockLink = jest.fn();
const mockLines: { data: FfePairLine[] | undefined } = { data: [] };

jest.mock("@patina/supabase", () => ({
  useAddLaborLine: () => ({ mutateAsync: mockAddLabor, isPending: false }),
  useFfePairLines: () => ({ data: mockLines.data }),
  useLinkFfePair: () => ({ mutateAsync: mockLink, isPending: false }),
  useCreateNamedProjectNeed: () => ({
    mutateAsync: mockCreate,
    isPending: false,
  }),
}));
jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import {
  LaborAct,
  parseRoughCents,
  type LaborLineRow,
  type LaborPieceRow,
} from "../labor-act";
import { ComToggle } from "../com-toggle";

const R1: LaborPieceRow = {
  id: "r1",
  name: "Wallpaper, grasscloth",
  quantity: 9,
  unit: "roll",
  product_id: "prod-hemp",
  vendor_id: "v-pj",
  item_type: "fixed",
  unit_price_cents: 23000,
  line_kind: "goods",
  parent_ffe_item_id: null,
  purchase_order_id: null,
  trade_scope_document_id: null,
  ffe_line_authorization: null,
};

const R1A: LaborLineRow = {
  id: "r1a",
  name: "Install, wallpaper hanger",
  quantity: 9,
  unit: "roll",
  rough_cents: 8500,
  line_kind: "labor",
  parent_ffe_item_id: "r1",
  vendor_id: null,
  vendor_name: null,
  item_type: "tbd",
};

const renderLabor = (
  piece: LaborPieceRow = R1,
  laborLines: LaborLineRow[] = [],
  canEdit = true,
) =>
  render(
    <LaborAct
      projectId="p1"
      piece={piece}
      laborLines={laborLines}
      canEdit={canEdit}
    />,
  );

beforeEach(() => {
  mockAddLabor.mockReset();
  mockAddLabor.mockResolvedValue({ selectionId: "new-labor" });
  mockCreate.mockReset();
  mockLink.mockReset();
  mockLines.data = [];
});

describe("ADD LABOR", () => {
  it("puts focus on the new labor line's name once it is here, and on ADD LABOR meanwhile (T-60a F6)", async () => {
    mockAddLabor.mockResolvedValue({ selectionId: "r1a" });
    const { rerender } = renderLabor();
    fireEvent.click(screen.getByRole("button", { name: "ADD LABOR" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Labor" }), {
      target: { value: "Install, wallpaper hanger" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ADD THE LABOR LINE" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "ADD LABOR" })).toHaveFocus(),
    );
    rerender(
      <LaborAct projectId="p1" piece={R1} laborLines={[R1A]} canEdit />,
    );
    await waitFor(() =>
      expect(screen.getByText("Install, wallpaper hanger")).toHaveFocus(),
    );
  });

  it("Esc closes the form and gives focus back to ADD LABOR", () => {
    renderLabor();
    fireEvent.click(screen.getByRole("button", { name: "ADD LABOR" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Labor" }), {
      key: "Escape",
    });
    expect(screen.getByRole("button", { name: "ADD LABOR" })).toHaveFocus();
  });

  it("adds the labor line under its piece with its own name, quantity, unit and rough price", async () => {
    renderLabor();
    fireEvent.click(screen.getByRole("button", { name: "ADD LABOR" }));
    // The piece's quantity and unit start the line; the labor keeps its own.
    expect(screen.getByRole("textbox", { name: "Qty" })).toHaveValue("9");
    expect(screen.getByRole("combobox", { name: "Unit" })).toHaveValue("roll");
    fireEvent.change(screen.getByRole("textbox", { name: "Labor" }), {
      target: { value: "  Install, wallpaper hanger " },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Rough $ / roll" }), {
      target: { value: "$85" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ADD THE LABOR LINE" }));
    await waitFor(() => expect(mockAddLabor).toHaveBeenCalledTimes(1));
    expect(mockAddLabor).toHaveBeenCalledWith({
      projectId: "p1",
      parentItemId: "r1",
      name: "Install, wallpaper hanger",
      quantity: 9,
      unit: "roll",
      roughCents: 8500,
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "ADD THE LABOR LINE" }),
      ).toBeNull(),
    );
  });

  it("can price labor in another unit than its piece, and leave the rough blank", async () => {
    renderLabor();
    fireEvent.click(screen.getByRole("button", { name: "ADD LABOR" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Labor" }), {
      target: { value: "Prep walls" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Qty" }), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Unit" }), {
      target: { value: "hour" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ADD THE LABOR LINE" }));
    await waitFor(() => expect(mockAddLabor).toHaveBeenCalledTimes(1));
    expect(mockAddLabor.mock.calls[0][0]).toMatchObject({
      quantity: 6,
      unit: "hour",
      roughCents: null,
    });
  });

  it("asks for a name before writing", () => {
    renderLabor();
    fireEvent.click(screen.getByRole("button", { name: "ADD LABOR" }));
    fireEvent.click(screen.getByRole("button", { name: "ADD THE LABOR LINE" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "A labor line needs a name.",
    );
    expect(mockAddLabor).not.toHaveBeenCalled();
  });

  it("prints the RPC's refusal and keeps the form", async () => {
    mockAddLabor.mockRejectedValueOnce(
      new Error("add_labor_line: vendor not found"),
    );
    renderLabor();
    fireEvent.click(screen.getByRole("button", { name: "ADD LABOR" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Labor" }), {
      target: { value: "Install" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ADD THE LABOR LINE" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "vendor not found",
    );
    expect(
      screen.getByRole("button", { name: "ADD THE LABOR LINE" }),
    ).toBeInTheDocument();
  });

  it("prints the labor line indented under its piece: ↳, LABOR beside its stage, its unit and rough", () => {
    renderLabor(R1, [R1A]);
    const row = screen.getByTestId("labor-line");
    expect(row).toHaveClass("pl-6");
    expect(row).toHaveTextContent("↳");
    expect(row).toHaveTextContent("Install, wallpaper hanger");
    expect(row).toHaveTextContent("Labor");
    expect(row).toHaveTextContent("Placeholder");
    expect(row).toHaveTextContent("9 rolls");
    expect(row).toHaveTextContent("~$85 / roll");
  });

  it.each([
    [
      { ffe_line_authorization: "sent" },
      "The piece is released. Labor changes through Record a change.",
    ],
    [
      { purchase_order_id: "po-1" },
      "The piece is on an order. Labor changes through Record a change.",
    ],
    [
      { trade_scope_document_id: "ts-1" },
      "This line is a Trade Scope; its work is billed by the scope.",
    ],
    [
      { parent_ffe_item_id: "sofa" },
      "Labor attaches to a piece, not to a line that supplies one.",
    ],
  ])("is gated with its reason, never disabled: %o", (over, reason) => {
    renderLabor({ ...R1, ...over });
    const act = screen.getByRole("button", { name: "ADD LABOR" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(act).not.toHaveAttribute("disabled");
    expect(act).toHaveAccessibleDescription(reason);
    fireEvent.click(act);
    expect(screen.queryByRole("textbox", { name: "Labor" })).toBeNull();
  });

  it("a labor line takes no labor of its own", () => {
    const { container } = renderLabor({
      ...R1A,
      parent_ffe_item_id: "r1",
    } as LaborPieceRow);
    expect(container).toBeEmptyDOMElement();
  });

  it("reads rough dollars with or without $, commas and cents", () => {
    expect(parseRoughCents("4,800")).toBe(480000);
    expect(parseRoughCents("~$85.5")).toBe(8550);
    expect(parseRoughCents("")).toBeNull();
    expect(parseRoughCents("85 a roll")).toBe("invalid");
  });
});

const pairLine = (over: Partial<FfePairLine>): FfePairLine => ({
  id: "x",
  name: "x",
  project_room_id: "living",
  assignment_scope: "room",
  vendor_id: null,
  vendor_name: null,
  purchase_order_id: null,
  parent_ffe_item_id: null,
  link_kind: null,
  purchase_order: null,
  ...over,
});

const CABINET = pairLine({
  id: "l1",
  name: "Custom cabinet",
  vendor_name: "Hollis Millwork",
});
const CABINET_ITEM = {
  id: "l1",
  name: "Custom cabinet",
  project_room_id: "living",
  assignment_scope: "room",
};

describe("COM on the line", () => {
  it("This piece takes COM adds the fabric line and links it to the piece as COM", async () => {
    mockLines.data = [CABINET];
    mockCreate.mockResolvedValue({ selectionId: "fabric-1" });
    mockLink.mockResolvedValue({ project_id: "p1" });
    render(<ComToggle projectId="p1" item={CABINET_ITEM} canEdit />);
    const box = screen.getByRole("checkbox", { name: "This piece takes COM" });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    await waitFor(() => expect(mockLink).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      projectId: "p1",
      name: "Custom cabinet — COM fabric",
      roomId: "living",
      assignmentScope: "room",
    });
    expect(mockLink).toHaveBeenCalledWith({
      childId: "fabric-1",
      parentId: "l1",
    });
  });

  it("reads a COM child as ticked, names the fabric, and clearing it unlinks the fabric", async () => {
    mockLines.data = [
      CABINET,
      pairLine({
        id: "fab",
        name: "Custom cabinet — COM fabric",
        vendor_name: "Kessler",
        parent_ffe_item_id: "l1",
        link_kind: "com",
      }),
      // Labor on the piece is not COM.
      pairLine({
        id: "lab",
        name: "Install",
        parent_ffe_item_id: "l1",
        link_kind: "labor",
      }),
    ];
    mockLink.mockResolvedValue({ project_id: "p1" });
    render(<ComToggle projectId="p1" item={CABINET_ITEM} canEdit />);
    const box = screen.getByRole("checkbox", { name: "This piece takes COM" });
    expect(box).toBeChecked();
    expect(
      screen.getByText("Takes COM · Custom cabinet — COM fabric from Kessler"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Takes COM · Install/)).toBeNull();
    fireEvent.click(box);
    await waitFor(() =>
      expect(mockLink).toHaveBeenCalledWith({ childId: "fab", parentId: null }),
    );
    expect(mockLink).toHaveBeenCalledTimes(1);
  });

  it("a labor line is a line on a piece, so its box is gated with the reason", () => {
    mockLines.data = [
      CABINET,
      pairLine({
        id: "lab",
        name: "Install",
        parent_ffe_item_id: "l1",
        link_kind: "labor",
      }),
    ];
    render(
      <ComToggle
        projectId="p1"
        item={{
          id: "lab",
          name: "Install",
          parent_ffe_item_id: "l1",
          link_kind: "labor",
        }}
        canEdit
      />,
    );
    const box = screen.getByRole("checkbox", { name: "This piece takes COM" });
    expect(box).toHaveAttribute("aria-disabled", "true");
    expect(box).toHaveAccessibleDescription(
      "This line is on a piece, so it takes no COM.",
    );
    fireEvent.click(box);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockLink).not.toHaveBeenCalled();
  });
});
