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
 * No DAMAGED stamp at the line grain (R7): claims are PO-level data (00150,
 * no item FK) and would over-attribute on multi-item POs. Claims surface via
 * the line unfold (Slice 4), the Orders ledger, and a Desk need line; the
 * per-item DAMAGED stamp returns in Slice 4 with an additive ffe_item_id FK.
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
  | 'received' // derived: delivered + inspection logged
  | 'decision_due'; // derived: blocked by a pending blocking decision

export interface LineStampInput {
  status: string;
  blocked: boolean | null;
  received_quantity: number | null;
  blocking_decision?: { status: string; due_date: string | null } | null;
}

export interface LineStamp {
  kind: LineStampKind;
  /** Always the CURRENT due date (R2): extensions narrate in the margin, never the stamp. */
  dueDate: string | null;
}

export function deriveLineStamp(item: LineStampInput): LineStamp {
  if (item.blocked && item.blocking_decision?.status === 'pending') {
    return { kind: 'decision_due', dueDate: item.blocking_decision.due_date ?? null };
  }

  if (item.status === 'delivered') {
    return { kind: item.received_quantity != null ? 'received' : 'delivered', dueDate: null };
  }

  return {
    kind: MACHINE.has(item.status) ? (item.status as LineStampKind) : 'specified',
    dueDate: null,
  };
}
