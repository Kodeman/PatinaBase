import { render, screen } from "@testing-library/react";
import { deriveFulfillmentLifecycle } from "@patina/types";
import { ProcurementTrail } from "../procurement-trail";

// The M7 stamp trail, ported locally for the admin portal (WP4 Track 3). This
// suite proves the rendering grammar over a REAL Rail A reading
// (deriveFulfillmentLifecycle, exhaustively unit-tested at the contract level
// in @patina/types) rather than a hand-built fixture — settled steps stamp,
// the live step stamps in clay, future steps stay dashed and empty, and a
// step the book has no fact for reads "no record".

describe("ProcurementTrail", () => {
  it("stamps settled steps, marks the live step, and dashes the future", () => {
    const reading = deriveFulfillmentLifecycle({
      line_state: "in_production",
      line_state_entered_at: "2026-08-01",
    });
    render(<ProcurementTrail reading={reading} />);

    // 02 Released to maker / 03 Acknowledged settle (chain-implied, undated).
    const released = screen.getByText(/Released to maker/);
    expect(released.closest("li")).toHaveAttribute(
      "data-trail-state",
      "settled",
    );

    // 06 In production is the live step, dated from line_state_entered_at.
    const live = screen.getByText(/In production · Aug 1/);
    expect(live.closest("li")).toHaveAttribute("data-trail-state", "live");

    // 08 In transit hasn't happened yet — dashed, unstamped future.
    const future = screen.getByText("In transit");
    expect(future.closest("li")).toHaveAttribute("data-trail-state", "future");
  });

  it('reads steps the rail carries no fact for as "no record", never as future', () => {
    // Rail A has no fact for step 01 (Cleared to produce) — once the trail's
    // position is past it, it must read no-record, not future.
    const reading = deriveFulfillmentLifecycle({ line_state: "shipped" });
    render(<ProcurementTrail reading={reading} />);

    const noRecordLabel = screen.getByText("Cleared to produce");
    expect(noRecordLabel.closest("li")).toHaveAttribute(
      "data-trail-state",
      "no-record",
    );
    expect(noRecordLabel.closest("li")).toHaveTextContent("no record");
  });

  it("draws a gate bar, quiet when the gate carries no fact on this rail", () => {
    const reading = deriveFulfillmentLifecycle({ line_state: "delivered" });
    render(<ProcurementTrail reading={reading} />);

    // "Complete to produce" (after step 4) is always no-record on Rail A.
    const gate = screen.getByText("Complete to produce");
    expect(gate.closest("li")).toHaveAttribute(
      "data-trail-gate",
      "complete_to_produce",
    );
    expect(gate.closest("li")).toHaveAttribute("data-trail-state", "no-record");
  });

  it("never renders a box-shadow class and holds the 12px type floor", () => {
    const reading = deriveFulfillmentLifecycle({ line_state: "acknowledged" });
    const { container } = render(<ProcurementTrail reading={reading} />);

    expect(container.innerHTML).not.toMatch(/shadow/);
    // Every stamp/label class list carries the 12px floor.
    expect(
      container.querySelectorAll(".text-\\[12px\\]").length,
    ).toBeGreaterThan(0);
    expect(container.innerHTML).not.toMatch(/text-\[1[01]px\]/);
  });
});
