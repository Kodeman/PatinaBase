/**
 * "Write to your client" (spec §6, Lane 6) — the project document's note
 * composer. Gated on the `threshold` flag (fail-closed: renders nothing
 * while loading or off — mock @/hooks/use-feature-flag per test).
 *
 * TRAPS avoided (patina-testing): never `jest.mock('@patina/help-system', …)`
 * (tsconfig alias absent from this app's jest moduleNameMapper — a silent
 * no-op); this component never reaches `@portabletext/react`, so no leaf
 * mock is needed.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ClientNoteComposer } from "../client-note-composer";
import { DOCUMENT_WRITE_EVENT } from "../margin-rail";

let mockFlag: { value: boolean; isLoading: boolean };
let mockNotes: Array<{
  id: string;
  projectId: string;
  authorId: string;
  body: string;
  enclosures: Array<{
    kind: "proposal" | "trade_scope" | "invoice";
    id: string;
  }>;
  state: "standing" | "answered" | "retired";
  sentAt: string;
  answeredAt: string | null;
  retiredAt: string | null;
}>;

const sendMutate = jest.fn();
const retireMutate = jest.fn();
let sendPending = false;
let retirePending = false;

jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => mockFlag,
}));

jest.mock("@patina/supabase", () => ({
  useProjectNotes: () => ({ data: mockNotes }),
  useSendProjectNote: () => ({ mutate: sendMutate, isPending: sendPending }),
  useRetireProjectNote: () => ({
    mutate: retireMutate,
    isPending: retirePending,
  }),
}));

const baseProps = {
  projectId: "project-1",
  clientFirstName: "Elena",
  openProposals: [{ id: "prop-1", title: "authorization No. 7" }],
  openTradeScopes: [{ id: "ts-1", title: "paintwork scope" }],
  openInvoices: [{ id: "inv-1", title: "invoice No. 12" }],
};

beforeEach(() => {
  mockFlag = { value: true, isLoading: false };
  mockNotes = [];
  sendMutate.mockReset();
  retireMutate.mockReset();
  sendPending = false;
  retirePending = false;
});

describe("ClientNoteComposer — flag gate", () => {
  it("renders nothing while the flag is loading", () => {
    mockFlag = { value: false, isLoading: true };
    const { container } = render(<ClientNoteComposer {...baseProps} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the flag resolves false", () => {
    mockFlag = { value: false, isLoading: false };
    const { container } = render(<ClientNoteComposer {...baseProps} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ClientNoteComposer — no standing note", () => {
  it('shows the collapsed "Write to your client" action', () => {
    render(<ClientNoteComposer {...baseProps} />);
    expect(
      screen.getByRole("button", { name: "Write to your client" }),
    ).toBeInTheDocument();
  });

  it("opening pre-ticks proposals + trade scopes and leaves invoices unticked", () => {
    render(<ClientNoteComposer {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Write to your client" }),
    );

    const proposalBox = screen.getByRole("checkbox", {
      name: "Send it with authorization No. 7",
    });
    const tradeScopeBox = screen.getByRole("checkbox", {
      name: "Send it with the paintwork scope",
    });
    const invoiceBox = screen.getByRole("checkbox", {
      name: "Send it with invoice No. 12",
    });

    expect(proposalBox).toBeChecked();
    expect(tradeScopeBox).toBeChecked();
    expect(invoiceBox).not.toBeChecked();
  });

  it("Send calls the mutation with the body and serialized enclosures, and dispatches DOCUMENT_WRITE_EVENT", () => {
    const onWrite = jest.fn();
    window.addEventListener(DOCUMENT_WRITE_EVENT, onWrite);

    render(<ClientNoteComposer {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Write to your client" }),
    );

    fireEvent.change(screen.getByPlaceholderText(/Three last pieces/), {
      target: { value: "Sign these three and I will order Friday." },
    });
    // Leave the invoice unticked (default) and send.
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(sendMutate).toHaveBeenCalledWith(
      {
        projectId: "project-1",
        body: "Sign these three and I will order Friday.",
        enclosures: expect.arrayContaining([
          { kind: "proposal", id: "prop-1" },
          { kind: "trade_scope", id: "ts-1" },
        ]),
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    // Confirm the invoice was NOT included (offered, not pre-ticked).
    const [[callArgs]] = sendMutate.mock.calls;
    expect(callArgs.enclosures).toHaveLength(2);

    // Fire the mutation's onSuccess the way react-query would, and confirm
    // the write event dispatches.
    const onSuccess = sendMutate.mock.calls[0][1].onSuccess;
    act(() => {
      onSuccess();
    });
    expect(onWrite).toHaveBeenCalledTimes(1);

    window.removeEventListener(DOCUMENT_WRITE_EVENT, onWrite);
  });

  it("disables Send while the body is blank", () => {
    render(<ClientNoteComposer {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Write to your client" }),
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("disables Send when the body exceeds 2000 characters", () => {
    render(<ClientNoteComposer {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Write to your client" }),
    );
    fireEvent.change(screen.getByPlaceholderText(/Three last pieces/), {
      target: { value: "x".repeat(2001) },
    });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it('falls back to "A line to your client" when clientFirstName is absent', () => {
    render(<ClientNoteComposer {...baseProps} clientFirstName={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Write to your client" }),
    );
    expect(screen.getByText("A line to your client")).toBeInTheDocument();
  });
});

describe("ClientNoteComposer — standing note", () => {
  beforeEach(() => {
    mockNotes = [
      {
        id: "note-1",
        projectId: "project-1",
        authorId: "author-1",
        body: "Three last pieces are ready for your signature.",
        enclosures: [{ kind: "proposal", id: "prop-1" }],
        state: "standing",
        sentAt: "2026-09-04T12:00:00.000Z",
        answeredAt: null,
        retiredAt: null,
      },
    ];
  });

  it('renders the note body, the receipt line, and "Take it down"', () => {
    render(<ClientNoteComposer {...baseProps} />);
    expect(
      screen.getByText("Three last pieces are ready for your signature."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sent 4 September. It stands on her page until she answers.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Take it down" }),
    ).toBeInTheDocument();
  });

  it("retire calls the retire mutation with the note id and project id", () => {
    render(<ClientNoteComposer {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Take it down" }));

    expect(retireMutate).toHaveBeenCalledWith(
      { noteId: "note-1", projectId: "project-1" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
