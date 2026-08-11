import { Suspense } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import ClientDecisionDetailPage from "./page";

const useProjectApprovalByDecision = jest.fn();
const useClientDecision = jest.fn();
const useDecisionComments = jest.fn();
const useCreateDecisionComment = jest.fn();
const useDecisionRealtime = jest.fn();

jest.mock("@/hooks/use-decisions-client", () => ({
  useClientDecision: (...args: unknown[]) => useClientDecision(...args),
}));

jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "client-1" } }),
}));

jest.mock("@patina/supabase", () => ({
  PROJECT_APPROVAL_CONTRACT: "project_artifact_v1",
  useDecisionComments: (...args: unknown[]) => useDecisionComments(...args),
  useCreateDecisionComment: (...args: unknown[]) =>
    useCreateDecisionComment(...args),
  useProjectApprovalByDecision: (...args: unknown[]) =>
    useProjectApprovalByDecision(...args),
  useDecisionRealtime: (...args: unknown[]) => useDecisionRealtime(...args),
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

const STAGE2_APPROVAL = {
  decisionId: "decision-1",
  projectId: "project-1",
  phaseId: "phase-1",
  lifecycleStatus: "draft",
  disposition: "active",
};

beforeEach(() => {
  useProjectApprovalByDecision.mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
  });
  useClientDecision.mockReturnValue({ data: null, isLoading: false });
  useDecisionComments.mockReturnValue({ data: [], isLoading: false });
  useCreateDecisionComment.mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
  });
});

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

it("blocks legacy reads and comments while the exact canonical lookup is pending", async () => {
  useProjectApprovalByDecision.mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
  });

  await renderPage();

  expect(screen.getByRole("status")).toHaveTextContent(/loading approval/i);
  expect(useClientDecision).not.toHaveBeenCalled();
  expect(useDecisionComments).not.toHaveBeenCalled();
  expect(useCreateDecisionComment).not.toHaveBeenCalled();
  expect(useDecisionRealtime).not.toHaveBeenCalled();
});

it("fails closed on an exact canonical error without probing legacy or comments", async () => {
  useProjectApprovalByDecision.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
  });

  await renderPage();

  expect(screen.getByRole("alert")).toHaveTextContent(
    /authoritative approval evidence is unavailable/i,
  );
  expect(useClientDecision).not.toHaveBeenCalled();
  expect(useDecisionComments).not.toHaveBeenCalled();
  expect(useCreateDecisionComment).not.toHaveBeenCalled();
  expect(useDecisionRealtime).not.toHaveBeenCalled();
});

it("renders authorized Stage-2 evidence and only then mounts realtime and Discussion", async () => {
  useProjectApprovalByDecision.mockReturnValue({
    data: STAGE2_APPROVAL,
    isLoading: false,
    isError: false,
  });

  await renderPage();

  expect(await screen.findByTestId("stage2-approval-review")).toBeInTheDocument();
  expect(useClientDecision).not.toHaveBeenCalled();
  expect(useDecisionComments).toHaveBeenCalledWith("decision-1");
  expect(useCreateDecisionComment).toHaveBeenCalledTimes(1);
  expect(useDecisionRealtime).toHaveBeenCalledWith("decision-1");
  expect(screen.getByRole("heading", { name: "Discussion" })).toBeInTheDocument();
  expect(
    screen.getByText(/comments.*never submit or change an approval outcome/i),
  ).toBeInTheDocument();
});

it("uses exact null as the only permission to fetch and render a verified legacy decision", async () => {
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
  expect(useClientDecision).toHaveBeenCalledWith("decision-1");
  expect(useDecisionComments).toHaveBeenCalledWith("decision-1");
  expect(useDecisionRealtime).toHaveBeenCalledWith("decision-1");
  expect(screen.getByRole("heading", { name: "Discussion" })).toBeInTheDocument();
});

it("does not mount comments when exact null is followed by legacy not-found", async () => {
  await renderPage();

  expect(screen.getByText("Decision not found.")).toBeInTheDocument();
  expect(useClientDecision).toHaveBeenCalledWith("decision-1");
  expect(useDecisionComments).not.toHaveBeenCalled();
  expect(useCreateDecisionComment).not.toHaveBeenCalled();
  expect(useDecisionRealtime).not.toHaveBeenCalled();
});

it("fails closed without comments if a raw Stage-2 row appears after canonical null", async () => {
  useClientDecision.mockReturnValue({
    data: {
      id: "decision-1",
      project_id: "project-1",
      approval_contract: "project_artifact_v1",
    },
    isLoading: false,
  });

  await renderPage();

  expect(screen.getByRole("alert")).toHaveTextContent(
    /authoritative approval evidence is unavailable/i,
  );
  expect(useDecisionComments).not.toHaveBeenCalled();
  expect(useCreateDecisionComment).not.toHaveBeenCalled();
  expect(useDecisionRealtime).not.toHaveBeenCalled();
});

it("does not mount comments while the permitted legacy lookup is pending", async () => {
  useClientDecision.mockReturnValue({ data: undefined, isLoading: true });

  await renderPage();

  expect(screen.getByRole("status")).toHaveTextContent(/loading decision/i);
  expect(useDecisionComments).not.toHaveBeenCalled();
  expect(useCreateDecisionComment).not.toHaveBeenCalled();
  expect(useDecisionRealtime).not.toHaveBeenCalled();
});

it("announces a comment read failure without replacing the authorized discussion", async () => {
  useProjectApprovalByDecision.mockReturnValue({
    data: STAGE2_APPROVAL,
    isLoading: false,
    isError: false,
  });
  useDecisionComments.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    error: new Error("do not disclose"),
  });

  await renderPage();

  expect(screen.getByRole("alert")).toHaveTextContent(
    /comments could not be read/i,
  );
  expect(screen.queryByText(/do not disclose/i)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Add to discussion")).toBeInTheDocument();
});

it("announces a post failure and retains the client's draft", async () => {
  useProjectApprovalByDecision.mockReturnValue({
    data: STAGE2_APPROVAL,
    isLoading: false,
    isError: false,
  });
  useCreateDecisionComment.mockReturnValue({
    mutate: jest.fn((_input, options) => options.onError(new Error("private"))),
    isPending: false,
  });

  await renderPage();

  const field = screen.getByLabelText("Add to discussion");
  fireEvent.change(field, { target: { value: "Please clarify the finish." } });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    /draft is still here/i,
  );
  expect(field).toHaveValue("Please clarify the finish.");
  expect(screen.queryByText("private")).not.toBeInTheDocument();
});

it("keeps the authorized detail semantic and single-column at 320px", async () => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 320,
  });
  useProjectApprovalByDecision.mockReturnValue({
    data: STAGE2_APPROVAL,
    isLoading: false,
    isError: false,
  });

  await renderPage();

  const main = screen.getByRole("main");
  expect(main).toHaveClass("min-w-0", "px-4");
  expect(screen.getByLabelText("Add to discussion")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Post" })).toHaveClass("min-h-11");
  expect(main.querySelector('[class*="shadow"]')).toBeNull();
  expect(main.querySelector('[class*="overflow-x"]')).toBeNull();
});
