import { StrictMode } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { AgreementPart } from "@patina/types";
import { AgreementComposer } from "../agreement-composer";
import type { CommercialDocumentBundle } from "@/hooks/use-commercial-documents";

const mockSaveParts = jest.fn();
const mockMaterialize = jest.fn();
const mockAttachClient = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("../../../room-shell", () => ({
  RoomShell: ({
    count,
    action,
    children,
  }: {
    count?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      <p data-testid="room-count">{count}</p>
      {action}
      {children}
    </div>
  ),
}));

jest.mock("../../../../overlays/doc-sheet", () => ({
  DocSheet: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
}));

jest.mock("../../../../document-action", () => ({
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

jest.mock("@/components/portal/client-picker", () => ({
  ClientPicker: () => <div data-testid="client-picker" />,
}));

jest.mock("@/hooks/use-attach-client", () => ({
  useAttachDocumentClient: () => ({
    mutate: mockAttachClient,
    isPending: false,
  }),
}));

jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "designer-1" }, status: "authenticated" }),
}));

jest.mock("@/hooks/use-clients", () => ({
  useClients: () => ({ isLoading: false, data: [] }),
}));

jest.mock("@/hooks/use-commercial-documents", () => ({
  useSaveAgreementParts: () => ({
    mutateAsync: mockSaveParts,
    isPending: false,
  }),
  useMaterializeStandardParts: () => ({
    mutate: mockMaterialize,
    isPending: false,
  }),
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

const threeParts = () => [
  part({
    partKey: "patina.services",
    position: 1,
    title: "Services",
    required: true,
    payload: { body: "Interior design services." },
  }),
  part({
    partKey: "patina.exclusions",
    position: 2,
    kind: "list",
    title: "Exclusions",
    payload: { items: [{ id: "a", text: "Construction labor" }] },
  }),
  part({
    partKey: "patina.terms",
    position: 3,
    title: "Terms",
    required: true,
    payload: { body: "Ownership and cancellation." },
  }),
];

const railRows = () =>
  within(screen.getByRole("navigation", { name: "Agreement parts" }))
    .getAllByRole("listitem")
    .map((row) => row.textContent ?? "");

// The rail row's select button is the one control in the row with no
// aria-label of its own (Reorder/Rename/Part options all carry one).
const selectPart = (title: string) => {
  const row = within(
    screen.getByRole("navigation", { name: "Agreement parts" }),
  )
    .getAllByRole("listitem")
    .find((item) => item.textContent?.includes(title));
  if (!row) throw new Error(`No rail row for ${title}`);
  const button = within(row)
    .getAllByRole("button")
    .find((candidate) => !candidate.getAttribute("aria-label"));
  if (!button) throw new Error(`No select control for ${title}`);
  fireEvent.click(button);
};

const openRowMenu = (title: string) =>
  fireEvent.click(
    screen.getByRole("button", { name: `Part options for ${title}` }),
  );

beforeEach(() => {
  seq = 0;
  jest.clearAllMocks();
  mockSaveParts.mockImplementation(async (parts: AgreementPart[]) =>
    bundleWith(parts.map((p, index) => ({ ...p, position: index + 1 }))),
  );
});

describe("AgreementComposer · materialize", () => {
  it("seeds the standard parts once on an empty draft, even under StrictMode", async () => {
    mockMaterialize.mockImplementation(
      (_input: unknown, callbacks: { onSuccess: (b: unknown) => void }) =>
        callbacks.onSuccess(bundleWith(threeParts())),
    );

    render(
      <StrictMode>
        <AgreementComposer proposal={proposal} bundle={bundleWith([])} />
      </StrictMode>,
    );

    await waitFor(() => expect(mockMaterialize).toHaveBeenCalledTimes(1));
    expect(railRows()).toHaveLength(3);
  });

  it("does not seed an agreement that already has parts", () => {
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={bundleWith(threeParts())}
      />,
    );
    expect(mockMaterialize).not.toHaveBeenCalled();
  });

  it("does not seed an agreement that has left the studio", () => {
    const bundle = bundleWith([]);
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={{ ...bundle, document: { ...bundle.document, state: "sent" } }}
      />,
    );
    expect(mockMaterialize).not.toHaveBeenCalled();
  });
});

describe("AgreementComposer · composing", () => {
  const renderComposer = () =>
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={bundleWith(threeParts())}
      />,
    );

  it("opens clean and enables Save only once something changes", () => {
    renderComposer();
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    openRowMenu("Exclusions");
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    expect(
      screen.getByRole("button", { name: "Save agreement" }),
    ).toBeEnabled();
  });

  it("moves a part up", () => {
    renderComposer();
    expect(railRows()[0]).toContain("Services");
    openRowMenu("Terms");
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    expect(railRows().map((row) => row)).toEqual([
      expect.stringContaining("Services"),
      expect.stringContaining("Terms"),
      expect.stringContaining("Exclusions"),
    ]);
  });

  it("moves a part down", () => {
    renderComposer();
    openRowMenu("Services");
    fireEvent.click(screen.getByRole("button", { name: "Move down" }));
    expect(railRows()[0]).toContain("Exclusions");
    expect(railRows()[1]).toContain("Services");
  });

  it("removes a part, Exclusions included", () => {
    renderComposer();
    openRowMenu("Exclusions");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(railRows()).toHaveLength(2);
    expect(railRows().join(" ")).not.toContain("Exclusions");
  });

  it("renames a part", () => {
    renderComposer();
    openRowMenu("Exclusions");
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const field = screen.getByRole("textbox", { name: "Rename Exclusions" });
    fireEvent.change(field, { target: { value: "Not included" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(railRows().join(" ")).toContain("Not included");
  });

  it("adds a blank part and selects it", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "+ Add a part" }));
    fireEvent.click(screen.getByRole("button", { name: "Ceiling" }));
    expect(railRows()).toHaveLength(4);
    expect(
      screen.getByRole("region", { name: "Ceiling editor" }),
    ).toBeInTheDocument();
  });

  it("writes the whole ordered array in one call on Save", async () => {
    renderComposer();
    openRowMenu("Terms");
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save agreement" }));

    await waitFor(() => expect(mockSaveParts).toHaveBeenCalledTimes(1));
    const written = mockSaveParts.mock.calls[0][0] as AgreementPart[];
    expect(written.map((p) => p.partKey)).toEqual([
      "patina.services",
      "patina.terms",
      "patina.exclusions",
    ]);
    expect(written.map((p) => p.position)).toEqual([1, 2, 3]);
    expect(
      await screen.findByText("All agreement changes saved."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
  });

  it("keeps her on the part she was writing when Save hands back new ids", async () => {
    // `upsert_agreement_parts` is DELETE-then-INSERT and does not carry `id`
    // through (00575) — every part comes back with a fresh uuid. Re-selecting
    // by id matched nothing and dropped her onto part one after every Save.
    mockSaveParts.mockImplementation(async (written: AgreementPart[]) =>
      bundleWith(
        written.map((p, index) => ({
          ...p,
          id: `server-${index + 1}`,
          position: index + 1,
        })),
      ),
    );
    renderComposer();

    selectPart("Exclusions");
    expect(
      screen.getByRole("region", { name: "Exclusions editor" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Item 1" }), {
      target: { value: "Construction labour" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save agreement" }));

    expect(
      await screen.findByText("All agreement changes saved."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Exclusions editor" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Services editor" }),
    ).not.toBeInTheDocument();
  });

  it("edits a clause body through the editor", () => {
    renderComposer();
    const body = screen.getByRole("textbox", { name: "Body" });
    fireEvent.change(body, { target: { value: "New scope." } });
    expect(
      screen.getByRole("button", { name: "Save agreement" }),
    ).toBeEnabled();
  });
});

describe("AgreementComposer · readiness panel", () => {
  it("counts the parts that need attention, not the parts", () => {
    const parts = [
      part({
        partKey: "patina.services",
        position: 1,
        title: "Services",
        required: true,
        payload: { body: "" },
      }),
      part({
        partKey: "custom.flat",
        position: 2,
        kind: "schedule",
        variant: "flat",
        title: "Flat fee",
        payload: { cents: 1_100_000 },
      }),
    ];
    render(
      <AgreementComposer proposal={proposal} bundle={bundleWith(parts)} />,
    );
    expect(screen.getByTestId("room-count")).toHaveTextContent(
      "1 of 2 parts need attention",
    );
    expect(
      within(
        screen.getByRole("region", { name: "Agreement readiness" }),
      ).getByText("1 of 2 parts need attention"),
    ).toBeInTheDocument();
  });

  it("names the class floor when the agreement carries no fee", () => {
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={bundleWith([
          part({
            partKey: "patina.services",
            title: "Services",
            payload: { body: "Interior design services." },
          }),
        ])}
      />,
    );
    expect(
      screen.getByText(
        "This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.",
      ),
    ).toBeInTheDocument();
  });
});

describe("AgreementComposer · resilience", () => {
  it("opens an unknown kind read-only rather than throwing", () => {
    const wormhole = {
      ...part({ partKey: "custom.wormhole", position: 1, title: "Wormhole" }),
      kind: "wormhole",
      variant: "quantum",
      payload: { secret: "never printed" },
    } as unknown as AgreementPart;

    render(
      <AgreementComposer proposal={proposal} bundle={bundleWith([wormhole])} />,
    );
    expect(
      screen.getByText("wormhole · quantum", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This part opens in a later release/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/never printed/)).not.toBeInTheDocument();
  });

  it("freezes composition once the agreement has been sent (R6)", () => {
    const bundle = bundleWith(threeParts());
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={{ ...bundle, document: { ...bundle.document, state: "sent" } }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "+ Add a part" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Part options for Services" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Its parts are fixed as sent/)).toBeInTheDocument();
  });
});
