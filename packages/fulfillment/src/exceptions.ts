// @patina/fulfillment — S7 Exception Desk vocabulary (spec §5.5).
//
// Pure, portal-side pairing to the DB derivation in migration 00364
// (fulfillment_exception_consequence / fulfillment_resolve_exception). This
// module carries the resolution-path catalog per exception type, the cause-code
// list, the DTO shapes the /fulfillment/exceptions surface renders, and the
// mono-ledger formatting for the "ledger consequence shown before commit" block.
//
// The ledger LINES are never computed here — they come from the RPC preview
// (fulfillment_resolve_exception(preview:=true)) so preview == posted holds by
// construction (the acceptance assert compares them). This file only knows which
// paths a type offers, what params each needs, and how to render the result.

import type { ExceptionType } from './types';
import { formatCents } from './format';

// ─── Resolution paths (mirror 00364's p_path vocabulary) ────────────────────
export type ExceptionResolutionPath =
  | 'damage_vendor_claim'
  | 'damage_client_credit'
  | 'damage_recovery'
  | 'delay_redate'
  | 'backorder_recommit'
  | 'backorder_cancel'
  | 'refund'
  | 'substitution_review'
  | 'record_only';

export interface ResolutionPathMeta {
  path: ExceptionResolutionPath;
  /** Short verb label for the pick affordance. */
  label: string;
  /** Sentence lead the case file renders before the (server-fed) detail. */
  sentence: string;
  /** Posts a ledger entry (T4/T5). */
  financial: boolean;
  /** Operator supplies an amount (damage/refund). */
  requiresAmount: boolean;
  /** Routes to Leah instead of resolving here. */
  requiresLeah: boolean;
  /** Needs a new ETA date param (delay). */
  needsNewEta?: boolean;
  /** Needs a new committed-ship date param (backorder recommit). */
  needsCommittedShip?: boolean;
  /** Cancels the linked line pre-shipment. */
  cancelsLine?: boolean;
}

export const RESOLUTION_PATH_META: Record<ExceptionResolutionPath, ResolutionPathMeta> = {
  damage_vendor_claim: {
    path: 'damage_vendor_claim',
    label: 'File a vendor / carrier claim',
    sentence: 'File a claim against the vendor or carrier for the damage.',
    financial: true, requiresAmount: true, requiresLeah: false,
  },
  damage_client_credit: {
    path: 'damage_client_credit',
    label: 'Issue a client credit',
    sentence: 'Issue the client a credit and keep the piece as-is.',
    financial: true, requiresAmount: true, requiresLeah: false,
  },
  damage_recovery: {
    path: 'damage_recovery',
    label: 'Record a claim recovery',
    sentence: 'Record the recovery received against an open claim.',
    financial: true, requiresAmount: true, requiresLeah: false,
  },
  delay_redate: {
    path: 'delay_redate',
    label: 'Re-date the ETA',
    sentence: 'Move the delivery estimate and draft the client an update.',
    financial: false, requiresAmount: false, requiresLeah: false, needsNewEta: true,
  },
  backorder_recommit: {
    path: 'backorder_recommit',
    label: 'Set a new committed date',
    sentence: 'Commit to a new ship date from the vendor and update the client.',
    financial: false, requiresAmount: false, requiresLeah: false, needsCommittedShip: true,
  },
  backorder_cancel: {
    path: 'backorder_cancel',
    label: 'Cancel the line',
    sentence: 'Cancel the back-ordered line; refund the client if it was captured.',
    financial: false, requiresAmount: true, requiresLeah: false, cancelsLine: true,
  },
  refund: {
    path: 'refund',
    label: 'Refund the client',
    sentence: 'Refund the client for this line.',
    financial: true, requiresAmount: true, requiresLeah: false,
  },
  substitution_review: {
    path: 'substitution_review',
    label: 'Send to Leah',
    sentence: 'Package the comparison and route it to Leah for an aesthetic ruling.',
    financial: false, requiresAmount: false, requiresLeah: true,
  },
  record_only: {
    path: 'record_only',
    label: 'Record & close',
    sentence: 'Record the outcome and close with no financial posting.',
    financial: false, requiresAmount: false, requiresLeah: false,
  },
};

/** Which resolution paths a given exception type offers (spec §5.5 playbooks). */
export const RESOLUTION_PATHS_BY_TYPE: Record<ExceptionType, ExceptionResolutionPath[]> = {
  damage: ['damage_vendor_claim', 'damage_client_credit', 'damage_recovery'],
  delay: ['delay_redate'],
  backorder: ['backorder_recommit', 'backorder_cancel'],
  substitution: ['substitution_review'],
  loss: ['record_only', 'refund'],
  client_change: ['record_only', 'refund'],
  cancellation: ['record_only', 'refund'],
  return: ['record_only', 'refund'],
};

export function resolutionPathsForType(type: ExceptionType): ResolutionPathMeta[] {
  return (RESOLUTION_PATHS_BY_TYPE[type] ?? ['record_only']).map((p) => RESOLUTION_PATH_META[p]);
}

// ─── Cause codes (required on every close, spec §5.5) ───────────────────────
export interface CauseCodeOption { value: string; label: string; }
export const EXCEPTION_CAUSE_CODES: readonly CauseCodeOption[] = [
  { value: 'carrier_damage', label: 'Carrier damage — in transit' },
  { value: 'concealed_damage', label: 'Concealed damage — found after delivery' },
  { value: 'vendor_defect', label: 'Vendor defect / QC miss' },
  { value: 'vendor_delay', label: 'Vendor production delay' },
  { value: 'backorder_vendor', label: 'Vendor back-order' },
  { value: 'component_shortage', label: 'Component / material shortage' },
  { value: 'discontinued', label: 'Item discontinued' },
  { value: 'vendor_substitution', label: 'Vendor-proposed substitution' },
  { value: 'lost_in_transit', label: 'Lost in transit' },
  { value: 'client_request', label: 'Client request' },
  { value: 'address_issue', label: 'Address / access issue' },
  { value: 'other', label: 'Other (see memo)' },
];

export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  damage: 'Damage',
  delay: 'Delay',
  backorder: 'Back-order',
  substitution: 'Substitution',
  loss: 'Loss',
  client_change: 'Client change',
  cancellation: 'Cancellation',
  return: 'Return',
};

export type ExceptionStatus = 'open' | 'pending_leah' | 'resolved';

// ─── DTO shapes (composed by the exceptions API routes) ─────────────────────
export interface LedgerLinePreview {
  accountCode: string;
  accountName: string | null;
  debitCents: number;
  creditCents: number;
}

export interface ConsequencePreview {
  path: ExceptionResolutionPath | string;
  exceptionType?: ExceptionType;
  financial: boolean;
  requiresLeah: boolean;
  template: string | null;
  outcome: string | null;
  amountCents: number | null;
  lineAction: string | null;
  lines: LedgerLinePreview[];
  summary: string | null;
  preview?: boolean;
}

export interface ExceptionListRow {
  id: string;
  type: ExceptionType;
  status: ExceptionStatus;
  orderId: string | null;
  orderNo: number | null;
  clientName: string | null;
  itemName: string | null;
  poNumber: string | null;
  clockDueAt: string | null;
  openedAt: string;
}

export interface ExceptionEvidence {
  key: string;
  url: string | null;
}

export interface ExceptionCaseFileDTO {
  id: string;
  type: ExceptionType;
  status: ExceptionStatus;
  openedAt: string;
  resolvedAt: string | null;
  clockDueAt: string | null;
  orderId: string | null;
  orderNo: number | null;
  clientName: string | null;
  poId: string | null;
  poNumber: string | null;
  sideMark: string | null;
  orderItemId: string | null;
  itemName: string | null;
  itemIndex: number | null;
  shipmentId: string | null;
  shipmentMode: string | null;
  evidence: ExceptionEvidence[];
  causeCode: string | null;
  resolutionPath: string | null;
  outcomeMemo: string | null;
  financialOutcomeEntryId: string | null;
  /** Present while the exception is with Leah. */
  leahReviewStatus: 'pending' | 'approved' | 'rejected' | null;
}

// ─── Formatting for the mono ledger-consequence block ───────────────────────
export interface LedgerLineParts {
  code: string;
  name: string | null;
  side: 'Dr' | 'Cr';
  amount: string; // formatted currency, no sign
}

/** One ledger line → mono parts (account · Dr/Cr · amount). */
export function ledgerLineParts(line: LedgerLinePreview): LedgerLineParts {
  const isDebit = line.debitCents > 0;
  return {
    code: line.accountCode,
    name: line.accountName,
    side: isDebit ? 'Dr' : 'Cr',
    amount: formatCents(isDebit ? line.debitCents : line.creditCents),
  };
}

/** True when a path carries no financial outcome — the honest "$0" case. */
export function consequenceIsEmpty(cons: Pick<ConsequencePreview, 'lines' | 'financial'>): boolean {
  return !cons.financial || cons.lines.length === 0;
}

/** A short "LEDGER · …" strip summarizing a consequence's lines (mono). */
export function consequenceLedgerStrip(cons: ConsequencePreview): string {
  if (consequenceIsEmpty(cons)) return 'LEDGER · $0 — no financial posting';
  const parts = cons.lines.map((l) => {
    const p = ledgerLineParts(l);
    return `${p.name ?? p.code} ${p.side} ${p.amount}`;
  });
  return `LEDGER · ${parts.join(' · ')}`;
}

// ─── Settlement preview (mirror fulfillment_settle_po_preview, 00364) ───────
export interface SettlementPreview {
  poId: string;
  vendorInvoiceCents: number;
  expectedCents: number;
  varianceCents: number;
  toleranceCents: number;
  autoAccepted: boolean;
  requiresReason: boolean;
  realizedCommissionCents: number;
  pledgeCents: number;
  lines: LedgerLinePreview[];
  preview?: boolean;
}

/**
 * Clock-urgency sort for the exceptions list: soonest clock first, nulls last;
 * open/pending before resolved; then newest-opened. Pure, unit-tested.
 */
export function sortExceptionsByClock(rows: ExceptionListRow[]): ExceptionListRow[] {
  const rank = (s: ExceptionStatus) => (s === 'resolved' ? 1 : 0);
  return [...rows].sort((a, b) => {
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    const at = a.clockDueAt ? Date.parse(a.clockDueAt) : Number.POSITIVE_INFINITY;
    const bt = b.clockDueAt ? Date.parse(b.clockDueAt) : Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    return Date.parse(b.openedAt) - Date.parse(a.openedAt);
  });
}
