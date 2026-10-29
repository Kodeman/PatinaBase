/**
 * SQ-1897 (story #38): one writer per spec row in the Spec pane, and the
 * unfold's close hold over every write the pane makes.
 *
 * The spec write stands in for `useUpdateProjectFfeSpec` against a row that
 * checks `row_version` the way the table does: a write on an older version is
 * refused as a conflict. The tests answer each write themselves, so the order
 * of answers is theirs to choose.
 *
 * - F6: writes on one row go one at a time, each on the latest row_version.
 * - F3: an older answer never clears, marks or alerts over a newer field.
 * - F2: a failed Fill holds while its preview shows.
 * - F11: a failed Dimensions field is marked invalid, as text fields are.
 * - F12: item label, rooms, labor and COM writes reach the same hold.
 * - Legacy (no owner): the same one-at-a-time writes; no hold, no marks.
 * - RC7-E6-3: a stale save keeps the draft, names the peer's value and saves
 *   again on the refreshed row_version.
 */

import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { BoardOwnerRef } from "@patina/types";
import {
  flushBoardOwnerAutosaves,
  getProposalAutosaveSnapshot,
  resetProposalAutosaveRegistryForTests,
} from "@/lib/proposal-autosave-registry";

type Call = {
  input: { specId: string; expectedRowVersion: number; changes: object };
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};
const mockSpecCalls: Call[] = [];
const mockPlace = jest.fn();
const mockSetLabel = jest.fn();
const mockAddFabric = jest.fn();
const mockAddLabor = jest.fn();
const mockSetPlacements = jest.fn();
const mutation = (fn: (input: never) => unknown) => ({
  mutateAsync: fn,
  isPending: false,
});

jest.mock("@patina/supabase", () => ({
  ProjectFfeSpecConflictError: class extends Error {
    constructor(readonly current: unknown) {
      super("This selection changed in another session. Refresh before saving.");
    }
  },
  useUpdateProjectFfeSpec: () =>
    mutation(
      (input: Call["input"]) =>
        new Promise((resolve, reject) =>
          mockSpecCalls.push({ input, resolve, reject }),
        ),
    ),
  useSetFfeLineCommercials: () => mutation(jest.fn()),
  useSetFfeLineBuildFields: () => mutation(jest.fn()),
  usePlaceProductInProjectV2: () => mutation((i: never) => mockPlace(i)),
  useSetFfeItemLabel: () => mutation((i: never) => mockSetLabel(i)),
  itemLabelRefusal: () => null,
  useSetLinePlacements: () => mutation((i: never) => mockSetPlacements(i)),
  useAddLaborLine: () => mutation((i: never) => mockAddLabor(i)),
  useFfePairLines: () => ({ data: [] }),
  useLinkFfePair: () => mutation(jest.fn()),
}));
jest.mock("../../buying/com-piece", () => ({
  readPair: () => ({ children: [], onPiece: false }),
  useAddComFabricLine: () => ({
    add: (...args: unknown[]) => mockAddFabric(...args),
    isPending: false,
  }),
}));
jest.mock("../../line-unfold/the-buy-cell", () => ({
  MakerSearch: () => null,
  MakerMatchLine: () => null,
  useAddMaker: () => ({
    add: jest.fn(),
    match: null,
    clearMatch: jest.fn(),
    isPending: false,
  }),
}));
jest.mock("../library-inline-search", () => ({
  LibraryInlineSearch: (props: {
    onChoose: (row: { id: string; name: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => props.onChoose({ id: "product-1", name: "Walnut chair" })}
    >
      choose product
    </button>
  ),
}));
jest.mock("@/components/portal/proposals/product-picker-modal", () => ({
  ProductPickerModal: () => null,
}));

import { SpecFieldsPane, type SpecLensLine, type SpecLensSpec } from "../spec-fields-pane";
import { BuildRoomShell } from "../build-room-shell";
import { emptyRoomCounts } from "@/lib/document/pieces/room-counts";

const owner: BoardOwnerRef = { kind: "project", id: "ffe-sheet:sq-1897" };

const line = {
  id: "l1",
  name: "Sofa",
  quantity: 1,
  unit: "each",
  product_id: null,
  vendor_id: null,
  vendor_name: null,
  item_type: "fixed",
  unit_price_cents: 0,
  budget_max_cents: null,
  ffe_line_authorization: null,
  line_kind: "goods",
  parent_ffe_item_id: null,
  link_kind: null,
  project_room_id: "living",
  assignment_scope: "room",
  design_disposition: "candidate",
  role_identity: "default",
  purchase_order_id: null,
  trade_scope_document_id: null,
  rough_cents: null,
  status: "specified",
  product: null,
  lead_time_weeks: null,
  suggested_lead_time_weeks: null,
  suggested_lead_time_source: null,
} as unknown as SpecLensLine;

/** The row as the table holds it; a write on an older version conflicts. */
let server: SpecLensSpec;
const { ProjectFfeSpecConflictError: Conflict } = jest.requireMock("@patina/supabase") as {
  ProjectFfeSpecConflictError: new (current: SpecLensSpec) => Error;
};

/** Answers write `i` as the table would: a stale version gets the row as it is. */
async function answer(i: number) {
  const call = mockSpecCalls[i];
  await act(async () => {
    if (call.input.expectedRowVersion !== server.row_version) {
      call.reject(new Conflict({ ...server }));
      return;
    }
    server = {
      ...server,
      ...call.input.changes,
      row_version: server.row_version + 1,
    };
    call.resolve(server);
  });
}
async function refuse(i: number, message: string) {
  await act(async () => mockSpecCalls[i].reject(new Error(message)));
}

let shown: SpecLensSpec;
const onFilled = jest.fn();
function Harness({ held = true }: { held?: boolean }) {
  const [spec, setSpec] = useState<SpecLensSpec>(server);
  shown = spec;
  return (
    <SpecFieldsPane
      projectId="p1"
      canSeeMoney
      line={line}
      spec={spec}
      needLabel="Sofa"
      piece={null}
      laborLines={[]}
      placements={[]}
      rooms={[]}
      onSpecSaved={(saved) => setSpec((current) => ({ ...current, ...saved }))}
      onFilled={onFilled}
      autosaveOwner={held ? owner : null}
    />
  );
}

const field = (name: string) =>
  screen.getByRole("textbox", { name }) as HTMLInputElement;
async function type(name: string, value: string) {
  fireEvent.change(field(name), { target: { value } });
  await act(async () => {
    fireEvent.blur(field(name));
  });
}
const snapshot = () => getProposalAutosaveSnapshot(owner);
/** What a waiting Return gets: the hold's refusal, or undefined when it folds. */
async function flush(): Promise<string | undefined> {
  let refusal: string | undefined;
  await act(async () => {
    await flushBoardOwnerAutosaves(owner).catch((e: Error) => {
      refusal = e.message;
    });
  });
  return refusal;
}
function deferred() {
  let resolve: (value: unknown) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise((ok, no) => {
    resolve = ok;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  resetProposalAutosaveRegistryForTests();
  mockSpecCalls.length = 0;
  mockPlace.mockReset();
  mockSetLabel.mockReset();
  mockAddFabric.mockReset();
  mockAddLabor.mockReset();
  mockSetPlacements.mockReset();
  onFilled.mockReset();
  server = {
    id: "spec-1",
    ffe_item_id: "l1",
    row_version: 1,
    finish: "Old finish",
    material: null,
    color_fabric: null,
    selected_dimensions: null,
    exact_location: null,
    trade_notes: null,
    selected_media: [],
  } as unknown as SpecLensSpec;
});

function renderSheet(embedded: boolean) {
  const onLeave = jest.fn();
  const onRequestClose = jest.fn(() => {
    void flushBoardOwnerAutosaves(owner).then(onLeave, () => undefined);
  });
  render(
    <BuildRoomShell
      embedded={embedded}
      docId="p1"
      jobName="Test job"
      rooms={[]}
      counts={{
        rooms: {},
        throughout: emptyRoomCounts(),
        unassigned: emptyRoomCounts(),
        job: emptyRoomCounts(),
      }}
      removedCount={0}
      lens="spec"
      room={null}
      canSeeMoney
      onNavigate={jest.fn()}
      onReturn={onLeave}
      onRequestClose={onRequestClose}
    >
      <Harness held={embedded} />
    </BuildRoomShell>,
  );
  return { onLeave, onRequestClose };
}

function clearAndEscape(name: string) {
  const input = field(name);
  input.focus();
  fireEvent.change(input, { target: { value: "" } });
  // No synthetic blur: Esc itself must hand the clear to the pane's writer.
  fireEvent.keyDown(input, { key: "Escape" });
}

describe.each([
  ["standalone", false],
  ["embedded", true],
] as const)("clear then Esc — %s", (_mode, embedded) => {
  it.each([
    ["Finish", "finish"],
    ["Notes", "trade_notes"],
  ])("commits the cleared %s before leaving", async (name, column) => {
    server = { ...server, [column]: "Old value" };
    const { onLeave, onRequestClose } = renderSheet(embedded);
    clearAndEscape(name);

    expect(mockSpecCalls).toHaveLength(1);
    expect(mockSpecCalls[0].input).toMatchObject({
      specId: "spec-1",
      expectedRowVersion: 1,
      changes: { [column]: null },
    });
    expect(onLeave).toHaveBeenCalledTimes(embedded ? 0 : 1);
    if (embedded) {
      expect(onRequestClose).toHaveBeenCalledTimes(1);
      expect(snapshot().flushing).toBe(true);
    }

    await answer(0);
    expect(server).toMatchObject({ [column]: null, row_version: 2 });
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(snapshot().dirty).toBe(false);
    expect(mockSpecCalls).toHaveLength(1);
  });
});

it("clear then Esc — embedded refusal keeps the clear focused and holds until its retry saves", async () => {
  const { onLeave } = renderSheet(true);
  clearAndEscape("Finish");
  expect(mockSpecCalls).toHaveLength(1);
  await refuse(0, "The clear was refused.");

  expect(onLeave).not.toHaveBeenCalled();
  expect(field("Finish")).toHaveValue("");
  expect(field("Finish")).toHaveFocus();
  expect(field("Finish")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("The clear was refused.");
  expect(snapshot().dirty).toBe(true);

  clearAndEscape("Finish");
  expect(mockSpecCalls).toHaveLength(2);
  expect(mockSpecCalls[1].input).toMatchObject({
    expectedRowVersion: 1,
    changes: { finish: null },
  });
  await answer(1);
  expect(onLeave).toHaveBeenCalledTimes(1);
  expect(snapshot().dirty).toBe(false);
});

it("clear then Esc — embedded clear waits for the in-flight row writer on its acknowledged version", async () => {
  const { onLeave } = renderSheet(true);
  await type("Finish", "First");
  clearAndEscape("Finish");
  expect(mockSpecCalls).toHaveLength(1);
  expect(onLeave).not.toHaveBeenCalled();

  await answer(0);
  expect(mockSpecCalls).toHaveLength(2);
  expect(mockSpecCalls[1].input).toMatchObject({
    expectedRowVersion: 2,
    changes: { finish: null },
  });
  expect(onLeave).not.toHaveBeenCalled();
  await answer(1);
  expect(server).toMatchObject({ finish: null, row_version: 3 });
  expect(onLeave).toHaveBeenCalledTimes(1);
  expect(snapshot().dirty).toBe(false);
});

describe("RC7-E6-3 (A06): a save another session got to first", () => {
  /** Another session saves the row; this pane still holds the older version. */
  const peerSaves = (changes: Partial<SpecLensSpec>) => {
    server = { ...server, ...changes, row_version: server.row_version + 1 };
  };
  async function enter(name: string, value: string) {
    const input = field(name);
    act(() => input.focus());
    fireEvent.change(input, { target: { value } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
  }

  it.each([
    ["Finish", "finish"],
    ["Material", "material"],
    ["Color", "color_fabric"],
    ["Exact location", "exact_location"],
  ] as const)(
    "%s keeps its draft and focus, names the peer's value, and saves on the refreshed row_version",
    async (name, column) => {
      render(<Harness />);
      peerSaves({ [column]: "Peer walnut" });
      await enter(name, "Mine");
      await answer(0);

      expect(screen.getByRole("alert")).toHaveTextContent(
        `${name} changed in another session to “Peer walnut”. Save again to replace it.`,
      );
      expect(field(name)).toHaveValue("Mine");
      expect(field(name)).toHaveFocus();
      expect(field(name)).toHaveAttribute("aria-invalid", "true");
      // The pane's row is the peer's now; the draft did not reset to it.
      expect(shown).toMatchObject({ [column]: "Peer walnut", row_version: 2 });
      expect(snapshot().dirty).toBe(true);

      await act(async () => {
        fireEvent.keyDown(field(name), { key: "Enter" });
      });
      expect(mockSpecCalls).toHaveLength(2);
      expect(mockSpecCalls[1].input).toMatchObject({
        expectedRowVersion: 2,
        changes: { [column]: "Mine" },
      });
      await answer(1);

      expect(server).toMatchObject({ [column]: "Mine", row_version: 3 });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(field(name)).not.toHaveAttribute("aria-invalid");
      expect(field(name)).toHaveFocus();
      expect(snapshot().dirty).toBe(false);
    },
  );

  it("Notes, written on blur, keeps its draft and saves once edited again on the refreshed row_version", async () => {
    render(<Harness />);
    peerSaves({ trade_notes: null, finish: "Peer finish" });
    peerSaves({ trade_notes: "Peer note" });
    await type("Notes", "My note");
    await answer(0);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Notes changed in another session to “Peer note”. Save again to replace it.",
    );
    expect(field("Notes")).toHaveValue("My note");
    // Finish was never edited here, so it shows what the peer saved, and
    // passing through it writes nothing over the peer.
    expect(field("Finish")).toHaveValue("Peer finish");
    await type("Finish", "Peer finish");
    expect(mockSpecCalls).toHaveLength(1);

    // In conflict, leaving Notes saves nothing over the peer.
    await act(async () => {
      fireEvent.blur(field("Notes"));
    });
    expect(mockSpecCalls).toHaveLength(1);
    expect(field("Notes")).toHaveValue("My note");

    // Edited again, it saves on blur against the peer's row.
    await type("Notes", "My note, kept");
    expect(mockSpecCalls[1].input).toMatchObject({
      expectedRowVersion: 3,
      changes: { trade_notes: "My note, kept" },
    });
    await answer(1);
    expect(server).toMatchObject({
      trade_notes: "My note, kept",
      finish: "Peer finish",
      row_version: 4,
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an edit queued behind the refused write is not sent over the peer; it waits for its own save", async () => {
    render(<Harness />);
    await enter("Finish", "First");
    // Edited again and left while the first write is out: it queues.
    fireEvent.change(field("Finish"), { target: { value: "Second" } });
    await act(async () => {
      fireEvent.blur(field("Finish"));
    });
    expect(mockSpecCalls).toHaveLength(1);
    peerSaves({ finish: "Peer walnut" });
    await answer(0);

    expect(mockSpecCalls).toHaveLength(1);
    expect(server).toMatchObject({ finish: "Peer walnut", row_version: 2 });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Finish changed in another session to “Peer walnut”. Save again to replace it.",
    );
    expect(field("Finish")).toHaveValue("Second");
    expect(field("Finish")).toHaveAttribute("aria-invalid", "true");
    expect(await flush()).toMatch("Finish changed in another session");
    expect(mockSpecCalls).toHaveLength(1);

    act(() => field("Finish").focus());
    await act(async () => {
      fireEvent.keyDown(field("Finish"), { key: "Enter" });
    });
    expect(mockSpecCalls[1].input).toMatchObject({
      expectedRowVersion: 2,
      changes: { finish: "Second" },
    });
    await answer(1);
    expect(server).toMatchObject({ finish: "Second", row_version: 3 });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(snapshot().dirty).toBe(false);
  });

  it("a queued edit of a column the peer left alone still sends on the peer's row", async () => {
    render(<Harness />);
    await enter("Finish", "First");
    await type("Material", "Ash");
    peerSaves({ finish: "Peer walnut" });
    await answer(0);
    expect(mockSpecCalls[1].input).toMatchObject({
      expectedRowVersion: 2,
      changes: { material: "Ash" },
    });
    await answer(1);
    expect(server).toMatchObject({ finish: "Peer walnut", material: "Ash", row_version: 3 });
    expect(field("Finish")).toHaveValue("First");
  });

  it("untouched fields, including a saved value typed with spaces and Dimensions, follow the adopted row", async () => {
    render(<Harness />);
    await type("Finish", " Walnut ");
    await answer(0);
    expect(server).toMatchObject({ finish: "Walnut", row_version: 2 });
    expect(field("Finish")).toHaveValue("Walnut");

    peerSaves({ finish: "Peer oak", selected_dimensions: { width: "90", unit: "in" } as never });
    await enter("Material", "Ash");
    await answer(1);
    // The saved " Walnut " is clean, so the field shows the peer's.
    expect(field("Finish")).toHaveValue("Peer oak");
    expect(screen.getByRole("textbox", { name: "width" })).toHaveValue("90");
    // Material began from a value the peer left alone: it sends on the peer's row.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mockSpecCalls[2].input).toMatchObject({
      expectedRowVersion: 3,
      changes: { material: "Ash" },
    });
    await answer(2);

    // Passing through them writes nothing over the peer.
    await type("Finish", "Peer oak");
    await act(async () => {
      fireEvent.blur(screen.getByRole("textbox", { name: "width" }));
    });
    expect(mockSpecCalls).toHaveLength(3);
    expect(server).toMatchObject({ finish: "Peer oak", material: "Ash", row_version: 4 });
  });

  it("an edited Dimensions draft stays over the adopted row and names the change", async () => {
    render(<Harness />);
    const width = () => screen.getByRole("textbox", { name: "width" });
    fireEvent.change(width(), { target: { value: "72" } });
    peerSaves({ selected_dimensions: { width: "90", unit: "in" } as never });
    await act(async () => {
      fireEvent.blur(width());
    });
    await answer(0);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Dimensions changed in another session. Save again to replace it.",
    );
    expect(width()).toHaveValue("72");
    await act(async () => {
      fireEvent.blur(width());
    });
    expect(mockSpecCalls).toHaveLength(1);
    fireEvent.change(width(), { target: { value: "74" } });
    await act(async () => {
      fireEvent.blur(width());
    });
    expect(mockSpecCalls[1].input).toMatchObject({
      expectedRowVersion: 2,
      changes: { selected_dimensions: { width: "74" } },
    });
  });

  it("says a cleared peer value, and a peer edit elsewhere on the row, in words", async () => {
    render(<Harness />);
    peerSaves({ finish: null });
    await enter("Finish", "Mine");
    await answer(0);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Finish cleared in another session. Save again to replace it.",
    );

    // Put back to what the peer left: nothing to write, and the mark clears.
    fireEvent.change(field("Finish"), { target: { value: "" } });
    await act(async () => {
      fireEvent.keyDown(field("Finish"), { key: "Enter" });
    });
    expect(mockSpecCalls).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();

    // A peer edit elsewhere on the row: Color sends on the peer's row.
    peerSaves({ material: "Peer ash" });
    await enter("Color", "Moss");
    await answer(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mockSpecCalls[2].input).toMatchObject({
      expectedRowVersion: 3,
      changes: { color_fabric: "Moss" },
    });
    await answer(2);
    expect(server).toMatchObject({ material: "Peer ash", color_fabric: "Moss" });
    expect(field("Material")).toHaveValue("Peer ash");
  });

  it("a draft typed while another field's write is out is checked when it commits (repro 1)", async () => {
    render(<Harness />);
    await enter("Finish", "Mine");
    // Typed, not left: nothing is handed over yet.
    act(() => field("Material").focus());
    fireEvent.change(field("Material"), { target: { value: "Ash" } });
    peerSaves({ finish: "Peer oak", material: "Peer ash" });
    await answer(0);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Finish changed in another session to “Peer oak”.",
    );
    // The adopted row does not reach a dirty field.
    expect(field("Material")).toHaveValue("Ash");

    await act(async () => {
      fireEvent.blur(field("Material"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockSpecCalls).toHaveLength(1);
    expect(server).toMatchObject({ material: "Peer ash", row_version: 2 });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Material changed in another session to “Peer ash”. Save again to replace it.",
    );
    expect(field("Material")).toHaveValue("Ash");
    expect(field("Material")).toHaveAttribute("aria-invalid", "true");
    expect(field("Material")).toHaveFocus();

    // The explicit save builds on the row as it is now.
    await act(async () => {
      fireEvent.keyDown(field("Material"), { key: "Enter" });
    });
    expect(mockSpecCalls[1].input).toMatchObject({
      expectedRowVersion: 2,
      changes: { material: "Ash" },
    });
    await answer(1);
    expect(server).toMatchObject({ finish: "Peer oak", material: "Ash", row_version: 3 });
    expect(field("Material")).not.toHaveAttribute("aria-invalid");
  });

  it("Dimensions compare by value, not key order (repro 2)", async () => {
    server = { ...server, selected_dimensions: { width: "90", unit: "in" } as never };
    render(<Harness />);
    const width = () => screen.getByRole("textbox", { name: "width" });
    // The peer's row returns the same measurements with its keys reordered.
    peerSaves({ finish: "Peer oak", selected_dimensions: { unit: "in", width: "90" } as never });
    await enter("Material", "Ash");
    await answer(0);
    expect(mockSpecCalls[1].input).toMatchObject({ changes: { material: "Ash" } });
    await answer(1);
    // Clean, the measurements pass through without a write.
    await act(async () => {
      fireEvent.blur(width());
    });
    expect(mockSpecCalls).toHaveLength(2);

    // An edit that began from the same measurements in another order is
    // not a conflict.
    peerSaves({ selected_dimensions: { width: "90", unit: "in" } as never });
    fireEvent.change(width(), { target: { value: "72" } });
    await act(async () => {
      fireEvent.blur(width());
    });
    await answer(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mockSpecCalls[3].input).toMatchObject({
      expectedRowVersion: 4,
      changes: { selected_dimensions: { width: "72", unit: "in" } },
    });
  });

  it("an image chosen while another write is out is checked against the image it replaced", async () => {
    render(<Harness />);
    await enter("Finish", "Mine");
    const link = screen.getByRole("textbox", { name: "Paste an image link" });
    fireEvent.change(link, { target: { value: "https://example.com/mine.jpg" } });
    await act(async () => {
      fireEvent.keyDown(link, { key: "Enter" });
    });
    expect(mockSpecCalls).toHaveLength(1);
    peerSaves({
      finish: "Peer oak",
      selected_media: [{ url: "https://example.com/peer.jpg" }] as never,
    });
    await answer(0);

    // Neither write goes over the peer.
    expect(mockSpecCalls).toHaveLength(1);
    expect(server).toMatchObject({
      finish: "Peer oak",
      selected_media: [{ url: "https://example.com/peer.jpg" }],
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Image changed in another session. Finish changed in another session to “Peer oak”. Save again to replace them.",
    );
  });

  it("a focus the pane moves after a conflict never commits another conflicted field", async () => {
    render(<Harness />);
    // Material is in conflict, its draft kept.
    peerSaves({ material: "Peer ash" });
    await enter("Material", "Ash");
    await answer(0);
    expect(screen.getByRole("alert")).toHaveTextContent("Material changed in another session");
    expect(mockSpecCalls).toHaveLength(1);

    // Finish holds a draft begun before a peer changed it.
    act(() => field("Finish").focus());
    fireEvent.change(field("Finish"), { target: { value: "Mine" } });
    peerSaves({ finish: "Peer oak" });
    // Notes began from a value the peer left alone: it lands on the peer's row.
    await type("Notes", "Note");
    await answer(1);
    await answer(2);
    expect(server).toMatchObject({ trade_notes: "Note", finish: "Peer oak", row_version: 4 });

    // Tab from Finish into Material: Finish alerts and takes focus back,
    // which leaves Material; Material's draft is not sent.
    await act(async () => {
      field("Material").focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(field("Finish")).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Finish changed in another session to “Peer oak”.",
    );
    expect(mockSpecCalls).toHaveLength(3);
    expect(server).toMatchObject({ material: "Peer ash", finish: "Peer oak" });
    expect(field("Material")).toHaveValue("Ash");
    expect(field("Material")).toHaveAttribute("aria-invalid", "true");

    // Each saves only on its own explicit save.
    await act(async () => {
      fireEvent.keyDown(field("Finish"), { key: "Enter" });
    });
    expect(mockSpecCalls[3].input).toMatchObject({
      expectedRowVersion: 4,
      changes: { finish: "Mine" },
    });
    await answer(3);
    expect(server).toMatchObject({ finish: "Mine", material: "Peer ash" });
  });

  it("A, then B sent, then A typed again before B lands: the new A stays and saves (new)", async () => {
    server = { ...server, finish: "A" };
    render(<Harness />);
    await enter("Finish", "B");
    fireEvent.change(field("Finish"), { target: { value: "A" } });
    await answer(0);
    expect(shown).toMatchObject({ finish: "B", row_version: 2 });
    // B's answer acknowledges B's generation only.
    expect(field("Finish")).toHaveValue("A");
    expect(mockSpecCalls).toHaveLength(1);

    await act(async () => {
      fireEvent.keyDown(field("Finish"), { key: "Enter" });
    });
    expect(mockSpecCalls[1].input).toMatchObject({
      expectedRowVersion: 2,
      changes: { finish: "A" },
    });
    await answer(1);
    expect(server).toMatchObject({ finish: "A", row_version: 3 });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("F6: one writer per row", () => {
  it("a field committed while a write is out waits, then sends what it shows on the answered row_version", async () => {
    render(<Harness />);
    await type("Finish", "Linen");
    await type("Material", "Ash");
    await type("Material", "Oak");
    // Only one write of the row is out.
    expect(mockSpecCalls).toHaveLength(1);
    expect(mockSpecCalls[0].input).toMatchObject({
      expectedRowVersion: 1,
      changes: { finish: "Linen" },
    });

    await answer(0);
    // The waiting field sends the value it shows now (Oak, never Ash), on
    // the version the first write answered.
    expect(mockSpecCalls).toHaveLength(2);
    expect(mockSpecCalls[1].input).toMatchObject({
      expectedRowVersion: 2,
      changes: { material: "Oak" },
    });
    await answer(1);

    expect(server).toMatchObject({ finish: "Linen", material: "Oak", row_version: 3 });
    expect(shown).toMatchObject({ finish: "Linen", material: "Oak", row_version: 3 });
    expect(snapshot().dirty).toBe(false);
    expect(await flush()).toBeUndefined();
    expect(mockSpecCalls).toHaveLength(2);
  });
});

describe("F3: an older answer never speaks for a newer field", () => {
  it("older success, then the newer value's refusal: the newer draft stays marked and holds", async () => {
    render(<Harness />);
    await type("Finish", "First");
    await type("Finish", "Second");
    await answer(0);
    expect(shown.finish).toBe("First");
    expect(mockSpecCalls[1].input).toMatchObject({
      expectedRowVersion: 2,
      changes: { finish: "Second" },
    });
    await refuse(1, "Second was refused.");

    expect(field("Finish")).toHaveValue("Second");
    expect(field("Finish")).toHaveAttribute("aria-invalid", "true");
    expect(snapshot().dirty).toBe(true);
    expect(await flush()).toMatch("Second was refused.");
    expect(document.activeElement).toBe(field("Finish"));
    // Nothing was written behind the designer's back.
    expect(mockSpecCalls).toHaveLength(2);
  });

  it("older refusal, then the newer value's success: the older refusal marks nothing", async () => {
    render(<Harness />);
    await type("Finish", "First");
    await type("Finish", "Second");
    await refuse(0, "First was refused.");
    // The older refusal no longer speaks for the field: no mark, no alert.
    expect(field("Finish")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mockSpecCalls[1].input).toMatchObject({
      expectedRowVersion: 1,
      changes: { finish: "Second" },
    });
    await answer(1);

    expect(shown.finish).toBe("Second");
    expect(field("Finish")).toHaveValue("Second");
    expect(field("Finish")).not.toHaveAttribute("aria-invalid");
    expect(snapshot().dirty).toBe(false);
    expect(await flush()).toBeUndefined();
  });

  it("a field's failure stays marked until it saves or shows the answered value again", async () => {
    render(<Harness />);
    await type("Finish", "Refused");
    await refuse(0, "Refused once.");
    expect(field("Finish")).toHaveAttribute("aria-invalid", "true");
    // Another field's success does not clear it.
    await type("Material", "Oak");
    await answer(1);
    expect(field("Finish")).toHaveAttribute("aria-invalid", "true");
    expect(snapshot().dirty).toBe(true);
    // Put back to the answered value: clean, and nothing is written.
    await type("Finish", "Old finish");
    expect(field("Finish")).not.toHaveAttribute("aria-invalid");
    expect(snapshot().dirty).toBe(false);
    expect(mockSpecCalls).toHaveLength(2);
  });
});

describe("F2: a failed Fill holds while its preview shows", () => {
  async function preview() {
    fireEvent.click(screen.getByRole("button", { name: "FILL WITH A PRODUCT" }));
    fireEvent.click(screen.getByRole("button", { name: "choose product" }));
    expect(screen.getByTestId("fill-preview")).toBeInTheDocument();
  }

  it("holds after the refusal, through more than one Return, until PUT BACK", async () => {
    mockPlace.mockRejectedValue(new Error("The fill was refused."));
    render(<Harness />);
    await preview();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "FILL THIS LINE" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("The fill was refused.");
    expect(screen.getByTestId("fill-preview")).toBeInTheDocument();
    expect(snapshot().dirty).toBe(true);

    expect(await flush()).toMatch("The fill was refused.");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "FILL THIS LINE" }),
    );
    expect(await flush()).toMatch("The fill was refused.");
    expect(mockPlace).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "PUT BACK" }));
    expect(snapshot().dirty).toBe(false);
    expect(await flush()).toBeUndefined();
  });

  it("the fill's own retry that lands clears its hold", async () => {
    mockPlace.mockRejectedValueOnce(new Error("The fill was refused."));
    render(<Harness />);
    await preview();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "FILL THIS LINE" }));
    });
    expect(snapshot().dirty).toBe(true);

    mockPlace.mockResolvedValueOnce({});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "FILL THIS LINE" }));
    });
    expect(onFilled).toHaveBeenCalledWith("Sofa filled with Walnut chair.");
    expect(snapshot().dirty).toBe(false);
  });
});

describe("F7: a Fill that answers after its pane is gone changes nothing", () => {
  it("does not call onFilled (the lens's selection and focus stay)", async () => {
    const write = deferred();
    mockPlace.mockImplementation(() => write.promise);
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "FILL WITH A PRODUCT" }));
    fireEvent.click(screen.getByRole("button", { name: "choose product" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "FILL THIS LINE" }));
    });
    unmount();
    await act(async () => write.resolve({}));
    expect(onFilled).not.toHaveBeenCalled();
  });
});

describe("F11: a failed Dimensions field is marked", () => {
  it("marks each dimension input aria-invalid until it saves", async () => {
    render(<Harness />);
    const width = screen.getByRole("textbox", { name: "width" });
    fireEvent.change(width, { target: { value: "72" } });
    await act(async () => {
      fireEvent.blur(width);
    });
    expect(mockSpecCalls[0].input.changes).toMatchObject({
      selected_dimensions: { width: "72" },
    });
    await refuse(0, "The dimensions were refused.");
    for (const name of ["width", "depth", "height"]) {
      expect(screen.getByRole("textbox", { name })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    }
    expect(screen.getByRole("combobox", { name: "unit" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(await flush()).toMatch("The dimensions were refused.");
    expect(document.activeElement).toBe(width);

    await act(async () => {
      fireEvent.blur(width);
    });
    await answer(1);
    expect(screen.getByRole("textbox", { name: "width" })).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(snapshot().dirty).toBe(false);
  });
});

describe("F12: child editors' writes reach the same hold", () => {
  it("an item label write holds while out; its refused draft holds until put back", async () => {
    const write = deferred();
    mockSetLabel.mockImplementation(() => write.promise);
    render(<Harness />);
    const label = screen.getByRole("textbox", { name: "Item label" });
    fireEvent.change(label, { target: { value: "A-7" } });
    await act(async () => {
      fireEvent.blur(label);
    });
    expect(snapshot()).toMatchObject({ dirty: true, flushing: true });

    await act(async () => write.reject(new Error("The label is taken.")));
    expect(snapshot().dirty).toBe(true);
    expect(await flush()).toMatch("The label is taken.");
    expect(document.activeElement).toBe(label);

    fireEvent.keyDown(label, { key: "Escape" });
    expect(snapshot().dirty).toBe(false);
    expect(mockSetLabel).toHaveBeenCalledTimes(1);
  });

  it("a COM write holds a waiting close until it lands", async () => {
    const write = deferred();
    mockAddFabric.mockImplementation(() => write.promise);
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "This piece takes COM" }));
    });
    expect(snapshot()).toMatchObject({ dirty: true, flushing: true });
    let folded = false;
    const close = flushBoardOwnerAutosaves(owner).then(() => {
      folded = true;
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(folded).toBe(false);
    await act(async () => {
      write.resolve("fabric-1");
      await close;
    });
    expect(folded).toBe(true);
    expect(snapshot().dirty).toBe(false);
  });
});

describe("SQ-1899 F1: a child editor's mark belongs to its open attempt", () => {
  async function addLabor() {
    fireEvent.click(screen.getByRole("button", { name: "ADD LABOR" }));
    fireEvent.change(screen.getByPlaceholderText("Install, wallpaper hanger"), {
      target: { value: "Install sofa" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ADD THE LABOR LINE" }));
    });
  }
  async function saveRoom() {
    fireEvent.click(screen.getByRole("button", { name: /Change A room's share/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
    });
  }
  const putBack = (form: RegExp) =>
    fireEvent.click(
      within(screen.getByRole("form", { name: form })).getByRole("button", {
        name: "PUT BACK",
      }),
    );

  it("Labor: put back while the write is out, its late refusal marks nothing and holds nothing", async () => {
    const write = deferred();
    mockAddLabor.mockImplementation(() => write.promise);
    render(<Harness />);
    await addLabor();
    expect(snapshot()).toMatchObject({ dirty: true, flushing: true });

    putBack(/Add labor to Sofa/);
    await act(async () => write.reject(new Error("The labor line was refused.")));

    expect(screen.queryByRole("form", { name: /Add labor to Sofa/ })).toBeNull();
    expect(screen.queryByText("The labor line was refused.")).toBeNull();
    expect(snapshot()).toMatchObject({ dirty: false, error: null });
    expect(await flush()).toBeUndefined();
    expect(mockAddLabor).toHaveBeenCalledTimes(1);
  });

  it("Labor: a close already waiting still stops once on the cancelled refusal, then folds", async () => {
    const write = deferred();
    mockAddLabor.mockImplementation(() => write.promise);
    render(<Harness />);
    await addLabor();
    let refusal: string | undefined;
    const waiting = flushBoardOwnerAutosaves(owner).catch((e: Error) => {
      refusal = e.message;
    });
    putBack(/Add labor to Sofa/);
    await act(async () => {
      write.reject(new Error("The labor line was refused."));
      await waiting;
    });
    // The close that was waiting stops once, and says why.
    expect(refusal).toBeDefined();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The labor line was refused.",
    );
    expect(snapshot().dirty).toBe(false);
    expect(await flush()).toBeUndefined();
  });

  it("Rooms: put back while the write is out, its late refusal marks nothing and holds nothing", async () => {
    const write = deferred();
    mockSetPlacements.mockImplementation(() => write.promise);
    render(<Harness />);
    await saveRoom();
    expect(snapshot()).toMatchObject({ dirty: true, flushing: true });

    putBack(/A room/);
    await act(async () => write.reject(new Error("The rooms were refused.")));

    expect(screen.queryByRole("form", { name: /A room/ })).toBeNull();
    expect(screen.queryByText("The rooms were refused.")).toBeNull();
    expect(snapshot()).toMatchObject({ dirty: false, error: null });
    expect(await flush()).toBeUndefined();
    expect(mockSetPlacements).toHaveBeenCalledTimes(1);
  });

  it("Rooms: a late success for a put-back form does not close the form opened since", async () => {
    const write = deferred();
    mockSetPlacements.mockImplementation(() => write.promise);
    render(<Harness />);
    await saveRoom();
    putBack(/A room/);
    fireEvent.click(screen.getByRole("button", { name: /Change A room's share/ }));
    await act(async () => write.resolve(undefined));
    expect(screen.getByRole("form", { name: /A room/ })).toBeInTheDocument();
  });

  it("Item label: Esc while the write is out, its late refusal marks nothing", async () => {
    const write = deferred();
    mockSetLabel.mockImplementation(() => write.promise);
    render(<Harness />);
    const label = screen.getByRole("textbox", { name: "Item label" });
    fireEvent.change(label, { target: { value: "A-7" } });
    await act(async () => {
      fireEvent.blur(label);
    });
    fireEvent.keyDown(label, { key: "Escape" });
    await act(async () => write.reject(new Error("The label is taken.")));

    expect(label).toHaveValue("");
    expect(label).not.toHaveAttribute("aria-invalid");
    expect(snapshot()).toMatchObject({ dirty: false, error: null });
    expect(await flush()).toBeUndefined();
  });
});

describe("SQ-1899 F2: a marked field keeps its alert", () => {
  it("another field's write and save leave the marked field's alert in place", async () => {
    render(<Harness />);
    await type("Finish", "Refused");
    await refuse(0, "Refused once.");
    expect(screen.getByRole("alert")).toHaveTextContent("Refused once.");

    await type("Material", "Oak");
    expect(screen.getByRole("alert")).toHaveTextContent("Refused once.");
    await answer(1);
    expect(field("Finish")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Refused once.");

    // Put back: the failure is gone, and so is its alert.
    await type("Finish", "Old finish");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("SQ-1899 F4: an answer for a pane that is gone publishes nothing", () => {
  let setMounted: (mounted: boolean) => void = () => {};
  let setShared: (spec: SpecLensSpec) => void = () => {};
  const onSpecSaved = jest.fn();
  /** The shared row (the lens's cache) above a pane that mounts and unmounts. */
  function Shared() {
    const [spec, setSpec] = useState<SpecLensSpec>(server);
    const [mounted, mount] = useState(true);
    shown = spec;
    setMounted = mount;
    setShared = setSpec;
    return mounted ? (
      <SpecFieldsPane
        projectId="p1"
        canSeeMoney
        line={line}
        spec={spec}
        needLabel="Sofa"
        piece={null}
        laborLines={[]}
        placements={[]}
        rooms={[]}
        onSpecSaved={(saved) => {
          onSpecSaved(saved);
          setSpec((current) => ({ ...current, ...saved }));
        }}
        autosaveOwner={owner}
      />
    ) : null;
  }
  const remount = async () => {
    await act(async () => setMounted(false));
    await act(async () => setMounted(true));
  };

  it("a detached acknowledgement never takes the shared row back a version; the next write uses the latest", async () => {
    onSpecSaved.mockReset();
    render(<Shared />);
    await type("Finish", "Linen");
    // The pane goes; its write commits at the table (v2) but answers late.
    await act(async () => setMounted(false));
    server = { ...server, finish: "Linen", row_version: 2 } as SpecLensSpec;
    const late = { ...server };
    // A refetch hands the row on at v2, and the pane reopens on it.
    await act(async () => setShared(late));
    await act(async () => setMounted(true));
    await type("Material", "Oak");
    expect(mockSpecCalls[1].input.expectedRowVersion).toBe(2);
    await answer(1);
    expect(shown).toMatchObject({ row_version: 3, material: "Oak" });

    // The gone pane's answer arrives now: nothing is published.
    await act(async () => mockSpecCalls[0].resolve(late));
    expect(onSpecSaved).toHaveBeenCalledTimes(1);
    expect(shown).toMatchObject({ row_version: 3, material: "Oak" });

    // Reopened again, the next write goes on the latest version.
    await remount();
    await type("Color", "Red");
    expect(mockSpecCalls[2].input.expectedRowVersion).toBe(3);
  });
});

describe("legacy /pieces (no owner): one writer per row, no hold", () => {
  it("writes on blur, one at a time on the answered version, and marks nothing", async () => {
    render(<Harness held={false} />);
    await type("Finish", "Linen");
    await type("Material", "Oak");
    expect(mockSpecCalls).toHaveLength(1);
    await answer(0);
    expect(mockSpecCalls[1].input).toMatchObject({
      expectedRowVersion: 2,
      changes: { material: "Oak" },
    });
    await refuse(1, "Refused.");
    expect(screen.getByRole("alert")).toHaveTextContent("Refused.");
    expect(field("Material")).not.toHaveAttribute("aria-invalid");
    expect(snapshot().registeredBuffers).toBe(0);

    // Its own retry is immediate (nothing out), on the answered version.
    await act(async () => {
      fireEvent.blur(field("Material"));
    });
    expect(mockSpecCalls[2].input).toMatchObject({
      expectedRowVersion: 2,
      changes: { material: "Oak" },
    });
  });
});
