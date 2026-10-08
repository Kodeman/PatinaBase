"use client";

/**
 * US-21 T-40 — one room's Price table (SPEC a7; S4, D12, Q7, Q16; CONTRACT
 * §1.2 client-price note, §3.6).
 *
 * Props-driven: the Price lens wires the hooks. `LINE · QTY · UNIT · TRADE
 * COST · MARKUP · CLIENT PRICE · ROUGH ~ ·` at the a7 widths, labor indented
 * `↳` under its piece, and the room's subtotal under a strong rule. Trade cost
 * is typed here. Markup and client price only print: no writer of a placed
 * line's client price exists in this release (D19 is not built). The one
 * exception is a labor line, whose own client price is typed while it is
 * unreleased (00737, ruling F1). The `⋯` menu carries `Add labor`, `Make it an
 * allowance`, `Move to room…` and `Remove`; a gated act is `aria-disabled`
 * with its reason printed and linked, never `disabled`.
 *
 * At 390 the same table stacks as one card per line (a13): each cell prints
 * its column's word above its figure, so the phone reads the same columns.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { menuKeyIndex, parseRough } from "@/lib/document/pieces/rough-in-keys";
import { LABOR_STAMP_LABEL } from "@/lib/document/stamp-derivation";
import { MoveToRoomMenu, type MoveRoom } from "./move-to-room-menu";
import { money, unitWord } from "./placement-chips";

export type PriceRowAct = "labor" | "allowance" | "move" | "remove";

export interface PriceRow {
  id: string;
  name: string;
  /** The filled product, printed under the line's name (a7). */
  productName?: string | null;
  quantity: number;
  unit: string | null | undefined;
  /** Per unit, cents. */
  tradeCents: number | null;
  /** Per unit, cents; 0 or null prints as no price. */
  clientCents: number | null;
  /** An allowance's ceiling per unit, when the line has no client price. */
  allowanceCents?: number | null;
  /** Per unit, internal (D12); only while it is what the line counts at. */
  roughCents: number | null;
  /** The stage word to print beside the name, or null for none. */
  stamp?: { kind: string; label: string } | null;
  /** A labor line: indented `↳` under its piece, `LABOR` beside the name. */
  labor?: boolean;
  /** `ALSO IN …` for a line placed in more than one room. */
  alsoIn?: ReactNode;
  /** Trade cost can be typed (the line is not on an order or a Trade Scope). */
  tradeEditable: boolean;
  /** Client price can be typed: an unreleased labor line only. */
  clientEditable: boolean;
  /** Acts this line cannot take, each with the sentence that says why. */
  gates?: Partial<Record<PriceRowAct, string>>;
}

export interface PriceTableProps {
  room: MoveRoom;
  /** Every room, in order, for `Move to room…`. */
  rooms: MoveRoom[];
  rows: PriceRow[];
  /** `Bedroom · $2,835 priced · ~$6,100 roughed`. */
  subtotal: string;
  onTradeCost: (row: PriceRow, cents: number) => void;
  onClientPrice: (row: PriceRow, cents: number) => void;
  onAddLabor: (row: PriceRow) => void;
  onAllowance: (row: PriceRow) => void;
  onMove: (row: PriceRow, roomId: string) => void;
  onRemove: (row: PriceRow) => void;
}

/** Columns and widths, SPEC a7: 400 · 64 · 80 · 120 · 80 · 130 · 110 · 48. */
const COLUMNS: Array<{ label: string; width: number; numeric?: boolean }> = [
  { label: "Line", width: 400 },
  { label: "Qty", width: 64, numeric: true },
  { label: "Unit", width: 80 },
  { label: "Trade cost", width: 120, numeric: true },
  { label: "Markup", width: 80, numeric: true },
  { label: "Client price", width: 130, numeric: true },
  { label: "Rough ~", width: 110, numeric: true },
  { label: "", width: 48 },
];

const DASH = "—";

/** The column word each cell prints above its figure on the phone. */
const CARD_CELL =
  "max-md:flex max-md:flex-col max-md:items-start max-md:px-0 max-md:py-1 max-md:before:font-mono max-md:before:text-[11px] max-md:before:uppercase max-md:before:tracking-[0.06em] max-md:before:text-[var(--sheet-ink-faint)] max-md:before:content-[attr(data-label)]";
const CELL = "px-2 font-sans text-[14px] leading-[1.4] text-[var(--sheet-ink)]";
const NUM_CELL = cn(CELL, "text-right tabular-nums max-md:text-left");
const CELL_INPUT =
  "h-[40px] w-full min-w-0 bg-transparent px-2 text-right font-sans text-[14px] leading-[1.4] tabular-nums text-[var(--sheet-ink)] outline-none placeholder:text-[var(--sheet-ink-faint)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-clay-ink)] max-md:min-h-[44px] max-md:px-0 max-md:text-left";
const ROW =
  "border-b border-[var(--sheet-rule)] hover:bg-[var(--sheet-row-hover)] md:h-[40px] max-md:mb-3 max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:border max-md:border-[var(--sheet-rule-strong)] max-md:p-3";

/** `25%`, `33.33%`; `—` when the client price is not above the trade cost. */
export function markupText(
  tradeCents: number | null,
  clientCents: number | null,
): string {
  if (!tradeCents || !clientCents || clientCents <= tradeCents) return DASH;
  const percent = Math.round((clientCents / tradeCents - 1) * 10000) / 100;
  return `${percent}%`;
}

function priceText(cents: number | null | undefined): string {
  return cents && cents > 0 ? money(cents) : DASH;
}

function roughText(cents: number | null): string {
  return cents == null ? DASH : `~${money(cents)}`;
}

export function PriceTable({
  room,
  rooms,
  rows,
  subtotal,
  onTradeCost,
  onClientPrice,
  onAddLabor,
  onAllowance,
  onMove,
  onRemove,
}: PriceTableProps) {
  const uid = useId();
  const headingId = `${uid}-heading`;
  const [announcement, setAnnouncement] = useState("");

  return (
    <section
      data-price-room={room.id}
      aria-labelledby={headingId}
      className="mb-12"
    >
      <div className="flex h-[48px] items-center">
        <h2
          id={headingId}
          className="font-heading text-[18px] italic leading-[1.2] text-[var(--sheet-ink)]"
        >
          {room.name}
        </h2>
      </div>

      <table
        aria-labelledby={headingId}
        className="w-[1032px] max-w-full table-fixed border-collapse max-md:block max-md:w-full"
      >
        <colgroup>
          {COLUMNS.map((col, i) => (
            <col key={i} style={{ width: col.width }} />
          ))}
        </colgroup>
        <thead className="max-md:hidden">
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
        <tbody className="max-md:block">
          {rows.map((row) => (
            <LineRow
              key={row.id}
              row={row}
              room={room}
              rooms={rooms}
              onTradeCost={onTradeCost}
              onClientPrice={onClientPrice}
              onAddLabor={onAddLabor}
              onAllowance={onAllowance}
              onMove={(r, roomId) => {
                const to = rooms.find((x) => x.id === roomId);
                onMove(r, roomId);
                if (to) setAnnouncement(`Moved ${r.name} to ${to.name}.`);
              }}
              onRemove={onRemove}
              onGated={setAnnouncement}
            />
          ))}
        </tbody>
        <tfoot className="max-md:block">
          <tr className="border-t border-[var(--sheet-rule-strong)] max-md:block">
            <td
              colSpan={COLUMNS.length}
              data-price-subtotal=""
              className="h-[40px] px-2 font-sans text-[14px] font-medium tabular-nums text-[var(--sheet-ink)] max-md:block max-md:px-0 max-md:py-2"
            >
              {subtotal}
            </td>
          </tr>
        </tfoot>
      </table>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

interface LineRowProps {
  row: PriceRow;
  room: MoveRoom;
  rooms: MoveRoom[];
  onTradeCost: (row: PriceRow, cents: number) => void;
  onClientPrice: (row: PriceRow, cents: number) => void;
  onAddLabor: (row: PriceRow) => void;
  onAllowance: (row: PriceRow) => void;
  onMove: (row: PriceRow, roomId: string) => void;
  onRemove: (row: PriceRow) => void;
  onGated: (reason: string) => void;
}

function LineRow({
  row,
  room,
  rooms,
  onTradeCost,
  onClientPrice,
  onAddLabor,
  onAllowance,
  onMove,
  onRemove,
  onGated,
}: LineRowProps) {
  const notPriced = !(row.clientCents && row.clientCents > 0);
  return (
    <tr data-line-id={row.id} className={ROW}>
      <td
        data-label="Line"
        className={cn(CELL, "max-md:col-span-2", CARD_CELL)}
      >
        <div className={cn("flex flex-col py-1", row.labor && "pl-6")}>
          <span className="flex flex-wrap items-center gap-2">
            {row.labor ? (
              <span
                aria-hidden="true"
                className="text-[var(--sheet-ink-faint)]"
              >
                ↳
              </span>
            ) : null}
            <span className="font-medium">{row.name}</span>
            {row.labor ? (
              <span className="stamp stamp--labor shrink-0">
                {LABOR_STAMP_LABEL}
              </span>
            ) : null}
            {row.stamp?.label ? (
              <span className={`stamp stamp--${row.stamp.kind} shrink-0`}>
                {row.stamp.label}
              </span>
            ) : null}
          </span>
          {row.productName ? (
            <span className="text-[13px] text-[var(--sheet-ink-muted)]">
              {row.productName}
            </span>
          ) : null}
          {row.alsoIn}
        </div>
      </td>
      <td data-label="Qty" className={cn(NUM_CELL, CARD_CELL)}>
        {row.quantity}
      </td>
      <td data-label="Unit" className={cn(CELL, CARD_CELL)}>
        {unitWord(row.unit)}
      </td>
      <td data-label="Trade cost" className={cn("p-0", CARD_CELL)}>
        {row.tradeEditable ? (
          <MoneyInput
            label={`Trade cost, ${row.name}`}
            cents={row.tradeCents}
            onCommit={(cents) => onTradeCost(row, cents)}
          />
        ) : (
          <span className={cn(NUM_CELL, "block")}>
            {priceText(row.tradeCents)}
          </span>
        )}
      </td>
      <td data-label="Markup" className={cn(NUM_CELL, CARD_CELL)}>
        {markupText(row.tradeCents, row.clientCents)}
      </td>
      <td data-label="Client price" className={cn("p-0", CARD_CELL)}>
        {row.clientEditable ? (
          <MoneyInput
            label={`Client price, ${row.name}`}
            cents={row.clientCents}
            onCommit={(cents) => onClientPrice(row, cents)}
          />
        ) : (
          <span className={cn(NUM_CELL, "block")}>
            {notPriced && row.allowanceCents ? (
              `Up to ${money(row.allowanceCents)}`
            ) : notPriced ? (
              <>
                <span aria-hidden="true">{DASH}</span>
                <span className="sr-only">Not priced</span>
              </>
            ) : (
              money(row.clientCents as number)
            )}
          </span>
        )}
      </td>
      <td
        data-label="Rough ~"
        className={cn(NUM_CELL, "text-[var(--sheet-ink-faint)]", CARD_CELL)}
      >
        {roughText(row.roughCents)}
      </td>
      <td className="text-right max-md:col-span-2 max-md:text-left">
        <RowMenu
          row={row}
          room={room}
          rooms={rooms}
          onAddLabor={onAddLabor}
          onAllowance={onAllowance}
          onMove={onMove}
          onRemove={onRemove}
          onGated={onGated}
        />
      </td>
    </tr>
  );
}

/** A figure typed in dollars; printed as money while the cell is not being typed in. */
function MoneyInput({
  label,
  cents,
  onCommit,
}: {
  label: string;
  cents: number | null;
  onCommit: (cents: number) => void;
}) {
  /** The raw figure while the cell has focus. */
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const next = parseRough(draft);
    if (next != null && next !== (cents ?? null)) onCommit(next);
    setDraft(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape" && draft !== null) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
    }
  }

  return (
    <input
      aria-label={label}
      inputMode="decimal"
      placeholder={DASH}
      value={draft ?? (cents && cents > 0 ? money(cents) : "")}
      onFocus={() => setDraft(cents && cents > 0 ? String(cents / 100) : "")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={CELL_INPUT}
    />
  );
}

const MENU_ITEMS: Array<{ act: PriceRowAct; label: string }> = [
  { act: "labor", label: "Add labor" },
  { act: "allowance", label: "Make it an allowance" },
  { act: "move", label: "Move to room…" },
  { act: "remove", label: "Remove" },
];
const MOVE_INDEX = MENU_ITEMS.findIndex((item) => item.act === "move");

function RowMenu({
  row,
  room,
  rooms,
  onAddLabor,
  onAllowance,
  onMove,
  onRemove,
  onGated,
}: {
  row: PriceRow;
  room: MoveRoom;
  rooms: MoveRoom[];
  onAddLabor: (row: PriceRow) => void;
  onAllowance: (row: PriceRow) => void;
  onMove: (row: PriceRow, roomId: string) => void;
  onRemove: (row: PriceRow) => void;
  onGated: (reason: string) => void;
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
      itemRefs.current[wasMoving.current ? MOVE_INDEX : 0]?.focus();
    }
    wasMoving.current = moving;
  }, [open, moving]);

  function close(returnFocus: boolean) {
    setOpen(false);
    setMoving(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function choose(act: PriceRowAct) {
    const gate = row.gates?.[act];
    if (gate) {
      onGated(gate);
      return;
    }
    if (act === "move") {
      setMoving((m) => !m);
      return;
    }
    close(act !== "remove");
    if (act === "labor") onAddLabor(row);
    else if (act === "allowance") onAllowance(row);
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
    if (event.key === "ArrowRight" && index === MOVE_INDEX) {
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
        aria-label={`Acts for ${row.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(true) : setOpen(true))}
        className="inline-flex h-[40px] min-w-[44px] items-center justify-center font-mono text-[14px] text-[var(--sheet-ink-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)] max-md:h-[44px]"
      >
        ⋯
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-label={`Acts for ${row.name}`}
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-20 w-[280px] border border-[var(--sheet-rule-strong)] bg-[var(--sheet)] py-1 text-left max-md:left-0 max-md:right-auto"
        >
          {MENU_ITEMS.map(({ act, label }, i) => {
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
                  {label}
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
                      close(true);
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
