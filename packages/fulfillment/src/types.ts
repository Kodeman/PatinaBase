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
  clientEmail: string | null;
  clientProfileId: string | null;
  shipTo: Record<string, unknown> | null;
  designerAttribution: Record<string, unknown> | null;
  capturedTotalCents: number;
  productSubtotalCents: number;
  freightChargedCents: number;
  taxCents: number;
  intakeAt: string;
}

// ─── Order Workbench detail DTO (S2, spec §5.2) ──────────────────────────────
// The single round-trip the Workbench binds to (GET /api/admin/fulfillment/
// orders/[orderId]) — order + lines + any existing PO drafts (post-confirm) +
// the assignable vendor directory + the three config numbers. Composed in the
// route from base tables (no dedicated view); camelCase, unlike the queue row
// (which is a raw view passthrough).

/** A vendor selectable for line assignment — sourced from vendor_profiles ⋈
 *  vendors (only vendors with a profile can receive a PO, R1.6). */
export interface FulfillmentVendorOption {
  vendorId: string;
  vendorName: string;
  transmissionType: TransmissionType;
  /** Per-vendor commission override (vendor_profiles.commission_rate); null →
   *  falls back to config commission_rate_default. Settlement input (S6). */
  commissionRate: number | null;
}

/** A line as the Workbench sees it — the DTO line plus its resolved vendor name
 *  (for the proposed-PO card header) and its post-confirm PO linkage. */
export interface FulfillmentWorkbenchLine {
  id: string;
  orderId: string;
  productId: string | null;
  itemName: string;
  vendorSku: string | null;
  qty: number;
  unitPriceCents: number;
  unitCostCents: number | null;
  vendorId: string | null;
  vendorName: string | null;
  mappingState: MappingState;
  lineState: LineState;
  lineIndex: number;
  /** Circled-index glyph (①…) for this line — precomputed so left + right sides
   *  thread the identical mark (spec §5.2). Mirrors circledIndex(lineIndex). */
  circledIndex: string;
  /** Post-confirm only: the real PO this line was grouped into. */
  poId: string | null;
  poLineId: string | null;
}

/** An existing (post-confirm) vendor PO draft. */
export interface FulfillmentVendorPoDTO {
  id: string;
  poNumber: string | null;
  vendorId: string;
  vendorName: string | null;
  transmissionType: TransmissionType | null;
  status: PoState;
  terms: PaymentTerms | null;
  sideMark: string | null;
  productCostCents: number;
  /** order_item ids grouped into this PO (thread back to the left side). */
  lineIds: string[];
}

export interface FulfillmentConfigNumbers {
  marginFloorPct: number;
  pledgeRate: number;
  commissionRateDefault: number;
}

export interface FulfillmentOrderDetailDTO {
  order: FulfillmentOrderDTO;
  lines: FulfillmentWorkbenchLine[];
  /** Existing POs — empty until the split is confirmed. */
  pos: FulfillmentVendorPoDTO[];
  vendors: FulfillmentVendorOption[];
  config: FulfillmentConfigNumbers;
  /** Derived: true once any PO exists (the split has been confirmed). */
  confirmed: boolean;
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

// ─── PO Composer & Transmission Log detail DTO (S3, spec §5.3) ────────────────
// The single round-trip the composer binds to (GET /api/admin/fulfillment/pos/
// [poId]) — one PO + its lines + the vendor's transmission protocol + the
// append-only transmission log (fulfillment_events filtered to the PO). camelCase
// like the workbench DTO; the log events stay snake_case (raw event rows, mapped
// to lines by @patina/fulfillment/transmission-log).

/** A PO line as the composer / PO paper sees it. */
export interface FulfillmentComposerLine {
  id: string;
  orderItemId: string;
  lineIndex: number;
  itemName: string;
  vendorSku: string | null;
  qty: number;
  unitCostCents: number;
  lineTotalCents: number;
}

/** The vendor's transmission protocol (vendor_profiles) — drives the panel. */
export interface FulfillmentComposerVendorProfile {
  transmissionType: TransmissionType | null;
  poEmail: string | null;
  portalUrl: string | null;
  csvColumnSpec: unknown;
  blindShip: boolean;
  changeWindowDays: number | null;
  claimsWindowDays: number | null;
  paymentTerms: PaymentTerms | null;
}

export interface FulfillmentComposerPo {
  id: string;
  poNumber: string | null;
  orderId: string;
  orderNo: number;
  clientName: string;
  vendorId: string;
  vendorName: string | null;
  status: PoState;
  terms: PaymentTerms | null;
  sideMark: string | null;
  requestedShip: string | null;
  committedShip: string | null;
  ackMethod: string | null;
  ackRef: string | null;
  productCostCents: number;
  transmittedAt: string | null;
  ackedAt: string | null;
  pdfR2Key: string | null;
  shipTo: Record<string, unknown> | null;
}

/** Raw fulfillment_events row shape for the log (mirrors transmission-log.ts). */
export interface FulfillmentComposerEvent {
  id: number;
  event_type: string;
  actor: string | null;
  refs: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface FulfillmentComposerDTO {
  po: FulfillmentComposerPo;
  vendorProfile: FulfillmentComposerVendorProfile;
  lines: FulfillmentComposerLine[];
  /** The append-only transmission log — fulfillment_events for this PO + the
   *  order's notification.* events, ascending by id. */
  events: FulfillmentComposerEvent[];
}

// ── S4: notifications / vendor directory / config (spec §6, §7, §10) ────────
// Mirrors supabase/functions/_shared/fulfillment-templates.ts's Deno-side
// ClientNotificationTransition (not shared by import — see notify.ts header).

export type ClientNotificationChannel = 'email' | 'push';

export interface FulfillmentClientNotificationDTO {
  id: string;
  orderId: string;
  transition: string;
  channel: ClientNotificationChannel;
  templateKey: string;
  draftedBody: string | null;
  sentBody: string | null;
  editDiff: { original: string; sent: string } | null;
  sentAt: string | null;
  resendMessageId: string | null;
  skippedReason: string | null;
  createdAt: string;
}

/** vendor_profiles ⋈ vendors, camelCase (spec §7 protocol sheet, R1.6). */
export interface VendorProfileDTO {
  vendorId: string;
  vendorName: string;
  transmissionType: TransmissionType;
  contacts: Array<Record<string, unknown>>;
  poEmail: string | null;
  portalUrl: string | null;
  csvColumnSpec: Record<string, unknown> | null;
  paymentTerms: PaymentTerms;
  depositPct: number | null;
  leadTimeDays: number | null;
  changeWindowDays: number | null;
  blindShip: boolean;
  claimsWindowDays: number | null;
  inspectionWindowDays: { parcel?: number; ltl?: number; white_glove?: number } | null;
  freightArrangement: string | null;
  /** Fraction (0.16 = 16%); null falls back to config commission_rate_default. */
  commissionRate: number | null;
}

/** A vendor list row — the directory table doesn't need the full profile. */
export interface VendorDirectoryRow {
  vendorId: string;
  vendorName: string;
  hasProfile: boolean;
  transmissionType: TransmissionType | null;
  paymentTerms: PaymentTerms | null;
}

/** Scorecard computed from fulfillment_events (spec §7) — trailing window,
 *  n shown so a thin sample reads honestly rather than a misleadingly precise
 *  rate. Null fields mean n was too small (or no matching events) to compute. */
export interface VendorScorecard {
  vendorId: string;
  windowDays: number;
  n: number;
  medianAckHours: number | null;
  onTimeShipRate: number | null;
  damageRate: number | null;
  fillRate: number | null;
  exceptionRateByCause: Record<string, number>;
}

export interface FulfillmentConfigRow {
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  updatedBy: string | null;
  updatedAt: string;
}
