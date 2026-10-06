/**
 * C-30 (d2 §M7, D1-10): the exceptions overlay's rules, kept pure so the
 * clock sentences, the resolution paths and the substitution chain can be
 * read and tested without a database. exception-overlay.tsx prints them.
 *
 * One exception per problem (procurement_exceptions, 00708): a type, a
 * status and a clock printed as a date with its basis in words, never a
 * countdown. Each resolution path calls resolve_procurement_exception, plus
 * the start_purchase_order_change it needs. Substitution crosses to the
 * client on the existing decision rail. R7 is open: client wording stays
 * neutral and promises no dates.
 */

import type {
  ProcurementExceptionStatus,
  ProcurementExceptionType,
  ProcurementResolutionPath,
  PurchaseOrderChangeKind,
  ResolveProcurementExceptionRequest,
  StartPurchaseOrderChangeInput,
} from '@patina/supabase';
import type { LineAuthorization } from '@/lib/document/authorization-derivation';
import { WEEKDAY_SHORT_FORMAT, dayMonth, parseSourceDate } from '@/lib/document/dates';
import { fmtUsd, todayYmd } from '@/lib/document/format';
import { formatMarkup } from '@/lib/document/buying-readings';
import { changeGate, type ChangeGate } from '../line-unfold/change-order';

/** The exception as the overlay reads it: the row's own columns. */
export interface ExceptionLike {
  id: string;
  project_id: string;
  type: string;
  status: string;
  ffe_item_id: string | null;
  purchase_order_id: string | null;
  inspection_id?: string | null;
  damage_claim_id?: string | null;
  clock_due_on: string | null;
  clock_basis: string | null;
  client_decision_id: string | null;
  po_change_id: string | null;
  note?: string | null;
}

export const EXCEPTION_TYPE_LABEL: Record<ProcurementExceptionType, string> = {
  concealed_damage: 'Concealed damage',
  damage: 'Damage',
  short_ship: 'Short shipment',
  wrong_item: 'Wrong item',
  ack_discrepancy: 'Acknowledgment differs',
  delay: 'Delay',
  backorder: 'Backorder',
  discontinued: 'Discontinued',
  price_change: 'Price change',
};

export const exceptionTypeLabel = (type: string): string =>
  EXCEPTION_TYPE_LABEL[type as ProcurementExceptionType] ?? 'Exception';

export const EXCEPTION_STATUS_LABEL: Record<ProcurementExceptionStatus, string> = {
  open: 'open',
  awaiting_vendor: 'with the maker',
  awaiting_client: 'with the client',
  resolved: 'resolved',
};

/** The types a member opens with "Something's wrong" (ack_discrepancy opens
 *  from an acknowledgment, never by hand). */
export const OPENABLE_TYPES: ReadonlyArray<{
  type: Exclude<ProcurementExceptionType, 'ack_discrepancy'>;
  hint: string;
}> = [
  { type: 'damage', hint: 'It arrived damaged.' },
  { type: 'concealed_damage', hint: 'Damage found after the carrier left.' },
  { type: 'short_ship', hint: 'Fewer pieces arrived than were ordered.' },
  { type: 'wrong_item', hint: 'Something other than what was ordered arrived.' },
  { type: 'delay', hint: 'The date moved later.' },
  { type: 'backorder', hint: 'The maker cannot make it by the date.' },
  { type: 'discontinued', hint: 'The maker no longer makes it.' },
  { type: 'price_change', hint: 'The maker wants more than was agreed.' },
];

const CLAIM_TYPES: ReadonlySet<string> = new Set([
  'concealed_damage',
  'damage',
  'short_ship',
  'wrong_item',
]);

/** Damage, short-ship and wrong-item exceptions make a vendor claim notice. */
export const isClaimType = (type: string) => CLAIM_TYPES.has(type);

/** What an exception with no clock says instead, in words. */
const NO_CLOCK: Record<ProcurementExceptionType, string> = {
  concealed_damage: 'The clock starts once the delivery is recorded.',
  damage: 'The clock starts once the delivery is recorded.',
  short_ship: 'The clock starts once the delivery is recorded.',
  wrong_item: 'The clock starts once the delivery is recorded.',
  ack_discrepancy: 'No clock recorded. Answer the maker in the acknowledgment.',
  delay: 'No clock. A delay is kept for the record.',
  backorder: 'No order-by date. The schedule sets none for this piece.',
  discontinued: 'No clock. Choose a substitute or cancel.',
  price_change: 'No clock. A higher price on a signed line is a change order.',
};

export interface ExceptionClock {
  sentence: string;
  /** The date is behind us; the line prints in golden ink. */
  passed: boolean;
}

/**
 * The clock as one dated sentence with its basis in words (00708 writes the
 * basis: "Hewn wants written notice within 3 days of delivery."). Never a
 * countdown; a passed date still reads as a date.
 */
export function exceptionClockSentence(
  exception: Pick<ExceptionLike, 'type' | 'clock_due_on' | 'clock_basis'>,
  today: string = todayYmd(),
): ExceptionClock {
  const due = exception.clock_due_on;
  const date = parseSourceDate(due ?? null);
  if (!due || !date) {
    return {
      sentence:
        NO_CLOCK[exception.type as ProcurementExceptionType] ?? 'No clock.',
      passed: false,
    };
  }
  const day = `${WEEKDAY_SHORT_FORMAT.format(date)} ${dayMonth(date)}`;
  const basis = exception.clock_basis?.trim() || '';
  const passed = due.slice(0, 10) < today;
  const lead = passed
    ? `Was due ${day}${isClaimType(exception.type) ? ' — you can still file' : ''}.`
    : `By ${day}.`;
  return { sentence: basis ? `${lead} ${basis}` : lead, passed };
}

/** One resolution path the overlay offers, per d2 §M7's type table. */
export interface PathOption {
  path: ProcurementResolutionPath;
  label: string;
  hint: string;
  /** The start_purchase_order_change kind the path records, if any. */
  change: Exclude<PurchaseOrderChangeKind, 'new_scope'> | null;
  /** The maker may owe money back: a refund or credit row can be recorded. */
  moneyBack?: boolean;
}

const ACCEPT: PathOption = { path: 'accept', label: 'Accept', hint: 'Keep it as it is.', change: null };
const CREDIT: PathOption = {
  path: 'credit',
  label: 'Credit',
  hint: 'The maker owes the studio money back.',
  change: 'credit',
  moneyBack: true,
};
const SUBSTITUTE: PathOption = {
  path: 'substitute',
  label: 'Substitute',
  hint: 'Offer the client alternates; they choose.',
  change: null,
};
const CANCEL: PathOption = {
  path: 'cancel',
  label: 'Cancel',
  hint: 'Stop the order; any deposit comes back as a refund or credit.',
  change: 'cancellation',
  moneyBack: true,
};

export const RESOLUTION_PATHS: Record<ProcurementExceptionType, readonly PathOption[]> = {
  damage: [
    { path: 'repair', label: 'Repair', hint: 'The maker repairs it.', change: 'remedy' },
    { path: 'replace', label: 'Replace', hint: 'The maker sends a new one.', change: 'remedy' },
    CREDIT,
    ACCEPT,
  ],
  concealed_damage: [
    { path: 'repair', label: 'Repair', hint: 'The maker repairs it.', change: 'remedy' },
    { path: 'replace', label: 'Replace', hint: 'The maker sends a new one.', change: 'remedy' },
    CREDIT,
    ACCEPT,
  ],
  short_ship: [
    { path: 'reship', label: 'Reship', hint: 'The maker sends what is missing.', change: 'remedy' },
    CREDIT,
    ACCEPT,
  ],
  wrong_item: [
    { path: 'reship', label: 'Reship', hint: 'The maker sends the right piece.', change: 'remedy' },
    CREDIT,
    ACCEPT,
  ],
  // Answered through the acknowledgment's lines (resolve_ack_line), never here.
  ack_discrepancy: [],
  delay: [{ ...ACCEPT, hint: 'Note the new date and carry on.' }],
  backorder: [
    { path: 'wait', label: 'Wait', hint: 'Keep the order for the new date.', change: null },
    SUBSTITUTE,
    CANCEL,
  ],
  discontinued: [SUBSTITUTE, CANCEL],
  price_change: [{ ...ACCEPT, hint: 'Pay the new price.' }, SUBSTITUTE, CANCEL],
};

/**
 * The paths an exception offers. A path that changes the PO needs a PO (a
 * line not yet ordered has nothing to cancel or credit); a substitution needs
 * the line it replaces.
 */
export function pathsFor(
  exception: Pick<ExceptionLike, 'type' | 'purchase_order_id' | 'ffe_item_id'>,
): readonly PathOption[] {
  return (RESOLUTION_PATHS[exception.type as ProcurementExceptionType] ?? []).filter(
    (p) =>
      (p.change === null || !!exception.purchase_order_id) &&
      (p.path !== 'substitute' || !!exception.ffe_item_id),
  );
}

/**
 * R8 (ruled): once the client signed for the line, a price-bearing path is a
 * change order they approve first. Accepting a higher price is one too.
 */
export function pathGate(
  type: string,
  option: PathOption,
  auth: LineAuthorization,
): ChangeGate {
  if (type === 'price_change' && option.path === 'accept') return changeGate('credit', auth);
  if (option.change && option.change !== 'cancellation') return changeGate(option.change, auth);
  return { held: false };
}

/** The server's own rule (00449): fewer than 5 characters is refused. */
export const MIN_CHANGE_REASON = 5;

export interface ResolutionPlan {
  /** The linked start_purchase_order_change, when the path needs one. */
  change: StartPurchaseOrderChangeInput | null;
  /** resolve_procurement_exception's request; poChangeId is filled in from
   *  the change's answer before it is sent. */
  resolve: ResolveProcurementExceptionRequest;
}

/**
 * The exact arguments one path sends: the PO change (when the path has one
 * and the exception sits on a PO), then the resolution with its path.
 */
export function resolutionPlan({
  exception,
  option,
  reason,
}: {
  exception: Pick<ExceptionLike, 'type' | 'project_id' | 'purchase_order_id' | 'ffe_item_id'>;
  option: PathOption;
  reason: string;
}): ResolutionPlan {
  const why = reason.trim();
  const change: StartPurchaseOrderChangeInput | null =
    option.change && exception.purchase_order_id
      ? {
          purchaseOrderId: exception.purchase_order_id,
          projectId: exception.project_id,
          changeKind: option.change,
          reason: why,
          selectionId: exception.ffe_item_id,
        }
      : null;
  return {
    change,
    resolve: { status: 'resolved', resolutionPath: option.path, note: why || null },
  };
}

// ─── Substitution (d2 §M7 steps 1–4) ────────────────────────────────────────

/** A project line as the substitution reads it. */
export interface SubstituteLine {
  id: string;
  name: string;
  design_disposition?: string | null;
  removed_at?: string | null;
  product_id?: string | null;
  unit_price_cents?: number | null;
  trade_price_cents?: number | null;
  purchase_order_id?: string | null;
  assignment_scope?: string | null;
  project_room_id?: string | null;
  vendor_id?: string | null;
}

/** The decision as the substitution reads it (client_decisions + options). */
export interface SubstitutionDecision {
  id: string;
  status: string;
  options?: ReadonlyArray<{
    id: string;
    name: string;
    selected: boolean;
    sort_order: number;
    product_id: string | null;
  }> | null;
}

/** The alternates a member can offer: live `alternate` lines of the project. */
export function alternateCandidates(
  lines: readonly SubstituteLine[],
  originalId: string,
): SubstituteLine[] {
  return lines.filter(
    (l) => l.id !== originalId && !l.removed_at && l.design_disposition === 'alternate',
  );
}

export interface AlternateReading {
  price: string | null;
  markup: string | null;
  /** R5 (ruled): a below-trade alternate is allowed, with this warning. */
  warning: string | null;
}

/**
 * R5: an alternate below trade is allowed; its negative markup prints plainly
 * with a warning. Markup and warning show only to a member who may see the
 * studio's margin (C-36), as on the line card.
 */
export function alternateReading(line: SubstituteLine, canSeeMargin: boolean): AlternateReading {
  const client = line.unit_price_cents ?? null;
  const price = client != null ? fmtUsd(client) : null;
  if (!canSeeMargin) return { price, markup: null, warning: null };
  const trade = line.trade_price_cents ?? null;
  if (client == null || trade == null || trade <= 0) return { price, markup: null, warning: null };
  const pct = Math.round(((client - trade) / trade) * 100);
  return {
    price,
    markup: `${formatMarkup(pct)} markup`,
    warning:
      client < trade
        ? `Below trade: the client price is under what the studio pays for ${line.name}. Offering it is allowed.`
        : null,
  };
}

/** The decision's original option: request_substitution_approval puts it first. */
const isOriginalOption = (option: { sort_order: number }) => option.sort_order === 0;

/** The line the client chose: the alternate whose product (or name) the
 *  selected option carries. After the change it is the selected line. */
export function chosenAlternate(
  decision: SubstitutionDecision | null | undefined,
  lines: readonly SubstituteLine[],
  originalId: string,
): SubstituteLine | null {
  const option = decision?.options?.find((o) => o.selected);
  if (!option || isOriginalOption(option)) return null;
  return (
    lines.find(
      (l) =>
        l.id !== originalId &&
        !l.removed_at &&
        (l.design_disposition === 'alternate' || l.design_disposition === 'selected') &&
        (option.product_id ? l.product_id === option.product_id : l.name === option.name),
    ) ?? null
  );
}

export type SubstitutionStage =
  /** No decision yet: pick alternates and ask the client. */
  | { stage: 'pick' }
  | { stage: 'loading' }
  /** The decision draft exists; the studio releases it on the rail. */
  | { stage: 'release'; decisionId: string }
  | { stage: 'with_client'; decisionId: string }
  | { stage: 'expired'; decisionId: string }
  /** The client kept the original; the other paths remain. */
  | { stage: 'kept' }
  /** The client chose an alternate we cannot find among the lines. */
  | { stage: 'unmatched'; optionName: string }
  /** The client chose: run the PO change and swap the lines. */
  | { stage: 'chosen'; alternate: SubstituteLine }
  /** Change recorded: order the alternate on the order paper. */
  | { stage: 'order'; alternate: SubstituteLine }
  /** The replacement PO exists: close the exception against it. */
  | { stage: 'close'; alternate: SubstituteLine; replacementPoId: string };

/**
 * Where the substitution chain stands, read off the exception, its decision
 * and the project's lines. The change counts as made once the exception moved
 * on from awaiting_client (the overlay moves it to awaiting_vendor with the
 * change linked).
 */
export function substitutionStage({
  exception,
  decision,
  lines,
}: {
  exception: Pick<ExceptionLike, 'client_decision_id' | 'po_change_id' | 'status' | 'ffe_item_id'>;
  decision: SubstitutionDecision | null | undefined;
  lines: readonly SubstituteLine[];
}): SubstitutionStage {
  const decisionId = exception.client_decision_id;
  if (!decisionId) return { stage: 'pick' };
  if (!decision) return { stage: 'loading' };
  if (decision.status === 'draft') return { stage: 'release', decisionId };
  if (decision.status === 'pending') return { stage: 'with_client', decisionId };
  if (decision.status === 'expired') return { stage: 'expired', decisionId };
  const option = decision.options?.find((o) => o.selected);
  if (!option || isOriginalOption(option)) return { stage: 'kept' };
  const alternate = chosenAlternate(decision, lines, exception.ffe_item_id ?? '');
  if (!alternate) return { stage: 'unmatched', optionName: option.name };
  const changed = exception.status === 'awaiting_vendor' || Boolean(exception.po_change_id);
  if (!changed) return { stage: 'chosen', alternate };
  if (alternate.purchase_order_id) {
    return { stage: 'close', alternate, replacementPoId: alternate.purchase_order_id };
  }
  return { stage: 'order', alternate };
}

export interface MoneyBack {
  kind: 'refund' | 'credit';
  amountCents: number;
}

export interface SubstitutionChangePlan {
  /** Cancels the original's order (rebuilt when unsent and unpaid; otherwise
   *  an immutable follow-up the maker is told about in writing). */
  change: StartPurchaseOrderChangeInput | null;
  /** The swap on the decision's terms: the alternate becomes the selection. */
  triage: ReadonlyArray<{
    projectId: string;
    selectionIds: string[];
    assignmentScope: 'room' | 'throughout' | 'unassigned';
    roomId: string | null;
    disposition: 'selected' | 'not_selected';
  }>;
  /** The deposit back, as a negative vendor_payments row (record_vendor_refund). */
  refund: { purchaseOrderId: string; request: MoneyBack } | null;
  /** Keeps the exception open, with the maker, until the replacement is ordered. */
  resolve: ResolveProcurementExceptionRequest;
}

const scopeOf = (line: SubstituteLine) => {
  const scope = line.assignment_scope;
  if (scope === 'room' && line.project_room_id) {
    return { assignmentScope: 'room' as const, roomId: line.project_room_id };
  }
  return {
    assignmentScope: scope === 'throughout' ? ('throughout' as const) : ('unassigned' as const),
    roomId: null,
  };
};

/** The client chose: the exact calls "Make the change" sends, in order. */
export function substitutionChangePlan({
  exception,
  original,
  alternate,
  moneyBack,
}: {
  exception: Pick<ExceptionLike, 'project_id' | 'purchase_order_id'>;
  original: SubstituteLine;
  alternate: SubstituteLine;
  moneyBack: MoneyBack | null;
}): SubstitutionChangePlan {
  const reason = `The client chose ${alternate.name} in place of ${original.name}.`;
  const poId = exception.purchase_order_id;
  return {
    change: poId
      ? {
          purchaseOrderId: poId,
          projectId: exception.project_id,
          changeKind: 'cancellation',
          reason,
          selectionId: original.id,
        }
      : null,
    triage: [
      { projectId: exception.project_id, selectionIds: [alternate.id], ...scopeOf(alternate), disposition: 'selected' },
      { projectId: exception.project_id, selectionIds: [original.id], ...scopeOf(original), disposition: 'not_selected' },
    ],
    refund:
      poId && moneyBack && moneyBack.amountCents > 0
        ? { purchaseOrderId: poId, request: moneyBack }
        : null,
    resolve: { status: 'awaiting_vendor', note: reason },
  };
}

/** The last step: close the exception against the replacement PO. */
export function substitutionClose(replacementPoId: string): ResolveProcurementExceptionRequest {
  return { status: 'resolved', resolutionPath: 'substitute', replacementPurchaseOrderId: replacementPoId };
}

// ─── Maker lane (V1) ────────────────────────────────────────────────────────

/**
 * On the Patina catalog lane, Patina works the problem with the maker
 * (fulfillment_exceptions stays Patina's own). The studio reads one line and
 * no money: V1 keeps Patina's cut off every studio surface.
 */
export function makerLaneLine(type: string): string {
  return `${exceptionTypeLabel(type)} · Patina is handling it with the maker`;
}

/** The exceptions that belong to one line: on the line, or on its PO with no
 *  line named. Resolved ones fold away. */
export function exceptionsForLine<T extends ExceptionLike>(
  exceptions: readonly T[],
  itemId: string,
  purchaseOrderId: string | null | undefined,
): T[] {
  return exceptions.filter(
    (e) =>
      e.status !== 'resolved' &&
      (e.ffe_item_id === itemId ||
        (!e.ffe_item_id && !!purchaseOrderId && e.purchase_order_id === purchaseOrderId)),
  );
}

/** A change_order_required refusal (R8), said plainly. */
export function changeOrderMessage(message: string): string {
  const rest = message.replace(/^.*?change_order_required:?\s*/, '').trim();
  return `This needs a change order the client approves first${rest ? ` — ${rest}` : ''}.`;
}
