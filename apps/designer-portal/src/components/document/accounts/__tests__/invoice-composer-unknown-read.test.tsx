/**
 * SQ-1249 F1 — unknown is held, in the composer too. Its readiness takes the
 * project's client and studio, and its hours, only from a settled read: a
 * re-read in flight after an invalidation, or a failed one, holds Draft on why
 * even with the earlier answer cached, and a project the read did not return
 * is never taken as ready (deriveInvoiceBillingGap(undefined) is null).
 *
 * Runs the real useProjects and useUnbilledTime against a real QueryClient and
 * an in-memory projects table and project_unbilled_time view, so the cached
 * data is genuinely retained.
 *
 * SQ-1272 F2 — the project's pieces, their coverage and their billing stages
 * are read the same way (the real useProjectFFEItems, useFfeInvoiceCoverage and
 * useFfeInvoiceStageCoverage): a failed one holds Draft, never reads as none.
 */
import { type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvoiceComposer } from "../invoice-composer";
import { parkInvoiceComposer, unparkInvoiceComposer } from "@/lib/document/registry";

const mockCreateDraft = jest.fn();

jest.mock("@patina/supabase", () => ({
  InvoiceBillingGapError: class InvoiceBillingGapError extends Error {
    gap: string;
    constructor(gap: string, message = `billing gap: ${gap}`) {
      super(message);
      this.gap = gap;
    }
  },
  // The two reads under test are the real hooks.
  useProjects: () => jest.requireActual("@patina/supabase").useProjects(),
  useUnbilledTime: (projectId: string | null) =>
    jest.requireActual("@patina/supabase").useUnbilledTime(projectId),
  useStampProjectPricingStudio: () => ({ mutate: jest.fn(), isPending: false }),
  useDocumentClientLinkHold: () => ({ data: undefined }),
  useSessionUserId: () => "designer-1",
  useOrganizationMembers: () => ({ data: [] }),
  useStudiosEmployingMember: () => ({ data: [] }),
  useCreateDraftInvoice: () => ({ mutateAsync: mockCreateDraft, isPending: false }),
  useCreateDraftStudioInvoice: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteDraftInvoice: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFfeInvoiceCoverage: (projectId: string, opts?: { enabled?: boolean }) =>
    jest.requireActual("@patina/supabase").useFfeInvoiceCoverage(projectId, opts),
  useFfeInvoiceStageCoverage: (projectId: string | null) =>
    jest.requireActual("@patina/supabase").useFfeInvoiceStageCoverage(projectId),
  useAddInvoiceBillingLines: () => ({ mutateAsync: jest.fn(), isPending: false }),
  // SQ-1295 R2 — the real read, so an asked-for rider meets a real failure.
  useProjectPoCostLines: (projectId: string | null) =>
    jest.requireActual("@patina/supabase").useProjectPoCostLines(projectId),
  useOrganizations: () => ({
    data: [{ id: "studio-1", name: "Middle West Studio", type: "design_studio", status: "active" }],
    isLoading: false,
  }),
  useProjectFFEItems: (projectId: string) =>
    jest.requireActual("@patina/supabase").useProjectFFEItems(projectId),
  useProjectInvoices: () => ({ data: [] }),
  useProjectPaymentMilestones: () => ({ data: [] }),
  useClaimTimeEntries: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetLaborLinePrice: () => ({ mutate: jest.fn(), isPending: false }),
  useProjectRoster: () => ({ data: [] }),
  // SQ-1289 F5 — the real read, so a parked purchase meets a real failure.
  useStudioPurchases: (scope: { projectId: string } | null) =>
    jest.requireActual("@patina/supabase").useStudioPurchases(scope),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

jest.mock("@/components/portal/client-picker", () => ({
  ClientPicker: () => null,
}));

type Project = Record<string, unknown> & { id: string; client_id: string | null; studio_id: string | null };
/** The server's projects table, as it stands now. */
let table: Project[] = [];
/** How the next read of each answers: as it stands, never, or with an error. */
let projectsMode: "answer" | "hang" | "fail" = "answer";
let timeMode: "answer" | "hang" | "fail" = "answer";
/** The project's pieces, their coverage and their billing stages. */
let piecesMode: "answer" | "hang" | "fail" = "answer";
let coverageMode: "answer" | "hang" | "fail" = "answer";
let stagesMode: "answer" | "hang" | "fail" = "answer";
let purchasesMode: "answer" | "hang" | "fail" = "answer";
let ridersMode: "answer" | "hang" | "fail" = "answer";
/** The pieces, purchases and riders the reads return when they answer. */
let pieceRows: unknown[] = [];
let purchaseRows: unknown[] = [];
let riderRows: unknown[] = [];

function respond(mode: "answer" | "hang" | "fail", rows: () => unknown[], what: string) {
  if (mode === "hang") return new Promise<never>(() => {});
  if (mode === "fail") return Promise.resolve({ data: null, error: { message: `${what} read failed` } });
  return Promise.resolve({ data: rows(), error: null });
}

function from(name: string) {
  if (name === "project_ffe_items") {
    const pieces = {
      select: () => pieces,
      eq: () => pieces,
      is: () => pieces,
      order: () => pieces,
      limit: (count: number) => respond(piecesMode, () => pieceRows.slice(0, count), "pieces"),
    };
    return pieces;
  }
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () =>
      name === "projects"
        ? respond(projectsMode, () => table.map((p) => ({ ...p })), "projects")
        : name === "studio_purchases"
          ? respond(purchasesMode, () => purchaseRows, "purchases")
          : name === "po_cost_lines"
            ? respond(ridersMode, () => riderRows, "riders")
            : respond(timeMode, () => [], "hours"),
  };
  return builder;
}

function rpc(name: string) {
  if (name === "get_ffe_invoice_coverage") return respond(coverageMode, () => [], "coverage");
  if (name === "get_ffe_invoice_stage_coverage") return respond(stagesMode, () => [], "stages");
  throw new Error(`unexpected rpc ${name}`);
}

const browser = globalThis as { __supabaseBrowserClient?: unknown };

let qc: QueryClient;
const Frame = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>
    <div data-spotlight-frame="">{children}</div>
  </QueryClientProvider>
);
const renderComposer = () =>
  render(
    <InvoiceComposer context={{ projectId: "project-1" }} onDrafted={jest.fn()} />,
    { wrapper: Frame },
  );
const draftAct = () => screen.getByRole("button", { name: "Draft the invoice" });
const reasonLine = () => document.getElementById(draftAct().getAttribute("aria-describedby") ?? "");
const spotWindows = () =>
  Array.from(document.querySelectorAll("[data-hold-spotlight-window]")).map((el) =>
    el.getAttribute("data-hold-spotlight-window"),
  );
const cachedProject = () => qc.getQueryData<Project[]>(["projects"])?.find((p) => p.id === "project-1");
const timeKey = ["projects", "project-1", "unbilled-time"];

/** One billable ad-hoc line, so the only thing that can hold Draft is a read. */
function addLine() {
  fireEvent.change(screen.getByLabelText("Line description"), { target: { value: "Design fee" } });
  fireEvent.change(screen.getByLabelText("Unit price (dollars)"), { target: { value: "450" } });
}

/** The composer has read the project and its hours, and Draft stands ready. */
async function readyToDraft() {
  addLine();
  await waitFor(() => expect(draftAct()).not.toHaveAttribute("aria-disabled"));
  expect(draftAct()).toBeEnabled();
}

/** Draft is held on this reason, and pressing it drafts nothing and offers no fix. */
async function heldOn(reason: string) {
  await waitFor(() => expect(draftAct()).toHaveAttribute("aria-disabled", "true"));
  fireEvent.click(draftAct());
  await waitFor(() => expect(reasonLine()).toHaveTextContent(reason));
  expect(spotWindows()).not.toContain("link-client");
  expect(mockCreateDraft).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  table = [
    {
      id: "project-1",
      name: "Hollis House",
      status: "active",
      client_id: "client-9",
      studio_id: "studio-1",
      designer_id: "designer-1",
      designer: { id: "designer-1", display_name: "Leah Ames", full_name: "Leah Ames" },
    },
  ];
  projectsMode = "answer";
  timeMode = "answer";
  piecesMode = "answer";
  coverageMode = "answer";
  stagesMode = "answer";
  purchasesMode = "answer";
  ridersMode = "answer";
  pieceRows = [];
  purchaseRows = [];
  riderRows = [];
  unparkInvoiceComposer("project-1");
  browser.__supabaseBrowserClient = { from, rpc };
});
afterEach(() => {
  qc.clear();
  delete browser.__supabaseBrowserClient;
});

describe("SQ-1249 F1: the composer's readiness stands only on a settled read", () => {
  it("control: with the project and its hours read, Draft stands ready", async () => {
    renderComposer();
    await readyToDraft();
  });

  it("holds Draft while the projects re-read after an invalidation, the cached client still in hand", async () => {
    renderComposer();
    await readyToDraft();

    projectsMode = "hang";
    act(() => {
      void qc.invalidateQueries({ queryKey: ["projects"], exact: true });
    });

    await heldOn("Checking this project before drafting its invoice.");
    // The retained answer is still the cached one: this is a refetch, not a first read.
    expect(cachedProject()?.client_id).toBe("client-9");
  });

  it("holds Draft on why after the projects re-read fails, the cached project still in hand", async () => {
    renderComposer();
    await readyToDraft();

    projectsMode = "fail";
    act(() => {
      void qc.invalidateQueries({ queryKey: ["projects"], exact: true });
    });

    await heldOn("This project couldn't be read. Reload the page to draft its invoice.");
    expect(qc.getQueryState(["projects"])?.status).toBe("error");
    expect(cachedProject()?.client_id).toBe("client-9");
  });

  it("holds Draft while the hours re-read after an invalidation", async () => {
    renderComposer();
    await readyToDraft();

    timeMode = "hang";
    act(() => {
      void qc.invalidateQueries({ queryKey: timeKey });
    });

    await heldOn("Checking this project's hours before drafting its invoice.");
    expect(qc.getQueryData(timeKey)).toBeDefined();
  });

  it("holds Draft on why after the hours read fails", async () => {
    renderComposer();
    await readyToDraft();

    timeMode = "fail";
    act(() => {
      void qc.invalidateQueries({ queryKey: timeKey });
    });

    await heldOn("This project's hours couldn't be read. Reload the page to draft its invoice.");
    expect(qc.getQueryData(timeKey)).toBeDefined();
  });

  it.each([
    ["pieces", () => (piecesMode = "fail"), ["project-ffe-items", "project-1"]],
    ["coverage", () => (coverageMode = "fail"), ["ffe-invoice-coverage", "project-1"]],
    ["billing stages", () => (stagesMode = "fail"), ["ffe-invoice-coverage", "project-1", "stages"]],
  ] as const)("SQ-1272 F2: holds Draft on why after a cold %s read fails", async (_label, fail, key) => {
    fail();
    renderComposer();
    addLine();
    await waitFor(() => expect(qc.getQueryState([...key])?.status).toBe("error"));

    await heldOn("This project couldn't be read. Reload the page to draft its invoice.");
  });

  // SQ-1282 F4 (K3/K4) — the failed read's reason is in view before the press,
  // and the press lights it with its repair, Try again, which reads it again.
  it.each([
    ["pieces", (mode: "answer" | "fail") => (piecesMode = mode), ["project-ffe-items", "project-1"]],
    ["coverage", (mode: "answer" | "fail") => (coverageMode = mode), ["ffe-invoice-coverage", "project-1"]],
    [
      "billing stages",
      (mode: "answer" | "fail") => (stagesMode = mode),
      ["ffe-invoice-coverage", "project-1", "stages"],
    ],
  ] as const)("SQ-1282 F4: a failed %s read holds Draft on a reason in view, and the press lights it", async (_label, set, key) => {
    const reason = "This project couldn't be read. Reload the page to draft its invoice.";
    set("fail");
    renderComposer();
    addLine();
    await waitFor(() => expect(qc.getQueryState([...key])?.status).toBe("error"));
    await waitFor(() => expect(draftAct()).toHaveAttribute("aria-disabled", "true"));

    // Before the press: the reason and its repair are in view; nothing is lit.
    expect(screen.getByRole("alert")).toHaveTextContent(reason);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(reasonLine()).toHaveTextContent("");
    expect(spotWindows()).toEqual([]);

    fireEvent.click(draftAct());
    await waitFor(() => expect(spotWindows()).toEqual(["project-unread"]));
    expect(mockCreateDraft).not.toHaveBeenCalled();

    set("answer");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(draftAct()).not.toHaveAttribute("aria-disabled"));
    expect(qc.getQueryState([...key])?.status).toBe("success");
  });

  it("never reads a project the projects read did not return as ready", async () => {
    table = [];
    renderComposer();
    addLine();
    // Settled, and it did not carry the project: not pending, not ready.
    await waitFor(() => expect(qc.getQueryState(["projects"])?.status).toBe("success"));

    await heldOn("This project couldn't be read. Reload the page to draft its invoice.");
  });
});

const checkboxOf = (name: string) =>
  within(screen.getByText(name).closest("label") as HTMLElement).getByRole("checkbox");
const tryAgain = () => screen.getByRole("button", { name: "Try again" });

describe("SQ-1289 F4: a failed pieces read keeps the asked-for pieces", () => {
  it("a failed read, then a successful Try again, ticks the requested pieces", async () => {
    const key = ["project-ffe-items", "project-1"];
    pieceRows = [{ id: "ffe-1", name: "Side table", quantity: 1, unit_price_cents: 12000, room: null }];
    piecesMode = "fail";
    render(
      <InvoiceComposer context={{ projectId: "project-1", initialFfeItemIds: ["ffe-1"] }} onDrafted={jest.fn()} />,
      { wrapper: Frame },
    );
    await waitFor(() => expect(qc.getQueryState(key)?.status).toBe("error"));
    await waitFor(() => expect(draftAct()).toHaveAttribute("aria-disabled", "true"));

    piecesMode = "answer";
    fireEvent.click(tryAgain());
    await waitFor(() => expect(qc.getQueryState(key)?.status).toBe("success"));
    await waitFor(() => expect(checkboxOf("Side table")).toBeChecked());
    await waitFor(() => expect(draftAct()).not.toHaveAttribute("aria-disabled"));
  });

  it("SQ-1295 R1: a cached answer without the piece, then a failed re-read, then Try again, ticks it", async () => {
    const key = ["project-ffe-items", "project-1"];
    // The cache predates the piece; the re-read on open fails.
    qc.setQueryData(key, []);
    pieceRows = [{ id: "ffe-1", name: "Side table", quantity: 1, unit_price_cents: 12000, room: null }];
    piecesMode = "fail";
    render(
      <InvoiceComposer context={{ projectId: "project-1", initialFfeItemIds: ["ffe-1"] }} onDrafted={jest.fn()} />,
      { wrapper: Frame },
    );
    await waitFor(() => expect(qc.getQueryState(key)?.status).toBe("error"));
    expect(qc.getQueryData(key)).toEqual([]);
    await waitFor(() => expect(draftAct()).toHaveAttribute("aria-disabled", "true"));

    piecesMode = "answer";
    fireEvent.click(tryAgain());
    await waitFor(() => expect(qc.getQueryState(key)?.status).toBe("success"));
    await waitFor(() => expect(checkboxOf("Side table")).toBeChecked());
    await waitFor(() => expect(draftAct()).not.toHaveAttribute("aria-disabled"));
  });
});

describe("SQ-1289 F5: a parked purchase holds Draft until the purchases read succeeds", () => {
  const purchasesKey = ["buying-phase2", "purchases", "project:project-1"];
  const parkPurchase = () =>
    parkInvoiceComposer("project-1", {
      milestoneIds: [],
      timeEntryIds: [],
      ffeItemIds: [],
      ffeStage: "full",
      depositPctText: "50",
      balanceItemIds: [],
      purchaseIds: ["p1"],
      riderIds: [],
      overrides: [],
      adhoc: [{ description: "Design fee", quantity: "1", unitDollars: "450" }],
      taxRatePercent: "0",
      termsDays: "15",
      memo: "",
    });

  it("a failed purchases read holds Draft on why, with Try again, and creates nothing", async () => {
    parkPurchase();
    purchaseRows = [
      {
        id: "p1",
        status: "recorded",
        billable_to_client: true,
        invoice_line_id: null,
        payee_name: "CB2",
        description: "Pair of table lamps",
        purchased_on: "2026-10-03",
        amount_cents: 120050,
        tax_cents: 0,
        buyer_premium_cents: 0,
        shipping_cents: 0,
      },
    ];
    purchasesMode = "fail";
    renderComposer();
    await waitFor(() => expect(qc.getQueryState(purchasesKey)?.status).toBe("error"));

    await heldOn("This project couldn't be read. Reload the page to draft its invoice.");
    await waitFor(() => expect(spotWindows()).toEqual(["project-unread"]));
    expect(mockCreateDraft).not.toHaveBeenCalled();

    // Read back, the parked purchase is still ticked and Draft stands ready.
    purchasesMode = "answer";
    fireEvent.click(tryAgain());
    await waitFor(() => expect(draftAct()).not.toHaveAttribute("aria-disabled"));
    expect(screen.getByLabelText("Bill Pair of table lamps")).toBeChecked();
  });

  it("a purchases read still out holds Draft without the failure copy", async () => {
    parkPurchase();
    purchasesMode = "hang";
    renderComposer();

    await heldOn("Checking this project before drafting its invoice.");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByText("This project couldn't be read. Reload the page to draft its invoice.")).not.toBeInTheDocument();
  });
});

describe("SQ-1305: cached purchase and rider seeds wait for settled successful reads", () => {
  const seeds = [
    {
      section: "purchase",
      key: ["buying-phase2", "purchases", "project:project-1"],
      context: { initialPurchaseIds: ["p1"] },
      label: "Bill Pair of table lamps",
      setMode: (mode: "answer" | "hang" | "fail") => (purchasesMode = mode),
      setRows: () => {
        purchaseRows = [{
          id: "p1", status: "recorded", billable_to_client: true, invoice_line_id: null,
          payee_name: "CB2", description: "Pair of table lamps", purchased_on: "2026-10-03",
          amount_cents: 120050, tax_cents: 0, buyer_premium_cents: 0, shipping_cents: 0,
        }];
      },
    },
    {
      section: "rider",
      key: ["buying-phase2", "cost-lines", "project", "project-1"],
      context: { initialCostLineIds: ["r1"] },
      label: "Bill White Glove",
      setMode: (mode: "answer" | "hang" | "fail") => (ridersMode = mode),
      setRows: () => {
        riderRows = [{
          id: "r1", kind: "white_glove", note: null, billable_to_client: true,
          invoice_line_id: null, estimate_cents: 45_000, actual_cents: 52_000,
          purchase_order: { id: "po-1", po_number: "1042", project_id: "project-1" },
        }];
      },
    },
  ];

  it.each(seeds)("a cached answer without the requested $section stays held through fetching and failure, then retry seeds it", async ({ key, context, label, setMode, setRows }) => {
    qc.setQueryData(key, []);
    setRows();
    setMode("hang");
    render(
      <InvoiceComposer context={{ projectId: "project-1", ...context }} onDrafted={jest.fn()} />,
      { wrapper: Frame },
    );
    addLine();
    await waitFor(() => expect(qc.getQueryState(key)?.fetchStatus).toBe("fetching"));
    await heldOn("Checking this project before drafting its invoice.");
    expect(qc.getQueryData(key)).toEqual([]);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    setMode("fail");
    await act(async () => {
      await qc.refetchQueries({ queryKey: key, exact: true });
    });
    await waitFor(() => expect(qc.getQueryState(key)?.status).toBe("error"));
    expect(qc.getQueryData(key)).toEqual([]);
    const unread = "This project couldn't be read. Reload the page to draft its invoice.";
    await heldOn(unread);
    expect(screen.getByRole("alert")).toHaveTextContent(unread);
    expect(tryAgain()).toBeInTheDocument();

    setMode("answer");
    fireEvent.click(tryAgain());
    await waitFor(() => expect(qc.getQueryState(key)?.status).toBe("success"));
    await waitFor(() => expect(screen.getByLabelText(label)).toBeChecked());
    await waitFor(() => expect(draftAct()).not.toHaveAttribute("aria-disabled"));
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it.each(seeds)("a successful empty $section answer settles once without selecting a later arrival or writing", async ({ key, context, label, setRows }) => {
    render(
      <InvoiceComposer context={{ projectId: "project-1", ...context }} onDrafted={jest.fn()} />,
      { wrapper: Frame },
    );
    addLine();
    await waitFor(() => expect(qc.getQueryState(key)?.status).toBe("success"));
    expect(qc.getQueryData(key)).toEqual([]);
    await waitFor(() => expect(draftAct()).not.toHaveAttribute("aria-disabled"));

    setRows();
    await act(async () => {
      await qc.refetchQueries({ queryKey: key, exact: true });
    });
    await waitFor(() => expect(screen.getByLabelText(label)).not.toBeChecked());
    expect(draftAct()).not.toHaveAttribute("aria-disabled");
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });
});

describe("SQ-1295 R2: an asked-for purchase or rider holds Draft on a failed read, with Try again", () => {
  const unread = "This project couldn't be read. Reload the page to draft its invoice.";

  it("a requested purchase whose read fails holds Draft on why, and Try again seeds it", async () => {
    const key = ["buying-phase2", "purchases", "project:project-1"];
    purchaseRows = [
      {
        id: "p1",
        status: "recorded",
        billable_to_client: true,
        invoice_line_id: null,
        payee_name: "CB2",
        description: "Pair of table lamps",
        purchased_on: "2026-10-03",
        amount_cents: 120050,
        tax_cents: 0,
        buyer_premium_cents: 0,
        shipping_cents: 0,
      },
    ];
    purchasesMode = "fail";
    render(
      <InvoiceComposer context={{ projectId: "project-1", initialPurchaseIds: ["p1"] }} onDrafted={jest.fn()} />,
      { wrapper: Frame },
    );
    addLine();
    await waitFor(() => expect(qc.getQueryState(key)?.status).toBe("error"));

    await heldOn(unread);
    expect(screen.getByRole("alert")).toHaveTextContent(unread);
    expect(tryAgain()).toBeInTheDocument();
    await waitFor(() => expect(spotWindows()).toEqual(["project-unread"]));

    purchasesMode = "answer";
    fireEvent.click(tryAgain());
    await waitFor(() => expect(screen.getByLabelText("Bill Pair of table lamps")).toBeChecked());
    await waitFor(() => expect(draftAct()).not.toHaveAttribute("aria-disabled"));
  });

  it("a requested rider whose read fails holds Draft on why, and Try again seeds it", async () => {
    const key = ["buying-phase2", "cost-lines", "project", "project-1"];
    riderRows = [
      {
        id: "r1",
        kind: "white_glove",
        note: null,
        billable_to_client: true,
        invoice_line_id: null,
        estimate_cents: 45_000,
        actual_cents: 52_000,
        purchase_order: { id: "po-1", po_number: "1042", project_id: "project-1" },
      },
    ];
    ridersMode = "fail";
    render(
      <InvoiceComposer context={{ projectId: "project-1", initialCostLineIds: ["r1"] }} onDrafted={jest.fn()} />,
      { wrapper: Frame },
    );
    addLine();
    await waitFor(() => expect(qc.getQueryState(key)?.status).toBe("error"));

    await heldOn(unread);
    expect(screen.getByRole("alert")).toHaveTextContent(unread);
    expect(tryAgain()).toBeInTheDocument();
    await waitFor(() => expect(spotWindows()).toEqual(["project-unread"]));

    ridersMode = "answer";
    fireEvent.click(tryAgain());
    await waitFor(() => expect(screen.getByLabelText("Bill White Glove")).toBeChecked());
    await waitFor(() => expect(draftAct()).not.toHaveAttribute("aria-disabled"));
  });
});
