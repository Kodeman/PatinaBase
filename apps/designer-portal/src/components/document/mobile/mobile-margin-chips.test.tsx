import { fireEvent, render, screen } from "@testing-library/react";
import type { MarginItemRow } from "@/lib/document/margin-derivation";
import type { WorkflowGate } from "@/lib/document/workflow-gate";
import { MobileMarginChips } from "./mobile-margin-chips";
import { MobileShellProvider, useMobileShell } from "./mobile-shell";

let mockItems: MarginItemRow[] = [];
let mockGates: WorkflowGate[] = [];

jest.mock("@/hooks/use-margin-items", () => ({
  useMarginItems: () => ({ data: mockItems }),
}));

jest.mock("@patina/supabase", () => ({
  useCoordinationItems: () => ({
    data: [],
    isLoading: false,
    isPending: false,
    isError: false,
  }),
  isProjectArtifactApproval: () => false,
}));

jest.mock("@/components/document/margin-handoff-item", () => ({
  useHandoffGates: () => ({
    gates: mockGates,
    handoffsById: new Map(),
    isError: false,
  }),
}));

function row(overrides: Partial<MarginItemRow>): MarginItemRow {
  return {
    kind: "decision",
    item_id: "item-1",
    project_id: "proj-1",
    proposal_id: null,
    anchor_kind: "letterhead",
    anchor_id: null,
    state: "pending",
    title: "Primary bedroom approval",
    detail: "",
    ts: "2026-08-01T00:00:00Z",
    payload: {},
    ...overrides,
  };
}

function OpenedItem() {
  const { sheet } = useMobileShell();
  return (
    <p data-testid="opened-item">
      {sheet?.kind === "margin-item" ? sheet.itemId : ""}
    </p>
  );
}

describe("MobileMarginChips (D-B30)", () => {
  beforeEach(() => {
    mockItems = [];
    mockGates = [];
  });

  it('the letterhead branch lists exactly what useLetterheadMargin yields, tagged data-mobile-margin-chips="letterhead"', () => {
    mockItems = [
      row({ item_id: "a", title: "Primary bedroom approval" }),
      row({
        item_id: "b",
        anchor_kind: "line",
        anchor_id: "line-1",
        title: "A pieces line item",
      }),
      row({ item_id: "c", anchor_kind: "section", title: "A section item" }),
    ];

    render(
      <MobileShellProvider>
        <MobileMarginChips
          projectId="proj-1"
          proposalId={null}
          anchorKind="letterhead"
        />
      </MobileShellProvider>,
    );

    const block = document.querySelector(
      '[data-mobile-margin-chips="letterhead"]',
    );
    expect(block).not.toBeNull();
    expect(screen.getByText("Primary bedroom approval")).toBeInTheDocument();
    expect(screen.getByText("A section item")).toBeInTheDocument();
    expect(screen.queryByText("A pieces line item")).toBeNull();
  });

  it("opens the margin-item sheet for the tapped chip", () => {
    mockItems = [row({ item_id: "a", title: "Primary bedroom approval" })];

    render(
      <MobileShellProvider>
        <OpenedItem />
        <MobileMarginChips
          projectId="proj-1"
          proposalId={null}
          anchorKind="letterhead"
        />
      </MobileShellProvider>,
    );

    fireEvent.click(screen.getByText("Primary bedroom approval"));
    expect(screen.getByTestId("opened-item")).toHaveTextContent("a");
  });

  it("the line branch is unaffected — it still filters by anchor_id, ignoring letterhead/section items", () => {
    mockItems = [
      row({
        item_id: "a",
        anchor_kind: "line",
        anchor_id: "line-1",
        title: "This line item",
      }),
      row({
        item_id: "b",
        anchor_kind: "line",
        anchor_id: "line-2",
        title: "A different line item",
      }),
      row({
        item_id: "c",
        anchor_kind: "letterhead",
        title: "A letterhead item",
      }),
    ];

    render(
      <MobileShellProvider>
        <MobileMarginChips
          projectId="proj-1"
          proposalId={null}
          anchorKind="line"
          anchorId="line-1"
        />
      </MobileShellProvider>,
    );

    expect(screen.getByText("This line item")).toBeInTheDocument();
    expect(screen.queryByText("A different line item")).toBeNull();
    expect(screen.queryByText("A letterhead item")).toBeNull();
  });

  it("prints nothing when there is nothing to show", () => {
    const { container } = render(
      <MobileShellProvider>
        <MobileMarginChips
          projectId="proj-1"
          proposalId={null}
          anchorKind="letterhead"
        />
      </MobileShellProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
