/**
 * "Write to your client" (spec §6, Lane 6) — the project document's note
 * composer. Gated on the `threshold` flag (fail-closed: renders nothing
 * while loading or off — mock @/hooks/use-feature-flag per test).
 *
 * Self-sufficient (ruling 2026-09-04): the composer fetches its own open
 * proposals (`useProposals`), trade scopes (`useTradeScopes`), and invoices
 * (`useProjectInvoices`) rather than taking them as props — this suite
 * mocks those hooks and re-asserts the pre-tick behaviour against them.
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
let mockProposals: Array<{
  id: string;
  title: string;
  status: string;
  commercial_state?: string;
}>;
let mockTradeScopes: Array<{
  proposalId: string;
  title: string;
  progressState: string;
}>;
let mockInvoices: Array<{
  id: string;
  invoice_number: string | null;
  status: string;
}>;

const sendMutate = jest.fn();
const retireMutate = jest.fn();
let sendPending = false;
let retirePending = false;

jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => mockFlag,
}));

jest.mock("@/hooks/use-commercial-documents", () => ({
  useTradeScopes: () => ({ data: mockTradeScopes }),
}));

jest.mock("@patina/supabase", () => ({
  useProjectNotes: () => ({ data: mockNotes }),
  useSendProjectNote: () => ({ mutate: sendMutate, isPending: sendPending }),
  useRetireProjectNote: () => ({
    mutate: retireMutate,
    isPending: retirePending,
  }),
  useProposals: () => ({ data: mockProposals }),
  useProjectInvoices: () => ({ data: mockInvoices }),
}));

const baseProps = {
  projectId: "project-1",
  clientFirstName: "Elena",
};

beforeEach(() => {
  mockFlag = { value: true, isLoading: false };
  mockNotes = [];
  mockProposals = [
    { id: "prop-1", title: "authorization No. 7", status: "sent" },
  ];
  mockTradeScopes = [
    {
      proposalId: "ts-1",
      title: "paintwork scope",
      progressState: "substantially_complete",
    },
  ];
  mockInvoices = [{ id: "inv-1", invoice_number: "12", status: "sent" }];
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

  it("opening pre-ticks proposals + trade scopes (from useProposals/useTradeScopes) and leaves invoices (from useProjectInvoices) unticked", () => {
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

  it("excludes a proposal whose commercial_state is executed even if status is still sent", () => {
    mockProposals = [
      {
        id: "prop-executed",
        title: "executed authorization",
        status: "sent",
        commercial_state: "executed",
      },
    ];
    render(<ClientNoteComposer {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Write to your client" }),
    );
    expect(
      screen.queryByText(/Send it with executed authorization/),
    ).not.toBeInTheDocument();
  });

  it("excludes a trade scope that is not yet substantially complete", () => {
    mockTradeScopes = [
      {
        proposalId: "ts-2",
        title: "framing scope",
        progressState: "in_progress",
      },
    ];
    render(<ClientNoteComposer {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Write to your client" }),
    );
    expect(
      screen.queryByText(/Send it with the framing scope/),
    ).not.toBeInTheDocument();
  });

  it("excludes a draft invoice (only sent/partially_paid are open)", () => {
    mockInvoices = [{ id: "inv-draft", invoice_number: "9", status: "draft" }];
    render(<ClientNoteComposer {...baseProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Write to your client" }),
    );
    expect(
      screen.queryByText(/Send it with invoice No\. 9/),
    ).not.toBeInTheDocument();
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

  it('renders the note body, the receipt line (fmtDay wording), and "Take it down"', () => {
    render(<ClientNoteComposer {...baseProps} />);
    expect(
      screen.getByText("Three last pieces are ready for your signature."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sent Sep 4. It stands on her page until she answers."),
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
