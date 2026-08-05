import { fireEvent, render, screen } from "@testing-library/react";

let mockInstruments: Record<string, unknown> = {
  isLoading: false,
  error: null,
  data: [],
};

jest.mock("@/hooks/use-commercial-documents", () => ({
  useProjectInstruments: () => mockInstruments,
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

describe("AuthorizationsLedger", () => {
  beforeEach(() => {
    mockInstruments = { isLoading: false, error: null, data: [] };
  });

  it("shows the empty state when there are no authorizations yet", () => {
    render(<AuthorizationsLedger projectId="project-1" />);
    expect(screen.getByText("No furnishings authorizations yet.")).toBeVisible();
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
});
