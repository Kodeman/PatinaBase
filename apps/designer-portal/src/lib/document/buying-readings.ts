/**
 * Buying readings — the Project section read by who the studio buys from
 * (US-16 C-15, design D1-01 "read by maker").
 *
 * A pure derivation over the FF&E rows the section already reads. Groups run
 * maker → its purchase orders → the lines not yet on one, with "No maker yet"
 * last. The money column is what the maker charges (trade × quantity). Client
 * price and markup ride along only when the studio lets this viewer see its
 * margin (C-36, `can_see_studio_margin`); otherwise they are never computed.
 *
 * "Read by next act" (C-33) groups the same rows by what each line is waiting
 * on; see `readByNextAct` below.
 */

import { fmtDay } from './format';
import { OPEN_DAMAGE_CLAIM_STATES } from './stamp-derivation';
import { canLogAck, canSend } from '@/components/document/line-unfold/next-act';
import {
  formatCurrencyTotal,
  rowCurrency,
  sumByCurrency,
  type CurrencyTotal,
} from '@/lib/currency-totals';

export type BuyingReading = 'room' | 'maker' | 'next';

/** The PO columns `useProjectFFEItems` embeds on a line. */
export interface BuyingPurchaseOrder {
  id?: string | null;
  vendor_id?: string | null;
  po_number?: string | null;
  vendor_po_number?: string | null;
  sidemark?: string | null;
  status?: string | null;
  sent_at?: string | null;
  acknowledged_at?: string | null;
  confirmed_eta?: string | null;
  delivered_date?: string | null;
}

/** The `project_ffe_items` columns the reading needs. */
export interface BuyingLine {
  id: string;
  quantity?: number | null;
  currency?: string | null;
  vendor_id?: string | null;
  vendor_name?: string | null;
  product?: { brand?: string | null } | null;
  /** Trade UNIT cost (00185). */
  trade_price_cents?: number | null;
  /** Client UNIT price (00185). */
  unit_price_cents?: number | null;
  /** Client line total (00185). */
  line_total_cents?: number | null;
  purchase_order_id?: string | null;
  purchase_order?: BuyingPurchaseOrder | null;
}

export interface MakerLine<T> {
  row: T;
  id: string;
  quantity: number;
  currency: string;
  /** What the maker charges for the line: trade × quantity. Null when unknown. */
  tradeCents: number | null;
  /** Client line total. Always null when the viewer cannot see margin. */
  clientCents: number | null;
  /** Whole-percent markup over trade, negative when the client pays less
   *  than trade (R5). Always null when the viewer cannot see margin. */
  markupPct: number | null;
}

export interface MakerOrder<T> {
  key: string;
  label: string;
  /** "PO-1042 · sent 3 October · acknowledged · arrives ~14 November". */
  foot: string;
  lines: MakerLine<T>[];
}

export interface MakerGroup<T> {
  /** The vendor id, or `no-maker`. */
  key: string;
  /** The maker's name; null for the "No maker yet" group. */
  maker: string | null;
  orders: MakerOrder<T>[];
  /** Lines with this maker that are not on any purchase order yet. */
  notOnOrder: MakerLine<T>[];
  lineCount: number;
  tradeTotal: CurrencyTotal;
}

export interface MakerReading<T> {
  groups: MakerGroup<T>[];
  makerCount: number;
  lineCount: number;
  needMakerCount: number;
  /** Trade summed over every row printed below it (V11). */
  tradeTotal: CurrencyTotal;
  /** "Six makers · $48,210 trade · 4 lines need a maker". */
  frontMatter: string;
  canSeeMargin: boolean;
}

export const NO_MAKER_KEY = 'no-maker';

const NUMBER_WORDS = [
  'no', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
];

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const countOf = (n: number, one: string, many: string) =>
  `${NUMBER_WORDS[n] ?? String(n)} ${n === 1 ? one : many}`;

/** The order's own name, as the order cell prints it. */
export function purchaseOrderLabel(po: BuyingPurchaseOrder): string {
  return po.po_number ?? po.vendor_po_number ?? po.sidemark ?? 'PO drafted';
}

/**
 * The PO foot sentence. The send/ack words are the order cell's own
 * (`line-unfold/order-cell.tsx`); the movement word follows the PO's status;
 * the arrival reads the vendor's confirmed ETA until the goods are in.
 */
export function purchaseOrderFoot(po: BuyingPurchaseOrder): string {
  const parts: string[] = [purchaseOrderLabel(po)];
  if (po.status === 'cancelled') {
    parts.push('cancelled');
    return parts.join(' · ');
  }
  if (po.sent_at) {
    parts.push(`sent ${fmtDay(po.sent_at)}`);
    parts.push(po.acknowledged_at ? 'acknowledged' : 'awaiting acknowledgment');
  } else {
    parts.push('not yet sent');
  }
  if (po.status === 'delivered') {
    parts.push(po.delivered_date ? `delivered ${fmtDay(po.delivered_date)}` : 'delivered');
    return parts.join(' · ');
  }
  if (po.status === 'in_production') parts.push('in production');
  if (po.status === 'shipped') parts.push('in transit');
  if (po.confirmed_eta) parts.push(`arrives ~${fmtDay(po.confirmed_eta)}`);
  return parts.join(' · ');
}

function makerLine<T>(row: T, line: BuyingLine, canSeeMargin: boolean): MakerLine<T> {
  const quantity = line.quantity ?? 1;
  const tradeCents =
    line.trade_price_cents == null ? null : line.trade_price_cents * quantity;
  let clientCents: number | null = null;
  let markupPct: number | null = null;
  if (canSeeMargin) {
    clientCents =
      line.line_total_cents ??
      (line.unit_price_cents == null ? null : line.unit_price_cents * quantity);
    if (clientCents != null && tradeCents != null && tradeCents > 0) {
      markupPct = Math.round(((clientCents - tradeCents) / tradeCents) * 100);
    }
  }
  return {
    row,
    id: String(line.id),
    quantity,
    currency: rowCurrency(line),
    tradeCents,
    clientCents,
    markupPct,
  };
}

const isOpenOrder = (po: BuyingPurchaseOrder) =>
  po.status !== 'delivered' && po.status !== 'cancelled';

/** Soonest first; an order with no date sorts after every dated one. */
const byEta = (a: string | null | undefined, b: string | null | undefined) => {
  if (a && b) return a < b ? -1 : a > b ? 1 : 0;
  if (a) return -1;
  if (b) return 1;
  return 0;
};

interface Draft<T> {
  key: string;
  maker: string | null;
  orders: Map<string, { po: BuyingPurchaseOrder; lines: MakerLine<T>[] }>;
  notOnOrder: MakerLine<T>[];
  all: MakerLine<T>[];
}

export function readByMaker<T>(
  rows: readonly T[],
  lineOf: (row: T) => BuyingLine,
  { canSeeMargin }: { canSeeMargin: boolean },
): MakerReading<T> {
  const drafts = new Map<string, Draft<T>>();
  const noMaker: MakerLine<T>[] = [];
  const everyLine: MakerLine<T>[] = [];

  for (const row of rows) {
    const line = lineOf(row);
    const entry = makerLine(row, line, canSeeMargin);
    everyLine.push(entry);
    const po = line.purchase_order ?? null;
    // A PO cannot exist without a vendor (purchase_orders.vendor_id NOT NULL),
    // so a line on one always has its maker.
    const vendorId = line.vendor_id ?? po?.vendor_id ?? null;
    if (!vendorId) {
      noMaker.push(entry);
      continue;
    }
    let draft = drafts.get(vendorId);
    if (!draft) {
      draft = { key: vendorId, maker: null, orders: new Map(), notOnOrder: [], all: [] };
      drafts.set(vendorId, draft);
    }
    draft.maker ??= line.vendor_name ?? line.product?.brand ?? null;
    draft.all.push(entry);
    const poKey = line.purchase_order_id ?? po?.id ?? null;
    if (poKey) {
      const order = draft.orders.get(poKey) ?? { po: po ?? {}, lines: [] };
      order.lines.push(entry);
      draft.orders.set(poKey, order);
    } else {
      draft.notOnOrder.push(entry);
    }
  }

  const groups = [...drafts.values()].map((draft) => {
    const orders = [...draft.orders.entries()]
      .sort(
        ([, a], [, b]) =>
          byEta(a.po.confirmed_eta, b.po.confirmed_eta) ||
          purchaseOrderLabel(a.po).localeCompare(purchaseOrderLabel(b.po)),
      )
      .map(([key, { po, lines }]) => ({
        key,
        label: purchaseOrderLabel(po),
        foot: purchaseOrderFoot(po),
        lines,
      }));
    const open = [...draft.orders.values()].map(({ po }) => po).filter(isOpenOrder);
    return {
      group: {
        key: draft.key,
        maker: draft.maker ?? 'Unnamed maker',
        orders,
        notOnOrder: draft.notOnOrder,
        lineCount: draft.all.length,
        tradeTotal: sumByCurrency(draft.all, (l) => l.tradeCents),
      } satisfies MakerGroup<T>,
      // 0: an order still under way · 1: orders, all closed · 2: none yet.
      rank: open.length > 0 ? 0 : orders.length > 0 ? 1 : 2,
      soonest:
        open.map((po) => po.confirmed_eta ?? null).sort(byEta)[0] ?? null,
    };
  });

  groups.sort(
    (a, b) =>
      a.rank - b.rank ||
      byEta(a.soonest, b.soonest) ||
      (a.group.maker ?? '').localeCompare(b.group.maker ?? ''),
  );

  const ordered: MakerGroup<T>[] = groups.map(({ group }) => group);
  if (noMaker.length > 0) {
    ordered.push({
      key: NO_MAKER_KEY,
      maker: null,
      orders: [],
      notOnOrder: noMaker,
      lineCount: noMaker.length,
      tradeTotal: sumByCurrency(noMaker, (l) => l.tradeCents),
    });
  }

  const makerCount = drafts.size;
  const tradeTotal = sumByCurrency(everyLine, (l) => l.tradeCents);
  const anyTrade = everyLine.some((l) => l.tradeCents != null);
  const parts = [
    capitalise(countOf(makerCount, 'maker', 'makers')),
    anyTrade ? `${formatCurrencyTotal(tradeTotal)} trade` : 'no trade costs yet',
  ];
  if (noMaker.length > 0) {
    parts.push(
      `${countOf(noMaker.length, 'line needs', 'lines need')} a maker`,
    );
  }

  return {
    groups: ordered,
    makerCount,
    lineCount: everyLine.length,
    needMakerCount: noMaker.length,
    tradeTotal,
    frontMatter: parts.join(' · '),
    canSeeMargin,
  };
}

/** "40%", "0%", "−12%" — a negative markup printed plainly (R5). */
export function formatMarkup(pct: number): string {
  if (pct < 0) return `−${Math.abs(pct)}%`;
  return `${pct}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read by next act (US-16 C-33, D1-01 S2)
// ─────────────────────────────────────────────────────────────────────────────

/** The line columns the next-act reading reads on top of {@link BuyingLine}. */
export interface NextActLine extends BuyingLine {
  /** `project_ffe_items.status` — kept in step with its PO's (00184). */
  status?: string | null;
  /** Set once the receipt has been inspected. */
  received_quantity?: number | null;
  item_claims?: { state: string }[] | null;
  /** An open damage/claim exception on this line (`procurement_exceptions`). */
  open_claim?: boolean;
}

export interface NextActGroup<T> {
  key: string;
  /** The running head: a readiness reason or a lifecycle step. */
  label: string;
  rows: T[];
}

export interface NextActReading<T> {
  /** Only the groups holding a line — an empty group is silent. */
  groups: NextActGroup<T>[];
  lineCount: number;
}

export const READY_TO_ORDER = 'Ready to order';

/** Lifecycle steps for a line on its way, in the order the work moves. */
const LIFECYCLE_STEPS = [
  'To send',
  'Waiting on the ack',
  'Ordered',
  'In production',
  'Shipped',
  'To receive',
  'Claim open',
  'To install',
  'Installed',
] as const;
type LifecycleStep = (typeof LIFECYCLE_STEPS)[number];

/**
 * `deriveOrderReadiness` reasons in the order it states them, matched by
 * prefix (the deposit reason carries its authorization mark).
 */
const REASON_ORDER = [
  'Trade work',
  'Removed',
  'Not selected',
  'Needs a maker',
  'Needs a client price',
  'Waiting on a decision',
  'Waiting on the authorization',
  'Waiting on the deposit',
];

/**
 * Where an ordered line stands, or null while it has not been ordered. Item
 * status leads once the goods exist (delivered, installed — a cancelled PO
 * leaves those lines their status); before that the PO says whether it is
 * still to send or waiting on the maker's acknowledgment.
 */
function lifecycleStep(line: NextActLine): LifecycleStep | null {
  const status = line.status ?? '';
  const po = line.purchase_order ?? null;
  const onOrder = Boolean(line.purchase_order_id ?? po?.id);
  if (status === 'installed') return 'Installed';
  const hasOpenClaim =
    line.open_claim === true ||
    (line.item_claims ?? []).some((c) => OPEN_DAMAGE_CLAIM_STATES.has(c.state));
  if (hasOpenClaim) return 'Claim open';
  if (status === 'delivered') {
    return line.received_quantity == null ? 'To receive' : 'To install';
  }
  if (onOrder && canSend(po)) return 'To send';
  if (onOrder && canLogAck(po)) return 'Waiting on the ack';
  if (status === 'shipped') return 'Shipped';
  if (status === 'production') return 'In production';
  if (status === 'ordered' || onOrder) return 'Ordered';
  return null;
}

/** The group a line reads under: its lifecycle step, else its first reason. */
export function nextActOf(
  line: NextActLine,
  reasons: readonly string[],
): { key: string; label: string; rank: number } {
  const step = lifecycleStep(line);
  if (step) {
    return {
      key: `step:${step}`,
      label: step,
      rank: REASON_ORDER.length + 2 + LIFECYCLE_STEPS.indexOf(step),
    };
  }
  const reason = reasons[0];
  if (!reason) {
    return { key: 'ready', label: READY_TO_ORDER, rank: REASON_ORDER.length + 1 };
  }
  const known = REASON_ORDER.findIndex((prefix) => reason.startsWith(prefix));
  return {
    key: `reason:${reason}`,
    label: reason,
    rank: known === -1 ? REASON_ORDER.length : known,
  };
}

/**
 * The section's rows grouped by what each is waiting on: unordered lines by
 * the first reason the order is refused (`deriveOrderReadiness`), or "Ready to
 * order"; ordered lines by their lifecycle step. Groups run in the order the
 * work moves; lines keep the section's order within a group.
 */
export function readByNextAct<T>(
  rows: readonly T[],
  lineOf: (row: T) => NextActLine,
  reasonsOf: (row: T) => readonly string[],
): NextActReading<T> {
  const groups = new Map<string, NextActGroup<T> & { rank: number }>();
  for (const row of rows) {
    const { key, label, rank } = nextActOf(lineOf(row), reasonsOf(row));
    const group = groups.get(key) ?? { key, label, rank, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return {
    groups: [...groups.values()]
      .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
      .map(({ key, label, rows: groupRows }) => ({ key, label, rows: groupRows })),
    lineCount: rows.length,
  };
}
