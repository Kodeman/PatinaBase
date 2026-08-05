import { render, screen } from "@testing-library/react";

jest.mock("./derived-budget-grid", () => ({
  DerivedBudgetGrid: ({ projectId }: { projectId: string }) => (
    <div data-testid="derived-budget-grid">{projectId}</div>
  ),
}));

jest.mock("./authorizations-ledger", () => ({
  AuthorizationsLedger: ({
    projectId,
    projectName,
  }: {
    projectId: string;
    projectName?: string;
  }) => (
    <div data-testid="authorizations-ledger" data-project-name={projectName}>
      {projectId}
    </div>
  ),
}));

import { ProjectCommerceSection } from "./project-commerce-section";

describe("ProjectCommerceSection", () => {
  it("renders the derived budget grid above the authorizations ledger, both scoped to the project", () => {
    render(<ProjectCommerceSection projectId="project-1" />);

    const grid = screen.getByTestId("derived-budget-grid");
    const ledger = screen.getByTestId("authorizations-ledger");
    expect(grid).toHaveTextContent("project-1");
    expect(ledger).toHaveTextContent("project-1");
    // DerivedBudgetGrid (the working budget) reads first, then the
    // authorizations ledger — the section's own DOM order.
    expect(
      grid.compareDocumentPosition(ledger) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // Without this, AuthorizationsLedger's default projectName='' flowed all
  // the way to a trade scope's work order, which printed the party's name
  // with no project heading — this is the wiring that closes that gap.
  it("forwards projectName to the authorizations ledger, for the work order header", () => {
    render(<ProjectCommerceSection projectId="project-1" projectName="Whitfield Residence" />);
    expect(screen.getByTestId("authorizations-ledger")).toHaveAttribute(
      "data-project-name",
      "Whitfield Residence",
    );
  });

  it("names the section for assistive tech", () => {
    render(<ProjectCommerceSection projectId="project-1" />);
    expect(
      screen.getByRole("region", { name: "Project commercial planning" }),
    ).toBeInTheDocument();
  });
});
