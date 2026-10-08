"use client";

/**
 * US-21 T-24 — one room's Rough in table (SPEC a2, a8, a9; CONTRACT §3.6).
 *
 * Props-driven: T-27 wires the hooks, T-25 the paste preview and `/` search,
 * T-26 the drag props. `LINE · QTY · UNIT · ROUGH $ · STAGE ·` at the a2
 * widths; the empty entry row is always last. Enter adds and starts the next
 * line in this room, Tab moves across, ⌘↓ goes to the next room, Backspace on
 * an empty name or ⌘⌫ removes. Each line's `⋯` menu carries `Fill with a
 * product`, `Move to room…`, `Also place in…` and `Remove`. A gated act is
 * `aria-disabled` with its reason printed and linked, never `disabled`.
 *
 * Below md (a13) the lines are 56px cards: the name, then `×2 · each ·
 * ~$4,800 · PLACEHOLDER`, and the same `⋯` menu. The entry row carries a
 * visible `ADD` and, above it, `DONE ADDING`, so adding is never Enter alone
 * (R3-7), and the hint names no keyboard-only key.
 *
 * At 1440 with the elevation pane open the table has about 790px: the fixed
 * columns keep their a2 widths and LINE takes what is left, so STAGE and `⋯`
 * stay on screen. Under 640px (md to lg, no pane) it scrolls sideways.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type FocusEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { FfeLineUnit } from "@patina/types";
import { cn } from "@/lib/utils";
import {
  LABOR_STAMP_LABEL,
  lineStampLabel,
  type LineStampKind,
} from "@/lib/document/stamp-derivation";
import {
  ENTRY_NAME_ATTR,
  ROUGH_IN_KEY_HINT,
  ROUGH_IN_PHONE_QUERY,
  ROUGH_IN_TOUCH_HINT,
  ROUGH_IN_UNITS,
  focusNextRoomEntry,
  formatRough,
  isPastedList,
  menuKeyIndex,
  parseQuantity,
  parseRough,
  roughInKeyAction,
  unitLabel,
  type RoughInKeyAction,
} from "@/lib/document/pieces/rough-in-keys";
import { MoveToRoomMenu, type MoveRoom } from "./move-to-room-menu";

export type RoughInRowAct = "fill" | "move" | "alsoPlace" | "remove";

export interface RoughInRow {
  id: string;
  name: string;
  quantity: number;
  unit: FfeLineUnit;
  /** Per unit, internal, printed `~$4,800` (Q7, D12). */
  roughCents: number | null;
  /** The word the line prints (`pieceLineStage(...).kind`). */
  stage: LineStampKind;
  /** A labor line: indented `↳` under its piece, `LABOR` beside the name. */
  labor?: boolean;
  /** Acts this line cannot take, each with the sentence that says why. */
  gates?: Partial<Record<RoughInRowAct, string>>;
}

export interface RoughInNewLine {
  name: string;
  quantity: number;
  unit: FfeLineUnit;
  roughCents: number | null;
}

export type RoughInLinePatch = Partial<RoughInNewLine>;

export interface RoughInTableProps {
  room: MoveRoom;
  /** Every room, in order, for `Move to room…`. */
  rooms: MoveRoom[];
  rows: RoughInRow[];
  onAdd: (line: RoughInNewLine) => void;
  onUpdate: (rowId: string, patch: RoughInLinePatch) => void;
  onRemove: (row: RoughInRow) => void;
  onMove: (row: RoughInRow, roomId: string) => void;
  onFill: (row: RoughInRow) => void;
  onAlsoPlace: (row: RoughInRow) => void;
  /** A pasted list (two or more lines) in the entry name: T-25's preview. */
  onPaste?: (text: string) => void;
  /** `/` in an empty name: T-25's Library search; `null` from the entry row. */
  onSlash?: (row: RoughInRow | null) => void;
  /** T-26: drag props per line. */
  rowDragProps?: (rowId: string) => HTMLAttributes<HTMLTableRowElement>;
  /** T-26: drop props for this room's heading. */
  roomDropProps?: HTMLAttributes<HTMLDivElement>;
  /** Acts at the right of the room heading (T-27's `ELEVATION`). */
  headingActs?: ReactNode;
}

/**
 * Columns and widths, SPEC a2: 480 · 72 · 96 · 120 · 140 · 48. LINE has no
 * fixed width: it takes the rest, 480 at full width and less beside the pane.
 */
const COLUMNS: Array<{ label: string; width?: number; numeric?: boolean }> = [
  { label: "Line" },
  { label: "Qty", width: 72, numeric: true },
  { label: "Unit", width: 96 },
  { label: "Rough $", width: 120, numeric: true },
  { label: "Stage", width: 140 },
  { label: "", width: 48 },
];

const ACT =
  "inline-flex min-h-11 min-w-11 items-center justify-center font-mono text-[12px] font-medium uppercase tracking-[0.06em] underline decoration-[var(--sheet-ink)] decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)]";

function subscribePhone(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return () => {};
  const query = window.matchMedia(ROUGH_IN_PHONE_QUERY);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

function phoneSnapshot(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(ROUGH_IN_PHONE_QUERY).matches === true
  );
}

/** Below md: the cards (a13). The server renders the table; the phone swaps on hydration. */
export function useRoughInPhone(): boolean {
  return useSyncExternalStore(subscribePhone, phoneSnapshot, () => false);
}

const CELL_INPUT =
  "h-[40px] w-full min-w-0 bg-transparent px-2 font-sans text-[14px] leading-[1.4] text-[var(--sheet-ink)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-clay-ink)]";
const NUM_INPUT = cn(CELL_INPUT, "text-right tabular-nums");
const ROW =
  "h-[40px] border-b border-[var(--sheet-rule)] hover:bg-[var(--sheet-row-hover)]";
const ACTIVE_ROW =
  "outline outline-1 outline-offset-[-1px] outline-[var(--sheet-rule-strong)]";

type CellKind = "name" | "other";

export function RoughInTable({
  room,
  rooms,
  rows,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
  onFill,
  onAlsoPlace,
  onPaste,
  onSlash,
  rowDragProps,
  roomDropProps,
  headingActs,
}: RoughInTableProps) {
  const uid = useId();
  const headingId = `${uid}-heading`;
  const hintId = `${uid}-hint`;
  const entryNameRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const nameRefs = useRef(new Map<string, HTMLInputElement>());
  const [announcement, setAnnouncement] = useState("");
  const phone = useRoughInPhone();

  const [entryName, setEntryName] = useState("");
  const [entryQty, setEntryQty] = useState("1");
  const [entryUnit, setEntryUnit] = useState<FfeLineUnit>("each");
  const [entryRough, setEntryRough] = useState("");

  function focusEntry() {
    entryNameRef.current?.focus();
  }

  function addEntry() {
    const name = entryName.trim();
    if (!name) {
      focusEntry();
      return;
    }
    onAdd({
      name,
      quantity: parseQuantity(entryQty) ?? 1,
      unit: entryUnit,
      roughCents: parseRough(entryRough) ?? null,
    });
    setEntryName("");
    setEntryQty("1");
    setEntryUnit("each");
    setEntryRough("");
    focusEntry();
    setAnnouncement(`Added ${name} to ${room.name}.`);
  }

  /** `DONE ADDING`: the entry lets go (the phone's keyboard closes); what is typed stays. */
  function doneAdding() {
    entryNameRef.current?.blur();
    doneRef.current?.focus();
  }

  function removeRow(row: RoughInRow) {
    const gate = row.gates?.remove;
    if (gate) {
      setAnnouncement(gate);
      return;
    }
    // The row leaves the table; focus goes to the line above, or the entry row.
    const index = rows.findIndex((r) => r.id === row.id);
    const above =
      index > 0 ? nameRefs.current.get(rows[index - 1].id) : undefined;
    if (above) above.focus();
    else focusEntry();
    onRemove(row);
  }

  function moveRow(row: RoughInRow, roomId: string) {
    const to = rooms.find((r) => r.id === roomId);
    // The row leaves this room; keep the hand on this room's entry row.
    focusEntry();
    onMove(row, roomId);
    if (to) setAnnouncement(`Moved ${row.name} to ${to.name}.`);
  }

  function onCellKey(
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    row: RoughInRow | null,
    cell: CellKind,
  ) {
    if (event.nativeEvent.isComposing) return;
    const action: RoughInKeyAction | null = roughInKeyAction(event, {
      entry: row === null,
      nameCell: cell === "name",
      value: event.currentTarget.value,
    });
    if (!action) return;
    if (action === "search") {
      if (!onSlash) return;
      event.preventDefault();
      onSlash(row);
      return;
    }
    event.preventDefault();
    if (action === "add") addEntry();
    else if (action === "commit") focusEntry();
    else if (action === "next-room") focusNextRoomEntry(event.currentTarget);
    else if (action === "remove" && row) removeRow(row);
  }

  function onEntryPaste(event: ClipboardEvent<HTMLInputElement>) {
    if (!onPaste) return;
    const text = event.clipboardData.getData("text");
    if (!isPastedList(text)) return;
    event.preventDefault();
    onPaste(text);
  }

  const entryNameInput = (className: string) => (
    <>
      <input
        ref={entryNameRef}
        {...{ [ENTRY_NAME_ATTR]: "" }}
        aria-label={`New line in ${room.name}`}
        aria-describedby={hintId}
        value={entryName}
        onChange={(e) => setEntryName(e.target.value)}
        onKeyDown={(e) => onCellKey(e, null, "name")}
        onPaste={onEntryPaste}
        className={cn(CELL_INPUT, "peer font-medium", className)}
      />
      {entryName === "" ? (
        <i
          aria-hidden="true"
          data-caret
          className="pointer-events-none absolute left-2 top-[11px] h-[18px] w-px bg-[var(--sheet-ink)] peer-focus:hidden"
        />
      ) : null}
    </>
  );

  return (
    <section
      data-rough-in-room={room.id}
      aria-labelledby={headingId}
      className="mb-12"
    >
      <div
        {...roomDropProps}
        className={cn(
          "flex h-[48px] items-center gap-3",
          roomDropProps?.className,
        )}
      >
        <h2
          id={headingId}
          className="font-heading text-[18px] italic leading-[1.2] text-[var(--sheet-ink)]"
        >
          {room.name}
        </h2>
        {headingActs ? (
          <div className="ml-auto flex items-center gap-3">{headingActs}</div>
        ) : null}
      </div>

      {phone ? (
        <>
          <ul
            aria-labelledby={headingId}
            data-rough-in-cards=""
            className="border-t border-[var(--sheet-rule-strong)]"
          >
            {rows.map((row, index) => (
              <LineCard
                key={row.id}
                row={row}
                index={index}
                room={room}
                rooms={rooms}
                nameRef={(el) => {
                  if (el) nameRefs.current.set(row.id, el);
                  else nameRefs.current.delete(row.id);
                }}
                onKey={onCellKey}
                onUpdate={onUpdate}
                onRemove={removeRow}
                onMove={moveRow}
                onFill={onFill}
                onAlsoPlace={onAlsoPlace}
              />
            ))}
          </ul>
          <div data-entry-row className="mt-2 flex flex-col">
            <button
              ref={doneRef}
              type="button"
              aria-label={`Done adding, ${room.name}`}
              onClick={doneAdding}
              className={cn(ACT, "self-end text-[var(--sheet-ink-muted)]")}
            >
              Done adding
            </button>
            <div
              className={cn("flex min-h-[56px] items-center gap-2", ACTIVE_ROW)}
            >
              <div className="relative min-w-0 flex-1">
                {entryNameInput("h-[44px]")}
              </div>
              <button
                type="button"
                aria-label={`Add to ${room.name}`}
                // The entry keeps focus, so the phone's keyboard stays up.
                onMouseDown={(e) => e.preventDefault()}
                onClick={addEntry}
                className={cn(ACT, "shrink-0 px-2 text-[var(--sheet-ink)]")}
              >
                Add
              </button>
            </div>
          </div>
        </>
      ) : (
        <table
          aria-labelledby={headingId}
          className="w-full min-w-[640px] max-w-[956px] table-fixed border-collapse"
        >
          <colgroup>
            {COLUMNS.map((col, i) => (
              <col
                key={i}
                style={col.width ? { width: col.width } : undefined}
              />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--sheet-rule-strong)]">
              {COLUMNS.map((col, i) => (
                <th
                  key={i}
                  scope="col"
                  className={cn(
                    "h-[40px] px-2 font-mono text-[12px] font-medium uppercase leading-none tracking-[0.06em] text-[var(--sheet-ink)]",
                    col.numeric ? "text-right" : "text-left",
                  )}
                >
                  {col.label || <span className="sr-only">Acts</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <LineRow
                key={row.id}
                row={row}
                index={index}
                room={room}
                rooms={rooms}
                dragProps={rowDragProps?.(row.id)}
                nameRef={(el) => {
                  if (el) nameRefs.current.set(row.id, el);
                  else nameRefs.current.delete(row.id);
                }}
                onKey={onCellKey}
                onUpdate={onUpdate}
                onRemove={removeRow}
                onMove={moveRow}
                onFill={onFill}
                onAlsoPlace={onAlsoPlace}
              />
            ))}

            <tr data-entry-row className={cn(ROW, ACTIVE_ROW)}>
              <td className="relative">{entryNameInput("")}</td>
              <td>
                <input
                  aria-label="Qty, new line"
                  inputMode="numeric"
                  value={entryQty}
                  onChange={(e) => setEntryQty(e.target.value)}
                  onKeyDown={(e) => onCellKey(e, null, "other")}
                  className={NUM_INPUT}
                />
              </td>
              <td>
                <UnitSelect
                  label="Unit, new line"
                  value={entryUnit}
                  onChange={setEntryUnit}
                  onKeyDown={(e) => onCellKey(e, null, "other")}
                />
              </td>
              <td>
                <input
                  aria-label="Rough $, new line"
                  inputMode="decimal"
                  value={entryRough}
                  onChange={(e) => setEntryRough(e.target.value)}
                  onKeyDown={(e) => onCellKey(e, null, "other")}
                  className={cn(NUM_INPUT, "text-[var(--sheet-ink-faint)]")}
                />
              </td>
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      )}

      <p
        id={hintId}
        className="mt-3 font-mono text-[11px] uppercase leading-[1.4] text-[var(--sheet-ink-faint)]"
      >
        {phone ? ROUGH_IN_TOUCH_HINT : ROUGH_IN_KEY_HINT}
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

function UnitSelect({
  label,
  value,
  onChange,
  onKeyDown,
}: {
  label: string;
  value: FfeLineUnit;
  onChange: (unit: FfeLineUnit) => void;
  onKeyDown: (event: KeyboardEvent<HTMLSelectElement>) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as FfeLineUnit)}
      onKeyDown={onKeyDown}
      className={cn(CELL_INPUT, "appearance-none")}
    >
      {ROUGH_IN_UNITS.map((unit) => (
        <option key={unit} value={unit}>
          {unitLabel(unit)}
        </option>
      ))}
    </select>
  );
}

interface LineRowProps {
  row: RoughInRow;
  index: number;
  room: MoveRoom;
  rooms: MoveRoom[];
  dragProps?: HTMLAttributes<HTMLTableRowElement>;
  nameRef: (el: HTMLInputElement | null) => void;
  onKey: (
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    row: RoughInRow,
    cell: CellKind,
  ) => void;
  onUpdate: (rowId: string, patch: RoughInLinePatch) => void;
  onRemove: (row: RoughInRow) => void;
  onMove: (row: RoughInRow, roomId: string) => void;
  onFill: (row: RoughInRow) => void;
  onAlsoPlace: (row: RoughInRow) => void;
}

function LineRow({
  row,
  index,
  room,
  rooms,
  dragProps,
  nameRef,
  onKey,
  onUpdate,
  onRemove,
  onMove,
  onFill,
  onAlsoPlace,
}: LineRowProps) {
  const [name, setName, commitName] = useNameCell(row, onUpdate);
  const [qty, setQty] = useState(String(row.quantity));
  /** The raw figure while the cell has focus; `~$4,800` otherwise. */
  const [rough, setRough] = useState<string | null>(null);

  useEffect(() => setQty(String(row.quantity)), [row.quantity]);

  function commitQty() {
    const next = parseQuantity(qty);
    if (next !== undefined && next !== row.quantity)
      onUpdate(row.id, { quantity: next });
    else setQty(String(row.quantity));
  }

  function commitRough() {
    if (rough === null) return;
    const next = parseRough(rough);
    if (next !== undefined && next !== row.roughCents)
      onUpdate(row.id, { roughCents: next });
    setRough(null);
  }

  const label = row.name || `line ${index + 1}`;

  return (
    <tr
      data-line-id={row.id}
      {...dragProps}
      className={cn(
        ROW,
        "focus-within:outline focus-within:outline-1 focus-within:outline-offset-[-1px] focus-within:outline-[var(--sheet-rule-strong)]",
        dragProps?.className,
      )}
    >
      <td>
        <div className={cn("flex items-center gap-2", row.labor && "pl-6")}>
          {dragProps ? (
            <span
              aria-hidden="true"
              className="cursor-grab pl-1 text-[var(--sheet-ink-faint)]"
            >
              ⋮⋮
            </span>
          ) : null}
          {row.labor ? (
            <span aria-hidden="true" className="text-[var(--sheet-ink-faint)]">
              ↳
            </span>
          ) : null}
          <input
            ref={nameRef}
            aria-label={`Line ${index + 1}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => onKey(e, row, "name")}
            className={cn(CELL_INPUT, "font-medium")}
          />
          {row.labor ? (
            <span className="stamp stamp--labor shrink-0">
              {LABOR_STAMP_LABEL}
            </span>
          ) : null}
        </div>
      </td>
      <td>
        <input
          aria-label={`Qty, ${label}`}
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={commitQty}
          onKeyDown={(e) => onKey(e, row, "other")}
          className={NUM_INPUT}
        />
      </td>
      <td>
        <UnitSelect
          label={`Unit, ${label}`}
          value={row.unit}
          onChange={(unit) => onUpdate(row.id, { unit })}
          onKeyDown={(e) => onKey(e, row, "other")}
        />
      </td>
      <td>
        <input
          aria-label={`Rough $, ${label}`}
          inputMode="decimal"
          value={rough ?? formatRough(row.roughCents)}
          onFocus={() =>
            setRough(
              row.roughCents === null ? "" : String(row.roughCents / 100),
            )
          }
          onChange={(e) => setRough(e.target.value)}
          onBlur={commitRough}
          onKeyDown={(e) => onKey(e, row, "other")}
          className={cn(NUM_INPUT, "text-[var(--sheet-ink-faint)]")}
        />
      </td>
      <td className="px-2">
        <span className={`stamp stamp--${row.stage}`}>
          {lineStampLabel(row.stage)}
        </span>
      </td>
      <td className="text-right">
        <RowMenu
          row={row}
          label={label}
          room={room}
          rooms={rooms}
          onFill={onFill}
          onMove={onMove}
          onAlsoPlace={onAlsoPlace}
          onRemove={onRemove}
        />
      </td>
    </tr>
  );
}

/** The name cell's text, kept on blur when it changed and put back when blank. */
function useNameCell(
  row: RoughInRow,
  onUpdate: (rowId: string, patch: RoughInLinePatch) => void,
): [string, (name: string) => void, () => void] {
  const [name, setName] = useState(row.name);
  useEffect(() => setName(row.name), [row.name]);
  function commitName() {
    const next = name.trim();
    if (next && next !== row.name) onUpdate(row.id, { name: next });
    else setName(row.name);
  }
  return [name, setName, commitName];
}

/** One line at 390 (a13): a 56px card, the name, then `×2 · each · ~$4,800 · PLACEHOLDER`. */
function LineCard({
  row,
  index,
  room,
  rooms,
  nameRef,
  onKey,
  onUpdate,
  onRemove,
  onMove,
  onFill,
  onAlsoPlace,
}: Omit<LineRowProps, "dragProps">) {
  const [name, setName, commitName] = useNameCell(row, onUpdate);
  const label = row.name || `line ${index + 1}`;
  const figures = [
    `×${row.quantity}`,
    unitLabel(row.unit),
    formatRough(row.roughCents),
  ].filter(Boolean);
  return (
    <li
      data-line-id={row.id}
      className="flex min-h-[56px] items-center gap-2 border-b border-[var(--sheet-rule)] focus-within:outline focus-within:outline-1 focus-within:outline-offset-[-1px] focus-within:outline-[var(--sheet-rule-strong)]"
    >
      <div className={cn("min-w-0 flex-1 py-1", row.labor && "pl-4")}>
        <div className="flex items-center gap-1">
          {row.labor ? (
            <span aria-hidden="true" className="text-[var(--sheet-ink-faint)]">
              ↳
            </span>
          ) : null}
          <input
            ref={nameRef}
            aria-label={`Line ${index + 1}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => onKey(e, row, "name")}
            className={cn(CELL_INPUT, "h-[28px] px-0 font-medium")}
          />
        </div>
        <p className="flex flex-wrap items-center gap-x-2 font-mono text-[12px] tabular-nums leading-[1.4] text-[var(--sheet-ink-muted)]">
          {row.labor ? (
            <span className="stamp stamp--labor">{LABOR_STAMP_LABEL}</span>
          ) : null}
          <span>{figures.join(" · ")} ·</span>
          <span className={`stamp stamp--${row.stage}`}>
            {lineStampLabel(row.stage)}
          </span>
        </p>
      </div>
      <RowMenu
        row={row}
        label={label}
        room={room}
        rooms={rooms}
        onFill={onFill}
        onMove={onMove}
        onAlsoPlace={onAlsoPlace}
        onRemove={onRemove}
      />
    </li>
  );
}

const MENU_ITEMS: Array<{ act: RoughInRowAct; label: string }> = [
  { act: "fill", label: "Fill with a product" },
  { act: "move", label: "Move to room…" },
  { act: "alsoPlace", label: "Also place in…" },
  { act: "remove", label: "Remove" },
];

function RowMenu({
  row,
  label,
  room,
  rooms,
  onFill,
  onMove,
  onAlsoPlace,
  onRemove,
}: {
  row: RoughInRow;
  label: string;
  room: MoveRoom;
  rooms: MoveRoom[];
  onFill: (row: RoughInRow) => void;
  onMove: (row: RoughInRow, roomId: string) => void;
  onAlsoPlace: (row: RoughInRow) => void;
  onRemove: (row: RoughInRow) => void;
}) {
  const uid = useId();
  const menuId = `${uid}-menu`;
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const wasMoving = useRef(false);

  useEffect(() => {
    if (open && !moving) {
      // First open lands on the first act; leaving the room list lands back on `Move to room…`.
      itemRefs.current[wasMoving.current ? 1 : 0]?.focus();
    }
    wasMoving.current = moving;
  }, [open, moving]);

  function close(returnFocus: boolean) {
    setOpen(false);
    setMoving(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function choose(act: RoughInRowAct) {
    if (row.gates?.[act]) return;
    if (act === "move") {
      setMoving((m) => !m);
      return;
    }
    close(act !== "remove");
    if (act === "fill") onFill(row);
    else if (act === "alsoPlace") onAlsoPlace(row);
    else onRemove(row);
  }

  function onMenuKey(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const index = itemRefs.current.findIndex(
      (item) => item === document.activeElement,
    );
    if (index < 0) return; // inside the room list, which keeps its own keys
    if (event.key === "ArrowRight" && index === 1) {
      event.preventDefault();
      choose("move");
      return;
    }
    const next = menuKeyIndex(event.key, index, MENU_ITEMS.length);
    if (next === null) return;
    event.preventDefault();
    itemRefs.current[next]?.focus();
  }

  function onBlurWithin(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
      setMoving(false);
    }
  }

  return (
    <div className="relative inline-block" onBlur={onBlurWithin}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Acts for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(true) : setOpen(true))}
        className="inline-flex h-[40px] min-w-[44px] items-center justify-center font-mono text-[14px] text-[var(--sheet-ink-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)]"
      >
        ⋯
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-label={`Acts for ${label}`}
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-20 w-[280px] border border-[var(--sheet-rule-strong)] bg-[var(--sheet)] py-1 text-left"
        >
          {MENU_ITEMS.map(({ act, label: word }, i) => {
            const gate = row.gates?.[act];
            const reasonId = `${uid}-${act}-reason`;
            return (
              <li role="none" key={act}>
                <button
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role="menuitem"
                  aria-disabled={gate ? true : undefined}
                  aria-describedby={gate ? reasonId : undefined}
                  aria-haspopup={act === "move" ? "menu" : undefined}
                  aria-expanded={act === "move" ? moving : undefined}
                  onClick={() => choose(act)}
                  className={cn(
                    "flex min-h-[44px] w-full items-center px-3 text-left font-sans text-[14px] hover:bg-[var(--sheet-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-clay-ink)]",
                    gate
                      ? "cursor-not-allowed text-[var(--sheet-ink-faint)]"
                      : "text-[var(--sheet-ink)]",
                  )}
                >
                  {word}
                </button>
                {gate ? (
                  <p
                    id={reasonId}
                    className="max-w-[56ch] px-3 pb-2 font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink)]"
                  >
                    {gate}
                  </p>
                ) : null}
                {act === "move" && moving ? (
                  <MoveToRoomMenu
                    rooms={rooms}
                    currentRoomId={room.id}
                    onChoose={(roomId) => {
                      close(false);
                      onMove(row, roomId);
                    }}
                    onClose={() => setMoving(false)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
