import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { adaptProjectCommercialSummary } from "@/lib/commercial-documents";
import {
  useAcknowledgeBudgetCheckpoint,
  useProjectWorkingBudget,
} from "@/hooks/use-commercial-client";
import { BudgetCheckpointReview as PublishedReview } from "../budget-checkpoint-review";

jest.mock("@/hooks/use-commercial-client", () => ({
  useProjectWorkingBudget: jest.fn(),
  useAcknowledgeBudgetCheckpoint: jest.fn(),
}));

function BudgetCheckpointReview({ projectId }: { projectId: string }) {
  return <PublishedReview projectId={projectId} query={useProjectWorkingBudget(projectId)} />;
}

const budget = () =>
  adaptProjectCommercialSummary({
    workingBudget: {
      version: {
        id: "v1",
        projectId: "p1",
        version: 4,
        status: "published",
        currency: "USD",
        lowTotalCents: 10000,
        targetTotalCents: 20000,
        highTotalCents: 30000,
        note: "PRIVATE NOTE",
        liveAuthorizedTotalCents: 987654321,
      },
      lines: [
        {
          roomName: "Living room",
          category: "Seating",
          lowCents: 10000,
          targetCents: 20000,
          highCents: 30000,
          tradeCents: 888888,
          liveAuthorizedCents: 777777,
        },
      ],
      checkpoint: {
        id: "cp1",
        projectId: "p1",
        versionId: "v1",
        checkpointCode: "BC-004",
        status: "open",
        snapshotFingerprint: "frozen-fingerprint",
        publishedAt: "2026-10-19T10:00:00Z",
      },
    },
  }).workingBudget!;

const read = useProjectWorkingBudget as jest.Mock;
const acknowledge = jest.fn();
const refetch = jest.fn();
let query: Record<string, unknown>;
beforeEach(() => {
  query = {
    data: budget(),
    isPending: false,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch,
  };
  read.mockImplementation(() => query);
  (useAcknowledgeBudgetCheckpoint as jest.Mock).mockReturnValue({
    mutateAsync: acknowledge,
    isPending: false,
  });
  acknowledge.mockResolvedValue({
    checkpointId: "cp1",
    status: "acknowledged",
  });
  refetch.mockResolvedValue({ isError: false });
});

it("shows the coherent published plan and exact checkpoint identity without internal or live figures", () => {
  render(<BudgetCheckpointReview projectId="p1" />);
  expect(
    screen.getByRole("heading", { name: "Published spending plan" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/BC-004/)).toHaveTextContent("Version 4");
  expect(screen.getByText(/BC-004/)).toHaveTextContent("cp1");
  expect(screen.getByText("Living room · Seating")).toBeInTheDocument();
  expect(screen.getAllByText("$200.00").length).toBeGreaterThan(0);
  expect(
    screen.getByText(/not a purchase approval, signature, or payment/i),
  ).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("PRIVATE NOTE");
  expect(document.body).not.toHaveTextContent("987654321");
  expect(document.body).not.toHaveTextContent("777777");
  expect(acknowledge).not.toHaveBeenCalled();
});

it("acknowledges only the displayed ID after an explicit click, once while pending", async () => {
  let finish!: (value: unknown) => void;
  acknowledge.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { unmount } = render(<BudgetCheckpointReview projectId="p1" />);
  expect(acknowledge).not.toHaveBeenCalled();
  const action = screen.getByRole("button", {
    name: "Acknowledge this spending plan",
  });
  fireEvent.click(action);
  fireEvent.click(action);
  expect(acknowledge).toHaveBeenCalledTimes(1);
  expect(acknowledge).toHaveBeenCalledWith("cp1");
  await act(async () =>
    finish({ checkpointId: "cp1", status: "acknowledged" }),
  );
  expect(
    screen.getByText(/You acknowledged this spending plan/),
  ).toBeInTheDocument();
  unmount();
  expect(acknowledge).toHaveBeenCalledTimes(1);
});

it.each([
  "loading",
  "error",
  "missing",
  "draft",
  "superseded",
  "wrong project",
  "wrong checkpoint project",
  "wrong version",
  "missing fingerprint",
  "missing checkpoint",
  "overridden",
])("holds %s without exposing an actionable or unpublished plan", (state) => {
  const data = budget();
  if (state === "loading") query.isPending = true;
  if (state === "error") query.isError = true;
  if (state === "missing") query.data = null;
  if (state === "draft") data.state = "draft";
  if (state === "superseded") data.state = "superseded";
  if (state === "wrong project") data.projectId = "p2";
  if (state === "wrong checkpoint project")
    Object.assign(data.checkpoint!, { projectId: "p2" });
  if (state === "wrong version")
    Object.assign(data.checkpoint!, { versionId: "v2" });
  if (state === "missing fingerprint")
    data.checkpoint!.evidenceFingerprint = null;
  if (state === "missing checkpoint") data.checkpoint = null;
  if (state === "overridden") data.checkpoint!.state = "overridden";
  if (state !== "missing") query.data = data;
  render(<BudgetCheckpointReview projectId="p1" />);
  expect(
    screen.getByRole("heading", { name: "Published spending plan" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Acknowledge this spending plan" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Living room · Seating")).not.toBeInTheDocument();
  if (state === "error")
    expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
  if (state === "loading")
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  expect(acknowledge).not.toHaveBeenCalled();
});

it("shows acknowledged state without offering another act", () => {
  const data = budget();
  data.checkpoint!.state = "acknowledged";
  query.data = data;
  render(<BudgetCheckpointReview projectId="p1" />);
  expect(
    screen.getByText(/You acknowledged this spending plan/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Acknowledge this spending plan" }),
  ).not.toBeInTheDocument();
  expect(acknowledge).not.toHaveBeenCalled();
});

it("holds a refused stale acknowledgement until explicit reload, never automatically retrying", async () => {
  acknowledge.mockRejectedValue(
    new Error("only the latest published checkpoint may be acknowledged"),
  );
  render(<BudgetCheckpointReview projectId="p1" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Acknowledge this spending plan" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Reload"),
  );
  expect(
    screen.queryByRole("button", { name: "Acknowledge this spending plan" }),
  ).not.toBeInTheDocument();
  expect(refetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reload spending plan" }));
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  expect(acknowledge).toHaveBeenCalledTimes(1);
});

it("isolates pending old-project completion and mismatched data on a project switch", async () => {
  let finish!: (value: unknown) => void;
  acknowledge.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { rerender } = render(<BudgetCheckpointReview projectId="p1" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Acknowledge this spending plan" }),
  );
  rerender(<BudgetCheckpointReview projectId="p2" />);
  await act(async () =>
    finish({ checkpointId: "cp1", status: "acknowledged" }),
  );
  expect(screen.queryByText(/You acknowledged/)).not.toBeInTheDocument();
  expect(screen.queryByText("Living room · Seating")).not.toBeInTheDocument();
  expect(acknowledge).toHaveBeenCalledTimes(1);
});

it("isolates an old checkpoint response when the displayed version changes", async () => {
  let finish!: (value: unknown) => void;
  acknowledge.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { rerender } = render(<BudgetCheckpointReview projectId="p1" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Acknowledge this spending plan" }),
  );
  const next = budget();
  next.id = "v2";
  next.version = 5;
  Object.assign(next.checkpoint!, {
    id: "cp2",
    versionId: "v2",
    checkpointCode: "BC-005",
  });
  query.data = next;
  rerender(<BudgetCheckpointReview projectId="p1" />);
  await act(async () =>
    finish({ checkpointId: "cp1", status: "acknowledged" }),
  );
  expect(screen.queryByText(/You acknowledged/)).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Acknowledge this spending plan" }),
  ).toBeInTheDocument();
  expect(acknowledge).toHaveBeenCalledTimes(1);
});
