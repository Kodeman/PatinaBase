/**
 * T-7 — the spec book's way back to the line, its Room select, and "lines".
 *
 * `@patina/supabase` isn't module-mapped in this app's jest config, so it's
 * mocked whole with a factory (patina-testing convention). The rooms hooks
 * are mocked at the portal module so the Room select's write is observable.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { SpecBookWorkItem } from "@patina/supabase";
import { SelectionEditor, SpecBookWorkspace } from "../spec-book-workspace";

const assignMutate = jest.fn();
const refetch = jest.fn();
let mockAssignState: {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
  submittedAt: number;
};
let mockWorkbenchHookResult: unknown;

jest.mock("@patina/supabase", () => ({
  useCreateSpecBookShare: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePrepareSpecBookIssue: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProjectFfeReadiness: () => ({ data: [], isLoading: false, isError: false }),
  useProjectV2: () => ({ data: { name: "Oak project" } }),
  useRenderSpecBookArtifact: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSpecBookWorkbench: () => mockWorkbenchHookResult,
  useUpdateProjectFfeSpec: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateSpecBookItemSetting: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/use-document-rooms", () => ({
  useDocumentRooms: () => ({
    data: [
      { id: "room-living", name: "Living room" },
      { id: "room-dining", name: "Dining room" },
    ],
  }),
  useAssignLineRoom: () => ({ mutate: assignMutate, ...mockAssignState }),
}));

jest.mock("@/hooks/use-hydrated", () => ({ useHydrated: () => true }));

let mockSearchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/doc/project-1/spec-book",
}));

jest.mock("@/lib/analytics/spec-book-events", () => ({
  specBookEvents: new Proxy({}, { get: () => jest.fn() }),
}));

type Row = SpecBookWorkItem & { assignment_scope?: string };

function buildSpec(): NonNullable<SpecBookWorkItem["spec"]> {
  return {
    id: "spec-1",
    ffe_item_id: "item-1",
    configuration_id: null,
    configuration_snapshot: null,
    configuration_snapshot_hash: null,
    configuration_locked_at: null,
    sku: "SKU-1",
    finish: "matte",
    material: "oak",
    color_fabric: "walnut",
    selected_dimensions: null,
    exact_location: null,
    client_notes: null,
    trade_notes: null,
    install_notes: null,
    care_notes: null,
    warranty_notes: null,
    selected_media: [],
    source_verifications: {},
    na_declarations: {},
    field_provenance: {},
    readiness_status: "draft",
    row_version: 3,
    updated_at: "2026-08-01T00:00:00.000Z",
  } as NonNullable<SpecBookWorkItem["spec"]>;
}

function buildItem(overrides: Partial<Row> = {}): Row {
  return {
    id: "item-1",
    project_id: "project-1",
    project_room_id: null,
    assignment_scope: "unassigned",
    slot_id: null,
    product_id: null,
    name: "Sofa",
    document_code: "F-01",
    item_type: "fixed",
    status: "selected",
    quantity: 1,
    purchase_order_id: null,
    image_url: null,
    vendor_name: null,
    sku: "SKU-1",
    finish: "matte",
    material: "oak",
    color_fabric: "walnut",
    selected_dimensions: null,
    dimensions: null,
    exact_location: null,
    lead_time: null,
    unit_price_cents: null,
    trade_price_cents: null,
    markup_percent: null,
    updated_at: "2026-08-01T00:00:00.000Z",
    custom_fields: {},
    room: null,
    product: null,
    spec: buildSpec(),
    setting: null,
    ...overrides,
  };
}

beforeEach(() => {
  assignMutate.mockReset();
  refetch.mockReset();
  mockAssignState = {
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    submittedAt: 0,
  };
  mockSearchParams = new URLSearchParams();
  mockWorkbenchHookResult = {
    data: {
      book: { id: "book-1", title: "Oak project specification" },
      chapters: [],
      items: [
        buildItem({ id: "item-1", name: "Sofa", document_code: "F-01" }),
        buildItem({ id: "item-2", name: "Sconce", document_code: "F-02" }),
        buildItem({ id: "item-3", name: "Banquette", document_code: "F-03" }),
      ],
      revisions: [],
      artifacts: [],
    },
    isLoading: false,
    error: null,
    refetch,
  };
});

describe("T-7 — back to the line", () => {
  it("returns to the line it was opened from as /doc/<id>#line-<ffeItemId>", () => {
    mockSearchParams = new URLSearchParams("ffeItemId=item-3");

    render(<SpecBookWorkspace projectId="project-1" />);

    expect(screen.getByRole("link", { name: "← Oak project" })).toHaveAttribute(
      "href",
      "/doc/project-1#line-item-3",
    );
  });

  it("returns to the paper's top when no line was addressed", () => {
    render(<SpecBookWorkspace projectId="project-1" />);

    expect(screen.getByRole("link", { name: "← Oak project" })).toHaveAttribute(
      "href",
      "/doc/project-1",
    );
  });
});

describe("T-7 — the item editor's Room select", () => {
  it("shows the row's room and offers the paper's three choices", () => {
    render(
      <SelectionEditor
        item={buildItem({
          assignment_scope: "room",
          project_room_id: "room-dining",
        })}
      />,
    );

    const select = screen.getByLabelText("Room") as HTMLSelectElement;
    expect(select.value).toBe("room:room-dining");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Not in a room yet", "Throughout", "Living room", "Dining room"]);
  });

  it("writes a room through useAssignLineRoom with assignmentScope 'room'", () => {
    render(<SelectionEditor item={buildItem()} />);

    fireEvent.change(screen.getByLabelText("Room"), {
      target: { value: "room:room-living" },
    });

    expect(assignMutate).toHaveBeenCalledWith({
      itemId: "item-1",
      roomId: "room-living",
      assignmentScope: "room",
    });
  });

  it.each([
    ["unassigned", "unassigned"],
    ["throughout", "throughout"],
  ])("writes %s with roomId null and an explicit scope", (value, scope) => {
    render(
      <SelectionEditor
        item={buildItem({
          assignment_scope: "room",
          project_room_id: "room-living",
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Room"), { target: { value } });

    expect(assignMutate).toHaveBeenCalledWith({
      itemId: "item-1",
      roomId: null,
      assignmentScope: scope,
    });
  });

  it("refreshes the workbench once the write lands", () => {
    mockAssignState = { ...mockAssignState, isSuccess: true, submittedAt: 1 };

    render(<SelectionEditor item={buildItem()} onRoomAssigned={refetch} />);

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps an unsaved draft when the refreshed row comes back with a new room", () => {
    const spec = buildSpec();
    const { rerender } = render(
      <SelectionEditor item={buildItem({ spec })} />,
    );

    const finish = screen.getByLabelText("Finish") as HTMLInputElement;
    fireEvent.change(finish, { target: { value: "oiled bronze" } });

    rerender(
      <SelectionEditor
        item={buildItem({
          spec,
          assignment_scope: "room",
          project_room_id: "room-living",
        })}
      />,
    );

    expect((screen.getByLabelText("Finish") as HTMLInputElement).value).toBe(
      "oiled bronze",
    );
    expect((screen.getByLabelText("Room") as HTMLSelectElement).value).toBe(
      "room:room-living",
    );
  });

  it("prints the refusal when the write is refused", () => {
    mockAssignState = {
      ...mockAssignState,
      isError: true,
      error: new Error("Released lines change through Record a change."),
    };

    render(<SelectionEditor item={buildItem()} />);

    expect(
      screen.getByText("Released lines change through Record a change."),
    ).toBeInTheDocument();
  });
});

describe('T-7 — the spec book says "lines"', () => {
  it("counts lines in the header and names its list lines", () => {
    render(<SpecBookWorkspace projectId="project-1" />);

    expect(screen.getByText(/Working book · 3 lines ·/)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Spec book lines" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/selections/)).not.toBeInTheDocument();
  });

  it("checks lines in preflight", () => {
    render(<SpecBookWorkspace projectId="project-1" />);

    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Spec book workspace" }))
        .getByRole("button", { name: "Preflight" }),
    );

    expect(screen.getByText(/3\s+lines checked/)).toBeInTheDocument();
    expect(screen.queryByText(/selections/)).not.toBeInTheDocument();
  });
});
