import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

jest.mock("@patina/supabase", () => ({
  __esModule: true,
  useScopeChangeRequests: jest.fn(),
  useApproveScopeChange: jest.fn(),
  useDeclineScopeChange: jest.fn(),
  useCreateClientScopeChangeRequest: jest.fn(),
}));

jest.mock("@/lib/analytics/events", () => ({
  __esModule: true,
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import {
  useApproveScopeChange,
  useCreateClientScopeChangeRequest,
  useDeclineScopeChange,
  useScopeChangeRequests,
} from "@patina/supabase";

import { PendingScopeChangeAsk, RequestChangeAct } from "../scope-change-ask";

const scopeMock = useScopeChangeRequests as jest.Mock;
const approveMock = useApproveScopeChange as jest.Mock;
const declineMock = useDeclineScopeChange as jest.Mock;
const createMock = useCreateClientScopeChangeRequest as jest.Mock;

const PROJECT_ID = "proj-vale";

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  scopeMock.mockReturnValue({ data: [], isLoading: false });
  approveMock.mockReturnValue({ mutate: jest.fn(), isPending: false });
  declineMock.mockReturnValue({ mutate: jest.fn(), isPending: false });
  createMock.mockReturnValue({ mutate: jest.fn(), isPending: false });
  // jsdom's `crypto` carries no `randomUUID` — same fixture as
  // scope-change/new/page.test.tsx, which `useCreateClientScopeChangeRequest`
  // requires an idempotency key from either way.
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: jest.fn(() => "11111111-1111-4111-8111-111111111111"),
  });
});

describe('RequestChangeAct — "Ask for a change", house-wide or room-scoped', () => {
  it("opens closed, naming the room when one is given", () => {
    wrap(
      <RequestChangeAct
        projectId={PROJECT_ID}
        roomId="room-library"
        roomName="Library"
      />,
    );
    expect(screen.getByText("Ask for a change in Library")).toBeInTheDocument();
    expect(screen.queryByTestId("scope-change-form")).not.toBeInTheDocument();
  });

  it("reads as the house-wide act on the mat, with no room", () => {
    wrap(<RequestChangeAct projectId={PROJECT_ID} />);
    expect(screen.getByText("Ask for a change")).toBeInTheDocument();
  });

  it("unfolds the old form in place and validates before sending", async () => {
    const mutate = jest.fn();
    createMock.mockReturnValue({ mutate, isPending: false });
    wrap(<RequestChangeAct projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByTestId("request-change-mat"));
    expect(screen.getByTestId("scope-change-form")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("scope-change-send"));
    expect(screen.getByRole("alert")).toHaveTextContent(/short title/);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("sends the request with a title, description and idempotency key, then stamps a confirmation", async () => {
    const mutate = jest.fn((_vars, opts) => opts?.onSuccess?.());
    createMock.mockReturnValue({ mutate, isPending: false });
    wrap(
      <RequestChangeAct
        projectId={PROJECT_ID}
        roomId="room-library"
        roomName="Library"
      />,
    );

    await userEvent.click(screen.getByTestId("request-change-room-library"));
    await userEvent.type(
      screen.getByTestId("scope-change-title"),
      "Swap the sofa fabric",
    );
    await userEvent.type(
      screen.getByTestId("scope-change-description"),
      "We would like a more durable fabric for the family sofa.",
    );
    await userEvent.click(screen.getByTestId("scope-change-send"));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        title: "Swap the sofa fabric",
        description: "We would like a more durable fabric for the family sofa.",
        idempotencyKey: expect.any(String),
      }),
      expect.any(Object),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("scope-change-request-sent"),
      ).toBeInTheDocument(),
    );
  });
});

describe("PendingScopeChangeAsk — a studio-sent change, standing on the doorstep", () => {
  const STUDIO_CHANGE = {
    id: "sc-1",
    title: "Add a runner to the stair hall",
    description: "The stair hall would benefit from a runner underfoot.",
    status: "sent",
    request_origin: "studio",
    additional_ffe_budget_cents: 180000,
    additional_design_fee_cents: 0,
    timeline_impact_weeks: 1,
    new_total_budget_cents: 9500000,
  };

  it("renders nothing without a pending studio-sent change", () => {
    scopeMock.mockReturnValue({
      data: [{ ...STUDIO_CHANGE, request_origin: "client_request" }],
      isLoading: false,
    });
    const { container } = wrap(
      <PendingScopeChangeAsk projectId={PROJECT_ID} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("reads the title, description and money-in-words impact", () => {
    scopeMock.mockReturnValue({ data: [STUDIO_CHANGE], isLoading: false });
    wrap(<PendingScopeChangeAsk projectId={PROJECT_ID} />);

    expect(screen.getByTestId("scope-change-ask")).toHaveAttribute(
      "id",
      "scope-change-sc-1",
    );
    expect(
      screen.getByText("Add a runner to the stair hall"),
    ).toBeInTheDocument();
    expect(screen.getByText(/additional FF&E budget/)).toBeInTheDocument();
    expect(screen.getByText(/week added to the timeline/)).toBeInTheDocument();
  });

  it("requires a signed name before approving", async () => {
    const mutate = jest.fn();
    approveMock.mockReturnValue({ mutate, isPending: false });
    scopeMock.mockReturnValue({ data: [STUDIO_CHANGE], isLoading: false });
    wrap(<PendingScopeChangeAsk projectId={PROJECT_ID} />);

    expect(screen.getByTestId("scope-change-approve")).toBeDisabled();
    await userEvent.type(
      screen.getByTestId("scope-change-sign-name"),
      "Whit Vale",
    );
    expect(screen.getByTestId("scope-change-approve")).toBeEnabled();

    await userEvent.click(screen.getByTestId("scope-change-approve"));
    expect(mutate).toHaveBeenCalledWith(
      { requestId: "sc-1", projectId: PROJECT_ID, approvedByName: "Whit Vale" },
      expect.any(Object),
    );
  });

  it("stamps Approved <date> in place once the mutation resolves", async () => {
    const mutate = jest.fn((_vars, opts) => opts?.onSuccess?.());
    approveMock.mockReturnValue({ mutate, isPending: false });
    scopeMock.mockReturnValue({ data: [STUDIO_CHANGE], isLoading: false });
    wrap(<PendingScopeChangeAsk projectId={PROJECT_ID} />);

    await userEvent.type(
      screen.getByTestId("scope-change-sign-name"),
      "Whit Vale",
    );
    await userEvent.click(screen.getByTestId("scope-change-approve"));

    await waitFor(() =>
      expect(screen.getByTestId("scope-change-resolved")).toBeInTheDocument(),
    );
    expect(screen.getByText(/^Approved /)).toBeInTheDocument();
  });

  it("declines with an optional reason", async () => {
    const mutate = jest.fn((_vars, opts) => opts?.onSuccess?.());
    declineMock.mockReturnValue({ mutate, isPending: false });
    scopeMock.mockReturnValue({ data: [STUDIO_CHANGE], isLoading: false });
    wrap(<PendingScopeChangeAsk projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByTestId("scope-change-decline-open"));
    await userEvent.type(
      screen.getByTestId("scope-change-decline-reason"),
      "Not needed right now.",
    );
    await userEvent.click(screen.getByTestId("scope-change-decline-confirm"));

    expect(mutate).toHaveBeenCalledWith(
      {
        requestId: "sc-1",
        projectId: PROJECT_ID,
        declineReason: "Not needed right now.",
      },
      expect.any(Object),
    );
    await waitFor(() =>
      expect(screen.getByText(/^Declined /)).toBeInTheDocument(),
    );
  });
});
