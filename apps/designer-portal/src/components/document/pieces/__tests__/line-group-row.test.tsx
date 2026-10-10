/**
 * US-21 T-52 — group headings in Rough in (S3, D6, Q9; SPEC §2.6, §4.2).
 * The shower is G1 over B1–B6; B7 (the vanity) sits outside it.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { roughInKeyAction } from "@/lib/document/pieces/rough-in-keys";
import {
  LineGroupRow,
  layoutLineGroups,
  type LineGroupHeading,
} from "../line-group-row";
import {
  RoughInTable,
  type RoughInRow,
  type RoughInTableProps,
} from "../rough-in-table";

const ROOMS = [
  { id: "living", name: "Living Room" },
  { id: "bath", name: "Primary Bath" },
];

const SHOWER: LineGroupHeading = { id: "G1", name: "Shower" };

const line = (
  id: string,
  name: string,
  extra: Partial<RoughInRow> = {},
): RoughInRow => ({
  id,
  name,
  quantity: 1,
  unit: "each",
  roughCents: null,
  stage: "placeholder",
  ...extra,
});

/** SPEC §4.2: B1–B6 in the shower, B7 outside it. */
const BATH: RoughInRow[] = [
  line("B1", "Valve and trim", { roughCents: 65000, groupId: "G1" }),
  line("B2", "Shower head", { roughCents: 32000, groupId: "G1" }),
  line("B3", "Hand shower", { roughCents: 28000, groupId: "G1" }),
  line("B4", "Linear drain", { roughCents: 24000, groupId: "G1" }),
  line("B5", "Niche tile", { roughCents: 16000, unit: "lot", groupId: "G1" }),
  line("B6", "Glass panel", { roughCents: 180000, groupId: "G1" }),
  line("B7", "Vanity, 60 in, double", { roughCents: 320000 }),
];

function setup(overrides: Partial<RoughInTableProps> = {}) {
  const props: RoughInTableProps = {
    room: ROOMS[1],
    rooms: ROOMS,
    rows: BATH,
    groups: [SHOWER],
    onGroup: jest.fn(),
    onAdd: jest.fn(),
    onUpdate: jest.fn(),
    onRemove: jest.fn(),
    onMove: jest.fn(),
    onFill: jest.fn(),
    onAlsoPlace: jest.fn(),
    ...overrides,
  };
  render(<RoughInTable {...props} />);
  return { props, user: userEvent.setup() };
}

/** The name input of the line called `name`. */
function nameInput(name: string): HTMLInputElement {
  return screen.getByDisplayValue(name) as HTMLInputElement;
}

function caretAtStart(input: HTMLInputElement) {
  input.focus();
  input.setSelectionRange(0, 0);
}

function caretAtEnd(input: HTMLInputElement) {
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

describe("layoutLineGroups", () => {
  const read = {
    groupId: (row: RoughInRow) => row.groupId,
    labor: (row: RoughInRow) => row.labor === true,
  };

  it("prints the shower as a heading with its six lines under it, then the vanity", () => {
    const entries = layoutLineGroups(BATH, [SHOWER], read);
    expect(
      entries.map((e) =>
        e.kind === "heading"
          ? `# ${e.group.name}`
          : `${e.member ? "↳ " : ""}${e.item.name}`,
      ),
    ).toEqual([
      "# Shower",
      "↳ Valve and trim",
      "↳ Shower head",
      "↳ Hand shower",
      "↳ Linear drain",
      "↳ Niche tile",
      "↳ Glass panel",
      "Vanity, 60 in, double",
    ]);
  });

  it("gathers every member under the heading where the first one falls", () => {
    const rows = [
      line("B1", "Valve and trim", { groupId: "G1" }),
      line("B7", "Vanity, 60 in, double"),
      line("B2", "Shower head", { groupId: "G1" }),
    ];
    const ids = layoutLineGroups(rows, [SHOWER], read).map((e) =>
      e.kind === "heading" ? e.group.id : e.item.id,
    );
    expect(ids).toEqual(["G1", "B1", "B2", "B7"]);
  });

  it("keeps a labor line with its piece inside the group", () => {
    const rows = [
      line("B1", "Valve and trim", { groupId: "G1" }),
      line("B1a", "Install, plumber", { labor: true }),
      line("B7", "Vanity, 60 in, double"),
    ];
    const entries = layoutLineGroups(rows, [SHOWER], read);
    expect(entries[2]).toEqual({
      kind: "line",
      item: rows[1],
      member: true,
    });
  });

  it("prints a line grouped in another room as a plain line", () => {
    const entries = layoutLineGroups(BATH.slice(0, 2), [], read);
    expect(entries.every((e) => e.kind === "line" && !e.member)).toBe(true);
  });
});

describe("the heading row (SPEC §2.6)", () => {
  it("is Inter 14 w500 with a strong rule under it, and carries only its name", () => {
    render(
      <table>
        <tbody>
          <LineGroupRow group={SHOWER} variant="table" columns={6} />
        </tbody>
      </table>,
    );
    const heading = screen.getByRole("rowheader", { name: "Shower" });
    expect(heading).toHaveAttribute("colspan", "6");
    expect(heading.className).toEqual(
      expect.stringContaining("font-sans text-[14px] font-medium"),
    );
    const row = heading.closest("tr")!;
    expect(row.className).toContain("border-[var(--sheet-rule-strong)]");
    expect(row.textContent).toBe("Shower");
  });
});

describe("the shower in Rough in (S3)", () => {
  it("prints a heading with six placeholder lines, each starting ↳", () => {
    setup();
    const heading = screen.getByRole("rowheader", { name: "Shower" });
    const headingRow = heading.closest("tr")!;
    // No qty, no unit, no money, no stamp, no acts.
    expect(within(headingRow).queryByRole("textbox")).toBeNull();
    expect(within(headingRow).queryByRole("combobox")).toBeNull();
    expect(within(headingRow).queryByRole("button")).toBeNull();
    expect(headingRow.querySelector(".stamp")).toBeNull();
    expect(headingRow.textContent).not.toMatch(/\$|~|placeholder/i);

    const members = Array.from(
      document.querySelectorAll("tbody tr[data-line-id]"),
    ).filter((tr) => tr.querySelector("[data-group-member]"));
    expect(members.map((tr) => tr.getAttribute("data-line-id"))).toEqual([
      "B1",
      "B2",
      "B3",
      "B4",
      "B5",
      "B6",
    ]);
    for (const tr of members) {
      const cell = tr.querySelector("[data-group-member]")!;
      expect(cell.className).toContain("pl-6");
      expect(cell.textContent).toContain("↳");
      expect(tr.querySelector(".stamp--placeholder")?.textContent).toMatch(
        /^placeholder$/i,
      );
    }
    const vanity = document.querySelector('tr[data-line-id="B7"]')!;
    expect(vanity.querySelector("[data-group-member]")).toBeNull();
    expect(vanity.textContent).not.toContain("↳");
  });

  it("prints the heading and ↳ members on the phone cards too", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      setup();
      const cards = screen.getAllByRole("listitem");
      expect(cards[0]).toHaveTextContent(/^Shower$/);
      expect(cards[0].className).toContain("border-[var(--sheet-rule-strong)]");
      expect(
        cards[1].querySelector("[data-group-member]")?.textContent,
      ).toContain("↳");
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("Tab at the start of a name (D6)", () => {
  it("puts the line in the group directly above it", async () => {
    const rows = [...BATH.slice(0, 6), line("B8", "Grab bar")];
    const { props, user } = setup({ rows });
    caretAtStart(nameInput("Grab bar"));
    await user.keyboard("{Tab}");
    expect(props.onGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: "B8" }),
      { groupId: "G1" },
    );
    expect(nameInput("Grab bar")).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Grab bar is in Shower.",
    );
  });

  it("opens a heading to name when no group is above, and Enter makes the group", async () => {
    const rows = [line("B1", "Valve and trim"), line("B2", "Shower head")];
    const { props, user } = setup({ rows, groups: [] });
    caretAtStart(nameInput("Valve and trim"));
    await user.keyboard("{Tab}");
    const draft = screen.getByRole("textbox", {
      name: "Name the group for Valve and trim",
    });
    expect(draft).toHaveFocus();
    // The heading sits directly above the line.
    expect(draft.closest("tr")!.nextElementSibling).toHaveAttribute(
      "data-line-id",
      "B1",
    );
    await user.keyboard("Shower{Enter}");
    expect(props.onGroup).toHaveBeenCalledTimes(1);
    expect(props.onGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: "B1" }),
      { name: "Shower" },
    );
    expect(
      screen.queryByRole("textbox", { name: /Name the group/ }),
    ).toBeNull();
    expect(nameInput("Valve and trim")).toHaveFocus();
  });

  it("Esc on the heading names nothing and goes back to the line", async () => {
    const rows = [line("B1", "Valve and trim")];
    const { props, user } = setup({ rows, groups: [] });
    caretAtStart(nameInput("Valve and trim"));
    await user.keyboard("{Tab}");
    await user.keyboard("Show{Escape}");
    expect(props.onGroup).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: /Name the group/ }),
    ).toBeNull();
    expect(nameInput("Valve and trim")).toHaveFocus();
  });

  it("Shift-Tab at the start of a member's name takes it out", async () => {
    const { props, user } = setup();
    caretAtStart(nameInput("Hand shower"));
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(props.onGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: "B3" }),
      null,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Hand shower is out of Shower.",
    );
  });

  it("Tab anywhere but the start of the name still moves across", async () => {
    const { props, user } = setup();
    caretAtEnd(nameInput("Vanity, 60 in, double"));
    await user.keyboard("{Tab}");
    expect(props.onGroup).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: "Qty, Vanity, 60 in, double" }),
    ).toHaveFocus();
  });

  it("Tab on a line already in a group, or Shift-Tab on one outside, is not claimed", async () => {
    const { props, user } = setup();
    caretAtStart(nameInput("Shower head"));
    await user.keyboard("{Tab}");
    caretAtStart(nameInput("Vanity, 60 in, double"));
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(props.onGroup).not.toHaveBeenCalled();
  });

  it("a labor line follows its piece and is never grouped on its own", async () => {
    const rows = [
      ...BATH.slice(0, 1),
      line("B1a", "Install, plumber", { labor: true }),
    ];
    const { props, user } = setup({ rows });
    caretAtStart(nameInput("Install, plumber"));
    await user.keyboard("{Tab}");
    expect(props.onGroup).not.toHaveBeenCalled();
  });

  it("a gated line says why and is not grouped", async () => {
    const reason =
      "A group sits inside one room. Group this line in its first room.";
    const rows = [
      ...BATH.slice(0, 6),
      line("F1", "White oak floor", { gates: { group: reason } }),
    ];
    const { props, user } = setup({ rows });
    caretAtStart(nameInput("White oak floor"));
    await user.keyboard("{Tab}");
    expect(props.onGroup).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(reason);
    expect(nameInput("White oak floor")).toHaveFocus();
  });

  it("without onGroup, Tab only moves across", async () => {
    const { user } = setup({ onGroup: undefined });
    caretAtStart(nameInput("Vanity, 60 in, double"));
    await user.keyboard("{Tab}");
    expect(
      screen.getByRole("textbox", { name: "Qty, Vanity, 60 in, double" }),
    ).toHaveFocus();
  });
});

describe("roughInKeyAction: indent and outdent", () => {
  const key = (k: Partial<KeyboardEvent>) => ({
    key: "Tab",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...k,
  });
  const ctx = { entry: false, nameCell: true, value: "Valve and trim" };

  it("reads Tab and Shift-Tab at the start of a line's name", () => {
    expect(roughInKeyAction(key({}), { ...ctx, caretAtStart: true })).toBe(
      "indent",
    );
    expect(
      roughInKeyAction(key({ shiftKey: true }), {
        ...ctx,
        caretAtStart: true,
      }),
    ).toBe("outdent");
  });

  it("leaves Tab alone elsewhere: mid-name, other cells, the entry row", () => {
    expect(roughInKeyAction(key({}), { ...ctx, caretAtStart: false })).toBe(
      null,
    );
    expect(
      roughInKeyAction(key({}), {
        ...ctx,
        nameCell: false,
        caretAtStart: true,
      }),
    ).toBe(null);
    expect(
      roughInKeyAction(key({}), { ...ctx, entry: true, caretAtStart: true }),
    ).toBe(null);
  });
});
