import { act, renderHook } from "@testing-library/react";
import {
  DRAG_HANDLE_GLYPH,
  MOVE_DID_NOT_SAVE,
  RELEASED_DRAG_REASON,
  useRowDrag,
  type RowDragLine,
  type RowDragRoom,
} from "../use-row-drag";

const mockMutate = jest.fn();
const mockAssignState: {
  mutate: jest.Mock;
  isError: boolean;
  error: unknown;
} = { mutate: mockMutate, isError: false, error: null };
const mockUseAssignLineRoom = jest.fn(
  (_projectId: string | null) => mockAssignState,
);

jest.mock("@/hooks/use-document-rooms", () => ({
  useAssignLineRoom: (projectId: string | null) =>
    mockUseAssignLineRoom(projectId),
}));

const DINING = "room-dining";
const KITCHEN = "room-kitchen";
const kitchen: RowDragRoom = { id: KITCHEN, name: "Kitchen" };
const dining: RowDragRoom = { id: DINING, name: "Dining" };
const unsorted: RowDragRoom = { id: null, name: "Not in a room yet" };

const D1: RowDragLine = { id: "d1", name: "Dining table", roomId: DINING };
const D2: RowDragLine = { id: "d2", name: "Side chairs", roomId: DINING };
const D3: RowDragLine = { id: "d3", name: "Counter stools", roomId: DINING };
const K1: RowDragLine = {
  id: "k1",
  name: "Pendant",
  roomId: KITCHEN,
  released: true,
};
const LINES = [D1, D2, D3, K1];

function dragEvent(overrides: Record<string, unknown> = {}) {
  return {
    preventDefault: jest.fn(),
    dataTransfer: { effectAllowed: "", dropEffect: "", setData: jest.fn() },
    relatedTarget: null,
    currentTarget: { contains: () => false },
    ...overrides,
  } as any;
}

function click(shiftKey: boolean) {
  return {
    shiftKey,
    target: document.createElement("div"),
    preventDefault: jest.fn(),
  } as any;
}

function setReducedMotion(matches: boolean) {
  (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

function render() {
  return renderHook(() => useRowDrag({ projectId: "p1", lines: LINES }));
}

function lift(result: ReturnType<typeof render>["result"], line: RowDragLine) {
  const event = dragEvent();
  act(() => result.current.rowHandleProps(line).onDragStart!(event));
  return event;
}

beforeEach(() => {
  mockMutate.mockClear();
  mockUseAssignLineRoom.mockClear();
  mockAssignState.isError = false;
  mockAssignState.error = null;
  setReducedMotion(false);
});

describe("useRowDrag", () => {
  it("returns rowDragProps and roomDropProps, on the useAssignLineRoom path", () => {
    const { result } = render();
    expect(typeof result.current.rowDragProps).toBe("function");
    expect(typeof result.current.roomDropProps).toBe("function");
    expect(mockUseAssignLineRoom).toHaveBeenCalledWith("p1");
  });

  it("lifts the row with a strong outline and an 8px shift, from the ⋮⋮ handle", () => {
    const { result } = render();
    const handle = result.current.rowHandleProps(D3);
    expect(handle.children).toBe(DRAG_HANDLE_GLYPH);
    expect(DRAG_HANDLE_GLYPH).toBe("⋮⋮");
    expect(handle.draggable).toBe(true);
    expect(handle.style.color).toBe("var(--sheet-ink-faint)");

    const event = lift(result, D3);
    expect(event.dataTransfer.effectAllowed).toBe("move");

    const row = result.current.rowDragProps(D3);
    expect(row["data-drag-lifted"]).toBe("true");
    expect(row.style.outline).toBe("1px solid var(--sheet-rule-strong)");
    expect(row.style.transform).toBe("translateX(8px)");
    expect(result.current.rowDragProps(D2).style.transform).toBeUndefined();

    act(() => result.current.rowHandleProps(D3).onDragEnd!());
    expect(result.current.rowDragProps(D3).style.transform).toBeUndefined();
  });

  it("marks the Kitchen heading with a 2px rule and MOVE TO KITCHEN while it is the target", () => {
    const { result } = render();
    lift(result, D3);
    expect(result.current.roomDropLabel(kitchen)).toBeNull();

    const over = dragEvent();
    act(() => result.current.roomDropProps(kitchen).onDragOver(over));
    expect(over.preventDefault).toHaveBeenCalled();
    expect(over.dataTransfer.dropEffect).toBe("move");

    const heading = result.current.roomDropProps(kitchen);
    expect(heading["data-drop-target"]).toBe("true");
    expect(heading.style.borderTop).toBe("2px solid var(--sheet-ink)");
    expect(result.current.roomDropLabel(kitchen)).toBe("MOVE TO KITCHEN");
    expect(result.current.roomDropLabel(dining)).toBeNull();

    act(() => result.current.roomDropProps(kitchen).onDragLeave(dragEvent()));
    expect(result.current.roomDropLabel(kitchen)).toBeNull();
  });

  it("does not offer the room the line is already in", () => {
    const { result } = render();
    lift(result, D3);
    const over = dragEvent();
    act(() => result.current.roomDropProps(dining).onDragOver(over));
    expect(over.preventDefault).not.toHaveBeenCalled();
    expect(result.current.roomDropLabel(dining)).toBeNull();
  });

  it("drops through triage via useAssignLineRoom and announces the move", () => {
    const { result } = render();
    lift(result, D3);
    act(() => result.current.roomDropProps(kitchen).onDragOver(dragEvent()));
    const drop = dragEvent();
    act(() => result.current.roomDropProps(kitchen).onDrop(drop));

    expect(drop.preventDefault).toHaveBeenCalled();
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith({
      itemId: "d3",
      roomId: KITCHEN,
      assignmentScope: "room",
    });
    expect(result.current.announcement).toBe(
      "Moved Counter stools to Kitchen.",
    );
    expect(result.current.liveRegionProps).toMatchObject({
      role: "status",
      "aria-live": "polite",
      children: "Moved Counter stools to Kitchen.",
    });
    expect(result.current.liftedIds).toEqual([]);
    expect(result.current.roomDropLabel(kitchen)).toBeNull();
  });

  it("sends a line to Not in a room yet as unassigned", () => {
    const { result } = render();
    lift(result, D1);
    act(() => result.current.roomDropProps(unsorted).onDrop(dragEvent()));
    expect(mockMutate).toHaveBeenCalledWith({
      itemId: "d1",
      roomId: null,
      assignmentScope: "unassigned",
    });
  });

  it("Shift-click selects several, and dragging one carries them all", () => {
    const { result } = render();
    act(() => result.current.rowDragProps(D2).onClick(click(true)));
    act(() => result.current.rowDragProps(D3).onClick(click(true)));
    expect(result.current.selectedIds).toEqual(["d2", "d3"]);
    expect(result.current.rowDragProps(D2)["data-drag-selected"]).toBe("true");

    lift(result, D3);
    expect(result.current.liftedIds).toEqual(["d2", "d3"]);
    expect(result.current.rowDragProps(D2).style.transform).toBe(
      "translateX(8px)",
    );

    act(() => result.current.roomDropProps(kitchen).onDrop(dragEvent()));
    expect(mockMutate.mock.calls.map(([arg]) => arg.itemId)).toEqual([
      "d2",
      "d3",
    ]);
    expect(result.current.announcement).toBe("Moved 2 lines to Kitchen.");
    expect(result.current.selectedIds).toEqual([]);
  });

  it("Shift-click again deselects; a plain click clears the selection", () => {
    const { result } = render();
    act(() => result.current.rowDragProps(D2).onClick(click(true)));
    act(() => result.current.rowDragProps(D3).onClick(click(true)));
    act(() => result.current.rowDragProps(D2).onClick(click(true)));
    expect(result.current.selectedIds).toEqual(["d3"]);
    act(() => result.current.rowDragProps(D1).onClick(click(false)));
    expect(result.current.selectedIds).toEqual([]);
  });

  it("dragging an unselected row carries only that row", () => {
    const { result } = render();
    act(() => result.current.rowDragProps(D2).onClick(click(true)));
    lift(result, D1);
    expect(result.current.liftedIds).toEqual(["d1"]);
  });

  it("keeps released lines undraggable and says why", () => {
    const { result } = render();
    const handle = result.current.rowHandleProps(K1);
    expect(handle.draggable).toBe(false);
    expect(handle.onDragStart).toBeUndefined();
    expect(handle.title).toBe(RELEASED_DRAG_REASON);
    expect(RELEASED_DRAG_REASON).toBe(
      "Released lines change through Record a change.",
    );
    expect(result.current.rowDragProps(K1).title).toBe(RELEASED_DRAG_REASON);
    expect(result.current.rowDragProps(K1)["data-drag-locked"]).toBe("true");

    act(() => handle.onPointerDown!({} as any));
    expect(result.current.announcement).toBe(RELEASED_DRAG_REASON);

    act(() => result.current.rowDragProps(K1).onClick(click(true)));
    expect(result.current.selectedIds).toEqual([]);
  });

  it("ignores a Shift-click inside an editable cell", () => {
    const { result } = render();
    const input = document.createElement("input");
    act(() =>
      result.current.rowDragProps(D2).onClick({
        shiftKey: true,
        target: input,
        preventDefault: jest.fn(),
      } as any),
    );
    expect(result.current.selectedIds).toEqual([]);
  });

  it("announces a failed move", () => {
    const { result, rerender } = render();
    mockAssignState.isError = true;
    rerender();
    expect(result.current.announcement).toBe(
      "The move did not save. Use Move to room… to try again.",
    );
  });

  it.each([
    "This line sits in 4 rooms. Change its rooms instead.",
    "Labor moves with its piece.",
    "This line is on a drafted release. Send it or void the draft first.",
  ])("announces the server's named refusal verbatim: %s", (sentence) => {
    const { result, rerender } = render();
    mockAssignState.isError = true;
    mockAssignState.error = Object.assign(new Error(sentence), {
      code: "23514",
    });
    rerender();
    expect(result.current.announcement).toBe(sentence);
  });

  it("never announces raw Postgres text", () => {
    const { result, rerender } = render();
    mockAssignState.isError = true;
    mockAssignState.error = {
      message: 'new row violates row-level security policy for table "x"',
      code: "42501",
    };
    rerender();
    expect(result.current.announcement).toBe(MOVE_DID_NOT_SAVE);
  });

  it("gives no transition under prefers-reduced-motion", () => {
    setReducedMotion(true);
    const { result } = render();
    lift(result, D3);
    act(() => result.current.roomDropProps(kitchen).onDragOver(dragEvent()));
    expect(result.current.rowDragProps(D3).style.transition).toBe("none");
    expect(result.current.roomDropProps(kitchen).style.transition).toBe("none");
  });

  it("animates the lift when motion is allowed", () => {
    const { result } = render();
    expect(result.current.rowDragProps(D3).style.transition).toBe(
      "transform 120ms ease-out",
    );
  });
});
