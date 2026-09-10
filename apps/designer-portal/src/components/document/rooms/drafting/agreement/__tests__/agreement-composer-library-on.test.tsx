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
  act,
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
const mockSaveParts = jest.fn();
const mockRefetch = jest.fn();
const mockStudioContext = jest.fn();
const mockSavePart = jest.fn();

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
  // The held contract, mirrored from the primitive T1 landed: a held act keeps
  // its place in the tab order, carries `aria-disabled`, swallows the act and
  // says why instead.
  DocumentAction: ({
    children,
    actionKey: _actionKey,
    trailing: _trailing,
    variant: _variant,
    loading: _loading,
    loadingLabel: _loadingLabel,
    held,
    onHeldActivate,
    disabled,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & Record<string, any>) => (
    <button
      {...props}
      aria-disabled={disabled && held ? "true" : undefined}
      disabled={disabled && !held ? true : undefined}
      onClick={(event) => {
        if (disabled) {
          if (held) onHeldActivate?.();
          return;
        }
        onClick?.(event);
      }}
    >
      {children}
    </button>
  ),
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
  // Wave 3 reads these; the room never renders a turnkey surface with the
  // flag off, but the hooks still run, so the mock has to answer them.
  useStudioLicenseAttestation: () => ({ data: null, isLoading: false }),
  licenseAttestationIsLive: () => false,
  useAgreementJurisdictionNotices: () => ({ data: [], isLoading: false }),
  useAgreementDraws: () => ({ data: [], isLoading: false }),
  useSaveAgreementParts: () => ({
    mutateAsync: mockSaveParts,
    isPending: false,
  }),
  useMaterializeStandardParts: () => ({
    mutateAsync: jest.fn().mockResolvedValue({ parts: [] }),
    isPending: false,
  }),
  useDiscardAgreementParts: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useAgreementStudioContext: () => mockStudioContext(),
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
  useSaveAgreementPart: () => ({
    mutateAsync: mockSavePart,
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

/* Below 1248 the outline is a disclosure, and jsdom's matchMedia answers
   `false` to every query, so the suite opens it the way a laptop does. The
   nav/ul/li contract is the shipped rail's, unchanged (FS-16). */
const outline = () =>
  screen.getByRole("navigation", { name: "Agreement parts" });
const openOutline = () => {
  const toggle = within(outline()).getByRole("button", { name: "The parts" });
  if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
};
const railRows = () => {
  openOutline();
  return within(outline()).getAllByRole("listitem");
};
/** One `+ Add a part` at every seam (AX-20); they are the same act. */
const addAPart = () =>
  fireEvent.click(screen.getAllByRole("button", { name: "+ Add a part" })[0]);
const write = (title: string) =>
  fireEvent.click(screen.getByRole("button", { name: `${title} Write` }));
const startFromTemplate = () => {
  openOutline();
  fireEvent.click(
    screen.getByRole("button", { name: "Start from a template…" }),
  );
};

function renderRoom(parts = twoParts()) {
  return render(
    <AgreementComposer proposal={proposal} bundle={bundleWith(parts)} />,
  );
}

beforeEach(() => {
  seq = 0;
  mockSaveParts.mockReset();
  mockSaveParts.mockImplementation(async (parts: AgreementPart[]) =>
    bundleWith(parts.map((p, index) => ({ ...p, position: index + 1 }))),
  );
  mockMaterializeTemplate.mockReset();
  mockRefetch.mockReset();
  mockSavePart.mockReset();
  mockSavePart.mockResolvedValue({ id: "studio-part-2" });
  // R32 — the room asks the database which studio this AGREEMENT sits in, and
  // whether this reader may edit that studio's Library.
  mockStudioContext.mockReturnValue({
    data: { studioId: "studio-1", canManage: true },
  });
});

describe("the Contract Room with the Library on", () => {
  // R7 — the Library's three acts survive the galley: the two template acts
  // at the outline's foot, and `+ Add a part` at every seam of the paper.
  it("puts the Library's acts on the outline's foot and the paper's seams", () => {
    renderRoom();
    openOutline();
    expect(
      screen.getAllByRole("button", { name: "+ Add a part" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Start from a template…" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save as template…" }),
    ).toBeInTheDocument();
  });

  it("withholds Save as template… from a plain member (R3)", () => {
    mockStudioContext.mockReturnValue({
      data: { studioId: "studio-1", canManage: false },
    });
    renderRoom();
    openOutline();
    expect(
      screen.queryByRole("button", { name: "Save as template…" }),
    ).not.toBeInTheDocument();
    // Composing is not editing — the rest of the footer stands.
    expect(
      screen.getAllByRole("button", { name: "+ Add a part" }).length,
    ).toBeGreaterThan(0);
  });

  it("lays a Library part at the end of the paper", async () => {
    renderRoom();
    addAPart();

    const row = screen
      .getAllByRole("listitem")
      .find((item) => within(item).queryByText("House rules")) as HTMLElement;
    fireEvent.click(within(row).getByRole("button"));
    fireEvent.click(
      screen.getByRole("button", { name: "Add to this agreement" }),
    );

    await waitFor(() => expect(railRows()).toHaveLength(3));
    expect(within(railRows()[2]).getByText("House rules")).toBeInTheDocument();
    // §A5 "taken" — no Save control survives; the record says what stands.
    expect(screen.queryByRole("button", { name: "Save agreement" })).toBeNull();
    expect(screen.getAllByText("Not saved yet").length).toBeGreaterThan(0);
  });

  it("replaces the composition with what the table says after a Template", async () => {
    mockMaterializeTemplate.mockResolvedValue(1);
    mockRefetch.mockResolvedValue({
      data: [
        part({ partKey: "patina.services", position: 1, title: "Services" }),
      ],
    });
    renderRoom();

    startFromTemplate();
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

  /* WR-102 — `applyTemplate` replaces the composition wholesale from the
     server, so it is an act like any other and has to bump the revision. It
     did not, and a save already in the air resolved with `revision.current ===
     sentAt`, took the "the server's answer IS the paper" branch, and laid the
     PRE-template composition back over the template that had just replaced it
     — with `dirty` cleared, so the room said nothing about it. */
  it("keeps a Template laid in during a save when that save lands", async () => {
    const gate: Array<() => void> = [];
    mockSaveParts.mockImplementation(
      (sent: AgreementPart[]) =>
        new Promise((resolve) => {
          gate.push(() =>
            resolve(
              bundleWith(
                sent.map((p, index) => ({
                  ...p,
                  id: `reminted-${index}`,
                  position: index + 1,
                })),
              ),
            ),
          );
        }),
    );
    mockMaterializeTemplate.mockResolvedValue(1);
    // A part the pre-template composition does not carry, so which composition
    // is on the paper afterwards cannot be read two ways.
    mockRefetch.mockResolvedValue({
      data: [
        part({
          partKey: "studio.house-rules",
          position: 1,
          title: "House rules",
        }),
      ],
    });
    renderRoom();

    // Write, then take the act — the save leaves and the room hands straight
    // back, so the template goes in while it is still in the air.
    write("Services");
    fireEvent.change(screen.getByRole("textbox", { name: "Body" }), {
      target: { value: "Interior design services." },
    });
    openOutline();
    fireEvent.click(
      within(outline()).getByRole("button", { name: "Services" }),
    );
    await waitFor(() => expect(mockSaveParts).toHaveBeenCalledTimes(1));

    startFromTemplate();
    const row = screen
      .getAllByRole("listitem")
      .find((item) =>
        within(item).queryByText("Full-service residential"),
      ) as HTMLElement;
    fireEvent.click(within(row).getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: "Use this template" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace the parts" }));
    await waitFor(() =>
      expect(railRows().map((r) => r.textContent ?? "")).toHaveLength(1),
    );

    // The save that was carrying the OLD composition lands now.
    await act(async () => {
      gate.shift()!();
    });

    // The template is still what the agreement is made of.
    expect(
      railRows()
        .map((r) => r.textContent ?? "")
        .join(" "),
    ).toContain("House rules");
    expect(railRows()).toHaveLength(1);
    expect(
      screen.getByText(
        "The parts of Full-service residential are on this agreement.",
      ),
    ).toBeInTheDocument();
  });

  it("tells the designer a Template takes her unsaved edits with it", async () => {
    renderRoom();

    // Lay a Library part in without saving — the room is now holding a
    // composition the table has never seen.
    addAPart();
    const libraryRow = screen
      .getAllByRole("listitem")
      .find((item) => within(item).queryByText("House rules")) as HTMLElement;
    fireEvent.click(within(libraryRow).getByRole("button"));
    fireEvent.click(
      screen.getByRole("button", { name: "Add to this agreement" }),
    );
    await waitFor(() => expect(railRows()).toHaveLength(3));

    startFromTemplate();
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

    startFromTemplate();
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
    // R9's standing is the studio's word about the part, so it prints in the
    // studio's strip beside it, never on the paper.
    expect(
      within(
        screen.getByRole("complementary", { name: "The studio · Cost plus" }),
      ).getByText("record only"),
    ).toBeInTheDocument();
    // And the editor beneath says the same thing in a sentence.
    write("Cost plus");
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
    openOutline();
    expect(
      screen.queryByRole("button", { name: "Start from a template…" }),
    ).not.toBeInTheDocument();
  });

  // The Library's PARTS shelf has always said "Compose an agreement, and what
  // you write there can be kept here" while nothing in the room could keep
  // anything: `save_agreement_part`'s only caller in the portal was the
  // Library card's own rename.
  describe("keeping one part in the Library", () => {
    // The act moved with the rail's row menu: it is an act inside the open
    // part's own fold now.

    it("keeps the part the designer chose, with its own defaults", async () => {
      renderRoom([
        part({
          partKey: "custom.house-rules",
          position: 1,
          title: "House rules",
          required: true,
          clientVisible: false,
          payload: { body: "The studio's own." },
        }),
      ]);

      write("House rules");
      fireEvent.click(
        screen.getByRole("button", { name: "Keep in my Library" }),
      );

      await waitFor(() => expect(mockSavePart).toHaveBeenCalledTimes(1));
      expect(mockSavePart).toHaveBeenCalledWith({
        studioId: "studio-1",
        kind: "clause",
        variant: null,
        title: "House rules",
        payload: { body: "The studio's own." },
        requiredDefault: true,
        clientVisibleDefault: false,
      });
      await screen.findByText("House rules is in your Library.");

      // Offered once: a second keep would mint a second Library entry for the
      // same part, since `save_agreement_part` mints its own studio key. Held,
      // never natively disabled (§A5).
      expect(
        screen.getByRole("button", { name: "In your Library" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("offers the act to nobody but an owner or admin (R3)", () => {
      mockStudioContext.mockReturnValue({
        data: { studioId: "studio-1", canManage: false },
      });
      renderRoom();
      write("Services");
      expect(
        screen.queryByRole("button", { name: "Keep in my Library" }),
      ).not.toBeInTheDocument();
    });
  });
});
