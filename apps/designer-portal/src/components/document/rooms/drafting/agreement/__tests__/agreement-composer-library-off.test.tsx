/**
 * Flag-off byte-identity for Wave 2 — the composed room with
 * `agreement-library` off.
 *
 * These snapshots were generated on the Wave 1 tree, BEFORE a line of Wave 2
 * touched this folder, and committed in their own change. Every Wave 2 surface
 * sits behind `agreementParts && agreementLibrary`; with the Library flag off
 * the Contract Room must render exactly the paper Wave 1 shipped.
 *
 * A failure here is a bug, never a snapshot to update. If a later wave has a
 * ruling that deliberately moves the flag-off room, it re-pins this file with
 * that ruling named in the commit — it does not run `-u` and move on.
 *
 * The five cases are exactly the surfaces Wave 2 reaches into: the room shell
 * and rail, and the four schedule editors whose dispatch moves into
 * `schedules/` (flat, per-phase, procurement) or arrives new (a record-only
 * variant, which Wave 1 opens read-only in `UnsupportedPartCard`).
 */

import { render } from "@testing-library/react";
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
  DocumentAction: ({
    children,
    actionKey: _actionKey,
    surfaceKey: _surfaceKey,
    regionKey: _regionKey,
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
  useSaveAgreementParts: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useMaterializeStandardParts: () => ({ mutate: jest.fn(), isPending: false }),
  useDiscardAgreementParts: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useAgreementStudioContext: () => ({ data: null }),
  useAgreementParts: () => ({ data: [], refetch: jest.fn() }),
  useAgreementTemplates: () => ({ data: [], isLoading: false }),
  useStudioAgreementParts: () => ({ data: [], isLoading: false }),
  useAgreementPartEvents: () => ({ data: [], isLoading: false }),
  useSaveAgreementPart: () => ({ mutateAsync: jest.fn(), isPending: false }),
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

describe("the composed room with agreement-library off", () => {
  it("renders the rail and the standard parts exactly as Wave 1 shipped", () => {
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
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders the flat-fee editor exactly as Wave 1 shipped", () => {
    const { container } = renderRoom([
      part({
        partKey: "custom.flat",
        kind: "schedule",
        variant: "flat",
        title: "Flat fee",
        payload: { cents: 800000 },
      }),
    ]);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders the per-phase editor exactly as Wave 1 shipped", () => {
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
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders the furnishings-deposit editor exactly as Wave 1 shipped", () => {
    const { container } = renderRoom([
      part({
        partKey: "patina.deposit",
        kind: "schedule",
        variant: "procurement",
        title: "Furnishings deposit",
        payload: { depositPercent: 50 },
      }),
    ]);
    expect(container.firstChild).toMatchSnapshot();
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
    expect(container.firstChild).toMatchSnapshot();
  });
});
