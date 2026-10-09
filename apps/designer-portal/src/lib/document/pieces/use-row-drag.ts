/**
 * Drag rows between rooms (US-21 T-26; S6, Q8, frame a9).
 *
 * Drag is the extra gesture. `Move to room…` in the row menu stays the act
 * for keyboard, touch and released lines (R3 §5). A drop lands on the same
 * path the menu uses: `useAssignLineRoom`, which calls
 * `triage_project_ffe_items`.
 *
 * The handle `⋮⋮` is the native drag source. It is not the row, so the text
 * cells inside the row keep their caret and selection. Shift-click on a row
 * adds it to a selection, and dragging any selected row carries the whole
 * selection.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent, PointerEvent } from "react";
import type { FfeAssignmentScope } from "@patina/types";
import { useAssignLineRoom } from "@/hooks/use-document-rooms";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { isEditableTarget } from "@/hooks/use-lens-state";

export const DRAG_HANDLE_GLYPH = "⋮⋮";

/** The house refusal for released lines (R8), printed where the drag would start. */
export const RELEASED_DRAG_REASON =
  "Released lines change through Record a change.";

/** A move that failed for no reason the server named (network, unknown). */
export const MOVE_DID_NOT_SAVE =
  "The move did not save. Use Move to room… to try again.";

/** The named refusals of `triage_project_ffe_items` (00755, 00759). */
const NAMED_MOVE_REFUSALS = [
  /^This line sits in \d+ rooms\. Change its rooms instead\.$/,
  /^Labor moves with its piece\.$/,
  /^This line is on a drafted release\. Send it or void the draft first\.$/,
];

/**
 * The sentence a failed move prints: the server's named refusal verbatim,
 * else the generic one. Raw Postgres text is never printed.
 */
export function moveFailureText(cause: unknown): string {
  const message = (cause as { message?: unknown } | null)?.message;
  if (typeof message !== "string") return MOVE_DID_NOT_SAVE;
  const sentence = message.trim();
  return NAMED_MOVE_REFUSALS.some((refusal) => refusal.test(sentence))
    ? sentence
    : MOVE_DID_NOT_SAVE;
}

export interface RowDragLine {
  id: string;
  name: string;
  /** null: the line is in `Not in a room yet`. */
  roomId: string | null;
  released?: boolean;
}

export interface RowDragRoom {
  /** null: the `Not in a room yet` heading. */
  id: string | null;
  name: string;
}

export interface UseRowDragOptions {
  projectId: string | null;
  /** Every line on the sheet, so a selection can span rooms. */
  lines: RowDragLine[];
}

export interface RowDragProps {
  onClick: (event: MouseEvent<HTMLElement>) => void;
  style: CSSProperties;
  title?: string;
  "data-drag-selected"?: "true";
  "data-drag-lifted"?: "true";
  "data-drag-locked"?: "true";
}

export interface RowHandleProps {
  children: string;
  "aria-hidden": true;
  draggable: boolean;
  title?: string;
  style: CSSProperties;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
}

export interface RoomDropProps {
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  style: CSSProperties;
  "data-drop-target"?: "true";
}

export interface LiveRegionProps {
  role: "status";
  "aria-live": "polite";
  "aria-atomic": true;
  className: string;
  children: string;
}

const LIFT_TRANSITION = "transform 120ms ease-out";

function roomKey(roomId: string | null): string {
  return roomId ?? "__unassigned__";
}

function scopeFor(room: RowDragRoom): FfeAssignmentScope {
  return room.id ? "room" : "unassigned";
}

export function moveAnnouncement(
  moved: ReadonlyArray<Pick<RowDragLine, "name">>,
  room: RowDragRoom,
): string {
  if (moved.length === 1) return `Moved ${moved[0].name} to ${room.name}.`;
  return `Moved ${moved.length} lines to ${room.name}.`;
}

export type AssignLineRoom = ReturnType<typeof useAssignLineRoom>;

export interface SettledMove {
  /** The lines the server moved. */
  movedIds: string[];
  /** The server's refusal, as `moveFailureText` prints it; null when every line moved. */
  refusal: string | null;
  /** What to announce: the move, the refusal, or both. */
  text: string;
}

/**
 * Moves lines through triage and says so only once the server has answered:
 * the move on success, the named refusal on a refusal. Drag, `Move to room…`
 * and every lens call this; none announces before the answer (T-60a F4).
 */
export async function settleMove(
  assign: AssignLineRoom,
  projectId: string | null,
  lines: ReadonlyArray<Pick<RowDragLine, "id" | "name">>,
  room: RowDragRoom,
): Promise<SettledMove> {
  if (!projectId || lines.length === 0)
    return { movedIds: [], refusal: null, text: "" };
  const results = await Promise.allSettled(
    lines.map((line) =>
      assign.mutateAsync({
        projectId,
        selectionIds: [line.id],
        assignmentScope: scopeFor(room),
        roomId: room.id,
      }),
    ),
  );
  const moved = lines.filter((_, i) => results[i].status === "fulfilled");
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  const refusal = failure ? moveFailureText(failure.reason) : null;
  return {
    movedIds: moved.map((line) => line.id),
    refusal,
    text: [moved.length > 0 ? moveAnnouncement(moved, room) : null, refusal]
      .filter(Boolean)
      .join(" "),
  };
}

export function useRowDrag({ projectId, lines }: UseRowDragOptions) {
  const assign = useAssignLineRoom(projectId);
  const reducedMotion = useReducedMotion();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [liftedIds, setLiftedIds] = useState<string[]>([]);
  const [overRoom, setOverRoom] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Drag events fire faster than state settles; the drop reads the ref.
  const liftedRef = useRef<string[]>([]);

  const byId = useMemo(
    () => new Map(lines.map((line) => [line.id, line])),
    [lines],
  );

  const endDrag = useCallback(() => {
    liftedRef.current = [];
    setLiftedIds([]);
    setOverRoom(null);
  }, []);

  const movableInto = useCallback(
    (room: RowDragRoom) =>
      liftedRef.current
        .map((id) => byId.get(id))
        .filter(
          (line): line is RowDragLine =>
            Boolean(line) && !line!.released && line!.roomId !== room.id,
        ),
    [byId],
  );

  const rowDragProps = useCallback(
    (line: RowDragLine): RowDragProps => {
      const selected = selectedIds.includes(line.id);
      const lifted = liftedIds.includes(line.id);
      return {
        onClick: (event) => {
          if (isEditableTarget(event.target)) return;
          if (!event.shiftKey) {
            if (selectedIds.length > 0) setSelectedIds([]);
            return;
          }
          event.preventDefault();
          if (line.released) {
            setAnnouncement(RELEASED_DRAG_REASON);
            return;
          }
          setSelectedIds((ids) =>
            ids.includes(line.id)
              ? ids.filter((id) => id !== line.id)
              : [...ids, line.id],
          );
        },
        style: {
          transition: reducedMotion ? "none" : LIFT_TRANSITION,
          ...(selected ? { background: "var(--sheet-row-hover)" } : null),
          ...(lifted
            ? {
                outline: "1px solid var(--sheet-rule-strong)",
                transform: "translateX(8px)",
              }
            : null),
        },
        ...(line.released
          ? { title: RELEASED_DRAG_REASON, "data-drag-locked": "true" as const }
          : null),
        ...(selected ? { "data-drag-selected": "true" as const } : null),
        ...(lifted ? { "data-drag-lifted": "true" as const } : null),
      };
    },
    [liftedIds, reducedMotion, selectedIds],
  );

  const rowHandleProps = useCallback(
    (line: RowDragLine): RowHandleProps => {
      const base = {
        children: DRAG_HANDLE_GLYPH,
        "aria-hidden": true as const,
      };
      if (line.released) {
        return {
          ...base,
          draggable: false,
          title: RELEASED_DRAG_REASON,
          style: {
            color: "var(--sheet-ink-faint)",
            cursor: "not-allowed",
            opacity: 0.4,
          },
          onPointerDown: () => setAnnouncement(RELEASED_DRAG_REASON),
        };
      }
      return {
        ...base,
        draggable: true,
        style: { color: "var(--sheet-ink-faint)", cursor: "grab" },
        onDragStart: (event) => {
          const ids = selectedIds.includes(line.id)
            ? selectedIds.filter(
                (id) => byId.get(id) && !byId.get(id)!.released,
              )
            : [line.id];
          liftedRef.current = ids;
          setLiftedIds(ids);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(
            "text/plain",
            ids.map((id) => byId.get(id)?.name ?? "").join("\n"),
          );
        },
        onDragEnd: endDrag,
      };
    },
    [byId, endDrag, selectedIds],
  );

  const roomDropProps = useCallback(
    (room: RowDragRoom): RoomDropProps => {
      const target = overRoom === roomKey(room.id);
      return {
        onDragOver: (event) => {
          if (movableInto(room).length === 0) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (overRoom !== roomKey(room.id)) setOverRoom(roomKey(room.id));
        },
        onDragLeave: (event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next))
            return;
          setOverRoom((current) =>
            current === roomKey(room.id) ? null : current,
          );
        },
        onDrop: (event) => {
          const moved = movableInto(room);
          endDrag();
          if (moved.length === 0) return;
          event.preventDefault();
          setSelectedIds([]);
          void settleMove(assign, projectId, moved, room).then(({ text }) =>
            setAnnouncement(text),
          );
        },
        style: {
          borderTop: target
            ? "2px solid var(--sheet-ink)"
            : "2px solid transparent",
          transition: reducedMotion ? "none" : "border-color 120ms ease-out",
        },
        ...(target ? { "data-drop-target": "true" as const } : null),
      };
    },
    [assign, endDrag, movableInto, overRoom, projectId, reducedMotion],
  );

  /** `MOVE TO KITCHEN` while this heading is the drop target (a9), else null. */
  const roomDropLabel = useCallback(
    (room: RowDragRoom): string | null =>
      overRoom === roomKey(room.id)
        ? `MOVE TO ${room.name.toUpperCase()}`
        : null,
    [overRoom],
  );

  const liveRegionProps: LiveRegionProps = {
    role: "status",
    "aria-live": "polite",
    "aria-atomic": true,
    className: "sr-only",
    children: announcement,
  };

  return {
    rowDragProps,
    rowHandleProps,
    roomDropProps,
    roomDropLabel,
    liveRegionProps,
    announcement,
    selectedIds,
    liftedIds,
    clearSelection: () => setSelectedIds([]),
  };
}

export type RowDrag = ReturnType<typeof useRowDrag>;
