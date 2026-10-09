/**
 * US-21 T-24 — the Rough in table (SPEC a2, a8, a9, a15; S1, S5, S6).
 * Fixture names are SPEC §4.2's.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ROUGH_IN_KEY_HINT,
  ROUGH_IN_PHONE_QUERY,
  ROUGH_IN_TOUCH_HINT,
  formatRough,
  parseRough,
  roughInKeyAction,
} from "@/lib/document/pieces/rough-in-keys";
import {
  RoughInTable,
  type RoughInRow,
  type RoughInTableProps,
} from "../rough-in-table";
import { UndoToast } from "../undo-toast";

const ROOMS = [
  { id: "hall", name: "Hall" },
  { id: "living", name: "Living Room" },
  { id: "dining", name: "Dining" },
  { id: "kitchen", name: "Kitchen" },
];

const LIVING: RoughInRow[] = [
  {
    id: "L1",
    name: "Custom cabinet",
    quantity: 2,
    unit: "each",
    roughCents: 480000,
    stage: "placeholder",
  },
  {
    id: "L2",
    name: "Countertop for custom cabinets",
    quantity: 2,
    unit: "each",
    roughCents: 140000,
    stage: "placeholder",
  },
  {
    id: "L3",
    name: "Hardware, 2 knobs for custom cabinet",
    quantity: 2,
    unit: "each",
    roughCents: null,
    stage: "placeholder",
  },
];

function setup(overrides: Partial<RoughInTableProps> = {}) {
  const props: RoughInTableProps = {
    room: ROOMS[1],
    rooms: ROOMS,
    rows: LIVING,
    onAdd: jest.fn(),
    onUpdate: jest.fn(),
    onRemove: jest.fn(),
    onMove: jest.fn(),
    onFill: jest.fn(),
    onAlsoPlace: jest.fn(),
    ...overrides,
  };
  const view = render(<RoughInTable {...props} />);
  return { props, view, user: userEvent.setup() };
}

const entryName = () =>
  screen.getByRole("textbox", { name: "New line in Living Room" });

describe("RoughInTable columns and rows", () => {
  it("prints LINE · QTY · UNIT · ROUGH $ · STAGE · at the a2 widths", () => {
    const { view } = setup();
    const heads = screen
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(heads).toEqual(["Line", "Qty", "Unit", "Rough $", "Stage", "Acts"]);
    const widths = Array.from(view.container.querySelectorAll("col")).map(
      (c) => c.style.width,
    );
    // LINE takes what is left: 480 at the full 956, less beside the pane (F2).
    expect(widths).toEqual(["", "72px", "96px", "120px", "140px", "48px"]);
  });

  it("fits beside the elevation pane at 1440 with no column cut (T-33a, F2)", () => {
    const { view } = setup();
    const table = view.container.querySelector("table") as HTMLTableElement;
    const classes = table.className.split(" ");
    expect(classes).toEqual(
      expect.arrayContaining([
        "w-full",
        "min-w-[640px]",
        "max-w-[956px]",
        "table-fixed",
      ]),
    );
    const fixed = Array.from(view.container.querySelectorAll("col"))
      .map((c) => parseInt(c.style.width || "0", 10))
      .reduce((a, b) => a + b, 0);
    expect(fixed).toBe(476);
    // 1440 − rail 201 − main padding 48 − gap 24 − pane 360 − a scrollbar 16.
    const besideThePane = 1440 - 201 - 48 - 24 - 360 - 16;
    expect(640).toBeLessThanOrEqual(besideThePane);
    // LINE keeps a usable width there.
    expect(besideThePane - fixed).toBeGreaterThanOrEqual(300);
  });

  it("prints the rough figure as ~$4,800 and an empty cell when there is none", () => {
    setup();
    expect(
      screen.getByRole("textbox", { name: "Rough $, Custom cabinet" }),
    ).toHaveValue("~$4,800");
    expect(
      screen.getByRole("textbox", {
        name: "Rough $, Hardware, 2 knobs for custom cabinet",
      }),
    ).toHaveValue("");
    expect(formatRough(480000)).toBe("~$4,800");
    expect(parseRough("~$4,800")).toBe(480000);
  });

  it("stamps each line with its stage word", () => {
    setup();
    const row = screen.getByDisplayValue("Custom cabinet").closest("tr")!;
    expect(within(row).getByText("Placeholder")).toHaveClass(
      "stamp",
      "stamp--placeholder",
    );
  });

  it("keeps the entry row last, with the caret, and prints the key hint", () => {
    setup();
    const bodyRows = screen.getAllByRole("row").slice(1);
    const last = bodyRows[bodyRows.length - 1];
    expect(last).toHaveAttribute("data-entry-row");
    expect(last.querySelector("i[data-caret]")).not.toBeNull();
    expect(screen.getByText(ROUGH_IN_KEY_HINT)).toBeInTheDocument();
    expect(ROUGH_IN_KEY_HINT).toBe(
      "ENTER ADDS THE LINE · TAB MOVES ACROSS · ⌘↓ NEXT ROOM · PASTE A LIST TO ADD SEVERAL · / SEARCHES THE LIBRARY",
    );
    expect(entryName()).toHaveAccessibleDescription(ROUGH_IN_KEY_HINT);
  });
});

describe("RoughInTable keys", () => {
  it("Enter adds the line and starts the next one in the same room", async () => {
    const { props, user } = setup();
    await user.click(entryName());
    await user.keyboard("Hardware, 4 pulls for custom cabinet");
    await user.tab();
    await user.clear(screen.getByRole("textbox", { name: "Qty, new line" }));
    await user.keyboard("4");
    await user.tab();
    await user.tab();
    await user.keyboard("52{Enter}");
    expect(props.onAdd).toHaveBeenCalledWith({
      name: "Hardware, 4 pulls for custom cabinet",
      quantity: 4,
      unit: "each",
      roughCents: 5200,
    });
    expect(entryName()).toHaveValue("");
    expect(entryName()).toHaveFocus();
  });

  it("four Enters make four lines with no sheet", async () => {
    const { props, user } = setup({ rows: [] });
    await user.click(entryName());
    await user.keyboard(
      "Custom cabinet{Enter}Countertop{Enter}Knobs{Enter}Pulls{Enter}",
    );
    expect(props.onAdd).toHaveBeenCalledTimes(4);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Enter on an empty entry adds nothing", async () => {
    const { props, user } = setup();
    await user.click(entryName());
    await user.keyboard("{Enter}");
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it("Tab moves across the entry row", async () => {
    const { user } = setup();
    await user.click(entryName());
    await user.tab();
    expect(
      screen.getByRole("textbox", { name: "Qty, new line" }),
    ).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("combobox", { name: "Unit, new line" }),
    ).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("textbox", { name: "Rough $, new line" }),
    ).toHaveFocus();
  });

  it("⌘↓ goes to the next room", async () => {
    const user = userEvent.setup();
    const noop = jest.fn();
    const shared = {
      rooms: ROOMS,
      onAdd: noop,
      onUpdate: noop,
      onRemove: noop,
      onMove: noop,
      onFill: noop,
      onAlsoPlace: noop,
    };
    render(
      <>
        <RoughInTable {...shared} room={ROOMS[1]} rows={LIVING} />
        <RoughInTable {...shared} room={ROOMS[2]} rows={[]} />
      </>,
    );
    await user.click(entryName());
    await user.keyboard("{Meta>}{ArrowDown}{/Meta}");
    expect(
      screen.getByRole("textbox", { name: "New line in Dining" }),
    ).toHaveFocus();
  });

  it("Backspace on an empty name removes the line", async () => {
    const { props, user } = setup();
    const name = screen.getByRole("textbox", { name: "Line 3" });
    await user.click(name);
    await user.clear(name);
    await user.keyboard("{Backspace}");
    expect(props.onRemove).toHaveBeenCalledWith(LIVING[2]);
    expect(screen.getByRole("textbox", { name: "Line 2" })).toHaveFocus();
  });

  it("⌘⌫ removes from any cell of the line", async () => {
    const { props, user } = setup();
    await user.click(
      screen.getByRole("textbox", { name: "Qty, Custom cabinet" }),
    );
    await user.keyboard("{Meta>}{Backspace}{/Meta}");
    expect(props.onRemove).toHaveBeenCalledWith(LIVING[0]);
    expect(entryName()).toHaveFocus();
  });

  it("a pasted list goes to the paste preview; / in an empty name searches", async () => {
    const onPaste = jest.fn();
    const onSlash = jest.fn();
    const { user } = setup({ onPaste, onSlash });
    fireEvent.paste(entryName(), {
      clipboardData: { getData: () => "Sofa, 96 in\nDining chairs" },
    });
    expect(onPaste).toHaveBeenCalledWith("Sofa, 96 in\nDining chairs");
    await user.click(entryName());
    await user.keyboard("/");
    expect(onSlash).toHaveBeenCalledWith(null);
    expect(entryName()).toHaveValue("");
  });

  it("maps keys to acts", () => {
    const k = (key: string, mods: Partial<KeyboardEvent> = {}) => ({
      key,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      ...mods,
    });
    const entry = { entry: true, nameCell: true, value: "Sofa" };
    const line = { entry: false, nameCell: true, value: "" };
    expect(roughInKeyAction(k("Enter"), entry)).toBe("add");
    expect(roughInKeyAction(k("Enter"), { ...line, value: "x" })).toBe(
      "commit",
    );
    expect(roughInKeyAction(k("ArrowDown", { metaKey: true }), entry)).toBe(
      "next-room",
    );
    expect(roughInKeyAction(k("Backspace"), line)).toBe("remove");
    expect(
      roughInKeyAction(k("Backspace"), { ...line, value: "x" }),
    ).toBeNull();
    expect(
      roughInKeyAction(k("Backspace", { metaKey: true }), {
        ...line,
        nameCell: false,
        value: "2",
      }),
    ).toBe("remove");
    expect(
      roughInKeyAction(k("Backspace"), { ...entry, value: "" }),
    ).toBeNull();
    expect(roughInKeyAction(k("Tab"), entry)).toBeNull();
  });
});

describe("RoughInTable row menu", () => {
  it("carries Fill with a product, Move to room…, Also place in…, Remove", async () => {
    const { props, user } = setup();
    const trigger = screen.getByRole("button", {
      name: "Acts for Hardware, 2 knobs for custom cabinet",
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await user.click(trigger);
    const menu = screen.getByRole("menu", {
      name: "Acts for Hardware, 2 knobs for custom cabinet",
    });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((m) => m.textContent),
    ).toEqual([
      "Fill with a product",
      "Move to room…",
      "Also place in…",
      "Remove",
    ]);
    expect(
      within(menu).getByRole("menuitem", { name: "Fill with a product" }),
    ).toHaveFocus();
    await user.click(
      within(menu).getByRole("menuitem", { name: "Fill with a product" }),
    );
    expect(props.onFill).toHaveBeenCalledWith(LIVING[2]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Move to room… lists the rooms with · HERE and moves by keyboard", async () => {
    const { props, user } = setup();
    screen.getByRole("button", { name: "Acts for Custom cabinet" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}{Enter}");
    const rooms = screen.getByRole("menu", { name: "Move to room" });
    const items = within(rooms).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Hall",
      "Living Room· Here",
      "Dining",
      "Kitchen",
    ]);
    expect(items[1]).toHaveAttribute("aria-current", "location");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    expect(props.onMove).toHaveBeenCalledWith(LIVING[0], "kitchen");
    // T-60a F4/F7: nothing is said before the server answers (the lens says
    // it), and the hand stays on the acted line, never the entry row.
    expect(screen.getByRole("status")).not.toHaveTextContent(/Moved/);
    expect(
      screen.getByRole("button", { name: "Acts for Custom cabinet" }),
    ).toHaveFocus();
  });

  it("Move to room… works by touch, and Esc steps back out", async () => {
    const { props, user } = setup();
    await user.click(
      screen.getByRole("button", {
        name: "Acts for Countertop for custom cabinets",
      }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Move to room…" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Move to room" })).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Move to room…" }),
    ).toHaveFocus();
    await user.click(screen.getByRole("menuitem", { name: "Move to room…" }));
    await user.click(screen.getByRole("menuitem", { name: "Dining" }));
    expect(props.onMove).toHaveBeenCalledWith(LIVING[1], "dining");
    await user.click(
      screen.getByRole("button", {
        name: "Acts for Countertop for custom cabinets",
      }),
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Acts for Countertop for custom cabinets",
      }),
    ).toHaveFocus();
  });

  it("a gated Remove is aria-disabled with its reason linked, never disabled", async () => {
    const reason = "Released lines change through Record a change.";
    const released: RoughInRow = {
      id: "D1",
      name: "Dining table, custom walnut",
      quantity: 1,
      unit: "each",
      roughCents: null,
      stage: "released",
      gates: { remove: reason },
    };
    const { props, user } = setup({ room: ROOMS[2], rows: [released] });
    await user.click(
      screen.getByRole("button", {
        name: "Acts for Dining table, custom walnut",
      }),
    );
    const remove = screen.getByRole("menuitem", { name: "Remove" });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    expect(remove).not.toHaveAttribute("disabled");
    expect(remove).toHaveAccessibleDescription(reason);
    await user.click(remove);
    expect(props.onRemove).not.toHaveBeenCalled();

    const name = screen.getByRole("textbox", { name: "Line 1" });
    await user.click(name);
    await user.keyboard("{Meta>}{Backspace}{/Meta}");
    expect(props.onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(reason);
  });

  it("Remove from the menu removes the line", async () => {
    const { props, user } = setup();
    await user.click(
      screen.getByRole("button", { name: "Acts for Custom cabinet" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(props.onRemove).toHaveBeenCalledWith(LIVING[0]);
  });
});

describe("UndoToast", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("reads Removed <name> ×N from <room>. with UNDO and a 10 s countdown", () => {
    const onUndo = jest.fn();
    const onExpire = jest.fn();
    render(
      <UndoToast
        name="Rattan lounge chair"
        quantity={2}
        roomName="Sunroom"
        onUndo={onUndo}
        onExpire={onExpire}
      />,
    );
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent(
      "Removed Rattan lounge chair ×2 from Sunroom.",
    );
    expect(toast).toHaveTextContent("10 S");
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(toast).toHaveTextContent("7 S");
    expect(onExpire).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(7000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("UNDO undoes", () => {
    const onUndo = jest.fn();
    render(
      <UndoToast
        name="Rattan lounge chair"
        quantity={2}
        roomName="Sunroom"
        onUndo={onUndo}
        onExpire={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("drops the room on the phone (a15)", () => {
    render(
      <UndoToast
        name="Rattan lounge chair"
        quantity={2}
        onUndo={jest.fn()}
        onExpire={jest.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /^Removed Rattan lounge chair ×2\. Undo puts it back\.Undo10 S$/,
    );
  });

  it("takes focus on UNDO and names the undo (T-60a F5)", () => {
    render(
      <UndoToast
        name="Rattan lounge chair"
        quantity={2}
        roomName="Sunroom"
        onUndo={jest.fn()}
        onExpire={jest.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Undo puts it back.");
  });
});

describe("RoughInTable — Enter-add is announced (T-33a, F5)", () => {
  it("says the line was added, in the table's polite status", async () => {
    const { user } = setup();
    await user.type(entryName(), "Floor lamp{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Added Floor lamp to Living Room.",
    );
    expect(entryName()).toHaveFocus();
  });
});

describe("RoughInTable — at 390 (a13, T-33a F1/F12)", () => {
  function phone(matches: boolean) {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query === ROUGH_IN_PHONE_QUERY ? matches : false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia;
  }
  beforeEach(() => phone(true));
  afterEach(() => phone(false));

  it("prints 56px cards, no table, name then ×2 · each · ~$4,800 · stage", () => {
    setup();
    expect(screen.queryByRole("table")).toBeNull();
    const cards = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveClass("min-h-[56px]");
    expect(
      within(cards[0]).getByRole("textbox", { name: "Line 1" }),
    ).toHaveValue("Custom cabinet");
    expect(cards[0]).toHaveTextContent("×2 · each · ~$4,800 ·Placeholder");
    expect(cards[2]).toHaveTextContent("×2 · each ·Placeholder");
    expect(within(cards[0]).getByText("Placeholder")).toHaveClass(
      "stamp--placeholder",
    );
  });

  it("ADD adds what is typed, and keeps the entry for the next line (R3-7)", async () => {
    const { props, user } = setup();
    const add = screen.getByRole("button", { name: "Add to Living Room" });
    expect(add).toHaveTextContent("Add");
    await user.type(entryName(), "Floor lamp");
    await user.click(add);
    expect(props.onAdd).toHaveBeenCalledWith({
      name: "Floor lamp",
      quantity: 1,
      unit: "each",
      roughCents: null,
    });
    expect(entryName()).toHaveValue("");
    expect(entryName()).toHaveFocus();
    // ADD on an empty entry adds nothing.
    await user.click(add);
    expect(props.onAdd).toHaveBeenCalledTimes(1);
  });

  it("DONE ADDING sits above the entry and lets go of it without adding", async () => {
    const { props, user } = setup();
    const done = screen.getByRole("button", {
      name: "Done adding, Living Room",
    });
    expect(done).toHaveTextContent("Done adding");
    expect(
      done.compareDocumentPosition(entryName()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.type(entryName(), "Sofa");
    await user.click(done);
    expect(props.onAdd).not.toHaveBeenCalled();
    expect(entryName()).not.toHaveFocus();
    expect(done).toHaveFocus();
    expect(entryName()).toHaveValue("Sofa");
  });

  it("reaches Fill, Move to room…, Also place in… and Remove from each card's ⋯", async () => {
    const { props, user } = setup();
    const card = screen.getAllByRole("listitem")[0];
    await user.click(
      within(card).getByRole("button", { name: "Acts for Custom cabinet" }),
    );
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual([
      "Fill with a product",
      "Move to room…",
      "Also place in…",
      "Remove",
    ]);
    await user.click(screen.getByRole("menuitem", { name: "Move to room…" }));
    await user.click(screen.getByRole("menuitem", { name: "Kitchen" }));
    expect(props.onMove).toHaveBeenCalledWith(LIVING[0], "kitchen");

    await user.click(
      within(card).getByRole("button", { name: "Acts for Custom cabinet" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Fill with a product" }),
    );
    expect(props.onFill).toHaveBeenCalledWith(LIVING[0]);
  });

  it("names no keyboard-only key in the phone's hint (F12)", () => {
    setup();
    expect(screen.queryByText(ROUGH_IN_KEY_HINT)).toBeNull();
    expect(screen.getByText(ROUGH_IN_TOUCH_HINT)).toBeInTheDocument();
    expect(ROUGH_IN_TOUCH_HINT).not.toMatch(/⌘|TAB|ENTER/);
    expect(entryName()).toHaveAccessibleDescription(ROUGH_IN_TOUCH_HINT);
  });
});
