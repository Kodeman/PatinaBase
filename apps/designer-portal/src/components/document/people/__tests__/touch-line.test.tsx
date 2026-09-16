/**
 * THE LAST TOUCH ON A CARD'S HISTORY (E13, direction §7 P3).
 *
 * The record outranks the rolodex's coarse date; where E13 holds nothing the
 * coarse date still prints, so the population it has no row for keeps the fact
 * it had (R-V: an absent record is a fact, never a vanished region).
 */
import { render, screen } from "@testing-library/react";
import { LastTouchLine } from "../touch-line";

const touch: { current: unknown } = { current: null };
const asked: { current: unknown[] } = { current: [] };

jest.mock("@patina/supabase", () => ({
  useLastTouch: (ids: readonly string[], subjectType: string | null) => {
    asked.current = [ids, subjectType];
    return { data: touch.current };
  },
  touchSentence: () =>
    "Last touch 12 Sep 2026, by text. A money decision. Received, not authority.",
}));

beforeEach(() => {
  touch.current = null;
  asked.current = [];
});

describe("LastTouchLine", () => {
  it("prints the record's own sentence when a touch exists", () => {
    touch.current = { id: "t1" };
    render(<LastTouchLine subjectIds={["card-1"]} subjectType="person" />);
    expect(
      screen.getByText(
        "Last touch 12 Sep 2026, by text. A money decision. Received, not authority.",
      ),
    ).toBeInTheDocument();
    expect(asked.current).toEqual([["card-1"], "person"]);
  });

  it("falls back to the coarse rolodex date where E13 holds nothing", () => {
    const { container } = render(
      <LastTouchLine subjectIds={["card-1"]} fallback="Last touch 3 Sep 2026." />,
    );
    expect(screen.getByText("Last touch 3 Sep 2026.")).toBeInTheDocument();
    expect(container.querySelector("[data-last-touch]")).toBeNull();
  });

  it("prints nothing at all where there is neither", () => {
    const { container } = render(<LastTouchLine subjectIds={["card-1"]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
