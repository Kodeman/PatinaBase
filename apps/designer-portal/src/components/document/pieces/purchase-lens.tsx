"use client";

/**
 * The Purchase lens (WP-04 C06; Purchase lens ruling, 2026-10-27): the sixth
 * sheet lens, on the round-8 sheet only. It reads where each selection stands
 * between client decision and delivery, from the rows the other lenses read:
 *
 * - **The schedule**, grouped by room: `SELECTION · STAGE · AUTHORITY · ORDER
 *   OR NEXT ACT`, plus `AMOUNT` for a seat with money (`canSeeMoney`, as Price).
 * - **External fulfilment** (C5, `external_fulfilment_id`): someone outside the
 *   studio buys it. It reads as their responsibility, never as a studio
 *   purchase, never priced and never offered an order.
 * - **Bought already**: the job's studio purchases (`studio_purchases`), and,
 *   for a seat with money, the existing record form (`PurchaseRecordForm`).
 *
 * Nothing here drafts, sends or releases an order. Orders are prepared and
 * sent from the line and the Orders book, draft first (V22).
 */

import { useId, useMemo, useState } from "react";
import {
  useProjectFFEItems,
  useStudioPurchases,
  type StudioPurchaseRow,
} from "@patina/supabase";
import { PurchaseRecordForm } from "@/components/document/purchases/purchase-record-form";
import { useDocumentRooms } from "@/hooks/use-document-rooms";
import { fmtDay } from "@/lib/document/format";
import {
  REMOVED_PLACE,
  THROUGHOUT_PLACE,
  UNASSIGNED_PLACE,
  type BuildRoomPlace,
} from "@/lib/document/pieces/build-room-url";
import { pieceLineStage } from "@/lib/document/pieces/line-stage";
import { countsAsPiece, liveBuildRoomLines } from "@/lib/document/pieces/live-lines";
import {
  fmtReleaseUsd,
  releaseAmountText,
  type ReleaseLensLine,
} from "@/lib/document/pieces/readiness";
import { QUIET_FOCUS, ROOM_HEADING_ATTR } from "@/lib/document/pieces/sheet-focus";
import { lineStampLabel } from "@/lib/document/stamp-derivation";
import { cn } from "@/lib/utils";
import { deriveNextAct, type NextAct } from "../line-unfold/next-act";

/** A `useProjectFFEItems` row, as much of it as the Purchase lens reads. */
export interface PurchaseLensLine extends ReleaseLensLine {
  external_fulfilment_id?: string | null;
  studio_purchases?: { status: string }[] | null;
  purchase_order?:
    | (NonNullable<ReleaseLensLine["purchase_order"]> & {
        po_number?: string | null;
        acknowledged_at?: string | null;
        vendor?: { name: string | null } | null;
      })
    | null;
}

export type PurchaseStanding =
  | "external"
  | "ordered"
  | "bought"
  | "ready"
  | "waiting";

export const PURCHASE_FILTERS = [
  { value: "all", label: "All lines" },
  { value: "ready", label: "Ready to order" },
  { value: "waiting", label: "Waiting on something" },
  { value: "ordered", label: "On an order or bought" },
  { value: "external", label: "Bought by others" },
] as const;
export type PurchaseFilter = (typeof PURCHASE_FILTERS)[number]["value"];

export interface PurchaseRow {
  line: PurchaseLensLine;
  standing: PurchaseStanding;
  stageWord: string;
  next: NextAct | null;
}

export interface PurchaseGroup {
  key: string;
  name: string;
  roomId: string | null;
  rows: PurchaseRow[];
}

const NEXT_ACT_WORD: Record<Exclude<NextAct["kind"], "advance">, string> = {
  order: "Prepare a PO",
  send: "Send to vendor",
  "log-ack": "Log the ack",
  inspect: "Log inspection",
  "complete-inspection": "Complete inspection",
  install: "Mark installed",
  "purchase-arrival": "Record arrival",
};

export function nextActWord(next: NextAct | null): string | null {
  if (!next) return null;
  return next.kind === "advance" ? next.label : NEXT_ACT_WORD[next.kind];
}

const AUTHORITY_WORD: Record<string, string> = {
  sent: "Sent to the client, not yet signed",
  client_signed: "Signed by the client",
  executed: "Authorized",
};

export function authorityWord(line: PurchaseLensLine): string {
  if (line.external_fulfilment_id != null) return "Not the studio’s to authorize";
  return AUTHORITY_WORD[line.ffe_line_authorization ?? ""] ?? "Not yet authorized";
}

/** Where one line stands on the way to being bought. */
export function purchaseRow(line: PurchaseLensLine): PurchaseRow {
  const stage = pieceLineStage(line);
  const stageWord = lineStampLabel(stage.kind);
  if (line.external_fulfilment_id != null) {
    return { line, standing: "external", stageWord, next: null };
  }
  const po =
    line.purchase_order && line.purchase_order.status !== "cancelled"
      ? line.purchase_order
      : null;
  const purchase = (line.studio_purchases ?? []).find(
    (p) => p.status === "recorded" || p.status === "billed",
  );
  const ready =
    stage.lock === null && (stage.stage === "ready" || stage.stage === "released");
  const next = deriveNextAct({
    itemStatus: line.status ?? "",
    po,
    purchase,
    ready,
    inspected: line.received_quantity != null,
    hasOpenClaim: (line.item_claims ?? []).some(
      (claim) => claim.state === "drafted" || claim.state === "vendor_notified",
    ),
  });
  const standing: PurchaseStanding = po
    ? "ordered"
    : purchase
      ? "bought"
      : next?.kind === "order"
        ? "ready"
        : "waiting";
  return { line, standing, stageWord, next };
}

function matches(filter: PurchaseFilter, standing: PurchaseStanding): boolean {
  if (filter === "all") return true;
  if (filter === "ordered") return standing === "ordered" || standing === "bought";
  return filter === standing;
}

const THROUGHOUT_KEY = "__throughout__";
const UNASSIGNED_KEY = "__unassigned__";

function groupKey(line: PurchaseLensLine, roomIds: ReadonlySet<string>): string {
  if (
    line.assignment_scope === "room" &&
    line.project_room_id &&
    roomIds.has(line.project_room_id)
  ) {
    return line.project_room_id;
  }
  return line.assignment_scope === "throughout" ? THROUGHOUT_KEY : UNASSIGNED_KEY;
}

function placeKey(place: BuildRoomPlace): string | null {
  if (place === THROUGHOUT_PLACE) return THROUGHOUT_KEY;
  if (place === UNASSIGNED_PLACE) return UNASSIGNED_KEY;
  return place;
}

/**
 * The schedule, grouped by primary room in room order, then Throughout, then
 * Not in a room yet (the Release lens's grouping). Pieces only: labor, Trade
 * Scope presence and lines not selected are not bought.
 */
export function derivePurchaseGroups(
  lines: readonly PurchaseLensLine[],
  rooms: readonly { id: string; name: string }[],
  place: BuildRoomPlace,
  filter: PurchaseFilter,
): PurchaseGroup[] {
  const roomIds = new Set(rooms.map((r) => r.id));
  const wanted = placeKey(place);
  const byKey = new Map<string, PurchaseRow[]>();
  for (const line of liveBuildRoomLines(lines)) {
    if (!countsAsPiece(line)) continue;
    const key = groupKey(line, roomIds);
    if (wanted != null && key !== wanted) continue;
    const row = purchaseRow(line);
    if (!matches(filter, row.standing)) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  return [
    ...rooms.map((r) => ({ key: r.id, name: r.name, roomId: r.id })),
    { key: THROUGHOUT_KEY, name: "Throughout", roomId: null },
    { key: UNASSIGNED_KEY, name: "Not in a room yet", roomId: null },
  ]
    .filter((g) => byKey.has(g.key))
    .map((g) => ({ ...g, rows: byKey.get(g.key)! }));
}

const HEAD_CELL =
  "h-[40px] px-2 text-left font-mono text-[12px] font-medium uppercase leading-none tracking-[0.06em] text-[var(--sheet-ink)]";
const CELL =
  "px-2 py-2 align-top font-sans text-[14px] leading-[1.4] text-[var(--sheet-ink)]";
const SUB = "block font-sans text-[12px] leading-[1.5] text-[var(--sheet-ink-muted)]";
const ACT_CLS =
  "inline-flex min-h-[44px] items-center text-left font-sans text-[14px] text-[var(--sheet-ink)] underline decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)]";
const NOTE = "max-w-[56ch] py-6 font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink)]";

export interface PurchaseLensProps {
  projectId: string;
  room: BuildRoomPlace;
  canSeeMoney: boolean;
  /** Embedded: open the line in Specifications (the sheet's own address). */
  onOpenLine?: (lineId: string) => void;
}

export function PurchaseLens({
  projectId,
  room,
  canSeeMoney,
  onOpenLine,
}: PurchaseLensProps) {
  const filterId = useId();
  const [filter, setFilter] = useState<PurchaseFilter>("all");
  const { data: rawLines } = useProjectFFEItems(projectId);
  const { data: roomRows } = useDocumentRooms(projectId);
  const rooms = useMemo(
    () => (roomRows ?? []).map((r) => ({ id: r.id, name: r.name })),
    [roomRows],
  );
  const groups = useMemo(
    () =>
      derivePurchaseGroups(
        (rawLines ?? []) as unknown as PurchaseLensLine[],
        rooms,
        room,
        filter,
      ),
    [rawLines, rooms, room, filter],
  );

  if (room === REMOVED_PLACE) {
    return (
      <p className={NOTE}>
        Removed selections are not purchased. Restore them in Preliminary selections first.
      </p>
    );
  }

  const columns = ["Selection", "Stage", "Authority", "Order or next act"];
  if (canSeeMoney) columns.push("Amount");

  return (
    <div
      data-testid="purchase-lens"
      className="flex flex-col gap-6 py-6 [[data-paper-renderer=round8]_&_thead]:bg-[var(--sheet-row-hover)] [[data-paper-renderer=round8]_&_th]:font-normal"
    >
      <header data-round8-lens="purchase" className="border-b border-[var(--sheet-rule-strong)] pb-4">
        <h3 className="font-heading text-[24px] font-normal leading-[1.2] text-[var(--sheet-ink)]">
          From a decision to a delivered piece.
        </h3>
        <p className="mt-2 max-w-[72ch] font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink-muted)]">
          Client approval, purchasing authority, the order, the maker’s acknowledgment, then receiving. Orders are drafted and reviewed before anyone sends them; nothing on this page sends one.
        </p>
      </header>
      <label htmlFor={filterId} className="flex flex-wrap items-center gap-3 font-sans text-[14px] text-[var(--sheet-ink)]">
        Show purchasing lines
        <select
          id={filterId}
          value={filter}
          onChange={(event) => setFilter(event.target.value as PurchaseFilter)}
          className="min-h-[44px] border border-[var(--sheet-rule-strong)] bg-transparent px-2"
        >
          {PURCHASE_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="max-w-full overflow-x-auto">
        <table aria-label="Purchasing" className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--sheet-rule-strong)]">
              {columns.map((label) => (
                <th key={label} scope="col" className={HEAD_CELL}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          {groups.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={columns.length} className={CELL}>
                  {rawLines
                    ? "No lines match this view. Change the room or the purchasing filter."
                    : "Reading the schedule…"}
                </td>
              </tr>
            </tbody>
          ) : (
            groups.map((group) => (
              <tbody key={group.key}>
                <tr className="border-b border-[var(--sheet-rule)]">
                  <th
                    scope="colgroup"
                    colSpan={columns.length}
                    tabIndex={group.roomId ? -1 : undefined}
                    {...(group.roomId ? { [ROOM_HEADING_ATTR]: group.roomId } : null)}
                    className={cn(
                      "h-[48px] px-2 text-left font-heading text-[18px] font-normal italic leading-[1.2] text-[var(--sheet-ink)]",
                      QUIET_FOCUS,
                    )}
                  >
                    {group.name}
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <PurchaseLineRow
                    key={row.line.id}
                    row={row}
                    canSeeMoney={canSeeMoney}
                    onOpenLine={onOpenLine}
                  />
                ))}
              </tbody>
            ))
          )}
        </table>
      </div>
      <BoughtAlready projectId={projectId} canSeeMoney={canSeeMoney} />
    </div>
  );
}

function PurchaseLineRow({
  row,
  canSeeMoney,
  onOpenLine,
}: {
  row: PurchaseRow;
  canSeeMoney: boolean;
  onOpenLine?: (lineId: string) => void;
}) {
  const { line, standing, stageWord } = row;
  const name = line.name?.trim() || "Unnamed piece";
  const maker = line.purchase_order?.vendor?.name ?? line.vendor_name ?? null;
  return (
    <tr data-purchase-row={line.id} data-purchase-standing={standing} className="border-b border-[var(--sheet-rule)]">
      <td className={CELL}>
        {onOpenLine ? (
          <button type="button" className={ACT_CLS} onClick={() => onOpenLine(line.id)}>
            {name}
          </button>
        ) : (
          name
        )}
        <span className={SUB}>
          {maker ?? "Maker not named"} · Quantity {line.quantity ?? "not recorded"}
        </span>
      </td>
      <td className={CELL}>{stageWord || "—"}</td>
      <td className={CELL}>{authorityWord(line)}</td>
      <td className={CELL}>
        <OrderReading row={row} />
      </td>
      {canSeeMoney && (
        <td className={CELL}>
          {standing === "external" ? "Not priced by the studio" : releaseAmountText(line)}
        </td>
      )}
    </tr>
  );
}

function OrderReading({ row }: { row: PurchaseRow }) {
  const { line, standing, next } = row;
  const nextWord = nextActWord(next);
  if (standing === "external") {
    return (
      <>
        External responsibility
        <span className={SUB}>Bought and paid outside the studio.</span>
      </>
    );
  }
  if (standing === "ordered") {
    const po = line.purchase_order!;
    return (
      <>
        {po.po_number ? `PO ${po.po_number}` : "Order drafted"}
        {nextWord && <span className={SUB}>Next: {nextWord}</span>}
      </>
    );
  }
  if (standing === "bought") {
    return (
      <>
        Bought already
        {nextWord && <span className={SUB}>Next: {nextWord}</span>}
      </>
    );
  }
  if (standing === "ready") {
    return (
      <>
        Ready to order
        <span className={SUB}>Next: Prepare a PO</span>
      </>
    );
  }
  return (
    <>
      Not ready to order
      {nextWord && <span className={SUB}>Next: {nextWord}</span>}
    </>
  );
}

function purchaseLine(purchase: StudioPurchaseRow, canSeeMoney: boolean): string {
  const what = purchase.description?.trim() || "Studio purchase";
  const money = canSeeMoney ? ` · ${fmtReleaseUsd(purchase.amount_cents)}` : "";
  const state = purchase.voided_at ? " · Voided" : "";
  return `${fmtDay(purchase.purchased_on)} · ${what} · ${purchase.payee_name}${money}${state}`;
}

function BoughtAlready({
  projectId,
  canSeeMoney,
}: {
  projectId: string;
  canSeeMoney: boolean;
}) {
  const headingId = useId();
  const purchases = useStudioPurchases({ projectId });
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<string | null>(null);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 border-t border-[var(--sheet-rule-strong)] pt-4">
      <h4 id={headingId} className="font-heading text-[18px] font-normal leading-[1.2] text-[var(--sheet-ink)]">
        Bought already
      </h4>
      {purchases.isError ? (
        <p role="alert" className="font-sans text-[14px] text-[var(--sheet-ink)]">
          The studio purchases could not be read.{" "}
          <button type="button" className={ACT_CLS} onClick={() => void purchases.refetch()}>
            Try again
          </button>
        </p>
      ) : purchases.isPending ? (
        <p className="font-sans text-[14px] text-[var(--sheet-ink-muted)]">Reading studio purchases…</p>
      ) : purchases.data.length === 0 ? (
        <p className="font-sans text-[14px] text-[var(--sheet-ink-muted)]">
          No store buys, finds or samples recorded on this job.
        </p>
      ) : (
        <ul className="space-y-1 font-sans text-[14px] text-[var(--sheet-ink)]">
          {purchases.data.map((purchase) => (
            <li key={purchase.id} data-studio-purchase={purchase.id}>
              {purchaseLine(purchase, canSeeMoney)}
            </li>
          ))}
        </ul>
      )}
      {recorded && <p role="status" className="font-sans text-[14px] text-[var(--sheet-ink)]">{recorded}</p>}
      {canSeeMoney &&
        (recording ? (
          <div className="flex flex-col gap-2">
            <PurchaseRecordForm
              projectId={projectId}
              onDone={(result) => {
                setRecorded(result);
                setRecording(false);
              }}
            />
            <button type="button" className={ACT_CLS} onClick={() => setRecording(false)}>
              Close without recording
            </button>
          </div>
        ) : (
          <button type="button" className={ACT_CLS} onClick={() => setRecording(true)}>
            Record something bought already
          </button>
        ))}
    </section>
  );
}
