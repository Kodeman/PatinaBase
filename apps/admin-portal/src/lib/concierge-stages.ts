// ─────────────────────────────────────────────────────────────────────────────
// Concierge order lifecycle helpers — PURE module (no React, no I/O).
//
// /mission-control/orders (WP-2.3) renders a ledger-style list of concierge
// orders walking the lifecycle:
//   po_draft -> po_sent -> freight_booked -> in_transit -> delivered ->
//   reconciled   (+ cancelled, from any non-terminal stage)
//
// Stage ordering, the checklist-complete / next-undone-required-item finders,
// the age-in-stage + damage-deadline countdown formatters, and the
// payment-flag -> status-dot mapping all live here so the jest suite can assert
// them without a DOM or a database — mirrors lib/pipeline-stages.ts.
//
// Server truth of record: advance_concierge_order() (00308) enforces the same
// forward-only ordering + checklist gate in the database; these helpers drive
// the UI (disabled buttons, blocking-item hints) and MUST NOT diverge from it.
// ─────────────────────────────────────────────────────────────────────────────

export type ConciergeStage =
  | 'po_draft'
  | 'po_sent'
  | 'freight_booked'
  | 'in_transit'
  | 'delivered'
  | 'reconciled'
  | 'cancelled';

/** The forward-only lifecycle order (excludes the special-cased 'cancelled'). */
export const CONCIERGE_STAGES: readonly ConciergeStage[] = [
  'po_draft',
  'po_sent',
  'freight_booked',
  'in_transit',
  'delivered',
  'reconciled',
] as const;

export const CONCIERGE_TERMINAL_STAGES: readonly ConciergeStage[] = ['reconciled', 'cancelled'] as const;

export const CONCIERGE_STAGE_LABELS: Record<ConciergeStage, string> = {
  po_draft: 'PO Draft',
  po_sent: 'PO Sent',
  freight_booked: 'Freight Booked',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  reconciled: 'Reconciled',
  cancelled: 'Cancelled',
};

export function isConciergeStage(v: string): v is ConciergeStage {
  return v === 'cancelled' || (CONCIERGE_STAGES as readonly string[]).includes(v);
}

export function isTerminalStage(stage: ConciergeStage): boolean {
  return (CONCIERGE_TERMINAL_STAGES as readonly string[]).includes(stage);
}

/** The immediate next stage in the forward-only walk, or null at/after reconciled. */
export function nextStage(stage: ConciergeStage): ConciergeStage | null {
  const idx = CONCIERGE_STAGES.indexOf(stage);
  if (idx < 0 || idx >= CONCIERGE_STAGES.length - 1) return null;
  return CONCIERGE_STAGES[idx + 1];
}

// ─── Checklist shape + predicates ───────────────────────────────────────────

export interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
  done: boolean;
  done_at: string | null;
  by: string | null;
}

/** Per-stage checklist map as stored in concierge_orders.checklists. */
export type Checklists = Partial<Record<ConciergeStage, ChecklistItem[]>>;

/** First required + undone item in a stage's checklist, or null when all clear. */
export function nextUndoneRequiredItem(items: ChecklistItem[] | undefined | null): ChecklistItem | null {
  if (!items) return null;
  return items.find((i) => i.required && !i.done) ?? null;
}

/** True when no required item in the stage's checklist is undone. */
export function isStageChecklistComplete(items: ChecklistItem[] | undefined | null): boolean {
  return nextUndoneRequiredItem(items) === null;
}

/** Count of required + undone items (drives the "N to do" hint on the Advance button). */
export function requiredRemaining(items: ChecklistItem[] | undefined | null): number {
  if (!items) return 0;
  return items.filter((i) => i.required && !i.done).length;
}

export interface AdvanceGate {
  /** Can the order advance to its next stage right now (checklist satisfied)? */
  allowed: boolean;
  /** The item blocking the advance, if any (for an inline hint). */
  blocking: ChecklistItem | null;
  /** The stage it would advance INTO, or null if terminal. */
  to: ConciergeStage | null;
}

/**
 * Whether an order can advance without a force override, mirroring
 * advance_concierge_order's gate: terminal stages never advance; otherwise the
 * CURRENT stage's required items must all be done.
 */
export function advanceGate(stage: ConciergeStage, checklists: Checklists): AdvanceGate {
  if (isTerminalStage(stage)) return { allowed: false, blocking: null, to: null };
  const items = checklists[stage];
  const blocking = nextUndoneRequiredItem(items);
  return { allowed: blocking === null, blocking, to: nextStage(stage) };
}

// ─── Age-in-stage (shared shape with lib/pipeline-stages.ts) ─────────────────

export function daysInStage(
  stageEnteredAt: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!stageEnteredAt) return 0;
  const entered = Date.parse(stageEnteredAt);
  if (Number.isNaN(entered)) return 0;
  return Math.max(0, now.getTime() - entered) / (1000 * 60 * 60 * 24);
}

/** DM-Mono-style short age, e.g. "<1h", "6h", "12d". */
export function formatAgeInStage(
  stageEnteredAt: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!stageEnteredAt) return '—';
  const entered = Date.parse(stageEnteredAt);
  if (Number.isNaN(entered)) return '—';
  const ms = Math.max(0, now.getTime() - entered);
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ─── Damage carrier-deadline countdown ──────────────────────────────────────

/** Threshold (days) at/under which the carrier deadline is "urgent" — matches the escalation scan (<7d). */
export const DAMAGE_DEADLINE_URGENT_DAYS = 7;

/** Whole days from now to the deadline (date-only). Negative = past due. */
export function daysUntilDeadline(
  deadline: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!deadline) return null;
  const end = Date.parse(deadline);
  if (Number.isNaN(end)) return null;
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const endDay = new Date(end);
  const endUtc = Date.UTC(endDay.getUTCFullYear(), endDay.getUTCMonth(), endDay.getUTCDate());
  return Math.round((endUtc - startOfToday) / (1000 * 60 * 60 * 24));
}

/** "overdue", "due today", "1d left", "5d left" — or "—" when no deadline. */
export function formatCountdown(
  deadline: string | null | undefined,
  now: Date = new Date(),
): string {
  const d = daysUntilDeadline(deadline, now);
  if (d === null) return '—';
  if (d < 0) return 'overdue';
  if (d === 0) return 'due today';
  return `${d}d left`;
}

/** True when the carrier deadline is within the urgent window (or past). */
export function isDeadlineUrgent(
  deadline: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const d = daysUntilDeadline(deadline, now);
  return d !== null && d <= DAMAGE_DEADLINE_URGENT_DAYS;
}

// ─── Payment-flag presentation ──────────────────────────────────────────────

export type PaymentFlag = 'unchecked' | 'ok' | 'mismatch';

/** StatusDot variant for a payment flag (mismatch = terracotta/error). */
export function paymentFlagVariant(flag: PaymentFlag): 'success' | 'error' | 'neutral' {
  if (flag === 'mismatch') return 'error';
  if (flag === 'ok') return 'success';
  return 'neutral';
}

export const PAYMENT_FLAG_LABELS: Record<PaymentFlag, string> = {
  unchecked: 'Unchecked',
  ok: 'Ledger OK',
  mismatch: 'Mismatch',
};
