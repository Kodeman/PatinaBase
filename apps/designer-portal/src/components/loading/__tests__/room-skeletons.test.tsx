/**
 * US-34 F13a–c — the route fallbacks for the rooms that rendered blank.
 *
 * Every fallback is a busy region (H4): `aria-busy="true"` with an `sr-only`
 * sentence naming what is loading. Its placeholders are filled bars hidden
 * from assistive technology (H2), they wait the PQ8 150 ms before they show,
 * and none of them prints a count (D1 §2). The room's fixed title is real.
 */

import { render } from "@testing-library/react";
import BuildRoomLoading from "@/app/(document)/doc/[id]/pieces/loading";
import PeopleLoading from "@/app/(document)/people/loading";
import RoomLoading from "@/app/(document)/room/[id]/loading";
import RoomsLoading from "@/app/(document)/rooms/loading";
import {
  NAV_RULE_DELAY_MS,
  PENDING_WORD_DELAY_MS,
  PENDING_WORD_HOLD_MS,
  PLACEHOLDER_DELAY_MS,
  SLOW_MS,
  STALL_MS,
  STILL_WORKING_WRITE_MS,
} from "@/lib/loading/thresholds";

const FALLBACKS = [
  {
    route: "/doc/[id]/pieces",
    Loading: BuildRoomLoading,
    label: "Loading the pieces.",
    frame: "FF&E schedule",
  },
  {
    route: "/rooms",
    Loading: RoomsLoading,
    label: "Loading the measured rooms.",
    frame: "Measured rooms",
  },
  {
    route: "/room/[id]",
    Loading: RoomLoading,
    label: "Loading the room.",
    frame: "A room",
  },
  {
    route: "/people",
    Loading: PeopleLoading,
    label: "Loading the directory.",
    frame: "Studio contacts",
  },
] as const;

describe.each(FALLBACKS)("$route loading.tsx", ({ Loading, label, frame }) => {
  it("renders a busy region named for what is loading", () => {
    const { container } = render(<Loading />);
    const region = container.firstElementChild as HTMLElement;
    expect(region).toHaveAttribute("aria-busy", "true");
    const sentence = region.querySelector(".sr-only");
    expect(sentence).toHaveTextContent(label);
  });

  it("holds its bars for the 150 ms placeholder delay", () => {
    const { container } = render(<Loading />);
    const region = container.firstElementChild as HTMLElement;
    expect(region.style.getPropertyValue("--ph-delay")).toBe("150ms");
  });

  it("draws filled bars hidden from assistive technology, never a count", () => {
    const { container, getByText } = render(<Loading />);
    const bars = container.querySelectorAll("[data-placeholder]");
    expect(bars.length).toBeGreaterThan(3);
    bars.forEach((bar) => {
      expect(bar).toHaveAttribute("aria-hidden", "true");
      expect(bar).toHaveClass("ph");
      expect(bar).toBeEmptyDOMElement();
    });
    // The frame is real at once; the placeholders carry no numbers.
    expect(getByText(frame)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("offers nothing to press before hydration (H3)", () => {
    const { container } = render(<Loading />);
    expect(
      container.querySelectorAll('button, input, a, [role="tab"]'),
    ).toHaveLength(0);
  });
});

describe("PQ8 thresholds", () => {
  it("are the ruled numbers", () => {
    expect([
      PLACEHOLDER_DELAY_MS,
      NAV_RULE_DELAY_MS,
      PENDING_WORD_DELAY_MS,
      PENDING_WORD_HOLD_MS,
      SLOW_MS,
      STILL_WORKING_WRITE_MS,
      STALL_MS,
    ]).toEqual([150, 300, 400, 500, 4000, 8000, 10000]);
  });
});
