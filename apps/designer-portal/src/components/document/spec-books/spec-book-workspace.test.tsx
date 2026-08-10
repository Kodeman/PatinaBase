/**
 * SelectionEditor — the structured dimensions swap (P2-9).
 *
 * `@patina/supabase` isn't module-mapped in this app's jest config, so it's
 * mocked whole with a factory (patina-testing convention). Only
 * `useUpdateProjectFfeSpec` is exercised — every other hook this module
 * imports (for `SpecBookWorkspace`, not rendered here) is a harmless stub.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SpecBookWorkItem } from "@patina/supabase";
import { SelectionEditor } from "./spec-book-workspace";

const mutateAsync = jest.fn();
const readinessChanged = jest.fn();

jest.mock("@patina/supabase", () => ({
  useCreateSpecBookShare: jest.fn(),
  useFinalizeSpecBookIssue: jest.fn(),
  usePrepareSpecBookIssue: jest.fn(),
  useProjectV2: jest.fn(),
  useRenderSpecBookArtifact: jest.fn(),
  useSpecBookWorkbench: jest.fn(),
  useUpdateProjectFfeSpec: () => ({
    mutateAsync,
    isPending: false,
  }),
  useUpdateSpecBookItemSetting: jest.fn(),
}));

jest.mock("@/lib/analytics/spec-book-events", () => ({
  specBookEvents: {
    readinessChanged: (props: unknown) => readinessChanged(props),
  },
}));

function buildSpec(
  overrides: Partial<NonNullable<SpecBookWorkItem["spec"]>> = {},
): NonNullable<SpecBookWorkItem["spec"]> {
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
    selected_dimensions: { width: "72", depth: "38", height: "30", unit: "in" },
    exact_location: "living room",
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
    ...overrides,
  };
}

function buildItem(
  specOverrides: Partial<NonNullable<SpecBookWorkItem["spec"]>> = {},
  itemOverrides: Partial<SpecBookWorkItem> = {},
): SpecBookWorkItem {
  return {
    id: "item-1",
    project_id: "project-1",
    project_room_id: null,
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
    selected_dimensions: { width: "72", depth: "38", height: "30", unit: "in" },
    dimensions: null,
    exact_location: "living room",
    lead_time: null,
    unit_price_cents: null,
    trade_price_cents: null,
    markup_percent: null,
    updated_at: "2026-08-01T00:00:00.000Z",
    custom_fields: {},
    room: null,
    product: null,
    spec: buildSpec(specOverrides),
    setting: null,
    ...itemOverrides,
  };
}

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({});
  readinessChanged.mockClear();
});

describe("SelectionEditor — structured dimensions", () => {
  it("renders authoritative readiness as read-only guidance", () => {
    render(
      <SelectionEditor
        item={buildItem()}
        readiness="incomplete"
        missingFields={["finish", "selected_dimensions"]}
      />,
    );
    expect(screen.getByText("incomplete")).toHaveAttribute(
      "title",
      "Missing: finish, selected_dimensions",
    );
    expect(screen.queryByRole("combobox", { name: "Readiness" })).not.toBeInTheDocument();
  });

  it("renders the DimensionFields control seeded from the spec's selected_dimensions", () => {
    render(<SelectionEditor item={buildItem()} />);
    expect(screen.getByLabelText("width")).toHaveValue("72");
    expect(screen.getByLabelText("depth")).toHaveValue("38");
    expect(screen.getByLabelText("height")).toHaveValue("30");
    expect(screen.getByLabelText("unit")).toHaveValue("in");
  });

  it("saves the parsed structured object on Save selection, expectedRowVersion intact", async () => {
    const onSaved = jest.fn();
    render(<SelectionEditor item={buildItem()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("width"), {
      target: { value: "84" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));
    await screen.findByText("Selection saved.");

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const call = mutateAsync.mock.calls[0][0];
    expect(call.projectId).toBe("project-1");
    expect(call.specId).toBe("spec-1");
    expect(call.expectedRowVersion).toBe(3);
    expect(call.changes.selected_dimensions).toEqual({
      width: "84",
      depth: "38",
      height: "30",
      unit: "in",
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("saves null once every dimension field is cleared", async () => {
    render(
      <SelectionEditor
        item={buildItem({
          selected_dimensions: { width: "72", depth: "", height: "", unit: "in" },
        })}
      />,
    );
    fireEvent.change(screen.getByLabelText("width"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));
    await screen.findByText("Selection saved.");
    expect(mutateAsync.mock.calls[0][0].changes.selected_dimensions).toBeNull();
  });
});

describe("SelectionEditor — legacy non-object fallback", () => {
  it("shows the raw JSON editor (not DimensionFields) for a legacy string value", () => {
    render(
      <SelectionEditor
        item={buildItem({ selected_dimensions: "32x30x18" as never })}
      />,
    );
    expect(screen.queryByLabelText("width")).toBeNull();
    expect(screen.getByText("Use structured editor")).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(
      '{"width":"32 in","height":"30 in"}',
    );
    expect(textarea).toHaveValue('"32x30x18"');
  });

  it("saves the legacy value unchanged when the raw editor is untouched", async () => {
    render(
      <SelectionEditor
        item={buildItem({ selected_dimensions: "32x30x18" as never })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));
    await screen.findByText("Selection saved.");
    expect(mutateAsync.mock.calls[0][0].changes.selected_dimensions).toBe(
      "32x30x18",
    );
  });

  it("blocks save with the JSON feedback message on invalid raw JSON", async () => {
    render(
      <SelectionEditor
        item={buildItem({ selected_dimensions: "32x30x18" as never })}
      />,
    );
    fireEvent.change(
      screen.getByPlaceholderText('{"width":"32 in","height":"30 in"}'),
      { target: { value: "{not json" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));
    expect(
      await screen.findByText(
        'Dimensions must be valid JSON, for example {"width":"32 in"}.',
      ),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

describe("SelectionEditor — raw JSON toggle", () => {
  it("switches from structured to raw, pre-filled with the current value", async () => {
    const user = userEvent.setup();
    render(<SelectionEditor item={buildItem()} />);
    await user.click(screen.getByText("Edit raw JSON"));
    const textarea = screen.getByPlaceholderText(
      '{"width":"32 in","height":"30 in"}',
    );
    expect(textarea).toHaveValue(
      JSON.stringify(
        { width: "72", depth: "38", height: "30", unit: "in" },
        null,
        2,
      ),
    );
  });

  it("switches raw back to structured, hydrating the DimensionFields inputs", async () => {
    const user = userEvent.setup();
    render(<SelectionEditor item={buildItem()} />);
    await user.click(screen.getByText("Edit raw JSON"));
    const textarea = screen.getByPlaceholderText(
      '{"width":"32 in","height":"30 in"}',
    );
    fireEvent.change(textarea, {
      target: { value: '{"width":"90","depth":"40","height":"32","unit":"cm"}' },
    });
    await user.click(screen.getByText("Use structured editor"));

    expect(screen.getByLabelText("width")).toHaveValue("90");
    expect(screen.getByLabelText("unit")).toHaveValue("cm");
    expect(screen.queryByText("Use structured editor")).toBeNull();
  });

  it("blocks switching back to structured on invalid JSON, keeping the raw editor open", async () => {
    const user = userEvent.setup();
    render(<SelectionEditor item={buildItem()} />);
    await user.click(screen.getByText("Edit raw JSON"));
    fireEvent.change(
      screen.getByPlaceholderText('{"width":"32 in","height":"30 in"}'),
      { target: { value: "{broken" } },
    );
    await user.click(screen.getByText("Use structured editor"));

    expect(
      await screen.findByText(
        'Dimensions must be valid JSON, for example {"width":"32 in"}.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("width")).toBeNull();
  });

  it("rejects a non-object JSON value (e.g. an array) when switching back", async () => {
    const user = userEvent.setup();
    render(<SelectionEditor item={buildItem()} />);
    await user.click(screen.getByText("Edit raw JSON"));
    fireEvent.change(
      screen.getByPlaceholderText('{"width":"32 in","height":"30 in"}'),
      { target: { value: "[1,2,3]" } },
    );
    await user.click(screen.getByText("Use structured editor"));

    expect(
      await screen.findByText(/needs an object like/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("width")).toBeNull();
  });

  it("round-trips edits made in the structured editor through the raw toggle and back to save", async () => {
    const user = userEvent.setup();
    render(<SelectionEditor item={buildItem()} />);
    fireEvent.change(screen.getByLabelText("depth"), {
      target: { value: "42" },
    });
    await user.click(screen.getByText("Edit raw JSON"));
    expect(
      screen.getByPlaceholderText('{"width":"32 in","height":"30 in"}'),
    ).toHaveValue(
      JSON.stringify(
        { width: "72", depth: "42", height: "30", unit: "in" },
        null,
        2,
      ),
    );
  });
});
