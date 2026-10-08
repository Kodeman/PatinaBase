"use client";

/**
 * US-21 T-27 — the Rough in lens, assembled (SPEC a2, a8, a9; S1, S5, S6, D8,
 * D13; CONTRACT §3.6).
 *
 * The rooms stack as T-24's tables, each wired to the data: Enter adds a line
 * through `batch_create_named_project_needs` (one line, no sheet), a cell edit
 * through `set_project_ffe_line_build_fields`, `Remove` through
 * `archive_project_selection` with a 10 s undo that calls
 * `restore_project_selection`, `Move to room…` and drag through
 * `triage_project_ffe_items` (`useAssignLineRoom`), and `Fill with a product`
 * or `/` through `place_product_in_project_v2`. Paste previews through T-25.
 * The room's elevation sits on the right (a2). Nothing here buys, bills or
 * releases: those cells and the roads live in their own lenses.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  useArchiveProjectSelection,
  useBatchCreateNamedProjectNeeds,
  usePlaceProductInProjectV2,
  useProjectFFEItems,
  useProjectRoomPlacements,
  useRemovedProjectLines,
  useRestoreProjectSelection,
  useSetFfeLineBuildFields,
} from "@patina/supabase";
import type {
  FfeAssignmentScope,
  FfeLineUnit,
  FfeRoomPlacement,
} from "@patina/types";
import { cn } from "@/lib/utils";
import { useAssignLineRoom } from "@/hooks/use-document-rooms";
import { isEditableTarget } from "@/hooks/use-lens-state";
import { isLaborLine, laborPiece } from "@/lib/document/stamp-derivation";
import {
  TRADE_SCOPE_REASON,
  pieceLineStage,
  type PieceLineStage,
  type PieceLineStageRow,
} from "@/lib/document/pieces/line-stage";
import {
  REMOVED_PLACE,
  THROUGHOUT_PLACE,
  UNASSIGNED_PLACE,
  type BuildRoomPlace,
} from "@/lib/document/pieces/build-room-url";
import {
  RELEASED_DRAG_REASON,
  useRowDrag,
  type RowDragLine,
  type RowDragRoom,
} from "@/lib/document/pieces/use-row-drag";
import { ENTRY_NAME_ATTR } from "@/lib/document/pieces/rough-in-keys";
import {
  RoughInTable,
  type RoughInLinePatch,
  type RoughInNewLine,
  type RoughInRow,
  type RoughInRowAct,
} from "./rough-in-table";
import { UndoToast } from "./undo-toast";
import {
  LibraryInlineSearch,
  type LibraryInlineResult,
} from "./library-inline-search";
import { PastePreview } from "./paste-preview";
import { PlacementChips } from "./placement-chips";
import { ElevationPane } from "./elevation-pane";

export interface RoughInLensRoom {
  id: string;
  name: string;
}

export interface RoughInLensProps {
  docId: string;
  projectId: string;
  /** The project's rooms, in the job's order. */
  rooms: RoughInLensRoom[];
  /** The rail's place: the room scrolled to, and the one whose elevation shows. */
  room: BuildRoomPlace;
}

/** The `project_ffe_items` columns this lens reads, as `useProjectFFEItems` returns them. */
interface RoughInLine extends PieceLineStageRow {
  id: string;
  name?: string | null;
  unit?: string | null;
  rough_cents?: number | null;
  project_room_id?: string | null;
  assignment_scope?: string | null;
  design_disposition?: string | null;
  purchase_order_id?: string | null;
  removed_at?: string | null;
}

/** A table on the sheet: a project room, `Not in a room yet`, or `Throughout`. */
interface Place {
  id: string;
  name: string;
  roomId: string | null;
  scope: FfeAssignmentScope;
}

/** A line typed but not yet back from the server (S1: Enter never waits). */
interface PendingLine extends RoughInNewLine {
  key: string;
  placeId: string;
  selectionId?: string;
}

type Tool =
  | { kind: "fill"; placeId: string; line: RoughInLine }
  | { kind: "add"; placeId: string }
  | { kind: "paste"; placeId: string; text: string }
  | { kind: "alsoPlace"; placeId: string; line: RoughInLine };

interface Removal {
  key: string;
  selectionId: string;
  name: string;
  quantity: number;
  placeName: string;
  /** Resolves true once archived, false when the server refused. */
  archived: Promise<boolean>;
}

const UNITS: ReadonlySet<string> = new Set([
  "each",
  "sq_ft",
  "lin_ft",
  "roll",
  "yard",
  "box",
  "hour",
  "lot",
]);
const KEPT_DISPOSITIONS: ReadonlySet<string> = new Set([
  "candidate",
  "selected",
  "alternate",
]);

const PENDING_REASON = "This line is still being saved.";
const FILLED_REASON = "This line already has a product.";
const LABOR_FILL_REASON = "A labor line takes no product.";
const REASON_REFUSAL = "archive reason must be at least 5 characters";

const ACT =
  "inline-flex min-h-11 min-w-11 items-center justify-center font-mono text-[12px] font-medium uppercase tracking-[0.06em] underline decoration-[var(--sheet-ink)] decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)]";

function newKey(prefix: string): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${prefix}-${Date.now()}-${Math.random()}`
  );
}

function lineUnit(line: RoughInLine): FfeLineUnit {
  return line.unit && UNITS.has(line.unit)
    ? (line.unit as FfeLineUnit)
    : "each";
}

function lineName(line: RoughInLine): string {
  return line.name?.trim() || "Unnamed line";
}

/** Released, on an order, past `ordered`, or a Trade Scope line. */
function isLocked(
  line: RoughInLine,
  stage: PieceLineStage | undefined,
): boolean {
  return (
    stage?.stage === "released" ||
    stage?.lock != null ||
    line.purchase_order_id != null
  );
}

function errorText(cause: unknown): string | null {
  return cause instanceof Error && cause.message ? cause.message : null;
}

/** A table's section by its place id (uuids and the rail words; no selector escaping). */
function placeSection(
  root: HTMLElement | null,
  placeId: string,
): Element | undefined {
  return Array.from(root?.querySelectorAll("[data-rough-in-room]") ?? []).find(
    (el) => el.getAttribute("data-rough-in-room") === placeId,
  );
}

function without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

/** A line's rooms: its placements, else its primary room (as room-counts reads them). */
function lineRoomIds(
  line: RoughInLine,
  placements: readonly FfeRoomPlacement[],
): string[] {
  const ids = placements.map((p) => p.projectRoomId);
  if (line.project_room_id && !ids.includes(line.project_room_id)) {
    ids.unshift(line.project_room_id);
  }
  return ids;
}

/** Each labor line follows its piece, indented; one whose piece is elsewhere keeps its place. */
function orderWithLabor(lines: RoughInLine[]): RoughInLine[] {
  const ids = new Set(lines.map((line) => line.id));
  const children = new Map<string, RoughInLine[]>();
  for (const line of lines) {
    const parent = line.parent_ffe_item_id;
    if (!isLaborLine(line) || !parent || !ids.has(parent)) continue;
    children.set(parent, [...(children.get(parent) ?? []), line]);
  }
  const ordered: RoughInLine[] = [];
  for (const line of lines) {
    const parent = line.parent_ffe_item_id;
    if (isLaborLine(line) && parent && ids.has(parent)) continue;
    ordered.push(line, ...(children.get(line.id) ?? []));
  }
  return ordered;
}

export function RoughInLens({
  docId,
  projectId,
  rooms,
  room,
}: RoughInLensProps) {
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement>(null);

  const { data: lineData } = useProjectFFEItems(projectId);
  const { data: placementData } = useProjectRoomPlacements(projectId);
  const batch = useBatchCreateNamedProjectNeeds();
  const buildFields = useSetFfeLineBuildFields();
  const archive = useArchiveProjectSelection();
  const restore = useRestoreProjectSelection();
  const assign = useAssignLineRoom(projectId);
  const place = usePlaceProductInProjectV2();

  const [pending, setPending] = useState<PendingLine[]>([]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paneRoomId, setPaneRoomId] = useState<string | null>(null);
  const [paneOpen, setPaneOpen] = useState(true);

  const lines = useMemo(
    () =>
      ((lineData ?? []) as RoughInLine[]).filter(
        (line) => line.removed_at == null && !hidden.has(line.id),
      ),
    [lineData, hidden],
  );
  const lineIds = useMemo(() => new Set(lines.map((l) => l.id)), [lines]);
  const byId = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);

  const stages = useMemo(
    () =>
      new Map(
        lines.map((line) => [
          line.id,
          pieceLineStage(line, laborPiece(line, lines)),
        ]),
      ),
    [lines],
  );

  const placementsByLine = useMemo(() => {
    const map = new Map<string, FfeRoomPlacement[]>();
    for (const p of placementData ?? []) {
      map.set(p.ffeItemId, [...(map.get(p.ffeItemId) ?? []), p]);
    }
    return map;
  }, [placementData]);

  const roomIds = useMemo(() => new Set(rooms.map((r) => r.id)), [rooms]);

  /** Which tables each line sits in: every room it is placed in, else its scope's table. */
  const linesByPlace = useMemo(() => {
    const map = new Map<string, RoughInLine[]>();
    const put = (placeId: string, line: RoughInLine) =>
      map.set(placeId, [...(map.get(placeId) ?? []), line]);
    for (const line of lines) {
      const inRooms = lineRoomIds(
        line,
        placementsByLine.get(line.id) ?? [],
      ).filter((id) => roomIds.has(id));
      if (inRooms.length > 0) inRooms.forEach((id) => put(id, line));
      else
        put(
          line.assignment_scope === "unassigned"
            ? UNASSIGNED_PLACE
            : THROUGHOUT_PLACE,
          line,
        );
    }
    return map;
  }, [lines, placementsByLine, roomIds]);

  const places = useMemo<Place[]>(() => {
    const list: Place[] = rooms.map((r) => ({
      id: r.id,
      name: r.name,
      roomId: r.id,
      scope: "room",
    }));
    if (linesByPlace.has(THROUGHOUT_PLACE) || room === THROUGHOUT_PLACE)
      list.push({
        id: THROUGHOUT_PLACE,
        name: "Throughout",
        roomId: null,
        scope: "throughout",
      });
    if (
      linesByPlace.has(UNASSIGNED_PLACE) ||
      room === UNASSIGNED_PLACE ||
      rooms.length === 0
    )
      list.push({
        id: UNASSIGNED_PLACE,
        name: "Not in a room yet",
        roomId: null,
        scope: "unassigned",
      });
    return list;
  }, [rooms, linesByPlace, room]);

  const moveRooms = useMemo(
    () => rooms.map((r) => ({ id: r.id, name: r.name })),
    [rooms],
  );

  // A typed line shows until the server's own row arrives.
  useEffect(() => {
    if (pending.some((p) => p.selectionId && lineIds.has(p.selectionId)))
      setPending((list) =>
        list.filter((p) => !p.selectionId || !lineIds.has(p.selectionId)),
      );
  }, [lineIds, pending]);

  // A removed line stays hidden only until the server stops returning it, so
  // a line put back from `Removed` comes home.
  useEffect(() => {
    if (!lineData || hidden.size === 0) return;
    const served = new Set((lineData as RoughInLine[]).map((line) => line.id));
    if ([...hidden].some((id) => !served.has(id)))
      setHidden((set) => new Set([...set].filter((id) => served.has(id))));
  }, [lineData, hidden]);

  // The rail's room is the one in view.
  useEffect(() => {
    if (!room) return;
    placeSection(sheetRef.current, room)?.scrollIntoView?.({ block: "start" });
  }, [room]);

  const dragLines = useMemo<RowDragLine[]>(
    () =>
      lines.map((line) => ({
        id: line.id,
        name: lineName(line),
        roomId: line.project_room_id ?? null,
        released: isLocked(line, stages.get(line.id)),
      })),
    [lines, stages],
  );
  const dragById = useMemo(
    () => new Map(dragLines.map((l) => [l.id, l])),
    [dragLines],
  );
  const drag = useRowDrag({ projectId, lines: dragLines });

  function rowDragProps(rowId: string): HTMLAttributes<HTMLTableRowElement> {
    const line = dragById.get(rowId);
    if (!line) return {};
    const handle = drag.rowHandleProps(line);
    return {
      ...drag.rowDragProps(line),
      // The row lifts from anywhere but a cell being typed in, so the cells keep their caret.
      onPointerDown: (event: PointerEvent<HTMLTableRowElement>) => {
        const target = event.target as Element;
        event.currentTarget.draggable =
          handle.draggable &&
          !isEditableTarget(target) &&
          !target.closest?.("button, select, a, [role=menu]");
        handle.onPointerDown?.(event);
      },
      onDragStart: handle.onDragStart,
      onDragEnd: handle.onDragEnd,
    };
  }

  function dropRoom(placeItem: Place): RowDragRoom | null {
    if (placeItem.scope === "room")
      return { id: placeItem.roomId, name: placeItem.name };
    if (placeItem.scope === "unassigned")
      return { id: null, name: placeItem.name };
    return null;
  }

  function rowsFor(placeItem: Place): RoughInRow[] {
    const rows: RoughInRow[] = orderWithLabor(
      linesByPlace.get(placeItem.id) ?? [],
    ).map((line) => {
      const read = stages.get(line.id);
      const stage = read?.kind ?? "placeholder";
      const labor = isLaborLine(line);
      const gates: Partial<Record<RoughInRowAct, string>> = {};
      if (read?.lock) {
        gates.fill =
          gates.move =
          gates.alsoPlace =
          gates.remove =
            read.lock === "trade_scope"
              ? TRADE_SCOPE_REASON
              : RELEASED_DRAG_REASON;
      } else if (isLocked(line, read)) {
        gates.fill = gates.remove = RELEASED_DRAG_REASON;
      } else if (line.product_id) {
        gates.fill = FILLED_REASON;
      } else if (labor) {
        gates.fill = LABOR_FILL_REASON;
      }
      return {
        id: line.id,
        name: line.name ?? "",
        quantity: line.quantity ?? 0,
        unit: lineUnit(line),
        roughCents: line.rough_cents ?? null,
        stage,
        labor,
        gates,
      };
    });
    for (const p of pending) {
      if (p.placeId !== placeItem.id) continue;
      if (p.selectionId && lineIds.has(p.selectionId)) continue;
      rows.push({
        id: `pending:${p.key}`,
        name: p.name,
        quantity: p.quantity,
        unit: p.unit,
        roughCents: p.roughCents,
        stage: "placeholder",
        gates: {
          fill: PENDING_REASON,
          move: PENDING_REASON,
          alsoPlace: PENDING_REASON,
          remove: PENDING_REASON,
        },
      });
    }
    return rows;
  }

  function addLine(placeItem: Place, line: RoughInNewLine) {
    const key = newKey("rough");
    setNotice(null);
    setPending((list) => [...list, { ...line, key, placeId: placeItem.id }]);
    batch
      .mutateAsync({
        projectId,
        roomId: placeItem.roomId,
        assignmentScope: placeItem.scope,
        lines: [
          {
            name: line.name,
            quantity: line.quantity,
            unit: line.unit,
            ...(line.roughCents != null ? { roughCents: line.roughCents } : {}),
          },
        ],
        idempotencyKey: key,
      })
      .then(({ selectionIds }) =>
        setPending((list) =>
          list.map((p) =>
            p.key === key ? { ...p, selectionId: selectionIds[0] } : p,
          ),
        ),
      )
      .catch(() => {
        setPending((list) => list.filter((p) => p.key !== key));
        setNotice(`${line.name} was not added. Type it again.`);
      });
  }

  function updateLine(rowId: string, patch: RoughInLinePatch) {
    if (!byId.has(rowId)) return;
    setNotice(null);
    buildFields.mutate(
      { projectId, itemId: rowId, ...patch },
      {
        onError: (cause) =>
          setNotice(
            errorText(cause) ?? "The change was not saved. Try it again.",
          ),
      },
    );
  }

  function removeLine(row: RoughInRow, placeItem: Place) {
    const line = byId.get(row.id);
    if (!line) return;
    setNotice(null);
    setHidden((set) => new Set(set).add(row.id));
    // The reason is left to the server: it defaults while building, and asks
    // for one only when the client has seen the line in a review (00731).
    const archived = archive
      .mutateAsync({ projectId, selectionId: row.id, reason: "" })
      .then(
        () => true,
        (cause: unknown) => {
          setHidden((set) => without(set, row.id));
          setRemoval((current) =>
            current?.selectionId === row.id ? null : current,
          );
          const message = errorText(cause);
          setNotice(
            message === REASON_REFUSAL
              ? `The client has seen ${row.name} in a review, so removing it needs a reason. Remove it from its line on the Document.`
              : (message ?? `${row.name} was not removed. Try again.`),
          );
          return false;
        },
      );
    setRemoval({
      key: newKey("removal"),
      selectionId: row.id,
      name: row.name,
      quantity: row.quantity,
      placeName: placeItem.name,
      archived,
    });
  }

  async function undoRemoval(target: Removal) {
    setRemoval(null);
    // Never removed: the row is already back.
    if (!(await target.archived)) return;
    try {
      await restore.mutateAsync({ projectId, selectionId: target.selectionId });
      setHidden((set) => without(set, target.selectionId));
    } catch (cause) {
      setNotice(
        errorText(cause) ??
          `${target.name} was not put back. It is under Removed in the rail.`,
      );
    }
  }

  function moveLine(row: RoughInRow, roomId: string) {
    if (!byId.has(row.id)) return;
    setNotice(null);
    assign.mutate({ itemId: row.id, roomId, assignmentScope: "room" });
  }

  function openFill(row: RoughInRow | null, placeItem: Place) {
    if (row === null) {
      setTool({ kind: "add", placeId: placeItem.id });
      return;
    }
    const line = byId.get(row.id);
    if (!line || row.gates?.fill) return;
    setTool({ kind: "fill", placeId: placeItem.id, line });
  }

  function openAlsoPlace(row: RoughInRow, placeItem: Place) {
    const line = byId.get(row.id);
    if (line) setTool({ kind: "alsoPlace", placeId: placeItem.id, line });
  }

  function closeTool(placeId?: string) {
    setTool(null);
    if (!placeId) return;
    placeSection(sheetRef.current, placeId)
      ?.querySelector<HTMLInputElement>(`input[${ENTRY_NAME_ATTR}]`)
      ?.focus();
  }

  async function chooseProduct(
    product: LibraryInlineResult,
    current: Tool,
    placeItem: Place,
  ) {
    setNotice(null);
    try {
      if (current.kind === "fill") {
        const line = current.line;
        const disposition = line.design_disposition ?? "";
        // A fill keeps the line where it is and as it was decided (00730).
        await place.mutateAsync({
          projectId,
          productId: product.id,
          placeholderSelectionId: line.id,
          assignmentScope: (line.assignment_scope ??
            placeItem.scope) as FfeAssignmentScope,
          roomId: line.project_room_id ?? null,
          quantity: line.quantity ?? 1,
          ...(KEPT_DISPOSITIONS.has(disposition)
            ? {
                disposition: disposition as
                  | "candidate"
                  | "selected"
                  | "alternate",
              }
            : {}),
          duplicateMode: "reuse",
          roleConfigurationIdentity: "default",
          idempotencyKey: newKey("fill"),
        });
      } else {
        await place.mutateAsync({
          projectId,
          productId: product.id,
          assignmentScope: placeItem.scope,
          roomId: placeItem.roomId,
          quantity: 1,
          duplicateMode: "create",
          roleConfigurationIdentity: "default",
          idempotencyKey: newKey("add"),
        });
      }
      closeTool(placeItem.id);
    } catch (cause) {
      setNotice(
        errorText(cause) ?? `${product.name} was not placed. Try again.`,
      );
    }
  }

  function onToolKey(event: KeyboardEvent<HTMLDivElement>, placeId: string) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    closeTool(placeId);
  }

  function renderTool(placeItem: Place) {
    if (!tool || tool.placeId !== placeItem.id) return null;
    if (tool.kind === "paste") {
      return (
        <PastePreview
          projectId={projectId}
          roomId={placeItem.roomId}
          roomName={placeItem.name}
          text={tool.text}
          onAdded={() => closeTool(placeItem.id)}
          onCancel={() => closeTool(placeItem.id)}
        />
      );
    }
    const heading =
      tool.kind === "fill"
        ? `Fill ${lineName(tool.line)} with a product`
        : tool.kind === "add"
          ? `Add a Library piece to ${placeItem.name}`
          : `Place ${lineName(tool.line)} in more rooms`;
    return (
      <div
        data-rough-in-tool={tool.kind}
        onKeyDown={(event) => onToolKey(event, placeItem.id)}
        className="mb-12 max-w-[640px] border border-[var(--sheet-rule-strong)] bg-[var(--sheet)] p-6"
      >
        <div className="mb-3 flex items-center gap-3">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--sheet-ink-muted)]">
            {heading}
          </h3>
          <button
            type="button"
            onClick={() => closeTool(placeItem.id)}
            className={cn(ACT, "ml-auto text-[var(--sheet-ink-muted)]")}
          >
            Close
          </button>
        </div>
        {tool.kind === "alsoPlace" ? (
          <PlacementChips
            projectId={projectId}
            line={{
              id: tool.line.id,
              quantity: tool.line.quantity ?? 0,
              unit: lineUnit(tool.line),
              // Rough in prints no price; the client price lives in Price.
              unitPriceCents: null,
              projectRoomId: tool.line.project_room_id ?? null,
            }}
            placements={placementsByLine.get(tool.line.id) ?? []}
            rooms={moveRooms}
            canEdit={!isLocked(tool.line, stages.get(tool.line.id))}
          />
        ) : (
          <LibraryInlineSearch
            autoFocus
            label={heading}
            onChoose={(product) => void chooseProduct(product, tool, placeItem)}
            onSearchLibrary={(query) =>
              router.push(
                query ? `/library?q=${encodeURIComponent(query)}` : "/library",
              )
            }
          />
        )}
      </div>
    );
  }

  const shownNotice =
    notice ??
    (assign.isError
      ? "The move did not save. Use Move to room… to try again."
      : null);
  const activeRoomId = room && roomIds.has(room) ? room : null;
  const shownRoomId = paneRoomId ?? activeRoomId ?? rooms[0]?.id ?? null;
  const shownRoom = rooms.find((r) => r.id === shownRoomId) ?? null;

  function toggleElevation(roomId: string) {
    if (paneOpen && shownRoomId === roomId) {
      setPaneOpen(false);
      return;
    }
    setPaneRoomId(roomId);
    setPaneOpen(true);
  }

  if (room === REMOVED_PLACE) {
    return <RemovedLines projectId={projectId} rooms={rooms} />;
  }

  return (
    <div ref={sheetRef} data-rough-in-lens="" className="flex gap-6 py-6">
      <div className="min-w-0 flex-1 overflow-x-auto">
        {places.map((placeItem) => {
          const target = dropRoom(placeItem);
          const dropLabel = target ? drag.roomDropLabel(target) : null;
          const elevationOn = paneOpen && shownRoomId === placeItem.roomId;
          return (
            <div key={placeItem.id}>
              <RoughInTable
                room={{ id: placeItem.id, name: placeItem.name }}
                rooms={moveRooms}
                rows={rowsFor(placeItem)}
                onAdd={(line) => addLine(placeItem, line)}
                onUpdate={updateLine}
                onRemove={(row) => removeLine(row, placeItem)}
                onMove={moveLine}
                onFill={(row) => openFill(row, placeItem)}
                onAlsoPlace={(row) => openAlsoPlace(row, placeItem)}
                onPaste={(text) =>
                  setTool({ kind: "paste", placeId: placeItem.id, text })
                }
                onSlash={(row) => openFill(row, placeItem)}
                rowDragProps={rowDragProps}
                roomDropProps={target ? drag.roomDropProps(target) : undefined}
                headingActs={
                  <>
                    {dropLabel ? (
                      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sheet-ink)]">
                        {dropLabel}
                      </span>
                    ) : null}
                    {placeItem.roomId ? (
                      <button
                        type="button"
                        aria-pressed={elevationOn}
                        aria-label={`Elevation, ${placeItem.name}`}
                        onClick={() => toggleElevation(placeItem.roomId!)}
                        className={cn(
                          ACT,
                          "hidden min-[1440px]:inline-flex",
                          elevationOn
                            ? "text-[var(--sheet-ink)]"
                            : "text-[var(--sheet-ink-muted)]",
                        )}
                      >
                        Elevation
                      </button>
                    ) : null}
                  </>
                }
              />
              {renderTool(placeItem)}
            </div>
          );
        })}

        {shownNotice ? (
          <p
            role="alert"
            className="mb-3 max-w-[56ch] text-[14px] leading-[1.5] text-[var(--sheet-ink)]"
          >
            {shownNotice}
          </p>
        ) : null}
        {removal ? (
          <UndoToast
            key={removal.key}
            name={removal.name}
            quantity={removal.quantity}
            roomName={removal.placeName}
            onUndo={() => void undoRemoval(removal)}
            onExpire={() =>
              setRemoval((current) =>
                current?.key === removal.key ? null : current,
              )
            }
          />
        ) : null}
        <p {...drag.liveRegionProps} />
      </div>

      {paneOpen && shownRoom ? (
        <div className="sticky top-6 hidden self-start min-[1440px]:block">
          <ElevationPane
            roomName={shownRoom.name}
            fileHref={`/doc/${docId}/plans`}
          />
        </div>
      ) : null}
    </div>
  );
}

/** `Removed · N` in the rail: each removed line, put back for the life of the job (D8). */
function RemovedLines({
  projectId,
  rooms,
}: {
  projectId: string;
  rooms: RoughInLensRoom[];
}) {
  const { data } = useRemovedProjectLines(projectId);
  const restore = useRestoreProjectSelection();
  const [notice, setNotice] = useState<string | null>(null);
  const removed = (data ?? []) as RoughInLine[];
  const roomName = (id: string | null | undefined) =>
    rooms.find((r) => r.id === id)?.name ?? null;

  return (
    <section aria-labelledby="rough-in-removed" className="max-w-[720px] py-6">
      <h2
        id="rough-in-removed"
        className="font-heading text-[18px] italic leading-[1.2] text-[var(--sheet-ink)]"
      >
        Removed
      </h2>
      {removed.length === 0 ? (
        <p className="mt-3 text-[14px] leading-[1.5] text-[var(--sheet-ink-muted)]">
          Nothing has been removed from this job.
        </p>
      ) : (
        <ul className="mt-3 border-t border-[var(--sheet-rule-strong)]">
          {removed.map((line) => {
            const from = roomName(line.project_room_id);
            const name = lineName(line);
            return (
              <li
                key={line.id}
                className="flex min-h-[40px] items-center gap-3 border-b border-[var(--sheet-rule)] text-[14px]"
              >
                <span className="min-w-0 flex-1 text-[var(--sheet-ink)]">
                  {name} ×{line.quantity ?? 0}
                  {from ? (
                    <span className="text-[var(--sheet-ink-muted)]">
                      {" "}
                      · from {from}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  aria-label={`Put back ${name}`}
                  onClick={() =>
                    restore.mutate(
                      { projectId, selectionId: line.id },
                      {
                        onError: (cause) =>
                          setNotice(
                            errorText(cause) ??
                              `${name} was not put back. Try again.`,
                          ),
                      },
                    )
                  }
                  className={cn(ACT, "text-[var(--sheet-ink)]")}
                >
                  Put back
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {notice ? (
        <p
          role="alert"
          className="mt-3 text-[14px] leading-[1.5] text-[var(--sheet-ink)]"
        >
          {notice}
        </p>
      ) : null}
    </section>
  );
}
