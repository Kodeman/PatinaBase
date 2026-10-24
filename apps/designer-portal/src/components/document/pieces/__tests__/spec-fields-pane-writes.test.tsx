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
 */

import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
const mutation = (fn: (input: never) => unknown) => ({
  mutateAsync: fn,
  isPending: false,
});

jest.mock("@patina/supabase", () => ({
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
  useSetLinePlacements: () => mutation(jest.fn()),
  useAddLaborLine: () => mutation(jest.fn()),
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
const CONFLICT = "This selection changed in another session. Refresh before saving.";

/** Answers write `i` as the table would. */
async function answer(i: number) {
  const call = mockSpecCalls[i];
  await act(async () => {
    if (call.input.expectedRowVersion !== server.row_version) {
      call.reject(new Error(CONFLICT));
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
