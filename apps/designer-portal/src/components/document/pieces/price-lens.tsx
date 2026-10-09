"use client";

/**
 * US-21 T-40 — the Price lens (SPEC a7; S4, D12, Q7, Q16; CONTRACT §1.2
 * client-price note, §3.6).
 *
 * Front matter `Job · $30,760 priced · ~$36,368 roughed`, then one Price table
 * per place: the rail's room, or every room holding a line when the rail names
 * none. The figures are the overview's (`overview-derivation`), so the room
 * subtotals and the job line never disagree with the Document's Pieces rows.
 *
 * Trade cost is typed through `set_project_ffe_line_commercials` (00692).
 * Markup and client price are read-only on every job: no writer of a placed
 * line's client price exists (D19 is not built), and an active job says so in
 * the a7 sentence. A labor line's own client price is the exception, typed
 * through `set_labor_line_price` (00737) until the line is released (ruling
 * F1). `Make it an allowance` goes through `make_ffe_line_allowance` (00743).
 *
 * The lens is absent for a seat without money (R1, Q7).
 */
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  useAddLaborLine,
  useArchiveProjectSelection,
  useMakeFfeLineAllowance,
  useProjectFFEItems,
  useProjectRoomPlacements,
  useRestoreProjectSelection,
  useSetFfeLineCommercials,
  useSetLaborLinePrice,
} from "@patina/supabase";
import type { FfeLineUnit, FfeRoomPlacement } from "@patina/types";
import { cn } from "@/lib/utils";
import { fmtUsd } from "@/lib/document/format";
import {
  useAssignLineRoom,
  useDocumentRooms,
} from "@/hooks/use-document-rooms";
import { useDocumentEngagement } from "@/hooks/use-document-state";
import {
  REMOVED_PLACE,
  type BuildRoomPlace,
} from "@/lib/document/pieces/build-room-url";
import { liveBuildRoomLines } from "@/lib/document/pieces/live-lines";
import {
  deriveOverviewJob,
  deriveOverviewRows,
  overviewStage,
  type OverviewLine,
  type OverviewTally,
} from "@/lib/document/pieces/overview-derivation";
import {
  ROUGH_IN_UNITS,
  parseQuantity,
  parseRough,
  unitLabel,
} from "@/lib/document/pieces/rough-in-keys";
import { RELEASED_DRAG_REASON } from "@/lib/document/pieces/use-row-drag";
import {
  deriveLineStamp,
  isLaborLine,
  laborPiece,
  lineStageInputFromRow,
  lineStampLabel,
  type LineStampRow,
} from "@/lib/document/stamp-derivation";
import { laborGate } from "./labor-act";
import { AlsoInLine, money, unitWord } from "./placement-chips";
import { PriceTable, type PriceRow } from "./price-table";
import { UndoToast } from "./undo-toast";

export interface PriceLensProps {
  docId: string;
  projectId: string;
  room: BuildRoomPlace;
  canSeeMoney: boolean;
}

/** a7, word for word (R1-F26, D19, Q16). */
export const ACTIVE_JOB_SENTENCE =
  "This job is active. Markup and client price are read-only here; they change through Record a change. Trade cost can still be typed.";

const TRADE_SCOPE_REASON = "Trade Scope lines change in their scope.";
const LABOR_LABOR_REASON = "A labor line takes no labor of its own.";
const LABOR_ALLOWANCE_REASON = "Labor can't be an allowance.";
const REASON_REFUSAL = "archive reason must be at least 5 characters";

/** From `ordered` on, a line is on its way to the maker. */
const ORDERED_ON: ReadonlySet<string> = new Set([
  "ordered",
  "production",
  "shipped",
  "delivered",
  "installed",
]);

const ACT =
  "inline-flex min-h-11 min-w-11 items-center justify-center font-mono text-[12px] font-medium uppercase tracking-[0.06em] underline decoration-[var(--sheet-ink)] decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)]";
const LABEL =
  "font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--sheet-ink-muted)]";
const INPUT =
  "h-11 border border-[var(--sheet-rule-strong)] bg-[var(--sheet)] px-2 font-sans text-[14px] text-[var(--sheet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)]";

/** The `project_ffe_items` columns this lens reads, as `useProjectFFEItems` returns them. */
interface PriceLine extends OverviewLine {
  name?: string | null;
  unit?: string | null;
  trade_price_cents?: number | null;
  purchase_order_id?: string | null;
  product?: { name?: string | null } | null;
}

type Tool =
  | { kind: "labor"; placeId: string; line: PriceLine }
  | { kind: "allowance"; placeId: string; line: PriceLine };

interface Removal {
  key: string;
  selectionId: string;
  name: string;
  quantity: number;
  placeName: string;
  /** Resolves true once archived, false when the server refused. */
  archived: Promise<boolean>;
}

/** `Bedroom · $2,835 priced · ~$6,100 roughed`, as the overview counts it. */
export function priceSummary(label: string, tally: OverviewTally): string {
  const parts: string[] = [];
  if (tally.pricedCents > 0) parts.push(`${fmtUsd(tally.pricedCents)} priced`);
  if (tally.roughedCents > 0)
    parts.push(`~${fmtUsd(tally.roughedCents)} roughed`);
  if (tally.releasedCents > 0)
    parts.push(`${fmtUsd(tally.releasedCents)} released`);
  if (parts.length === 0) parts.push("nothing priced yet");
  return [label, ...parts].join(" · ");
}

function lineName(line: PriceLine): string {
  return line.name?.trim() || "Unnamed line";
}

function lineUnit(line: { unit?: string | null }): FfeLineUnit {
  return (ROUGH_IN_UNITS as readonly string[]).includes(line.unit ?? "")
    ? (line.unit as FfeLineUnit)
    : "each";
}

function errorText(cause: unknown): string | null {
  return cause instanceof Error && cause.message ? cause.message : null;
}

function newKey(prefix: string): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${prefix}-${Date.now()}-${Math.random()}`
  );
}

/** Each labor line follows its piece; one whose piece is elsewhere keeps its place. */
function orderWithLabor(lines: PriceLine[]): PriceLine[] {
  const ids = new Set(lines.map((line) => line.id));
  const children = new Map<string, PriceLine[]>();
  for (const line of lines) {
    const parent = line.parent_ffe_item_id;
    if (!isLaborLine(line) || !parent || !ids.has(parent)) continue;
    children.set(parent, [...(children.get(parent) ?? []), line]);
  }
  const ordered: PriceLine[] = [];
  for (const line of lines) {
    const parent = line.parent_ffe_item_id;
    if (isLaborLine(line) && parent && ids.has(parent)) continue;
    ordered.push(line, ...(children.get(line.id) ?? []));
  }
  return ordered;
}

export function PriceLens(props: PriceLensProps) {
  if (!props.canSeeMoney) return null;
  return <PriceSheet {...props} />;
}

function PriceSheet({ docId, projectId, room }: PriceLensProps) {
  const { data: lineData } = useProjectFFEItems(projectId);
  const { data: placementData } = useProjectRoomPlacements(projectId);
  const { data: roomRows } = useDocumentRooms(projectId);
  const { data: resolution } = useDocumentEngagement(docId);
  const commercials = useSetFfeLineCommercials({ errorSurface: "inline" });
  const laborPrice = useSetLaborLinePrice();
  const archive = useArchiveProjectSelection();
  const restore = useRestoreProjectSelection();
  const assign = useAssignLineRoom(projectId);

  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const jobActive =
    resolution?.kind === "engagement" &&
    resolution.row.project_status === "active";

  const rooms = useMemo(
    () => (roomRows ?? []).map((r) => ({ id: r.id, name: r.name })),
    [roomRows],
  );
  const lines = useMemo(
    () =>
      liveBuildRoomLines(lineData as unknown as PriceLine[] | undefined).filter(
        (line) => !hidden.has(line.id),
      ),
    [lineData, hidden],
  );
  const byId = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  const placements = useMemo(
    () => (placementData ?? []) as FfeRoomPlacement[],
    [placementData],
  );
  const placementsByLine = useMemo(() => {
    const map = new Map<string, FfeRoomPlacement[]>();
    for (const p of placements)
      map.set(p.ffeItemId, [...(map.get(p.ffeItemId) ?? []), p]);
    return map;
  }, [placements]);

  const job = useMemo(() => deriveOverviewJob(lines), [lines]);
  const places = useMemo(
    () => deriveOverviewRows(lines, placements, rooms),
    [lines, placements, rooms],
  );

  // A removed line stays hidden only until the server stops returning it.
  useEffect(() => {
    if (!lineData || hidden.size === 0) return;
    const served = new Set(
      (lineData as unknown as PriceLine[]).map((line) => line.id),
    );
    if ([...hidden].some((id) => !served.has(id)))
      setHidden((set) => new Set([...set].filter((id) => served.has(id))));
  }, [lineData, hidden]);

  if (room === REMOVED_PLACE) {
    return (
      <p className="max-w-[56ch] py-6 font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink)]">
        Removed lines carry no price. Put one back in Rough in to price it.
      </p>
    );
  }

  const shown =
    room == null
      ? places.filter((place) => place.lineIds.length > 0)
      : places.filter(
          (place) => place.key === room && place.lineIds.length > 0,
        );

  function rowFor(line: PriceLine, placeKey: string): PriceRow {
    const labor = isLaborLine(line);
    const tradeScope = line.trade_scope_document_id != null;
    const stamp = deriveLineStamp({
      ...(line as unknown as LineStampRow),
      stage: lineStageInputFromRow(line, laborPiece(line, lines)),
    }).kind;
    const released =
      overviewStage(line, lines) === "released" ||
      line.purchase_order_id != null;
    const onOrder =
      line.purchase_order_id != null || ORDERED_ON.has(line.status ?? "");
    const clientCents = line.unit_price_cents ?? null;
    const allowanceCents =
      line.item_type === "allowance" && (line.budget_max_cents ?? 0) > 0
        ? (line.budget_max_cents ?? null)
        : null;
    const priced = (clientCents ?? 0) > 0 || allowanceCents != null;

    const gates: PriceRow["gates"] = {};
    if (tradeScope) {
      gates.labor =
        gates.allowance =
        gates.move =
        gates.remove =
          TRADE_SCOPE_REASON;
    } else {
      const pieceGate = labor
        ? LABOR_LABOR_REASON
        : laborGate({ ...line, name: lineName(line) });
      if (pieceGate) gates.labor = pieceGate;
      if (labor) gates.allowance = LABOR_ALLOWANCE_REASON;
      else if (released) gates.allowance = RELEASED_DRAG_REASON;
      if (released) gates.remove = RELEASED_DRAG_REASON;
    }

    const linePlacements = placementsByLine.get(line.id) ?? [];
    const label = lineStampLabel(stamp);
    return {
      id: line.id,
      name: lineName(line),
      productName: line.product?.name ?? null,
      quantity: line.quantity ?? 0,
      unit: line.unit,
      tradeCents: line.trade_price_cents ?? null,
      clientCents,
      allowanceCents,
      roughCents: priced ? null : (line.rough_cents ?? null),
      // A ready line needs nothing here; every other word says where it stands.
      stamp: stamp === "ready" || !label ? null : { kind: stamp, label },
      labor,
      alsoIn:
        linePlacements.length > 0 && rooms.some((r) => r.id === placeKey) ? (
          <AlsoInLine
            placements={linePlacements}
            rooms={rooms}
            hereRoomId={placeKey}
            unit={line.unit}
          />
        ) : null,
      tradeEditable: !tradeScope && !onOrder,
      clientEditable: labor && !tradeScope && !released,
      gates,
    };
  }

  function setTradeCost(row: PriceRow, cents: number) {
    setNotice(null);
    commercials.mutate(
      { projectId, itemId: row.id, tradePriceCents: cents },
      {
        onError: (cause) =>
          setNotice(
            errorText(cause) ??
              `The trade cost on ${row.name} was not saved. Try again.`,
          ),
      },
    );
  }

  function setClientPrice(row: PriceRow, cents: number) {
    setNotice(null);
    laborPrice.mutate(
      { projectId, itemId: row.id, unitPriceCents: cents },
      {
        onError: (cause) =>
          setNotice(
            errorText(cause) ??
              `The client price on ${row.name} was not saved. Try again.`,
          ),
      },
    );
  }

  function moveLine(row: PriceRow, roomId: string) {
    setNotice(null);
    assign.mutate({ itemId: row.id, roomId, assignmentScope: "room" });
  }

  function removeLine(row: PriceRow, placeName: string) {
    if (!byId.has(row.id)) return;
    setNotice(null);
    setHidden((set) => new Set(set).add(row.id));
    // The reason is left to the server: it defaults while building, and asks
    // for one only when the client has seen the line in a review (00731).
    const archived = archive
      .mutateAsync({ projectId, selectionId: row.id, reason: "" })
      .then(
        () => true,
        (cause: unknown) => {
          setHidden((set) => {
            const next = new Set(set);
            next.delete(row.id);
            return next;
          });
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
      placeName,
      archived,
    });
  }

  async function undoRemoval(target: Removal) {
    setRemoval(null);
    if (!(await target.archived)) return;
    try {
      await restore.mutateAsync({ projectId, selectionId: target.selectionId });
      setHidden((set) => {
        const next = new Set(set);
        next.delete(target.selectionId);
        return next;
      });
    } catch (cause) {
      setNotice(
        errorText(cause) ??
          `${target.name} was not put back. It is under Removed in the rail.`,
      );
    }
  }

  const shownNotice =
    notice ??
    (assign.isError
      ? "The move did not save. Use Move to room… to try again."
      : null);

  return (
    <div data-price-lens="" className="py-6">
      <p className="mb-3 font-sans text-[16px] leading-[1.5] tabular-nums text-[var(--sheet-ink)]">
        {priceSummary("Job", job)}
      </p>
      {jobActive ? (
        <p className="mb-6 max-w-[72ch] font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink-muted)]">
          {ACTIVE_JOB_SENTENCE}
        </p>
      ) : null}

      {lineData && shown.length === 0 ? (
        <p className="max-w-[56ch] font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink)]">
          No lines here yet. Add them in Rough in, then price them here.
        </p>
      ) : null}

      <div className="overflow-x-auto max-md:overflow-visible">
        {shown.map((place) => {
          const placeLines = orderWithLabor(
            place.lineIds
              .map((id) => byId.get(id))
              .filter((l): l is PriceLine => !!l),
          );
          return (
            <div key={place.key}>
              <PriceTable
                room={{ id: place.key, name: place.name }}
                rooms={rooms}
                rows={placeLines.map((line) => rowFor(line, place.key))}
                subtotal={priceSummary(place.name, place.tally)}
                onTradeCost={setTradeCost}
                onClientPrice={setClientPrice}
                onAddLabor={(row) => {
                  const line = byId.get(row.id);
                  if (line)
                    setTool({ kind: "labor", placeId: place.key, line });
                }}
                onAllowance={(row) => {
                  const line = byId.get(row.id);
                  if (line)
                    setTool({ kind: "allowance", placeId: place.key, line });
                }}
                onMove={moveLine}
                onRemove={(row) => removeLine(row, place.name)}
              />
              {tool && tool.placeId === place.key ? (
                tool.kind === "labor" ? (
                  <LaborForm
                    key={tool.line.id}
                    projectId={projectId}
                    piece={tool.line}
                    onDone={() => setTool(null)}
                  />
                ) : (
                  <AllowanceForm
                    key={tool.line.id}
                    projectId={projectId}
                    line={tool.line}
                    onDone={() => setTool(null)}
                  />
                )
              ) : null}
            </div>
          );
        })}
      </div>

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
    </div>
  );
}

function ToolFrame({
  heading,
  onSubmit,
  onClose,
  children,
}: {
  heading: string;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };
  return (
    <form
      aria-label={heading}
      onSubmit={onSubmit}
      onKeyDown={onKeyDown}
      className="mb-12 max-w-[720px] border border-[var(--sheet-rule-strong)] bg-[var(--sheet)] p-6"
    >
      <h3 className={cn(LABEL, "mb-3")}>{heading}</h3>
      {children}
    </form>
  );
}

/** `Add labor`: a labor line under its piece, with its own unit and client price (S4, a7). */
function LaborForm({
  projectId,
  piece,
  onDone,
}: {
  projectId: string;
  piece: PriceLine;
  onDone: () => void;
}) {
  const addLabor = useAddLaborLine();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(
    String(piece.quantity && piece.quantity > 0 ? piece.quantity : 1),
  );
  const [unit, setUnit] = useState<FfeLineUnit>(lineUnit(piece));
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (addLabor.isPending) return;
    const trimmed = name.trim();
    if (!trimmed) return setError("A labor line needs a name.");
    const count = parseQuantity(quantity);
    if (count === undefined)
      return setError("Quantity is a whole number above 0.");
    const cents = parseRough(price);
    if (cents === undefined)
      return setError("Client price is an amount in dollars, like 85.");
    setError(null);
    addLabor
      .mutateAsync({
        projectId,
        parentItemId: piece.id,
        name: trimmed,
        quantity: count,
        unit,
        ...(cents != null && cents > 0 ? { unitPriceCents: cents } : {}),
      })
      .then(onDone)
      .catch((cause: unknown) =>
        setError(errorText(cause) ?? "The labor line was not added."),
      );
  };

  return (
    <ToolFrame
      heading={`Add labor to ${lineName(piece)}`}
      onSubmit={submit}
      onClose={onDone}
    >
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Labor</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Install, wallpaper hanger"
            className={cn(INPUT, "w-[260px] max-md:w-full")}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Qty</span>
          <input
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={cn(INPUT, "w-[72px] tabular-nums")}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Unit</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as FfeLineUnit)}
            className={INPUT}
          >
            {ROUGH_IN_UNITS.map((u) => (
              <option key={u} value={u}>
                {unitLabel(u)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>
            Client price {unit === "each" ? "each" : `/ ${unitWord(unit)}`}
          </span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={cn(INPUT, "w-[120px] tabular-nums")}
          />
        </label>
        <button
          type="submit"
          aria-busy={addLabor.isPending || undefined}
          className={cn(ACT, "text-[var(--sheet-ink)]")}
        >
          Add the labor line
        </button>
        <button
          type="button"
          onClick={onDone}
          className={cn(ACT, "text-[var(--sheet-ink-muted)]")}
        >
          Put back
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-2 font-sans text-[14px] text-[var(--sheet-ink)]"
        >
          {error}
        </p>
      ) : null}
    </ToolFrame>
  );
}

/**
 * `Make it an allowance` (00743). The ceiling is typed per unit, as designers
 * think of rolls and square feet, and sent as the line total (per unit ×
 * quantity), which is what the server reads (00744 step 10). Rough $ stays
 * internal.
 */
function AllowanceForm({
  projectId,
  line,
  onDone,
}: {
  projectId: string;
  line: PriceLine;
  onDone: () => void;
}) {
  const makeAllowance = useMakeFfeLineAllowance();
  const units = Math.max(1, line.quantity ?? 0);
  const start =
    line.item_type === "allowance" && (line.budget_max_cents ?? 0) > 0
      ? Math.round((line.budget_max_cents ?? 0) / units)
      : (line.unit_price_cents ?? 0) > 0
        ? (line.unit_price_cents ?? 0)
        : null;
  const [ceiling, setCeiling] = useState(start ? String(start / 100) : "");
  const [error, setError] = useState<string | null>(null);
  const unit = lineUnit(line);
  const perUnit = parseRough(ceiling);
  const lineCents = perUnit != null && perUnit > 0 ? perUnit * units : null;
  const lineTotalId = `${useId()}-line-total`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (makeAllowance.isPending) return;
    if (lineCents == null)
      return setError("An allowance needs a ceiling above $0.");
    setError(null);
    makeAllowance
      .mutateAsync({ projectId, itemId: line.id, budgetMaxCents: lineCents })
      .then(onDone)
      .catch((cause: unknown) =>
        setError(errorText(cause) ?? "The allowance was not saved."),
      );
  };

  return (
    <ToolFrame
      heading={`Make ${lineName(line)} an allowance`}
      onSubmit={submit}
      onClose={onDone}
    >
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>
            Ceiling {unit === "each" ? "each" : `/ ${unitWord(unit)}`}
          </span>
          <input
            autoFocus
            inputMode="decimal"
            value={ceiling}
            onChange={(e) => setCeiling(e.target.value)}
            aria-describedby={lineCents != null ? lineTotalId : undefined}
            className={cn(INPUT, "w-[160px] tabular-nums")}
          />
        </label>
        {lineCents != null ? (
          <p
            id={lineTotalId}
            className="flex h-11 items-center font-sans text-[14px] tabular-nums text-[var(--sheet-ink)]"
          >
            {`Up to ${money(lineCents)} for the line`}
          </p>
        ) : null}
        <button
          type="submit"
          aria-busy={makeAllowance.isPending || undefined}
          className={cn(ACT, "text-[var(--sheet-ink)]")}
        >
          Make it an allowance
        </button>
        <button
          type="button"
          onClick={onDone}
          className={cn(ACT, "text-[var(--sheet-ink-muted)]")}
        >
          Put back
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-2 font-sans text-[14px] text-[var(--sheet-ink)]"
        >
          {error}
        </p>
      ) : null}
    </ToolFrame>
  );
}
