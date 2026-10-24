/**
 * SQ-1891 (repair of SQ-1825, WP-01.6): the round-8 FF&E chapter hosting the
 * real UnfoldInstrument, SpecLens and SpecFieldsPane. Only the Build room
 * wrapper (its title plus the Spec lens), the data reads and the write are
 * stood in for. The SQ-1890 probe's scenarios, as assertions of the repair:
 *
 * - F1: `?unfold=pieces&lens=spec&line=<id>` opens and focuses that line,
 *   not the lens's first unfinished one.
 * - F3: Return to the room waits for a pending blur save, and a failed save
 *   keeps the sheet open with the typed value and the pane's alert; the next
 *   Return retries it, and once it lands the sheet folds away.
 */

import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resetProposalAutosaveRegistryForTests } from "@/lib/proposal-autosave-registry";
import { UNFOLD_UNSAVED_MESSAGE } from "@/components/document/paper/unfold-instrument";

const DOC = "11111111-1111-4111-8111-111111111111";
const ROOM = "22222222-2222-4222-8222-222222222222";
const FIRST = "33333333-3333-4333-8333-333333333333";
const SECOND = "44444444-4444-4444-8444-444444444444";

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
  useProjectFFEItems: () => ({ data: mockLines }),
  useProjectRoomPlacements: () => ({ data: [] }),
  useProjectLineGroups: () => ({ data: [] }),
  useUpdateProjectFfeSpec: () => mutation(mockUpdateSpec),
  useSetFfeLineCommercials: () => mutation(jest.fn()),
  useSetFfeLineBuildFields: () => mutation(jest.fn()),
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
// The wrapper only: its title (which the embedded shell focuses) over the
// real Spec lens, with the props the chapter hands BuildRoom.
jest.mock("@/components/document/pieces/build-room", () => {
  const { useEffect, useRef } = jest.requireActual("react");
  const { SpecLens } = jest.requireActual(
    "@/components/document/pieces/spec-lens",
  );
  return {
    BuildRoom: (props: {
      docId: string;
      room: string | null;
      canSeeMoney: boolean;
      line?: string | null;
      autosaveOwner?: unknown;
      onReturn: () => void;
    }) => {
      const title = useRef<HTMLHeadingElement>(null);
      useEffect(() => title.current?.focus(), []);
      return (
        <div>
          <h2 ref={title} tabIndex={-1} data-build-room-title="">
            Sheet title
          </h2>
          <SpecLens
            docId={props.docId}
            projectId="p1"
            room={props.room}
            canSeeMoney={props.canSeeMoney}
            line={props.line}
            autosaveOwner={props.autosaveOwner}
          />
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

const unfolded = () =>
  new URL(window.location.href).searchParams.get("unfold");
const finish = () => screen.findByRole("textbox", { name: "Finish" });
const returnToRoom = () =>
  screen.getByRole("button", { name: /Return to the room/ });

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  resetProposalAutosaveRegistryForTests();
  mockUpdateSpec.mockReset();
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("F1: the unfold address lands on its line", () => {
  it("opens and focuses the addressed Spec line, not the first unfinished one", async () => {
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);

    const row = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(
        `[data-line-id="${SECOND}"]`,
      );
      expect(found).not.toBeNull();
      return found!;
    });
    const chosen = row.querySelector("button")!;
    await waitFor(() => expect(chosen).toHaveAttribute("aria-current", "true"));
    expect(chosen).toHaveTextContent("Requested line");
    await waitFor(() => expect(document.activeElement).toBe(chosen));
    expect(
      document
        .querySelector(`[data-line-id="${FIRST}"] button`)
        ?.getAttribute("aria-current"),
    ).toBeNull();
  });

  it("keeps the lens's own first unfinished line when no line is named", async () => {
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}`);
    const row = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(
        `[data-line-id="${FIRST}"] button`,
      );
      expect(found).not.toBeNull();
      return found!;
    });
    expect(row).toHaveAttribute("aria-current", "true");
  });
});

describe("F3: Return to the room waits for the sheet's saves", () => {
  it("holds a pending blur save, and keeps the sheet open on its failure", async () => {
    let rejectWrite: (error: Error) => void = () => {};
    mockUpdateSpec.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectWrite = reject;
        }),
    );
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}&line=${SECOND}`);
    const field = await finish();
    await waitFor(() =>
      expect(field).toHaveValue("Old finish"),
    );

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

    // The close waits while the write is out; the retry the barrier makes
    // fails too (the server still refuses).
    mockUpdateSpec.mockRejectedValueOnce(new Error("The field was not saved."));
    await act(async () => {
      fireEvent.click(returnToRoom());
    });
    expect(unfolded()).toBe("pieces");
    expect(screen.getByRole("textbox", { name: "Finish" })).toHaveValue(
      "Unsaved finish",
    );

    await act(async () => {
      rejectWrite(new Error("The field was not saved."));
    });
    await screen.findByText(UNFOLD_UNSAVED_MESSAGE);
    expect(unfolded()).toBe("pieces");
    expect(screen.getByRole("textbox", { name: "Finish" })).toHaveValue(
      "Unsaved finish",
    );
    expect(
      screen
        .getAllByRole("alert")
        .some((alert) => alert.textContent === "The field was not saved."),
    ).toBe(true);

    // The next Return retries the same value, and once it lands, folds away.
    mockUpdateSpec.mockImplementationOnce(
      async ({ changes }: { changes: object }) => ({
        ...mockSpecs[1],
        ...changes,
        row_version: 2,
      }),
    );
    await act(async () => {
      fireEvent.click(returnToRoom());
    });
    await waitFor(() => expect(unfolded()).toBeNull());
    const retried = mockUpdateSpec.mock.calls.at(-1)![0];
    expect(retried).toMatchObject({
      specId: `spec-${SECOND}`,
      expectedRowVersion: 1,
      changes: { finish: "Unsaved finish" },
    });
    expect(screen.queryByRole("textbox", { name: "Finish" })).toBeNull();
  });

  it("folds away at once when nothing is waiting to save", async () => {
    renderChapter(`unfold=pieces&lens=spec&room=${ROOM}`);
    await finish();
    await act(async () => {
      fireEvent.click(returnToRoom());
    });
    await waitFor(() => expect(unfolded()).toBeNull());
    expect(mockUpdateSpec).not.toHaveBeenCalled();
  });
});
