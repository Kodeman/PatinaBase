import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { ProjectApprovalReview as ProjectApprovalReviewData } from "@patina/supabase";
import { ProjectApprovalReview } from "../project-approval-review";

const confirmMutate = jest.fn();
const respondMutate = jest.fn();
const refresh = jest.fn();
const useProjectWorkingBudget = jest.fn();

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

jest.mock("@/hooks/use-commercial-client", () => ({
  useProjectWorkingBudget: (...args: unknown[]) =>
    useProjectWorkingBudget(...args),
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
  // Deliberately true: Ruling VIII removes the client-side overdue device
  // regardless of what this field reports — the condition stays the
  // studio's to carry, never the client's to be shown.
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

const MATCHING_BUDGET = {
  id: "artifact-1",
  projectId: "project-1",
  version: 3,
  state: "published",
  currency: "USD",
  lowTotalCents: 8000000,
  targetTotalCents: 10000000,
  highTotalCents: 12000000,
  lines: [
    {
      roomName: "Living room",
      category: "Seating",
      lowCents: 2000000,
      targetCents: 2500000,
      highCents: 3000000,
      notes: null,
    },
  ],
  checkpoint: {
    id: "checkpoint-1",
    state: "open",
    publishedAt: "2026-07-20T12:00:00.000Z",
    acknowledgedAt: null,
    overrideReason: null,
    evidenceFingerprint: "a".repeat(64),
  },
};

beforeEach(() => {
  confirmMutate.mockReset();
  confirmMutate.mockResolvedValue({});
  respondMutate.mockReset();
  respondMutate.mockResolvedValue({});
  refresh.mockReset();
  useProjectWorkingBudget.mockReset();
  useProjectWorkingBudget.mockReturnValue({
    data: MATCHING_BUDGET,
    isLoading: false,
    isError: false,
  });
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { randomUUID: () => "request-key-1" },
  });
});

describe("ProjectApprovalReview", () => {
  it("shows the immutable citation without exposing its checksum, explicit zero impacts, and three distinct outcomes", () => {
    render(<ProjectApprovalReview approval={APPROVAL} />);

    expect(
      screen.getByRole("heading", { name: APPROVAL.question }),
    ).toBeInTheDocument();
    expect(screen.getByText("Budget checkpoint 03")).toBeInTheDocument();
    expect(
      screen.queryByText(/SHA-256 artifact checksum/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("a".repeat(64))).not.toBeInTheDocument();
    expect(screen.getByTestId("cost-delta")).toHaveTextContent(
      "$0 — no cost change",
    );
    expect(screen.getByTestId("schedule-delta")).toHaveTextContent(
      "0 days — no schedule change",
    );
    expect(screen.getByTestId("lead-delta")).toHaveTextContent(
      "0 days — no lead-time change",
    );
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

  it("shows the exact approved budget totals and room/category ranges", () => {
    render(<ProjectApprovalReview approval={APPROVAL} />);

    expect(useProjectWorkingBudget).toHaveBeenCalledWith("project-1");
    const details = screen.getByTestId("approved-budget-details");
    expect(details).toHaveTextContent("Target$100,000.00");
    expect(details).toHaveTextContent("Low$80,000.00");
    expect(details).toHaveTextContent("High$120,000.00");
    expect(details).toHaveTextContent("Living room · Seating");
    expect(details).toHaveTextContent("Low$20,000.00");
    expect(details).toHaveTextContent("Target$25,000.00");
    expect(details).toHaveTextContent("High$30,000.00");
  });

  it.each([
    ["id", { id: "different-budget" }],
    ["version", { version: 4 }],
    [
      "checksum",
      {
        checkpoint: {
          ...MATCHING_BUDGET.checkpoint,
          evidenceFingerprint: "different-fingerprint",
        },
      },
    ],
  ])("fails closed without figures on a %s mismatch", (_field, override) => {
    useProjectWorkingBudget.mockReturnValue({
      data: { ...MATCHING_BUDGET, ...override },
      isLoading: false,
      isError: false,
    });

    render(<ProjectApprovalReview approval={APPROVAL} />);

    expect(screen.getByTestId("budget-details-unavailable")).toHaveTextContent(
      "Budget details are unavailable for this exact approved edition.",
    );
    expect(
      screen.queryByTestId("approved-budget-details"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("$100,000.00")).not.toBeInTheDocument();
  });

  it("announces loading separately from unavailable budget details", () => {
    useProjectWorkingBudget.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<ProjectApprovalReview approval={APPROVAL} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Budget details are loading…",
    );
    expect(
      screen.queryByTestId("budget-details-unavailable"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("approved-budget-details"),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["error", undefined, true],
    ["missing budget", null, false],
  ])("shows no figures when budget details are unavailable: %s", (_state, data, isError) => {
    useProjectWorkingBudget.mockReturnValue({
      data,
      isLoading: false,
      isError,
    });

    render(<ProjectApprovalReview approval={APPROVAL} />);

    expect(screen.getByTestId("budget-details-unavailable")).toBeInTheDocument();
    expect(
      screen.queryByTestId("approved-budget-details"),
    ).not.toBeInTheDocument();
  });

  it("disables the budget query and hides budget details for non-budget approvals", () => {
    render(
      <ProjectApprovalReview
        approval={{ ...APPROVAL, artifactKind: "plan_issue" }}
      />,
    );

    expect(useProjectWorkingBudget).toHaveBeenCalledWith("");
    expect(screen.queryByTestId("budget-details")).not.toBeInTheDocument();
  });

  it("keeps the three outcomes and their copy verbatim", () => {
    render(<ProjectApprovalReview approval={APPROVAL} />);

    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(
      screen.getByText("Accept this exact artifact and its stated impacts."),
    ).toBeInTheDocument();
    expect(screen.getByText("Changes requested")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Return this edition for revision and a new approval request.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Needs discussion")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Hold the gate while you and your designer talk it through.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the full six-part gate anatomy — artifact, question, scope, impact, authority, confirmation", () => {
    render(<ProjectApprovalReview approval={APPROVAL} />);

    const anatomy = screen.getByTestId("gate-anatomy");
    expect(anatomy).toBeInTheDocument();
    expect(screen.getByTestId("anatomy-artifact")).toBeInTheDocument();
    expect(screen.getByTestId("anatomy-question")).toBeInTheDocument();
    expect(screen.getByTestId("anatomy-scope")).toBeInTheDocument();
    expect(screen.getByTestId("anatomy-impact")).toBeInTheDocument();
    expect(screen.getByTestId("anatomy-authority")).toBeInTheDocument();
    expect(screen.getByTestId("anatomy-confirmation")).toBeInTheDocument();

    for (const label of [
      "Artifact",
      "Question",
      "Scope",
      "Impact",
      "Authority",
      "Confirmation",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    // The anatomy is an ORDER, not just a set — Artifact, Question, Scope,
    // Impact, Authority, then Confirmation, each part strictly after the last.
    const partOrder = [
      "anatomy-artifact",
      "anatomy-question",
      "anatomy-scope",
      "anatomy-impact",
      "anatomy-authority",
      "anatomy-confirmation",
    ];
    const parts = partOrder.map((testId) => screen.getByTestId(testId));
    for (let i = 1; i < parts.length; i++) {
      const relation = parts[i - 1].compareDocumentPosition(parts[i]);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("states the immutability sentence with the edition number wired to the artifact, not hard-coded", () => {
    const { rerender } = render(<ProjectApprovalReview approval={APPROVAL} />);
    expect(screen.getByTestId("immutability-sentence")).toHaveTextContent(
      "You are approving edition 3, exactly as shown.",
    );

    rerender(
      <ProjectApprovalReview
        approval={{ ...APPROVAL, artifactVersion: 7 }}
      />,
    );
    expect(screen.getByTestId("immutability-sentence")).toHaveTextContent(
      "You are approving edition 7, exactly as shown.",
    );
  });

  it("never renders a client-side overdue indicator, even when isOverdue is true", () => {
    render(<ProjectApprovalReview approval={{ ...APPROVAL, isOverdue: true }} />);
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
  });

  it("renders a HELD FOR DISCUSSION stamp when the recorded outcome is needs_discussion", () => {
    render(
      <ProjectApprovalReview
        approval={{
          ...APPROVAL,
          outcome: "needs_discussion",
          respondedAt: "2026-07-21T09:00:00.000Z",
        }}
      />,
    );

    const held = screen.getByTestId("held-for-discussion");
    expect(held).toBeInTheDocument();
    expect(held).toHaveTextContent(/held for discussion/i);
    // The recorded-outcome line must use the same wording as the visible
    // stamp — a screen reader and a sighted reader should not disagree on
    // the word for the same held gate. "Needs discussion" is the outcome
    // picker's verbatim label; it must not leak into this recorded state.
    expect(held).toHaveTextContent("Recorded outcome: Held for discussion");
    expect(held.textContent).not.toMatch(/needs discussion/i);
  });

  it("renders a seal on the approved outcome and no held stamp", () => {
    render(
      <ProjectApprovalReview
        approval={{
          ...APPROVAL,
          outcome: "approved",
          respondedAt: "2026-07-21T09:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByTestId("approval-seal")).toBeInTheDocument();
    expect(
      screen.queryByTestId("held-for-discussion"),
    ).not.toBeInTheDocument();
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
      expect(control.className).toMatch(/(?:min-h-11|min-h-\[44px\]|h-5)/);
    }
  });
});
