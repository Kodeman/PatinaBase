import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { BuildRoomShell, type BuildRoomShellProps } from "../build-room-shell";
import {
  emptyRoomCounts,
  type BuildRoomCounts,
  type RoomCounts,
} from "@/lib/document/pieces/room-counts";
import {
  buildRoomReturnHref,
  parseBuildRoomSearch,
} from "@/lib/document/pieces/build-room-url";

/** SPEC §4 fixture: Whole Home Renovation, seven rooms. */
const ROOMS = [
  { id: "hall", name: "Hall" },
  { id: "living", name: "Living Room" },
  { id: "dining", name: "Dining" },
  { id: "kitchen", name: "Kitchen" },
  { id: "bath", name: "Primary Bath" },
  { id: "sunroom", name: "Sunroom" },
  { id: "bedroom", name: "Bedroom" },
];

function c(lines: number, placeholders: number, ready = 0): RoomCounts {
  return { ...emptyRoomCounts(), lines, placeholders, ready };
}

const COUNTS: BuildRoomCounts = {
  rooms: {
    hall: c(4, 2),
    living: c(6, 4),
    dining: c(3, 1),
    kitchen: c(5, 3),
    bath: c(8, 7),
    sunroom: c(1, 0),
    bedroom: c(4, 2),
  },
  throughout: emptyRoomCounts(),
  unassigned: emptyRoomCounts(),
  job: c(25, 18, 7),
};

function renderShell(overrides: Partial<BuildRoomShellProps> = {}) {
  const props: BuildRoomShellProps = {
    docId: "doc-1",
    jobName: "Whole Home Renovation",
    rooms: ROOMS,
    counts: COUNTS,
    removedCount: 1,
    lens: "rough",
    room: "living",
    canSeeMoney: true,
    onNavigate: jest.fn(),
    onReturn: jest.fn(),
    onAddRoom: jest.fn(),
    ...overrides,
  };
  const view = render(
    <BuildRoomShell {...props}>
      <p>Lens body</p>
    </BuildRoomShell>,
  );
  return { ...view, props };
}

const lensButtons = () =>
  within(screen.getByRole("group", { name: "Lens" })).getAllByRole("button");

describe("BuildRoomShell — the head (SPEC §6 shell)", () => {
  it("prints ← job, BUILD THE PIECES, the four lens words as pressed buttons, and the room counts", () => {
    renderShell();
    const back = screen.getByRole("link", {
      name: "Back to Whole Home Renovation",
    });
    // At 1440 the full name shows, set in caps: `← WHOLE HOME RENOVATION`.
    expect(within(back).getByText("←", { exact: false })).toBeInTheDocument();
    expect(within(back).getByText("Whole Home Renovation").className).toContain(
      "md:inline",
    );
    expect(back.className).toContain("uppercase");
    const title = screen.getByRole("heading", {
      level: 1,
      name: "Build the pieces",
    });
    expect(title.className).toContain("uppercase");

    expect(lensButtons().map((b) => b.textContent)).toEqual([
      "Rough in",
      "Spec",
      "Price",
      "Release",
    ]);
    expect(lensButtons().map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
    expect(lensButtons()[0].className).toContain("uppercase");
    expect(screen.getByTestId("build-room-place")).toHaveTextContent(
      "Living Room · 6 lines · 4 placeholders",
    );
    expect(screen.getByText("Lens body")).toBeInTheDocument();
    expect(screen.getByTestId("build-room")).toHaveAttribute(
      "data-drafting-stock",
    );
  });

  it.each([
    [
      "rough",
      "Rough in · Name it, count it, place it. Specs, prices and buying come later.",
    ],
    ["spec", "Spec · Fill each line's details and its product. No money here."],
    [
      "price",
      "Price · Line up trade cost, markup and client price. Rough figures stay as ~ until you set them.",
    ],
    [
      "release",
      "Release · Check what the client will see, then release rooms for authorization. Nothing here edits a spec or a price.",
    ],
  ] as const)("reads the %s lens in one sentence", (lens, sentence) => {
    renderShell({ lens });
    expect(screen.getByText(sentence)).toBeInTheDocument();
  });

  it("pushes a lens change with the room kept", () => {
    const { props } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Spec" }));
    expect(props.onNavigate).toHaveBeenCalledWith({
      lens: "spec",
      room: "living",
    });
  });

  it("counts what is ready on the whole job in the Release lens (a3)", () => {
    renderShell({ lens: "release", room: null });
    expect(screen.getByTestId("build-room-place")).toHaveTextContent(
      "Whole job · 25 lines · 7 ready",
    );
  });

  it("singles one line and one placeholder", () => {
    renderShell({
      room: "sunroom",
      counts: { ...COUNTS, rooms: { ...COUNTS.rooms, sunroom: c(1, 1) } },
    });
    expect(screen.getByTestId("build-room-place")).toHaveTextContent(
      "Sunroom · 1 line · 1 placeholder",
    );
  });
});

describe("BuildRoomShell — Price for a seat without money (R1, Q7)", () => {
  it("leaves the Price lens out entirely, not gated", () => {
    renderShell({ canSeeMoney: false });
    expect(lensButtons().map((b) => b.textContent)).toEqual([
      "Rough in",
      "Spec",
      "Release",
    ]);
    expect(
      screen.queryByRole("button", { name: "Price" }),
    ).not.toBeInTheDocument();
  });

  it("reads ?lens=price as Rough in when the seat has no money", () => {
    const params = new URLSearchParams("lens=price&room=living");
    expect(parseBuildRoomSearch(params, { canSeeMoney: false })).toEqual({
      lens: "rough",
      room: "living",
    });
    expect(parseBuildRoomSearch(params, { canSeeMoney: true })).toEqual({
      lens: "price",
      room: "living",
    });
    renderShell({ canSeeMoney: false, lens: "price" });
    expect(screen.getByRole("button", { name: "Rough in" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("BuildRoomShell — the room rail", () => {
  it("lists the rooms with their counts, then Not in a room yet, Removed and + ROOM", () => {
    renderShell();
    const rail = screen.getByRole("navigation", { name: "Rooms" });
    const rows = within(rail)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(rows).toEqual([
      "Rooms",
      "Hall4",
      "Living Room6",
      "Dining3",
      "Kitchen5",
      "Primary Bath8",
      "Sunroom1",
      "Bedroom4",
      "Not in a room yet0",
      "Removed1",
    ]);
    expect(
      within(rail).getByRole("link", { name: /Living Room/ }),
    ).toHaveAttribute("aria-current", "location");
    expect(
      within(rail).getByRole("button", { name: "+ Room" }),
    ).toBeInTheDocument();
  });

  it("moves to a room in the same lens", () => {
    const { props } = renderShell({ lens: "spec" });
    const rail = screen.getByRole("navigation", { name: "Rooms" });
    const hall = within(rail).getByRole("link", { name: /Hall/ });
    expect(hall).toHaveAttribute(
      "href",
      "/doc/doc-1/pieces?lens=spec&room=hall",
    );
    fireEvent.click(hall);
    expect(props.onNavigate).toHaveBeenCalledWith({
      lens: "spec",
      room: "hall",
    });
  });

  it("prints Throughout only when a line sits there", () => {
    renderShell({ counts: { ...COUNTS, throughout: c(2, 2) } });
    const rail = screen.getByRole("navigation", { name: "Rooms" });
    expect(
      within(rail).getByRole("link", { name: /Throughout/ }),
    ).toHaveTextContent("Throughout2");
  });

  it("adds a room by name from + ROOM", async () => {
    const onAddRoom = jest.fn().mockResolvedValue(undefined);
    renderShell({ onAddRoom });
    fireEvent.click(screen.getByRole("button", { name: "+ Room" }));
    fireEvent.change(screen.getByLabelText("Room name"), {
      target: { value: "Mudroom" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add the room" }));
    });
    expect(onAddRoom).toHaveBeenCalledWith("Mudroom");
    expect(screen.queryByLabelText("Room name")).not.toBeInTheDocument();
  });

  it("says so in place when the room is not added", async () => {
    const onAddRoom = jest.fn().mockRejectedValue(new Error("nope"));
    renderShell({ onAddRoom });
    fireEvent.click(screen.getByRole("button", { name: "+ Room" }));
    fireEvent.change(screen.getByLabelText("Room name"), {
      target: { value: "Mudroom" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add the room" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The room was not added. Try again.",
    );
  });
});

describe("BuildRoomShell — the return path (S7, a10, R1-F10)", () => {
  it("← lands on the overview at the room", () => {
    const { props } = renderShell();
    const back = screen.getByRole("link", {
      name: "Back to Whole Home Renovation",
    });
    expect(back).toHaveAttribute("href", "/doc/doc-1#pieces-room-living");
    fireEvent.click(back);
    expect(props.onReturn).toHaveBeenCalledTimes(1);
  });

  it("returns to the Pieces region when no room is chosen", () => {
    expect(buildRoomReturnHref("doc-1", null)).toBe("/doc/doc-1#project-ffe");
    expect(buildRoomReturnHref("doc-1", "removed")).toBe(
      "/doc/doc-1#project-ffe",
    );
  });

  it("Esc leaves, unless a field with text, a menu or a child holds it", () => {
    const { props } = renderShell();
    const input = document.createElement("input");
    document.body.appendChild(input);

    input.value = "Sofa";
    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onReturn).not.toHaveBeenCalled();

    const menu = document.createElement("ul");
    menu.setAttribute("role", "menu");
    document.body.appendChild(menu);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(props.onReturn).not.toHaveBeenCalled();
    menu.remove();

    input.addEventListener("keydown", (event) => event.preventDefault(), {
      once: true,
    });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onReturn).not.toHaveBeenCalled();

    input.value = "";
    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onReturn).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(props.onReturn).toHaveBeenCalledTimes(2);
    input.remove();
  });

  it("the browser back onto the overview lands at the room", () => {
    window.history.replaceState(null, "", "/doc/doc-1");
    window.history.pushState(
      null,
      "",
      "/doc/doc-1/pieces?lens=rough&room=living",
    );
    renderShell();
    // The back step: the URL already names the overview when popstate fires.
    window.history.replaceState(null, "", "/doc/doc-1");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    expect(`${window.location.pathname}${window.location.hash}`).toBe(
      "/doc/doc-1#pieces-room-living",
    );
  });

  it("a back step between lenses stays in the room", () => {
    window.history.replaceState(
      null,
      "",
      "/doc/doc-1/pieces?lens=spec&room=living",
    );
    renderShell({ lens: "spec" });
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    expect(window.location.pathname).toBe("/doc/doc-1/pieces");
    expect(window.location.hash).toBe("");
  });
});

describe("BuildRoomShell — at 390 (a13)", () => {
  it("shortens the job to WHOLE HOME and picks the room from Living Room ▾", () => {
    const { props } = renderShell();
    const back = screen.getByRole("link", {
      name: "Back to Whole Home Renovation",
    });
    const short = within(back).getByText("Whole Home");
    expect(short.className).toContain("md:hidden");

    const picker = screen.getByRole("button", { name: "Living Room ▾" });
    expect(picker.parentElement?.className).toContain("md:hidden");
    expect(picker).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(picker);
    expect(picker).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("navigation", { name: "Choose a room" });
    expect(within(list).getAllByRole("link")[0]).toHaveTextContent(
      "Whole job25",
    );
    fireEvent.click(within(list).getByRole("link", { name: /Kitchen/ }));
    expect(props.onNavigate).toHaveBeenCalledWith({
      lens: "rough",
      room: "kitchen",
    });
    expect(
      screen.queryByRole("navigation", { name: "Choose a room" }),
    ).not.toBeInTheDocument();
  });

  it("closes the room list on Esc without leaving the room", () => {
    const { props } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Living Room ▾" }));
    const list = screen.getByRole("navigation", { name: "Choose a room" });
    fireEvent.keyDown(within(list).getAllByRole("link")[0], { key: "Escape" });
    expect(
      screen.queryByRole("navigation", { name: "Choose a room" }),
    ).not.toBeInTheDocument();
    expect(props.onReturn).not.toHaveBeenCalled();
  });

  it("adds a room from the phone's room list, where the rail is not (T-33a, F12)", async () => {
    const onAddRoom = jest.fn().mockResolvedValue(undefined);
    renderShell({ onAddRoom });
    // The rail is md and up only; its + ROOM is not on a phone.
    expect(screen.getByRole("navigation", { name: "Rooms" })).toHaveClass(
      "hidden",
      "md:flex",
    );
    fireEvent.click(screen.getByRole("button", { name: "Living Room ▾" }));
    const list = screen.getByRole("navigation", { name: "Choose a room" });
    expect(list.className).toContain("md:hidden");
    fireEvent.click(within(list).getByRole("button", { name: "+ Room" }));
    const name = within(list).getByLabelText("Room name");
    // Esc closes the form, not the room list.
    fireEvent.keyDown(name, { key: "Escape" });
    expect(within(list).queryByLabelText("Room name")).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Choose a room" }),
    ).toBeInTheDocument();

    fireEvent.click(within(list).getByRole("button", { name: "+ Room" }));
    fireEvent.change(within(list).getByLabelText("Room name"), {
      target: { value: "Mudroom" },
    });
    await act(async () => {
      fireEvent.click(
        within(list).getByRole("button", { name: "Add the room" }),
      );
    });
    expect(onAddRoom).toHaveBeenCalledWith("Mudroom");
  });

  it("lays the lens words out as a full-width segmented row with 44px targets", () => {
    renderShell();
    const group = screen.getByRole("group", { name: "Lens" });
    expect(group.className).toContain("grid");
    expect(group.style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    for (const button of lensButtons())
      expect(button.className).toContain("min-h-11");
  });
});
