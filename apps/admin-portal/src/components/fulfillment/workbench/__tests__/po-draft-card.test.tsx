import { render, screen, within } from "@testing-library/react";
import type { FulfillmentWorkbenchLine } from "@patina/fulfillment";
import { PoDraftCard } from "@/components/fulfillment/workbench/po-draft-card";
import { expectNoSubFloorType } from "@/test-utils";

// WP4 Track 3: the BOH order-detail line view's R7 stamp trail. Each PO line
// carries a collapsed "Lifecycle" disclosure reading deriveFulfillmentLifecycle
// over its own lineState. Rail A honesty rule under test: a cancelled line
// gets its operational word and NO trail position — never a fabricated one.

function makeLine(
  overrides: Partial<FulfillmentWorkbenchLine>,
): FulfillmentWorkbenchLine {
  return {
    id: "line-1",
    orderId: "order-1",
    productId: "prod-1",
    itemName: "Custom sofa",
    vendorSku: null,
    qty: 1,
    unitPriceCents: 500000,
    unitCostCents: 300000,
    vendorId: "vendor-1",
    vendorName: "Room & Board",
    mappingState: "mapped",
    lineState: "acknowledged",
    lineIndex: 1,
    circledIndex: "①",
    poId: "po-1",
    poLineId: "poline-1",
    ...overrides,
  };
}

describe("PoDraftCard — R7 line-detail trail (WP4 Track 3)", () => {
  it("shows a collapsed Lifecycle disclosure per line that reveals the stamp trail", () => {
    const line = makeLine({ lineState: "acknowledged" });
    render(
      <PoDraftCard
        dropId="po:po-1"
        title="PO-2026-01042-A · Room & Board"
        statusLabel="Acknowledged"
        statusTone="ack"
        costCents={300000}
        lines={[line]}
        droppable={false}
      />,
    );

    const disclosure = screen.getByTestId("wb-po-line-lifecycle");
    // Collapsed by default — the summary is present, and (native <details>
    // renders children in the DOM regardless of the open attribute) the
    // trail underneath already carries the live step at ordinal 03.
    expect(disclosure).toHaveTextContent("Lifecycle");
    const liveStepRow = disclosure.querySelector(
      'li[data-trail-step="acknowledged"]',
    );
    expect(liveStepRow).toHaveAttribute("data-trail-state", "live");
    expect(
      within(liveStepRow as HTMLElement).getByText("Acknowledged"),
    ).toBeInTheDocument();
  });

  it("renders a cancelled line as its operational word, with no trail position at all", () => {
    const line = makeLine({ lineState: "cancelled" });
    render(
      <PoDraftCard
        dropId="po:po-1"
        title="PO-2026-01042-A · Room & Board"
        statusLabel="Cancelled"
        statusTone="late"
        costCents={300000}
        lines={[line]}
        droppable={false}
      />,
    );

    expect(screen.getByTestId("wb-po-line-cancelled")).toHaveTextContent(
      "Cancelled — no trail position",
    );
    expect(
      screen.queryByTestId("wb-po-line-lifecycle"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-glance")).not.toBeInTheDocument();
  });

  it("holds the 12px type floor on both new strings this track added — catches rem drift too", () => {
    // Adversarial review caught both of this file's new strings shipping at
    // text-[0.6rem] (9.6px) — a rem-unit drift the plain px-only regex this
    // suite used to run missed entirely. Scoped to the two testids WP4 Track
    // 3 actually added (not the whole card — the header's pre-existing chips
    // sit below 12px too and are out of this track's scope to touch).
    render(
      <PoDraftCard
        dropId="po:po-1"
        title="PO-2026-01042-A · Room & Board"
        statusLabel="Acknowledged"
        statusTone="ack"
        costCents={300000}
        lines={[
          makeLine({ id: "line-1", lineState: "acknowledged" }),
          makeLine({ id: "line-2", lineState: "cancelled" }),
        ]}
        droppable={false}
      />,
    );

    const lifecycleSummary = screen
      .getByTestId("wb-po-line-lifecycle")
      .querySelector("summary");
    expect(() =>
      expectNoSubFloorType((lifecycleSummary as HTMLElement).outerHTML),
    ).not.toThrow();
    expect(() =>
      expectNoSubFloorType(
        screen.getByTestId("wb-po-line-cancelled").outerHTML,
      ),
    ).not.toThrow();
  });
});
