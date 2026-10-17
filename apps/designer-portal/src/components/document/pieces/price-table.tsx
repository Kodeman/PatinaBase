"use client";

/**
 * US-21 T-40, US-37 #4 — one room's Price table (SPEC a7; S4, D12, Q7, Q16;
 * contract D4).
 *
 * Props-driven: the Price lens wires the hooks. Every figure is per unit:
 * `LINE · QTY · UNIT · UNIT COST · MARKUP · MARGIN · UNIT CLIENT · LINE TOTAL ·
 * RETAIL · ROUGH ~ ·`. Pricing is two-way: the markup or the unit client price
 * can be typed, and the other one follows from the cost; the cost never moves
 * for either. Margin and line total only print. Each cell commits on blur or
 * Enter, Esc puts it back, and focus selects the whole figure so a round price
 * is typed straight over it ($ and commas accepted).
 *
 * Labor keeps its own writers (labor price, trade cost through 00692). A
 * released line prints its figures. A line whose cost moved under its price
 * carries a row of its own with the two ways to settle it. Labor is indented
 * `↳` under its piece, the room's subtotal sits under a strong rule. The `⋯`
 * menu carries `Add labor`, `Make it an allowance`, `Reset to default markup`,
 * `Move to room…` and `Remove`; a gated act is `aria-disabled` with its reason
 * printed and linked, never `disabled`.
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
import type { FfeCostChangeResolution, FfeLinePricingField } from "@patina/types";
import { Input } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { menuKeyIndex, parseRough } from "@/lib/document/pieces/rough-in-keys";
import { LABOR_STAMP_LABEL } from "@/lib/document/stamp-derivation";
import {
  QUIET_FOCUS,
  ROOM_HEADING_ATTR,
} from "@/lib/document/pieces/sheet-focus";
import {
  clientFromMarkup,
  formatPct,
  marginFromClient,
  markupFromClient,
} from "@/lib/document/trade-pricing";
import { MoveToRoomMenu, type MoveRoom } from "./move-to-room-menu";
import { money, unitWordFor } from "./placement-chips";

export type PriceRowAct = "labor" | "allowance" | "reset" | "move" | "remove";

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
  /** Retail / MSRP per unit, cents; null when the line carries none. */
  retailCents?: number | null;
  /**
   * An allowance's ceiling: the line total (00744). When set, the line prints
   * `Up to` from it, never from `clientCents`, and carries no markup.
   */
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
  /** Client price can be typed: an unreleased line outside a Trade Scope. */
  clientEditable: boolean;
  /**
   * The line's markup, quantity and retail can be typed (set_ffe_line_pricing):
   * not labor, not released, not in a Trade Scope.
   */
  pricingEditable?: boolean;
  /** A cost change waiting to be settled (00809 R6). */
  costChange?: { prevCents: number; heldMarkupPct: number | null } | null;
  /** The client price is above the line's retail (US-37: any amount over). */
  aboveRetail?: boolean;
  /** The server's sentence for the line's last refused write, verbatim. */
  note?: string | null;
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
  /** One typed figure; null clears retail. */
  onPricing: (
    row: PriceRow,
    field: FfeLinePricingField,
    value: number | null,
  ) => void;
  onResolveCost: (row: PriceRow, resolution: FfeCostChangeResolution) => void;
  onAddLabor: (row: PriceRow) => void;
  onAllowance: (row: PriceRow) => void;
  onResetMarkup: (row: PriceRow) => void;
  onMove: (row: PriceRow, roomId: string) => void;
  onRemove: (row: PriceRow) => void;
}

/** Columns and widths: the a7 grid widened for two-way pricing. */
const COLUMNS: Array<{ label: string; width: number; numeric?: boolean }> = [
  { label: "Line", width: 248 },
  { label: "Qty", width: 64, numeric: true },
  { label: "Unit", width: 64 },
  { label: "Unit cost", width: 112, numeric: true },
  { label: "Markup", width: 88, numeric: true },
  { label: "Margin", width: 80, numeric: true },
  { label: "Unit client", width: 120, numeric: true },
  { label: "Line total", width: 120, numeric: true },
  { label: "Retail", width: 104, numeric: true },
  { label: "Rough ~", width: 96, numeric: true },
  { label: "", width: 48 },
];

const DASH = "—";

/** The column word each cell prints above its figure on the phone. */
const CARD_CELL =
  "max-md:flex max-md:flex-col max-md:items-start max-md:px-0 max-md:py-1 max-md:before:font-mono max-md:before:text-[12px] max-md:before:uppercase max-md:before:tracking-[0.08em] max-md:before:text-[var(--sheet-ink-faint)] max-md:before:content-[attr(data-label)]";
const CELL = "px-2 font-sans text-[14px] leading-[1.4] text-[var(--sheet-ink)]";
const NUM_CELL = cn(
  CELL,
  "t-money text-[14px] text-right max-md:text-left",
);
const CELL_INPUT =
  "t-money h-[40px] w-full min-w-0 rounded-none border-0 bg-transparent px-2 text-right text-[14px] leading-[1.4] text-[var(--sheet-ink)] placeholder:text-[var(--sheet-ink-faint)] focus:ring-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-clay-ink)] max-md:min-h-[44px] max-md:px-0 max-md:text-left";
const ROW =
  "border-b border-[var(--sheet-rule)] hover:bg-[var(--sheet-row-hover)] md:h-[40px] max-md:mb-3 max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:border max-md:border-[var(--sheet-rule-strong)] max-md:p-3";
const ACT =
  "inline-flex min-h-11 items-center font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--sheet-ink)] underline decoration-[var(--sheet-ink)] decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)]";

/** A cost of 0 is no cost. A client price of 0 is a price: a −100% markup. */
const positive = (cents: number | null | undefined): cents is number =>
  cents != null && cents > 0;

/** `35.0%`, `−100.0%`: a negative figure carries the typeset minus. */
function pct(value: number | null): string {
  return formatPct(value).replace("-", "−");
}

/** The true markup of the line's cents, or null without a cost and a price. */
export function lineMarkup(
  tradeCents: number | null,
  clientCents: number | null,
): number | null {
  if (!positive(tradeCents) || clientCents == null) return null;
  return markupFromClient(tradeCents, clientCents);
}

/** `35.0% markup on $1,000 = $1,350 · 25.9% margin`, per unit; null when either is missing. */
export function pricingHelp(
  tradeCents: number | null,
  clientCents: number | null,
): string | null {
  if (!positive(tradeCents) || clientCents == null) return null;
  return `${pct(markupFromClient(tradeCents, clientCents))} markup on ${money(tradeCents)} = ${money(clientCents)} · ${pct(marginFromClient(tradeCents, clientCents))} margin`;
}

function priceText(cents: number | null | undefined): string {
  return cents == null ? DASH : money(cents);
}

function roughText(cents: number | null): string {
  return cents == null ? DASH : `~${money(cents)}`;
}

/** `35`, `12.5`, `-10%` → a markup; `undefined` when it is not a number. */
function parsePercent(text: string): number | null | undefined {
  const cleaned = text.replace(/[%\s,]/g, "").replace(/[−–]/g, "-");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function parseWhole(text: string): number | null | undefined {
  const cleaned = text.replace(/[\s,]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

export function PriceTable({
  room,
  rooms,
  rows,
  subtotal,
  onPricing,
  onResolveCost,
  onAddLabor,
  onAllowance,
  onResetMarkup,
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
          tabIndex={-1}
          {...{ [ROOM_HEADING_ATTR]: room.id }}
          className={cn(
            "font-heading text-[18px] italic leading-[1.2] text-[var(--sheet-ink)]",
            QUIET_FOCUS,
          )}
        >
          {room.name}
        </h2>
      </div>

      <table
        aria-labelledby={headingId}
        className="w-[1144px] max-w-full table-fixed border-collapse max-md:block max-md:w-full"
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
                  "t-head h-[40px] px-2 leading-none text-[var(--sheet-ink)]",
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
            <LineRows
              key={row.id}
              row={row}
              room={room}
              rooms={rooms}
              onPricing={onPricing}
              onResolveCost={onResolveCost}
              onAddLabor={onAddLabor}
              onAllowance={onAllowance}
              onResetMarkup={onResetMarkup}
              // The lens says the move once the server answers (T-60a F4).
              onMove={onMove}
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
  onPricing: PriceTableProps["onPricing"];
  onResolveCost: PriceTableProps["onResolveCost"];
  onAddLabor: (row: PriceRow) => void;
  onAllowance: (row: PriceRow) => void;
  onResetMarkup: (row: PriceRow) => void;
  onMove: (row: PriceRow, roomId: string) => void;
  onRemove: (row: PriceRow) => void;
  onGated: (reason: string) => void;
}

function LineRows({
  row,
  room,
  rooms,
  onPricing,
  onResolveCost,
  onAddLabor,
  onAllowance,
  onResetMarkup,
  onMove,
  onRemove,
  onGated,
}: LineRowProps) {
  const ceiling = positive(row.allowanceCents) ? row.allowanceCents : null;
  const notPriced = row.clientCents == null;
  const markup = ceiling ? null : lineMarkup(row.tradeCents, row.clientCents);
  const margin =
    ceiling || !positive(row.tradeCents) || row.clientCents == null
      ? null
      : marginFromClient(row.tradeCents, row.clientCents);
  const help = ceiling ? null : pricingHelp(row.tradeCents, row.clientCents);
  const lineTotal =
    ceiling ?? (row.clientCents != null ? row.clientCents * row.quantity : null);
  const markupEditable =
    !!row.pricingEditable && !ceiling && positive(row.tradeCents);
  const noteId = `${useId()}-note`;

  return (
    <>
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
              {/* Focus lands here once ADD LABOR adds this line (T-60a F6). */}
              <span
                data-line-name=""
                tabIndex={-1}
                className={cn("font-medium", QUIET_FOCUS)}
              >
                {row.name}
              </span>
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
            {help ? (
              <span
                data-pricing-help=""
                className="text-[13px] leading-[1.4] text-[var(--sheet-ink-muted)]"
              >
                {help}
              </span>
            ) : null}
            {row.aboveRetail && positive(row.retailCents) ? (
              <span
                data-retail-note=""
                className="text-[13px] leading-[1.4] text-[var(--sheet-ink)]"
              >
                {`Above retail (${money(row.retailCents)})`}
              </span>
            ) : null}
            {row.note ? (
              <span
                id={noteId}
                role="alert"
                className="text-[13px] leading-[1.4] text-[var(--sheet-ink)]"
              >
                {row.note}
              </span>
            ) : null}
            {row.alsoIn}
          </div>
        </td>
        <td data-label="Qty" className={cn("p-0", CARD_CELL)}>
          {row.pricingEditable ? (
            <FigureInput
              label={`Quantity, ${row.name}`}
              value={row.quantity}
              print={(n) => String(n)}
              parse={parseWhole}
              onCommit={(n) => n != null && onPricing(row, "quantity", n)}
            />
          ) : (
            <span className={cn(NUM_CELL, "block")}>{row.quantity}</span>
          )}
        </td>
        <td data-label="Unit" className={cn(CELL, CARD_CELL)}>
          {unitWordFor(row.unit, row.quantity)}
        </td>
        <td data-label="Unit cost" className={cn("p-0", CARD_CELL)}>
          {row.tradeEditable ? (
            <FigureInput
              label={`Unit cost, ${row.name}`}
              value={positive(row.tradeCents) ? row.tradeCents : null}
              print={money}
              parse={parseRough}
              dataAttr="data-cost-input"
              onCommit={(cents) =>
                cents != null && onPricing(row, "unit_cost_cents", cents)
              }
            />
          ) : (
            <span className={cn(NUM_CELL, "block")}>
              {priceText(positive(row.tradeCents) ? row.tradeCents : null)}
            </span>
          )}
        </td>
        <td data-label="Markup" className={cn("p-0", CARD_CELL)}>
          {markupEditable ? (
            <FigureInput
              label={`Markup, ${row.name}`}
              value={markup}
              print={pct}
              parse={parsePercent}
              onCommit={(typed) =>
                typed != null && onPricing(row, "markup_percent", typed)
              }
            />
          ) : (
            // An allowance carries no markup until it is filled.
            <span className={cn(NUM_CELL, "block")}>{pct(markup)}</span>
          )}
        </td>
        <td data-label="Margin" className={cn(NUM_CELL, CARD_CELL)}>
          {pct(margin)}
        </td>
        <td data-label="Unit client" className={cn("p-0", CARD_CELL)}>
          {row.clientEditable && !ceiling ? (
            <FigureInput
              label={`Unit client price, ${row.name}`}
              value={row.clientCents ?? null}
              print={money}
              parse={parseRough}
              onCommit={(cents) =>
                cents != null &&
                onPricing(row, "unit_client_price_cents", cents)
              }
            />
          ) : (
            <span
              data-allowance-cell=""
              tabIndex={-1}
              className={cn(NUM_CELL, "block", QUIET_FOCUS)}
            >
              {ceiling ? (
                <AllowancePrice ceiling={ceiling} quantity={row.quantity} />
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
          data-label="Line total"
          data-line-total=""
          className={cn(NUM_CELL, CARD_CELL)}
        >
          {priceText(lineTotal)}
        </td>
        <td data-label="Retail" className={cn("p-0", CARD_CELL)}>
          {row.pricingEditable ? (
            <FigureInput
              label={`Retail, ${row.name}`}
              value={row.retailCents ?? null}
              print={money}
              parse={parseRough}
              allowBlank
              onCommit={(cents) => onPricing(row, "retail_unit_cents", cents)}
            />
          ) : (
            <span className={cn(NUM_CELL, "block")}>
              {row.retailCents == null ? DASH : money(row.retailCents)}
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
            onResetMarkup={onResetMarkup}
            onMove={onMove}
            onRemove={onRemove}
            onGated={onGated}
          />
        </td>
      </tr>
      {row.costChange ? (
        <CostChangeRow
          row={row}
          change={row.costChange}
          onResolve={(resolution) => onResolveCost(row, resolution)}
        />
      ) : null}
    </>
  );
}

/**
 * A cost that moved under the line's price (00809 R6): old → new, and the two
 * ways to settle it. It stays until one is chosen.
 */
function CostChangeRow({
  row,
  change,
  onResolve,
}: {
  row: PriceRow;
  change: { prevCents: number; heldMarkupPct: number | null };
  onResolve: (resolution: FfeCostChangeResolution) => void;
}) {
  const cost = positive(row.tradeCents) ? row.tradeCents : null;
  const client = row.clientCents ?? null;
  const keepClientMarkup =
    cost && client != null ? markupFromClient(cost, client) : null;
  const keepMarkupClient =
    cost && change.heldMarkupPct != null
      ? clientFromMarkup(cost, change.heldMarkupPct)
      : null;
  return (
    <tr
      data-cost-change-for={row.id}
      className="border-b border-[var(--sheet-rule)] max-md:mb-3 max-md:block max-md:border max-md:border-[var(--sheet-rule-strong)] max-md:p-3"
    >
      <td colSpan={COLUMNS.length} className="px-2 py-2 max-md:block max-md:px-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="t-body-sm text-[var(--sheet-ink)]">
            <strong className="font-medium">{row.name}</strong>
            {": cost changed from "}
            <span className="t-money text-[14px]">{money(change.prevCents)}</span>
            {" to "}
            <span className="t-money text-[14px]">{cost ? money(cost) : DASH}</span>
            .
          </p>
          <button
            type="button"
            onClick={() => onResolve("keep_client")}
            className={ACT}
          >
            Keep client price
          </button>
          {client != null ? (
            <span className="t-body-sm text-[var(--sheet-ink-muted)]">
              {`${money(client)}, ${pct(keepClientMarkup)} markup`}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onResolve("keep_markup")}
            className={ACT}
          >
            Keep markup
          </button>
          {keepMarkupClient != null ? (
            <span className="t-body-sm text-[var(--sheet-ink-muted)]">
              {`${pct(change.heldMarkupPct)}, ${money(keepMarkupClient)}`}
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

/**
 * An allowance's client price: `Up to` its ceiling per unit, and, when the
 * line holds more than one unit, `Up to` the ceiling itself for the line.
 */
function AllowancePrice({
  ceiling,
  quantity,
}: {
  ceiling: number;
  quantity: number;
}) {
  const each = quantity > 0 ? ceiling / quantity : ceiling;
  return (
    <>
      <span className="block">{`Up to ${money(each)}`}</span>
      {quantity > 1 ? (
        <span className="block text-[13px] text-[var(--sheet-ink-muted)]">
          {`Up to ${money(ceiling)} for the line`}
        </span>
      ) : null}
    </>
  );
}

/**
 * One typed figure. It prints as the sheet prints it; focus selects all of it
 * so a new figure is typed straight over. Blur or Enter commits a changed,
 * readable figure (Enter keeps focus, selected again); Esc puts it back. A
 * figure that does not read is put back too: it never reaches the server.
 */
function FigureInput({
  label,
  value,
  print,
  parse,
  onCommit,
  allowBlank = false,
  dataAttr,
}: {
  label: string;
  value: number | null;
  print: (value: number) => string;
  parse: (text: string) => number | null | undefined;
  onCommit: (value: number | null) => void;
  /** A blank figure commits as null (retail); otherwise blank puts it back. */
  allowBlank?: boolean;
  dataAttr?: string;
}) {
  /** What was typed since focus; null while nothing was. */
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const reselect = useRef(false);

  useEffect(() => {
    if (!reselect.current) return;
    reselect.current = false;
    ref.current?.select();
  });

  function commit() {
    if (draft === null) return;
    const next = parse(draft);
    setDraft(null);
    if (next === undefined || (next === null && !allowBlank)) return;
    if (next !== value) onCommit(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      reselect.current = true;
    } else if (event.key === "Escape" && draft !== null) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
      reselect.current = true;
    }
  }

  return (
    <Input
      ref={ref}
      aria-label={label}
      inputMode="decimal"
      placeholder={DASH}
      value={draft ?? (value == null ? "" : print(value))}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={CELL_INPUT}
      style={{ fontFamily: "var(--font-meta)" }}
      {...(dataAttr ? { [dataAttr]: "" } : {})}
    />
  );
}

const MENU_ITEMS: Array<{ act: PriceRowAct; label: string }> = [
  { act: "labor", label: "Add labor" },
  { act: "allowance", label: "Make it an allowance" },
  { act: "reset", label: "Reset to default markup" },
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
  onResetMarkup,
  onMove,
  onRemove,
  onGated,
}: {
  row: PriceRow;
  room: MoveRoom;
  rooms: MoveRoom[];
  onAddLabor: (row: PriceRow) => void;
  onAllowance: (row: PriceRow) => void;
  onResetMarkup: (row: PriceRow) => void;
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
    else if (act === "reset") onResetMarkup(row);
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
          // WebKit never focuses a tapped or clicked button: without this the
          // press blurs the focused item to nothing, the blur closes the menu,
          // and the item is gone before its click (T-60a F3).
          onMouseDown={(event) => event.preventDefault()}
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
