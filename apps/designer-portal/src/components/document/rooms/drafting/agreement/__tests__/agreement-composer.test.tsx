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
const mockDiscard = jest.fn();
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

// R23 — one data layer. The composer reads and writes the parts through
// `@patina/supabase`, so the hooks are stubbed in that factory.
jest.mock("@patina/supabase", () => ({
  useSaveAgreementParts: () => ({
    mutateAsync: mockSaveParts,
    isPending: false,
  }),
  useMaterializeStandardParts: () => ({
    mutateAsync: mockMaterialize,
    isPending: false,
  }),
  useDiscardAgreementParts: () => ({
    mutateAsync: mockDiscard,
    isPending: false,
  }),
  // Wave 2 — the room reads these to resolve the studio (R3), to re-read the
  // composition after a Template is laid in, and to mount the Library sheets.
  // With `agreement-library` off (this suite's flag mock) none of them is
  // called, but the module still has to answer.
  useAgreementStudioContext: () => ({ data: null }),
  useAgreementParts: () => ({ data: [], refetch: jest.fn() }),
  useMaterializeAgreementTemplate: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useAgreementTemplates: () => ({ data: [], isLoading: false }),
  useStudioAgreementParts: () => ({ data: [], isLoading: false }),
  useSaveAgreementAsTemplate: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useSaveAgreementPart: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAgreementPartEvents: () => ({ data: [], isLoading: false }),
}));

// Fail-closed, and this suite pins Wave 1's room: `agreement-library` off.
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
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
  // The seeding is asked for in an effect and answered a tick later, which is
  // the walk's own timing: under StrictMode React unmounts the first observer
  // between the two, and React Query drops the callbacks passed to `mutate`
  // when that happens. The rows below are the proof the room heard the answer
  // — with the callbacks form it painted "This agreement has no parts yet."
  // over nine written rows until the designer reloaded.
  const seedsThreeParts = () =>
    mockMaterialize.mockImplementation(async () => {
      await Promise.resolve();
      return bundleWith(threeParts());
    });

  it("seeds the standard parts once on an empty draft, even under StrictMode", async () => {
    seedsThreeParts();

    render(
      <StrictMode>
        <AgreementComposer proposal={proposal} bundle={bundleWith([])} />
      </StrictMode>,
    );

    await waitFor(() => expect(mockMaterialize).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(railRows()).toHaveLength(3));
  });

  it("stops saying the agreement has no parts once the seeding lands", async () => {
    seedsThreeParts();

    render(
      <StrictMode>
        <AgreementComposer proposal={proposal} bundle={bundleWith([])} />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(
        screen.queryByText("This agreement has no parts yet."),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("room-count")).toHaveTextContent(
      "of 3 parts need attention",
    );
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
  const renderComposer = (bundle = bundleWith(threeParts())) =>
    render(<AgreementComposer proposal={proposal} bundle={bundle} />);

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

  // R21 — a blank money part opens with no amount at all, so the client copy
  // cannot print a figure nobody wrote and readiness holds the send.
  const attentionCount = () =>
    Number(
      /^(\d+) of \d+ parts need attention$/.exec(
        screen.getAllByText(/parts need attention/)[0].textContent ?? "",
      )?.[1] ?? -1,
    );

  it("opens a new Retainer with no amount, and marks it for attention", () => {
    renderComposer();
    const before = attentionCount();
    fireEvent.click(screen.getByRole("button", { name: "+ Add a part" }));
    fireEvent.click(screen.getByRole("button", { name: "Retainer" }));
    expect(screen.getByLabelText(/Retainer · dollars/i)).toHaveValue("");
    expect(attentionCount()).toBe(before + 1);
  });

  it("opens a new Flat fee with no amount, and marks it for attention", () => {
    renderComposer();
    const before = attentionCount();
    fireEvent.click(screen.getByRole("button", { name: "+ Add a part" }));
    fireEvent.click(screen.getByRole("button", { name: "Flat fee" }));
    expect(screen.getByLabelText(/Flat fee · dollars/i)).toHaveValue("");
    expect(attentionCount()).toBe(before + 1);
  });

  // R18 — and the menu will not offer it twice.
  it("stops offering a money part once the agreement carries it", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "+ Add a part" }));
    fireEvent.click(screen.getByRole("button", { name: "Retainer" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add a part" }));
    expect(
      screen.queryByRole("button", { name: "Retainer" }),
    ).not.toBeInTheDocument();
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

  // B-9 — `classify_project_time_entry_authority` filters authority rates on
  // `effective_at <= started_at`, and the projection falls to now() for a role
  // that arrives with no date. A rate card the designer never touched must
  // therefore hand the date back exactly as it was seeded, or a rate written
  // for January stops applying to January's hours the moment the room is
  // opened and saved.
  it("hands a rate's effective date back untouched when the designer edits another part", async () => {
    renderComposer(
      bundleWith([
        part({
          partKey: "patina.role_rates",
          position: 1,
          kind: "schedule",
          variant: "rate_card",
          title: "Role rates",
          payload: {
            roles: [
              {
                roleName: "Lead Designer",
                hourlyRateCents: 15_000,
                sortOrder: 0,
                effectiveAt: "2026-01-01T00:00:00.000Z",
              },
            ],
          },
        }),
        part({
          partKey: "patina.terms",
          position: 2,
          title: "Terms",
          required: true,
          payload: { body: "Ownership and cancellation." },
        }),
      ]),
    );

    selectPart("Role rates");
    fireEvent.change(screen.getByLabelText("Lead Designer hourly rate"), {
      target: { value: "170" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save agreement" }));

    await waitFor(() => expect(mockSaveParts).toHaveBeenCalledTimes(1));
    const written = mockSaveParts.mock.calls[0][0] as AgreementPart[];
    const roles = (written[0].payload as { roles: Record<string, unknown>[] })
      .roles;
    expect(roles[0].hourlyRateCents).toBe(17_000);
    expect(roles[0].effectiveAt).toBe("2026-01-01T00:00:00.000Z");
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

/* ── R29 · the two-click duplicate-variant path ──────────────────────────────
   The designer lane's N1: from a materialized agreement, two clicks reached a
   save the server cannot accept — "an agreement carries only one ceiling"
   (23514) — with readiness green and nothing covering it. R18 closed the first
   click (the Add menu no longer offers a money variant the agreement already
   carries) and R29 pins BOTH ends of it: the menu does not name the act, and a
   duplicate that arrives any other way is reported and holds the save.
   ────────────────────────────────────────────────────────────────────────── */

describe("AgreementComposer · one part per money variant (R18/R29)", () => {
  const ceiling = (id: string, position: number) =>
    part({
      id,
      partKey: position === 4 ? "patina.ceiling" : `custom.ceiling-${id}`,
      position,
      kind: "schedule",
      variant: "ceiling",
      title: "Ceiling",
      payload: { cents: 2_400_000 },
    });

  it("does not offer a second ceiling once the agreement carries one", () => {
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={bundleWith([...threeParts(), ceiling("ceiling-1", 4)])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Add a part" }));

    expect(screen.queryByRole("button", { name: "Ceiling" })).toBeNull();
    // The menu is open and offering the parts that are still addable, so the
    // absence above is a filter and not an unopened menu.
    expect(screen.getByRole("button", { name: "Clause" })).toBeInTheDocument();
  });

  it("reports a duplicate money part and holds the save (R29)", () => {
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={bundleWith([
          ...threeParts(),
          ceiling("ceiling-1", 4),
          ceiling("ceiling-2", 5),
        ])}
      />,
    );

    expect(
      screen.getByText("An agreement carries only one ceiling."),
    ).toBeInTheDocument();

    // Make the composition dirty, so nothing but the duplicate can be what
    // holds the act.
    fireEvent.change(screen.getByRole("textbox", { name: "Body" }), {
      target: { value: "Interior design services, revised." },
    });

    expect(
      screen.getByRole("button", { name: "Save agreement" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /Review/ })).toBeDisabled();
    expect(mockSaveParts).not.toHaveBeenCalled();
  });
});

/* ── The walk's M2 and M6 ───────────────────────────────────────────────────
   M6: a rate card carrying one named role and one blank one read green, the
   Save was offered, and `every role on the rate card needs a name` (23514)
   came back. M2: whatever the database refused with, the room printed "The
   agreement could not be saved." — PostgREST hands react-query a plain object,
   not an `Error`, so the branch that read `.message` never fired.
   ────────────────────────────────────────────────────────────────────────── */

describe("AgreementComposer · the refusals the room says first", () => {
  const renderComposer = (bundle = bundleWith(threeParts())) =>
    render(<AgreementComposer proposal={proposal} bundle={bundle} />);
  const rateCard = (roles: Record<string, unknown>[]) =>
    part({
      partKey: "patina.role_rates",
      position: 4,
      kind: "schedule",
      variant: "rate_card",
      title: "Role rates",
      payload: { roles },
    });

  it("reports a role left unnamed and holds the save (M6)", () => {
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={bundleWith([
          ...threeParts(),
          rateCard([
            {
              roleName: "Lead Designer",
              hourlyRateCents: 22_500,
              sortOrder: 0,
            },
            { roleName: "", hourlyRateCents: 15_000, sortOrder: 1 },
          ]),
        ])}
      />,
    );

    expect(
      screen.getByText("Every role on the rate card needs a name."),
    ).toBeInTheDocument();

    // Dirty, so nothing but the blank role can be what holds the act.
    fireEvent.change(screen.getByRole("textbox", { name: "Body" }), {
      target: { value: "Interior design services, revised." },
    });

    expect(
      screen.getByRole("button", { name: "Save agreement" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /Review/ })).toBeDisabled();
    expect(mockSaveParts).not.toHaveBeenCalled();
  });

  it("prints the sentence the database refused with, not its own (M2)", async () => {
    // Exactly the shape PostgREST returns: a plain object, never an Error.
    mockSaveParts.mockRejectedValue({
      code: "23514",
      message: "an agreement that bills time needs a ceiling",
      details: null,
      hint: null,
    });
    renderComposer();

    fireEvent.change(screen.getByRole("textbox", { name: "Body" }), {
      target: { value: "Interior design services, revised." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save agreement" }));

    expect(
      await screen.findByText("an agreement that bills time needs a ceiling"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("The agreement could not be saved."),
    ).not.toBeInTheDocument();
  });

  it("falls back to the room's own sentence when the refusal carries none", async () => {
    mockSaveParts.mockRejectedValue({ code: "PGRST301" });
    renderComposer();

    fireEvent.change(screen.getByRole("textbox", { name: "Body" }), {
      target: { value: "Interior design services, revised." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save agreement" }));

    expect(
      await screen.findByText("The agreement could not be saved."),
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
