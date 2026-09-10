import { StrictMode } from "react";
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
import type { CommercialDocumentBundle } from "@/hooks/use-commercial-documents";

const mockSaveParts = jest.fn();
const mockMaterialize = jest.fn();
const mockDiscard = jest.fn();
const mockAttachClient = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// FS-12 — the galley takes neither `count` nor `action` from the shell: one
// act and one count, both on the page. The mock passes anything it is given
// so a regression that re-adds them is visible rather than swallowed.
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
      {count !== undefined && <p data-testid="room-count">{count}</p>}
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

// The held contract, mirrored from the primitive T1 landed: a held act keeps
// its place in the tab order, carries `aria-disabled`, swallows the act and
// says why instead.
jest.mock("../../../../document-action", () => ({
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

/* The outline keeps the shipped rail's contract (FS-16) — a nav named
   `Agreement parts` wrapping a ul of li — but below 1248 it is a disclosure,
   and jsdom's matchMedia answers `false` to every query, so the suite opens it
   the way a designer on a laptop does. */
const outline = () =>
  screen.getByRole("navigation", { name: "Agreement parts" });

const openOutline = () => {
  const toggle = within(outline()).getByRole("button", { name: "The parts" });
  if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
};

const railRows = () => {
  openOutline();
  return within(outline())
    .getAllByRole("listitem")
    .map((row) => row.textContent ?? "");
};

/** Unfold a part from its own head on the paper — the fold act is labelled by
 *  the head and then by itself, so its name is "Services Write". */
const write = (title: string) =>
  fireEvent.click(screen.getByRole("button", { name: `${title} Write` }));

/** Order is a part act on the paper now, not a row menu in a rail. */
const move = (title: string, direction: "up" | "down") =>
  fireEvent.click(
    screen.getByRole("button", {
      name: `${title} Move ${direction}`,
    }),
  );

/** One `+ Add a part` act at every seam (AX-20); they are the same act. */
const addAPart = () =>
  fireEvent.click(screen.getAllByRole("button", { name: "+ Add a part" })[0]);

/** The same act at a NAMED seam, in paper order: 0 is the seam above the
 *  first part, 1 the seam beneath it, and so on (walk D2). */
const addAPartAt = (seam: number) =>
  fireEvent.click(
    screen.getAllByRole("button", { name: "+ Add a part" })[seam]!,
  );

/** The record that replaced Save (§A5 "taken"). */
const record = () => screen.getAllByText(/Not saved yet|^Saved /)[0];

/** How many parts the outline says need attention. */
const attentionRows = () => {
  openOutline();
  return within(outline()).queryAllByText("needs attention").length;
};

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
  const renderComposer = (bundle = bundleWith(threeParts())) =>
    render(<AgreementComposer proposal={proposal} bundle={bundle} />);

  // §A5 "taken" — no Save control survives. The dated record line is what a
  // save leaves behind, and it says out loud when there is nothing behind it.
  it("opens with the record, not a Save control", () => {
    renderComposer();
    expect(record()).toHaveTextContent("Not saved yet");
    expect(screen.queryByRole("button", { name: "Save agreement" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Saved" })).toBeNull();
  });

  it("moves a part up", () => {
    renderComposer();
    expect(railRows()[0]).toContain("Services");
    move("Terms", "up");
    expect(railRows().map((row) => row)).toEqual([
      expect.stringContaining("Services"),
      expect.stringContaining("Terms"),
      expect.stringContaining("Exclusions"),
    ]);
  });

  it("moves a part down", () => {
    renderComposer();
    move("Services", "down");
    expect(railRows()[0]).toContain("Exclusions");
    expect(railRows()[1]).toContain("Services");
  });

  // Checks 14/15 — the move announces itself in the one status region and
  // hands focus back to the part's own control, with no pointer involved.
  it("names the part and its new place in the status region", () => {
    renderComposer();
    move("Terms", "up");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Terms is now part 2 of 3.",
    );
  });

  // Removing and renaming are acts on the open part, in its own fold — not a
  // row menu in a rail that no longer exists.
  it("removes a part, Exclusions included", () => {
    renderComposer();
    write("Exclusions");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove from this agreement" }),
    );
    expect(railRows()).toHaveLength(2);
    expect(railRows().join(" ")).not.toContain("Exclusions");
  });

  it("renames a part", () => {
    renderComposer();
    write("Exclusions");
    fireEvent.change(
      screen.getByRole("textbox", { name: "The name of this part" }),
      { target: { value: "Not included" } },
    );
    expect(railRows().join(" ")).toContain("Not included");
  });

  it("adds a blank part and unfolds it", () => {
    renderComposer();
    addAPart();
    fireEvent.click(screen.getByRole("button", { name: "Ceiling" }));
    expect(railRows()).toHaveLength(4);
    expect(
      screen.getByRole("region", { name: "Ceiling editor" }),
    ).toBeInTheDocument();
  });

  /* Walk D2 — the seam is a PLACE. A part added at the seam after part N is
     part N+1, and the parts below it move down rather than staying put; the
     whole renumbered array is what the save carries. */
  it("lands a part added at a seam directly after that seam's part", () => {
    renderComposer();
    addAPartAt(1);
    fireEvent.click(screen.getByRole("button", { name: "Ceiling" }));
    expect(railRows()).toEqual([
      expect.stringContaining("Services"),
      expect.stringContaining("Ceiling"),
      expect.stringContaining("Exclusions"),
      expect.stringContaining("Terms"),
    ]);
  });

  it("lands a part added at the seam above the paper first", () => {
    renderComposer();
    addAPartAt(0);
    fireEvent.click(screen.getByRole("button", { name: "Ceiling" }));
    expect(railRows()[0]).toContain("Ceiling");
    expect(railRows()[1]).toContain("Services");
  });

  /* The whole ordered array reaches `upsert_agreement_parts` renumbered from
     1, with the seam's part still ahead of the one laid in beneath it. */
  it("saves the seam landing as the part's position", async () => {
    renderComposer();
    addAPartAt(2);
    fireEvent.click(screen.getByRole("button", { name: "Ceiling" }));
    write("Ceiling");
    await waitFor(() => expect(mockSaveParts).toHaveBeenCalled());
    const sent = mockSaveParts.mock.calls.at(-1)![0] as AgreementPart[];
    expect(sent.map((entry) => [entry.position, entry.title])).toEqual([
      [1, "Services"],
      [2, "Exclusions"],
      [3, "Ceiling"],
      [4, "Terms"],
    ]);
  });

  // R21 — a blank money part opens with no amount at all, so the client copy
  // cannot print a figure nobody wrote and readiness holds the send.
  it("opens a new Retainer with no amount, and marks it for attention", () => {
    renderComposer();
    const before = attentionRows();
    addAPart();
    fireEvent.click(screen.getByRole("button", { name: "Retainer" }));
    expect(screen.getByLabelText(/Retainer · dollars/i)).toHaveValue("");
    expect(attentionRows()).toBe(before + 1);
  });

  it("opens a new Flat fee with no amount, and marks it for attention", () => {
    renderComposer();
    const before = attentionRows();
    addAPart();
    fireEvent.click(screen.getByRole("button", { name: "Flat fee" }));
    expect(screen.getByLabelText(/Flat fee · dollars/i)).toHaveValue("");
    expect(attentionRows()).toBe(before + 1);
  });

  // R18 — and the menu will not offer it twice.
  it("stops offering a money part once the agreement carries it", () => {
    renderComposer();
    addAPart();
    fireEvent.click(screen.getByRole("button", { name: "Retainer" }));
    addAPart();
    expect(
      screen.queryByRole("button", { name: "Retainer" }),
    ).not.toBeInTheDocument();
  });

  // No Save control survives, so closing a fold is what takes the act: one
  // whole-array `upsert_agreement_parts`, exactly as the button called it.
  it("writes the whole ordered array in one call when a fold closes", async () => {
    renderComposer();
    move("Terms", "up");
    write("Services");

    await waitFor(() => expect(mockSaveParts).toHaveBeenCalledTimes(1));
    const written = mockSaveParts.mock.calls[0][0] as AgreementPart[];
    expect(written.map((p) => p.partKey)).toEqual([
      "patina.services",
      "patina.terms",
      "patina.exclusions",
    ]);
    expect(written.map((p) => p.position)).toEqual([1, 2, 3]);
    await waitFor(() => expect(record()).toHaveTextContent(/^Saved /));
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

    write("Role rates");
    fireEvent.change(screen.getByLabelText("Lead Designer hourly rate"), {
      target: { value: "170" },
    });
    write("Role rates");

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

    write("Exclusions");
    expect(
      screen.getByRole("region", { name: "Exclusions editor" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Item 1" }), {
      target: { value: "Construction labour" },
    });
    // The move is a save behind the open fold: the part comes back with a
    // fresh uuid and the fold has to stay on the part she was writing.
    move("Exclusions", "up");
    write("Services");

    await waitFor(() => expect(mockSaveParts).toHaveBeenCalled());
    expect(
      screen.queryByRole("region", { name: "Exclusions editor" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Services editor" }),
    ).toBeInTheDocument();
  });

  /* FS-6 / R21 — a part that puts nothing on the paper prints nothing here
     either, and is still reachable: its head, its rest row and its `Write`
     act live in the studio's strip beside the gap, and the seam above it
     still offers `+ Add a part`. */
  it("prints nothing for an unwritten part, and keeps it reachable", () => {
    renderComposer(
      bundleWith([
        part({
          partKey: "patina.services",
          position: 1,
          title: "Services",
          payload: { body: "Interior design services." },
        }),
        part({
          partKey: "custom.house-rules",
          position: 2,
          title: "House rules",
          payload: { body: "" },
        }),
      ]),
    );

    const strip = screen.getByRole("complementary", {
      name: "The studio · House rules",
    });
    expect(
      within(strip).getByText(
        "Not written yet. Your client\u2019s copy does not print this part.",
      ),
    ).toBeInTheDocument();
    // The paper prints no head and no body for it…
    expect(
      screen.queryByRole("heading", { name: "House rules" }),
    ).not.toBeInTheDocument();
    // …and the fold still opens, in place, from the strip's own act.
    fireEvent.click(
      within(strip).getByRole("button", { name: "House rules Write" }),
    );
    expect(
      screen.getByRole("region", { name: "House rules editor" }),
    ).toBeInTheDocument();
    // The seam beside it is still an act (AX-20).
    expect(
      screen.getAllByRole("button", { name: "+ Add a part" }).length,
    ).toBeGreaterThan(0);
  });

  it("edits a clause body through the editor", () => {
    renderComposer();
    write("Services");
    const body = screen.getByRole("textbox", { name: "Body" });
    fireEvent.change(body, { target: { value: "New scope." } });
    expect(record()).toHaveTextContent("Not saved yet");
  });
});

describe("AgreementComposer · the readiness voice", () => {
  it("marks the rows that need attention", () => {
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
    // FS-12 — one act and one count, both on the page: the shell carries
    // neither, and the readiness aside is gone with the rail.
    expect(screen.queryByTestId("room-count")).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Agreement readiness" }),
    ).toBeNull();
    expect(attentionRows()).toBe(1);
  });

  // §A10, checks 5/6 — ONE permanent region, present at load, never empty,
  // counting things to finish rather than parts.
  it("speaks one sentence in one permanent status region", () => {
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={bundleWith(threeParts())}
      />,
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("id", "room-status");
    expect(region).toHaveTextContent(
      "One thing before this can go: name a fee.",
    );
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

/* ── WR-02 · a save must not remount the part it is saving ───────────────────
   `upsert_agreement_parts` is DELETE-then-INSERT, so every id it hands back is
   a NEW uuid. A leaf keyed on `part.id` therefore remounts on every persist,
   taking the open fold, the caret and the designer's place in the sentence
   with it (N-8 / FS-26 / §3 R2). The part KEY survives the round trip, and
   these two cases are the proof: the very DOM nodes are compared, because a
   remount that happened to restore the same value would pass a value check.
   ────────────────────────────────────────────────────────────────────────── */
describe("AgreementComposer · the open fold survives a save (N-8/FS-26)", () => {
  const remintsEveryId = () =>
    mockSaveParts.mockImplementation(async (saved: AgreementPart[]) =>
      bundleWith(
        saved.map((p, index) => ({
          ...p,
          id: `reminted-${index}-${Math.random().toString(16).slice(2)}`,
          position: index + 1,
        })),
      ),
    );

  const openServicesAndType = () => {
    write("Services");
    const body = screen.getByRole("textbox", { name: "Body" });
    body.focus();
    fireEvent.change(body, {
      target: { value: "Interior design services. ZZ" },
    });
    return {
      body,
      section: document.getElementById("part-patina-services")!,
    };
  };

  /** The outline's own row, which persists and leaves the same part open. */
  const reselectServices = () => {
    openOutline();
    fireEvent.click(
      within(outline()).getByRole("button", { name: "Services" }),
    );
  };

  it("keeps the same section and textarea nodes across a persist", async () => {
    remintsEveryId();
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={bundleWith(threeParts())}
      />,
    );

    const { body, section } = openServicesAndType();
    expect(section).toBeTruthy();

    reselectServices();
    await waitFor(() => expect(mockSaveParts).toHaveBeenCalledTimes(1));
    // The RPC really did hand back a different set of uuids.
    const returned = await mockSaveParts.mock.results[0]!.value;
    expect(returned.parts.map((p: AgreementPart) => p.id)).not.toEqual(
      threeParts().map((p) => p.id),
    );

    await waitFor(() =>
      expect(record()).not.toHaveTextContent("not yet saved"),
    );

    expect(document.getElementById("part-patina-services")).toBe(section);
    expect(
      section.isSameNode(document.getElementById("part-patina-services")),
    ).toBe(true);
    expect(screen.getByRole("textbox", { name: "Body" })).toBe(body);
  });

  it("keeps the typed clause and the caret where the designer left them", async () => {
    remintsEveryId();
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={bundleWith(threeParts())}
      />,
    );

    const { body } = openServicesAndType();
    expect(document.activeElement).toBe(body);

    reselectServices();
    await waitFor(() => expect(mockSaveParts).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(record()).not.toHaveTextContent("not yet saved"),
    );

    expect(body).toHaveValue("Interior design services. ZZ");
    expect(document.activeElement).toBe(body);
  });

  it("keeps the outline's rows across a persist too", async () => {
    remintsEveryId();
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={bundleWith(threeParts())}
      />,
    );

    openServicesAndType();
    openOutline();
    const row = within(outline()).getByRole("button", { name: "Services" });

    reselectServices();
    await waitFor(() => expect(mockSaveParts).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(record()).not.toHaveTextContent("not yet saved"),
    );

    openOutline();
    expect(within(outline()).getByRole("button", { name: "Services" })).toBe(
      row,
    );
  });
});

/* ── N-8 · a write while the save is in flight ───────────────────────────────
   `persist()` is fired WITHOUT being awaited: selecting another part starts
   the save and hands the room straight back, so the designer goes on writing
   into a composition the RPC is already carrying. `upsert_agreement_parts` is
   DELETE-then-INSERT, so the rows it answers with hold the payloads it was
   SENT under NEW uuids — and the room used to take that answer wholesale,
   which threw the writing away while the field went on showing it. The write
   has to survive, and the next save has to carry it.
   ────────────────────────────────────────────────────────────────────────── */
describe("AgreementComposer · a write during an in-flight save (N-8)", () => {
  /** The saves this suite holds open, answered one at a time. */
  const gate: Array<() => void> = [];

  const heldSaves = () => {
    let round = 0;
    mockSaveParts.mockImplementation((sent: AgreementPart[]) => {
      const answer = round;
      round += 1;
      return new Promise((resolve) => {
        gate.push(() =>
          resolve(
            bundleWith(
              sent.map((p, index) => ({
                ...p,
                // Every uuid is new, exactly as the RPC hands them back.
                id: `reminted-${answer}-${index}`,
                position: index + 1,
              })),
            ),
          ),
        );
      });
    });
  };

  const sentBody = (call: number) =>
    (mockSaveParts.mock.calls[call]![0] as AgreementPart[]).find(
      (p) => p.partKey === "patina.services",
    )?.payload as { body?: string } | undefined;

  const reselectServices = () => {
    openOutline();
    fireEvent.click(
      within(outline()).getByRole("button", { name: "Services" }),
    );
  };

  afterEach(() => {
    gate.splice(0);
  });

  it("keeps a clause typed while a save is in flight, and sends it on the next save", async () => {
    heldSaves();
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={bundleWith(threeParts())}
      />,
    );

    write("Services");
    const body = screen.getByRole("textbox", { name: "Body" });
    fireEvent.change(body, { target: { value: "The ground floor." } });

    // Selecting the part again saves behind the open fold — and does not wait.
    reselectServices();
    await waitFor(() => expect(mockSaveParts).toHaveBeenCalledTimes(1));
    expect(sentBody(0)?.body).toBe("The ground floor.");

    // The designer keeps writing while that save is in the air.
    fireEvent.change(body, {
      target: { value: "The ground floor and the stair hall." },
    });

    // The RPC lands, re-minting every id under the payloads it was sent.
    await act(async () => {
      gate.shift()!();
    });

    // The writing is still on the paper, and the paper still knows it is
    // ahead of the table.
    expect(body).toHaveValue("The ground floor and the stair hall.");
    expect(record()).toHaveTextContent("not yet saved");

    // And the next save carries it — under the ids the first save minted.
    reselectServices();
    await waitFor(() => expect(mockSaveParts).toHaveBeenCalledTimes(2));
    expect(sentBody(1)?.body).toBe("The ground floor and the stair hall.");
    expect(
      (mockSaveParts.mock.calls[1]![0] as AgreementPart[]).map((p) => p.id),
    ).toEqual(["reminted-0-0", "reminted-0-1", "reminted-0-2"]);

    await act(async () => {
      gate.shift()!();
    });
    await waitFor(() =>
      expect(record()).not.toHaveTextContent("not yet saved"),
    );
  });
});

/* ── WR-101 · two saves may not fly at once ──────────────────────────────────
   `persist()` is fired unawaited from a fold close and from the outline, so
   the room could put two `upsert_agreement_parts` calls in the air at once.
   The RPC is DELETE-then-INSERT, and when the server applied the OLDER of the
   two last, the table kept the older payload while the page kept the newer
   prose — and because the newer landing had already cleared `dirty` and the
   older landing took the stale branch, which never re-asserts it, the record
   read a clean `Saved`. A contract clause was gone with a green record.

   The room serializes now: one call in the air, at most one queued behind it,
   and a landing that is not the latest flight's is discarded. Which is why the
   inversion can no longer be composed from the page at all — the second call
   is not issued until the first is down — and that is what the first case
   pins, because the absence of the pair is the fix.
   ────────────────────────────────────────────────────────────────────────── */
describe("AgreementComposer · two saves may not fly at once (WR-101)", () => {
  /** The saves this suite holds open, landed one at a time, by hand. */
  const gate: Array<(outcome?: "reject") => void> = [];

  const heldSaves = () => {
    let round = 0;
    mockSaveParts.mockImplementation((sent: AgreementPart[]) => {
      const answer = round;
      round += 1;
      return new Promise((resolve, reject) => {
        gate.push((outcome) => {
          if (outcome === "reject") {
            // Exactly the shape PostgREST returns, carrying no sentence of its
            // own, so the room falls back to its own.
            reject({ code: "PGRST301" });
            return;
          }
          resolve(
            bundleWith(
              sent.map((p, index) => ({
                ...p,
                // Every uuid is new, exactly as the RPC hands them back.
                id: `reminted-${answer}-${index}`,
                position: index + 1,
              })),
            ),
          );
        });
      });
    });
  };

  /** Land the oldest save still in the air. */
  const land = async (outcome?: "reject") => {
    await act(async () => {
      gate.shift()!(outcome);
    });
  };

  const sentBody = (call: number) =>
    (mockSaveParts.mock.calls[call]![0] as AgreementPart[]).find(
      (p) => p.partKey === "patina.services",
    )?.payload as { body?: string } | undefined;

  /** Selecting the open part again takes the act without closing the fold. */
  const reselectServices = () => {
    openOutline();
    fireEvent.click(
      within(outline()).getByRole("button", { name: "Services" }),
    );
  };

  const refusals = () =>
    screen.queryAllByText("The agreement could not be saved.");

  const openServices = () => {
    heldSaves();
    render(
      <AgreementComposer
        proposal={proposal}
        bundle={bundleWith(threeParts())}
      />,
    );
    write("Services");
    return screen.getByRole("textbox", { name: "Body" });
  };

  afterEach(() => {
    gate.splice(0);
  });

  it("holds the second save back, so an older landing cannot bury a newer clause", async () => {
    const body = openServices();

    fireEvent.change(body, { target: { value: "The ground floor." } });
    reselectServices();
    await waitFor(() => expect(mockSaveParts).toHaveBeenCalledTimes(1));
    expect(sentBody(0)?.body).toBe("The ground floor.");

    // The designer writes on, and takes the act again while the first save is
    // still in the air.
    fireEvent.change(body, {
      target: { value: "The ground floor and the stair hall." },
    });
    reselectServices();

    // Asked for, not sent. Nothing overtakes the first call, so there is no
    // pair of calls the server could apply out of order.
    expect(mockSaveParts).toHaveBeenCalledTimes(1);

    // The first save lands, carrying only the OLDER clause.
    await land();

    // So the record may not read `Saved` on the strength of it.
    expect(record()).toHaveTextContent("not yet saved");

    // The queued save goes now, and it is the one that carries the clause the
    // paper is showing.
    expect(mockSaveParts).toHaveBeenCalledTimes(2);
    expect(sentBody(1)?.body).toBe("The ground floor and the stair hall.");

    await land();
    await waitFor(() =>
      expect(record()).not.toHaveTextContent("not yet saved"),
    );
    expect(body).toHaveValue("The ground floor and the stair hall.");
    // The last call the RPC took is the newer clause — the table and the page
    // say the same thing, which is the whole of WR-101.
    expect(sentBody(mockSaveParts.mock.calls.length - 1)?.body).toBe(
      "The ground floor and the stair hall.",
    );
  });

  it("runs a save requested mid-flight exactly once, with the latest parts", async () => {
    const body = openServices();

    fireEvent.change(body, { target: { value: "First." } });
    reselectServices();
    await waitFor(() => expect(mockSaveParts).toHaveBeenCalledTimes(1));

    // Three more acts while that save is in the air. Between them they queue
    // ONE save, not three.
    fireEvent.change(body, { target: { value: "Second." } });
    reselectServices();
    fireEvent.change(body, { target: { value: "Third." } });
    reselectServices();
    fireEvent.change(body, { target: { value: "Fourth." } });
    reselectServices();
    expect(mockSaveParts).toHaveBeenCalledTimes(1);

    await land();
    expect(mockSaveParts).toHaveBeenCalledTimes(2);
    expect(sentBody(1)?.body).toBe("Fourth.");

    await land();
    expect(mockSaveParts).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(record()).not.toHaveTextContent("not yet saved"),
    );
  });

  it("lets the queued save speak for a failed one that it succeeds behind", async () => {
    const body = openServices();

    fireEvent.change(body, { target: { value: "First." } });
    reselectServices();
    await waitFor(() => expect(mockSaveParts).toHaveBeenCalledTimes(1));

    fireEvent.change(body, { target: { value: "Second." } });
    reselectServices();

    // The first save fails with another already queued behind it.
    await land("reject");
    expect(mockSaveParts).toHaveBeenCalledTimes(2);

    // Nothing is announced. The queued save carries the same composition, and
    // it is the one that gets to say whether the agreement could be saved.
    expect(refusals()).toHaveLength(0);

    await land();
    expect(refusals()).toHaveLength(0);
    await waitFor(() =>
      expect(record()).not.toHaveTextContent("not yet saved"),
    );
  });

  it("reports the refusal in the status region when the queued save fails too", async () => {
    const body = openServices();

    fireEvent.change(body, { target: { value: "First." } });
    reselectServices();
    await waitFor(() => expect(mockSaveParts).toHaveBeenCalledTimes(1));

    fireEvent.change(body, { target: { value: "Second." } });
    reselectServices();

    await land("reject");
    await land("reject");

    // Twice on the page by design: the studio's one live region announces it,
    // and the line beside the record prints it where the save was taken.
    await waitFor(() => expect(refusals()).toHaveLength(2));
    expect(window.document.getElementById("room-status")).toHaveTextContent(
      "The agreement could not be saved.",
    );
    // Neither flight reached the table, so the agreement still has no date on
    // it at all — the record says so rather than dating a save that failed.
    expect(record()).toHaveTextContent("Not saved yet");
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

    addAPart();

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
    write("Services");
    fireEvent.change(screen.getByRole("textbox", { name: "Body" }), {
      target: { value: "Interior design services, revised." },
    });

    // §A5 — the terminal act is HELD, never natively disabled: it keeps its
    // place in the tab order and carries the reason it cannot be taken.
    const send = screen.getByRole("button", { name: /Send the agreement/ });
    expect(send).toHaveAttribute("aria-disabled", "true");
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
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
    write("Services");
    fireEvent.change(screen.getByRole("textbox", { name: "Body" }), {
      target: { value: "Interior design services, revised." },
    });

    const send = screen.getByRole("button", { name: /Send the agreement/ });
    expect(send).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(send);
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

    write("Services");
    fireEvent.change(screen.getByRole("textbox", { name: "Body" }), {
      target: { value: "Interior design services, revised." },
    });
    write("Services");

    // Twice on the page by design: the studio's one live region announces it,
    // and the line beside the record prints it where the save was taken.
    expect(
      await screen.findAllByText(
        "an agreement that bills time needs a ceiling",
      ),
    ).toHaveLength(2);
    expect(
      screen.queryByText("The agreement could not be saved."),
    ).not.toBeInTheDocument();
  });

  it("falls back to the room's own sentence when the refusal carries none", async () => {
    mockSaveParts.mockRejectedValue({ code: "PGRST301" });
    renderComposer();

    write("Services");
    fireEvent.change(screen.getByRole("textbox", { name: "Body" }), {
      target: { value: "Interior design services, revised." },
    });
    write("Services");

    expect(
      await screen.findAllByText("The agreement could not be saved."),
    ).toHaveLength(2);
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
    // W3R1-08 — the card names the part the way the paper does. The raw
    // `kind · variant` it used to print is a database key, which the binding
    // vocabulary forbids anywhere a designer reads; `PartEditor`'s own header
    // above it says what kind of part this is, in words.
    expect(screen.getAllByText("Wormhole").length).toBeGreaterThan(0);
    expect(screen.queryByText(/quantum/)).not.toBeInTheDocument();
    write("Wormhole");
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
      screen.queryByRole("button", { name: "Services Move down" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Hide from the client/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Its parts are fixed as sent/)).toBeInTheDocument();
  });
});
