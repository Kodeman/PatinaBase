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
  /**
   * Which register the reading is for. `purchase_order` marks the ledger's
   * PO-grain call, where item-level disposition is invisible by construction
   * — use `derivePurchaseOrderLifecycle` rather than setting this by hand.
   */
  grain?: 'ffe_item' | 'purchase_order';
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
 * The "Expected" column at ledger density — the SHIPMENT expectation, and only
 * that. `confirmed_eta` or nothing.
 *
 * A payment due date must never surface here (folio 14: no payment surfaces,
 * not a deposit field, not a balance). A column headed "Expected" beside goods
 * that quietly showed a money date would be exactly the commercial claim №7
 * has not made. A line with no confirmed ETA expects nothing, and says so.
 */
export function procurementExpected(
  po: ProcurementLifecyclePurchaseOrder | null | undefined,
): string | null {
  return po?.confirmed_eta ?? null;
}

/**
 * Derive the fifteen-step reading for one FF&E line on the studio rail.
 *
 * Evidence mapping (each cited to the column that ACTUALLY fired — the
 * `source` string is the reading's audit trail and must never name a column
 * that was not consulted):
 *   01 Cleared to produce  a LIVE PO (not draft, not cancelled) AND every
 *                          deposit-kind payment paid (no deposit rows ⇒
 *                          vacuously true)
 *   02 Released to maker   purchase_orders.sent_at
 *   03 Acknowledged        purchase_orders.acknowledged_at
 *   05 Released ┐          purchase_orders.status='in_production'
 *   06 In production ┘     or project_ffe_items.status='production'
 *   08 In transit          status='shipped' — UNDATED (no departure fact
 *                          exists; confirmed_eta is an expectation and belongs
 *                          only to the ledger's Expected column)
 *   09 Received / inspect  purchase_orders.delivered_date, or the item machine
 *   10 Accepted or issue   damage_claims.ffe_item_id and/or the clean-outcome
 *                          write-back project_ffe_items.received_quantity
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
  //
  // A DRAFT PO has not cleared anything — it is a document being written, and
  // the vacuous-deposit rule (absent terms are not unmet terms) must not turn
  // an unwritten order into a released one. A CANCELLED PO has un-cleared
  // whatever it once had. Neither takes a position on the trail, which is also
  // what keeps the ledger saying "draft" and "cancelled" out loud.
  const deposits = (po?.payments ?? []).filter((p) => p.kind === 'deposit');
  const outstandingDeposits = unpaidDeposits(po);
  const liveOrder =
    po !== null && po.status !== 'draft' && po.status !== 'cancelled';
  const depositsClear = liveOrder && outstandingDeposits.length === 0;
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
  const poInProduction = po?.status === 'in_production';
  const itemInProduction = item.status === 'production';
  if (poInProduction || itemInProduction) {
    const at = item.last_status_change_at ?? '';
    // Name the column that actually fired, not the one that usually does.
    const source = poInProduction
      ? 'purchase_orders.status=in_production'
      : 'project_ffe_items.status=production';
    evidence.released = { at, source };
    evidence.in_production = { at, source };
  }

  // ── 08 · In transit ────────────────────────────────────────────────────
  // UNDATED, deliberately. The book records no departure — `confirmed_eta` is
  // an expectation about arrival, and dating a shipping step with it would
  // report a fact that does not exist. The ETA renders once, in the ledger's
  // Expected column, under the `~` convention that marks it as approximate.
  const poShipped = po?.status === 'shipped';
  const itemShipped = item.status === 'shipped';
  if (poShipped || itemShipped) {
    evidence.in_transit = {
      at: '',
      source: poShipped
        ? 'purchase_orders.status=shipped'
        : 'project_ffe_items.status=shipped',
    };
  }

  // ── 09 · Received / inspect ────────────────────────────────────────────
  // `delivered_date` is stamped when the FIRST receiving_inspections row is
  // logged, whatever its outcome (00150) — so it, not the count, is the fact
  // that an inspection happened.
  const claims = item.item_claims ?? [];
  const openClaims = claims.filter((c) => OPEN_CLAIM_STATES.has(c.state));
  const deliveredDate = po?.delivered_date ?? null;
  const poDelivered = po?.status === 'delivered';
  const itemDelivered = item.status === 'delivered';
  if (deliveredDate || poDelivered || itemDelivered) {
    evidence.received_inspect = {
      at: deliveredDate ?? item.last_status_change_at ?? '',
      source: deliveredDate
        ? 'purchase_orders.delivered_date'
        : poDelivered
          ? 'purchase_orders.status=delivered'
          : 'project_ffe_items.status=delivered',
    };
  }

  // ── 10 · Accepted or issue ─────────────────────────────────────────────
  // Two dispositions, two traces. A claim is the ISSUE half. The count that
  // 00184's trigger writes back is the ACCEPTED half — the trigger only fires
  // on a clean outcome, which is exactly why a non-null count means accepted
  // rather than merely inspected.
  const countedClean = item.received_quantity != null;
  if (countedClean || claims.length > 0) {
    // Open claims outrank resolved ones — an unresolved issue is the live
    // fact. Among open claims, the earliest is the one that has been waiting.
    const dateFrom = (rows: ProcurementLifecycleClaim[]) =>
      rows
        .map((c) => c.created_at)
        .filter((d): d is string => Boolean(d))
        .sort()[0];
    const claimDate = dateFrom(openClaims) ?? dateFrom(claims);
    evidence.accepted_or_issue = {
      at: claimDate ?? deliveredDate ?? '',
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
  // An inspection HAPPENED when delivered_date was stamped (00150 writes it on
  // the first inspection row, any outcome) or a claim exists — never from the
  // count, which 00184 writes only on a clean outcome and which would
  // therefore report a damaged receipt as un-inspected.
  const inspectionLogged = Boolean(deliveredDate) || claims.length > 0;
  // The count governs ONE term: whether everything ordered actually turned up.
  const shortReceipt =
    item.received_quantity != null &&
    item.quantity != null &&
    item.received_quantity < item.quantity;

  const gates: ProcurementGatePredicates = {
    complete_to_produce: {
      settled: acknowledged && depositsClear,
      // Uncleared terms are a LIVE condition — the order is standing on them
      // right now, whatever the maker has started. A missing acknowledgment is
      // NOT: if the work is in production the vendor plainly received the
      // order, and the gap is an unrecorded seal, not a blockage. So terms
      // hold the gate open; a missing acknowledgment lets it go quiet.
      holdsOpen: outstandingDeposits.length > 0,
      // Actor-neutral: the gate reports that the ORDER's terms are outstanding,
      // never that money is owed by anyone (№7 open, folio 14).
      qualifier: !acknowledged
        ? 'awaiting acknowledgment'
        : outstandingDeposits.length
          ? 'terms outstanding'
          : undefined,
    },
    received_and_dispositioned:
      item.grain === 'purchase_order'
        ? // Disposition is item-level; a register of orders cannot see it, so
          // it never seals here and never invents a term. It stays a real
          // destination though — receipt IS the next thing that happens to
          // these goods, and the book may honestly say so (M7's book plate).
          { settled: false }
        : {
            settled:
              inspectionLogged && !shortReceipt && openClaims.length === 0,
            // Every one of these is a live condition, not a missing signature:
            // the goods are short, damaged, or unlooked-at right now. The gate
            // stops the work even though a claim technically evidences step 10
            // and puts the trail's position past the gate.
            holdsOpen:
              openClaims.length > 0 || shortReceipt || !inspectionLogged,
            // An open claim is the loudest fact about a receipt and outranks
            // everything else the gate could say about it.
            qualifier: openClaims.length
              ? 'open claim'
              : shortReceipt
                ? 'short receipt'
                : !inspectionLogged
                  ? 'awaiting inspection'
                  : undefined,
          },
    // №8 docket: nothing in the schema records warehouse custody or site
    // readiness. The gate is drawn, and it is drawn empty.
    warehouse_and_site_ready: { settled: false, noRecord: true },
  };

  return assembleProcurementReading('studio', evidence, gates);
}

/**
 * The ledger's entry point — a reading at PURCHASE-ORDER grain.
 *
 * The orders book is a register of orders, not of lines, and feeding a PO's
 * status into the item-status field would be a category error: the two
 * vocabularies overlap but are not the same machine.
 *
 * **Gate G2 cannot settle at this grain, by construction.** Disposition is
 * item-level — counts and claims hang off FF&E lines, and one PO can carry
 * twenty of them. So G2 is declared record-less here: it reads `unreached`
 * while the order is still in flight (which is what lets the book name it as
 * the next gate, per M7), and goes quiet once delivery is past rather than
 * inventing an "awaiting inspection" the register cannot see.
 */
export function derivePurchaseOrderLifecycle(
  po: ProcurementLifecyclePurchaseOrder,
): ProcurementLifecycleReading {
  return deriveProcurementLifecycle({
    // No item machine at this grain — the PO speaks for itself.
    status: '',
    purchase_order: po,
    grain: 'purchase_order',
  });
}
