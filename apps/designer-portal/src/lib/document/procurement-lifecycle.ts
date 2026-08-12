/**
 * Rail B — the studio's own procurement, read as the fifteen-step lifecycle
 * (ruling R7, WP4 Track 1). Pure derivation, in the idiom of
 * `stamp-derivation.ts`: a function from rows the existing hooks already fetch
 * to a reading. No store, no schema, no migration — decision №8 stays open.
 *
 * "Ordered" is the whole problem in one word: true the moment an order leaves
 * the studio and still true six weeks later while a credenza sits in a
 * warehouse. The trail replaces it with a position.
 *
 * THE HONESTY RULE, which is the whole point of the ruling: a step is drawn
 * as settled ONLY where a fact evidences it. Steps 04 (Awaiting inputs),
 * 07 (Ready to ship), 11 (Stored), 12 (Install released) and 15 (Closed) have
 * NO fact on this rail today. They are never inferred from a neighbour and
 * never blocking: before the live step they read `future`, behind it
 * `no-record`. The five missing facts are docketed in
 * `docs/design/workflow-alignment/wp4-lifecycle-mapping.md` §№8 as a costed
 * future data wave — not built here.
 *
 * Steps do NOT imply one another on this rail. A delivered line whose PO was
 * never marked sent reads step 02 as `no-record`, because that is what the
 * book actually knows. Rail A's ordered `line_state` chain is the exception,
 * and it lives in `@patina/types`.
 */

import {
  assembleProcurementReading,
  type ProcurementEvidenceMap,
  type ProcurementGatePredicates,
  type ProcurementLifecycleReading,
} from '@patina/types';

/** A claim is open until it resolves (00150 / 00196) — same set as R2's stamp. */
const OPEN_CLAIM_STATES = new Set(['drafted', 'vendor_notified']);

export interface ProcurementLifecyclePayment {
  /** `po_payments.kind` — 'deposit' | 'balance' | 'milestone'. */
  kind: string;
  /** `po_payments.state` — 'pending' | 'due' | 'paid' | 'refunded' (00277). */
  state: string;
  due_date?: string | null;
  paid_date?: string | null;
}

export interface ProcurementLifecyclePurchaseOrder {
  /** 'draft' | 'confirmed' | 'in_production' | 'shipped' | 'delivered' | 'cancelled'. */
  status?: string | null;
  sent_at?: string | null;
  acknowledged_at?: string | null;
  confirmed_eta?: string | null;
  delivered_date?: string | null;
  payments?: ProcurementLifecyclePayment[] | null;
}

export interface ProcurementLifecycleClaim {
  /** `damage_claims.state` — 'drafted' | 'vendor_notified' | 'resolved'. */
  state: string;
  created_at?: string | null;
}

export interface ProcurementLifecycleInput {
  /** `project_ffe_items.status` — the item machine (00066/00184). */
  status: string;
  quantity?: number | null;
  received_quantity?: number | null;
  /** `project_ffe_items.last_status_change_at` — stamped by 00084's trigger. */
  last_status_change_at?: string | null;
  purchase_order?: ProcurementLifecyclePurchaseOrder | null;
  /** `damage_claims!ffe_item_id` — item-grain claims only (00196). */
  item_claims?: ProcurementLifecycleClaim[] | null;
}

/** Deposits that have not cleared. Vacuously empty when the terms carry none. */
function unpaidDeposits(
  po: ProcurementLifecyclePurchaseOrder | null,
): ProcurementLifecyclePayment[] {
  return (po?.payments ?? []).filter(
    (p) => p.kind === 'deposit' && p.state !== 'paid',
  );
}

/**
 * The "Expected" column at ledger density — the confirmed ETA where the vendor
 * gave one, else the nearest payment date the book is waiting on. Existing data
 * only: a line with neither expects nothing, and says so with null rather than
 * a guess.
 */
export function procurementExpected(
  po: ProcurementLifecyclePurchaseOrder | null | undefined,
): string | null {
  if (po?.confirmed_eta) return po.confirmed_eta;
  const upcoming = (po?.payments ?? [])
    .filter((p) => p.state !== 'paid' && p.state !== 'refunded' && p.due_date)
    .map((p) => p.due_date as string)
    .sort();
  return upcoming[0] ?? null;
}

/**
 * Derive the fifteen-step reading for one FF&E line on the studio rail.
 *
 * Evidence mapping (each cited to the column that carries it):
 *   01 Cleared to produce  PO exists AND every deposit-kind payment is paid
 *                          (no deposit rows ⇒ vacuously true)
 *   02 Released to maker   purchase_orders.sent_at
 *   03 Acknowledged        purchase_orders.acknowledged_at
 *   05 Released ┐          purchase_orders.status='in_production'
 *   06 In production ┘     (dated by project_ffe_items.last_status_change_at)
 *   08 In transit          status='shipped' (+ confirmed_eta as the date)
 *   09 Received / inspect  purchase_orders.delivered_date, or the item machine
 *   10 Accepted or issue   the inspection's item-grain write
 *                          (received_quantity) and/or damage_claims.ffe_item_id
 *   13 Installed           project_ffe_items.status='installed'
 */
export function deriveProcurementLifecycle(
  item: ProcurementLifecycleInput,
): ProcurementLifecycleReading {
  const po = item.purchase_order ?? null;
  const evidence: ProcurementEvidenceMap = {};

  // ── 01 · Cleared to produce ────────────────────────────────────────────
  // A derived operational seal, NOT a client ceremony: it reads the deposit
  // rows the book already has. No amount, no balance, no funds-held device
  // is rendered from this anywhere (folio 14 — no payment surfaces).
  const deposits = (po?.payments ?? []).filter((p) => p.kind === 'deposit');
  const outstandingDeposits = unpaidDeposits(po);
  const depositsClear = po !== null && outstandingDeposits.length === 0;
  if (depositsClear) {
    const paidDates = deposits
      .map((p) => p.paid_date)
      .filter((d): d is string => Boolean(d))
      .sort();
    evidence.cleared_to_produce = {
      at: paidDates[paidDates.length - 1] ?? '',
      source: deposits.length
        ? 'po_payments.kind=deposit state=paid'
        : 'purchase_orders (terms carry no deposit)',
    };
  }

  // ── 02 · Released to maker ─────────────────────────────────────────────
  if (po?.sent_at) {
    evidence.released_to_maker = {
      at: po.sent_at,
      source: 'purchase_orders.sent_at',
    };
  }

  // ── 03 · Acknowledged ──────────────────────────────────────────────────
  if (po?.acknowledged_at) {
    evidence.acknowledged = {
      at: po.acknowledged_at,
      source: 'purchase_orders.acknowledged_at',
    };
  }

  // ── 05 + 06 · Released / In production ─────────────────────────────────
  // One fact evidences both: the book has no separate release moment, and
  // production cannot have started without one. The item row carries the only
  // date (the PO keeps no status-transition history).
  const inProduction =
    po?.status === 'in_production' || item.status === 'production';
  if (inProduction) {
    const at = item.last_status_change_at ?? '';
    evidence.released = {
      at,
      source: 'purchase_orders.status=in_production',
    };
    evidence.in_production = {
      at,
      source: 'purchase_orders.status=in_production',
    };
  }

  // ── 08 · In transit ────────────────────────────────────────────────────
  // confirmed_eta is an EXPECTATION, not a departure — it is carried as the
  // step's date because it is the only date a shipped PO has, and the source
  // string says exactly which column it came from.
  const inTransit = po?.status === 'shipped' || item.status === 'shipped';
  if (inTransit) {
    evidence.in_transit = {
      at: po?.confirmed_eta ?? item.last_status_change_at ?? '',
      source: po?.confirmed_eta
        ? 'purchase_orders.status=shipped + confirmed_eta'
        : 'purchase_orders.status=shipped',
    };
  }

  // ── 09 · Received / inspect ────────────────────────────────────────────
  const inspected = item.received_quantity != null;
  const delivered =
    Boolean(po?.delivered_date) ||
    po?.status === 'delivered' ||
    item.status === 'delivered';
  if (delivered || inspected) {
    evidence.received_inspect = {
      at: po?.delivered_date ?? item.last_status_change_at ?? '',
      source: po?.delivered_date
        ? 'purchase_orders.delivered_date'
        : 'project_ffe_items.status=delivered',
    };
  }

  // ── 10 · Accepted or issue ─────────────────────────────────────────────
  // `receiving_inspections` is PO-grain and has no FF&E link, so the item-grain
  // trace of an inspection is the count 00184's trigger writes back, plus any
  // claim attributed to THIS line. A PO-grain claim never reads on a line.
  const claims = item.item_claims ?? [];
  const openClaims = claims.filter((c) => OPEN_CLAIM_STATES.has(c.state));
  if (inspected || claims.length > 0) {
    const claimDate = claims
      .map((c) => c.created_at)
      .filter((d): d is string => Boolean(d))
      .sort()[0];
    evidence.accepted_or_issue = {
      at: claimDate ?? po?.delivered_date ?? '',
      source: claims.length
        ? 'damage_claims.ffe_item_id'
        : 'project_ffe_items.received_quantity',
    };
  }

  // ── 13 · Installed ─────────────────────────────────────────────────────
  if (item.status === 'installed') {
    evidence.installed = {
      at: item.last_status_change_at ?? '',
      source: 'project_ffe_items.status=installed',
    };
  }

  // ── Gates ──────────────────────────────────────────────────────────────
  // Derived OPERATIONAL seals. They read the book's own facts; no
  // client_decisions row is consulted and no client act settles one.
  const acknowledged = Boolean(po?.acknowledged_at);
  const shortReceipt =
    inspected &&
    item.quantity != null &&
    (item.received_quantity as number) < item.quantity;

  const gates: ProcurementGatePredicates = {
    complete_to_produce: {
      settled: acknowledged && depositsClear,
      qualifier: !acknowledged
        ? 'awaiting acknowledgment'
        : outstandingDeposits.length
          ? 'deposit outstanding'
          : undefined,
    },
    received_and_dispositioned: {
      settled: inspected && !shortReceipt && openClaims.length === 0,
      qualifier: !inspected
        ? 'awaiting inspection'
        : openClaims.length
          ? 'open claim'
          : shortReceipt
            ? 'short receipt'
            : undefined,
    },
    // №8 docket: nothing in the schema records warehouse custody or site
    // readiness. The gate is drawn, and it is drawn empty.
    warehouse_and_site_ready: { settled: false, noRecord: true },
  };

  return assembleProcurementReading('studio', evidence, gates);
}
