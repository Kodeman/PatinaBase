/**
 * US-36 R3 · R186 — the held Send on the real AgreementComposer, in a
 * spotlight frame. One window per part that holds it, on the whole part; one
 * on the seam where a missing part is added; one on the agreement's own
 * reason while anything else still holds it.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AgreementPart } from "@patina/types";
import { AgreementComposer } from "../agreement-composer";
import type { CommercialDocumentBundle } from "@/hooks/use-commercial-documents";

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
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));
jest.mock("../../../../commercial/service-agreement-preview", () => ({
  ServiceAgreementPreview: () => <div>Agreement preview</div>,
}));
jest.mock("../../../../commercial/service-agreement-send-sheet", () => ({
  ServiceAgreementSendSheet: () => null,
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
