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
  // US-21 D1 (Q3): the four pre-order stage words, from deriveLineStage. They
  // replace the `specified` fallthrough; `quoted` and `approved` keep their
  // words, as every word from `ordered` on does.
  | 'placeholder'
  | 'specced'
  | 'ready'
  | 'released'
  // Never derived any more (SPECIFIED never prints). Kept because the stage
  // dropdown still names it (F58's parity spec) and ticket-derivation keys on it.
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
  /** US-21 D1: the pre-order stage's inputs, always built from the row with
   *  `lineStageInputFromRow`. Read only when nothing above it decides. */
  stage: LineStageInput;
}

/** US-21 D1 (Q3): where a line stands before an order. `ffe_line_stage` (00736)
 *  computes the same word server-side. */
export type LineStage = 'placeholder' | 'specced' | 'ready' | 'released';

export type LineAuthorizationState = 'sent' | 'client_signed' | 'executed';

/** CONTRACT §3.3. Rough $ (`rough_cents`) is deliberately not an input: a rough
 *  figure never changes the word (R7c, R9a). */
export interface LineStageInput {
  productId: string | null;
  vendorId: string | null;
  vendorName: string | null;
  quantity: number;
  itemType: 'fixed' | 'allowance' | 'tbd';
  unitPriceCents: number | null;
  budgetMaxCents: number | null;
  /** `ffe_line_authorization` (00736): the line's OWN authorization, never its piece's. */
  authorizationState: LineAuthorizationState | null;
  lineKind: 'goods' | 'labor';
  /** Labor only: its piece's stage. */
  parentStage?: LineStage | null;
}

/** The `project_ffe_items` columns (and the 00736 computed field) D1 reads, as
 *  `useProjectFFEItems` returns them. */
export interface LineStageRow {
  status?: string | null;
  product_id?: string | null;
  vendor_id?: string | null;
  vendor_name?: string | null;
  quantity?: number | null;
  item_type?: string | null;
  unit_price_cents?: number | null;
  budget_max_cents?: number | null;
  ffe_line_authorization?: string | null;
  line_kind?: string | null;
  parent_ffe_item_id?: string | null;
}

/** A schedule row as the stamp's callers hold it, before the stage is built. */
export type LineStampRow = Omit<LineStampInput, 'stage'> & LineStageRow;

const AUTHORIZATION_STATES: ReadonlySet<string> = new Set(['sent', 'client_signed', 'executed']);
/** Where `ffe_line_stage` returns NULL and the goods words take over (row 5). */
const ORDERED_ON: ReadonlySet<string> = new Set([
  'ordered',
  'production',
  'shipped',
  'delivered',
  'installed',
]);

/**
 * D1 rows 6–9 and the labor rule, first match wins; the SQL mirror is
 * `ffe_line_stage` (00736). A maker is a vendor, or a vendor name that is not
 * blank. `tbd` is never ready. A labor line is ready only when its piece is,
 * and is released only by its own authorization (00733 puts it on its piece's).
 */
export function deriveLineStage(input: LineStageInput): LineStage {
  if (input.authorizationState != null) return 'released';
  const hasMaker =
    input.productId != null ||
    input.vendorId != null ||
    (input.vendorName ?? '').replace(/^ +| +$/g, '') !== '';
  if (!hasMaker) return 'placeholder';
  const priced =
    (input.itemType === 'fixed' && (input.unitPriceCents ?? 0) > 0) ||
    (input.itemType === 'allowance' && (input.budgetMaxCents ?? 0) > 0);
  const pieceReady =
    input.lineKind !== 'labor' ||
    input.parentStage === 'ready' ||
    input.parentStage === 'released';
  return input.quantity > 0 && priced && pieceReady ? 'ready' : 'specced';
}

/** The one mapping from a snake_case row to D1's input. Pass a labor line's
 *  piece as `parent`; it is ignored on any other line. */
export function lineStageInputFromRow(
  row: LineStageRow,
  parent?: LineStageRow | null,
): LineStageInput {
  const lineKind = isLaborLine(row) ? 'labor' : 'goods';
  const authorization = row.ffe_line_authorization ?? null;
  return {
    productId: row.product_id ?? null,
    vendorId: row.vendor_id ?? null,
    vendorName: row.vendor_name ?? null,
    quantity: row.quantity ?? 0,
    itemType:
      row.item_type === 'fixed' || row.item_type === 'allowance' ? row.item_type : 'tbd',
    unitPriceCents: row.unit_price_cents ?? null,
    budgetMaxCents: row.budget_max_cents ?? null,
    authorizationState:
      authorization != null && AUTHORIZATION_STATES.has(authorization)
        ? (authorization as LineAuthorizationState)
        : null,
    lineKind,
    // As 00736 reads it: a piece from `ordered` on has no pre-order stage.
    parentStage:
      lineKind === 'labor' && parent && !ORDERED_ON.has(parent.status ?? '')
        ? deriveLineStage(lineStageInputFromRow(parent))
        : null,
  };
}

/** A labor line prints LABOR beside its stage word, never instead of it. */
export function isLaborLine(row: { line_kind?: string | null }): boolean {
  return row.line_kind === 'labor';
}

/** A labor line's piece, from the rows already in hand; `null` on any other line. */
export function laborPiece<T extends { id: string }>(
  row: { line_kind?: string | null; parent_ffe_item_id?: string | null },
  rows: readonly T[] | null | undefined,
): T | null {
  if (!isLaborLine(row) || !row.parent_ffe_item_id) return null;
  return (rows ?? []).find((r) => r.id === row.parent_ffe_item_id) ?? null;
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

/** A damage claim still standing on a line. Exported because the rail's Pieces
 *  value dates the same claim this stamps the line for (W2 design review, item
 *  11), and two lists would let the date and the stamp name different damage. */
export const OPEN_DAMAGE_CLAIM_STATES: ReadonlySet<string> = new Set([
  'drafted',
  'vendor_notified',
]);
const OPEN_CLAIM_STATES = OPEN_DAMAGE_CLAIM_STATES;

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

  // D1 rows 6–9 replace the `specified` fallthrough (and an unknown status):
  // SPECIFIED never prints. Every other machine word stands.
  if (item.status !== 'specified' && MACHINE.has(item.status)) {
    return { kind: item.status as LineStampKind, dueDate: null };
  }
  return { kind: deriveLineStage(item.stage), dueDate: null };
}

/**
 * The price a line prints when it has none (fix-now #5). The column defaults
 * to 0 (00066), so a rough line with no product reads `$0` unless this says
 * otherwise. An allowance is priced by its ceiling, and a line with a product
 * at 0 is a stated price, so both keep their figure. `null` means print the
 * price as usual.
 */
export function priceWord(row: {
  unit_price_cents: number | null;
  product_id: string | null;
  item_type?: string | null;
}): 'Not priced' | null {
  return row.unit_price_cents === 0 &&
    row.product_id == null &&
    row.item_type !== 'allowance'
    ? 'Not priced'
    : null;
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
  // Q3's words; the stamp's CSS uppercases them like every other.
  placeholder: 'Placeholder',
  specced: 'Specced',
  ready: 'Ready',
  released: 'Released',
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

/** The word printed beside a labor line's stage word (SPEC §2.4). */
export const LABOR_STAMP_LABEL = 'Labor';
