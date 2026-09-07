/**
 * The Contract Room with both Wave 2 gates on — the wiring, not the sheets.
 *
 * The picker, the template picker and Save as template… each have their own
 * spec. This one proves the room hands them what they need and does the right
 * thing with what they hand back: a Library part lands at the end of the rail,
 * a Template replaces the composition with what the table now says, and the
 * rail's footer is the Wave 2 footer rather than Wave 1's blank menu.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { AgreementPart } from "@patina/types";
import { AgreementComposer } from "../agreement-composer";
import {
  REPLACE_WARNING,
  REPLACE_WARNING_UNSAVED,
} from "../template-picker-sheet";
import type { CommercialDocumentBundle } from "@/hooks/use-commercial-documents";

const mockMaterializeTemplate = jest.fn();
const mockRefetch = jest.fn();
const mockOrganizations = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("../../../room-shell", () => ({
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

jest.mock("../../../../overlays/doc-sheet", () => ({
  DocSheet: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

jest.mock("../../../../document-action", () => ({
  DocumentAction: ({
    children,
    actionKey: _actionKey,
    trailing: _trailing,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> &
    Record<string, unknown>) => <button {...props}>{children}</button>,
}));

jest.mock("@/components/portal/client-picker", () => ({
  ClientPicker: () => <div data-testid="client-picker" />,
}));

jest.mock("@/hooks/use-attach-client", () => ({
  useAttachDocumentClient: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "designer-1" }, status: "authenticated" }),
}));

jest.mock("@/hooks/use-clients", () => ({
  useClients: () => ({ isLoading: false, data: [] }),
}));

/** Both gates on. `agreement-parts` is what renders this component at all. */
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => ({ value: true, isLoading: false }),
}));

jest.mock("@patina/supabase", () => ({
  useSaveAgreementParts: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useMaterializeStandardParts: () => ({ mutate: jest.fn(), isPending: false }),
  useDiscardAgreementParts: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useOrganizations: () => mockOrganizations(),
  useAgreementParts: () => ({ data: [], refetch: mockRefetch }),
  useMaterializeAgreementTemplate: () => ({
    mutateAsync: mockMaterializeTemplate,
    isPending: false,
  }),
  useAgreementTemplates: () => ({
    data: [
      {
        id: "t1",
        templateKey: "studio.full-service",
        kind: "studio",
        studioId: "studio-1",
        class: "design_services",
        title: "Full-service residential",
        parts: [{ kind: "clause", title: "Services", payload: {} }],
        consentKey: null,
        createdBy: null,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
    ],
    isLoading: false,
  }),
  useStudioAgreementParts: () => ({
    data: [
      {
        id: "studio-part-1",
        studioId: "studio-1",
        kind: "clause",
        variant: null,
        partKey: "studio.house-rules",
        title: "House rules",
        payload: { body: "The studio's own." },
        requiredDefault: false,
        clientVisibleDefault: true,
        createdBy: null,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
    ],
    isLoading: false,
  }),
  useSaveAgreementAsTemplate: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useAgreementPartEvents: () => ({ data: [], isLoading: false }),
}));

jest.mock("../../../../commercial/service-agreement-preview", () => ({
  ServiceAgreementPreview: () => <div>Agreement preview</div>,
}));

jest.mock("../../../../commercial/service-agreement-send-sheet", () => ({
  ServiceAgreementSendSheet: ({ open }: { open: boolean }) =>
    open ? <div>Send sheet</div> : null,
}));

jest.mock("@/lib/document/room-origin", () => ({
  readRoomOrigin: () => "/desk",
  clearRoomOrigin: jest.fn(),
}));

let seq = 0;
function part(
  input: Partial<AgreementPart> & { partKey: string },
): AgreementPart {
  seq += 1;
  return {
    id: input.id ?? `part-${seq}`,
    proposalId: "agreement-1",
    position: input.position ?? seq,
    kind: input.kind ?? "clause",
    variant: input.variant ?? null,
    title: input.title ?? "Part",
    payload: input.payload ?? {},
    required: input.required ?? false,
    clientVisible: input.clientVisible ?? true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
    partKey: input.partKey,
  };
}

const proposal = {
  id: "agreement-1",
  designer_id: "designer-1",
  client_id: null,
  client: { email: "okafor@example.com", full_name: "Ada Okafor" },
};

function bundleWith(parts: AgreementPart[]): CommercialDocumentBundle {
  return {
    document: {
      id: "agreement-1",
      projectId: null,
      kind: "design_services",
      state: "draft",
      title: "Okafor design agreement",
      version: 1,
      waveName: null,
      sentAt: null,
      executedAt: null,
      supersededAt: null,
      replacementProposalId: null,
    },
    terms: null,
    rates: [],
    signatures: [],
    parts,
  };
}

const twoParts = () => [
  part({ partKey: "patina.services", position: 1, title: "Services" }),
  part({ partKey: "patina.terms", position: 2, title: "Terms" }),
];

const railRows = () =>
  within(
    screen.getByRole("navigation", { name: "Agreement parts" }),
  ).getAllByRole("listitem");

function renderRoom(parts = twoParts()) {
  return render(
    <AgreementComposer proposal={proposal} bundle={bundleWith(parts)} />,
  );
}

beforeEach(() => {
  seq = 0;
  mockMaterializeTemplate.mockReset();
  mockRefetch.mockReset();
  mockOrganizations.mockReturnValue({
    data: [
      {
        id: "studio-1",
        type: "design_studio",
        membership: { role: "admin" },
      },
    ],
  });
});

describe("the Contract Room with the Library on", () => {
  it("puts the Library's three acts in the rail footer", () => {
    renderRoom();
    expect(
      screen.getByRole("button", { name: "+ Add a part" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start from a template…" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save as template…" }),
    ).toBeInTheDocument();
  });

  it("withholds Save as template… from a plain member (R3)", () => {
    mockOrganizations.mockReturnValue({
      data: [
        {
          id: "studio-1",
          type: "design_studio",
          membership: { role: "member" },
        },
      ],
    });
    renderRoom();
    expect(
      screen.queryByRole("button", { name: "Save as template…" }),
    ).not.toBeInTheDocument();
    // Composing is not editing — the rest of the footer stands.
    expect(
      screen.getByRole("button", { name: "+ Add a part" }),
    ).toBeInTheDocument();
  });

  it("lays a Library part at the end of the rail", async () => {
    renderRoom();
    fireEvent.click(screen.getByRole("button", { name: "+ Add a part" }));

    const row = screen
      .getAllByRole("listitem")
      .find((item) => within(item).queryByText("House rules")) as HTMLElement;
    fireEvent.click(within(row).getByRole("button"));
    fireEvent.click(
      screen.getByRole("button", { name: "Add to this agreement" }),
    );

    await waitFor(() => expect(railRows()).toHaveLength(3));
    expect(within(railRows()[2]).getByText("House rules")).toBeInTheDocument();
    // The room is now dirty and offers the save.
    expect(
      screen.getByRole("button", { name: "Save agreement" }),
    ).toBeEnabled();
  });

  it("replaces the composition with what the table says after a Template", async () => {
    mockMaterializeTemplate.mockResolvedValue(1);
    mockRefetch.mockResolvedValue({
      data: [
        part({ partKey: "patina.services", position: 1, title: "Services" }),
      ],
    });
    renderRoom();

    fireEvent.click(
      screen.getByRole("button", { name: "Start from a template…" }),
    );
    const row = screen
      .getAllByRole("listitem")
      .find((item) =>
        within(item).queryByText("Full-service residential"),
      ) as HTMLElement;
    fireEvent.click(within(row).getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: "Use this template" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace the parts" }));

    await waitFor(() =>
      // The hook binds the proposal at construction; the template key is the
      // whole of what the mutation takes (@patina/supabase).
      expect(mockMaterializeTemplate).toHaveBeenCalledWith(
        "studio.full-service",
      ),
    );
    await waitFor(() => expect(railRows()).toHaveLength(1));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(
        "The parts of Full-service residential are on this agreement.",
      ),
    ).toBeInTheDocument();
  });

  it("tells the designer a Template takes her unsaved edits with it", async () => {
    renderRoom();

    // Lay a Library part in without saving — the room is now holding a
    // composition the table has never seen.
    fireEvent.click(screen.getByRole("button", { name: "+ Add a part" }));
    const libraryRow = screen
      .getAllByRole("listitem")
      .find((item) => within(item).queryByText("House rules")) as HTMLElement;
    fireEvent.click(within(libraryRow).getByRole("button"));
    fireEvent.click(
      screen.getByRole("button", { name: "Add to this agreement" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save agreement" }),
      ).toBeEnabled(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Start from a template…" }),
    );
    const templateRow = screen
      .getAllByRole("listitem")
      .find((item) =>
        within(item).queryByText("Full-service residential"),
      ) as HTMLElement;
    fireEvent.click(within(templateRow).getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: "Use this template" }));

    expect(screen.getByText(REPLACE_WARNING_UNSAVED)).toBeInTheDocument();
    expect(screen.queryByText(REPLACE_WARNING)).not.toBeInTheDocument();
  });

  it("prints the database's refusal when a Template will not open here", async () => {
    mockMaterializeTemplate.mockRejectedValue({
      code: "42501",
      message: "template not found or not accessible",
    });
    renderRoom();

    fireEvent.click(
      screen.getByRole("button", { name: "Start from a template…" }),
    );
    const row = screen
      .getAllByRole("listitem")
      .find((item) =>
        within(item).queryByText("Full-service residential"),
      ) as HTMLElement;
    fireEvent.click(within(row).getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: "Use this template" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace the parts" }));

    expect(
      await screen.findByText("template not found or not accessible"),
    ).toBeInTheDocument();
    // The rail is untouched — a refusal replaces nothing.
    expect(railRows()).toHaveLength(2);
  });

  it("chips a schedule row with its R9 standing", () => {
    renderRoom([
      part({
        partKey: "custom.cost-plus",
        position: 1,
        kind: "schedule",
        variant: "cost_plus",
        title: "Cost plus",
        payload: { markupPercent: 18 },
      }),
    ]);
    expect(
      within(railRows()[0]).getByText("record only (R9)"),
    ).toBeInTheDocument();
    // And the editor beneath says the same thing in a sentence.
    expect(
      screen.getByText(
        "This is recorded on the agreement. It does not create billing authority yet.",
      ),
    ).toBeInTheDocument();
  });

  it("offers none of the Library once the agreement has been sent (R6)", () => {
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={{
          ...bundleWith(twoParts()),
          document: { ...bundleWith([]).document, state: "sent" },
        }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "+ Add a part" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start from a template…" }),
    ).not.toBeInTheDocument();
  });
});
