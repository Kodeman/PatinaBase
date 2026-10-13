/**
 * CR7-1 — THE ROOM'S HEAD COUNT AT 390.
 *
 * The count beside a Room's name is `hidden … sm:inline`, so below Tailwind's
 * default 640px it computes to `display:none`. That is right for a Room whose
 * count is decor and wrong for the People Room, whose head fact SPEC §5.1 #1
 * fixes as the heading AND, beside it, "N people · N firms" — the number the
 * `people_directory` v4 rebuild exists to make honest. `countAtEveryWidth` is
 * the opt-in; the other eight Rooms keep the breakpoint they have.
 */

import { render, screen } from "@testing-library/react";
import { RoomShell } from "../room-shell";

describe("the Room header measure", () => {
  it.each([
    ["short title", <RoomShell title="Library"><p className="mx-auto max-w-[976px] px-4 sm:px-6" data-room-body>body</p></RoomShell>],
    ["heading=null", <RoomShell title="Product" heading={null}><h1 className="mx-auto max-w-[976px] px-4 sm:px-6" data-room-body>Product details</h1></RoomShell>],
  ])("keeps header and body on the same measure for %s", (_label, tree) => {
    const { container } = render(tree);
    const headerMeasure = container.querySelector("[data-room-header-line]")?.parentElement;
    const bodyMeasure = container.querySelector("[data-room-body]");
    expect(headerMeasure).toHaveClass("w-full", "max-w-[976px]", "px-4", "sm:px-6");
    expect(bodyMeasure).toHaveClass("max-w-[976px]", "px-4", "sm:px-6");
  });
});

describe("the Room head count", () => {
  it("stays behind the sm breakpoint by default", () => {
    render(
      <RoomShell title="The Library" count="336 pieces">
        <p>body</p>
      </RoomShell>,
    );
    const count = screen.getByText(/336 pieces/);
    expect(count.className).toContain("hidden");
    expect(count.className).toContain("sm:inline");
  });

  it("prints at every width when the Room asks for it", () => {
    render(
      <RoomShell
        title="The People Room"
        count="41 people · 21 firms"
        countAtEveryWidth
      >
        <p>body</p>
      </RoomShell>,
    );
    const count = screen.getByText(/41 people · 21 firms/);
    expect(count.className).not.toContain("hidden");
    expect(count.className).toContain("inline");
  });

  it("keeps the heading and the count in one head row", () => {
    render(
      <RoomShell
        title="The People Room"
        count="41 people · 21 firms"
        countAtEveryWidth
      >
        <p>body</p>
      </RoomShell>,
    );
    const heading = screen.getByRole("heading", { name: "The People Room" });
    const count = screen.getByText(/41 people · 21 firms/);
    expect(heading.parentElement).toBe(count.parentElement);
    // The row wraps rather than widening, so a 390 screen never scrolls
    // sideways: the S1 Header line's left run (`.hline-l`) is flex-wrap.
    expect(count.parentElement).toHaveClass("hline-l");
  });
});

describe("the Room head is the house Header line (US-28 walk-fix)", () => {
  it("retires the old band: one .hline, the .t-d2 title, then the double rule", () => {
    const { container } = render(
      <RoomShell title="Compose a piece" backTo="/library" backLabel="Resource library">
        <p>body</p>
      </RoomShell>,
    );
    const line = container.querySelector("header.hline") as HTMLElement;
    expect(line).not.toBeNull();
    expect(container.querySelectorAll("header")).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Compose a piece" }),
    ).toHaveClass("t-d2");
    expect(line.parentElement?.querySelector(".rule-strong")).not.toBeNull();
    // No sticky white band and no ornament mark beside the title.
    expect(line.className).not.toMatch(/sticky|border-b/);
    expect(line.querySelector("svg")).toBeNull();
    // A nested Room keeps its way back, as a word.
    expect(screen.getByRole("button", { name: "Resource library" })).toBeInTheDocument();
  });

  it("a top-level Room has no back act; its acts can show at every width", () => {
    const { container } = render(
      <RoomShell
        title="Measured rooms"
        topLevel
        actionAtEveryWidth
        action={<button type="button">Scan a room</button>}
      >
        <p>body</p>
      </RoomShell>,
    );
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Scan a room",
    ]);
    expect(container.querySelector(".hline-r")).not.toHaveClass("room-acts-wide");
  });

  it("by default the acts wait for 1180 px, where no mobile act carries them", () => {
    const { container } = render(
      <RoomShell title="Resource library" topLevel action={<button type="button">Capture</button>}>
        <p>body</p>
      </RoomShell>,
    );
    expect(container.querySelector(".hline-r")).toHaveClass("room-acts-wide");
  });

  it("heading={null} prints no title; the page body carries its h1", () => {
    render(
      <RoomShell
        title="Arden lounge chair"
        heading={null}
        backTo="/library"
        backLabel="Resource library"
      >
        <h1>Arden lounge chair</h1>
      </RoomShell>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
