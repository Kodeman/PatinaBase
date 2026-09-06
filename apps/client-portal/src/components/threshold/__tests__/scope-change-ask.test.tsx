import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

jest.mock("@patina/supabase", () => ({
  __esModule: true,
  useScopeChangeRequests: jest.fn(),
  useApproveScopeChange: jest.fn(),
  useDeclineScopeChange: jest.fn(),
  useCreateClientScopeChangeRequest: jest.fn(),
  useCancelClientScopeChangeRequest: jest.fn(),
}));

jest.mock("@/hooks/use-auth", () => ({
  __esModule: true,
  useAuth: jest.fn(),
}));

jest.mock("@/lib/analytics/events", () => ({
  __esModule: true,
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import {
  useApproveScopeChange,
  useCancelClientScopeChangeRequest,
  useCreateClientScopeChangeRequest,
  useDeclineScopeChange,
  useScopeChangeRequests,
} from "@patina/supabase";
import { useAuth } from "@/hooks/use-auth";

import { HOLD_MS } from "../instruments/scored-action";
import {
  MyScopeChangeRequestsAsk,
  PendingScopeChangeAsk,
  RequestChangeAct,
  ResolvedScopeChangesPrevious,
} from "../scope-change-ask";

/**
 * Approving a change is held, not tapped (P-18). Fake time covers the hold and
 * is handed back before the mutation's callbacks are flushed.
 */
async function holdApprove() {
  const target = screen.getByTestId("scope-change-approve");
  jest.useFakeTimers();
  fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
  act(() => {
    jest.advanceTimersByTime(HOLD_MS);
  });
  jest.useRealTimers();
  await act(async () => {
    fireEvent.pointerUp(target);
  });
}

const scopeMock = useScopeChangeRequests as jest.Mock;
const approveMock = useApproveScopeChange as jest.Mock;
const declineMock = useDeclineScopeChange as jest.Mock;
const createMock = useCreateClientScopeChangeRequest as jest.Mock;
const cancelMock = useCancelClientScopeChangeRequest as jest.Mock;
const authMock = useAuth as jest.Mock;

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
  cancelMock.mockReturnValue({ mutate: jest.fn(), isPending: false });
  authMock.mockReturnValue({ user: { id: "client-1" } });
  try {
    globalThis.sessionStorage?.clear();
  } catch {
    // jsdom always provides sessionStorage; the guard matches the module's
    // own defensive read/write.
  }
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
        // Finding #24 — the mutation payload carries no room field, so the
        // room the change was raised from travels in the body the studio
        // reads instead.
        description:
          "We would like a more durable fabric for the family sofa.\n\nRaised from: Library.",
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
    // 00395's CHECK permits only client_request / designer_amendment; a
    // "studio" row is a shape production cannot hold.
    request_origin: "designer_amendment",
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

    await holdApprove();
    expect(mutate).toHaveBeenCalledWith(
      { requestId: "sc-1", projectId: PROJECT_ID, approvedByName: "Whit Vale" },
      expect.any(Object),
    );
  });

  it("sends one approval however fast the second hold lands", () => {
    // Approve binds a signature and a budget change. `HoldAction`'s own
    // `unavailable` only takes effect on the NEXT render, so a second hold
    // begun before the first has settled still reads it false.
    const mutate = jest.fn();
    approveMock.mockReturnValue({ mutate, isPending: false });
    scopeMock.mockReturnValue({ data: [STUDIO_CHANGE], isLoading: false });
    wrap(<PendingScopeChangeAsk projectId={PROJECT_ID} />);

    fireEvent.change(screen.getByTestId("scope-change-sign-name"), {
      target: { value: "Whit Vale" },
    });
    const approve = screen.getByTestId("scope-change-approve");
    jest.useFakeTimers();
    for (const _pass of [0, 1]) {
      fireEvent.pointerDown(approve, { clientX: 4, clientY: 4 });
      act(() => {
        jest.advanceTimersByTime(HOLD_MS);
      });
      fireEvent.pointerUp(approve);
    }
    jest.useRealTimers();

    expect(mutate).toHaveBeenCalledTimes(1);
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
    await holdApprove();

    await waitFor(() =>
      expect(screen.getByTestId("scope-change-resolved")).toBeInTheDocument(),
    );
    expect(screen.getByText(/^Approved /)).toBeInTheDocument();
  });

  it("signs the change on a ruled line, dated, and holds the act (P-18)", async () => {
    const mutate = jest.fn();
    approveMock.mockReturnValue({ mutate, isPending: false });
    scopeMock.mockReturnValue({ data: [STUDIO_CHANGE], isLoading: false });
    wrap(<PendingScopeChangeAsk projectId={PROJECT_ID} />);

    const rule = screen.getByTestId("scope-change-sign-name");
    expect(rule).toHaveAttribute("autocomplete", "name");
    expect(screen.getByLabelText("Type your full name")).toBe(rule);
    expect(screen.getByTestId("scope-change-sign-name-date")).toHaveClass("font-mono");
    expect(screen.getByTestId("scope-change-sign-name-notice")).toHaveTextContent(
      "Your typed name acts as your electronic signature.",
    );

    // One character is not a name; the act stays unarmed on it.
    fireEvent.change(rule, { target: { value: "W" } });
    expect(screen.getByTestId("scope-change-approve")).toBeDisabled();

    fireEvent.change(rule, { target: { value: "Whit Vale" } });
    const target = screen.getByTestId("scope-change-approve");
    expect(target).toBeEnabled();

    // A tap is not the act: neither the press nor the click that trails it.
    fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
    fireEvent.pointerUp(target);
    fireEvent.click(target);
    expect(mutate).not.toHaveBeenCalled();

    await holdApprove();
    expect(mutate).toHaveBeenCalledTimes(1);
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

  // Finding #3 — a second studio-sent change must not become invisible.
  it("stands every pending studio-sent change, not just the first", () => {
    scopeMock.mockReturnValue({
      data: [
        { ...STUDIO_CHANGE, id: "sc-1" },
        { ...STUDIO_CHANGE, id: "sc-2", title: "Add sconces to the hallway" },
      ],
      isLoading: false,
    });
    wrap(<PendingScopeChangeAsk projectId={PROJECT_ID} />);

    expect(screen.getByText("Add a runner to the stair hall")).toBeInTheDocument();
    expect(screen.getByText("Add sconces to the hallway")).toBeInTheDocument();
  });

  // Finding #4 — new_rooms and their budgets belong on screen before a name
  // is typed against them.
  it("renders new_rooms with their budgets", () => {
    scopeMock.mockReturnValue({
      data: [
        {
          ...STUDIO_CHANGE,
          new_rooms: [{ name: "Mudroom", budgetCents: 450000 }],
        },
      ],
      isLoading: false,
    });
    wrap(<PendingScopeChangeAsk projectId={PROJECT_ID} />);

    expect(screen.getByTestId("scope-change-new-room")).toHaveTextContent(
      "Mudroom · $4,500",
    );
  });

  // Finding #5 — a reduction is a clause, not silence, and the new-total
  // sentence does not depend on any other clause firing.
  it("words a reduction to the FF&E budget, not just an addition", () => {
    scopeMock.mockReturnValue({
      data: [
        {
          ...STUDIO_CHANGE,
          additional_ffe_budget_cents: -50000,
          additional_design_fee_cents: 0,
          timeline_impact_weeks: 0,
          new_total_budget_cents: 0,
        },
      ],
      isLoading: false,
    });
    wrap(<PendingScopeChangeAsk projectId={PROJECT_ID} />);

    expect(screen.getByText(/less FF&E budget/)).toBeInTheDocument();
  });

  it("states the new project value even when no other clause fired", () => {
    scopeMock.mockReturnValue({
      data: [
        {
          ...STUDIO_CHANGE,
          additional_ffe_budget_cents: 0,
          additional_design_fee_cents: 0,
          timeline_impact_weeks: 0,
          new_total_budget_cents: 9500000,
        },
      ],
      isLoading: false,
    });
    wrap(<PendingScopeChangeAsk projectId={PROJECT_ID} />);

    expect(screen.getByText(/New project value: \$95,000\./)).toBeInTheDocument();
  });

  // Finding #21 — the counterweight act reads tertiary on this surface, not
  // the danger variant reserved for a refused act's own confirmation.
  it("never introduces a danger-variant act", () => {
    scopeMock.mockReturnValue({ data: [STUDIO_CHANGE], isLoading: false });
    const { container } = wrap(<PendingScopeChangeAsk projectId={PROJECT_ID} />);
    expect(container.querySelector('[data-action-variant="danger"]')).toBeNull();
  });
});

describe("RequestChangeAct — closed on a completed project (finding #12)", () => {
  it("renders nothing when the project is completed", () => {
    const { container } = wrap(
      <RequestChangeAct projectId={PROJECT_ID} projectStatus="completed" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the project is archived", () => {
    const { container } = wrap(
      <RequestChangeAct projectId={PROJECT_ID} projectStatus="archived" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("still offers the act for any other status", () => {
    wrap(<RequestChangeAct projectId={PROJECT_ID} projectStatus="in_progress" />);
    expect(screen.getByText("Ask for a change")).toBeInTheDocument();
  });
});

describe("RequestChangeAct — double-submit and reload-safe idempotency (findings #9, #11)", () => {
  it("does not send twice for two clicks inside one tick", async () => {
    const mutate = jest.fn();
    createMock.mockReturnValue({ mutate, isPending: false });
    wrap(<RequestChangeAct projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByTestId("request-change-mat"));
    await userEvent.type(screen.getByTestId("scope-change-title"), "A title");
    await userEvent.type(
      screen.getByTestId("scope-change-description"),
      "A description long enough to pass validation.",
    );
    const send = screen.getByTestId("scope-change-send");
    // Two rapid clicks, both landing before React Query's isPending would
    // reach a render — the ref-guard, not the disabled prop, must hold.
    await userEvent.click(send);
    await userEvent.click(send);

    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("reuses the same idempotency key across a fresh mount for the same title and description", async () => {
    let firstKey: string | undefined;
    createMock.mockReturnValue({
      mutate: jest.fn((vars) => {
        firstKey = vars.idempotencyKey;
      }),
      isPending: false,
    });
    const first = wrap(<RequestChangeAct projectId={PROJECT_ID} />);
    await userEvent.click(screen.getByTestId("request-change-mat"));
    await userEvent.type(screen.getByTestId("scope-change-title"), "A title");
    await userEvent.type(
      screen.getByTestId("scope-change-description"),
      "A description long enough to pass validation.",
    );
    await userEvent.click(screen.getByTestId("scope-change-send"));
    first.unmount();

    let secondKey: string | undefined;
    createMock.mockReturnValue({
      mutate: jest.fn((vars) => {
        secondKey = vars.idempotencyKey;
      }),
      isPending: false,
    });
    wrap(<RequestChangeAct projectId={PROJECT_ID} />);
    await userEvent.click(screen.getByTestId("request-change-mat"));
    await userEvent.type(screen.getByTestId("scope-change-title"), "A title");
    await userEvent.type(
      screen.getByTestId("scope-change-description"),
      "A description long enough to pass validation.",
    );
    await userEvent.click(screen.getByTestId("scope-change-send"));

    expect(secondKey).toBe(firstKey);
  });
});

describe("MyScopeChangeRequestsAsk — withdraw the client's own request (finding #7)", () => {
  const MY_REQUEST = {
    id: "sc-mine",
    title: "Add a bench to the entry",
    description: "A bench for shoes by the door.",
    status: "sent",
    request_origin: "client_request",
    requested_by: "client-1",
  };

  it("renders nothing without a pending client request", () => {
    scopeMock.mockReturnValue({ data: [], isLoading: false });
    const { container } = wrap(<MyScopeChangeRequestsAsk projectId={PROJECT_ID} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stands the client's own pending request with a withdraw act", () => {
    scopeMock.mockReturnValue({ data: [MY_REQUEST], isLoading: false });
    wrap(<MyScopeChangeRequestsAsk projectId={PROJECT_ID} />);

    expect(screen.getByText("Add a bench to the entry")).toBeInTheDocument();
    expect(
      screen.getByTestId("scope-change-withdraw-sc-mine"),
    ).toBeInTheDocument();
  });

  it("withdraws on click and stamps the result in place", async () => {
    const mutate = jest.fn((_vars, opts) => opts?.onSuccess?.());
    cancelMock.mockReturnValue({ mutate, isPending: false });
    scopeMock.mockReturnValue({ data: [MY_REQUEST], isLoading: false });
    wrap(<MyScopeChangeRequestsAsk projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByTestId("scope-change-withdraw-sc-mine"));

    expect(mutate).toHaveBeenCalledWith(
      { requestId: "sc-mine", projectId: PROJECT_ID },
      expect.any(Object),
    );
    expect(screen.getByTestId("my-scope-change-withdrawn")).toBeInTheDocument();
  });

  it("greys out only the request being withdrawn", () => {
    // Withdrawing one used to grey out and say "Withdrawing" on every other
    // request the client had standing.
    cancelMock.mockReturnValue({
      mutate: jest.fn(),
      isPending: true,
      variables: { requestId: "sc-mine", projectId: PROJECT_ID },
    });
    scopeMock.mockReturnValue({
      data: [MY_REQUEST, { ...MY_REQUEST, id: "sc-other", title: "A second ask" }],
      isLoading: false,
    });
    wrap(<MyScopeChangeRequestsAsk projectId={PROJECT_ID} />);

    expect(screen.getByTestId("scope-change-withdraw-sc-mine")).toBeDisabled();
    expect(screen.getByTestId("scope-change-withdraw-sc-other")).toBeEnabled();
  });

  it("does not stand a different client's request", () => {
    scopeMock.mockReturnValue({
      data: [{ ...MY_REQUEST, requested_by: "someone-else" }],
      isLoading: false,
    });
    const { container } = wrap(<MyScopeChangeRequestsAsk projectId={PROJECT_ID} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ResolvedScopeChangesPrevious — what closed, read from the row itself (finding #6)", () => {
  it("renders nothing with no resolved row", () => {
    scopeMock.mockReturnValue({
      data: [{ id: "sc-1", title: "Still pending", status: "sent" }],
      isLoading: false,
    });
    const { container } = wrap(<ResolvedScopeChangesPrevious projectId={PROJECT_ID} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("reads an approval that survives a reload — from the row, not local state", () => {
    scopeMock.mockReturnValue({
      data: [
        {
          id: "sc-1",
          title: "Add a runner to the stair hall",
          status: "approved",
          sent_at: "2026-08-01T12:00:00Z",
          approved_at: "2026-08-04T12:00:00Z",
        },
      ],
      isLoading: false,
    });
    wrap(<ResolvedScopeChangesPrevious projectId={PROJECT_ID} />);

    const line = screen.getByTestId("resolved-scope-change-line");
    expect(line).toHaveTextContent("Add a runner to the stair hall");
    expect(line).toHaveTextContent("Approved");
  });

  it("keeps studio churn out of the client's record", () => {
    // A designer amendment drafted and cancelled before it was ever sent was
    // never shown to her; it does not enter her Previously.
    scopeMock.mockReturnValue({
      data: [
        {
          id: "sc-2",
          title: "An amendment nobody sent",
          status: "cancelled",
          sent_at: null,
          request_origin: "designer_amendment",
        },
      ],
      isLoading: false,
    });
    const { container } = wrap(<ResolvedScopeChangesPrevious projectId={PROJECT_ID} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the client's own withdrawn request, sent or not", () => {
    scopeMock.mockReturnValue({
      data: [
        {
          id: "sc-3",
          title: "A request I withdrew",
          status: "cancelled",
          sent_at: null,
          request_origin: "client_request",
        },
      ],
      isLoading: false,
    });
    wrap(<ResolvedScopeChangesPrevious projectId={PROJECT_ID} />);
    expect(screen.getByTestId("resolved-scope-change-line")).toHaveTextContent(
      "A request I withdrew",
    );
  });
});
