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
 */

import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { resetProposalAutosaveRegistryForTests } from "@/lib/proposal-autosave-registry";
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
  usePlaceProductInProjectV2: () => mutation(jest.fn()),
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
  LibraryInlineSearch: () => null,
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
  mockLinesHook.mockReset();
  mockLinesHook.mockImplementation(() => ({ data: mockLines }));
  scrolled().mockClear();
});

afterEach(() => {
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

  it("F2: put back while a write is out, the shown value is written too, last", async () => {
    const first = held();
    mockUpdateSpec
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(saved(3));
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
    await act(async () => {
      first.resolve({ ...mockSpecs[1], finish: "Abandoned draft", row_version: 2 });
    });

    await clickReturn();
    await waitFor(() => expect(unfolded()).toBeNull());
    expect(mockUpdateSpec.mock.calls.at(-1)![0].changes).toEqual({
      finish: "Old finish",
    });
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
    mockLinesHook.mockImplementation(() =>
      useQuery({ queryKey: ["delayed-lines"], queryFn: () => answered }),
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
});
