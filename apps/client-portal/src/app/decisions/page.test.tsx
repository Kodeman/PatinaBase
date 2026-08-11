import { render, screen } from "@testing-library/react";

import ClientDecisionsPage from "./page";

const useAllDecisions = jest.fn();

jest.mock("@patina/supabase", () => ({
  PROJECT_APPROVAL_CONTRACT: "project_artifact_v1",
  useAllDecisions: (...args: unknown[]) => useAllDecisions(...args),
}));

jest.mock("@/components/approvals/project-approval-summary", () => ({
  ProjectApprovalSummaryForDecision: ({
    decisionId,
  }: {
    decisionId: string;
  }) => (
    <a href={`/decisions/${decisionId}`} data-testid="stage2-summary">
      Stage-2 summary
    </a>
  ),
}));

jest.mock("@/components/decision-card-client", () => ({
  DecisionCardClient: () => <button type="button">Choose legacy option</button>,
}));

jest.mock("@/hooks/use-decisions-client", () => ({
  isClientActionableDecision: () => true,
}));

it("routes Stage-2 rows to the canonical summary, never the legacy card", () => {
  useAllDecisions.mockReturnValue({
    data: [
      {
        id: "approval-1",
        title: "Approve issued set",
        project_id: "project-1",
        status: "pending",
        due_date: "2000-01-01T00:00:00.000Z",
        approval_contract: "project_artifact_v1",
      },
    ],
    isLoading: false,
  });
  render(<ClientDecisionsPage />);

  expect(screen.getByTestId("stage2-summary")).toHaveAttribute(
    "href",
    "/decisions/approval-1",
  );
  expect(
    screen.getByRole("heading", { name: "Project approvals (1)" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: /overdue/i }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Choose legacy option" }),
  ).not.toBeInTheDocument();
});

it("preserves legacy decisions without nesting their controls inside a link", () => {
  useAllDecisions.mockReturnValue({
    data: [
      {
        id: "legacy-1",
        title: "Choose a finish",
        project_id: "project-1",
        status: "pending",
        due_date: null,
        approval_contract: null,
      },
    ],
    isLoading: false,
  });
  render(<ClientDecisionsPage />);

  const control = screen.getByRole("button", { name: "Choose legacy option" });
  expect(control.closest("a")).toBeNull();
  expect(
    screen.getByRole("link", { name: /open decision and discussion/i }),
  ).toHaveAttribute("href", "/decisions/legacy-1");
});
