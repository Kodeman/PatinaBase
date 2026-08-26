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
import {
  SelectionEditor,
  SpecBookWorkspace,
  specBookArtifactRetryLabel,
} from "./spec-book-workspace";

const mutateAsync = jest.fn();
const readinessChanged = jest.fn();
const artifactRetry = jest.fn();
const opened = jest.fn();
const renderArtifactMutateAsync = jest.fn();
let mockWorkbenchHookResult: unknown;

jest.mock("@patina/supabase", () => ({
  useCreateSpecBookShare: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  usePrepareSpecBookIssue: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useProjectFfeReadiness: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
  useProjectV2: () => ({ data: { name: "Oak project" } }),
  useRenderSpecBookArtifact: () => ({
    mutateAsync: renderArtifactMutateAsync,
    isPending: false,
  }),
  useSpecBookWorkbench: () => mockWorkbenchHookResult,
  useUpdateProjectFfeSpec: () => ({
    mutateAsync,
    isPending: false,
  }),
  useUpdateSpecBookItemSetting: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}));

jest.mock("@/hooks/use-hydrated", () => ({ useHydrated: () => true }));

// SP-19/F57 — the workspace reads `?ffeItemId=` to land on one line. The
// global jest.setup mock returns an empty stub, so this file drives it.
let mockSearchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/doc/project-1/spec-book",
}));

jest.mock("@/lib/analytics/spec-book-events", () => ({
  specBookEvents: {
    addendumStarted: jest.fn(),
    artifactFailed: jest.fn(),
    artifactRendered: jest.fn(),
    artifactRetry: (props: unknown) => artifactRetry(props),
    driftDecision: jest.fn(),
    issueAttempted: jest.fn(),
    issued: jest.fn(),
    opened: (props: unknown) => opened(props),
    preflightCompleted: jest.fn(),
    readinessChanged: (props: unknown) => readinessChanged(props),
    shareCreated: jest.fn(),
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
  renderArtifactMutateAsync.mockReset();
  renderArtifactMutateAsync.mockResolvedValue({ finalized: true });
  readinessChanged.mockClear();
  artifactRetry.mockClear();
  opened.mockClear();
  mockSearchParams = new URLSearchParams();
  mockWorkbenchHookResult = {
    data: {
      book: { id: "book-1", title: "Oak project specification" },
      chapters: [],
      items: [],
      revisions: [
        {
          id: "revision-1",
          revision_number: 1,
          issue_type: "full",
          status: "pending",
          reason: null,
          created_at: "2026-08-01T00:00:00.000Z",
          issued_at: null,
        },
      ],
      artifacts: [
        {
          id: "artifact-1",
          revision_id: "revision-1",
          audience: "client",
          format: "pdf",
          status: "ready",
          error_message: null,
        },
      ],
    },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  };
});

describe("Spec Book artifact recovery actions", () => {
  it("offers finalize-only recovery for a durable artifact on an unissued revision", () => {
    expect(specBookArtifactRetryLabel("ready", "pending")).toBe("Finalize");
    expect(specBookArtifactRetryLabel("ready", "issued")).toBeNull();
  });

  it("preserves render and retry labels for artifacts that are not durable", () => {
    expect(specBookArtifactRetryLabel("pending", "pending")).toBe("Render");
    expect(specBookArtifactRetryLabel("failed", "pending")).toBe("Retry");
    expect(specBookArtifactRetryLabel("rendering", "pending")).toBeNull();
  });

  it("offers and executes finalize-only recovery from revision history", async () => {
    const user = userEvent.setup();
    render(<SpecBookWorkspace projectId="project-1" />);

    await user.click(screen.getByRole("button", { name: "Revisions" }));
    await user.click(screen.getByRole("button", { name: "Finalize" }));

    expect(renderArtifactMutateAsync).toHaveBeenCalledTimes(1);
    expect(renderArtifactMutateAsync).toHaveBeenCalledWith("artifact-1");
    expect(artifactRetry).toHaveBeenCalledWith(
      expect.objectContaining({ artifact_id: "artifact-1" }),
    );
    expect(
      await screen.findByText(
        "client artifact finalized and the revision is issued.",
      ),
    ).toBeInTheDocument();
  });

  it("reports a durable artifact as still ready when siblings block issuance", async () => {
    const user = userEvent.setup();
    renderArtifactMutateAsync.mockResolvedValueOnce({ finalized: false });
    render(<SpecBookWorkspace projectId="project-1" />);

    await user.click(screen.getByRole("button", { name: "Revisions" }));
    await user.click(screen.getByRole("button", { name: "Finalize" }));

    expect(
      await screen.findByText(
        "client artifact remains ready. Other editions must finish before the revision can issue.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/client artifact finalized/i),
    ).not.toBeInTheDocument();
  });
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

describe("SP-19/F57 — the spec book lands on the addressed FF&E line", () => {
  function withItems() {
    const base = mockWorkbenchHookResult as { data: Record<string, unknown> };
    base.data.items = [
      buildItem({}, { id: "item-1", name: "Sofa", document_code: "F-01" }),
      buildItem({}, { id: "item-2", name: "Sconce", document_code: "F-02" }),
      buildItem({}, { id: "item-3", name: "Banquette", document_code: "F-03" }),
    ];
  }

  it("selects the item named by ?ffeItemId=, not the first in the book", () => {
    withItems();
    mockSearchParams = new URLSearchParams("ffeItemId=item-3");

    const { container } = render(<SpecBookWorkspace projectId="project-1" />);

    expect(container.querySelector("#spec-book-item-item-3")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(container.querySelector("#spec-book-item-item-1")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("falls back to the first item when no line is addressed", () => {
    withItems();

    const { container } = render(<SpecBookWorkspace projectId="project-1" />);

    expect(container.querySelector("#spec-book-item-item-1")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("ignores an ffeItemId that is not in this book", () => {
    withItems();
    mockSearchParams = new URLSearchParams("ffeItemId=not-in-this-project");

    const { container } = render(<SpecBookWorkspace projectId="project-1" />);

    expect(container.querySelector("#spec-book-item-item-1")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("SP-14/F100 — the leaf's return link names the full project", () => {
    withItems();

    render(<SpecBookWorkspace projectId="project-1" />);

    expect(
      screen.getByRole("link", { name: "← Oak project" }),
    ).toBeInTheDocument();
  });
});

/**
 * F58 — the workbench is not a line-status printer and must not become a third
 * vocabulary. It reads `item.status` only as a gate on configuration revision;
 * the lifecycle word belongs to the paper's stamp and the shelf's value, both
 * of which derive it from `stamp-derivation`.
 */
describe("F58 — the workbench names no lifecycle word", () => {
  function withDeliveredLine() {
    const base = mockWorkbenchHookResult as { data: Record<string, unknown> };
    base.data.items = [
      buildItem(
        {},
        {
          id: "item-1",
          name: "Custom Walnut Sectional — 3 pc",
          document_code: "F-01",
          status: "delivered",
        },
      ),
    ];
  }

  it.each(["Delivered", "Received", "delivered", "Partial", "Damaged"])(
    "never prints %s for a delivered line",
    (word) => {
      withDeliveredLine();

      render(<SpecBookWorkspace projectId="project-1" />);

      expect(
        screen.getByText("Custom Walnut Sectional — 3 pc"),
      ).toBeInTheDocument();
      expect(screen.queryByText(word)).not.toBeInTheDocument();
    },
  );

  it("marks readiness instead — a different question, in its own words", () => {
    withDeliveredLine();

    const { container } = render(<SpecBookWorkspace projectId="project-1" />);

    expect(
      container.querySelector("#spec-book-item-item-1"),
    ).toHaveTextContent("incomplete");
  });
});
