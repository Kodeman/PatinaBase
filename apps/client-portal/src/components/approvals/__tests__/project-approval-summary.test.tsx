import { render, screen } from "@testing-library/react";

import type { ProjectApprovalReview } from "@patina/supabase";
import { ProjectApprovalSummary } from "../project-approval-summary";

const approval: ProjectApprovalReview = {
  decisionId: "decision-1",
  projectId: "project-1",
  phaseId: "phase-1",
  sectionKey: null,
  artifactKind: "plan_issue",
  artifactId: "issue-1",
  artifactVersion: 7,
  artifactChecksum: "b".repeat(64),
  artifactTitle: "Issued construction set",
  question: "Approve issued set 7?",
  context: null,
  dueAt: "2026-08-20T12:00:00.000Z",
  costCentsDelta: 100,
  scheduleDaysDelta: 1,
  leadTimeDaysDelta: 2,
  lifecycleStatus: "responded",
  outcome: "changes_requested",
  disposition: "active",
  isOverdue: false,
  completedReviewCount: 1,
  requiredReviewCount: 1,
  authorityRevision: 2,
  predecessorDecisionId: null,
  successorDecisionId: "decision-2",
  createdAt: "2026-08-10T12:00:00.000Z",
  sentAt: "2026-08-10T12:01:00.000Z",
  respondedAt: "2026-08-11T12:00:00.000Z",
  updatedAt: "2026-08-11T12:00:00.000Z",
};

it("links the exact approval and never collapses changes requested into discussion", () => {
  render(<ProjectApprovalSummary approval={approval} />);

  expect(screen.getByText("Changes requested")).toBeInTheDocument();
  expect(screen.queryByText("Needs discussion")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: approval.question })).toHaveAttribute(
    "href",
    "/decisions/decision-1",
  );
  expect(
    screen.getByText(/Issued construction set · Edition 7/),
  ).toBeInTheDocument();
});

it("labels a completed-review draft as awaiting studio issue instead of a client gate", () => {
  render(
    <ProjectApprovalSummary
      approval={{
        ...approval,
        lifecycleStatus: "draft",
        outcome: null,
        completedReviewCount: 1,
        requiredReviewCount: 1,
        isOverdue: true,
      }}
    />,
  );

  expect(screen.getByText("Awaiting studio issue")).toBeInTheDocument();
  expect(screen.queryByText("Review required")).not.toBeInTheDocument();
  expect(screen.queryByText("Response required")).not.toBeInTheDocument();
  expect(screen.queryByText(/Overdue/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Due Aug/)).not.toBeInTheDocument();
});

it("never renders Overdue for a pending, actionable, isOverdue approval — Response required stands alone", () => {
  render(
    <ProjectApprovalSummary
      approval={{
        ...approval,
        lifecycleStatus: "pending",
        outcome: null,
        disposition: "active",
        completedReviewCount: 1,
        requiredReviewCount: 1,
        isOverdue: true,
      }}
    />,
  );

  expect(screen.getByText("Response required")).toBeInTheDocument();
  expect(screen.queryByText(/Overdue/)).not.toBeInTheDocument();
});

it("reflows as one typographic column at 320px without shadows or horizontal scroll", () => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 320,
  });

  const { container } = render(
    <ProjectApprovalSummary
      approval={{
        ...approval,
        question: "Approve the long immutable issued construction set edition?",
      }}
    />,
  );

  expect(screen.getByTestId("project-approval-summary")).toHaveClass("min-w-0");
  expect(
    screen.getByRole("link", {
      name: "Approve the long immutable issued construction set edition?",
    }),
  ).toHaveClass("min-h-11");
  expect(container.querySelector('[class*="shadow"]')).toBeNull();
  expect(container.querySelector('[class*="overflow-x"]')).toBeNull();
});
