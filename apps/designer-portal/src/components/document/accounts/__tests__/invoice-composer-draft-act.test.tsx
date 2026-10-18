/**
 * SQ-1262 — the composer's Draft as one act, under the app's own QueryClient
 * (its MutationCache refuses an offline money act; networkMode 'online' would
 * otherwise pause one and run it on reconnect) and the real
 * useCreateDraftInvoice / useCreateDraftStudioInvoice.
 *
 * F1: offline at the press, Draft refuses with nothing read or written, and
 * reconnecting writes nothing.
 * F2: closing the composer retires its act: closed while the project read is
 * out, nothing is written; closed after the draft is written, the folio never
 * opens.
 * F4: Try again answers to the same readiness as Draft: while a read is out it
 * drafts nothing.
 * SQ-1272 F4: a draft write whose answer is lost may have landed, and neither
 * RPC takes an idempotency key: no Try again, the invoice lists re-read, and the
 * act routes to them.
 */
import { type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, onlineManager, type QueryClient } from "@tanstack/react-query";
import { OFFLINE_NOT_SENT, nextSubjectQueryClient } from "@/lib/react-query";
import { InvoiceComposer } from "../invoice-composer";
import { invoiceParkingKey, park, parkedState, unpark } from "@/lib/document/spotlight/parking";

/** The project's invoices as the composer holds them, and a re-read it must never make. */
let mockProjectInvoices: Array<{ id: string; status: string }> = [];
const mockRefetchInvoices = jest.fn();

jest.mock("@patina/supabase", () => ({
  InvoiceBillingGapError: jest.requireActual("@patina/supabase").InvoiceBillingGapError,
  // The reads and the two draft writers are the real hooks.
  useProjects: () => jest.requireActual("@patina/supabase").useProjects(),
  useUnbilledTime: (projectId: string | null) =>
    jest.requireActual("@patina/supabase").useUnbilledTime(projectId),
  useCreateDraftInvoice: (options?: { errorSurface?: "inline" }) =>
    jest.requireActual("@patina/supabase").useCreateDraftInvoice(options),
  useCreateDraftStudioInvoice: (options?: { errorSurface?: "inline" }) =>
    jest.requireActual("@patina/supabase").useCreateDraftStudioInvoice(options),
  useStampProjectPricingStudio: () => ({ mutate: jest.fn(), isPending: false }),
  useDocumentClientLinkHold: () => ({ data: undefined }),
  useSessionUserId: () => "designer-1",
  useOrganizationMembers: () => ({ data: [] }),
  useStudiosEmployingMember: () => ({ data: [] }),
  useDeleteDraftInvoice: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFfeInvoiceCoverage: () => ({ data: undefined, isLoading: false }),
  useFfeInvoiceStageCoverage: () => ({ data: undefined, isLoading: false }),
  useAddInvoiceBillingLines: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProjectPoCostLines: () => ({ data: [], isLoading: false }),
  useOrganizations: () => ({
    data: [{ id: "studio-1", name: "Middle West Studio", type: "design_studio", status: "active" }],
    isLoading: false,
  }),
  useProjectFFEItems: () => ({ data: [], isLoading: false }),
  useProjectInvoices: () => ({ data: mockProjectInvoices, refetch: mockRefetchInvoices }),
  useProjectPaymentMilestones: () => ({ data: [] }),
  useClaimTimeEntries: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetLaborLinePrice: () => ({ mutate: jest.fn(), isPending: false }),
  useProjectRoster: () => ({ data: [] }),
  useStudioPurchases: () => ({ data: [], isLoading: false }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: (key: string) => ({ value: key === "studio-invoice", isLoading: false }),
}));

jest.mock("@/components/portal/client-picker", () => ({
  ClientPicker: ({ onChange }: { onChange: (id: string | null) => void }) => (
    <button type="button" onClick={() => onChange("client-1")}>
      pick household
    </button>
  ),
}));

// ── The server, behind the browser client singleton ──────────────────────────
type Mode = "answer" | "hang" | "deferred" | "fail";
const project = {
  id: "project-1",
  name: "Hollis House",
  status: "active",
  client_id: "client-9",
  studio_id: "studio-1",
  designer_id: "designer-1",
  designer: { id: "designer-1", display_name: "Leah Ames", full_name: "Leah Ames" },
};
/** How the projects list re-read answers. */
let projectsMode: Mode = "answer";
/** How useCreateDraftInvoice's own project read answers. */
let projectReadMode: Mode = "answer";
/** How a draft RPC answers. */
let rpcMode: Mode = "answer";
let projectReads = 0;
let deferred: Array<() => void> = [];
const release = () => {
  const held = deferred;
  deferred = [];
  held.forEach((answer) => answer());
};
const rpc = jest.fn();

function answer<T>(mode: Mode, value: () => T, what: string): Promise<T | { data: null; error: { message: string } }> {
  if (mode === "hang") return new Promise<never>(() => {});
  if (mode === "fail") return Promise.resolve({ data: null, error: { message: `${what} failed` } });
  if (mode === "deferred") return new Promise((resolve) => deferred.push(() => resolve(value())));
  return Promise.resolve(value());
}

function from(name: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () =>
      name === "projects"
        ? answer(
            projectsMode,
            () => ({ data: [{ ...project }, { ...project, id: "project-2", name: "Arden House" }], error: null }),
            "projects read",
          )
        : answer("answer", () => ({ data: [], error: null }), "hours read"),
    single: () => {
      projectReads += 1;
      return answer(projectReadMode, () => ({ data: { ...project }, error: null }), "project read");
    },
  };
  return builder;
}

const session = {
  access_token: "access",
  refresh_token: "refresh",
  expires_at: 4_102_444_800,
  user: { id: "designer-1" },
};
const auth = {
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  getSession: async () => ({ data: { session }, error: null }),
  storage: { getItem: async () => JSON.stringify(session) },
  storageKey: "sb-test-auth-token",
};

const browser = globalThis as { __supabaseBrowserClient?: unknown };

let qc: QueryClient;
const Frame = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>
    <div data-spotlight-frame="">{children}</div>
  </QueryClientProvider>
);
const onDrafted = jest.fn();
const renderComposer = (context: { projectId?: string } = { projectId: "project-1" }) =>
  render(<InvoiceComposer context={context} onDrafted={onDrafted} />, { wrapper: Frame });

const draftAct = () => screen.getByRole("button", { name: "Draft the invoice" });
const reasonLine = () => document.getElementById(draftAct().getAttribute("aria-describedby") ?? "");
const draftWrites = (name: string) => rpc.mock.calls.filter(([called]) => called === name).length;
/** Let anything a reconnect or a landed read would continue into run. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const unfinishedActs = () =>
  qc.getMutationCache().getAll().filter((m) => m.state.status === "pending" || m.state.isPaused);

function addLine() {
  fireEvent.change(screen.getByLabelText("Line description"), { target: { value: "Design fee" } });
  fireEvent.change(screen.getByLabelText("Unit price (dollars)"), { target: { value: "450" } });
}

async function readyToDraft() {
  addLine();
  await waitFor(() => expect(draftAct()).not.toHaveAttribute("aria-disabled"));
  expect(draftAct()).toBeEnabled();
}

/** Studio mode: a household, a regarding line and one line, so Draft stands ready. */
async function readyToDraftForStudio() {
  fireEvent.change(screen.getByLabelText("For"), { target: { value: "__studio__" } });
  fireEvent.click(screen.getByRole("button", { name: "pick household" }));
  fireEvent.change(screen.getByPlaceholderText("Design consultation · Sept 2026"), {
    target: { value: "Design consultation" },
  });
  await readyToDraft();
}

beforeEach(() => {
  jest.clearAllMocks();
  qc = nextSubjectQueryClient();
  projectsMode = "answer";
  projectReadMode = "answer";
  rpcMode = "answer";
  projectReads = 0;
  deferred = [];
  mockProjectInvoices = [];
  rpc.mockImplementation((name: string) =>
    answer(
      rpcMode,
      () =>
        name === "create_draft_studio_invoice"
          ? { data: "invoice-studio-1", error: null }
          : { data: { id: "invoice-1", project_id: "project-1" }, error: null },
      "draft write",
    ),
  );
  browser.__supabaseBrowserClient = { from, rpc, auth };
  unpark(invoiceParkingKey("project-1"));
});
afterEach(() => {
  act(() => onlineManager.setOnline(true));
  qc.clear();
  delete browser.__supabaseBrowserClient;
});

describe("SQ-1262 control: a ready Draft online", () => {
  it("writes the draft once and opens the folio", async () => {
    renderComposer();
    await readyToDraft();

    fireEvent.click(draftAct());

    await waitFor(() => expect(onDrafted).toHaveBeenCalledWith("invoice-1", "project-1"));
    expect(draftWrites("create_draft_invoice")).toBe(1);
  });

  it("restores a parked invoice, then clears it after a successful Draft", async () => {
    const key = invoiceParkingKey("project-1");
    park(key, { memo: "Spring visit" });
    renderComposer();
    expect(screen.getByLabelText("memo · shown to the client")).toHaveValue("Spring visit");
    await readyToDraft();

    fireEvent.click(draftAct());
    await waitFor(() => expect(onDrafted).toHaveBeenCalledWith("invoice-1", "project-1"));
    expect(parkedState(key)).toBeNull();
  });
});

describe("SQ-1262 F1: offline, Draft refuses at the press", () => {
  it("project: nothing is read or written, and reconnecting writes nothing", async () => {
    renderComposer();
    await readyToDraft();

    act(() => onlineManager.setOnline(false));
    fireEvent.click(draftAct());

    expect(await screen.findByText(OFFLINE_NOT_SENT)).toBeInTheDocument();
    expect(projectReads).toBe(0);
    expect(rpc).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));
    await settle();
    await settle();
    expect(rpc).not.toHaveBeenCalled();
    expect(projectReads).toBe(0);
    expect(unfinishedActs()).toHaveLength(0);
    expect(onDrafted).not.toHaveBeenCalled();
  });

  it("studio: nothing is written, and reconnecting writes nothing", async () => {
    renderComposer({});
    await readyToDraftForStudio();

    act(() => onlineManager.setOnline(false));
    fireEvent.click(draftAct());

    expect(await screen.findByText(OFFLINE_NOT_SENT)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));
    await settle();
    await settle();
    expect(rpc).not.toHaveBeenCalled();
    expect(unfinishedActs()).toHaveLength(0);
    expect(onDrafted).not.toHaveBeenCalled();
  });
});

describe("SQ-1262 F2: closing the composer retires its Draft", () => {
  it("closed while its project read is out, nothing is written when the read lands", async () => {
    const { unmount } = renderComposer();
    await readyToDraft();
    projectReadMode = "deferred";

    fireEvent.click(draftAct());
    await waitFor(() => expect(deferred).toHaveLength(1));
    unmount();

    act(() => release());
    await settle();
    await settle();
    expect(rpc).not.toHaveBeenCalled();
    expect(onDrafted).not.toHaveBeenCalled();
  });

  it("closed after the draft is written, it never opens the folio", async () => {
    const { unmount } = renderComposer();
    await readyToDraft();
    rpcMode = "deferred";

    fireEvent.click(draftAct());
    await waitFor(() => expect(draftWrites("create_draft_invoice")).toBe(1));
    unmount();

    act(() => release());
    await settle();
    await settle();
    expect(draftWrites("create_draft_invoice")).toBe(1);
    expect(onDrafted).not.toHaveBeenCalled();
  });

  it("studio: closed after the draft is written, it never opens the folio", async () => {
    const { unmount } = renderComposer({});
    await readyToDraftForStudio();
    rpcMode = "deferred";

    fireEvent.click(draftAct());
    await waitFor(() => expect(draftWrites("create_draft_studio_invoice")).toBe(1));
    unmount();

    act(() => release());
    await settle();
    await settle();
    expect(onDrafted).not.toHaveBeenCalled();
  });
});

describe("SQ-1262 F4: Try again answers to the same readiness as Draft", () => {
  /** A first Draft refused definitely before anything was written (its project
   *  read failed), so Try again is offered. */
  async function failedOnce() {
    renderComposer();
    await readyToDraft();
    projectReadMode = "fail";
    fireEvent.click(draftAct());
    expect(
      await screen.findByText("We couldn't open this project to bill it. Reload and try again."),
    ).toBeInTheDocument();
    expect(draftWrites("create_draft_invoice")).toBe(0);
    projectReadMode = "answer";
  }

  it("control: with the reads settled, Try again drafts", async () => {
    await failedOnce();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(onDrafted).toHaveBeenCalledWith("invoice-1", "project-1"));
    expect(draftWrites("create_draft_invoice")).toBe(1);
  });

  it("while the projects re-read is out, Try again drafts nothing and says why", async () => {
    await failedOnce();
    const readsBefore = projectReads;

    projectsMode = "hang";
    act(() => {
      void qc.invalidateQueries({ queryKey: ["projects"], exact: true });
    });
    await waitFor(() => expect(draftAct()).toHaveAttribute("aria-disabled", "true"));

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await settle();
    await settle();

    expect(projectReads).toBe(readsBefore);
    expect(draftWrites("create_draft_invoice")).toBe(0);
    expect(onDrafted).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(reasonLine()).toHaveTextContent("Checking this project before drafting its invoice."),
    );
  });
});

describe("SQ-1272 F4: a draft write whose answer is lost is never tried blind", () => {
  const UNCONFIRMED = "We couldn't confirm the draft. Check the invoices before drafting again. If it landed, it may be missing hours or lines, so don't send it.";
  const listKey = ["invoices", "list", {}];

  it.each([
    ["project", "create_draft_invoice", { projectId: "project-1" }, () => readyToDraft()],
    ["studio", "create_draft_studio_invoice", {}, () => readyToDraftForStudio()],
  ] as const)(
    "%s: no Try again, the invoice lists re-read, and Check the invoices opens them",
    async (_mode, writer, context, ready) => {
      renderComposer(context);
      await ready();
      qc.setQueryData(listKey, []);
      rpcMode = "fail";

      fireEvent.click(draftAct());

      expect(await screen.findByRole("alert")).toHaveTextContent(UNCONFIRMED);
      expect(draftWrites(writer)).toBe(1);
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
      expect(qc.getQueryState(listKey)?.isInvalidated).toBe(true);

      const opened = jest.fn();
      const onOpen = (e: Event) => opened((e as CustomEvent).detail);
      window.addEventListener("document:open-ledger", onOpen);
      fireEvent.click(screen.getByRole("button", { name: "Check the invoices" }));
      window.removeEventListener("document:open-ledger", onOpen);
      expect(opened).toHaveBeenCalledWith("accounts");
      expect(draftWrites(writer)).toBe(1);
      expect(onDrafted).not.toHaveBeenCalled();
    },
  );
});

describe("SQ-1282 F1: an unconfirmed draft holds the primary Draft until the composer closes", () => {
  const UNCONFIRMED = "We couldn't confirm the draft. Check the invoices before drafting again. If it landed, it may be missing hours or lines, so don't send it.";
  const spotWindows = () =>
    Array.from(document.querySelectorAll("[data-hold-spotlight-window]")).map((el) =>
      el.getAttribute("data-hold-spotlight-window"),
    );

  it.each([
    ["project", "create_draft_invoice", { projectId: "project-1" }, () => readyToDraft()],
    ["studio", "create_draft_studio_invoice", {}, () => readyToDraftForStudio()],
  ] as const)(
    "%s: held on why before the press; pressing it writes nothing and lights Check the invoices",
    async (_mode, writer, context, ready) => {
      renderComposer(context);
      await ready();
      rpcMode = "fail";
      fireEvent.click(draftAct());
      expect(await screen.findByRole("alert")).toHaveTextContent(UNCONFIRMED);
      expect(draftWrites(writer)).toBe(1);

      // Before the press: held, its reason and its fix in view.
      expect(draftAct()).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByRole("alert")).toHaveTextContent(UNCONFIRMED);
      expect(screen.getByRole("button", { name: "Check the invoices" })).toBeInTheDocument();
      expect(spotWindows()).toEqual([]);

      fireEvent.click(draftAct());
      await settle();

      expect(draftWrites(writer)).toBe(1);
      await waitFor(() => expect(spotWindows()).toContain("draft-unconfirmed"));
      expect(reasonLine()).toHaveTextContent(UNCONFIRMED);
      expect(onDrafted).not.toHaveBeenCalled();
    },
  );

  // SQ-1284 — no client read can prove what the lost write did, so none is made.
  it("project: Draft stays held for the life of the composer, with no read, no folio, and none freed by another project", async () => {
    const landed = [
      { id: "invoice-landed", status: "draft" },
      { id: "invoice-old", status: "draft" },
    ];
    mockProjectInvoices = [{ id: "invoice-old", status: "draft" }];
    mockRefetchInvoices.mockResolvedValue({ isError: false, data: landed });
    renderComposer({});
    await screen.findByRole("option", { name: "Arden House" });
    fireEvent.change(screen.getByLabelText("For"), { target: { value: "project-1" } });
    await readyToDraft();
    rpcMode = "fail";

    fireEvent.click(draftAct());
    expect(await screen.findByRole("alert")).toHaveTextContent(UNCONFIRMED);
    mockProjectInvoices = landed;
    await settle();

    const heldOnWhy = async () => {
      // (a) held, its reason in view.
      expect(draftAct()).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByRole("alert")).toHaveTextContent(UNCONFIRMED);
      // (b) the press writes nothing more and lights Check the invoices.
      fireEvent.click(draftAct());
      await settle();
      expect(draftWrites("create_draft_invoice")).toBe(1);
      await waitFor(() => expect(spotWindows()).toContain("draft-unconfirmed"));
      expect(reasonLine()).toHaveTextContent(UNCONFIRMED);
      expect(screen.getByRole("button", { name: "Check the invoices" }).closest("[inert]")).toBeNull();
      // (c) nothing re-reads the invoices or opens one they list.
      expect(mockRefetchInvoices).not.toHaveBeenCalled();
      expect(onDrafted).not.toHaveBeenCalled();
    };
    await heldOnWhy();

    // (d) another project keeps the hold.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(spotWindows()).toEqual([]));
    fireEvent.change(screen.getByLabelText("For"), { target: { value: "project-2" } });
    await settle();
    expect(screen.getByLabelText("For")).toHaveValue("project-2");
    await heldOnWhy();
  });
});
