import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

jest.mock("@/hooks/use-commercial-documents", () => ({
  useCommercialDocument: () => ({
    isLoading: false,
    error: null,
    data: {
      document: {
        id: "agreement-1",
        kind: "design_services",
        state: "draft",
        title: "Okafor design agreement",
        version: 1,
      },
      terms: null,
      rates: [],
      signatures: [],
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

describe("ServiceAgreementDraftingRoom new agreement defaults", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveAgreement.mockResolvedValue({});
    mockInviteAndLinkClient.mockResolvedValue({ profileId: "profile-1" });
    mockAttachClient.mockImplementation(
      (_input: unknown, callbacks: { onSuccess: () => void }) =>
        callbacks.onSuccess(),
    );
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
      screen.getByTestId("client-picker-invite-cancel-manual-lead-relationship"),
    );

    expect(
      screen.queryByTestId(
        "client-picker-invite-confirm-manual-lead-relationship",
      ),
    ).not.toBeInTheDocument();
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
