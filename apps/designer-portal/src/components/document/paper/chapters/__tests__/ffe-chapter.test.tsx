import { browserNavigation } from "../../__tests__/browser-navigation.cjs";
/**
 * SQ-1891, repaired by SQ-1894 (WP-01.6): the round-8 FF&E chapter hosting
 * the real UnfoldInstrument, SpecLens and SpecFieldsPane. Only the Build room
 * wrapper (its title, a room heading and the Spec lens), the data reads and
 * the writes are stood in for.
 *
 * - SQ-1890 F1: `?unfold=pieces&lens=spec&line=<id>` opens and focuses that
 *   line, not the lens's first unfinished one.
 * - The close barrier HOLDS, never replays (SQ-1893 F1–F3): Return waits for
 *   any write from the pane, stays open on a field showing a failed draft,
 *   and the retry is that field's own save of the value it shows.
 * - SQ-1893 F4–F7: a missing line is said and falls back visibly; the address
 *   follows the chosen line; the landing waits for the reads, then yields to
 *   the reader.
 * - SQ-1897 (story #38): one writer per row, so a put-back value lands last
 *   on the answered version (F4); Back with an unsaved field puts the unfold
 *   back and focuses the field (F1); a Fill answered after another line was
 *   chosen leaves that line and its address alone (F7).
 */

import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  getProposalAutosaveSnapshot,
  resetProposalAutosaveRegistryForTests,
} from "@/lib/proposal-autosave-registry";
import { ffeSheetAutosaveOwner } from "../ffe-work-room";
import {
  UNFOLD_SAVING_MESSAGE,
  UNFOLD_UNSAVED_MESSAGE,
} from "@/components/document/paper/unfold-instrument";
import { SPEC_LINE_MISSING_SENTENCE } from "@/components/document/pieces/spec-lens";

const DOC = "11111111-1111-4111-8111-111111111111";
const ROOM = "22222222-2222-4222-8222-222222222222";
const FIRST = "33333333-3333-4333-8333-333333333333";
const SECOND = "44444444-4444-4444-8444-444444444444";
const GONE = "55555555-5555-4555-8555-555555555555";

const line = (id: string, name: string) => ({
  id,
  name,
  quantity: 1,
  unit: "each",
  product_id: null,
  vendor_id: null,
  vendor_name: null,
  item_type: "tbd",
  unit_price_cents: 0,
  ffe_line_authorization: null,
  line_kind: "goods",
  parent_ffe_item_id: null,
  link_kind: null,
  project_room_id: ROOM,
  assignment_scope: "room",
  design_disposition: "candidate",
  role_identity: "default",
  purchase_order_id: null,
  trade_scope_document_id: null,
  status: "specified",
  product: null,
  selection_thread_id: null,
});

const mockLines = [line(FIRST, "Initial line"), line(SECOND, "Requested line")];
const mockSpecs = mockLines.map((l) => ({
  id: `spec-${l.id}`,
  ffe_item_id: l.id,
  row_version: 1,
  finish: "Old finish",
  material: null,
  color_fabric: null,
  selected_dimensions: null,
  exact_location: null,
  trade_notes: null,
  selected_media: [],
}));
const mockUpdateSpec = jest.fn();
const mockBuildFields = jest.fn();
const mockPlace = jest.fn();
const mockLinesHook = jest.fn((): { data: unknown } => ({ data: mockLines }));
const mutation = (fn: jest.Mock) => ({ mutateAsync: fn, isPending: false });

jest.mock("@patina/supabase", () => ({
  createBrowserClient: () => ({
    from: (table: string) => ({
      select: () => ({
        in: async () => ({
          data: table === "project_ffe_specs" ? mockSpecs : [],
          error: null,
        }),
      }),
    }),
  }),
  useProjectFFEItems: () => mockLinesHook(),
  useProjectRoomPlacements: () => ({ data: [] }),
  useProjectLineGroups: () => ({ data: [] }),
  useUpdateProjectFfeSpec: () => mutation(mockUpdateSpec),
  useSetFfeLineCommercials: () => mutation(jest.fn()),
  useSetFfeLineBuildFields: () => mutation(mockBuildFields),
  useSetLaborLinePrice: () => mutation(jest.fn()),
  usePlaceProductInProjectV2: () => mutation(mockPlace),
  useSetLinePlacements: () => mutation(jest.fn()),
  useAddLaborLine: () => mutation(jest.fn()),
  useFfePairLines: () => ({ data: [] }),
  useLinkFfePair: () => mutation(jest.fn()),
  useCreateNamedProjectNeed: () => mutation(jest.fn()),
  useSetFfeItemLabel: () => mutation(jest.fn()),
  itemLabelRefusal: () => null,
}));
jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock("@/hooks/use-can-see-margin", () => ({ useCanSeeMargin: () => true }));
jest.mock("@/hooks/use-document-rooms", () => ({
  useDocumentRooms: () => ({ data: [{ id: ROOM, name: "Living Room" }] }),
}));
jest.mock("@/components/document/line-unfold/the-buy-cell", () => ({
  MakerSearch: () => null,
  MakerMatchLine: () => null,
  useAddMaker: () => ({
    add: jest.fn(),
    match: null,
    clearMatch: jest.fn(),
    isPending: false,
  }),
}));
jest.mock("@/components/document/pieces/library-inline-search", () => ({
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
// The wrapper only: its title (which the embedded shell focuses), the room's
// heading, and the real Spec lens with the props the embedded BuildRoom
// hands it (a chosen line re-addresses through `onNavigate`).
jest.mock("@/components/document/pieces/build-room", () => {
  const { useEffect, useRef } = jest.requireActual("react");
  const { SpecLens } = jest.requireActual(
    "@/components/document/pieces/spec-lens",
  );
  return {
    BuildRoom: (props: {
      docId: string;
      lens: string;
      room: string | null;
      canSeeMoney: boolean;
      line?: string | null;
      autosaveOwner?: unknown;
      onNavigate: (next: object) => void;
      onReturn: () => void;
    }) => {
      const title = useRef<HTMLHeadingElement>(null);
      useEffect(() => title.current?.focus(), []);
      return (
        <div>
          <h2 ref={title} tabIndex={-1} data-build-room-title="">
            Sheet title
          </h2>
          {props.room && (
            <h3 tabIndex={-1} data-room-heading={props.room}>
              Living Room
            </h3>
          )}
          {props.lens === "spec" && (
            <SpecLens
              docId={props.docId}
              projectId="p1"
              room={props.room}
              canSeeMoney={props.canSeeMoney}
              line={props.line}
              autosaveOwner={props.autosaveOwner}
              onChooseLine={(id: string) =>
                props.onNavigate({ lens: props.lens, room: props.room, line: id })
              }
            />
          )}
        </div>
      );
    },
  };
});

import { FfeChapter } from "../ffe-chapter";

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderChapter(search: string) {
  window.history.replaceState({}, "", `/doc/${DOC}?${search}`);
  return render(
    <FfeChapter docId={DOC}>
      <p>The chapter body</p>
    </FfeChapter>,
    { wrapper },
  );
}

const params = () => new URL(window.location.href).searchParams;
const unfolded = () => params().get("unfold");
const finish = () => screen.findByRole("textbox", { name: "Finish" });
const returnToRoom = () =>
  screen.getByRole("button", { name: /Return to the room/ });
const lineButton = (id: string) =>
  document.querySelector<HTMLButtonElement>(`[data-line-id="${id}"] button`);
const scrolled = () => Element.prototype.scrollIntoView as jest.Mock;
/** A saved spec row answered for `changes`, one version on. */
const saved =
  (version: number) =>
  async ({ specId, changes }: { specId: string; changes: object }) => ({
    ...mockSpecs.find((s) => s.id === specId)!,
    ...changes,
    row_version: version,
  });
/** A write the test settles itself. */
function held() {
  let resolve: (value: unknown) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise((ok, no) => {
    resolve = ok;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function clickReturn() {
  await act(async () => {
    fireEvent.click(returnToRoom());
  });
}

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  resetProposalAutosaveRegistryForTests();
  mockUpdateSpec.mockReset();
  mockBuildFields.mockReset();
  mockPlace.mockReset();
  mockLinesHook.mockReset();
  mockLinesHook.mockImplementation(() => ({ data: mockLines }));
  scrolled().mockClear();
});

let restoreNavigation: (() => void) | undefined;
afterEach(() => {
  restoreNavigation?.();
  restoreNavigation = undefined;
  jest.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("SQ-1890 F1: the unfold address lands on its line", () => {
  it("opens and focuses the addressed Spec line, not the first unfinished one", async () => {
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);

    const chosen = await waitFor(() => {
      expect(lineButton(SECOND)).not.toBeNull();
      return lineButton(SECOND)!;
    });
    await waitFor(() => expect(chosen).toHaveAttribute("aria-current", "true"));
    expect(chosen).toHaveTextContent("Requested line");
    await waitFor(() => expect(document.activeElement).toBe(chosen));
    expect(lineButton(FIRST)?.getAttribute("aria-current")).toBeNull();
    expect(
      document.querySelector("[data-spec-line-missing]")?.textContent,
    ).toBe("");
  });

  it("keeps the lens's own first unfinished line when no line is named", async () => {
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}`);
    const row = await waitFor(() => {
      expect(lineButton(FIRST)).not.toBeNull();
      return lineButton(FIRST)!;
    });
    expect(row).toHaveAttribute("aria-current", "true");
  });
});

describe("the close barrier holds, never replays", () => {
  it("holds a pending blur save, stays on the failed field, and its own retry lands", async () => {
    const first = held();
    mockUpdateSpec.mockImplementationOnce(() => first.promise);
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const field = await finish();
    await waitFor(() => expect(field).toHaveValue("Old finish"));

    fireEvent.change(field, { target: { value: "Unsaved finish" } });
    await act(async () => {
      fireEvent.blur(field);
    });
    expect(mockUpdateSpec).toHaveBeenCalledTimes(1);
    expect(mockUpdateSpec.mock.calls[0][0]).toMatchObject({
      specId: `spec-${SECOND}`,
      expectedRowVersion: 1,
      changes: { finish: "Unsaved finish" },
    });

    // The close waits while the write is out.
    await clickReturn();
    expect(unfolded()).toBe("pieces");
    expect(screen.getByText(UNFOLD_SAVING_MESSAGE)).toBeInTheDocument();

    await act(async () => {
      first.reject(new Error("The field was not saved."));
    });
    await screen.findByText(UNFOLD_UNSAVED_MESSAGE);
    expect(unfolded()).toBe("pieces");
    expect(field).toHaveValue("Unsaved finish");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement).toBe(field);
    expect(
      screen
        .getAllByRole("alert")
        .some((alert) => alert.textContent === "The field was not saved."),
    ).toBe(true);
    // Nothing was replayed behind the designer's back.
    expect(mockUpdateSpec).toHaveBeenCalledTimes(1);

    // The field's own retry: leaving it saves the value it shows (in a
    // browser, pressing Return does this), and Return folds once it lands.
    mockUpdateSpec.mockImplementationOnce(saved(2));
    await act(async () => {
      field.blur();
    });
    await clickReturn();
    await waitFor(() => expect(unfolded()).toBeNull());
    expect(mockUpdateSpec).toHaveBeenCalledTimes(2);
    expect(mockUpdateSpec.mock.calls[1][0]).toMatchObject({
      specId: `spec-${SECOND}`,
      expectedRowVersion: 1,
      changes: { finish: "Unsaved finish" },
    });
  });

  it("Return alone never retries: the hold stays on the field until it saves", async () => {
    mockUpdateSpec.mockRejectedValueOnce(new Error("Refused once."));
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const field = await finish();
    await waitFor(() => expect(field).toHaveValue("Old finish"));
    fireEvent.change(field, { target: { value: "Typed finish" } });
    await act(async () => {
      fireEvent.blur(field);
    });
    await screen.findByText("Refused once.");

    // Focus is not on the field; Return holds and brings it there.
    expect(document.activeElement).not.toBe(field);
    await clickReturn();
    await screen.findByText(UNFOLD_UNSAVED_MESSAGE);
    expect(document.activeElement).toBe(field);
    expect(unfolded()).toBe("pieces");
    await clickReturn();
    expect(unfolded()).toBe("pieces");
    expect(mockUpdateSpec).toHaveBeenCalledTimes(1);
  });

  it("folds away at once when nothing is waiting to save", async () => {
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}`);
    await finish();
    await clickReturn();
    await waitFor(() => expect(unfolded()).toBeNull());
    expect(mockUpdateSpec).not.toHaveBeenCalled();
  });

  it("F1: a remounted line's newer save is not held by the old failure", async () => {
    mockUpdateSpec.mockRejectedValueOnce(new Error("The field was not saved."));
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const field = await finish();
    await waitFor(() => expect(field).toHaveValue("Old finish"));
    fireEvent.change(field, { target: { value: "Failed finish" } });
    await act(async () => {
      fireEvent.blur(field);
    });
    await screen.findByText("The field was not saved.");

    // Another line, then back: the pane remounts (its failed draft is gone,
    // as on the /pieces route), and a newer value saves.
    await act(async () => {
      fireEvent.click(lineButton(FIRST)!);
    });
    await act(async () => {
      fireEvent.click(lineButton(SECOND)!);
    });
    const again = await finish();
    expect(again).toHaveValue("Old finish");
    fireEvent.change(again, { target: { value: "Newer finish" } });
    mockUpdateSpec.mockImplementationOnce(saved(2));
    await act(async () => {
      fireEvent.blur(again);
    });

    await clickReturn();
    await waitFor(() => expect(unfolded()).toBeNull());
    expect(mockUpdateSpec.mock.calls.map((call) => call[0].changes)).toEqual([
      { finish: "Failed finish" },
      { finish: "Newer finish" },
    ]);
  });

  it("F2: a field put back after a failure is clean; nothing obsolete is written", async () => {
    mockUpdateSpec.mockRejectedValueOnce(new Error("The field was not saved."));
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const field = await finish();
    await waitFor(() => expect(field).toHaveValue("Old finish"));
    fireEvent.change(field, { target: { value: "Abandoned draft" } });
    await act(async () => {
      fireEvent.blur(field);
    });
    await screen.findByText("The field was not saved.");

    fireEvent.change(field, { target: { value: "Old finish" } });
    await act(async () => {
      fireEvent.blur(field);
    });
    expect(field).not.toHaveAttribute("aria-invalid");

    await clickReturn();
    await waitFor(() => expect(unfolded()).toBeNull());
    expect(mockUpdateSpec).toHaveBeenCalledTimes(1);
    expect(mockUpdateSpec.mock.calls[0][0].changes).toEqual({
      finish: "Abandoned draft",
    });
  });

  /**
   * A spec row that checks row_version as the table does. Writes wait for the
   * test to answer them; a write on an older version is refused.
   */
  function specServer() {
    const row = { ...mockSpecs[1] };
    const calls: {
      input: { expectedRowVersion: number; changes: object };
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }[] = [];
    mockUpdateSpec.mockImplementation(
      (input: { expectedRowVersion: number; changes: object }) =>
        new Promise((resolve, reject) => calls.push({ input, resolve, reject })),
    );
    const answer = (i: number) =>
      act(async () => {
        const call = calls[i];
        if (call.input.expectedRowVersion !== row.row_version) {
          call.reject(new Error("This selection changed in another session."));
          return;
        }
        Object.assign(row, call.input.changes, { row_version: row.row_version + 1 });
        call.resolve({ ...row });
      });
    const refuse = (i: number, message: string) =>
      act(async () => calls[i].reject(new Error(message)));
    return { row, calls, answer, refuse };
  }

  it("F4: put back while a write is out, the shown value lands last, on the answered version", async () => {
    const server = specServer();
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const field = await finish();
    await waitFor(() => expect(field).toHaveValue("Old finish"));
    fireEvent.change(field, { target: { value: "Abandoned draft" } });
    await act(async () => {
      fireEvent.blur(field);
    });
    fireEvent.change(field, { target: { value: "Old finish" } });
    await act(async () => {
      fireEvent.blur(field);
    });
    // One write of the row at a time: the put-back value waits.
    expect(server.calls).toHaveLength(1);

    await server.answer(0);
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].input).toEqual(
      expect.objectContaining({
        expectedRowVersion: 2,
        changes: { finish: "Old finish" },
      }),
    );
    // Out while the second write is: Return waits on it.
    await clickReturn();
    expect(unfolded()).toBe("pieces");
    await server.answer(1);

    await waitFor(() => expect(unfolded()).toBeNull());
    expect(server.row).toMatchObject({ finish: "Old finish", row_version: 3 });
    expect(server.calls).toHaveLength(2);
  });

  it("F4: put back while a refused write is out, nothing more is written and nothing holds", async () => {
    const server = specServer();
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const field = await finish();
    await waitFor(() => expect(field).toHaveValue("Old finish"));
    fireEvent.change(field, { target: { value: "Abandoned draft" } });
    await act(async () => {
      fireEvent.blur(field);
    });
    fireEvent.change(field, { target: { value: "Old finish" } });
    await act(async () => {
      fireEvent.blur(field);
    });
    await server.refuse(0, "The field was not saved.");

    // The shown value is the answered row's: clean, and no write follows.
    expect(server.calls).toHaveLength(1);
    expect(server.row).toMatchObject({ finish: "Old finish", row_version: 1 });
    expect(field).toHaveValue("Old finish");
    expect(field).not.toHaveAttribute("aria-invalid");
    await clickReturn();
    await waitFor(() => expect(unfolded()).toBeNull());
  });

  it("F3: a pending Unit write holds Return; its failure holds once, on the Unit", async () => {
    const unit = held();
    mockBuildFields.mockImplementationOnce(() => unit.promise);
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const select = await screen.findByRole("combobox", { name: "Unit" });

    await act(async () => {
      fireEvent.change(select, { target: { value: "sq_ft" } });
    });
    expect(mockBuildFields).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: SECOND, unit: "sq_ft" }),
    );
    await clickReturn();
    expect(unfolded()).toBe("pieces");
    expect(screen.getByText(UNFOLD_SAVING_MESSAGE)).toBeInTheDocument();

    await act(async () => {
      unit.reject(new Error("The unit was refused."));
    });
    await screen.findByText(UNFOLD_UNSAVED_MESSAGE);
    expect(unfolded()).toBe("pieces");
    expect(
      screen
        .getAllByRole("alert")
        .some((alert) => alert.textContent === "The unit was refused."),
    ).toBe(true);
    expect(document.activeElement).toBe(select);

    // The select shows the saved unit: no draft is left to hold, so the next
    // Return folds, and the Unit was written once.
    await clickReturn();
    await waitFor(() => expect(unfolded()).toBeNull());
    expect(mockBuildFields).toHaveBeenCalledTimes(1);
  });
});

describe("SQ-1897 F1: Back holds like Return", () => {
  it("Back with a failed field puts the unfold back and focuses the field; nothing is replayed", async () => {
    restoreNavigation = browserNavigation().restore;
    mockUpdateSpec.mockRejectedValueOnce(new Error("The field was not saved."));
    // The unfold as a door opens it: a pushed entry over the closed paper.
    window.history.replaceState({}, "", `/doc/${DOC}`);
    window.history.pushState(
      { __patinaUnfold: { pushed: true, context: null } },
      "",
      `/doc/${DOC}?unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`,
    );
    render(
      <FfeChapter docId={DOC}>
        <p>The chapter body</p>
      </FfeChapter>,
      { wrapper },
    );
    const field = await finish();
    await waitFor(() => expect(field).toHaveValue("Old finish"));
    fireEvent.change(field, { target: { value: "Typed finish" } });
    await act(async () => {
      fireEvent.blur(field);
    });
    await screen.findByText("The field was not saved.");
    field.blur();

    await act(async () => {
      window.history.back();
    });
    await screen.findByText(UNFOLD_UNSAVED_MESSAGE);
    expect(unfolded()).toBe("pieces");
    expect(params().get("line")).toBe(SECOND);
    expect(field).toBeInTheDocument();
    expect(field).toHaveValue("Typed finish");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement).toBe(field);
    expect(mockUpdateSpec).toHaveBeenCalledTimes(1);

    // Saved, the next Back folds away.
    mockUpdateSpec.mockImplementationOnce(saved(2));
    await act(async () => {
      field.blur();
    });
    expect(field).not.toHaveAttribute("aria-invalid");
    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(unfolded()).toBeNull());
    expect(mockUpdateSpec).toHaveBeenCalledTimes(2);
  });
});

describe("story #40: Back holds exactly like Return", () => {
  const UNFOLD = `/doc/${DOC}?unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`;
  /** Opens the unfold over `previous`: pushed by a door, or a direct open. */
  function openOver(previous: string, pushed: boolean) {
    window.history.replaceState({}, "", previous);
    window.history.pushState(
      pushed ? { __patinaUnfold: { pushed: true, context: null } } : {},
      "",
      UNFOLD,
    );
    return render(
      <FfeChapter docId={DOC}>
        <p>The chapter body</p>
      </FfeChapter>,
      { wrapper },
    );
  }
  /**
   * A Back the sheet holds never reaches later listeners: wait for it to go
   * back to its entry (story #41: a traversal, never a push).
   */
  async function heldBack(go: jest.SpyInstance, times: number) {
    const standing = window.location.href;
    act(() => window.history.back());
    await waitFor(() => expect(go).toHaveBeenCalledTimes(times));
    await waitFor(() => expect(window.location.href).toBe(standing));
  }
  async function blurWith(field: HTMLElement, value: string) {
    fireEvent.change(field, { target: { value } });
    await act(async () => {
      fireEvent.blur(field);
    });
  }
  const registrations = () =>
    getProposalAutosaveSnapshot(ffeSheetAutosaveOwner(DOC)).registeredBuffers;

  it("a Back while a save is out holds, then folds once it lands, with no loop", async () => {
    restoreNavigation = browserNavigation().restore;
    const write = held();
    mockUpdateSpec.mockImplementationOnce(() => write.promise);
    openOver(`/doc/${DOC}`, true);
    const field = await finish();
    await waitFor(() => expect(field).toHaveValue("Old finish"));
    await blurWith(field, "Pending finish");
    const length = window.history.length;
    const push = jest.spyOn(window.history, "pushState").mockClear();
    const go = jest.spyOn(window.history, "go");

    await heldBack(go, 1);
    expect(window.location.href).toBe(`http://localhost${UNFOLD}`);
    expect(window.history.length).toBe(length);
    expect(field).toBeInTheDocument();
    expect(screen.getByText(UNFOLD_SAVING_MESSAGE)).toBeInTheDocument();

    await act(async () => write.resolve(await saved(2)({
      specId: `spec-${SECOND}`,
      changes: { finish: "Pending finish" },
    })));
    await waitFor(() => expect(unfolded()).toBeNull());
    expect(window.location.pathname).toBe(`/doc/${DOC}`);
    expect(go.mock.calls).toEqual([[1], [-1]]);
    expect(push).not.toHaveBeenCalled();
    expect(mockUpdateSpec).toHaveBeenCalledTimes(1);
  });

  it("a Back while a save is out holds; its refusal keeps the sheet open on the marked field", async () => {
    restoreNavigation = browserNavigation().restore;
    const write = held();
    mockUpdateSpec.mockImplementationOnce(() => write.promise);
    openOver(`/doc/${DOC}`, true);
    const field = await finish();
    await waitFor(() => expect(field).toHaveValue("Old finish"));
    await blurWith(field, "Pending finish");
    const go = jest.spyOn(window.history, "go");

    await heldBack(go, 1);
    await act(async () => write.reject(new Error("The field was not saved.")));

    await screen.findByText(UNFOLD_UNSAVED_MESSAGE);
    expect(unfolded()).toBe("pieces");
    expect(field).toHaveValue("Pending finish");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement).toBe(field);
    expect(
      screen
        .getAllByRole("alert")
        .some((alert) => alert.textContent === "The field was not saved."),
    ).toBe(true);
    expect(mockUpdateSpec).toHaveBeenCalledTimes(1);
  });

  it("a Back to another document over a marked field is held: the draft and its registration stay", async () => {
    restoreNavigation = browserNavigation().restore;
    mockUpdateSpec.mockRejectedValueOnce(new Error("The field was not saved."));
    openOver("/desk", false);
    const field = await finish();
    await waitFor(() => expect(field).toHaveValue("Old finish"));
    await blurWith(field, "Typed finish");
    await screen.findByText("The field was not saved.");
    field.blur();
    const held = registrations();
    expect(held).toBeGreaterThan(0);
    const length = window.history.length;
    const push = jest.spyOn(window.history, "pushState").mockClear();
    const go = jest.spyOn(window.history, "go");

    await heldBack(go, 1);
    await screen.findByText(UNFOLD_UNSAVED_MESSAGE);
    expect(window.location.pathname).toBe(`/doc/${DOC}`);
    expect(unfolded()).toBe("pieces");
    expect(window.history.length).toBe(length);
    expect(field).toBeInTheDocument();
    expect(field).toHaveValue("Typed finish");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement).toBe(field);
    expect(registrations()).toBe(held);
    expect(mockUpdateSpec).toHaveBeenCalledTimes(1);

    // Saved, the next Back reaches /desk and is not held again.
    mockUpdateSpec.mockImplementationOnce(saved(2));
    await act(async () => {
      field.blur();
    });
    expect(field).not.toHaveAttribute("aria-invalid");
    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(window.location.pathname).toBe("/desk"));
    expect(go.mock.calls).toEqual([[1]]);
    expect(push).not.toHaveBeenCalled();
  });

  it("SQ-1901 F2: choosing another line while a Back is held drops it; the old line's late answer folds nothing", async () => {
    restoreNavigation = browserNavigation().restore;
    const write = held();
    mockUpdateSpec.mockImplementationOnce(() => write.promise);
    openOver(`/doc/${DOC}`, true);
    const field = await finish();
    await waitFor(() => expect(field).toHaveValue("Old finish"));
    await blurWith(field, "Pending finish");
    const go = jest.spyOn(window.history, "go");
    await heldBack(go, 1);
    expect(screen.getByText(UNFOLD_SAVING_MESSAGE)).toBeInTheDocument();

    // The pane is keyed by its line: choosing another remounts it.
    await act(async () => {
      fireEvent.click(lineButton(FIRST)!);
    });
    expect(params().get("line")).toBe(FIRST);
    const chosen = window.location.href;
    expect(screen.queryByText(UNFOLD_SAVING_MESSAGE)).toBeNull();

    await act(async () => write.resolve(await saved(2)({
      specId: `spec-${SECOND}`,
      changes: { finish: "Pending finish" },
    })));
    // Long enough for a stale `history.go` to have landed.
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
    expect(window.location.href).toBe(chosen);
    expect(unfolded()).toBe("pieces");
    expect(lineButton(FIRST)).toHaveAttribute("aria-current", "true");
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("SQ-1899 F4: an answer never takes the lens's cached row back a version", async () => {
    const write = held();
    mockUpdateSpec.mockImplementationOnce(() => write.promise);
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const field = await finish();
    await waitFor(() => expect(field).toHaveValue("Old finish"));
    await blurWith(field, "Linen");

    // A refetch lands a newer row (v3) before the write's own answer (v2).
    const query = client
      .getQueryCache()
      .getAll()
      .find((q) => (q.state.data as { specs?: object } | undefined)?.specs);
    const row = () =>
      (query!.state.data as { specs: Record<string, { row_version: number; material: string | null }> })
        .specs[SECOND];
    act(() => {
      client.setQueryData(query!.queryKey, (data: { specs: Record<string, object> }) => ({
        ...data,
        specs: {
          ...data.specs,
          [SECOND]: { ...data.specs[SECOND], finish: "Linen", material: "Oak", row_version: 3 },
        },
      }));
    });
    await act(async () =>
      write.resolve(
        await saved(2)({ specId: `spec-${SECOND}`, changes: { finish: "Linen" } }),
      ),
    );
    expect(row()).toMatchObject({ row_version: 3, material: "Oak" });
  });
});

describe("SQ-1897 F7: a stale Fill answer", () => {
  it("leaves the line chosen since, and its address, alone", async () => {
    const fillWrite = held();
    mockPlace.mockImplementationOnce(() => fillWrite.promise);
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${FIRST}`);
    await waitFor(() =>
      expect(lineButton(FIRST)).toHaveAttribute("aria-current", "true"),
    );
    fireEvent.click(await screen.findByRole("button", { name: "FILL WITH A PRODUCT" }));
    fireEvent.click(screen.getByRole("button", { name: "choose product" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "FILL THIS LINE" }));
    });
    await act(async () => {
      fireEvent.click(lineButton(SECOND)!);
    });
    expect(params().get("line")).toBe(SECOND);

    await act(async () => fillWrite.resolve({}));
    expect(lineButton(SECOND)).toHaveAttribute("aria-current", "true");
    expect(lineButton(FIRST)?.getAttribute("aria-current")).toBeNull();
    expect(params().get("line")).toBe(SECOND);
    expect(document.activeElement).not.toBe(
      screen.getByTestId("spec-fields-pane").querySelector("h2"),
    );
  });
});

describe("F4–F5: the address and the shown line agree", () => {
  it("F4: a line no longer in the room is said, and the lens falls back visibly", async () => {
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${GONE}`);
    const notice = await screen.findByText(SPEC_LINE_MISSING_SENTENCE);
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveAttribute("aria-live", "polite");
    const fallback = lineButton(FIRST)!;
    expect(fallback).toHaveAttribute("aria-current", "true");
    await waitFor(() => expect(document.activeElement).toBe(fallback));

    // Choosing a line answers the notice.
    await act(async () => {
      fireEvent.click(lineButton(SECOND)!);
    });
    expect(screen.queryByText(SPEC_LINE_MISSING_SENTENCE)).toBeNull();
  });

  it("F5: choosing another line re-addresses the unfold without a new entry", async () => {
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${FIRST}`);
    await waitFor(() =>
      expect(lineButton(FIRST)).toHaveAttribute("aria-current", "true"),
    );
    const entries = window.history.length;

    await act(async () => {
      fireEvent.click(lineButton(SECOND)!);
    });
    expect(lineButton(SECOND)).toHaveAttribute("aria-current", "true");
    expect(params().get("line")).toBe(SECOND);
    expect(params().get("unfold")).toBe("pieces");
    expect(params().get("room")).toBe(ROOM);
    expect(window.history.length).toBe(entries);
  });
});

describe("F6–F7: the landing waits for the reads, then yields to the reader", () => {
  /** The lines answer only when the test says so, through a real query. */
  function delayLines() {
    let answer: (lines: unknown) => void = () => {};
    const answered = new Promise((resolve) => {
      answer = resolve;
    });
    // A landing read: the lines' own key family (F10).
    mockLinesHook.mockImplementation(() =>
      useQuery({
        queryKey: ["project-ffe-items", "delayed"],
        queryFn: () => answered,
      }),
    );
    return (lines: unknown) => act(async () => answer(lines));
  }
  const landingTimers = (spy: jest.SpyInstance) =>
    spy.mock.calls.filter((call) => call[1] === 8000);
  /** Landing deadlines set and not cleared. */
  function runningDeadlines(set: jest.SpyInstance, cleared: jest.SpyInstance) {
    const gone = new Set(cleared.mock.calls.map((call) => call[0]));
    return set.mock.calls.flatMap((call, i) =>
      call[1] === 8000 && !gone.has(set.mock.results[i].value)
        ? [call[0] as () => void]
        : [],
    );
  }

  it("F6: the deadline starts only once the reads answer, so delayed data still lands", async () => {
    const timers = jest.spyOn(window, "setTimeout");
    const clears = jest.spyOn(window, "clearTimeout");
    const answer = delayLines();
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const title = await screen.findByText("Sheet title");
    await waitFor(() => expect(document.activeElement).toBe(title));
    // The reads are out: no landing deadline is running.
    await waitFor(() => expect(runningDeadlines(timers, clears)).toHaveLength(0));
    expect(document.activeElement).toBe(title);

    await answer(mockLines);
    await waitFor(() => expect(document.activeElement).toBe(lineButton(SECOND)));
  });

  it("lands again when the sheet retakes its title focus after landing, until the reader moves", async () => {
    renderChapter(`unfold=pieces&lens=rough&room=${ROOM}`);
    const title = await screen.findByText("Sheet title");
    const heading = () => document.querySelector(`[data-room-heading="${ROOM}"]`);
    await waitFor(() => expect(document.activeElement).toBe(heading()));

    // The sheet's own landing effect runs again (React does in development).
    act(() => title.focus());
    expect(document.activeElement).toBe(heading());

    fireEvent.wheel(window);
    act(() => title.focus());
    expect(document.activeElement).toBe(title);
  });

  it("F6: when the deadline passes, the sheet lands on the room's heading, not its title", async () => {
    const timers = jest.spyOn(window, "setTimeout");
    // Rough in, in this stand-in, prints no line rows: the line never shows.
    renderChapter(`unfold=pieces&lens=rough&room=${ROOM}&line=${SECOND}`);
    const title = await screen.findByText("Sheet title");
    await waitFor(() => expect(document.activeElement).toBe(title));
    await waitFor(() => expect(landingTimers(timers)).toHaveLength(1));

    await act(async () => {
      (landingTimers(timers)[0][0] as () => void)();
    });
    expect(document.activeElement).toBe(
      document.querySelector(`[data-room-heading="${ROOM}"]`),
    );
  });

  it("F7: focus the reader moved stays, and nothing scrolls", async () => {
    const answer = delayLines();
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const title = await screen.findByText("Sheet title");
    await waitFor(() => expect(document.activeElement).toBe(title));

    returnToRoom().focus();
    await answer(mockLines);
    await waitFor(() => expect(lineButton(SECOND)).not.toBeNull());
    expect(document.activeElement).toBe(returnToRoom());
    expect(scrolled()).not.toHaveBeenCalled();
  });

  it("F7: once the reader scrolls, the late landing neither scrolls nor moves focus", async () => {
    const answer = delayLines();
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const title = await screen.findByText("Sheet title");
    await waitFor(() => expect(document.activeElement).toBe(title));

    fireEvent.wheel(window);
    await answer(mockLines);
    await waitFor(() => expect(lineButton(SECOND)).not.toBeNull());
    expect(document.activeElement).toBe(title);
    expect(scrolled()).not.toHaveBeenCalled();
  });

  it("F8: a scrollbar drag (a scroll under a held pointer) yields the late landing", async () => {
    const answer = delayLines();
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const title = await screen.findByText("Sheet title");
    await waitFor(() => expect(document.activeElement).toBe(title));

    // Anchoring or a restored position: no pointer is held, so not hers.
    fireEvent.scroll(document);
    fireEvent.pointerDown(document.documentElement);
    fireEvent.scroll(document);
    fireEvent.pointerUp(document.documentElement);
    await answer(mockLines);
    await waitFor(() => expect(lineButton(SECOND)).not.toBeNull());
    expect(document.activeElement).toBe(title);
    expect(scrolled()).not.toHaveBeenCalled();
  });

  it("F8: a scroll with no pointer held leaves the late landing to land", async () => {
    const answer = delayLines();
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const title = await screen.findByText("Sheet title");
    await waitFor(() => expect(document.activeElement).toBe(title));

    fireEvent.pointerDown(document.documentElement);
    fireEvent.pointerUp(document.documentElement);
    fireEvent.scroll(document);
    await answer(mockLines);
    await waitFor(() => expect(document.activeElement).toBe(lineButton(SECOND)));
  });

  it("F9: the reader's own press on the title keeps it there; the sheet's own retake does not", async () => {
    renderChapter(`unfold=pieces&lens=rough&room=${ROOM}`);
    const title = await screen.findByText("Sheet title");
    const heading = () => document.querySelector(`[data-room-heading="${ROOM}"]`);
    await waitFor(() => expect(document.activeElement).toBe(heading()));

    // The sheet's own focusing, with no press or key: landed again.
    act(() => title.focus());
    expect(document.activeElement).toBe(heading());

    // Her press brings focus to the title: it stays, and the landing yields.
    act(() => {
      fireEvent.pointerDown(title);
      title.focus();
    });
    expect(document.activeElement).toBe(title);
    act(() => title.focus());
    expect(document.activeElement).toBe(title);
  });

  it("SQ-1908 F1: a press on the title already holding the landing's focus yields; nothing moves or scrolls", async () => {
    const answer = delayLines();
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const title = await screen.findByText("Sheet title");
    await waitFor(() => expect(document.activeElement).toBe(title));

    // Her press on the focused title: no focus change, so no focusin.
    const focusins = jest.fn();
    document.addEventListener("focusin", focusins);
    fireEvent.pointerDown(title);
    fireEvent.pointerUp(title);
    document.removeEventListener("focusin", focusins);
    expect(focusins).not.toHaveBeenCalled();

    await answer(mockLines);
    await waitFor(() => expect(lineButton(SECOND)).not.toBeNull());
    expect(document.activeElement).toBe(title);
    expect(scrolled()).not.toHaveBeenCalled();
  });

  it("SQ-1908 F1 control: with no press, the late landing still takes the line", async () => {
    const answer = delayLines();
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const title = await screen.findByText("Sheet title");
    await waitFor(() => expect(document.activeElement).toBe(title));

    // A press outside the sheet that moves no focus keeps today's rule.
    fireEvent.pointerDown(document.body);
    fireEvent.pointerUp(document.body);
    await answer(mockLines);
    await waitFor(() => expect(document.activeElement).toBe(lineButton(SECOND)));
  });

  it("F10: a read elsewhere on the paper never holds the landing's deadline", async () => {
    const timers = jest.spyOn(window, "setTimeout");
    const clears = jest.spyOn(window, "clearTimeout");
    // A chapter read that never answers, on the paper beside the sheet.
    function OtherChapter() {
      useQuery({
        queryKey: ["project-financials", "p1"],
        queryFn: () => new Promise(() => {}),
      });
      return null;
    }
    window.history.replaceState(
      {},
      "",
      `/doc/${DOC}?unfold=pieces&lens=rough&room=${ROOM}&line=${SECOND}`,
    );
    render(
      <>
        <OtherChapter />
        <FfeChapter docId={DOC}>
          <p>The chapter body</p>
        </FfeChapter>
      </>,
      { wrapper },
    );
    const title = await screen.findByText("Sheet title");
    await waitFor(() => expect(document.activeElement).toBe(title));
    await waitFor(() => expect(client.isFetching()).toBeGreaterThan(0));
    // The deadline runs (set, never cleared) while that read is still out.
    await waitFor(() => expect(runningDeadlines(timers, clears)).toHaveLength(1));
    expect(client.isFetching()).toBeGreaterThan(0);

    await act(async () => {
      runningDeadlines(timers, clears)[0]();
    });
    expect(document.activeElement).toBe(
      document.querySelector(`[data-room-heading="${ROOM}"]`),
    );
  });
});
