import { Suspense } from "react";
import { act, render, screen } from "@testing-library/react";

import ClientDecisionDetailPage from "./page";

const useClientDecision = jest.fn();

jest.mock("@/hooks/use-decisions-client", () => ({
  useClientDecision: (...args: unknown[]) => useClientDecision(...args),
}));

jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "client-1" } }),
}));

jest.mock("@patina/supabase", () => ({
  PROJECT_APPROVAL_CONTRACT: "project_artifact_v1",
  useDecisionComments: () => ({ data: [], isLoading: false }),
  useCreateDecisionComment: () => ({ mutate: jest.fn(), isPending: false }),
  useProjectApproval: () => ({
    data: { decisionId: "decision-1" },
    isLoading: false,
  }),
  useProjectApprovalRealtime: jest.fn(),
}));

jest.mock("@/components/approvals/project-approval-review", () => ({
  ProjectApprovalReview: () => (
    <div data-testid="stage2-approval-review">Stage-2 review</div>
  ),
}));

jest.mock("@/components/decision-card-client", () => ({
  DecisionCardClient: () => (
    <div data-testid="legacy-decision-card">Legacy decision</div>
  ),
}));

async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={<div>Loading route…</div>}>
        <ClientDecisionDetailPage
          params={Promise.resolve({ id: "decision-1" })}
        />
      </Suspense>,
    );
  });
}

it("branches exact Stage-2 rows to the authoritative review and keeps Discussion separate", async () => {
  useClientDecision.mockReturnValue({
    data: {
      id: "decision-1",
      project_id: "project-1",
      approval_contract: "project_artifact_v1",
    },
    isLoading: false,
  });
  await renderPage();

  expect(
    await screen.findByTestId("stage2-approval-review"),
  ).toBeInTheDocument();
  expect(screen.queryByTestId("legacy-decision-card")).not.toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Discussion" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/comments.*never submit or change an approval outcome/i),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Add to discussion")).toBeInTheDocument();
});

it("preserves the legacy card for non-Stage-2 decisions", async () => {
  useClientDecision.mockReturnValue({
    data: {
      id: "decision-1",
      project_id: "project-1",
      approval_contract: null,
    },
    isLoading: false,
  });
  await renderPage();

  expect(await screen.findByTestId("legacy-decision-card")).toBeInTheDocument();
  expect(
    screen.queryByTestId("stage2-approval-review"),
  ).not.toBeInTheDocument();
});
