/**
 * Line stamp derivation — spec v1.1 §6, ruling R2.
 *
 * Pure function from a project_ffe_items row (with its blocking-decision and
 * PO→receiving joins) to the stamp identity on a document line. Stamps are a
 * PURE RENDERING of the DB-enforced FF&E machine (00184) — no parallel store.
 *
 * Deliberately free of stages.ts (it pulls @patina/help-system — the Jest ESM
 * trap): this module returns semantic keys; components resolve label/color
 * through STAGE_CONFIG (R2: the canonical source) at render time.
 *
 * DAMAGED is item-grain only (R7 → 00196): it stamps when an OPEN claim is
 * attributed to THIS item via damage_claims.ffe_item_id. PO-grain claims
 * (ffe_item_id NULL) never stamp a line — they surface on the Desk need
 * line and in the unfold's receiving column.
 */

const MACHINE = new Set([
  'specified',
  'quoted',
  'approved',
  'ordered',
  'production',
  'shipped',
  'delivered',
  'installed',
]);

export type LineStampKind =
  | 'specified'
  | 'quoted'
  | 'approved'
  | 'ordered'
  | 'production'
  | 'shipped'
  | 'delivered' // status delivered, no inspection yet — a visible to-do (R2)
  | 'installed'
  | 'received' // derived: delivered + inspection logged at full count
  | 'partial' // derived: delivered + inspected short (R18/W5-T2 — surfaced, not invented)
  | 'damaged' // derived: OPEN claim attributed to this item (00196)
  | 'decision_due' // derived: blocked by a pending blocking decision
  // Trade work runs its own journey (Act IV): goods arrive, work is judged.
  // A trade line's logistics stamp is its scope's progress state, because
  // "ordered / shipped / delivered" says nothing true about tile setting.
  | 'trade_engaged'
  | 'trade_in_progress'
  | 'trade_substantially_complete'
  | 'trade_accepted'
  // The line IS on a trade scope, but the caller does not yet have that
  // scope's real progress (its query is still loading, or is disabled for
  // this view — e.g. install mode). Renders quiet: no badge is better than a
  // guessed one, because 'Engaged' can be flatly wrong for a line that is
  // actually substantially complete or accepted.
  | 'trade_pending';

export interface LineStampInput {
  status: string;
  blocked: boolean | null;
  received_quantity: number | null;
  /** Ordered count — lets PARTIAL surface when the inspected count ran short. */
  quantity?: number | null;
  blocking_decision?: { status: string; due_date: string | null } | null;
  /** damage_claims rows FK'd to this item (damage_claims!ffe_item_id embed). */
  item_claims?: { state: string }[] | null;
  /** Set on a trade scope's presence lines — the pcd this line belongs to. */
  trade_scope_document_id?: string | null;
}

/**
 * Where a trade scope's work has got to, as the schedule needs to read it.
 * The caller resolves this from the project's trade scopes (the schedule row
 * carries the document id; the progress lives on the scope's terms).
 */
export type TradeLineProgress =
  | 'none'
  | 'engaged'
  | 'in_progress'
  | 'substantially_complete'
  | 'accepted';

const TRADE_STAMP: Record<TradeLineProgress, LineStampKind> = {
  none: 'trade_engaged',
  engaged: 'trade_engaged',
  in_progress: 'trade_in_progress',
  substantially_complete: 'trade_substantially_complete',
  accepted: 'trade_accepted',
};

export interface LineStamp {
  kind: LineStampKind;
  /** Always the CURRENT due date (R2): extensions narrate in the margin, never the stamp. */
  dueDate: string | null;
}

const OPEN_CLAIM_STATES = new Set(['drafted', 'vendor_notified']);

export function deriveLineStamp(
  item: LineStampInput,
  /** The scope's progress, for a trade presence line. Omitted elsewhere. */
  tradeProgress?: TradeLineProgress | null,
): LineStamp {
  if (item.blocked && item.blocking_decision?.status === 'pending') {
    return { kind: 'decision_due', dueDate: item.blocking_decision.due_date ?? null };
  }

  if ((item.item_claims ?? []).some((c) => OPEN_CLAIM_STATES.has(c.state))) {
    return { kind: 'damaged', dueDate: null };
  }

  // A presence line exists because a scope was ENGAGED, so it never reads as
  // "specified" — the earliest truthful thing it can say is Engaged. A line
  // whose scope cannot be resolved (the caller never tracks trade progress
  // — omitted, `undefined`) falls back to the same word rather than
  // borrowing the goods machine's vocabulary. A caller that DOES track trade
  // progress but does not have it resolved YET must say so explicitly with
  // `null`, which reads quiet rather than guessing Engaged.
  if (item.trade_scope_document_id) {
    if (tradeProgress === null) {
      return { kind: 'trade_pending', dueDate: null };
    }
    return { kind: TRADE_STAMP[tradeProgress ?? 'none'], dueDate: null };
  }

  if (item.status === 'delivered') {
    if (item.received_quantity == null) return { kind: 'delivered', dueDate: null };
    // R18: the W5-T2 per-item counts make short receipts visible — PARTIAL
    // when the inspection logged fewer than ordered (truth surfaced, never
    // invented; quantity unknown ⇒ fall back to RECEIVED).
    const short = item.quantity != null && item.received_quantity < item.quantity;
    return { kind: short ? 'partial' : 'received', dueDate: null };
  }

  return {
    kind: MACHINE.has(item.status) ? (item.status as LineStampKind) : 'specified',
    dueDate: null,
  };
}

/**
 * The word a stamp prints — F58, ruling: one derivation, one word per state.
 * Every surface that names a line's lifecycle reads this, so the paper and the
 * spine's spec-book leaf cannot drift apart again.
 *
 * The eight machine words are STAGE_CONFIG's, carried as literals rather than
 * imported: stages.ts pulls @patina/help-system (the Jest ESM trap this module
 * stays clear of, per the header above).
 *
 * `delivered` is the one deliberate divergence from STAGE_CONFIG, whose word
 * is still `Received`: the FF&E board's dropdown names the stage a line can be
 * moved TO, while a stamp names what is true of the goods — and arrived is not
 * inspected. `trade_pending` is empty by design (no badge beats a guessed one);
 * callers render nothing for it.
 */
const LINE_STAMP_LABEL: Record<LineStampKind, string> = {
  specified: 'Specified',
  quoted: 'Quoted',
  approved: 'Approved',
  ordered: 'Released to maker',
  production: 'In production',
  shipped: 'In transit',
  delivered: 'Delivered',
  installed: 'Installed',
  received: 'Received',
  partial: 'Partial',
  damaged: 'Damaged',
  decision_due: 'Decision due',
  trade_engaged: 'Engaged',
  trade_in_progress: 'In progress',
  trade_substantially_complete: 'Substantially complete',
  trade_accepted: 'Accepted',
  trade_pending: '',
};

export function lineStampLabel(kind: LineStampKind): string {
  return LINE_STAMP_LABEL[kind];
}
