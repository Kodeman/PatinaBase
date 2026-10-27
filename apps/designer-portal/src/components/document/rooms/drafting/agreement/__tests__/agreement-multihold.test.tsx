/**
 * US-36 R3 · R186 — the held Send on the real AgreementComposer, in a
 * spotlight frame. One window per part that holds it, on the whole part; one
 * on the seam where a missing part is added; one on the agreement's own
 * reason while anything else still holds it.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AgreementPart } from "@patina/types";
import { AgreementComposer } from "../agreement-composer";
import type { CommercialDocumentBundle } from "@/hooks/use-commercial-documents";

jest.mock("../turnkey/draw-ledger", () => ({
  DrawLedger: () => null,
}));
jest.mock("../turnkey/lien-waiver-attachments", () => ({
  LienWaiverAttachments: () => null,
}));
jest.mock("../../../../commercial/trade-agreements", () => ({
  TradeAgreementsStrip: () => null,
}));
jest.mock("@/hooks/use-teaching-note", () => ({
  useTeachingNoteFor: () => ({ note: null, bind: null }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("../../../room-shell", () => ({
  RoomShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("../../../../overlays/doc-sheet", () => ({
  DocSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
}));
jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: new Proxy({}, { get: () => () => undefined }),
}));
jest.mock("@/lib/help-system/open-help", () => ({ openHelp: jest.fn() }));
jest.mock("@/components/portal/client-picker", () => ({
  ClientPicker: ({ ariaLabel }: { ariaLabel: string }) => <input aria-label={ariaLabel} />,
}));
jest.mock("@/hooks/use-attach-client", () => ({
  useAttachDocumentClient: () => ({ mutate: jest.fn(), isPending: false }),
}));
let mockAuth = { user: { id: "designer-1" } as { id: string } | null, status: "authenticated" };
jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockAuth,
}));
jest.mock("@/hooks/use-clients", () => ({
  useClients: () => ({ isLoading: false, data: [] }),
}));
jest.mock("@patina/supabase", () => ({
  useStudioLicenseAttestation: () => ({ data: null, isLoading: false }),
  licenseAttestationIsLive: () => false,
  useAgreementJurisdictionNotices: () => ({ data: [], isLoading: false }),
  useAgreementDraws: () => ({ data: [], isLoading: false }),
  useSaveAgreementParts: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useMaterializeStandardParts: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDiscardAgreementParts: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAgreementStudioContext: () => ({ data: null }),
  useAgreementParts: () => ({ data: [], refetch: jest.fn() }),
  useMaterializeAgreementTemplate: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAgreementTemplates: () => ({ data: [], isLoading: false }),
  useStudioAgreementParts: () => ({ data: [], isLoading: false }),
  useSaveAgreementAsTemplate: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSaveAgreementPart: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAgreementPartEvents: () => ({ data: [], isLoading: false }),
}));
let mockFlags = { library: { value: false, isLoading: false }, designBuild: { value: false, isLoading: false } };
// SQ-2201 F2: round-8 arrangements are gated on the renderer; this suite reads legacy.
jest.mock("@/hooks/use-paper-renderer", () => ({
  usePaperRenderer: () => ({ renderer: "legacy" }),
}));

jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: (name: string) => name === "agreement-library" ? mockFlags.library
    : name === "design-build" ? mockFlags.designBuild : { value: false, isLoading: false },
}));
jest.mock("../../../../commercial/service-agreement-preview", () => ({
  ServiceAgreementPreview: () => <div>Agreement preview</div>,
}));
let mockSendSheetProps: {
  open: boolean;
  readinessOverride: { blockers: Array<{ message: string; partId?: string }> };
  onFixPart: (partId: string) => void;
} | null = null;
jest.mock("../../../../commercial/service-agreement-send-sheet", () => ({
  ServiceAgreementSendSheet: (props: typeof mockSendSheetProps) => {
    mockSendSheetProps = props;
    return null;
  },
}));
jest.mock("@/lib/document/room-origin", () => ({
  readRoomOrigin: () => "/desk",
  clearRoomOrigin: jest.fn(),
}));

let seq = 0;
function part(input: Partial<AgreementPart> & { partKey: string }): AgreementPart {
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

const withClient = {
  id: "agreement-1",
  designer_id: "designer-1",
  client_id: null,
  client: { email: "okafor@example.com", full_name: "Ada Okafor" },
};
const noClient = { ...withClient, client: null };

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

const services = (body = "") =>
  part({ partKey: "patina.services", title: "Services", required: true, payload: { body } });
const terms = (body = "") =>
  part({ partKey: "patina.terms", title: "Terms", required: true, payload: { body } });
const flatFee = () =>
  part({
    partKey: "custom.flat",
    kind: "schedule",
    variant: "flat",
    title: "Flat fee",
    payload: { cents: 1_100_000 },
  });

function renderFramed(parts: AgreementPart[], proposal = withClient) {
  return render(
    <div data-spotlight-frame="">
      <AgreementComposer proposal={proposal} bundle={bundleWith(parts)} />
    </div>,
  );
}

const windows = () =>
  Array.from(document.querySelectorAll("[data-hold-spotlight-window]")).map((el) =>
    el.getAttribute("data-hold-spotlight-window"),
  );
const status = () => document.querySelector("[data-hold-spotlight-root] [role='status']");
/** A press takes focus, as a real one does; fireEvent.click alone does not. */
const pressSend = () => {
  const send = screen.getByRole("button", { name: /Send the agreement/, hidden: true });
  send.focus();
  fireEvent.click(send);
};
const section = (key: string, nth = 0) =>
  Array.from(document.querySelectorAll<HTMLElement>("section.g-part[data-part-key]")).filter(
    (el) => el.dataset.partKey === key,
  )[nth]!;

beforeEach(() => {
  seq = 0;
  mockSendSheetProps = null;
  mockAuth = { user: { id: "designer-1" }, status: "authenticated" };
  mockFlags = { library: { value: false, isLoading: false }, designBuild: { value: false, isLoading: false } };
});

test("a part repair leaves Send and lands in the existing fold's first field", async () => {
  renderFramed([services("Interior design services."), terms("Payment terms."), flatFee()]);
  pressSend();
  await waitFor(() => expect(mockSendSheetProps?.open).toBe(true));

  fireEvent.click(screen.getByRole("button", { name: "Services Write", hidden: true }));
  const body = section("patina.services").querySelector("textarea")!;
  fireEvent.change(body, { target: { value: "" } });
  expect(mockSendSheetProps?.readinessOverride.blockers).toContainEqual(
    expect.objectContaining({ message: "Write Services.", partId: "part-1" }),
  );

  act(() => mockSendSheetProps!.onFixPart("part-1"));
  expect(mockSendSheetProps?.open).toBe(false);
  await waitFor(() => expect(section("patina.services").querySelector("textarea")).toHaveFocus());
  expect(document.getElementById("fold-patina-services")).not.toHaveAttribute("hidden");
});

test("arrival with a part ID opens that part's existing fold", async () => {
  const previous = window.location.href;
  window.history.replaceState({}, "", "/drafting/agreement-1?repairPartId=part-2");
  try {
    renderFramed([services("Design services."), terms("Payment terms."), flatFee()]);
    await waitFor(() => expect(section("patina.terms").querySelector("textarea")).toHaveFocus());
    expect(document.getElementById("fold-patina-terms")).not.toHaveAttribute("hidden");
    expect(document.getElementById("fold-patina-services")).toHaveAttribute("hidden");
  } finally {
    window.history.replaceState({}, "", previous);
  }
});

test("client repair waits for authenticated proposal owner before opening and focusing picker", async () => {
  const previous = window.location.href;
  window.history.replaceState({}, "", "/drafting/agreement-1?repairClient=1");
  mockAuth = { user: null, status: "loading" };
  try {
    const parts = [services("Design services."), flatFee()];
    const view = renderFramed(parts);
    expect(screen.queryByRole("textbox", { name: "Client account" })).not.toBeInTheDocument();
    mockAuth = { user: { id: "designer-1" }, status: "authenticated" };
    view.rerender(<div data-spotlight-frame=""><AgreementComposer proposal={noClient} bundle={bundleWith(parts)} /></div>);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Client account" })).toHaveFocus());
  } finally {
    window.history.replaceState({}, "", previous);
  }
});

test("client repair does not open the picker for a non-owner after auth resolves", async () => {
  const previous = window.location.href;
  window.history.replaceState({}, "", "/drafting/agreement-1?repairClient=1");
  mockAuth = { user: null, status: "loading" };
  try {
    const parts = [services("Design services."), flatFee()];
    const view = renderFramed(parts, noClient);
    mockAuth = { user: { id: "other-designer" }, status: "authenticated" };
    view.rerender(<div data-spotlight-frame=""><AgreementComposer proposal={noClient} bundle={bundleWith(parts)} /></div>);
    expect(screen.queryByRole("textbox", { name: "Client account" })).not.toBeInTheDocument();
    expect(screen.getByText("Only the agreement owner can change the client account.")).toBeInTheDocument();
  } finally {
    window.history.replaceState({}, "", previous);
  }
});

test("uncapped ceiling repair focuses its enabled checkbox instead of disabled amount", async () => {
  const previous = window.location.href;
  window.history.replaceState({}, "", "/drafting/agreement-1?repairPartId=ceiling-1");
  try {
    const rateCard = part({ partKey: "patina.role_rates", kind: "schedule", variant: "rate_card", title: "Role rates", payload: { roles: [{ roleName: "Lead", hourlyRateCents: 10000 }] } });
    const ceiling = part({ id: "ceiling-1", partKey: "patina.ceiling", kind: "schedule", variant: "ceiling", title: "Fee ceiling", payload: { cents: null } });
    renderFramed([services("Design services."), rateCard, ceiling]);
    const amount = screen.getByRole("textbox", { name: /Design authorization ceiling/ });
    const checkbox = screen.getByRole("checkbox", { name: /No ceiling/ });
    expect(amount).toBeDisabled();
    expect(checkbox).toBeEnabled();
    await waitFor(() => expect(checkbox).toHaveFocus());
  } finally {
    window.history.replaceState({}, "", previous);
  }
});

test("design-build part arrival waits for flags to make the draft editable", async () => {
  const previous = window.location.href;
  window.history.replaceState({}, "", "/drafting/agreement-1?repairPartId=part-1");
  mockFlags = { library: { value: false, isLoading: true }, designBuild: { value: false, isLoading: true } };
  try {
    const parts = [services("Design services."), flatFee()];
    const bundle = bundleWith(parts);
    bundle.document.kind = "design_build";
    const view = render(<div data-spotlight-frame=""><AgreementComposer proposal={withClient} bundle={bundle} /></div>);
    const body = section("patina.services").querySelector("textarea")!;
    expect(body).toBeDisabled();
    mockFlags = { library: { value: true, isLoading: false }, designBuild: { value: true, isLoading: false } };
    view.rerender(<div data-spotlight-frame=""><AgreementComposer proposal={withClient} bundle={bundle} /></div>);
    await waitFor(() => expect(body).toBeEnabled());
    await waitFor(() => expect(body).toHaveFocus());
  } finally {
    window.history.replaceState({}, "", previous);
  }
});

const strip = (key: string) =>
  document.querySelector<HTMLElement>(`aside[data-beside="${section(key).id}"]`)!;
const live = (el: Element) => el.closest("[inert]") === null;

test("one window per part holding Send, on the whole part; a fixed part drops its window", async () => {
  // Unwritten, the paper prints neither part: each one's fold act and reason
  // are in the studio's strip.
  renderFramed([services(), terms(), flatFee()]);

  pressSend();
  await waitFor(() =>
    expect(windows()).toEqual(["part:patina.services:0", "part:patina.terms:0"]),
  );
  expect(live(strip("patina.services"))).toBe(true);
  expect(live(strip("patina.terms"))).toBe(true);
  expect(live(section("custom.flat"))).toBe(false);

  // Opened inside its window, the part's fold takes the window and is live.
  fireEvent.click(screen.getByRole("button", { name: "Services Write", hidden: true }));
  const body = section("patina.services").querySelector("textarea")!;
  await waitFor(() => expect(live(body)).toBe(true));
  fireEvent.change(body, { target: { value: "Interior design services." } });
  await waitFor(() => expect(windows()).toEqual(["part:patina.terms:0"]));
});

test("an open part's window is the whole part, entered at its first field, never its fold act", async () => {
  // Printed but unnamed: the part's head and fold act are on the paper.
  renderFramed([
    part({ partKey: "custom.note", title: "", payload: { body: "A note." } }),
    flatFee(),
  ]);
  const foldAct = document.getElementById("write-custom-note")!;
  fireEvent.click(foldAct);
  const body = section("custom.note").querySelector("textarea")!;

  pressSend();
  await waitFor(() => expect(windows()).toEqual(["part:custom.note:0"]));
  expect(live(foldAct)).toBe(true);
  expect(live(body)).toBe(true);
  expect(body).toHaveFocus();
  expect(foldAct).toHaveAttribute("aria-expanded", "true");
});

test("a document reason stays listed beside the parts and outlives them: never All set while held", async () => {
  renderFramed([services(), flatFee()], noClient);

  // K3: the reason stands visible before any press.
  expect(screen.getByText("Write Services.")).toBeVisible();
  pressSend();
  await waitFor(() => expect(windows()).toEqual(["part:patina.services:0", "agreement"]));

  fireEvent.click(screen.getByRole("button", { name: "Services Write", hidden: true }));
  const body = section("patina.services").querySelector("textarea")!;
  await waitFor(() => expect(live(body)).toBe(true));
  fireEvent.change(body, { target: { value: "Interior design services." } });
  await waitFor(() => expect(windows()).toEqual(["agreement"]));
  expect(document.querySelector("[data-hold-spotlight]")).not.toBeNull();
  expect(status()).not.toHaveTextContent("All set.");
  expect(document.querySelector("[data-hold-spotlight-bar]")).toHaveTextContent(
    /link a client/i,
  );
});

test("a missing fee windows the seam's + Add a part act", async () => {
  renderFramed([services("Interior design services.")]);

  pressSend();
  await waitFor(() => expect(windows()).toEqual(["add-a-part"]));
  const seam = screen.getAllByRole("button", { name: "+ Add a part", hidden: true })[0]!;
  expect(live(seam)).toBe(true);
  expect(seam).toHaveFocus();
});

test("two parts sharing a key: the hold lands on the flagged one, by its own id and name", async () => {
  renderFramed([
    services("Interior design services."),
    part({
      partKey: "patina.services",
      title: "Services",
      payload: { body: "Second services clause." },
    }),
    flatFee(),
  ]);

  pressSend();
  await waitFor(() => expect(windows()).toEqual(["part:patina.services:1"]));
  expect(live(section("patina.services", 1))).toBe(true);
  expect(live(section("patina.services", 0))).toBe(false);
  expect(document.querySelector(".hold-spotlight__label")).toHaveTextContent(
    "Services · part 2",
  );
});
