/**
 * The turnkey composer, driven through the REAL state container.
 *
 * `turnkey-editors.test.tsx` mounts one editor at a time and hands it two
 * independent `jest.fn()`s for `onChange` and `writePart`. That proves the
 * editor asks for both writes; it cannot prove both writes LAND, because
 * nothing in that harness puts them back into one array. They did not: the
 * composer's `mutate` took a plain value derived from the render's `parts`,
 * so of the two setters fired in one handler the second discarded the first —
 * the allowance never reached the payload, and the sub-disclosure clause's own
 * mode never moved while the pricing basis' copy of it did. R13's two halves
 * disagreeing is the schedule of values rendering closed-book while the copy
 * the client reads says open-book.
 *
 * So these cases drive the acts through `AgreementComposer` itself and read
 * the array `upsert_agreement_parts` is handed at Save.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { AgreementPart } from "@patina/types";
import { AgreementComposer } from "../agreement-composer";
import { TURNKEY_PART_KEYS } from "../turnkey";
import type { CommercialDocumentBundle } from "@/hooks/use-commercial-documents";

const saveParts = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("../../../room-shell", () => ({
  RoomShell: ({
    action,
    children,
  }: {
    count?: string;
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

/** All three gates, resolved. `designBuildOn` flips per-test through this. */
let designBuildOn = true;
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag === "design-build" ? designBuildOn : true,
    isLoading: false,
  }),
}));

jest.mock("@patina/supabase", () => ({
  useSaveAgreementParts: () => ({
    mutateAsync: (parts: AgreementPart[]) => saveParts(parts),
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
  useStudioLicenseAttestation: () => ({
    data: {
      id: "attestation-1",
      studioId: "studio-1",
      status: "current",
      expiresOn: null,
    },
    isLoading: false,
  }),
  licenseAttestationIsLive: () => true,
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

// The draw ledger's "send it again" act is a real `useMutation`, and this room
// is rendered without a QueryClientProvider. `draw-ledger.test.tsx` stubs the
// same hook for the same reason.
jest.mock("@/hooks/use-commercial-documents", () => ({
  useReplayCommercialNotification: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
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
  client_id: "client-1",
  client: { email: "halvorsen@example.com", full_name: "Ida Halvorsen" },
};

const turnkeyParts = (): AgreementPart[] => [
  part({
    partKey: TURNKEY_PART_KEYS.pricingBasis,
    kind: "schedule",
    variant: "pricing_basis",
    title: "Pricing basis",
    payload: {
      basis: "cost_plus_gmp",
      feeBps: 1800,
      gmpCents: 8_413_400,
      subDisclosure: "closed_book",
      costLines: [
        {
          id: "cabinetry",
          label: "Cabinetry & millwork",
          category: "sub",
          basisCents: 3_800_000,
        },
        {
          id: "electrical",
          label: "Electrical",
          category: "sub",
          basisCents: 950_000,
        },
      ],
    },
  }),
  part({
    partKey: TURNKEY_PART_KEYS.allowances,
    kind: "schedule",
    variant: "allowances",
    title: "Allowances",
    payload: { allowances: [] },
  }),
  part({
    partKey: TURNKEY_PART_KEYS.subDisclosure,
    kind: "clause",
    title: "Who is doing the work",
    payload: { body: "", mode: "closed_book" },
  }),
];

function bundleWith(parts: AgreementPart[]): CommercialDocumentBundle {
  return {
    document: {
      id: "agreement-1",
      projectId: "project-1",
      kind: "design_build",
      state: "draft",
      title: "Halvorsen kitchen and mudroom",
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

function renderRoom(parts: AgreementPart[]) {
  return render(
    <AgreementComposer proposal={proposal} bundle={bundleWith(parts)} />,
  );
}

/** The composition the RPC was handed on the last Save. */
function savedParts(): AgreementPart[] {
  return saveParts.mock.calls.at(-1)?.[0] as AgreementPart[];
}

function payloadOfSaved(partKey: string): Record<string, unknown> {
  return savedParts().find((entry) => entry.partKey === partKey)?.payload ?? {};
}

/** The rail row for a part. The drag handle and the row menu carry an
 *  `aria-label`; the row button itself does not, which is what tells them
 *  apart when all three mention the same title. */
const openPart = (title: string) => {
  const rail = screen.getByRole("navigation", { name: "Agreement parts" });
  const row = within(rail)
    .getAllByRole("button")
    .find(
      (button) =>
        !button.hasAttribute("aria-label") &&
        (button.textContent ?? "").includes(title),
    );
  if (!row) throw new Error(`No rail row for ${title}`);
  fireEvent.click(row);
};

const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save agreement" }));
  });
};

beforeEach(() => {
  seq = 0;
  designBuildOn = true;
  saveParts.mockReset();
  saveParts.mockImplementation((parts: AgreementPart[]) =>
    Promise.resolve({ parts }),
  );
});

describe("two writes in one act", () => {
  it("lands the allowance AND its cost line in the same composition", async () => {
    renderRoom(turnkeyParts());
    openPart("Allowances");
    fireEvent.click(screen.getByRole("button", { name: "+ Add an allowance" }));

    // The first half of the act: the allowance is in its own payload, so the
    // row it draws exists at all.
    expect(screen.getByLabelText("Allowance 1")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Allowance 1"), {
      target: { value: "Tile allowance" },
    });
    fireEvent.change(screen.getByLabelText("Allowance 1 amount"), {
      target: { value: "4000" },
    });
    await save();

    const allowances = payloadOfSaved(TURNKEY_PART_KEYS.allowances)
      .allowances as { label: string; amountCents: number }[];
    expect(allowances).toHaveLength(1);
    expect(allowances[0]).toMatchObject({
      label: "Tile allowance",
      amountCents: 400_000,
    });

    // The second half, in the SAME composition: the allowance's cost line is
    // on the pricing basis, and the two lines that were already there are
    // still there, in order.
    const costLines = payloadOfSaved(TURNKEY_PART_KEYS.pricingBasis)
      .costLines as {
      id: string;
      label: string;
      basisCents: number;
      category: string;
    }[];
    expect(costLines).toHaveLength(3);
    expect(costLines.slice(0, 2).map((line) => line.id)).toEqual([
      "cabinetry",
      "electrical",
    ]);
    expect(costLines[2]).toMatchObject({
      label: "Tile allowance",
      category: "allowance",
      basisCents: 400_000,
    });
  });

  it("moves the clause's own mode, not only the pricing basis' copy", async () => {
    renderRoom(turnkeyParts());
    openPart("Who is doing the work");
    const openBook = screen.getByRole("button", { name: "Open-book" });
    fireEvent.click(openBook);

    // R13's studio half: the clause a designer reads must say what the payload
    // the database validates says. `aria-pressed` is the clause's own mode.
    expect(screen.getByRole("button", { name: "Open-book" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByText(
        "Your client reads each trade at cost, with your fee on its own line.",
      ),
    ).toBeInTheDocument();

    await save();
    expect(payloadOfSaved(TURNKEY_PART_KEYS.subDisclosure)).toMatchObject({
      mode: "open_book",
    });
    expect(payloadOfSaved(TURNKEY_PART_KEYS.pricingBasis)).toMatchObject({
      subDisclosure: "open_book",
    });
  });
});

/**
 * §4.1 — with `design-build` off, a `design_build` agreement renders read-only
 * prose. It cannot be created with the flag off; the way to stand here is a
 * rollback or a co-member the flag has not reached, and neither may type into
 * a class whose validators are not mounted.
 */
describe("a design-build agreement with the flag off", () => {
  it("opens read-only", () => {
    designBuildOn = false;
    renderRoom(turnkeyParts());
    // Nothing in the rail can be renamed, reordered or removed, and no part
    // can be added — the three acts the row menu and the footer perform.
    expect(
      screen.queryAllByRole("button", { name: /^Part options for/ }),
    ).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "+ Add a part" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Start from a template…" }),
    ).toBeNull();
  });

  it("still lists the parts as prose", () => {
    designBuildOn = false;
    renderRoom(turnkeyParts());
    const rail = screen.getByRole("navigation", { name: "Agreement parts" });
    expect(within(rail).getAllByRole("listitem")).toHaveLength(3);
    expect(within(rail).getByText("Pricing basis")).toBeInTheDocument();
  });

  it("mounts no turnkey editor", () => {
    designBuildOn = false;
    renderRoom(turnkeyParts());
    openPart("Allowances");
    expect(
      screen.queryByRole("button", { name: "+ Add an allowance" }),
    ).toBeNull();
  });
});
