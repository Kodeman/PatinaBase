import { render, screen, within } from "@testing-library/react";
import type { FulfillmentWorkbenchLine } from "@patina/fulfillment";
import { PoDraftCard } from "@/components/fulfillment/workbench/po-draft-card";

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
});
