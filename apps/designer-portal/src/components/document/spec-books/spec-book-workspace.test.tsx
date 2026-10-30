/**
 * SelectionEditor — the structured dimensions swap (P2-9).
 *
 * `@patina/supabase` isn't module-mapped in this app's jest config, so it's
 * mocked whole with a factory (patina-testing convention). Only
 * `useUpdateProjectFfeSpec` is exercised — every other hook this module
 * imports (for `SpecBookWorkspace`, not rendered here) is a harmless stub.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SpecBookWorkItem } from "@patina/supabase";
import {
  SelectionEditor,
  SpecBookWorkspace,
  specBookArtifactRetryLabel,
} from "./spec-book-workspace";

const mutateAsync = jest.fn();
const prepareIssueMutateAsync = jest.fn();
const readinessChanged = jest.fn();
const artifactRetry = jest.fn();
const opened = jest.fn();
const renderArtifactMutateAsync = jest.fn();
let mockWorkbenchHookResult: unknown;
let mockUpdatePending = false;
let mockProjectData: { name: string; studio_id: string | null } = { name: "Oak project", studio_id: "studio-1" };
let mockReadinessData: Array<{
  selectionId: string;
  ready: boolean;
  missingFields: string[];
}> = [];

jest.mock("@patina/supabase", () => ({
  ProjectFfeSpecConflictError: class extends Error {
    constructor(readonly current: unknown) { super("This selection changed in another session. Refresh before saving."); }
  },
  useCreateSpecBookShare: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  usePrepareSpecBookIssue: () => ({
    mutateAsync: prepareIssueMutateAsync,
    isPending: false,
  }),
  useProjectFfeReadiness: () => ({
    data: mockReadinessData,
    isLoading: false,
    isError: false,
  }),
  useProjectV2: () => ({ data: mockProjectData }),
  useRenderSpecBookArtifact: () => ({
    mutateAsync: renderArtifactMutateAsync,
    isPending: false,
  }),
  useSpecBookWorkbench: () => mockWorkbenchHookResult,
  useUpdateProjectFfeSpec: () => ({
    mutateAsync,
    isPending: mockUpdatePending,
  }),
  useUpdateSpecBookItemSetting: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}));

jest.mock("@/hooks/use-hydrated", () => ({ useHydrated: () => true }));

// T-7 — the editor's Room select; exercised in __tests__/spec-book-way-back.
jest.mock("@/hooks/use-document-rooms", () => ({
  useDocumentRooms: () => ({ data: [] }),
  useAssignLineRoom: () => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
}));

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
  Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: () => "issue-key" });
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({});
  mockUpdatePending = false;
  prepareIssueMutateAsync.mockReset();
  prepareIssueMutateAsync.mockResolvedValue({ revision: { id: "revision-new" }, artifacts: [] });
  renderArtifactMutateAsync.mockReset();
  renderArtifactMutateAsync.mockResolvedValue({ finalized: true });
  readinessChanged.mockClear();
  artifactRetry.mockClear();
  opened.mockClear();
  mockSearchParams = new URLSearchParams();
  mockProjectData = { name: "Oak project", studio_id: "studio-1" };
  mockCanSeeMargin = false;
  mockReadinessData = [];
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

    await user.click(screen.getByRole("button", { name: "Revision history" }));
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

    await user.click(screen.getByRole("button", { name: "Revision history" }));
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
    // US-28 S7b: the ink word names what is missing, not a tooltip; the
    // opened piece names every gap in plain words (SQ-857).
    const word = screen.getByText("No finish · No dimensions");
    expect(word).toHaveClass("word");
    expect(word).not.toHaveAttribute("title");
    expect(screen.queryByRole("combobox", { name: "Issue readiness" })).not.toBeInTheDocument();
  });

  it("renders the DimensionFields control seeded from the spec's selected_dimensions", () => {
    render(<SelectionEditor item={buildItem()} />);
    expect(screen.getByLabelText("width")).toHaveValue("72");
    expect(screen.getByLabelText("depth")).toHaveValue("38");
    expect(screen.getByLabelText("height")).toHaveValue("30");
    expect(screen.getByLabelText("unit")).toHaveValue("in");
  });

  it("saves the parsed structured object on Save line, expectedRowVersion intact", async () => {
    const onSaved = jest.fn();
    render(<SelectionEditor item={buildItem()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("width"), {
      target: { value: "84" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
    await screen.findByText("Line saved.");

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
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
    await screen.findByText("Line saved.");
    expect(mutateAsync.mock.calls[0][0].changes.selected_dimensions).toBeNull();
  });

  it("names the finish as the change when Add a finish opened it (SPEC §S7b p3)", () => {
    render(<SelectionEditor item={buildItem({ finish: null })} focusField="finish" />);
    expect(screen.getByLabelText("Finish")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Save the finish" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save the specification" }),
    ).not.toBeInTheDocument();
  });
});

describe("SelectionEditor — peer conflict", () => {
  it("merges a second refetch into untouched fields before the next whole-row save", async () => {
    const { ProjectFfeSpecConflictError } = jest.requireMock("@patina/supabase") as {
      ProjectFfeSpecConflictError: new (current: unknown) => Error;
    };
    const initial = buildItem();
    const firstPeer = buildSpec({ row_version: 4, finish: "Peer oak", material: "Peer ash" });
    const laterPeer = buildSpec({ row_version: 5, finish: "Peer oak", material: "Peer walnut",
      selected_dimensions: { width: "96", depth: "38", height: "30", unit: "in" } });
    mutateAsync.mockRejectedValueOnce(new ProjectFfeSpecConflictError(firstPeer))
      .mockResolvedValueOnce({ ...laterPeer, finish: "Mine" });
    const { rerender } = render(<SelectionEditor item={initial} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Finish" }), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Peer oak");
    rerender(<SelectionEditor item={{ ...initial, spec: firstPeer }} />);
    rerender(<SelectionEditor item={{ ...initial, spec: laterPeer }} />);
    expect(screen.getByRole("textbox", { name: "Finish" })).toHaveValue("Mine");
    expect(screen.getByRole("textbox", { name: "Material" })).toHaveValue("Peer walnut");
    expect(screen.getByRole("textbox", { name: "width" })).toHaveValue("96");
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
    expect(await screen.findByText("Line saved.")).toBeInTheDocument();
    expect(mutateAsync.mock.calls[1][0]).toMatchObject({
      expectedRowVersion: 5, changes: { finish: "Mine", material: "Peer walnut",
        selected_dimensions: { width: "96", depth: "38", height: "30", unit: "in" } },
    });
  });

  it("names the peer's current dimensions without listing fields only the designer changed", async () => {
    const { ProjectFfeSpecConflictError } = jest.requireMock("@patina/supabase") as {
      ProjectFfeSpecConflictError: new (current: unknown) => Error;
    };
    const peer = buildSpec({ row_version: 4, finish: "matte", material: "Peer ash",
      selected_dimensions: { width: "90", depth: "38", height: "30", unit: "in" } });
    mutateAsync.mockRejectedValueOnce(new ProjectFfeSpecConflictError(peer));
    render(<SelectionEditor item={buildItem()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Finish" }), { target: { value: "Mine" } });
    fireEvent.change(screen.getByRole("textbox", { name: "width" }), { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Dimensions changed in another session to “width 90");
    expect(alert).not.toHaveTextContent("Finish changed");
    expect(alert).not.toHaveTextContent("Material changed");
    expect(screen.getByRole("textbox", { name: "width" })).toHaveValue("80");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Material" })).toHaveValue("Peer ash"));
  });

  it("absorbs peer values after a null peer read and retries against the refetched version", async () => {
    const { ProjectFfeSpecConflictError } = jest.requireMock("@patina/supabase") as {
      ProjectFfeSpecConflictError: new (current: unknown) => Error;
    };
    const initial = buildItem();
    const peer = buildSpec({ row_version: 4, finish: "Peer oak", material: "Peer ash" });
    const onConflict = jest.fn();
    mutateAsync.mockRejectedValueOnce(new ProjectFfeSpecConflictError(null))
      .mockResolvedValueOnce({ ...peer, finish: "Mine" });
    const { rerender } = render(<SelectionEditor item={initial} onConflict={onConflict} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Finish" }), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Waiting for its current value");
    rerender(<SelectionEditor item={{ ...initial, spec: peer }} onConflict={onConflict} />);
    expect(screen.getByRole("textbox", { name: "Finish" })).toHaveValue("Mine");
    expect(screen.getByRole("textbox", { name: "Material" })).toHaveValue("Peer ash");
    expect(screen.getByRole("alert")).toHaveTextContent("Peer oak");
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
    expect(await screen.findByText("Line saved.")).toBeInTheDocument();
    expect(mutateAsync.mock.calls[1][0]).toMatchObject({
      expectedRowVersion: 4, changes: { finish: "Mine", material: "Peer ash" },
    });
  });

  it("keeps the Save action focusable while the write is pending", async () => {
    const user = userEvent.setup();
    let resolve!: (value: unknown) => void;
    mutateAsync.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const initial = buildItem();
    const { rerender } = render(<SelectionEditor item={initial} />);
    await act(async () => {
      await user.clear(screen.getByRole("textbox", { name: "Finish" }));
      await user.type(screen.getByRole("textbox", { name: "Finish" }), "Mine");
    });
    const save = screen.getByRole("button", { name: "Save the specification" });
    await act(async () => { await user.click(save); });
    mockUpdatePending = true;
    rerender(<SelectionEditor item={initial} />);
    expect(save).toHaveFocus();
    expect(save).not.toBeDisabled();
    expect(save).toHaveAttribute("aria-disabled", "true");
    await act(async () => { await user.click(save); });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    mockUpdatePending = false;
    await act(async () => resolve(buildSpec({ row_version: 4, finish: "Mine" })));
  });

  it("waits for a newer version instead of accepting an old conflict read", async () => {
    const { ProjectFfeSpecConflictError } = jest.requireMock("@patina/supabase") as {
      ProjectFfeSpecConflictError: new (current: unknown) => Error;
    };
    mutateAsync.mockRejectedValueOnce(new ProjectFfeSpecConflictError(buildSpec({ row_version: 3, finish: "Old peer" })));
    render(<SelectionEditor item={buildItem()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Finish" }), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Waiting for its current value");
    expect(screen.getByRole("textbox", { name: "Finish" })).toHaveValue("Mine");
  });

  it("refetches without asking to refresh if the peer row is temporarily unreadable", async () => {
    const { ProjectFfeSpecConflictError } = jest.requireMock("@patina/supabase") as {
      ProjectFfeSpecConflictError: new (current: unknown) => Error;
    };
    const onConflict = jest.fn();
    mutateAsync.mockRejectedValueOnce(new ProjectFfeSpecConflictError(null));
    render(<SelectionEditor item={buildItem()} onConflict={onConflict} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Finish" }), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
    expect(await screen.findByRole("alert")).not.toHaveTextContent("Refresh before saving");
    expect(screen.getByRole("textbox", { name: "Finish" })).toHaveValue("Mine");
    expect(onConflict).toHaveBeenCalledTimes(1);
  });

  it("keeps edits typed while a stale save is pending", async () => {
    const { ProjectFfeSpecConflictError } = jest.requireMock("@patina/supabase") as {
      ProjectFfeSpecConflictError: new (current: unknown) => Error;
    };
    let reject!: (reason: Error) => void;
    mutateAsync.mockReturnValueOnce(new Promise((_resolve, failed) => { reject = failed; }));
    render(<SelectionEditor item={buildItem()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Finish" }), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Material" }), { target: { value: "Later edit" } });
    await act(async () => reject(new ProjectFfeSpecConflictError(buildSpec({
      row_version: 4, finish: "Peer oak", material: "Peer ash",
    }))));
    expect(screen.getByRole("textbox", { name: "Finish" })).toHaveValue("Mine");
    expect(screen.getByRole("textbox", { name: "Material" })).toHaveValue("Later edit");
  });

  it("keeps the N/A reason and uses the peer version on retry", async () => {
    const { ProjectFfeSpecConflictError } = jest.requireMock("@patina/supabase") as {
      ProjectFfeSpecConflictError: new (current: unknown) => Error;
    };
    const peer = buildSpec({ row_version: 4, finish: "Peer oak" });
    const onConflict = jest.fn();
    mutateAsync.mockRejectedValueOnce(new ProjectFfeSpecConflictError(peer)).mockResolvedValueOnce(peer);
    render(<SelectionEditor item={buildItem()} onConflict={onConflict} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Reason for not applicable" }), {
      target: { value: "No finish requested" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark N/A" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Finish changed in another session to “Peer oak”. Save again to replace it.");
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Reason for not applicable" })).toHaveValue("No finish requested");
    fireEvent.click(screen.getByRole("button", { name: "Mark N/A" }));
    await screen.findByText("finish marked N/A.");
    expect(mutateAsync.mock.calls[1][0].expectedRowVersion).toBe(4);
  });

  it("keeps a focused draft, shows the peer finish, refetches, and retries against its version without undoing unrelated peer edits", async () => {
    const { ProjectFfeSpecConflictError } = jest.requireMock("@patina/supabase") as {
      ProjectFfeSpecConflictError: new (current: unknown) => Error;
    };
    const initial = buildItem();
    const peer = buildSpec({ row_version: 4, finish: "Peer oak", material: "Peer ash" });
    const onConflict = jest.fn();
    mutateAsync.mockRejectedValueOnce(new ProjectFfeSpecConflictError(peer)).mockResolvedValueOnce({ ...peer, finish: "Mine" });
    const { rerender } = render(<SelectionEditor item={initial} onConflict={onConflict} />);
    const finish = screen.getByRole("textbox", { name: "Finish" });
    fireEvent.change(finish, { target: { value: "Mine" } });
    finish.focus();
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Finish changed in another session to “Peer oak”. Save again to replace it.");
    expect(onConflict).toHaveBeenCalledTimes(1);
    rerender(<SelectionEditor item={{ ...initial, spec: peer }} onConflict={onConflict} />);
    expect(finish).toHaveValue("Mine");
    expect(finish).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Material" })).toHaveValue("Peer ash");
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
    expect(await screen.findByText("Line saved.")).toBeInTheDocument();
    expect(mutateAsync.mock.calls[1][0]).toMatchObject({
      expectedRowVersion: 4,
      changes: { finish: "Mine", material: "Peer ash" },
    });
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
    expect(screen.getByText("Use dimension fields")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
    await screen.findByText("Line saved.");
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
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
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
    await user.click(screen.getByText("Advanced: edit dimensions as JSON"));
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
    await user.click(screen.getByText("Advanced: edit dimensions as JSON"));
    const textarea = screen.getByPlaceholderText(
      '{"width":"32 in","height":"30 in"}',
    );
    fireEvent.change(textarea, {
      target: { value: '{"width":"90","depth":"40","height":"32","unit":"cm"}' },
    });
    await user.click(screen.getByText("Use dimension fields"));

    expect(screen.getByLabelText("width")).toHaveValue("90");
    expect(screen.getByLabelText("unit")).toHaveValue("cm");
    expect(screen.queryByText("Use dimension fields")).toBeNull();
  });

  it("blocks switching back to structured on invalid JSON, keeping the raw editor open", async () => {
    const user = userEvent.setup();
    render(<SelectionEditor item={buildItem()} />);
    await user.click(screen.getByText("Advanced: edit dimensions as JSON"));
    fireEvent.change(
      screen.getByPlaceholderText('{"width":"32 in","height":"30 in"}'),
      { target: { value: "{broken" } },
    );
    await user.click(screen.getByText("Use dimension fields"));

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
    await user.click(screen.getByText("Advanced: edit dimensions as JSON"));
    fireEvent.change(
      screen.getByPlaceholderText('{"width":"32 in","height":"30 in"}'),
      { target: { value: "[1,2,3]" } },
    );
    await user.click(screen.getByText("Use dimension fields"));

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
    await user.click(screen.getByText("Advanced: edit dimensions as JSON"));
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
      "aria-expanded",
      "true",
    );
    expect(container.querySelector("#spec-book-item-item-1")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("opens at rest when no line is addressed (SPEC §S7b p1)", () => {
    withItems();

    const { container } = render(<SpecBookWorkspace projectId="project-1" />);

    for (const id of ["item-1", "item-2", "item-3"]) {
      expect(container.querySelector(`#spec-book-item-${id}`)).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
    expect(container.querySelectorAll(".sb-open")).toHaveLength(0);
  });

  it("ignores an ffeItemId that is not in this book, and rests", () => {
    withItems();
    mockSearchParams = new URLSearchParams("ffeItemId=not-in-this-project");

    const { container } = render(<SpecBookWorkspace projectId="project-1" />);

    expect(container.querySelector("#spec-book-item-item-1")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(container.querySelectorAll(".sb-open")).toHaveLength(0);
  });

  it("SP-14/F100 — the leaf's return link names the full project", () => {
    withItems();

    render(<SpecBookWorkspace projectId="project-1" />);

    expect(
      screen.getByRole("link", { name: "← Oak project" }),
    ).toBeInTheDocument();
  });

  it("SQ-877 N8 — the browser tab carries the book's name, and hands it back", () => {
    withItems();
    document.title = "Studio overview · Patina";

    const { unmount } = render(<SpecBookWorkspace projectId="project-1" />);

    expect(document.title).toBe("Oak project · specification book · Patina");
    unmount();
    expect(document.title).toBe("Studio overview · Patina");
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
      container.querySelector("#spec-book-item-item-1")?.closest("li"),
    ).toHaveTextContent("Incomplete");
  });
});

// R1's margin read needs the studio seat; the print preview below is a
// client edition, which never shows trade price either way. The opened
// piece shows it only when this is true (reset in beforeEach).
let mockCanSeeMargin = false;
jest.mock("@/hooks/use-can-see-margin", () => ({
  useCanSeeMargin: () => mockCanSeeMargin,
}));

/**
 * US-28 S7b — the spec book, full uplift (V20 U-Q18; SPEC §S7b). Chapters are
 * trades (00767); each is a Section; pieces are rows that unfold in place.
 */
describe("US-28 S7b — the spec book by trade", () => {
  function chapter(id: string, title: string, trade: string | null) {
    return {
      id,
      spec_book_id: "book-1",
      project_room_id: null,
      trade,
      title,
      position: 0,
      hero_media: null,
      included: true,
      page_template: null,
      review_state: "draft",
    };
  }
  function setting(id: string, chapterId: string | null) {
    return {
      id: `setting-${id}`,
      spec_book_id: "book-1",
      ffe_item_id: id,
      chapter_id: chapterId,
      position: 0,
      included: true,
      page_template: null,
      review_state: "draft",
      publication_overrides: {},
    };
  }
  function withTradeBook() {
    const base = mockWorkbenchHookResult as { data: Record<string, unknown> };
    base.data.chapters = [
      chapter("ch-joinery", "Joinery", "joinery"),
      chapter("ch-lighting", "Lighting", "lighting"),
      chapter("ch-textiles", "Textiles", "textiles"),
      chapter("ch-unsorted", "Unsorted", "unsorted"),
    ];
    base.data.items = [
      buildItem({}, { id: "bench", name: "Built-in bench", document_code: "HD-01", setting: setting("bench", "ch-joinery") }),
      buildItem({}, { id: "lamp", name: "Halo floor lamp", document_code: "HD-05", setting: setting("lamp", "ch-lighting") }),
      // a soft-removed line keeps no chapter visible (SQ-842 F8b)
      buildItem({}, { id: "gone", name: "Old throw", setting: setting("gone", "ch-textiles"), removed_at: "2026-10-01T00:00:00.000Z" } as Partial<SpecBookWorkItem>),
      // a roomless, unfiled line lands once, under Unsorted (SQ-842 F4)
      buildItem({}, { id: "loose", name: "Loose stool", setting: null }),
    ];
  }

  it("draws one closing Section per trade that holds an active line", () => {
    withTradeBook();
    render(<SpecBookWorkspace projectId="project-1" />);

    const register = screen.getByRole("region", { name: "Specification register" });
    const sections = Array.from(register.querySelectorAll("section.section"));
    expect(sections.map((node) => node.getAttribute("aria-label"))).toEqual([
      "Joinery",
      "Lighting",
      "Unsorted",
    ]);
    expect(screen.queryByRole("region", { name: "Textiles" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Loose stool")).toHaveLength(1);
    expect(
      within(screen.getByRole("navigation", { name: "In this book" }))
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Joinery", "Lighting", "Unsorted"]);
  });

  it("unfolds one piece in place and puts it back", async () => {
    withTradeBook();
    const user = userEvent.setup();
    const { container } = render(<SpecBookWorkspace projectId="project-1" />);

    // the book opens at rest: no piece unfolded, no save act (SPEC §S7b p1)
    expect(container.querySelector("#spec-book-item-bench")).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelectorAll(".sb-open")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Built-in bench" }));
    expect(container.querySelector("#spec-book-item-bench")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Save the specification" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Halo floor lamp" }));
    expect(container.querySelector("#spec-book-item-lamp")).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector("#spec-book-item-bench")).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelectorAll(".sb-open")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Put back" }));
    expect(container.querySelector("#spec-book-item-lamp")).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelectorAll(".sb-open")).toHaveLength(0);
  });

  it("closes the fold on Esc", async () => {
    withTradeBook();
    const user = userEvent.setup();
    const { container } = render(<SpecBookWorkspace projectId="project-1" />);

    await user.click(screen.getByRole("button", { name: "Built-in bench" }));
    expect(container.querySelectorAll(".sb-open")).toHaveLength(1);
    await user.click(screen.getByLabelText("Finish"));
    await user.keyboard("{Escape}");
    expect(container.querySelectorAll(".sb-open")).toHaveLength(0);
  });

  it("prints state as ink words, never a pigment class", () => {
    withTradeBook();
    const { container } = render(<SpecBookWorkspace projectId="project-1" />);

    const row = container.querySelector("#spec-book-item-lamp")?.closest("li");
    expect(within(row as HTMLElement).getByText("Incomplete")).toHaveClass("word");
    expect(container.innerHTML).not.toMatch(/#66765f|#a47f33|#e7e2d8/i);
  });

  it("names the four views as words and the empty book with one act", () => {
    render(<SpecBookWorkspace projectId="project-1" />);

    const tabs = within(screen.getByRole("navigation", { name: "Spec book workspace" }))
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(tabs).toEqual([
      "Specification",
      "Audience editions",
      "Issue readiness",
      "Revision history",
    ]);
    expect(
      screen.getByText(/No pieces in this book yet\. Add pieces to Oak project/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the pieces" })).toHaveAttribute(
      "href",
      "/doc/project-1/pieces",
    );
    expect(screen.queryByRole("button", { name: "Run issue checks" })).not.toBeInTheDocument();
  });

  describe("Spec Book workspace title (SQ-864 F5)", () => {
    async function openPreview() {
      withTradeBook();
      const user = userEvent.setup();
      render(<SpecBookWorkspace projectId="project-1" />);
      await user.click(screen.getByRole("button", { name: "Built-in bench" }));
      await user.click(screen.getByRole("button", { name: "Preview the client sheet" }));
      return screen.getByRole("region", { name: "client edition preview" });
    }

    it("names the workspace by its job, but the preview prints the stored title issuance freezes", async () => {
      const preview = await openPreview();
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        /^Oak project · specification book$/,
      );
      expect(within(preview).getByText(/^Oak project specification · /)).toBeInTheDocument();
    });

    it("falls back to the job name in the preview when the stored title is empty", async () => {
      const base = mockWorkbenchHookResult as { data: { book: object } };
      mockWorkbenchHookResult = {
        ...(mockWorkbenchHookResult as object),
        data: { ...base.data, book: { ...base.data.book, title: "  " } },
      };
      const preview = await openPreview();
      expect(within(preview).getByText(/^Oak project · specification book · /)).toBeInTheDocument();
    });
  });

  it("previews the client sheet as paper, without trade price", async () => {
    withTradeBook();
    const user = userEvent.setup();
    render(<SpecBookWorkspace projectId="project-1" />);

    await user.click(screen.getByRole("button", { name: "Built-in bench" }));
    await user.click(screen.getByRole("button", { name: "Preview the client sheet" }));
    const preview = screen.getByRole("region", { name: "client edition preview" });
    expect(within(preview).getByRole("article")).toHaveClass("sb-page");
    expect(within(preview).getByText("Built-in bench")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Client" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Trade price", { exact: true })).not.toBeInTheDocument();
  });

  it("shows an opened piece's trade price only to a viewer who may see margin (R1)", async () => {
    withTradeBook();
    const items = (mockWorkbenchHookResult as { data: { items: SpecBookWorkItem[] } }).data.items;
    items[1].trade_price_cents = 418_050;
    const user = userEvent.setup();

    const { container, unmount } = render(<SpecBookWorkspace projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Halo floor lamp" }));
    const hidden = container.querySelector(".sb-open") as HTMLElement;
    expect(within(hidden).queryByText("Trade price", { exact: true })).not.toBeInTheDocument();
    unmount();

    mockCanSeeMargin = true;
    const seen = render(<SpecBookWorkspace projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Halo floor lamp" }));
    const fold = seen.container.querySelector(".sb-open") as HTMLElement;
    expect(within(fold).getByText("Trade price", { exact: true }).tagName).toBe("DT");
    expect(within(fold).getByText("$4180.50")).toHaveClass("lfig");
  });
});

/**
 * SQ-857 — the SQ-834 walk found the state column printing readiness schema
 * keys ("NO DESIGNDISPOSITION, DOCUMENTCODE, IMAGE…"), "Open" where the line
 * lacks a finish, the stored "— Spec Book" title, a doubled "Not specified",
 * and a tinted opened row (CSS only, globals.css walk-fix block).
 */
describe("SQ-857 — the spec book walk fixes", () => {
  // Every key get_project_ffe_readiness (00733) emits, the legacy spec-field
  // keys, and keys this client has never seen.
  const EVERY_KEY = [
    "name",
    "documentCode",
    "room",
    "quantity",
    "image",
    "selection",
    "designDisposition",
    "removed",
    "releaseBlock",
    "vendor",
    "clientPrice",
    "allowanceCeiling",
    "itemType",
    "parent_not_ready",
    "sku",
    "finish",
    "material",
    "color_fabric",
    "colorFabric",
    "selected_dimensions",
    "exact_location",
    "exactLocation",
    "someFutureRule",
    "another_future_rule",
  ];
  // A key a reader would see as a schema name: camelCase, snake_case, or the
  // same run of letters once CSS uppercases it.
  const COMPOUND_KEYS = EVERY_KEY.filter((key) => /[A-Z_]/.test(key));

  function expectNoSchemaKey(node: Element) {
    const text = node.textContent ?? "";
    expect(text).not.toMatch(/[a-z][A-Z]/);
    expect(text).not.toMatch(/_/);
    // `.word` is uppercased by CSS, so "designDisposition" would read as the
    // one run DESIGNDISPOSITION; plain words keep their spaces.
    const shouted = text.toUpperCase();
    for (const key of COMPOUND_KEYS) {
      expect(shouted).not.toContain(key.toUpperCase().replace(/_/g, ""));
    }
  }

  function withLines(...items: SpecBookWorkItem[]) {
    (mockWorkbenchHookResult as { data: { items: SpecBookWorkItem[] } }).data.items =
      items;
  }

  it("refetches the open workbench row on a stale save without losing the draft", async () => {
    withLines(buildItem());
    const refetch = jest.fn();
    (mockWorkbenchHookResult as { refetch: typeof refetch }).refetch = refetch;
    const { ProjectFfeSpecConflictError } = jest.requireMock("@patina/supabase") as {
      ProjectFfeSpecConflictError: new (current: unknown) => Error;
    };
    mutateAsync.mockRejectedValueOnce(new ProjectFfeSpecConflictError(buildSpec({
      row_version: 4, finish: "Peer oak",
    })));
    render(<SpecBookWorkspace projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Sofa" }));
    const finish = screen.getByRole("textbox", { name: "Finish" });
    fireEvent.change(finish, { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the specification" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Finish changed in another session to “Peer oak”.");
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(finish).toHaveValue("Mine");
  });

  it("never prints a schema key in the state cell or the opened piece", async () => {
    withLines(buildItem({}, { id: "bench", name: "Built-in bench", item_type: "allowance", document_code: "F-01", project_room_id: null, room: null, image_url: null }));
    mockReadinessData = [
      { selectionId: "bench", ready: false, missingFields: EVERY_KEY },
    ];
    const user = userEvent.setup();
    const { container } = render(<SpecBookWorkspace projectId="project-1" />);

    const cell = container.querySelector(".lrow .lwhen") as HTMLElement;
    expectNoSchemaKey(cell);
    // the row names the first gap and counts the rest
    expect(cell).toHaveTextContent(/^No finish and \d+ more$/);

    await user.click(screen.getByRole("button", { name: "Built-in bench" }));
    const head = container.querySelector(".sb-open .sb-spec-head .word") as HTMLElement;
    expectNoSchemaKey(head);
    expect(head).toHaveTextContent("No document code");
    expect(head).toHaveTextContent("No image");
    expect(head).toHaveTextContent("Not chosen yet");
  });

  it("leaves an unknown key unnamed rather than print it", () => {
    withLines(buildItem({}, { id: "bench", name: "Built-in bench", item_type: "allowance", document_code: "F-01", project_room_id: null, room: null, image_url: null }));
    mockReadinessData = [
      { selectionId: "bench", ready: false, missingFields: ["someFutureRule"] },
    ];
    const { container } = render(<SpecBookWorkspace projectId="project-1" />);

    const cell = container.querySelector(".lrow .lwhen") as HTMLElement;
    expect(cell).toHaveTextContent("Incomplete");
    expectNoSchemaKey(cell);
  });

  it("offers Add a finish where the line has none, and Open where it has one", async () => {
    withLines(
      buildItem({ finish: null }, { id: "table", name: "Turned side table", finish: null }),
      buildItem({}, { id: "bench", name: "Built-in bench" }),
    );
    mockReadinessData = [
      { selectionId: "table", ready: false, missingFields: [] },
      { selectionId: "bench", ready: true, missingFields: [] },
    ];
    const user = userEvent.setup();
    const { container } = render(<SpecBookWorkspace projectId="project-1" />);

    const table = container.querySelector("#spec-book-item-table")?.closest("li") as HTMLElement;
    const bench = container.querySelector("#spec-book-item-bench")?.closest("li") as HTMLElement;
    expect(within(table).getByText("No finish")).toHaveClass("word");
    expect(within(bench).getByText("Ready")).toHaveClass("word");
    expect(within(bench).getByRole("button", { name: "Open" })).toBeInTheDocument();

    await user.click(within(table).getByRole("button", { name: "Add a finish" }));
    expect(screen.getByLabelText("Finish")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Save the finish" })).toBeInTheDocument();
  });

  it("names the book by its job, as the specimen does", () => {
    render(<SpecBookWorkspace projectId="project-1" />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Oak project · specification book$/,
    );
  });

  it("says Not specified once for an empty fact", async () => {
    withLines(
      buildItem({ sku: null }, { id: "bench", name: "Built-in bench", sku: null }),
    );
    const user = userEvent.setup();
    const { container } = render(<SpecBookWorkspace projectId="project-1" />);

    await user.click(screen.getByRole("button", { name: "Built-in bench" }));
    const fold = container.querySelector(".sb-open") as HTMLElement;
    const sku = within(fold).getByText("SKU", { selector: "dt" });
    const value = sku.nextElementSibling as HTMLElement;
    expect(value).toHaveTextContent(/^Not specified$/);
    const finish = within(fold).getByText("Finish", { selector: "dt" });
    expect(finish.nextElementSibling).toHaveTextContent("Set for this job");
  });

  it("sends canonical warning acknowledgement ids when issuing", async () => {
    withLines(buildItem({}, { id: "bench", name: "Built-in bench", item_type: "allowance", document_code: "F-01", project_room_id: null, room: null, image_url: null }));
    const user = userEvent.setup();
    render(<SpecBookWorkspace projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Run issue checks" }));
    await user.type(screen.getByLabelText("Issue-with-warnings reason"), "Reviewed with the client");
    await user.click(screen.getByRole("button", { name: /Issue 2 editions/ }));
    expect(prepareIssueMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      warningAcknowledgements: [
        { id: "stale-source:bench", reason: "Reviewed with the client" },
        { id: "missing-client-note:bench", reason: "Reviewed with the client" },
      ],
    }));
  });

  it("shows server warnings and acknowledges only their ids on the next issue", async () => {
    withLines(buildItem({}, { id: "bench", name: "Built-in bench", item_type: "allowance", document_code: "F-01", project_room_id: null, room: null, image_url: null }));
    prepareIssueMutateAsync.mockRejectedValueOnce({
      message: "spec_book_warnings_unacknowledged",
      code: "23514",
      details: JSON.stringify({ warnings: [
        { id: "stale-source:bench", code: "stale_source_verification", ffeItemId: "bench" },
      ] }),
    });
    const user = userEvent.setup();
    render(<SpecBookWorkspace projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Run issue checks" }));
    await user.type(screen.getByLabelText("Issue-with-warnings reason"), "Reviewed with the client");
    await user.click(screen.getByRole("button", { name: /Issue 2 editions/ }));
    expect(await screen.findByText("The server found warnings to acknowledge. Review them, then issue again.")).toBeInTheDocument();
    expect(screen.getByText(/Source verification is more than 180 days old/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Issue readiness/ }));
    await user.click(screen.getByRole("button", { name: /Issue 2 editions/ }));
    expect(prepareIssueMutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({
      warningAcknowledgements: [{ id: "stale-source:bench", reason: "Reviewed with the client" }],
    }));
  });

  it("does not treat preflight blockers as warnings to acknowledge", async () => {
    withLines(buildItem({}, { id: "bench", name: "Built-in bench", item_type: "allowance", document_code: "F-01", project_room_id: null, room: null, image_url: null }));
    prepareIssueMutateAsync.mockRejectedValueOnce({
      message: "spec_book_preflight_failed",
      code: "23514",
      details: JSON.stringify({
        blockers: [{ code: "missing_required_fact", ffeItemId: "bench" }],
        warnings: [{ id: "stale-source:bench", code: "stale_source_verification", ffeItemId: "bench" }],
      }),
    });
    const user = userEvent.setup();
    render(<SpecBookWorkspace projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Run issue checks" }));
    await user.type(screen.getByLabelText("Issue-with-warnings reason"), "Reviewed with the client");
    await user.click(screen.getByRole("button", { name: /Issue 2 editions/ }));
    expect(await screen.findByText("The issue could not complete.")).toBeInTheDocument();
    expect(screen.queryByText("The server found warnings to acknowledge. Review them, then issue again.")).not.toBeInTheDocument();
  });

  it("holds Issue when the project has no studio", async () => {
    withLines(buildItem({}, { id: "bench", name: "Built-in bench", item_type: "allowance", document_code: "F-01", project_room_id: null, room: null, image_url: null }));
    mockProjectData = { name: "Oak project", studio_id: null };
    const user = userEvent.setup();
    render(<SpecBookWorkspace projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Run issue checks" }));
    expect(screen.getByText("This job isn't in a studio yet. Name its studio, then issue.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Issue 2 editions/ })).toBeDisabled();
  });

  it("L-b: a held job's headline says held, and the held Issue is described by the hold sentence", async () => {
    withLines(buildItem({}, { id: "bench", name: "Built-in bench", item_type: "allowance", document_code: "F-01", project_room_id: null, room: null, image_url: null }));
    mockProjectData = { name: "Oak project", studio_id: null };
    const user = userEvent.setup();
    render(<SpecBookWorkspace projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Run issue checks" }));
    expect(screen.getByRole("heading", { level: 2, name: "Held until the job has a studio" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ready to issue" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Issue 2 editions/ })).toHaveAccessibleDescription(
      "This job isn't in a studio yet. Name its studio, then issue.",
    );
  });

  it("L-b: a job in a studio still reads Ready to issue, with nothing describing Issue", async () => {
    withLines(buildItem({}, { id: "bench", name: "Built-in bench", item_type: "allowance", document_code: "F-01", project_room_id: null, room: null, image_url: null }));
    const user = userEvent.setup();
    render(<SpecBookWorkspace projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Run issue checks" }));
    expect(screen.getByRole("heading", { level: 2, name: "Ready to issue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Issue 2 editions/ })).not.toHaveAttribute("aria-describedby");
  });
});
