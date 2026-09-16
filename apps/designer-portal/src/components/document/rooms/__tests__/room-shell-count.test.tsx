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
    // The row wraps rather than widening, so a 390 screen never scrolls sideways.
    expect(count.parentElement?.className).toContain("flex-wrap");
  });
});
