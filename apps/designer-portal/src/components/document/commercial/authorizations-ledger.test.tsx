import { fireEvent, render, screen } from "@testing-library/react";

let mockInstruments: Record<string, unknown> = {
  isLoading: false,
  error: null,
  data: [],
};
let mockTradeScopes: Record<string, unknown> = {
  isLoading: false,
  error: null,
  data: [],
};

jest.mock("@/hooks/use-commercial-documents", () => ({
  useProjectInstruments: () => mockInstruments,
  useTradeScopes: () => mockTradeScopes,
}));

jest.mock("./authorization-detail", () => ({
  AuthorizationDetail: ({
    open,
    instrument,
  }: {
    open: boolean;
    instrument: { name: string } | null;
  }) =>
    open ? <div data-testid="authorization-detail">{instrument?.name}</div> : null,
}));

jest.mock("./trade/trade-scope-detail", () => ({
  TradeScopeDetail: ({
    open,
    scope,
  }: {
    open: boolean;
    scope: { title: string } | null;
  }) => (open ? <div data-testid="trade-scope-detail">{scope?.title}</div> : null),
}));

jest.mock("./trade/trade-scope-draft-sheet", () => ({
  TradeScopeDraftSheet: ({
    open,
    proposalId,
  }: {
    open: boolean;
    proposalId: string | null;
  }) =>
    open ? (
      <div data-testid="trade-scope-draft">{proposalId ?? "new"}</div>
    ) : null,
}));

import { AuthorizationsLedger } from "./authorizations-ledger";

const instrument = (overrides: Record<string, unknown> = {}) => ({
  documentId: "doc-1",
  proposalId: "proposal-1",
  number: 1,
  name: "Living Room Essentials",
  kind: "furnishings_authorization",
  state: "sent",
  totalAmountCents: 200_000,
  depositPercent: 50,
  depositRequiredCents: 100_000,
  depositInvoiceId: null,
  depositPaid: false,
  checkpointId: "checkpoint-1",
  coveredRoomIds: [],
  executedAt: null,
  sentAt: "2026-08-03T12:00:00Z",
  proposalSendDispatchId: "dispatch-1",
  supersededByNumber: null,
  itemCount: 3,
  items: [],
  ...overrides,
});

const tradeScope = (overrides: Record<string, unknown> = {}) => ({
  documentId: "pcd-1",
  proposalId: "trade-proposal-1",
  number: 1,
  title: "Drapery fabrication & install",
  state: "executed",
  progressState: "in_progress",
  partyDisplayName: "Atelier Marchand",
  clientPriceCents: 680_000,
  currency: "USD",
  depositInvoiceId: "invoice-1",
  depositPaid: true,
  draws: [],
  drawCount: 2,
  drawsIssued: 1,
  drawsPaid: 1,
  sectionRoomIds: ["room-1", "room-2"],
  sectionCount: 2,
  ...overrides,
});

describe("AuthorizationsLedger", () => {
  beforeEach(() => {
    mockInstruments = { isLoading: false, error: null, data: [] };
    mockTradeScopes = { isLoading: false, error: null, data: [] };
  });

  it("shows the empty state when there are no instruments yet", () => {
    render(<AuthorizationsLedger projectId="project-1" />);
    expect(screen.getByText("No authorizations recorded yet")).toBeVisible();
    expect(screen.getByRole("button", { name: "Draft a trade scope" })).toBeVisible();
  });

  it("lists each instrument as Authorization № N · name / Lines / Total / State", () => {
    mockInstruments = {
      isLoading: false,
      error: null,
      data: [instrument()],
    };
    render(<AuthorizationsLedger projectId="project-1" />);

    expect(
      screen.getByText("Authorization № 1 · Living Room Essentials"),
    ).toBeVisible();
    expect(screen.getByText("A1")).toBeVisible(); // kind mark
    expect(screen.getByText("3")).toBeVisible(); // lines
    expect(screen.getByText("$2,000")).toBeVisible(); // total
    expect(screen.getByText("Sent")).toBeVisible(); // state
  });

  it("reads a superseded (voided) instrument's state as 'Void · superseded'", () => {
    mockInstruments = {
      isLoading: false,
      error: null,
      data: [instrument({ state: "superseded", supersededByNumber: 2 })],
    };
    render(<AuthorizationsLedger projectId="project-1" />);

    expect(screen.getByText("Void · superseded")).toBeVisible();
    expect(screen.getByText(/superseded by № 2/)).toBeVisible();
  });

  it("opens AuthorizationDetail for the clicked row", () => {
    mockInstruments = {
      isLoading: false,
      error: null,
      data: [instrument(), instrument({ documentId: "doc-2", proposalId: "proposal-2", number: 2, name: "Bedroom Lighting" })],
    };
    render(<AuthorizationsLedger projectId="project-1" />);

    expect(screen.queryByTestId("authorization-detail")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByText("Authorization № 2 · Bedroom Lighting"),
    );
    expect(screen.getByTestId("authorization-detail")).toHaveTextContent(
      "Bedroom Lighting",
    );
  });

  it("carries trade scopes on the same ledger under their own TS marks", () => {
    mockInstruments = { isLoading: false, error: null, data: [instrument()] };
    mockTradeScopes = { isLoading: false, error: null, data: [tradeScope()] };
    render(<AuthorizationsLedger projectId="project-1" />);

    expect(screen.getByText("A1")).toBeVisible();
    expect(screen.getByText("TS1")).toBeVisible();
    expect(
      screen.getByText("Trade scope № 1 · Drapery fabrication & install"),
    ).toBeVisible();
    expect(screen.getByText("$6,800")).toBeVisible();
    expect(screen.getByText("Authorized")).toBeVisible();
    expect(screen.getByText(/In progress/)).toBeVisible();
  });

  // A section names a room, not the reverse — a scope can carry more
  // sections than distinct rooms (two sections in the same room) or a
  // section naming no room at all. "Lines" must read the section count, not
  // the deduped room list, or a multi-section scope understates itself.
  it("shows the section count as Lines, not the deduped room count", () => {
    mockTradeScopes = {
      isLoading: false,
      error: null,
      data: [
        tradeScope({
          sectionRoomIds: ["room-1", "room-2"], // 2 distinct rooms
          sectionCount: 3, // but 3 sections (two of them share room-1)
        }),
      ],
    };
    render(<AuthorizationsLedger projectId="project-1" />);

    expect(screen.getByText("TS1")).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("opens the live trade document for a released scope", () => {
    mockTradeScopes = { isLoading: false, error: null, data: [tradeScope()] };
    render(<AuthorizationsLedger projectId="project-1" />);

    fireEvent.click(
      screen.getByText("Trade scope № 1 · Drapery fabrication & install"),
    );
    expect(screen.getByTestId("trade-scope-detail")).toHaveTextContent(
      "Drapery fabrication & install",
    );
    expect(screen.queryByTestId("trade-scope-draft")).not.toBeInTheDocument();
  });

  it("opens the draft sheet for a scope still being written", () => {
    mockTradeScopes = {
      isLoading: false,
      error: null,
      data: [tradeScope({ state: "draft", progressState: "none" })],
    };
    render(<AuthorizationsLedger projectId="project-1" />);

    fireEvent.click(
      screen.getByText("Trade scope № 1 · Drapery fabrication & install"),
    );
    expect(screen.getByTestId("trade-scope-draft")).toHaveTextContent(
      "trade-proposal-1",
    );
    expect(screen.queryByTestId("trade-scope-detail")).not.toBeInTheDocument();
  });

  it("drafts a new trade scope from the head act", () => {
    render(<AuthorizationsLedger projectId="project-1" />);

    expect(screen.queryByTestId("trade-scope-draft")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Draft a trade scope"));
    expect(screen.getByTestId("trade-scope-draft")).toHaveTextContent("new");
  });

  it("lets the two reads fail independently, and says so independently", () => {
    mockInstruments = { isLoading: false, error: null, data: [instrument()] };
    mockTradeScopes = {
      isLoading: false,
      error: new Error("no such function"),
      data: undefined,
    };
    render(<AuthorizationsLedger projectId="project-1" />);

    // The furnishings ledger still reads, because it still answered.
    expect(
      screen.getByText("Authorization № 1 · Living Room Essentials"),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Trade scopes are unavailable.",
    );
    expect(screen.queryByText("Authorizations are unavailable.")).toBeNull();
  });

  it("says authorizations are unavailable when that read fails", () => {
    mockInstruments = {
      isLoading: false,
      error: new Error("nope"),
      data: undefined,
    };
    render(<AuthorizationsLedger projectId="project-1" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Authorizations are unavailable.",
    );
  });

  // D-B39/W5-R3 — the loading pulse prints inline, as the last child of the
  // ledger's own title line ("Authorizations & trade scopes"), never as a
  // separate row beneath it: the title's text is unchanged whether the
  // ledger is loading or loaded, and no second loading row exists.
  it("prints the loading pulse inline in the ledger's title line, never as a separate row (D-B39/W5-R3)", () => {
    mockInstruments = { isLoading: true, error: null, data: [] };
    mockTradeScopes = { isLoading: false, error: null, data: [] };
    const { rerender } = render(<AuthorizationsLedger projectId="project-1" />);

    const titleLine = () =>
      screen.getByText("Authorizations & trade scopes", { exact: false });
    const visibleText = (el: HTMLElement) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(".sr-only, [aria-hidden]").forEach((n) => n.remove());
      return clone.textContent?.trim();
    };

    const titleLoading = titleLine();
    const classesLoading = titleLoading.className;
    const textLoading = visibleText(titleLoading);
    expect(screen.getByText("Loading authorizations")).toBeInTheDocument();
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);

    mockInstruments = { isLoading: false, error: null, data: [] };
    rerender(<AuthorizationsLedger projectId="project-1" />);

    const titleLoaded = titleLine();
    expect(visibleText(titleLoaded)).toBe(textLoading);
    expect(titleLoaded.className).toBe(classesLoading);
    expect(screen.queryByText("Loading authorizations")).not.toBeInTheDocument();
  });
});
