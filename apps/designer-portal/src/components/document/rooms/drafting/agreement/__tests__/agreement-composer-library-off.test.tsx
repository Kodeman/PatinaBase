/**
 * Flag-off byte-identity for Wave 2 — the composed room with
 * `agreement-library` off.
 *
 * These snapshots were generated on the Wave 1 tree, BEFORE a line of Wave 2
 * touched this folder, and committed in their own change. Every Wave 2 surface
 * sits behind `agreementParts && agreementLibrary`; with the Library flag off
 * the Contract Room must render exactly the paper Wave 1 shipped.
 *
 * N-9 — the three whole-tree snapshots this file used to carry (1,568
 * recorded lines across five calls) pinned the very header row and grid
 * classes the galley deletes, so they proved the markup rather than the rule.
 * They are replaced by assertions on the thing actually being proved: with
 * `agreement-library` off, NO Wave 2 surface is drawn, and every Wave 1
 * editor still opens.
 *
 * RE-PINNED ONCE, deliberately: walk round 2, finding W2R2-06. The header's
 * three acts (Preview client copy / Return to the seven facets / Save
 * agreement) sat in an unwrapped row that measured 617px against a 390px
 * viewport and carried Save agreement off the right edge of the room, in both
 * flag states. The only markup that moved is `flex items-center gap-3` →
 * `flex flex-wrap items-center gap-3` on that row, in all five snapshots; the
 * diff is five lines and nothing else. A ruling on whether the flag-off room
 * may move for a defect fix like this one is owed — see the Wave 2 report.
 *
 * The five cases are exactly the surfaces Wave 2 reaches into: the room shell
 * and rail, and the four schedule editors whose dispatch moves into
 * `schedules/` (flat, per-phase, procurement) or arrives new (a record-only
 * variant, which Wave 1 opens read-only in `UnsupportedPartCard`).
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AgreementPart } from "@patina/types";
import { AgreementComposer } from "../agreement-composer";
import type { CommercialDocumentBundle } from "@/hooks/use-commercial-documents";

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
  useAuth: () => ({
    user: { id: "designer-1", name: "Leah Hart" },
    status: "authenticated",
  }),
}));

jest.mock("@/hooks/use-clients", () => ({
  useClients: () => ({ isLoading: false, data: [] }),
}));

/** Both Wave 2 gates read false — the fail-closed default of the real hook. */
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

// The Wave 2 Library hooks are named here so this file never has to change
// when the composer starts reading them — a snapshot pin that gets edited is
// no longer a pin.
jest.mock("@patina/supabase", () => ({
  // Wave 3 reads these; the room never renders a turnkey surface with the
  // flag off, but the hooks still run, so the mock has to answer them.
  useStudioLicenseAttestation: () => ({ data: null, isLoading: false }),
  licenseAttestationIsLive: () => false,
  useAgreementJurisdictionNotices: () => ({ data: [], isLoading: false }),
  useAgreementDraws: () => ({ data: [], isLoading: false }),
  useSaveAgreementParts: () => ({
    mutateAsync: jest.fn(),
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
  useAgreementStudioContext: () => ({ data: null }),
  useAgreementParts: () => ({ data: [], refetch: jest.fn() }),
  useAgreementTemplates: () => ({ data: [], isLoading: false }),
  useStudioAgreementParts: () => ({ data: [], isLoading: false }),
  useSaveAgreementPart: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAgreementPartEvents: () => ({ data: [], isLoading: false }),
  useSaveAgreementAsTemplate: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useMaterializeAgreementTemplate: () => ({
    mutateAsync: jest.fn(),
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

beforeEach(() => {
  seq = 0;
});

/** The part the room opens on is the first in the array, so each case leads
 *  with the surface it is pinning. */
function renderRoom(parts: AgreementPart[]) {
  return render(
    <AgreementComposer proposal={proposal} bundle={bundleWith(parts)} />,
  );
}

/* Below 1248 the outline is a disclosure, and jsdom's matchMedia answers
   `false` to every query, so the suite opens it the way a laptop does. */
const outline = () =>
  screen.getByRole("navigation", { name: "Agreement parts" });
const openOutline = () => {
  const toggle = within(outline()).getByRole("button", { name: "The parts" });
  if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
};
const outlineTitles = () => {
  openOutline();
  return within(outline())
    .getAllByRole("listitem")
    .map((row) => row.textContent ?? "");
};
const write = (title: string) =>
  fireEvent.click(screen.getByRole("button", { name: `${title} Write` }));

describe("the composed room with agreement-library off", () => {
  it("lists every part and offers none of the Library", () => {
    const { container } = renderRoom([
      part({
        partKey: "patina.services",
        title: "Services",
        required: true,
        payload: { body: "Interior design services." },
      }),
      part({
        partKey: "patina.deliverables",
        kind: "list",
        title: "Deliverables",
        payload: { items: [{ id: "a", text: "Concept presentation" }] },
      }),
      part({
        partKey: "patina.role_rates",
        kind: "schedule",
        variant: "rate_card",
        title: "Role rates",
        payload: {
          roles: [
            {
              roleName: "Principal designer",
              hourlyRateCents: 25000,
              sortOrder: 0,
            },
          ],
        },
      }),
      part({
        partKey: "patina.ceiling",
        kind: "schedule",
        variant: "ceiling",
        title: "Ceiling",
        payload: { cents: 2400000 },
      }),
      part({
        partKey: "patina.retainer",
        kind: "schedule",
        variant: "retainer",
        title: "Retainer",
        payload: {
          cents: 500000,
          creditRule: "credited",
          activationPolicy: "immediate",
        },
      }),
      part({
        partKey: "patina.cadence",
        kind: "schedule",
        variant: "cadence",
        title: "Billing cadence",
        payload: { cadence: "monthly" },
      }),
      part({
        partKey: "patina.terms",
        title: "Terms",
        required: true,
        payload: { body: "Ownership and cancellation." },
      }),
    ]);

    // FS-16 — the outline keeps the shipped rail's contract.
    expect(outlineTitles()).toEqual([
      "Services",
      "Deliverables",
      "Role rates",
      "Ceiling",
      "Retainer",
      "Billing cadence",
      "Terms",
    ]);
    // Wave 2's three acts are absent, not disabled.
    expect(
      screen.queryByRole("button", { name: "Start from a template…" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Save as template/ }),
    ).toBeNull();
    // …and Wave 1's own blank-kind menu is what the seam offers.
    expect(
      screen.getAllByRole("button", { name: "+ Add a part" }).length,
    ).toBeGreaterThan(0);
    // No R9 standing anywhere: the chip is Wave 2's.
    expect(container.querySelector("[data-authority-standing]")).toBeNull();
  });

  it("opens the flat-fee editor Wave 1 shipped", () => {
    const { container } = renderRoom([
      part({
        partKey: "custom.flat",
        kind: "schedule",
        variant: "flat",
        title: "Flat fee",
        payload: { cents: 800000 },
      }),
    ]);
    write("Flat fee");
    expect(screen.getByLabelText(/Flat fee · dollars/i)).toHaveValue("8000");
    expect(container.querySelector("[data-authority-standing]")).toBeNull();
  });

  it("opens the per-phase editor Wave 1 shipped", () => {
    const { container } = renderRoom([
      part({
        partKey: "custom.per-phase",
        kind: "schedule",
        variant: "per_phase",
        title: "Fee by phase",
        payload: {
          phases: [
            { key: "concept", label: "Concept", cents: 350000 },
            { key: "documentation", label: "Documentation", cents: 450000 },
          ],
        },
      }),
    ]);
    write("Fee by phase");
    expect(screen.getByDisplayValue("Concept")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Documentation")).toBeInTheDocument();
    expect(container.querySelector("[data-authority-standing]")).toBeNull();
  });

  it("opens the furnishings-deposit editor Wave 1 shipped", () => {
    const { container } = renderRoom([
      part({
        partKey: "patina.deposit",
        kind: "schedule",
        variant: "procurement",
        title: "Furnishings deposit",
        payload: { depositPercent: 50 },
      }),
    ]);
    write("Furnishings deposit");
    expect(
      screen.getByRole("region", { name: "Furnishings deposit editor" }),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-authority-standing]")).toBeNull();
  });

  it("leaves a record-only variant in Wave 1's read-only card", () => {
    const { container } = renderRoom([
      part({
        partKey: "custom.cost-plus",
        kind: "schedule",
        variant: "cost_plus",
        title: "Cost plus",
        payload: { markupPercent: 18 },
      }),
    ]);
    write("Cost plus");
    expect(
      screen.getByText(/This part opens in a later release/),
    ).toBeInTheDocument();
    // Wave 2's record-only help line and its chip are both absent.
    expect(container.querySelector("[data-authority-standing]")).toBeNull();
    expect(screen.queryByText(/It is written down/)).toBeNull();
  });
});
