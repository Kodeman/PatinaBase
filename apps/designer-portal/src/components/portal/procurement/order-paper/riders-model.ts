/**
 * Riders (C-26, D1-05, d2 §M6.4): the cost lines a PO carries beside its
 * pieces — freight, crating, liftgate and the rest — as an estimate, then an
 * actual. A rider may be payable to someone other than the vendor (the
 * carrier, the receiver). R-PB7: it bills the client at cost, on its own
 * line, unless the line overrides it.
 */

import type {
  BillingRule,
  PoCostLineKind,
  PoCostLineRequest,
  PoCostLineRow,
} from '@patina/supabase';

export const RIDER_KINDS: ReadonlyArray<{ value: PoCostLineKind; label: string }> = [
  { value: 'freight', label: 'Freight' },
  { value: 'crating', label: 'Crating' },
  { value: 'liftgate', label: 'Liftgate' },
  { value: 'residential', label: 'Residential delivery' },
  { value: 'white_glove', label: 'White glove' },
  { value: 'receiving', label: 'Receiving' },
  { value: 'storage', label: 'Storage' },
  { value: 'handling', label: 'Handling' },
  { value: 'restocking', label: 'Restocking' },
];

export const BILLING_RULE_OPTIONS: ReadonlyArray<{ value: BillingRule; label: string }> = [
  { value: 'at_cost', label: 'at cost' },
  { value: 'cost_plus', label: 'cost plus' },
];

export function riderKindLabel(kind: string): string {
  return RIDER_KINDS.find((k) => k.value === kind)?.label ?? 'Other';
}

/** The payee picker's value: the PO's vendor, or a card in the studio's rolodex. */
export type RiderPayee = 'vendor' | `contact:${string}` | `other-vendor:${string}`;

export interface RiderDraft {
  kind: PoCostLineKind;
  /** Dollars as typed. */
  estimate: string;
  payee: RiderPayee;
  billable: boolean;
  billingRule: BillingRule;
}

/** A new rider: freight, paid to the vendor, billed to the client at cost (R-PB7). */
export function freshRider(): RiderDraft {
  return { kind: 'freight', estimate: '', payee: 'vendor', billable: true, billingRule: 'at_cost' };
}

/**
 * Dollars as typed → cents. Blank is null (no figure yet); anything that is
 * not a non-negative amount is undefined (refuse it).
 */
export function parseRiderCents(raw: string): number | null | undefined {
  const clean = raw.replace(/[$,\s]/g, '');
  if (clean === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return undefined;
  return Math.round(Number(clean) * 100);
}

/** Both payee keys, always: a rider has one payee, so setting one clears the other. */
export function payeeFields(
  payee: RiderPayee,
  vendorId: string,
): Pick<PoCostLineRequest, 'payeeVendorId' | 'payeeContactId'> {
  if (payee.startsWith('contact:')) {
    return { payeeVendorId: null, payeeContactId: payee.slice('contact:'.length) };
  }
  if (payee.startsWith('other-vendor:')) {
    return { payeeVendorId: payee.slice('other-vendor:'.length), payeeContactId: null };
  }
  return { payeeVendorId: vendorId, payeeContactId: null };
}

/** The upsert_po_cost_line create request, or null while the estimate is not an amount. */
export function riderCreateRequest(draft: RiderDraft, vendorId: string): PoCostLineRequest | null {
  const estimateCents = parseRiderCents(draft.estimate);
  if (estimateCents === undefined) return null;
  return {
    kind: draft.kind,
    ...payeeFields(draft.payee, vendorId),
    estimateCents,
    billableToClient: draft.billable,
    billingRule: draft.billingRule,
  };
}

/** A line's payee as the picker's value. No payee on file reads as the vendor. */
export function riderPayeeOf(
  line: Pick<PoCostLineRow, 'payee_vendor_id' | 'payee_contact_id'>,
  vendorId: string,
): RiderPayee {
  if (line.payee_contact_id) return `contact:${line.payee_contact_id}`;
  if (line.payee_vendor_id && line.payee_vendor_id !== vendorId) {
    return `other-vendor:${line.payee_vendor_id}`;
  }
  return 'vendor';
}

/** The rider is owed to someone other than the PO's vendor, so it is paid on its own. */
export function paysSomeoneElse(
  line: Pick<PoCostLineRow, 'payee_vendor_id' | 'payee_contact_id'>,
  vendorId: string,
): boolean {
  return riderPayeeOf(line, vendorId) !== 'vendor';
}

/** What the rider costs now: the actual once it is known, else the estimate. */
export function riderAmountCents(
  line: Pick<PoCostLineRow, 'estimate_cents' | 'actual_cents'>,
): number | null {
  return line.actual_cents ?? line.estimate_cents ?? null;
}

/** The billing fact under a rider. */
export function riderBillingText(
  line: Pick<PoCostLineRow, 'billable_to_client' | 'billing_rule' | 'invoice_line_id'>,
): string {
  if (line.invoice_line_id) return 'billed to the client';
  if (!line.billable_to_client) return 'not billed to the client';
  return line.billing_rule === 'cost_plus'
    ? 'bill the client, cost plus'
    : 'bill the client at cost';
}

/** The payment record's reference: "Freight · Badger Receiving" (vendor_payments caps it at 200). */
export function riderPaymentReference(kind: string, payeeName: string | null): string {
  return [riderKindLabel(kind), payeeName].filter(Boolean).join(' · ').slice(0, 200);
}
