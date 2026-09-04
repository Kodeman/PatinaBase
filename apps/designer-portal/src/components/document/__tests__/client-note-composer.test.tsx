/**
 * "Write to your client" (spec §6, Lane 6) — the project document's note
 * composer. Gated on the `threshold` flag (fail-closed: renders nothing
 * while loading or off — mock @/hooks/use-feature-flag per test).
 *
 * Self-sufficient (ruling 2026-09-04): the composer fetches its own open
 * proposals, trade scopes, and invoices rather than taking them as props.
 *
 * Proposal source (review fix 2026-09-04, finding 1): `proposals.project_id`
 * is NULL for furnishings authorizations minted since 00412+, so those come
 * from `useProjectInstruments` (RPC `list_furnishings_authorizations`, via
 * `@/hooks/use-commercial-documents`) rather than `useProposals`. Only
 * design_services agreements are still read through `useProposals`. This
 * suite mocks both sources and asserts the merged, instrument-shaped
 * pre-tick behaviour, plus the enclosure cap, error surfacing, the retire→
 * reopen flow, and the fail-closed notes-loading gate the review required.
 *
 * TRAPS avoided (patina-testing): never `jest.mock('@patina/help-system', …)`
 * (tsconfig alias absent from this app's jest moduleNameMapper — a silent
 * no-op); this component never reaches `@portabletext/react`, so no leaf
 * mock is needed.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ClientNoteComposer } from "../client-note-composer";

/** Byte-identical to the component's own local `CLIENT_NOTE_WRITE_EVENT` —
 *  kept as a literal here too rather than importing margin-rail.tsx into
 *  the test purely to read one string constant. */
const CLIENT_NOTE_WRITE_EVENT = "document:write";

let mockFlag: { value: boolean; isLoading: boolean };
let mockNotes:
  | Array<{
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
    }>
  | undefined;
let mockNotesLoading: boolean;
let mockAuthorizations: Array<{
  proposalId: string;
  number: number;
  state: string;
}>;
let mockDesignServicesProposals: Array<{
  id: string;
  document_kind?: string;
  status: string;
  commercial_state?: string;
}>;
let mockTradeScopes: Array<{
  proposalId: string;
  number: number;
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
  useProjectInstruments: () => ({ data: mockAuthorizations }),
  useTradeScopes: () => ({ data: mockTradeScopes }),
}));

jest.mock("@patina/supabase", () => ({
  useProjectNotes: () => ({ data: mockNotes, isLoading: mockNotesLoading }),
  useSendProjectNote: () => ({ mutate: sendMutate, isPending: sendPending }),
  useRetireProjectNote: () => ({
    mutate: retireMutate,
    isPending: retirePending,
  }),
  useProposals: () => ({ data: mockDesignServicesProposals }),
  useProjectInvoices: () => ({ data: mockInvoices }),
}));

const baseProps = {
  projectId: "project-1",
  clientFirstName: "Elena",
};

function openTheComposer() {
  fireEvent.click(screen.getByRole("button", { name: "Write to your client" }));
}

beforeEach(() => {
  mockFlag = { value: true, isLoading: false };
  mockNotes = [];
  mockNotesLoading = false;
  mockAuthorizations = [{ proposalId: "auth-1", number: 7, state: "sent" }];
  mockDesignServicesProposals = [
    {
      id: "ds-1",
      document_kind: "design_services",
      status: "sent",
      commercial_state: "sent",
    },
  ];
  mockTradeScopes = [
    {
      proposalId: "ts-1",
      number: 1,
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

  it("renders nothing while useProjectNotes is still loading, even with the flag on (fail-closed against the duplicate-note race)", () => {
    mockNotesLoading = true;
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

  it("pre-ticks an authorization (from useProjectInstruments) with the instrument-shaped label, a design services agreement (from useProposals), and a trade scope (from useTradeScopes) — invoices offered unticked", () => {
    render(<ClientNoteComposer {...baseProps} />);
    openTheComposer();

    const authBox = screen.getByRole("checkbox", {
      name: "Send it with authorization No. 7",
    });
    const dsBox = screen.getByRole("checkbox", {
      name: "Send it with the design services agreement",
    });
    const tradeScopeBox = screen.getByRole("checkbox", {
      name: "Send it with the paintwork scope",
    });
    const invoiceBox = screen.getByRole("checkbox", {
      name: "Send it with invoice No. 12",
    });

    expect(authBox).toBeChecked();
    expect(dsBox).toBeChecked();
    expect(tradeScopeBox).toBeChecked();
    expect(invoiceBox).not.toBeChecked();
  });

  it("gives a trade scope left at the generic RPC default title an ordinal label instead", () => {
    mockTradeScopes = [
      {
        proposalId: "ts-2",
        number: 3,
        title: "Trade scope",
        progressState: "substantially_complete",
      },
    ];
    render(<ClientNoteComposer {...baseProps} />);
    openTheComposer();
    expect(
      screen.getByRole("checkbox", {
        name: "Send it with the trade scope No. 3",
      }),
    ).toBeInTheDocument();
  });

  it("excludes an authorization not in state 'sent'", () => {
    mockAuthorizations = [
      { proposalId: "auth-2", number: 1, state: "executed" },
    ];
    render(<ClientNoteComposer {...baseProps} />);
    openTheComposer();
    expect(
      screen.queryByText(/Send it with authorization/),
    ).not.toBeInTheDocument();
  });

  it("excludes a design services agreement the client already signed (commercial_state client_signed)", () => {
    mockDesignServicesProposals = [
      {
        id: "ds-2",
        document_kind: "design_services",
        status: "sent",
        commercial_state: "client_signed",
      },
    ];
    render(<ClientNoteComposer {...baseProps} />);
    openTheComposer();
    expect(
      screen.queryByText(/the design services agreement/),
    ).not.toBeInTheDocument();
  });

  it("includes a design services agreement whose raw status is 'viewed' (normalizes to sent, mirroring the client's legacyStatusToCommercialState)", () => {
    mockDesignServicesProposals = [
      {
        id: "ds-3",
        document_kind: "design_services",
        status: "viewed",
      },
    ];
    render(<ClientNoteComposer {...baseProps} />);
    openTheComposer();
    expect(
      screen.getByRole("checkbox", {
        name: "Send it with the design services agreement",
      }),
    ).toBeInTheDocument();
  });

  it("excludes a trade scope that is not yet substantially complete", () => {
    mockTradeScopes = [
      {
        proposalId: "ts-3",
        number: 2,
        title: "framing scope",
        progressState: "in_progress",
      },
    ];
    render(<ClientNoteComposer {...baseProps} />);
    openTheComposer();
    expect(
      screen.queryByText(/Send it with the framing scope/),
    ).not.toBeInTheDocument();
  });

  it("excludes a draft invoice (only sent/partially_paid are open)", () => {
    mockInvoices = [{ id: "inv-draft", invoice_number: "9", status: "draft" }];
    render(<ClientNoteComposer {...baseProps} />);
    openTheComposer();
    expect(
      screen.queryByText(/Send it with invoice No\. 9/),
    ).not.toBeInTheDocument();
  });

  it("caps pre-ticked enclosures at 6 (proposals then trade scopes) and shows the cap sentence, blocking a 7th tick", () => {
    mockAuthorizations = [
      { proposalId: "a1", number: 1, state: "sent" },
      { proposalId: "a2", number: 2, state: "sent" },
      { proposalId: "a3", number: 3, state: "sent" },
      { proposalId: "a4", number: 4, state: "sent" },
    ];
    mockTradeScopes = [
      {
        proposalId: "t1",
        number: 1,
        title: "paint",
        progressState: "substantially_complete",
      },
      {
        proposalId: "t2",
        number: 2,
        title: "floors",
        progressState: "substantially_complete",
      },
      {
        proposalId: "t3",
        number: 3,
        title: "electrical",
        progressState: "substantially_complete",
      },
    ];
    mockDesignServicesProposals = [];
    render(<ClientNoteComposer {...baseProps} />);
    openTheComposer();

    const checkboxes = screen.getAllByRole("checkbox");
    const checkedCount = checkboxes.filter(
      (c) => (c as HTMLInputElement).checked,
    ).length;
    expect(checkedCount).toBe(6);
    expect(
      screen.getByText("Six enclosures is the most a note carries."),
    ).toBeInTheDocument();

    // The 7th item (electrical, t3) was not pre-ticked and cannot be ticked.
    const seventh = screen.getByRole("checkbox", {
      name: "Send it with the electrical",
    });
    expect(seventh).not.toBeChecked();
    expect(seventh).toBeDisabled();
    fireEvent.click(seventh);
    expect(seventh).not.toBeChecked();
  });

  it("Send calls the mutation with the body and serialized enclosures, and dispatches the write event", () => {
    const onWrite = jest.fn();
    window.addEventListener(CLIENT_NOTE_WRITE_EVENT, onWrite);

    render(<ClientNoteComposer {...baseProps} />);
    openTheComposer();

    fireEvent.change(screen.getByPlaceholderText(/Three last pieces/), {
      target: { value: "Sign these three and I will order Friday." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(sendMutate).toHaveBeenCalledWith(
      {
        projectId: "project-1",
        body: "Sign these three and I will order Friday.",
        enclosures: expect.arrayContaining([
          { kind: "proposal", id: "auth-1" },
          { kind: "proposal", id: "ds-1" },
          { kind: "trade_scope", id: "ts-1" },
        ]),
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    const [[callArgs]] = sendMutate.mock.calls;
    expect(callArgs.enclosures).toHaveLength(3);

    const onSuccess = sendMutate.mock.calls[0][1].onSuccess;
    act(() => {
      onSuccess();
    });
    expect(onWrite).toHaveBeenCalledTimes(1);

    window.removeEventListener(CLIENT_NOTE_WRITE_EVENT, onWrite);
  });

  it("shows the generic retry sentence on a non-RLS send error", () => {
    render(<ClientNoteComposer {...baseProps} />);
    openTheComposer();
    fireEvent.change(screen.getByPlaceholderText(/Three last pieces/), {
      target: { value: "A body." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const onError = sendMutate.mock.calls[0][1].onError;
    act(() => {
      onError(new Error("network down"));
    });
    expect(
      screen.getByText("That didn't send. Try again in a moment."),
    ).toBeInTheDocument();
  });

  it("shows the refusal sentence on an RLS (42501) send error", () => {
    render(<ClientNoteComposer {...baseProps} />);
    openTheComposer();
    fireEvent.change(screen.getByPlaceholderText(/Three last pieces/), {
      target: { value: "A body." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const onError = sendMutate.mock.calls[0][1].onError;
    act(() => {
      onError({ code: "42501", message: "permission denied" });
    });
    expect(
      screen.getByText("This project isn't yours to write to."),
    ).toBeInTheDocument();
  });

  it("disables Send while the body is blank", () => {
    render(<ClientNoteComposer {...baseProps} />);
    openTheComposer();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("disables Send when the body exceeds 2000 characters", () => {
    render(<ClientNoteComposer {...baseProps} />);
    openTheComposer();
    fireEvent.change(screen.getByPlaceholderText(/Three last pieces/), {
      target: { value: "x".repeat(2001) },
    });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it('"Never mind" closes the composer and discards the body', () => {
    render(<ClientNoteComposer {...baseProps} />);
    openTheComposer();
    fireEvent.change(screen.getByPlaceholderText(/Three last pieces/), {
      target: { value: "a draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }));
    expect(
      screen.getByRole("button", { name: "Write to your client" }),
    ).toBeInTheDocument();
    openTheComposer();
    expect(screen.getByPlaceholderText(/Three last pieces/)).toHaveValue("");
  });

  it('falls back to "A line to your client" when clientFirstName is absent', () => {
    render(<ClientNoteComposer {...baseProps} clientFirstName={null} />);
    openTheComposer();
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
        enclosures: [{ kind: "proposal", id: "auth-1" }],
        state: "standing",
        sentAt: "2026-09-04T12:00:00.000Z",
        answeredAt: null,
        retiredAt: null,
      },
    ];
  });

  it('renders the note body, the receipt line (fmtDay wording), and "Take it down" — and hides the collapsed action', () => {
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
    expect(
      screen.queryByRole("button", { name: "Write to your client" }),
    ).not.toBeInTheDocument();
  });

  it('retire calls the retire mutation, and after it resolves shows the retired receipt plus "Write to your client" again (not stuck)', () => {
    render(<ClientNoteComposer {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Take it down" }));

    expect(retireMutate).toHaveBeenCalledWith(
      { noteId: "note-1", projectId: "project-1" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    const onSuccess = retireMutate.mock.calls[0][1].onSuccess;
    act(() => {
      onSuccess();
    });

    expect(
      screen.getByText("Taken down Sep 4. It moves to Previously."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Write to your client" }),
    ).toBeInTheDocument();

    // The stale cache still reports the note as "standing" (query not yet
    // refetched) — a second render must not offer "Take it down" again.
    expect(
      screen.queryByRole("button", { name: "Take it down" }),
    ).not.toBeInTheDocument();

    // And composing again reaches the real composer, not a stuck receipt.
    fireEvent.click(
      screen.getByRole("button", { name: "Write to your client" }),
    );
    expect(
      screen.getByPlaceholderText(/Three last pieces/),
    ).toBeInTheDocument();
  });
});
