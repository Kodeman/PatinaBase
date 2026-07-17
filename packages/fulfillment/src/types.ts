// @patina/fulfillment — shared domain vocabulary for the BOH fulfillment system.
//
// ⚠ The SQL triggers in 00350 (enforce_fulfillment_line_transition /
//   enforce_fulfillment_po_transition) and the RPCs in 00353 are AUTHORITATIVE.
//   These types mirror them for the data/UI layer — keep in sync on any
//   state-machine change. S0 ships types + the state machine only; formatters
//   and money helpers arrive in S1/S2.

/** fulfillment_order_items.line_state — 8 forward states + cancelled (the 9-state chain, spec §2). */
export type LineState =
  | 'intake'
  | 'split'
  | 'transmitted'
  | 'acknowledged'
  | 'in_production'
  | 'shipped'
  | 'delivered'
  | 'settled'
  | 'cancelled';

/** fulfillment_vendor_pos.status — 7 forward states + cancelled (spec §2). */
export type PoState =
  | 'draft'
  | 'sent'
  | 'acknowledged'
  | 'in_production'
  | 'shipped'
  | 'delivered'
  | 'settled'
  | 'cancelled';

/** Queue band (spec §5.1) — mutually exclusive, derived. */
export type Band = 'needs_action_now' | 'watching' | 'quiet';

export type MappingState = 'mapped' | 'unmapped';

export type TransmissionType = 'email' | 'portal' | 'csv';

export type ExceptionType =
  | 'damage'
  | 'delay'
  | 'backorder'
  | 'substitution'
  | 'loss'
  | 'client_change'
  | 'cancellation'
  | 'return';

export type PaymentTerms = 'prepay' | 'fifty_fifty' | 'net_30';

export interface FulfillmentOrderLineDTO {
  id: string;
  orderId: string;
  productId: string | null;
  itemName: string;
  vendorSku: string | null;
  qty: number;
  unitPriceCents: number;
  unitCostCents: number | null;
  vendorId: string | null;
  mappingState: MappingState;
  lineState: LineState;
  lineIndex: number;
}

export interface FulfillmentOrderDTO {
  id: string;
  orderNo: number;
  stripePaymentIntentId: string | null;
  clientName: string;
  clientProfileId: string | null;
  capturedTotalCents: number;
  productSubtotalCents: number;
  freightChargedCents: number;
  taxCents: number;
  intakeAt: string;
}

/**
 * Fulfillment Queue row (S1) — a verbatim passthrough of `fulfillment_queue_v`
 * (00353) columns, snake_case to match the view directly (the API route DTO-
 * passes this shape with zero client-side band/filter math, per spec §5.1's
 * zero-invisibility invariant: the row list renders exactly what the view
 * returns). See packages/fulfillment/src/next-action.ts for turning
 * next_action_kind/params into display text.
 */
export interface FulfillmentQueuePoStage {
  po_id: string;
  po_number: string | null;
  vendor_id: string;
  vendor_name: string | null;
  status: PoState;
}

export interface FulfillmentQueueRow {
  order_id: string;
  order_no: number;
  client_name: string;
  intake_at: string;
  designer_attribution: Record<string, unknown> | null;
  min_stage_idx: number | null;
  has_unmapped: boolean;
  unmapped_count: number;
  vendor_count: number;
  open_exceptions: number;
  derived_status: string;
  stage_entered_at: string | null;
  po_count: number;
  po_stages: FulfillmentQueuePoStage[];
  breached: boolean;
  stage_age_business_hours: number | null;
  next_action_kind: string;
  next_action_params: Record<string, unknown> | null;
  band: Band;
}
