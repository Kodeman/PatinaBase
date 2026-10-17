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
 * US-37 #4 (contract D4, 00809): every open line is priced two ways through
 * the one writer `set_ffe_line_pricing`: type the markup or the unit client
 * price, and the other follows from the cost. Quantity, unit cost and retail
 * go the same way. The job summary above the tables (docked at 390) is
 * `summarizeJob` over every live line, with each committed figure applied at
 * once, so the blend and the gap move on every commit. A cost that moved
 * under a price is settled with `resolve_ffe_cost_change`; the resets are
 * `reset_ffe_line_markup` and `reset_project_markups`. A freight, delivery or
 * install line is a named line (`create_named_project_need`) given its kind
 * (`set_ffe_line_kind`). A refused write prints the server's sentence on its
 * line, verbatim.
 *
 * Labor keeps its writers: trade cost through `set_project_ffe_line_commercials`
 * (00692), its own client price through `set_labor_line_price` (00737) until
 * released (ruling F1). A released line's figures print; its trade cost is
 * still typed through 00692 until it is ordered. `Make it an allowance` goes
 * through `make_ffe_line_allowance` (00743).
 *
 * The lens is absent for a seat without money (R1, Q7).
 */
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  useAddLaborLine,
  useArchiveProjectSelection,
  useCreateNamedProjectNeed,
  useMakeFfeLineAllowance,
  usePricingSettings,
  useProjectFFEItems,
  useProjectPricing,
  useProjectPricingApproval,
  useProjectRoomPlacements,
  useRemovedProjectLines,
  useResetFfeLineMarkup,
  useResetProjectMarkups,
  useResolveFfeCostChange,
  useRestoreProjectSelection,
  useSetFfeLineCommercials,
  useSetFfeLineKind,
  useSetFfeLinePricing,
  useSetLaborLinePrice,
  useSetProjectPricing,
} from "@patina/supabase";
import type {
  FfeCostChangeResolution,
  FfeLinePricingField,
  FfeLineUnit,
  FfeRoomPlacement,
} from "@patina/types";
import { cn } from "@/lib/utils";
import {
  clientFromMarkup,
  lineTotal,
  retailWarning,
  summarizeJob,
  type PricingLine,
} from "@/lib/document/trade-pricing";
import { fmtUsd } from "@/lib/document/format";
import {
  useAssignLineRoom,
  useDocumentRooms,
} from "@/hooks/use-document-rooms";
import { useDocumentEngagement } from "@/hooks/use-document-state";
import {
  REMOVED_PLACE,
  THROUGHOUT_PLACE,
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
import {
  moveFailureText,
  RELEASED_DRAG_REASON,
  settleMove,
} from "@/lib/document/pieces/use-row-drag";
import {
  focusPlace,
  holdsFocus,
  inPlace,
  neighborLineId,
} from "@/lib/document/pieces/sheet-focus";
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
import {
  ADDED_KINDS,
  PriceActs,
  PriceSummary,
  summarySentence,
  type AddedLineKind,
} from "./price-summary";
import {
  approvedFiguresFor,
  PricingChangeLog,
  RemovedSinceApproval,
} from "./price-approval";
import { UndoToast } from "./undo-toast";
import {
  FOCUS_FFE_LINE_EVENT,
  focusFfeLinePending,
  parkedInvoiceComposer,
  subscribeParkedInvoiceComposers,
  type FocusFfeLineRequest,
} from "@/lib/document/registry";
import { openInvoiceComposer } from "../accounts/invoice-overlays";

export interface PriceLensProps {
  docId: string;
  projectId: string;
  room: BuildRoomPlace;
  canSeeMoney: boolean;
}

/** a7 as D19 leaves it (US-37 #4): open lines are priced here; released ones are not. */
export const ACTIVE_JOB_SENTENCE =
  "This job is active. Released lines change through Record a change; their trade cost can still be typed until they are ordered.";

const TRADE_SCOPE_REASON = "Trade Scope lines change in their scope.";
const LABOR_LABOR_REASON = "A labor line takes no labor of its own.";
const LABOR_ALLOWANCE_REASON = "Labor can't be an allowance.";
const LABOR_RESET_REASON = "Labor lines are priced with the labor price.";
const NO_COST_RESET_REASON = "Add the cost before resetting the markup.";
const REASON_REFUSAL = "archive reason must be at least 5 characters";

/** A typed figure, shown at once and until the server's line answers it. */
interface PendingFigure {
  field: FfeLinePricingField;
  value: number | null;
  /** The line as it stood when the figure was typed. */
  stamp: string;
}

function lineStamp(line: PriceLine): string {
  return [
    line.updated_at,
    line.unit_price_cents,
    line.trade_price_cents,
    line.quantity,
    line.retail_unit_cents,
  ].join("|");
}

/** The line with its typed figure applied, as set_ffe_line_pricing will write it. */
function withPending(line: PriceLine, pending: PendingFigure | undefined): PriceLine {
  if (!pending) return line;
  const { field, value } = pending;
  if (field === "quantity") return { ...line, quantity: value ?? line.quantity };
  if (field === "retail_unit_cents") return { ...line, retail_unit_cents: value };
  if (field === "unit_cost_cents") return { ...line, trade_price_cents: value };
  if (field === "unit_client_price_cents")
    return { ...line, unit_price_cents: value, price_basis: "client" };
  // markup_percent: the client price follows from the cost; the cost never moves.
  const cost = line.trade_price_cents ?? 0;
  return cost > 0 && value != null
    ? {
        ...line,
        unit_price_cents: clientFromMarkup(cost, value),
        price_basis: "markup",
      }
    : line;
}

const positive = (cents: number | null | undefined): cents is number =>
  cents != null && cents > 0;

/**
 * The line's unit client price, or null when it has none. A 0 is the
 * column's default, so it is a price only once one was set (`price_basis`,
 * 00809): a −100% markup is priced at $0, a new line is not priced.
 */
function clientPriceOf(line: PriceLine): number | null {
  const cents = line.unit_price_cents ?? null;
  return cents != null && (cents > 0 || line.price_basis != null) ? cents : null;
}

function allowanceCeiling(line: PriceLine): number | null {
  return line.item_type === "allowance" && positive(line.budget_max_cents)
    ? line.budget_max_cents
    : null;
}

/**
 * One line as `summarizeJob` reads it, per unit. A cost of 0 reads as none; a
 * client price of 0 is a price once one was set (`clientPriceOf`). An
 * allowance counts at its ceiling exactly, so it goes in as one unit carrying
 * the line's totals: a ceiling split per unit and multiplied back would drift
 * by the rounding.
 */
export function pricingLineOf(line: PriceLine): PricingLine {
  const quantity = line.quantity ?? 0;
  const ceiling = allowanceCeiling(line);
  const cost = positive(line.trade_price_cents) ? line.trade_price_cents : null;
  const kind =
    line.line_kind === "goods" || !line.line_kind
      ? "product"
      : (line.line_kind as PricingLine["kind"]);
  if (ceiling != null) {
    return {
      kind,
      quantity: 1,
      unitCostCents: cost == null ? null : cost * quantity,
      unitClientCents: ceiling,
      retailUnitCents: null,
    };
  }
  return {
    kind,
    quantity,
    unitCostCents: cost,
    unitClientCents: clientPriceOf(line),
    retailUnitCents: line.retail_unit_cents ?? null,
  };
}

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
  /** 00809, studio-only. */
  retail_unit_cents?: number | null;
  /** The field edited last; null on a line never priced. */
  price_basis?: string | null;
  pending_cost_prev_cents?: number | null;
  pending_cost_changed_at?: string | null;
  pending_markup_held_percent?: number | null;
  updated_at?: string | null;
  /** ISO 4217 code of the line's prices (00661, USD by default). */
  currency?: string | null;
  /** The item label (00808). */
  doc_code?: string | null;
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
  placeId: string;
  /** The line now in its place, for focus once the toast runs out. */
  neighborId: string | null;
  /** Resolves true once archived, false when the server refused. */
  archived: Promise<boolean>;
}

/** Where focus goes once the sheet holds it (T-60a F5, F6, F7). */
interface FocusRequest {
  /** The line to focus; null for its place's heading alone. */
  lineId: string | null;
  /** The place the line should sit in; its heading holds focus meanwhile. */
  placeId: string | null;
  /** The line's `⋯`, its allowance cell, its name (a new labor line), its
   *  cost (a new freight line) or its client price (the composer's Price it). */
  target?: "act" | "allowance" | "name" | "cost" | "price";
  /** Wait for a line the sheet does not hold yet (a new or restored line). */
  expect?: boolean;
  at: number;
}

/** How long a request waits for the server to return its line. */
const FOCUS_WAIT_MS = 10_000;

const FOCUS_TARGET = {
  act: 'button[aria-haspopup="menu"]',
  allowance: "[data-allowance-cell]",
  name: "[data-line-name]",
  cost: "[data-cost-input]",
  // The typeable client price, or the printed one where none can be typed.
  price: 'input[aria-label^="Unit client price"], [data-allowance-cell]',
} as const;

function priceSection(root: HTMLElement | null, placeId: string) {
  return Array.from(root?.querySelectorAll("[data-price-room]") ?? []).find(
    (el) => el.getAttribute("data-price-room") === placeId,
  );
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
  const { data: lineData, isFetching: linesFetching } =
    useProjectFFEItems(projectId);
  const { data: placementData } = useProjectRoomPlacements(projectId);
  const { data: roomRows } = useDocumentRooms(projectId);
  const { data: resolution } = useDocumentEngagement(docId);
  const commercials = useSetFfeLineCommercials({ errorSurface: "inline" });
  const laborPrice = useSetLaborLinePrice();
  const linePricing = useSetFfeLinePricing();
  const lineKind = useSetFfeLineKind();
  const resolveCost = useResolveFfeCostChange();
  const resetLine = useResetFfeLineMarkup();
  const resetAll = useResetProjectMarkups();
  const createLine = useCreateNamedProjectNeed();
  const { data: projectPricing, isFetching: pricingFetching } =
    useProjectPricing(projectId);
  const setProjectPricing = useSetProjectPricing();
  const { data: myPricing } = usePricingSettings();
  const { data: approval } = useProjectPricingApproval(projectId);
  const archive = useArchiveProjectSelection();
  const restore = useRestoreProjectSelection();
  const assign = useAssignLineRoom(projectId);

  const [pending, setPending] = useState<ReadonlyMap<string, PendingFigure>>(
    new Map(),
  );
  /** The server's sentence for each line's last refused write. */
  const [lineNotes, setLineNotes] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [summaryNote, setSummaryNote] = useState<string | null>(null);
  const [adding, setAdding] = useState<AddedLineKind | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  /** The change log in view: one line's, or the job's (itemId null). */
  const [changeLog, setChangeLog] = useState<{
    itemId: string | null;
    name: string | null;
  } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const requestFocus = (request: Omit<FocusRequest, "at">) =>
    setFocusRequest({ ...request, at: Date.now() });

  const jobActive =
    resolution?.kind === "engagement" &&
    resolution.row.project_status === "active";

  const rooms = useMemo(
    () => (roomRows ?? []).map((r) => ({ id: r.id, name: r.name })),
    [roomRows],
  );
  const servedLines = useMemo(
    () =>
      liveBuildRoomLines(lineData as unknown as PriceLine[] | undefined).filter(
        (line) => !hidden.has(line.id),
      ),
    [lineData, hidden],
  );
  const lines = useMemo(
    () => servedLines.map((line) => withPending(line, pending.get(line.id))),
    [servedLines, pending],
  );

  // A typed figure gives way once the server's line has moved past it.
  useEffect(() => {
    if (!lineData || pending.size === 0) return;
    const served = new Map(
      (lineData as unknown as PriceLine[]).map((line) => [line.id, line]),
    );
    const settled = [...pending].filter(([id, figure]) => {
      const line = served.get(id);
      return !line || lineStamp(line) !== figure.stamp;
    });
    if (settled.length === 0) return;
    setPending((map) => {
      const next = new Map(map);
      for (const [id] of settled) next.delete(id);
      return next;
    });
  }, [lineData, pending]);

  const jobTargets = useMemo(
    () => ({
      targetMarkupPct:
        projectPricing?.markupTargetPercent ??
        myPricing?.defaultMarkupPercent ??
        35,
      salesTaxRate: projectPricing?.salesTaxRate ?? null,
    }),
    [projectPricing, myPricing],
  );
  const summary = useMemo(
    () => summarizeJob(lines.map(pricingLineOf), jobTargets),
    [lines, jobTargets],
  );
  // Each successful write speaks the summary once, on the one status line
  // (SQ-1171), after the figures it changed come back: its hook has already
  // started that refetch, so the write waits until neither the lines nor the
  // job's pricing is fetching (SQ-1183). It speaks only if the summary moved
  // past what it read before the write; otherwise it lapses.
  const [summaryDue, setSummaryDue] = useState<readonly string[]>([]);
  const spokenSummary = summarySentence(summary, jobTargets.salesTaxRate);
  const figuresFetching = linesFetching || pricingFetching;
  useEffect(() => {
    if (summaryDue.length === 0 || figuresFetching) return;
    setSummaryDue([]);
    if (summaryDue.some((before) => before !== spokenSummary))
      setAnnouncement(spokenSummary);
  }, [summaryDue, spokenSummary, figuresFetching]);
  const byId =useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  const approvedById = useMemo(
    () => new Map((approval?.lines ?? []).map((l) => [l.itemId, l])),
    [approval],
  );
  const lineNames = useMemo(
    () => new Map(lines.map((l) => [l.id, lineName(l)])),
    [lines],
  );
  // The current lines' client total in each currency, partitioned as the
  // approved totals are: a total is never compared across currencies (R188).
  const currentTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const line of lines) {
      const { unitClientCents, quantity } = pricingLineOf(line);
      if (unitClientCents === null) continue;
      const currency = line.currency ?? "USD";
      totals.set(
        currency,
        (totals.get(currency) ?? 0) + lineTotal(unitClientCents, quantity),
      );
    }
    return totals;
  }, [lines]);
  // Approved lines no longer on the job; their names are read from the
  // removed lines only while there are some.
  const approvedGone = useMemo(
    () => (approval?.lines ?? []).filter((l) => !byId.has(l.itemId)),
    [approval, byId],
  );
  const { data: removedRows } = useRemovedProjectLines(
    approvedGone.length > 0 ? projectId : "",
  );
  const removedApproved = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of [...(lineData ?? []), ...(removedRows ?? [])])
      names.set(row.id, lineName(row as unknown as PriceLine));
    return approvedGone.map((l) => ({
      itemId: l.itemId,
      name: names.get(l.itemId) ?? "A removed line",
      lineTotalCents: l.approvedLineTotalCents,
      currency: l.currency,
    }));
  }, [approvedGone, lineData, removedRows]);
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

  // A new, restored or moved line lands once the server returns it; its room
  // heading holds focus meanwhile, so focus never drops to the page.
  useEffect(() => {
    if (!focusRequest) return;
    const root = sheetRef.current;
    const { lineId, placeId, target = "act", expect, at } = focusRequest;
    const row = lineId
      ? Array.from(
          root?.querySelectorAll<HTMLElement>("[data-line-id]") ?? [],
        ).find(
          (el) =>
            el.getAttribute("data-line-id") === lineId &&
            inPlace(el, "data-price-room", placeId),
        )
      : undefined;
    const goal = row?.querySelector<HTMLElement>(FOCUS_TARGET[target]);
    if (goal) {
      goal.focus();
      setFocusRequest(null);
      return;
    }
    if (!holdsFocus(root)) focusPlace(root, placeId);
    const waiting =
      lineId !== null &&
      (byId.has(lineId) || expect) &&
      Date.now() - at < FOCUS_WAIT_MS;
    if (!waiting) setFocusRequest(null);
  }, [focusRequest, lines, byId]);

  // K7 — the invoice composer's Price it lands on the line's client price.
  // A request made before this lens mounted waits in `focusFfeLinePending`.
  useEffect(() => {
    const land = (request: Partial<FocusFfeLineRequest> | null | undefined) => {
      if (request?.cell !== "price" || !request.itemId) return false;
      if (focusFfeLinePending.request?.cell === "price")
        focusFfeLinePending.request = null;
      setFocusRequest({
        lineId: request.itemId,
        placeId: null,
        target: "price",
        expect: true,
        at: Date.now(),
      });
      return true;
    };
    const onFocusLine = (event: Event) => {
      const detail = (event as CustomEvent<Partial<FocusFfeLineRequest>>)
        .detail;
      if (land(detail)) event.preventDefault();
    };
    window.addEventListener(FOCUS_FFE_LINE_EVENT, onFocusLine);
    land(focusFfeLinePending.request);
    return () => window.removeEventListener(FOCUS_FFE_LINE_EVENT, onFocusLine);
  }, []);

  // `Back to the invoice` stands while this job's composer is parked. A
  // composer put away from it un-parks, and the act goes; focus it held
  // falls to the room's heading, never to the page.
  const composerParked = useSyncExternalStore(
    subscribeParkedInvoiceComposers,
    () => parkedInvoiceComposer(projectId) !== null,
    () => false,
  );
  const backHeldFocus = useRef(false);
  useEffect(() => {
    if (composerParked) return;
    const dropped =
      !document.activeElement || document.activeElement === document.body;
    if (backHeldFocus.current && dropped) focusPlace(sheetRef.current, null);
    backHeldFocus.current = false;
  }, [composerParked]);

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
    const clientCents = clientPriceOf(line);
    const allowanceCents =
      line.item_type === "allowance" && (line.budget_max_cents ?? 0) > 0
        ? (line.budget_max_cents ?? null)
        : null;
    const priced = clientCents != null || allowanceCents != null;

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

    if (labor) gates.reset = LABOR_RESET_REASON;
    else if (tradeScope) gates.reset = TRADE_SCOPE_REASON;
    else if (released) gates.reset = RELEASED_DRAG_REASON;
    else if (!positive(line.trade_price_cents))
      gates.reset = NO_COST_RESET_REASON;

    const pricingEditable = !labor && !tradeScope && !released;
    const linePlacements = placementsByLine.get(line.id) ?? [];
    const label = lineStampLabel(stamp);
    const pricing = pricingLineOf(line);
    const quantity = line.quantity ?? 0;
    const approved = approvedFiguresFor(approvedById.get(line.id), {
      unitClientCents: clientCents,
      quantity,
      lineTotalCents:
        allowanceCents ?? (clientCents != null ? clientCents * quantity : null),
    });
    return {
      id: line.id,
      name: lineName(line),
      label: line.doc_code ?? null,
      productName: line.product?.name ?? null,
      quantity,
      unit: line.unit,
      tradeCents: line.trade_price_cents ?? null,
      clientCents,
      retailCents: line.retail_unit_cents ?? null,
      allowanceCents,
      roughCents: priced ? null : (line.rough_cents ?? null),
      pricingEditable,
      aboveRetail: allowanceCents == null && retailWarning(pricing),
      costChange:
        line.pending_cost_prev_cents != null
          ? {
              prevCents: line.pending_cost_prev_cents,
              heldMarkupPct: line.pending_markup_held_percent ?? null,
            }
          : null,
      note: lineNotes.get(line.id) ?? null,
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
      clientEditable: !tradeScope && !released,
      gates,
      approved,
    };
  }

  function noteLine(lineId: string, text: string | null) {
    setLineNotes((map) => {
      if (text === null && !map.has(lineId)) return map;
      const next = new Map(map);
      if (text === null) next.delete(lineId);
      else next.set(lineId, text);
      return next;
    });
  }

  function dropPending(lineId: string) {
    setPending((map) => {
      if (!map.has(lineId)) return map;
      const next = new Map(map);
      next.delete(lineId);
      return next;
    });
  }

  /** A write's success hook: its summary is spoken once its refetch lands (SQ-1171). */
  function speakSummaryOnSuccess() {
    // Read from the server's figures alone. TanStack calls a writer's
    // per-call onSuccess for its latest call only, so a figure typed just
    // before on the same writer must still count as a move.
    const before = summarySentence(
      summarizeJob(servedLines.map(pricingLineOf), jobTargets),
      jobTargets.salesTaxRate,
    );
    return () => setSummaryDue((due) => [...due, before]);
  }

  /** A refused write: its figure goes, and the server's sentence stays on the line. */
  function refused(row: PriceRow, fallback: string) {
    return (cause: unknown) => {
      dropPending(row.id);
      noteLine(row.id, errorText(cause) ?? fallback);
    };
  }

  /**
   * One typed figure. Labor keeps its own writers, and so does a released
   * line's trade cost (00692, until ordered); every other figure goes through
   * set_ffe_line_pricing, shown at once until the server's line answers.
   */
  function setPricing(
    row: PriceRow,
    field: FfeLinePricingField,
    value: number | null,
  ) {
    setNotice(null);
    noteLine(row.id, null);
    const onSuccess = speakSummaryOnSuccess();
    const fallback = `The price on ${row.name} was not saved. Try again.`;
    if (field === "unit_cost_cents" && !row.pricingEditable) {
      commercials.mutate(
        { projectId, itemId: row.id, tradePriceCents: value ?? 0 },
        {
          onSuccess,
          onError: refused(row, `The trade cost on ${row.name} was not saved. Try again.`),
        },
      );
      return;
    }
    if (field === "unit_client_price_cents" && row.labor) {
      laborPrice.mutate(
        { projectId, itemId: row.id, unitPriceCents: value ?? 0 },
        {
          onSuccess,
          onError: refused(row, `The client price on ${row.name} was not saved. Try again.`),
        },
      );
      return;
    }
    const served = (lineData as unknown as PriceLine[] | undefined)?.find(
      (line) => line.id === row.id,
    );
    if (served) {
      setPending((map) =>
        new Map(map).set(row.id, { field, value, stamp: lineStamp(served) }),
      );
    }
    linePricing.mutate(
      { projectId, itemId: row.id, field, value },
      { onSuccess, onError: refused(row, fallback) },
    );
  }

  function settleCost(row: PriceRow, resolution: FfeCostChangeResolution) {
    noteLine(row.id, null);
    resolveCost.mutate(
      { projectId, itemId: row.id, resolution },
      { onError: refused(row, `The cost change on ${row.name} was not settled. Try again.`) },
    );
  }

  function resetMarkup(row: PriceRow) {
    noteLine(row.id, null);
    setSummaryDue([]);
    resetLine.mutate(
      { projectId, itemId: row.id },
      {
        onSuccess: () =>
          setAnnouncement(`${row.name} is back on its default markup.`),
        onError: refused(row, `The markup on ${row.name} was not reset. Try again.`),
      },
    );
  }

  function resetJob() {
    setSummaryNote(null);
    setSummaryDue([]);
    resetAll.mutate(
      { projectId },
      {
        onSuccess: (result) =>
          setAnnouncement(
            `${result.resetCount} ${result.resetCount === 1 ? "line is" : "lines are"} back on the default markup.${result.skippedCount > 0 ? ` ${result.skippedCount} left as they are.` : ""}`,
          ),
        onError: (cause) =>
          setSummaryNote(
            errorText(cause) ?? "The markups were not reset. Try again.",
          ),
      },
    );
  }

  function setJobPricing(
    markupTargetPercent: number | null,
    salesTaxRate: number | null,
  ) {
    setSummaryNote(null);
    setProjectPricing.mutate(
      { projectId, markupTargetPercent, salesTaxRate },
      {
        onSuccess: speakSummaryOnSuccess(),
        onError: (cause) =>
          setSummaryNote(
            errorText(cause) ?? "The job's pricing was not saved. Try again.",
          ),
      },
    );
  }

  /**
   * `Add freight` and its kin: a named line in the rail's room (Throughout
   * when the rail names none), given its kind, then its cost takes focus.
   */
  async function addKindLine(kind: AddedLineKind) {
    setSummaryNote(null);
    setAdding(kind);
    const inRoom = room != null && rooms.some((r) => r.id === room);
    const placeId = inRoom ? room : THROUGHOUT_PLACE;
    const name = ADDED_KINDS.find((k) => k.kind === kind)?.label ?? kind;
    try {
      const placed = await createLine.mutateAsync({
        projectId,
        name,
        quantity: 1,
        assignmentScope: inRoom ? "room" : "throughout",
        roomId: inRoom ? room : null,
        idempotencyKey: newKey(kind),
      });
      const selectionId = placed.selectionId;
      if (!selectionId) throw new Error(`The ${name.toLowerCase()} line was not added.`);
      await lineKind.mutateAsync({ projectId, itemId: selectionId, lineKind: kind });
      requestFocus({ lineId: selectionId, placeId, target: "cost", expect: true });
    } catch (cause) {
      setSummaryNote(
        errorText(cause) ?? `The ${name.toLowerCase()} line was not added. Try again.`,
      );
    } finally {
      setAdding(null);
    }
  }

  /**
   * `Move to room…`: said once the server answers, never before (T-60a F4).
   * Focus stays on the line in its new room, or, when one room is in view
   * and the line leaves it, goes to the row now in its place (F7).
   */
  function moveLine(row: PriceRow, roomId: string, fromPlaceId: string) {
    setNotice(null);
    const leaves = room != null && room !== roomId;
    const neighborId = leaves
      ? neighborLineId(priceSection(sheetRef.current, fromPlaceId), row.id)
      : null;
    const to = {
      id: roomId,
      name: rooms.find((r) => r.id === roomId)?.name ?? "",
    };
    void settleMove(assign, projectId, [row], to).then(
      ({ movedIds, refusal, text }) => {
        if (refusal === null) setAnnouncement(text);
        if (movedIds.length === 0) return;
        requestFocus(
          leaves
            ? { lineId: neighborId, placeId: fromPlaceId }
            : { lineId: row.id, placeId: roomId },
        );
      },
    );
  }

  /** A tool closes without acting: focus goes back to its line's `⋯` (F6). */
  function closeTool(lineId: string, placeId: string) {
    setTool(null);
    requestFocus({ lineId, placeId });
  }

  function removeLine(row: PriceRow, placeName: string, placeId: string) {
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
          // The row comes back; UNDO goes with the toast, so focus follows it.
          if (holdsFocus(document.querySelector("[data-undo-toast]")))
            requestFocus({ lineId: row.id, placeId });
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
      placeId,
      // Read before the row goes: the line that takes its place (T-60a F5).
      neighborId: neighborLineId(
        priceSection(sheetRef.current, placeId),
        row.id,
      ),
      archived,
    });
  }

  /** The toast ran out: focus moves from UNDO to the row now in its place (F5). */
  function expireRemoval(target: Removal) {
    if (holdsFocus(document.querySelector("[data-undo-toast]")))
      requestFocus({ lineId: target.neighborId, placeId: target.placeId });
    setRemoval((current) => (current?.key === target.key ? null : current));
  }

  async function undoRemoval(target: Removal) {
    setRemoval(null);
    // The room heading holds focus until the line is back (T-60a F5).
    const back = {
      lineId: target.selectionId,
      placeId: target.placeId,
      expect: true,
    };
    requestFocus(back);
    if (!(await target.archived)) return;
    try {
      await restore.mutateAsync({ projectId, selectionId: target.selectionId });
      setHidden((set) => {
        const next = new Set(set);
        next.delete(target.selectionId);
        return next;
      });
      requestFocus(back);
    } catch (cause) {
      requestFocus({ lineId: null, placeId: target.placeId });
      setNotice(
        errorText(cause) ??
          `${target.name} was not put back. It is under Removed in the rail.`,
      );
    }
  }

  const shownNotice =
    notice ?? (assign.isError ? moveFailureText(assign.error) : null);

  return (
    <div ref={sheetRef} data-price-lens="" className="flex flex-col py-6">
      {composerParked ? (
        <p className="mb-3">
          <button
            type="button"
            className={ACT}
            onFocus={() => {
              backHeldFocus.current = true;
            }}
            onBlur={(e) => {
              // Removal blurs with no next target; that focus is the one lost.
              if (e.relatedTarget) backHeldFocus.current = false;
            }}
            onClick={() => openInvoiceComposer({ projectId })}
          >
            Back to the invoice
          </button>
        </p>
      ) : null}
      <p className="mb-3 font-sans text-[16px] leading-[1.5] tabular-nums text-[var(--sheet-ink)]">
        {priceSummary("Job", job)}
      </p>
      {jobActive ? (
        <p className="mb-6 max-w-[72ch] font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink-muted)]">
          {ACTIVE_JOB_SENTENCE}
        </p>
      ) : null}

      <PriceSummary
        summary={summary}
        targetOverridePct={projectPricing?.markupTargetPercent ?? null}
        defaultPct={myPricing?.defaultMarkupPercent ?? 35}
        salesTaxRate={projectPricing?.salesTaxRate ?? null}
        onTarget={(pct) =>
          setJobPricing(pct, projectPricing?.salesTaxRate ?? null)
        }
        onTaxRate={(rate) =>
          setJobPricing(projectPricing?.markupTargetPercent ?? null, rate)
        }
        note={summaryNote}
        approval={
          approval
            ? {
                totals: approval.approvedTotals ?? [],
                currentTotals,
                onChangeLog: () => setChangeLog({ itemId: null, name: null }),
              }
            : null
        }
      />
      <PriceActs
        onAdd={(kind) => void addKindLine(kind)}
        onResetAll={resetJob}
        adding={adding}
        resetting={resetAll.isPending}
      />

      {lineData && shown.length === 0 ? (
        <p className="max-w-[56ch] font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink)]">
          No selections yet. Add them in Preliminary selections, then price them here.
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
                onPricing={setPricing}
                onResolveCost={settleCost}
                onResetMarkup={resetMarkup}
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
                onMove={(row, roomId) => moveLine(row, roomId, place.key)}
                onRemove={(row) => removeLine(row, place.name, place.key)}
                onChangeLog={(row) =>
                  setChangeLog({ itemId: row.id, name: row.name })
                }
              />
              {tool && tool.placeId === place.key ? (
                tool.kind === "labor" ? (
                  <LaborForm
                    key={tool.line.id}
                    projectId={projectId}
                    piece={tool.line}
                    onAdded={(selectionId) => {
                      setTool(null);
                      requestFocus({
                        lineId: selectionId,
                        placeId: place.key,
                        target: "name",
                        expect: true,
                      });
                    }}
                    onDone={() => closeTool(tool.line.id, place.key)}
                  />
                ) : (
                  <AllowanceForm
                    key={tool.line.id}
                    projectId={projectId}
                    line={tool.line}
                    onAdded={() => {
                      setTool(null);
                      requestFocus({
                        lineId: tool.line.id,
                        placeId: place.key,
                        target: "allowance",
                      });
                    }}
                    onDone={() => closeTool(tool.line.id, place.key)}
                  />
                )
              ) : null}
            </div>
          );
        })}
      </div>

      {approval ? (
        <RemovedSinceApproval
          lines={removedApproved}
          onChangeLog={(line) =>
            setChangeLog({ itemId: line.itemId, name: line.name })
          }
        />
      ) : null}

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
          onExpire={() => expireRemoval(removal)}
        />
      ) : null}
      {changeLog ? (
        <PricingChangeLog
          projectId={projectId}
          itemId={changeLog.itemId}
          lineName={changeLog.name}
          lineNames={lineNames}
          onClose={() => setChangeLog(null)}
        />
      ) : null}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-price-announce=""
        className="sr-only"
      >
        {announcement}
      </p>
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
  onAdded,
  onDone,
}: {
  projectId: string;
  piece: PriceLine;
  /** The new labor line's id, for focus on its name (T-60a F6). */
  onAdded: (selectionId: string | null) => void;
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
      .then((added) => onAdded(added?.selectionId ?? null))
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
          Add labor line
        </button>
        <button
          type="button"
          onClick={() => onDone()}
          className={cn(ACT, "text-[var(--sheet-ink-muted)]")}
        >
          Cancel
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
  onAdded,
  onDone,
}: {
  projectId: string;
  line: PriceLine;
  /** The allowance saved: focus goes to the line's allowance cell (F6). */
  onAdded: () => void;
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
      .then(() => onAdded())
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
          Set as allowance
        </button>
        <button
          type="button"
          onClick={() => onDone()}
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
