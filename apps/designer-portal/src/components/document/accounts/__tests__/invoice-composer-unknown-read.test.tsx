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
 */
import { type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvoiceComposer } from "../invoice-composer";

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
  useFfeInvoiceCoverage: () => ({ data: undefined, isLoading: false }),
  useFfeInvoiceStageCoverage: () => ({ data: undefined, isLoading: false }),
  useAddInvoiceBillingLines: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProjectPoCostLines: () => ({ data: [], isLoading: false }),
  useOrganizations: () => ({
    data: [{ id: "studio-1", name: "Middle West Studio", type: "design_studio", status: "active" }],
    isLoading: false,
  }),
  useProjectFFEItems: () => ({ data: [], isLoading: false }),
  useProjectInvoices: () => ({ data: [] }),
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

function respond(mode: "answer" | "hang" | "fail", rows: () => unknown[], what: string) {
  if (mode === "hang") return new Promise<never>(() => {});
  if (mode === "fail") return Promise.resolve({ data: null, error: { message: `${what} read failed` } });
  return Promise.resolve({ data: rows(), error: null });
}

function from(name: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () =>
      name === "projects"
        ? respond(projectsMode, () => table.map((p) => ({ ...p })), "projects")
        : respond(timeMode, () => [], "hours"),
  };
  return builder;
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
  browser.__supabaseBrowserClient = { from };
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

  it("never reads a project the projects read did not return as ready", async () => {
    table = [];
    renderComposer();
    addLine();
    // Settled, and it did not carry the project: not pending, not ready.
    await waitFor(() => expect(qc.getQueryState(["projects"])?.status).toBe("success"));

    await heldOn("This project couldn't be read. Reload the page to draft its invoice.");
  });
});
