import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AGREEMENT_PART_COPY } from "@patina/types";
import { ServiceAgreementDraftingRoom } from "./service-agreement-drafting-room";

const mockAttachClient = jest.fn();
const mockSaveAgreement = jest.fn();
const mockInviteAndLinkClient = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("../room-shell", () => ({
  RoomShell: ({
    action,
    children,
  }: {
    action?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      {action}
      {children}
    </div>
  ),
}));

jest.mock("../../overlays/doc-sheet", () => ({
  DocSheet: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
}));

jest.mock("../../document-action", () => ({
  DocumentAction: ({
    children,
    actionKey: _actionKey,
    trailing: _trailing,
    variant: _variant,
    loading: _loading,
    loadingLabel: _loadingLabel,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> &
    Record<string, unknown>) => <button {...props}>{children}</button>,
}));

jest.mock("@/hooks/use-attach-client", () => ({
  useAttachDocumentClient: () => ({
    mutate: mockAttachClient,
    isPending: false,
  }),
}));

jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "designer-1" },
    status: "authenticated",
  }),
}));

jest.mock("@/hooks/use-clients", () => ({
  useClients: () => ({
    isLoading: false,
    data: [
      {
        id: "manual-lead-relationship",
        designer_id: "designer-1",
        client_id: null,
        client_name: "Jordan Manual Lead",
        client_email: "jordan@example.com",
      },
      {
        id: "teammate-relationship",
        designer_id: "designer-2",
        client_id: "profile-2",
        client_name: "Teammate Client",
        client_email: "teammate@example.com",
      },
      {
        id: "linked-relationship",
        designer_id: "designer-1",
        client_id: "profile-3",
        client_name: "Linked Client",
        client_email: "linked@example.com",
      },
    ],
  }),
  useAddClient: () => ({ mutateAsync: jest.fn() }),
  useInviteAndLinkClient: () => ({ mutateAsync: mockInviteAndLinkClient }),
}));

// R17(b)/R24 — what the bundle says this agreement is made of. Empty is every
// document today and every flag-off document tomorrow.
let mockCommercialParts: unknown[] = [];
// W3R1-01 — the Room now admits a turnkey prime past draft, so this file has
// to be able to say which state the bundle is in. Every existing case leaves
// it at `draft`, which is what they were written against.
let mockCommercialState = "draft";
let mockCommercialKind = "design_services";

jest.mock("@/hooks/use-commercial-documents", () => ({
  useCommercialDocument: () => ({
    isLoading: false,
    error: null,
    data: {
      document: {
        id: "agreement-1",
        kind: mockCommercialKind,
        state: mockCommercialState,
        title: "Okafor design agreement",
        version: 1,
      },
      terms: null,
      rates: [],
      signatures: [],
      parts: mockCommercialParts,
    },
  }),
  useSaveServiceAgreement: () => ({
    mutateAsync: mockSaveAgreement,
    isPending: false,
  }),
}));

jest.mock("../../commercial/service-agreement-preview", () => ({
  ServiceAgreementPreview: () => <div>Agreement preview</div>,
}));

jest.mock("../../commercial/service-agreement-send-sheet", () => ({
  ServiceAgreementSendSheet: () => null,
}));

jest.mock("@/lib/document/room-origin", () => ({
  readRoomOrigin: () => "/desk",
  clearRoomOrigin: jest.fn(),
}));

// `agreement-parts` is fail-closed. Every case in this file is a FLAG-OFF
// case: the seven-facet room, exactly as it renders on main. The snapshot
// below was generated against the unmodified room before the flag branch
// existed — that is what makes it evidence rather than a tautology.
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

describe("ServiceAgreementDraftingRoom new agreement defaults", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommercialState = "draft";
    mockCommercialKind = "design_services";
    mockSaveAgreement.mockResolvedValue({});
    mockInviteAndLinkClient.mockResolvedValue({ profileId: "profile-1" });
    mockAttachClient.mockImplementation(
      (_input: unknown, callbacks: { onSuccess: () => void }) =>
        callbacks.onSuccess(),
    );
  });

  it("W3R1-01: never opens the seven facets over a paper that has left the studio", () => {
    // The Room admits a turnkey prime past draft so the studio can reach its
    // draw ledger. With `agreement-parts` off — this whole file's posture —
    // the composer that holds the ledger is not mounted, and seven editable
    // facets over an executed agreement would be the worse answer.
    mockCommercialKind = "design_build";
    mockCommercialState = "executed";
    render(
      <ServiceAgreementDraftingRoom
        proposal={{
          id: "agreement-1",
          designer_id: "designer-1",
          client_id: null,
          description: "Halvorsen kitchen and mudroom",
          client: null,
        }}
      />,
    );
    expect(
      screen.getByText(
        "This agreement has left the studio. Its record opens in the Contract Room.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Services & deliverables" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review & send" }),
    ).not.toBeInTheDocument();
  });

  // FLAG-OFF BYTE-IDENTITY (W1 gate). Generated on the unmodified room, then
  // re-run after the flag branch landed. If the composer ever leaks into the
  // flag-off path — or the seven facets are reformatted, reordered or
  // reworded — this diff is the alarm.
  it("renders the seven-facet room unchanged when agreement-parts is off", () => {
    const { container } = render(
      <ServiceAgreementDraftingRoom
        proposal={{
          id: "agreement-1",
          designer_id: "designer-1",
          client_id: null,
          description: "Seeded from Discovery · budget 60,000–80,000",
          client: null,
        }}
      />,
    );

    // The seven facet headings, in order — the composer renders none of them.
    expect(
      screen.getByRole("heading", { name: "Services & deliverables" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Terms" })).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it("prefills and persists the non-financial defaults from the discovery proposal", async () => {
    render(
      <ServiceAgreementDraftingRoom
        proposal={{
          id: "agreement-1",
          designer_id: "designer-1",
          client_id: null,
          description: "Seeded from Discovery · budget 60,000–80,000",
          client: null,
        }}
      />,
    );

    expect(screen.getByLabelText(/Scope of services/i)).toHaveValue(
      "Interior design services, including concept development, design documentation, and selections.",
    );
    expect(screen.getByLabelText(/Deliverables · one per line/i)).toHaveValue(
      "Concept presentation\nDesign documentation\nSelection schedules",
    );
    expect(screen.getByLabelText(/Not included · one per line/i)).toHaveValue(
      "Construction labor\nFurnishings, freight, tax, and installation",
    );
    expect(screen.getByLabelText("Role 1")).toHaveValue("Principal designer");
    expect(screen.getByRole("button", { name: "50%" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const saveButton = screen.getByRole("button", {
      name: "Save agreement",
    });
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);
    expect(mockSaveAgreement).toHaveBeenCalledWith(
      expect.objectContaining({
        terms: expect.objectContaining({
          scope:
            "Interior design services, including concept development, design documentation, and selections.",
          deliverables: [
            "Concept presentation",
            "Design documentation",
            "Selection schedules",
          ],
          exclusions: [
            "Construction labor",
            "Furnishings, freight, tax, and installation",
          ],
          furnishingsDepositPercent: 50,
        }),
      }),
    );
    expect(
      await screen.findByText("All agreement changes saved."),
    ).toBeInTheDocument();
  });

  it("invites and attaches the profileless relationship from a manual lead", async () => {
    render(
      <ServiceAgreementDraftingRoom
        proposal={{
          id: "agreement-1",
          designer_id: "designer-1",
          client_id: null,
          designer_client_id: "manual-lead-relationship",
          description: "Seeded from Discovery · budget 15,000–50,000",
          client: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Client account" }));
    expect(await screen.findByText("Jordan Manual Lead")).toBeInTheDocument();
    expect(screen.queryByText("Teammate Client")).not.toBeInTheDocument();

    // Selecting the row only arms it — it must not send on its own (J2).
    fireEvent.click(screen.getByText("Jordan Manual Lead"));
    expect(mockInviteAndLinkClient).not.toHaveBeenCalled();

    const sendButton = await screen.findByTestId(
      "client-picker-invite-send-manual-lead-relationship",
    );
    fireEvent.click(sendButton);

    await waitFor(() =>
      expect(mockInviteAndLinkClient).toHaveBeenCalledWith({
        designerClientId: "manual-lead-relationship",
        clientEmail: "jordan@example.com",
        clientName: "Jordan Manual Lead",
      }),
    );
    expect(mockAttachClient).toHaveBeenCalledWith(
      {
        engagementKind: "proposal",
        targetId: "agreement-1",
        clientId: "profile-1",
      },
      expect.any(Object),
    );
    expect(
      screen.getByText("Client account attached to this agreement."),
    ).toHaveAttribute("role", "status");
  });

  it("cancels an armed invite without sending", async () => {
    render(
      <ServiceAgreementDraftingRoom
        proposal={{
          id: "agreement-1",
          designer_id: "designer-1",
          client_id: null,
          designer_client_id: "manual-lead-relationship",
          description: "Seeded from Discovery · budget 15,000–50,000",
          client: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Client account" }));
    fireEvent.click(await screen.findByText("Jordan Manual Lead"));

    const confirmBlock = await screen.findByTestId(
      "client-picker-invite-confirm-manual-lead-relationship",
    );
    expect(confirmBlock).toBeInTheDocument();
    expect(mockInviteAndLinkClient).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByTestId(
        "client-picker-invite-cancel-manual-lead-relationship",
      ),
    );

    expect(
      screen.queryByTestId(
        "client-picker-invite-confirm-manual-lead-relationship",
      ),
    ).not.toBeInTheDocument();
    expect(mockInviteAndLinkClient).not.toHaveBeenCalled();
  });

  it("arms with a perceivable state: focus, a live announcement, and aria on the row", async () => {
    render(
      <ServiceAgreementDraftingRoom
        proposal={{
          id: "agreement-1",
          designer_id: "designer-1",
          client_id: null,
          designer_client_id: "manual-lead-relationship",
          description: "Seeded from Discovery · budget 15,000–50,000",
          client: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Client account" }));
    const row = await screen.findByTestId(
      "client-picker-option-manual-lead-relationship",
    );
    expect(row).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByText("Jordan Manual Lead"));

    const sendButton = await screen.findByTestId(
      "client-picker-invite-send-manual-lead-relationship",
    );
    // Focus follows the act, so the next keystroke is the decision.
    expect(sendButton).toHaveFocus();
    // The row itself states the change, for anyone reading it via aria.
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(row).toHaveAttribute(
      "aria-controls",
      screen.getByTestId(
        "client-picker-invite-confirm-manual-lead-relationship",
      ).id,
    );
    expect(screen.getByText("Confirm below")).toBeInTheDocument();
    // And it is announced rather than only shown.
    const status = screen.getByTestId("client-picker-invite-status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(/Invite armed for jordan@example\.com/);
  });

  it("sends the armed invite from the keyboard, despite cmdk swallowing Enter", async () => {
    render(
      <ServiceAgreementDraftingRoom
        proposal={{
          id: "agreement-1",
          designer_id: "designer-1",
          client_id: null,
          designer_client_id: "manual-lead-relationship",
          description: "Seeded from Discovery · budget 15,000–50,000",
          client: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Client account" }));
    fireEvent.click(await screen.findByText("Jordan Manual Lead"));

    const sendButton = await screen.findByTestId(
      "client-picker-invite-send-manual-lead-relationship",
    );
    // cmdk's Command root preventDefault()s Enter and re-dispatches SELECT on
    // the highlighted row, so the browser never generates this button's
    // activation click. The confirm block's own keydown handler is what makes
    // the act reachable without a mouse.
    fireEvent.keyDown(sendButton, { key: "Enter" });

    await waitFor(() =>
      expect(mockInviteAndLinkClient).toHaveBeenCalledWith({
        designerClientId: "manual-lead-relationship",
        clientEmail: "jordan@example.com",
        clientName: "Jordan Manual Lead",
      }),
    );
  });

  it("cancels the armed invite from the keyboard too", async () => {
    render(
      <ServiceAgreementDraftingRoom
        proposal={{
          id: "agreement-1",
          designer_id: "designer-1",
          client_id: null,
          designer_client_id: "manual-lead-relationship",
          description: "Seeded from Discovery · budget 15,000–50,000",
          client: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Client account" }));
    fireEvent.click(await screen.findByText("Jordan Manual Lead"));

    fireEvent.keyDown(
      await screen.findByTestId(
        "client-picker-invite-cancel-manual-lead-relationship",
      ),
      { key: " " },
    );

    await waitFor(() =>
      expect(
        screen.queryByTestId(
          "client-picker-invite-confirm-manual-lead-relationship",
        ),
      ).not.toBeInTheDocument(),
    );
    expect(mockInviteAndLinkClient).not.toHaveBeenCalled();
  });

  it("selects an already-linked client immediately, with no arm/confirm step", async () => {
    render(
      <ServiceAgreementDraftingRoom
        proposal={{
          id: "agreement-1",
          designer_id: "designer-1",
          client_id: null,
          designer_client_id: "linked-relationship",
          description: "Seeded from Discovery · budget 15,000–50,000",
          client: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Client account" }));
    fireEvent.click(await screen.findByText("Linked Client"));

    // A linkable row attaches on the single click — no invite path, no
    // confirm block, and the popover closes (the trigger now shows the
    // selected client's name instead of the placeholder combobox role).
    await waitFor(() =>
      expect(mockAttachClient).toHaveBeenCalledWith(
        {
          engagementKind: "proposal",
          targetId: "agreement-1",
          clientId: "profile-3",
        },
        expect.any(Object),
      ),
    );
    expect(mockInviteAndLinkClient).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("client-picker-invite-confirm-linked-relationship"),
    ).not.toBeInTheDocument();
  });
});

/* ── R17(b) / R24 · the co-member the flag has not reached ───────────────────
   `agreement-parts` is a per-person rollout, so a studio holds one member
   inside it and one outside. The one outside opens an agreement someone else
   composed, sees the seven facets filled from the projection, and — before
   this — could retype all of them, press Save, and have the work thrown away
   by a database refusal printed as one line of muted 11px text. The room reads
   the composition now and says so first, naming the way back.
   ────────────────────────────────────────────────────────────────────────── */

describe("ServiceAgreementDraftingRoom · an agreement composed elsewhere", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    mockCommercialParts = [];
  });

  const renderRoom = () =>
    render(
      <ServiceAgreementDraftingRoom
        proposal={{
          id: "agreement-1",
          designer_id: "designer-1",
          client_id: null,
          description: "Seeded from Discovery · budget 60,000–80,000",
          client: null,
        }}
      />,
    );

  it("says so and holds both acts when the agreement carries parts", () => {
    mockCommercialParts = [{ id: "part-1", partKey: "patina.services" }];
    renderRoom();

    expect(
      screen.getByText(AGREEMENT_PART_COPY.composedElsewhere),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Save agreement|Saved/ }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /Review/ })).toBeDisabled();
  });

  it("says nothing and holds nothing on a document with no parts", () => {
    renderRoom();

    expect(
      screen.queryByText(AGREEMENT_PART_COPY.composedElsewhere),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review/ })).toBeEnabled();
  });
});
