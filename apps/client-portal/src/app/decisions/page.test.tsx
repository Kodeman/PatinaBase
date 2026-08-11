import { render, screen } from "@testing-library/react";

import ClientDecisionsPage from "./page";

const useAllDecisions = jest.fn();
const useMyProjectApprovalReviews = jest.fn();

jest.mock("@patina/supabase", () => ({
  PROJECT_APPROVAL_CONTRACT: "project_artifact_v1",
  useAllDecisions: (...args: unknown[]) => useAllDecisions(...args),
  useMyProjectApprovalReviews: (...args: unknown[]) =>
    useMyProjectApprovalReviews(...args),
}));

jest.mock("@/components/approvals/project-approval-summary", () => ({
  ProjectApprovalSummary: ({
    approval,
  }: {
    approval: { decisionId: string; question: string; isOverdue: boolean };
  }) => (
    <a
      href={`/decisions/${approval.decisionId}`}
      data-testid="stage2-summary"
      data-overdue={String(approval.isOverdue)}
    >
      {approval.question}
    </a>
  ),
}));

jest.mock("@/components/decision-card-client", () => ({
  DecisionCardClient: () => <button type="button">Choose legacy option</button>,
}));

jest.mock("@/hooks/use-decisions-client", () => ({
  isClientActionableDecision: () => true,
}));

beforeEach(() => {
  useAllDecisions.mockReturnValue({ data: [], isLoading: false });
  useMyProjectApprovalReviews.mockReturnValue({
    data: [],
    isLoading: false,
  });
});

it("drives Stage-2 discovery from the sanitized global list without raw-row duplication", () => {
  useMyProjectApprovalReviews.mockReturnValue({
    data: [
      {
        decisionId: "approval-1",
        projectId: "project-1",
        lifecycleStatus: "draft",
        disposition: "active",
        completedReviewCount: 0,
        requiredReviewCount: 1,
        outcome: null,
        question: "Approve issued set 7?",
        isOverdue: true,
      },
    ],
    isLoading: false,
  });
  // A stale/permissive raw result must never become a second Stage-2 row.
  useAllDecisions.mockReturnValue({
    data: [
      {
        id: "approval-1",
        title: "Raw Stage-2 row",
        project_id: "project-1",
        status: "draft",
        due_date: "2099-01-01T00:00:00.000Z",
        approval_contract: "project_artifact_v1",
      },
    ],
    isLoading: false,
  });

  render(<ClientDecisionsPage />);

  expect(screen.getAllByTestId("stage2-summary")).toHaveLength(1);
  expect(screen.getByTestId("stage2-summary")).toHaveAttribute(
    "href",
    "/decisions/approval-1",
  );
  expect(screen.getByTestId("stage2-summary")).toHaveAttribute(
    "data-overdue",
    "true",
  );
  expect(
    screen.getByRole("heading", { name: "Project approvals (1)" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Choose legacy option" }),
  ).not.toBeInTheDocument();
});

it("separates completed-review drafts as awaiting studio issue, not client approval work", () => {
  useMyProjectApprovalReviews.mockReturnValue({
    data: [
      {
        decisionId: "approval-review-complete",
        projectId: "project-1",
        lifecycleStatus: "draft",
        disposition: "active",
        completedReviewCount: 1,
        requiredReviewCount: 1,
        outcome: null,
        question: "Issue the reviewed set?",
        isOverdue: false,
      },
    ],
    isLoading: false,
  });

  render(<ClientDecisionsPage />);

  expect(
    screen.getByRole("heading", { name: "Awaiting studio issue (1)" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: /project approvals/i }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /history/i })).not.toBeInTheDocument();
});

it("keeps the server-projected Stage-2 history separate from active review work", () => {
  useMyProjectApprovalReviews.mockReturnValue({
    data: [
      {
        decisionId: "approval-closed",
        projectId: "project-1",
        lifecycleStatus: "responded",
        disposition: "active",
        question: "Approved issued set",
        isOverdue: false,
      },
    ],
    isLoading: false,
  });

  render(<ClientDecisionsPage />);

  expect(screen.getByRole("heading", { name: "History (1)" })).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: /project approvals/i }),
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

it("keeps the 320px list semantic, single-column, and free of shadow or overflow affordances", () => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 320,
  });
  useMyProjectApprovalReviews.mockReturnValue({
    data: [
      {
        decisionId: "approval-1",
        projectId: "project-1",
        lifecycleStatus: "pending",
        disposition: "active",
        completedReviewCount: 1,
        requiredReviewCount: 1,
        outcome: null,
        question: "Approve the very long immutable issued construction set?",
        isOverdue: false,
      },
    ],
    isLoading: false,
  });

  const { container } = render(<ClientDecisionsPage />);

  expect(screen.getByRole("main")).toHaveClass("min-w-0", "px-4");
  expect(screen.getByRole("list", { name: "Project approvals" })).toBeInTheDocument();
  expect(container.querySelector('[class*="shadow"]')).toBeNull();
  expect(container.querySelector('[class*="overflow-x"]')).toBeNull();
});
