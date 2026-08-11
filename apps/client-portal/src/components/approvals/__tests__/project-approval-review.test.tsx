import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { ProjectApprovalReview as ProjectApprovalReviewData } from "@patina/supabase";
import { ProjectApprovalReview } from "../project-approval-review";

const confirmMutate = jest.fn();
const respondMutate = jest.fn();
const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

jest.mock("@patina/supabase", () => ({
  useConfirmProjectApprovalReview: () => ({
    mutateAsync: confirmMutate,
    isPending: false,
  }),
  useRespondProjectApproval: () => ({
    mutateAsync: respondMutate,
    isPending: false,
  }),
}));

const APPROVAL: ProjectApprovalReviewData = {
  decisionId: "decision-1",
  projectId: "project-1",
  phaseId: "phase-1",
  sectionKey: "project",
  artifactKind: "budget_version",
  artifactId: "artifact-1",
  artifactVersion: 3,
  artifactChecksum: "a".repeat(64),
  artifactTitle: "Budget checkpoint 03",
  question: "Approve this exact budget checkpoint?",
  context: "This edition includes the agreed upholstery allowance.",
  dueAt: "2026-08-01T12:00:00.000Z",
  costCentsDelta: 0,
  scheduleDaysDelta: 0,
  leadTimeDaysDelta: 0,
  lifecycleStatus: "pending",
  outcome: null,
  disposition: "active",
  isOverdue: true,
  completedReviewCount: 1,
  requiredReviewCount: 1,
  authorityRevision: 4,
  predecessorDecisionId: "decision-0",
  successorDecisionId: null,
  createdAt: "2026-07-20T12:00:00.000Z",
  sentAt: "2026-07-20T12:05:00.000Z",
  respondedAt: null,
  updatedAt: "2026-07-20T12:05:00.000Z",
};

beforeEach(() => {
  confirmMutate.mockReset();
  confirmMutate.mockResolvedValue({});
  respondMutate.mockReset();
  respondMutate.mockResolvedValue({});
  refresh.mockReset();
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { randomUUID: () => "request-key-1" },
  });
});

describe("ProjectApprovalReview", () => {
  it("shows the immutable citation, explicit zero impacts, overdue state, and three distinct outcomes", () => {
    render(<ProjectApprovalReview approval={APPROVAL} />);

    expect(
      screen.getByRole("heading", { name: APPROVAL.question }),
    ).toBeInTheDocument();
    expect(screen.getByText("Budget checkpoint 03")).toBeInTheDocument();
    expect(screen.getByText("Edition 3")).toBeInTheDocument();
    expect(screen.getByTestId("artifact-checksum")).toHaveTextContent(
      "a".repeat(64),
    );
    expect(screen.getByTestId("cost-delta")).toHaveTextContent(
      "$0 — no cost change",
    );
    expect(screen.getByTestId("schedule-delta")).toHaveTextContent(
      "0 days — no schedule change",
    );
    expect(screen.getByTestId("lead-delta")).toHaveTextContent(
      "0 days — no lead-time change",
    );
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Approved/ })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Changes requested/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Needs discussion/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /previous edition/i }),
    ).toHaveAttribute("href", "/decisions/decision-0");
  });

  it("submits only the selected outcome with CAS/idempotency and no comment field", async () => {
    render(<ProjectApprovalReview approval={APPROVAL} />);

    fireEvent.click(screen.getByRole("radio", { name: /Changes requested/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit response" }));

    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(1));
    expect(respondMutate).toHaveBeenCalledWith({
      projectId: "project-1",
      decisionId: "decision-1",
      outcome: "changes_requested",
      expectedUpdatedAt: APPROVAL.updatedAt,
      idempotencyKey: "request-key-1",
    });
    expect(JSON.stringify(respondMutate.mock.calls[0][0])).not.toContain(
      "comment",
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the sanitized draft omits authorityRevision", () => {
    render(
      <ProjectApprovalReview
        approval={{
          ...APPROVAL,
          lifecycleStatus: "draft",
          completedReviewCount: 0,
          authorityRevision: null,
          isOverdue: false,
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "authority revision was not supplied",
    );
    expect(
      screen.queryByRole("button", { name: /reviewed this exact edition/i }),
    ).not.toBeInTheDocument();
  });

  it("uses a single-column 320px contract without cards, shadows, or horizontal scroll affordances", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 320,
    });
    const { container } = render(<ProjectApprovalReview approval={APPROVAL} />);
    const review = screen.getByTestId("project-approval-review");
    expect(review.className).toContain("min-w-0");
    expect(
      container.querySelectorAll('[class*="grid-cols-1"]').length,
    ).toBeGreaterThan(0);
    expect(
      container.querySelector('[class*="shadow"]'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[class*="overflow-x"]'),
    ).not.toBeInTheDocument();
    for (const control of screen
      .getAllByRole("radio")
      .concat(screen.getAllByRole("button"))) {
      expect(control.className).toMatch(/(?:min-h-11|h-5)/);
    }
  });
});
