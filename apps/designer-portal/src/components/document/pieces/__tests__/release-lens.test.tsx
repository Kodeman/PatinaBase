/**
 * T-41 (a3; S7, D1 row 6, D18, Q13): the Release lens. The table across rooms
 * `LINE · ROOM · STAGE · READINESS · FOR THE CLIENT`; the blocker sentences;
 * Leah's disposition select (placeholders print `—`); `Mark room ready for review` writes
 * only a hand-back; the ceremony names its 7 lines and $30,760, ends the set
 * with the wallpaper's install, and saves through
 * `create_furnishings_authorization_from_schedule` before opening Preview.
 * Send remains a separate preview action. Fixture: SPEC §4.2, Whole Home Renovation.
 */

import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render as testingRender, screen, within } from "@testing-library/react";

type Row = Record<string, unknown> & { id: string };

const mockItems: { data: Row[] } = { data: [] };
const mockHandbacks: { data: unknown[] } = { data: [] };
const mockThreads: Record<string, string | null> = {};
const mockTriage = jest.fn();
const mockHandBack = jest.fn();
const mockRelease = jest.fn();
const mockSend = jest.fn();
const mockVoid = jest.fn();
type Draft = { documentId: string; proposalId: string; itemIds: string[] };
/** The server's draft read (00755): `null` is no draft. */
const mockDraft: { data: Draft | null; isError: boolean } = { data: null, isError: false };
const mockDraftRefetch = jest.fn();
/** The server gate's refusals by line id; every other line it calls ready. */
const mockRefused = new Map<
  string,
  { ready: boolean; missingFields: string[] }
>();
const mockProject: { data: { id: string; client_id: string | null } } = {
  data: { id: "proj-1", client_id: "client-1" },
};

jest.mock("@patina/supabase", () => ({
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        in: async (_column: string, ids: string[]) => ({
          data: ids.map((id) => ({ id, need_label: mockThreads[id] ?? null })),
          error: null,
        }),
      }),
    }),
  }),
  useDraftRelease: () => ({
    data: mockDraft.data,
    isError: mockDraft.isError,
    refetch: mockDraftRefetch,
  }),
  useProject: () => ({ data: mockProject.data }),
  useProjectFFEItems: () => ({ data: mockItems.data }),
  useProjectFfeReadiness: (ids: readonly string[]) => ({
    data: ids.map((id) => ({
      selectionId: id,
      ...(mockRefused.get(id) ?? { ready: true, missingFields: [] }),
    })),
    isError: false,
    refetch: jest.fn(),
  }),
  useTriageProjectFfeItems: () => ({ mutate: mockTriage, isError: false }),
  useRoomHandbacks: () => ({ data: mockHandbacks.data }),
  useHandBackRoom: () => ({
    mutate: mockHandBack,
    isPending: false,
    isError: false,
  }),
}));
jest.mock("@/hooks/use-commercial-documents", () => ({
  useProjectInstruments: () => ({ data: [{ number: 2 }] }),
  useReleaseForAuthorization: () => ({
    mutateAsync: mockRelease,
    isPending: false,
  }),
  useSendFurnishingsAuthorization: () => ({
    mutateAsync: mockSend,
    isPending: false,
  }),
  useVoidAuthorization: () => ({
    mutateAsync: mockVoid,
    isPending: false,
  }),
}));
const mockInvalidate = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));
jest.mock("@/hooks/use-document-rooms", () => ({
  useDocumentRooms: () => ({
    data: [
      { id: "hall", name: "Hall" },
      { id: "living", name: "Living Room" },
      { id: "dining", name: "Dining" },
      { id: "bath", name: "Primary Bath" },
      { id: "bedroom", name: "Bedroom" },
    ],
  }),
}));

jest.mock('../../overlays/purchasing-authorization-preview-sheet', () => ({
  PurchasingAuthorizationPreviewSheet: ({ proposalId, projectId, onClose, onSent }: any) => <div role="dialog" aria-label="Saved preview"><p>{projectId}:{proposalId}</p><button onClick={onClose}>Back from preview</button><button onClick={async () => { await mockSend({ proposalId }); onSent(); }}>Complete preview send</button></div>,
}));

import { ReleaseLens } from "../release-lens";
import { ArrivalMount } from "../../arrival/arrival-mount";
import { consumeArriveToken } from "@/lib/arrival/session";

function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return testingRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

function line(
  id: string,
  room: string,
  name: string,
  over: Row | object = {},
): Row {
  const o = over as Record<string, number | undefined>;
  const quantity = o.quantity ?? 1;
  const unit = o.unit_price_cents ?? 0;
  return {
    id,
    name,
    status: "specified",
    blocked: false,
    received_quantity: null,
    product_id: null,
    vendor_id: null,
    vendor_name: null,
    item_type: "fixed",
    budget_max_cents: null,
    ffe_line_authorization: null,
    line_kind: "goods",
    parent_ffe_item_id: null,
    design_disposition: "candidate",
    assignment_scope: "room",
    project_room_id: room,
    line_total_cents: quantity * unit,
    ...over,
    quantity,
    unit_price_cents: unit,
  };
}

const ready = (over: object) => ({
  design_disposition: "selected",
  vendor_id: "v-maker",
  ...over,
});

function fixture(): Row[] {
  return [
    line("H1", "hall", "Console table"),
    line(
      "L1",
      "living",
      "Custom cabinet",
      ready({ quantity: 2, unit_price_cents: 480000 }),
    ),
    line(
      "L3",
      "living",
      "Hardware, 2 knobs for custom cabinet",
      ready({ product_id: "p-knob", quantity: 2, unit_price_cents: 3800 }),
    ),
    line("L6", "living", "Sconce", {
      product_id: "p-sconce",
      design_disposition: "alternate",
    }),
    line(
      "F1",
      "living",
      "White oak floor, satin Bona finish",
      ready({ quantity: 830, unit_price_cents: 1150 }),
    ),
    line(
      "D1",
      "dining",
      "Dining table, custom walnut",
      ready({ unit_price_cents: 680000 }),
    ),
    line(
      "T1",
      "bath",
      "Porcelain floor tile, 12 × 24, matte",
      ready({ quantity: 280, unit_price_cents: 680 }),
    ),
    line(
      "R1",
      "bedroom",
      "Wallpaper, grasscloth",
      ready({ product_id: "p-hemp", quantity: 9, unit_price_cents: 23000 }),
    ),
    line(
      "R1a",
      "bedroom",
      "Install, wallpaper hanger",
      ready({
        line_kind: "labor",
        parent_ffe_item_id: "R1",
        quantity: 9,
        unit_price_cents: 8500,
      }),
    ),
  ];
}

const props = {
  docId: "doc-1",
  projectId: "proj-1",
  room: null,
  canSeeMoney: true,
};

const rowOf = (name: string) =>
  screen.getByText(name, { selector: "td, td *" }).closest("tr") as HTMLElement;

beforeEach(() => {
  for (const id of Object.keys(mockThreads)) delete mockThreads[id];
  mockItems.data = fixture();
  mockHandbacks.data = [];
  mockTriage.mockReset();
  mockHandBack.mockReset();
  mockRelease.mockReset().mockResolvedValue({
    proposalId: "prop-3",
    documentId: "doc-3",
    itemCount: 7,
  });
  mockSend.mockReset().mockResolvedValue({});
  mockVoid.mockReset().mockResolvedValue({});
  mockDraft.data = null;
  mockDraft.isError = false;
  mockDraftRefetch.mockReset();
  mockInvalidate.mockReset().mockResolvedValue(undefined);
  mockRefused.clear();
  mockProject.data = { id: "proj-1", client_id: "client-1" };
});

/** What 00755's read returns once the W4 set has been drafted and not sent. */
const W4_DRAFT: Draft = {
  documentId: "doc-3",
  proposalId: "prop-3",
  itemIds: ["L1", "L3", "F1", "D1", "T1", "R1", "R1a"],
};

describe("ReleaseLens", () => {
  it.each([false, true])("prints the thread need label instead of the filled product name (drafted=%s)", async (drafted) => {
    mockItems.data = [line("L1", "living", "Library chair", ready({ product_id: "p-chair", selection_thread_id: "thread-chair", unit_price_cents: 190000 }))];
    mockThreads["thread-chair"] = "  Bedroom accent chair  ";
    if (drafted) mockDraft.data = { ...W4_DRAFT, itemIds: ["L1"] };
    render(<ReleaseLens {...props} />);
    const ceremony = within(screen.getByRole("region", { name: "This release" }));
    const row = await ceremony.findByText(/Bedroom accent chair/);
    expect(row.closest("li")).toHaveTextContent("Bedroom accent chair");
    expect(row.closest("li")).not.toHaveTextContent("Library chair");
  });

  it("uses the line name when there is no thread", () => {
    mockItems.data = [line("L1", "living", "Custom reading chair", ready({ unit_price_cents: 190000 }))];
    render(<ReleaseLens {...props} />);
    const ceremony = within(screen.getByRole("region", { name: "This release" }));
    expect(ceremony.getByRole("listitem")).toHaveTextContent("Custom reading chair");
  });

  it.each([
    [12, "Lead time · About 12 weeks"],
    [0, "Lead time · In stock"],
    [null, "Lead time to be confirmed"],
  ])("prints effective lead time %s as %s", (weeks, text) => {
    mockItems.data = [line("L1", "living", "Custom reading chair", ready({ unit_price_cents: 190000, effective_lead_time_weeks: weeks }))];
    render(<ReleaseLens {...props} />);
    const ceremony = within(screen.getByRole("region", { name: "This release" }));
    expect(ceremony.getByText(text as string)).toBeInTheDocument();
    expect(ceremony.getByRole("listitem")).toHaveTextContent(
      "Custom reading chair " + text + " $1,900",
    );
  });

  it("keeps Save draft & preview enabled with null lead time", async () => {
    mockItems.data = [line("L1", "living", "Custom reading chair", ready({ unit_price_cents: 190000, effective_lead_time_weeks: null }))];
    render(<ReleaseLens {...props} />);
    const save = screen.getByRole("button", { name: "Save draft & preview" });
    expect(save).toBeEnabled();
    expect(save).not.toHaveAttribute("aria-disabled", "true");
    await act(async () => { fireEvent.click(save); });
    expect(mockRelease).toHaveBeenCalledWith({ name: "Furnishings authorization № 3", ffeItemIds: ["L1"] });
  });

  it("keeps the labor prefix and suffix around its need label", async () => {
    mockItems.data = fixture().map((row) => row.id === "R1a" ? { ...row, selection_thread_id: "thread-labor" } : row);
    mockThreads["thread-labor"] = "Hang bedroom wallpaper";
    render(<ReleaseLens {...props} />);
    const ceremony = within(screen.getByRole("region", { name: "This release" }));
    expect(await ceremony.findByText(/↳ Hang bedroom wallpaper \(labor\)/)).toBeInTheDocument();
  });

  it("names an excluded selection by its thread need label", async () => {
    mockItems.data = [line("L1", "living", "Library chair", ready({ product_id: "p-chair", selection_thread_id: "thread-chair", unit_price_cents: 190000 }))];
    mockThreads["thread-chair"] = "Bedroom accent chair";
    mockRefused.set("L1", { ready: false, missingFields: ["image"] });
    render(<ReleaseLens {...props} />);
    const excluded = within(screen.getByRole("region", { name: "Excluded selections" }));
    expect(await excluded.findByText("Bedroom accent chair: Needs an image")).toBeInTheDocument();
    expect(excluded.queryByText(/Library chair/)).not.toBeInTheDocument();
  });

  it("prints the table across rooms: LINE · ROOM · STAGE · READINESS · FOR THE CLIENT · and an empty 6th column", () => {
    render(<ReleaseLens {...props} />);
    const table = screen.getByRole("table", { name: "Release" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual([
      "Line",
      "Room",
      "Stage",
      "Readiness",
      "For the client",
      "Line menu",
    ]);
    // a3: the 6th column's header is for screen readers only, its cells empty.
    expect(table.querySelectorAll("col")).toHaveLength(6);
    expect(
      within(table).getByRole("columnheader", { name: "Line menu" })
        .firstElementChild,
    ).toHaveClass("sr-only");
    for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
      const cells = Array.from(tr.children);
      const span = cells.reduce(
        (n, c) => n + Number(c.getAttribute("colspan") ?? 1),
        0,
      );
      expect(span).toBe(6);
      expect(cells[cells.length - 1].textContent).toBe("");
    }
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((th) => th.textContent),
    ).toEqual(["Hall", "Living Room", "Dining", "Primary Bath", "Bedroom"]);
  });

  it("names each line's blocker, and placeholders print — for the client", () => {
    render(<ReleaseLens {...props} />);
    const h1 = within(rowOf("Console table"));
    expect(h1.getByText("Placeholder")).toBeInTheDocument();
    expect(h1.getByText("Needs a product or a maker")).toBeInTheDocument();
    expect(h1.getByText("—")).toBeInTheDocument();
    expect(h1.queryByRole("combobox")).toBeNull();

    expect(
      within(rowOf("Sconce")).getByText("Needs a client price"),
    ).toBeInTheDocument();
    const l1 = within(rowOf("Custom cabinet"));
    expect(l1.getByText("Ready", { selector: "td" })).toBeInTheDocument();
    expect(
      l1.getByRole("combobox", { name: "For the client, Custom cabinet" }),
    ).toHaveValue("selected");
  });

  it("FOR THE CLIENT sets the disposition and leaves the room as it is", () => {
    render(<ReleaseLens {...props} />);
    const select = within(rowOf("Sconce")).getByRole("combobox");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Candidate", "Selected", "Alternate"]);
    fireEvent.change(select, { target: { value: "selected" } });
    expect(mockTriage).toHaveBeenCalledWith({
      projectId: "proj-1",
      selectionIds: ["L6"],
      assignmentScope: "room",
      roomId: "living",
      disposition: "selected",
    });
  });

  it("READY FOR LEAH records the hand-back and writes nothing else", () => {
    mockHandbacks.data = [
      {
        id: "hb-1",
        projectRoomId: "dining",
        handedBackBy: "u-1",
        handedBackAt: "2026-10-08T15:00:00Z",
      },
    ];
    render(<ReleaseLens {...props} />);
    const bedroom = screen.getByRole("button", {
      name: "Ready for Leah, Bedroom",
    });
    expect(bedroom).toHaveTextContent("Mark room ready for review");
    fireEvent.click(bedroom);
    expect(mockHandBack).toHaveBeenCalledWith({
      projectId: "proj-1",
      roomId: "bedroom",
    });
    expect(mockTriage).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Ready for Leah, Dining" }),
    ).toHaveAccessibleDescription(/^Handed back /);
  });

  it("the ceremony names its set, then the consequence, then the terminal act", async () => {
    render(<ReleaseLens {...props} />);
    const ceremony = within(
      screen.getByRole("region", { name: "This release" }),
    );
    expect(
      ceremony.getByText("This release · 7 lines · $30,760:"),
    ).toBeInTheDocument();
    const items = ceremony.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toHaveLength(7);
    expect(items[0]).toBe("Custom cabinet Lead time to be confirmed $9,600");
    expect(items[6]).toBe("↳ Install, wallpaper hanger (labor) Lead time to be confirmed $765");
    expect(
      ceremony.getByText(
        "Saving creates a draft and reserves these items. Nothing is sent to the client.",
      ),
    ).toBeInTheDocument();
    const act_ = ceremony.getByRole("button", {
      name: "Save draft & preview",
    });
    expect(act_).toHaveClass("act--terminal");

    await act(async () => {
      fireEvent.click(act_);
    });
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledWith({
      name: "Furnishings authorization № 3",
      ffeItemIds: ["L1", "L3", "F1", "D1", "T1", "R1", "R1a"],
    });
    expect(mockSend).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Draft saved. Nothing has been sent to the client.",
    );
  });

  it("keeps the saved preview across empty-set and failed draft rereads without recreation", async () => {
    const { rerender } = render(<ReleaseLens {...props} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' })); });
    mockItems.data = [];
    mockDraft.isError = true;
    rerender(<ReleaseLens {...props} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The draft check did not load');
    expect(screen.getByRole('dialog', { name: 'Saved preview' })).toHaveTextContent('proj-1:prop-3');
    fireEvent.click(screen.getByRole('button', { name: 'Back from preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(mockRelease).toHaveBeenCalledTimes(1); expect(mockSend).not.toHaveBeenCalled();
  });

  it("a draft found after a reload shows its lines with Preview and Void authorization draft, and no release", async () => {
    // A fresh mount: nothing in React state, only the server's draft read.
    mockDraft.data = W4_DRAFT;
    render(<ReleaseLens {...props} />);
    const ceremony = within(
      screen.getByRole("region", { name: "This release" }),
    );
    expect(
      ceremony.getByText("Drafted, not sent · 7 lines · $30,760:"),
    ).toBeInTheDocument();
    const items = ceremony.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toHaveLength(7);
    expect(items[0]).toBe("Custom cabinet Lead time to be confirmed $9,600");
    expect(items[6]).toBe("↳ Install, wallpaper hanger (labor) Lead time to be confirmed $765");
    expect(screen.queryByRole("button", { name: /^Release / })).toBeNull();

    // Lines on the draft are not READY: they read "On a drafted release".
    const l1 = within(rowOf("Custom cabinet"));
    expect(l1.getByText("On a drafted release")).toBeInTheDocument();
    expect(l1.queryByText("Ready", { selector: "td" })).toBeNull();
    expect(l1.queryByRole("combobox")).toBeNull();

    await act(async () => {
      fireEvent.click(ceremony.getByRole("button", { name: "Preview" }));
    });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Saved preview' })).toHaveTextContent('proj-1:prop-3');
    fireEvent.click(screen.getByRole('button', { name: 'Back from preview' }));
    expect(mockVoid).not.toHaveBeenCalled(); expect(mockDraftRefetch).not.toHaveBeenCalled();
  });

  it("VOID THE DRAFT voids by proposal id with a reason, then re-reads the draft", async () => {
    mockDraft.data = W4_DRAFT;
    render(<ReleaseLens {...props} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Void authorization draft" }));
    });
    expect(mockVoid).toHaveBeenCalledTimes(1);
    const [{ proposalId, reason }] = mockVoid.mock.calls[0];
    expect(proposalId).toBe("prop-3");
    expect(reason.trim().length).toBeGreaterThanOrEqual(5);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockDraftRefetch).toHaveBeenCalled();
  });

  it("with no client linked the act is a sentence and nothing is drafted", async () => {
    mockProject.data = { id: "proj-1", client_id: null };
    render(<ReleaseLens {...props} />);
    const region = screen.getByRole("region", { name: "This release" });
    expect(
      within(region).getByText("Link a client to this job before releasing."),
    ).toBeInTheDocument();
    expect(within(region).queryByRole("button")).toBeNull();
    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("prints cents in the ceremony when they are not zero", () => {
    mockItems.data = fixture().map((l) =>
      l.id === "L1"
        ? { ...l, unit_price_cents: 479975, line_total_cents: 959950 }
        : l,
    );
    render(<ReleaseLens {...props} />);
    const ceremony = within(
      screen.getByRole("region", { name: "This release" }),
    );
    expect(
      ceremony.getByText("This release · 7 lines · $30,759.50:"),
    ).toBeInTheDocument();
    expect(ceremony.getAllByRole("listitem")[0]).toHaveTextContent(
      "Custom cabinet Lead time to be confirmed $9,599.50",
    );
    expect(
      ceremony.getByRole("button", {
        name: "Save draft & preview",
      }),
    ).toBeInTheDocument();
  });

  it("after release the lines read RELEASED and the act is gone", () => {
    const { rerender } = render(<ReleaseLens {...props} />);
    mockItems.data = fixture().map((l) =>
      ["H1", "L6"].includes(l.id)
        ? l
        : { ...l, ffe_line_authorization: "sent" },
    );
    rerender(<ReleaseLens {...props} />);
    for (const name of [
      "Custom cabinet",
      "Wallpaper, grasscloth",
      "Install, wallpaper hanger",
    ]) {
      const row = within(rowOf(name));
      expect(row.getByText("Released")).toHaveClass("stamp--released");
      expect(row.queryByRole("combobox")).toBeNull();
      expect(row.getByText("Selected")).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /^Release / })).toBeNull();
  });

  it("T-60d F15: a maker named but not on file is never READY, leaves the set, and the ceremony says why", async () => {
    mockItems.data = fixture().map((l) =>
      l.id === "D1"
        ? { ...l, vendor_id: null, vendor_name: "Woodward & Sons" }
        : l,
    );
    mockRefused.set("D1", { ready: false, missingFields: ["vendor"] });
    render(<ReleaseLens {...props} />);

    const d1 = rowOf("Dining table, custom walnut");
    expect(d1.querySelector(".stamp--ready")).toBeNull();
    expect(within(d1).queryByText("Ready")).toBeNull();
    // The STAGE cell and the READINESS cell both name the designer's next act.
    expect(
      within(d1).getAllByText("Pick the maker from your vendors"),
    ).toHaveLength(2);
    // Every other ready line still prints its D1 word.
    expect(
      within(rowOf("Custom cabinet")).getByText("Ready", {
        selector: ".stamp",
      }),
    ).toHaveClass("stamp--ready");

    const ceremony = within(
      screen.getByRole("region", { name: "This release" }),
    );
    expect(
      ceremony.getByText("This release · 6 lines · $23,960:"),
    ).toBeInTheDocument();
    const leftOut = within(
      ceremony.getByRole("region", { name: "Excluded selections" }),
    );
    expect(
      leftOut.getAllByRole("listitem").map((li) => li.textContent),
    ).toEqual([
      "Dining table, custom walnut: Pick the maker from your vendors",
    ]);
    await act(async () => {
      fireEvent.click(
        ceremony.getByRole("button", {
          name: "Save draft & preview",
        }),
      );
    });
    expect(mockRelease.mock.calls[0][0].ffeItemIds).not.toContain("D1");
  });

  it("T-60d F16: a refusal reads as a sentence, never SQL text", async () => {
    mockRelease.mockRejectedValueOnce(
      new Error(
        "project e6590000-0000-0000-0000-000000000001 has no executed design-services origin",
      ),
    );
    render(<ReleaseLens {...props} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save draft & preview|^Preview$/ }));
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Sign the design agreement with the client before releasing pieces.",
    );
    expect(alert).not.toHaveTextContent(/design-services origin|e6590000/);
  });

  it("T-60j F20: after a release the lens re-reads its lines, the server gate and the draft, and settles with the done note", async () => {
    const { rerender } = render(<ReleaseLens {...props} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save draft & preview|^Preview$/ }));
    });
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["project-ffe-items", "proj-1"],
    });
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["project-ffe-readiness"],
    });
    expect(mockDraftRefetch).toHaveBeenCalled();
    // The re-read lands: the released lines carry their sent authorization.
    mockItems.data = fixture().map((l) =>
      ["H1", "L6"].includes(l.id)
        ? l
        : { ...l, ffe_line_authorization: "sent" },
    );
    rerender(<ReleaseLens {...props} />);
    expect(screen.queryByRole("button", { name: /^Release / })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Draft saved. Nothing has been sent to the client.",
    );
    expect(within(rowOf("Custom cabinet")).getByText("Released")).toBeInTheDocument();
  });

  it("T-60j F20: a second press never releases twice, while the act runs or while the lens re-reads", async () => {
    let finishRelease!: (v: unknown) => void;
    mockRelease.mockImplementationOnce(
      () => new Promise((resolve) => (finishRelease = resolve)),
    );
    const rereads: Array<() => void> = [];
    mockInvalidate.mockImplementation(
      () => new Promise<void>((resolve) => rereads.push(resolve)),
    );
    render(<ReleaseLens {...props} />);
    const releaseAct = screen.getByRole("button", { name: /Save draft & preview|^Preview$/ });
    // Two presses in the same tick, before React re-renders.
    await act(async () => {
      fireEvent.click(releaseAct);
      fireEvent.click(releaseAct);
    });
    expect(releaseAct).toHaveAttribute("aria-disabled", "true");
    await act(async () => {
      finishRelease({ proposalId: "prop-3", documentId: "doc-3", itemCount: 7 });
    });
    // Draft saved, not sent; the reread has not landed, so the old set still shows.
    expect(mockSend).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Draft saved");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save draft & preview|^Preview$/ }));
    });
    expect(mockRelease).toHaveBeenCalledTimes(1);
    await act(async () => {
      rereads.forEach((resolve) => resolve());
    });
    expect(
      screen.getByRole("button", { name: /Save draft & preview|^Preview$/ }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("a seat without money sees the table and never the ceremony", () => {
    render(<ReleaseLens {...props} canSeeMoney={false} />);
    expect(screen.getByRole("table", { name: "Release" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "This release" })).toBeNull();
    expect(screen.queryByText(/\$30,760/)).toBeNull();
  });
});


it('does not attach a completed old-project save to a replacement project', async () => {
  let finish!: (v: unknown) => void;
  mockRelease.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { rerender } = render(<ReleaseLens {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' }));
  rerender(<ReleaseLens {...props} projectId="project-2" />);
  await act(async () => { finish({ proposalId: 'old-project-draft' }); });
  expect(screen.queryByRole('dialog', { name: 'Saved preview' })).not.toBeInTheDocument();
  expect(mockRelease).toHaveBeenCalledTimes(1); expect(mockSend).not.toHaveBeenCalled();
});

it('does not recreate after a successful save loses its response identity', async () => {
  mockRelease.mockResolvedValueOnce({}); render(<ReleaseLens {...props} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' })); });
  const save = screen.getByRole('button', { name: 'Save draft & preview' });
  expect(save).toHaveAttribute('aria-disabled', 'true');
  await act(async () => { fireEvent.click(save); });
  expect(mockRelease).toHaveBeenCalledTimes(1); expect(mockSend).not.toHaveBeenCalled();
});


describe('saved release lifecycle repair', () => {
  it.each(['delivered', 'pending_retry'])('retires draft-only actions after %s Send even while refresh rejects', async (delivery) => {
    mockDraft.data = W4_DRAFT;
    mockSend.mockResolvedValue({ sentAt: '2026-10-19', proposalSendDispatchId: 'dispatch-3', _emailDeliveryState: delivery });
    let rejectRefresh!: (error: Error) => void;
    mockDraftRefetch.mockImplementation(() => new Promise((_, reject) => { rejectRefresh = reject; }));
    const { rerender } = render(<ReleaseLens {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const staleVoid = screen.getByRole('button', { name: 'Void authorization draft' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Complete preview send' })); });
    expect(screen.queryByRole('button', { name: 'Void authorization draft' })).not.toBeInTheDocument();
    fireEvent.click(staleVoid);
    expect(mockVoid).not.toHaveBeenCalled();
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['project-ffe-items', 'proj-1'] });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['project-ffe-readiness'] });
    expect(mockDraftRefetch).toHaveBeenCalledTimes(1);
    await act(async () => { rejectRefresh(new Error('offline')); });
    rerender(<ReleaseLens {...props} />);
    expect(screen.queryByText(/These lines are on a drafted release/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Void authorization draft' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Authorization sent');
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockVoid).not.toHaveBeenCalled();
  });

  it('prepares a new identity after same-mounted preview Back and successful explicit Void', async () => {
    const { rerender } = render(<ReleaseLens {...props} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' })); });
    fireEvent.click(screen.getByRole('button', { name: 'Back from preview' }));
    mockDraft.data = W4_DRAFT;
    rerender(<ReleaseLens {...props} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Void authorization draft' })); });
    mockDraft.data = null;
    mockRelease.mockResolvedValueOnce({ proposalId: 'prop-4', documentId: 'doc-4' });
    rerender(<ReleaseLens {...props} />);
    expect(screen.queryByRole('button', { name: 'Save draft & preview' })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' })); });
    expect(screen.getByRole('dialog', { name: 'Saved preview' })).toHaveTextContent('proj-1:prop-4');
    expect(mockRelease).toHaveBeenCalledTimes(2);
    expect(mockVoid).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('retains the same saved identity after failed explicit Void', async () => {
    mockDraft.data = W4_DRAFT;
    mockVoid.mockRejectedValueOnce(new Error('Void refused'));
    render(<ReleaseLens {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back from preview' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Void authorization draft' })); });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('dialog', { name: 'Saved preview' })).toHaveTextContent('proj-1:prop-3');
    expect(mockVoid).toHaveBeenCalledTimes(1);
    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('restores No selections yet for a money seat without a retained or pending draft', () => {
    mockItems.data = [];
    render(<ReleaseLens {...props} />);
    expect(screen.queryByText(/No selections yet. Add them in Preliminary selections/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save draft & preview' })).not.toBeInTheDocument();
    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('checkpoint refusal recovery', () => {
  const CHECKPOINT_REFUSAL =
    'latest furnishings checkpoint must be acknowledged before releasing project proj-1';
  // The Document's existing arrival landing: /doc/[id] consumes this token on
  // mount, unfolds Money and focuses its heading (page.test.tsx R-DM21).
  const MONEY_TOKEN = {
    via: 'act',
    to: '/doc/doc-1',
    at: expect.any(Number),
    landing: { kind: 'region', region: 'money' },
  };
  const spendToken = () => consumeArriveToken('/doc/doc-1', Date.now());

  beforeEach(() => {
    window.sessionStorage.clear();
    // The (document) layout mounts this above every /doc route, Pieces included.
    render(<ArrivalMount />);
  });

  it('explains the checkpoint and opens Working budget through the Document money landing by keyboard', async () => {
    mockRelease.mockRejectedValueOnce(new Error(CHECKPOINT_REFUSAL));
    render(<ReleaseLens {...props} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Acknowledge the latest furnishings checkpoint on the Document before releasing.');
    const recovery = screen.getByRole('region', { name: 'Working budget recovery' });
    expect(recovery).toHaveTextContent('A budget checkpoint is planning alignment with the client, not purchase approval, a signature or payment.');
    expect(recovery).toHaveTextContent('Open Working budget to review the current checkpoint. Publish one only if none is published or the current checkpoint no longer covers this selection.');
    expect(recovery).toHaveTextContent('If it is already published and covers this selection, ask the client to review and acknowledge it in their project ledger; publishing again will not acknowledge it.');
    const open = within(recovery).getByRole('link', { name: 'Open Working budget' });
    expect(open).toHaveAttribute('href', '/doc/doc-1');
    expect(open).not.toHaveAttribute('aria-disabled');
    expect(open).not.toHaveAttribute('tabindex', '-1');
    open.focus();
    expect(open).toHaveFocus();
    // detail 0 is a keyboard activation (Enter on the focused link).
    fireEvent.click(open, { detail: 0 });
    expect(spendToken()).toEqual(MONEY_TOKEN);
    // The selection stays where the server holds it; nothing else is done for her.
    expect(mockTriage).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockVoid).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('holds Working budget while the failed save is still re-reading', async () => {
    mockRelease.mockRejectedValueOnce(new Error(CHECKPOINT_REFUSAL));
    const rereads: Array<() => void> = [];
    mockInvalidate.mockImplementation(() => new Promise<void>((resolve) => rereads.push(resolve)));
    render(<ReleaseLens {...props} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' })); });
    const open = screen.getByRole('link', { name: 'Open Working budget' });
    expect(open).toHaveAttribute('aria-disabled', 'true');
    expect(fireEvent.click(open, { detail: 1 })).toBe(false);
    expect(spendToken()).toBeNull();
    await act(async () => { rereads.forEach((resolve) => resolve()); });
    expect(open).not.toHaveAttribute('aria-disabled');
    fireEvent.click(open, { detail: 1 });
    expect(spendToken()).toEqual(MONEY_TOKEN);
  });

  it('keeps an unrelated refusal as its own sentence with no Working budget act', async () => {
    mockRelease.mockRejectedValueOnce(new Error('project proj-1 has no executed design-services origin'));
    render(<ReleaseLens {...props} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Sign the design agreement with the client before releasing pieces.');
    expect(screen.queryByRole('region', { name: 'Working budget recovery' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open Working budget' })).not.toBeInTheDocument();
  });
});
