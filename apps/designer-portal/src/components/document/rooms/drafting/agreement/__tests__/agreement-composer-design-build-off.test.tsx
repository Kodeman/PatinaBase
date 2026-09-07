/**
 * Flag-off byte-identity for Wave 3 — the composed room with `design-build`
 * off and both Wave 2 gates on.
 *
 * These snapshots were generated on the Wave 2 tree, BEFORE a line of Wave 3
 * touched this folder, and committed in their own change. Every Wave 3
 * surface sits behind `agreementParts && agreementLibrary && designBuild`;
 * with the turnkey flag off the Contract Room must render exactly the paper
 * Wave 2 shipped.
 *
 * A failure here is a bug, never a snapshot to update. If a later wave has a
 * ruling that deliberately moves the flag-off room, it re-pins this file with
 * that ruling named in the commit — it does not run `-u` and move on.
 *
 * The cases are the surfaces Wave 3 reaches into: the room shell and rail
 * (the R39 visibility act lands on the row menu and the editor), the rail
 * with a part hidden from the client, and the three turnkey schedule
 * variants — `pricing_basis`, `draws`, `allowances` — which Wave 2 opens
 * read-only in `UnsupportedPartCard` and Wave 3 gives editors to only behind
 * the flag.
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

/**
 * Wave 2's two gates on, Wave 3's gate off — the state every studio the
 * `agreement-library` rollout has already reached is in on the day Wave 3
 * ships, and the state the whole world is in until Kody widens the new flag.
 */
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag !== "design-build",
    isLoading: false,
  }),
}));

// Every hook the room reads, Wave 3's included, is named here so this file
// never has to change when the composer starts reading one — a snapshot pin
// that gets edited is no longer a pin.
jest.mock("@patina/supabase", () => ({
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
  useAgreementStudioContext: () => ({
    data: { studioId: "studio-1", canManage: true },
  }),
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
  useStudioLicenseAttestation: () => ({ data: null, isLoading: false }),
  useSaveStudioLicenseAttestation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useAgreementJurisdictionNotices: () => ({ data: [], isLoading: false }),
  useAgreementDraws: () => ({ data: [], isLoading: false }),
  useIssueAgreementDrawInvoice: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useRecordAgreementDrawLienWaiver: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useTradeAgreements: () => ({ data: [], isLoading: false }),
  useCreateTradeAgreement: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useSendTradeAgreement: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVoidTradeAgreement: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useStudioContacts: () => ({ data: [], isLoading: false }),
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
  client: { email: "halvorsen@example.com", full_name: "Ida Halvorsen" },
};

function bundleWith(parts: AgreementPart[]): CommercialDocumentBundle {
  return {
    document: {
      id: "agreement-1",
      projectId: null,
      kind: "design_services",
      state: "draft",
      title: "Halvorsen design agreement",
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

function renderRoom(parts: AgreementPart[]) {
  return render(
    <AgreementComposer proposal={proposal} bundle={bundleWith(parts)} />,
  );
}

describe("the composed room with design-build off", () => {
  it("renders the rail and the standard parts exactly as Wave 2 shipped", () => {
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
        partKey: "patina.terms",
        title: "Terms",
        required: true,
        payload: { body: "Ownership and cancellation." },
      }),
    ]);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders a part hidden from the client exactly as Wave 2 shipped", () => {
    const { container } = renderRoom([
      part({
        partKey: "studio.internal-note",
        title: "Studio note",
        clientVisible: false,
        payload: { body: "Our own note." },
      }),
    ]);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("leaves the pricing basis in the read-only card, as Wave 2 shipped", () => {
    const { container } = renderRoom([
      part({
        partKey: "patina.pricing_basis",
        kind: "schedule",
        variant: "pricing_basis",
        title: "Pricing basis",
        payload: { basis: "cost_plus_gmp" },
      }),
    ]);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("leaves the draws in the read-only card, as Wave 2 shipped", () => {
    const { container } = renderRoom([
      part({
        partKey: "patina.draws",
        kind: "schedule",
        variant: "draws",
        title: "Draws",
        payload: { draws: [], retainageBps: 500 },
      }),
    ]);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("leaves the allowances in the read-only card, as Wave 2 shipped", () => {
    const { container } = renderRoom([
      part({
        partKey: "patina.allowances",
        kind: "schedule",
        variant: "allowances",
        title: "Allowances",
        payload: { allowances: [] },
      }),
    ]);
    expect(container.firstChild).toMatchSnapshot();
  });
});
