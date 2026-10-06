import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Database, Json } from '../database.types';
import { invalidateFfeCaches, type PurchaseOrder } from './use-procurement';
import { specBookKeys } from './use-spec-books';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// STUDIO BUYING — US-16 Phase 2 (SQ-418; migrations 00701–00704)
//
//   order paper header   sidemark, requested ship, bill-to, freight terms,
//                        vendor note; fixed once the PO is sent (R8).
//   COM pair             a supplying line points at its piece
//                        (parent_ffe_item_id), the fabric PO at the PO it
//                        feeds (supplies_purchase_order_id), COM facts in
//                        project_ffe_specs.com_spec.
//   submittals           CFA / strike-off / shop drawing / finish / seat
//                        sample; ffe_line_submittals adds a configured
//                        piece's submittal milestone.
//   studio purchases     card buys, one-offs, reimbursables; a line purchase
//                        moves the line to ordered.
//   cost lines           freight, crating, receiving... estimate then actual.
//   shipments            partial shipments; recording one ships the PO;
//                        delivery starts the inspection clock.
// Every write goes through a SECURITY DEFINER RPC except com_spec, which is a
// spec column under the spec grant.
//
// SQ-419 (migrations 00705–00708):
//   acknowledgments      log_po_acknowledgment_v2 checks the vendor's ack
//                        against the PO; a difference opens the PO's
//                        ack_discrepancy exception and drafts a reply.
//   drafts               deterministic vendor letters, awaiting review; the
//                        studio edits or discards, the send edge function
//                        marks sent.
//   quotes               record a vendor quote; applying it writes trade only.
//   exceptions           damage, short ship, backorder...; a clock with a
//                        plain-words basis; substitution goes to the client
//                        through the decision rail.
//   refunds              negative vendor_payments rows (refund | credit).
// A price change on a line that sits on a sent authorization, or a quantity
// change on a PO, is refused with an error whose message starts
// `change_order_required` (R8); see isChangeOrderRequired.
// ═══════════════════════════════════════════════════════════════════════════

type PublicSchema = Database['public'];

export type PoSubmittalRow = PublicSchema['Tables']['po_submittals']['Row'];
export type FfeLineSubmittalRow = PublicSchema['Views']['ffe_line_submittals']['Row'];
export type StudioPurchaseRow = PublicSchema['Tables']['studio_purchases']['Row'];
export type PoCostLineRow = PublicSchema['Tables']['po_cost_lines']['Row'];
export type PoShipmentRow = PublicSchema['Tables']['po_shipments']['Row'];
export type PoShipmentLineRow = PublicSchema['Tables']['po_shipment_lines']['Row'];
export type PoShipmentWithLines = PoShipmentRow & { po_shipment_lines: PoShipmentLineRow[] };
type ProjectFfeItemRow = PublicSchema['Tables']['project_ffe_items']['Row'];
type ProjectFfeSpecRow = PublicSchema['Tables']['project_ffe_specs']['Row'];

export type FreightTerms = 'prepaid' | 'collect' | 'prepaid_add' | 'fob_origin' | 'fob_destination';
export type SubmittalKind = 'cfa' | 'strike_off' | 'shop_drawing' | 'finish_sample' | 'seat_sample';
export type SubmittalDecision = 'approved' | 'rejected' | 'revise';
export type StudioPurchaseKind = 'card_retail' | 'one_off' | 'antique_auction' | 'expense' | 'sample_fee';
/** R-PB7 default at_cost; whether cost_plus is ever shown is the R1 ruling. */
export type BillingRule = 'at_cost' | 'cost_plus';
export type PoCostLineKind =
  | 'freight'
  | 'crating'
  | 'liftgate'
  | 'residential'
  | 'white_glove'
  | 'receiving'
  | 'storage'
  | 'handling'
  | 'restocking'
  | 'other';
export type ShipmentMode = 'parcel' | 'ltl' | 'white_glove' | 'studio_pickup';

export interface BillTo {
  name?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

/** COM facts, in product_configurations.com_details' shape. */
export interface ComSpec {
  fabricName?: string;
  mill?: string;
  pattern?: string;
  yardage?: string;
  railroaded?: boolean;
  shipTo?: string;
  sidemark?: string;
  secondLeadTimeWeeks?: number;
  notes?: string;
}

export const buyingPhase2Keys = {
  all: ['buying-phase2'] as const,
  canBuy: (projectId: string) => ['buying-phase2', 'can-buy', projectId] as const,
  submittals: (projectId: string) => ['buying-phase2', 'submittals', projectId] as const,
  purchases: (scope: string) => ['buying-phase2', 'purchases', scope] as const,
  costLines: (purchaseOrderId: string) => ['buying-phase2', 'cost-lines', purchaseOrderId] as const,
  shipments: (purchaseOrderId: string) => ['buying-phase2', 'shipments', purchaseOrderId] as const,
  acknowledgments: (purchaseOrderId: string) => ['buying-phase2', 'acknowledgments', purchaseOrderId] as const,
  drafts: (projectId: string) => ['buying-phase2', 'drafts', projectId] as const,
  quotes: (projectId: string) => ['buying-phase2', 'quotes', projectId] as const,
  exceptions: (projectId: string) => ['buying-phase2', 'exceptions', projectId] as const,
};

function invalidatePurchaseOrder(queryClient: QueryClient, po: Pick<PurchaseOrder, 'id' | 'project_id'>) {
  queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
  queryClient.invalidateQueries({ queryKey: ['purchase-order', po.id] });
  invalidateFfeCaches(queryClient, po.project_id);
}

type ErrorSurfaceOptions = { errorSurface?: 'inline' };
const errorMeta = (options?: ErrorSurfaceOptions) =>
  options?.errorSurface ? { errorSurface: options.errorSurface } : undefined;

// ─── Access ─────────────────────────────────────────────────────────────────

/** Whether the signed-in user may buy for this project (the project's studio). */
export function useCanBuyForProject(projectId: string | null | undefined) {
  return useQuery({
    queryKey: buyingPhase2Keys.canBuy(projectId ?? ''),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await getSupabase().rpc('can_buy_for_project', {
        p_project_id: projectId as string,
      });
      if (error) throw error;
      return data === true;
    },
    enabled: !!projectId,
  });
}

// ─── The order paper's header (00701) ───────────────────────────────────────

/**
 * Patch for set_purchase_order_header. A present key sets the column (null or
 * blank clears it); an omitted key leaves it. Refused once the PO was sent.
 */
export interface PurchaseOrderHeaderRequest {
  sidemark?: string | null;
  /** YYYY-MM-DD */
  requestedShipOn?: string | null;
  billTo?: BillTo | null;
  freightTerms?: FreightTerms | null;
  vendorNote?: string | null;
}

export function useSetPurchaseOrderHeader(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async ({
      purchaseOrderId,
      request,
    }: {
      purchaseOrderId: string;
      request: PurchaseOrderHeaderRequest;
    }): Promise<PurchaseOrder> => {
      const { data, error } = await getSupabase().rpc('set_purchase_order_header', {
        p_po_id: purchaseOrderId,
        p_request: request as Json,
      });
      if (error) throw error;
      return data as unknown as PurchaseOrder;
    },
    onSuccess: (po) => invalidatePurchaseOrder(queryClient, po),
  });
}

// ─── The COM pair (00702) ───────────────────────────────────────────────────

/** Pair a supplying line (the COM fabric) with its piece; parentId null unlinks. */
export function useLinkFfePair(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async ({
      childId,
      parentId,
    }: {
      childId: string;
      parentId: string | null;
    }): Promise<ProjectFfeItemRow> => {
      const { data, error } = await getSupabase().rpc('link_ffe_pair', {
        p_child: childId,
        // The RPC accepts NULL (unlink); the generated arg type is non-null.
        p_parent: parentId as string,
      });
      if (error) throw error;
      return data as ProjectFfeItemRow;
    },
    onSuccess: (item) => invalidateFfeCaches(queryClient, item.project_id),
  });
}

/** Point the fabric PO at the PO it supplies; suppliesPurchaseOrderId null unlinks. */
export function useSetPurchaseOrderSupplies(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async ({
      purchaseOrderId,
      suppliesPurchaseOrderId,
    }: {
      purchaseOrderId: string;
      suppliesPurchaseOrderId: string | null;
    }): Promise<PurchaseOrder> => {
      const { data, error } = await getSupabase().rpc('set_purchase_order_supplies', {
        p_po_id: purchaseOrderId,
        p_supplies_po_id: suppliesPurchaseOrderId as string,
      });
      if (error) throw error;
      return data as unknown as PurchaseOrder;
    },
    onSuccess: (po) => invalidatePurchaseOrder(queryClient, po),
  });
}

export interface UpdateFfeComSpecInput {
  projectId: string;
  specId: string;
  expectedRowVersion: number;
  comSpec: ComSpec | null;
}

/**
 * Write a line's COM facts. Same optimistic concurrency as
 * useUpdateProjectFfeSpec: a zero-row result is another editor's newer save.
 */
export function useUpdateFfeComSpec() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ specId, expectedRowVersion, comSpec }: UpdateFfeComSpecInput): Promise<ProjectFfeSpecRow> => {
      const { data, error } = await getSupabase()
        .from('project_ffe_specs')
        .update({ com_spec: comSpec as Json })
        .eq('id', specId)
        .eq('row_version', expectedRowVersion)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error('This selection changed in another session. Refresh before saving.');
      }
      return data;
    },
    retry: false,
    onSuccess: (_data, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: specBookKeys.workbench(projectId) });
      void queryClient.invalidateQueries({ queryKey: ['project-ffe-items', projectId] });
    },
  });
}

// ─── Submittals (00702) ─────────────────────────────────────────────────────

/** Every submittal on the project's lines, from both sources. */
export function useProjectSubmittals(projectId: string | null | undefined) {
  return useQuery({
    queryKey: buyingPhase2Keys.submittals(projectId ?? ''),
    queryFn: async (): Promise<FfeLineSubmittalRow[]> => {
      const { data, error } = await getSupabase()
        .from('ffe_line_submittals')
        .select('*')
        .eq('project_id', projectId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

/**
 * Create (ffeItemId + kind) or patch a pending submittal (id). A present key
 * sets the field (null clears it); kind and line never change.
 */
export interface SubmittalRequest {
  id?: string;
  ffeItemId?: string;
  kind?: SubmittalKind;
  purchaseOrderId?: string | null;
  requestedOn?: string | null;
  receivedOn?: string | null;
  dyeLot?: string | null;
  reserveExpiresOn?: string | null;
  clientDecisionId?: string | null;
  mediaIds?: string[] | null;
  note?: string | null;
}

export function useRecordSubmittal(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async (request: SubmittalRequest): Promise<PoSubmittalRow> => {
      const { data, error } = await getSupabase().rpc('record_submittal', {
        p_request: request as Json,
      });
      if (error) throw error;
      return data as PoSubmittalRow;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: buyingPhase2Keys.submittals(row.project_id) });
    },
  });
}

/** Decide a pending submittal once; a re-request is a new submittal. */
export function useDecideSubmittal(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async ({
      submittalId,
      decision,
      note,
    }: {
      submittalId: string;
      decision: SubmittalDecision;
      note?: string | null;
    }): Promise<PoSubmittalRow> => {
      const { data, error } = await getSupabase().rpc('decide_submittal', {
        p_submittal_id: submittalId,
        p_decision: decision,
        p_note: note ?? undefined,
      });
      if (error) throw error;
      return data as PoSubmittalRow;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: buyingPhase2Keys.submittals(row.project_id) });
    },
  });
}

// ─── Studio purchases (00703) ───────────────────────────────────────────────

/** A project's purchases, or a studio's overhead purchases (no project). */
export function useStudioPurchases(
  scope: { projectId: string } | { organizationId: string } | null | undefined,
) {
  const key = scope ? ('projectId' in scope ? `project:${scope.projectId}` : `org:${scope.organizationId}`) : '';
  return useQuery({
    queryKey: buyingPhase2Keys.purchases(key),
    queryFn: async (): Promise<StudioPurchaseRow[]> => {
      let query = getSupabase().from('studio_purchases').select('*');
      query =
        scope && 'projectId' in scope
          ? query.eq('project_id', scope.projectId)
          : query.eq('organization_id', (scope as { organizationId: string }).organizationId).is('project_id', null);
      const { data, error } = await query.order('purchased_on', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!scope,
  });
}

export interface StudioPurchaseRequest {
  kind: StudioPurchaseKind;
  payeeName: string;
  amountCents: number;
  projectId?: string | null;
  ffeItemId?: string | null;
  /** Only for studio overhead when the caller belongs to more than one studio. */
  organizationId?: string | null;
  description?: string | null;
  vendorId?: string | null;
  studioContactId?: string | null;
  /** YYYY-MM-DD; defaults to today. */
  purchasedOn?: string | null;
  taxCents?: number | null;
  buyerPremiumCents?: number | null;
  shippingCents?: number | null;
  currencyCode?: string | null;
  paymentMethodId?: string | null;
  paidByMemberId?: string | null;
  reimburseMember?: boolean | null;
  receiptDocumentPath?: string | null;
  returnable?: boolean | null;
  returnBy?: string | null;
  /** Defaults to true. */
  billableToClient?: boolean | null;
  /** Defaults to at_cost. */
  billingRule?: BillingRule | null;
}

function invalidatePurchases(queryClient: QueryClient, row: StudioPurchaseRow) {
  if (row.project_id) {
    queryClient.invalidateQueries({ queryKey: buyingPhase2Keys.purchases(`project:${row.project_id}`) });
    if (row.ffe_item_id) invalidateFfeCaches(queryClient, row.project_id);
  } else if (row.organization_id) {
    queryClient.invalidateQueries({ queryKey: buyingPhase2Keys.purchases(`org:${row.organization_id}`) });
  }
}

/** Record a purchase; with ffeItemId the line moves to ordered. */
export function useRecordStudioPurchase(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async (request: StudioPurchaseRequest): Promise<StudioPurchaseRow> => {
      const { data, error } = await getSupabase().rpc('record_studio_purchase', {
        p_request: request as unknown as Json,
      });
      if (error) throw error;
      return data as StudioPurchaseRow;
    },
    onSuccess: (row) => invalidatePurchases(queryClient, row),
  });
}

/** Void a purchase with a reason; refused once billed. */
export function useVoidStudioPurchase(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async ({ purchaseId, reason }: { purchaseId: string; reason: string }): Promise<StudioPurchaseRow> => {
      const { data, error } = await getSupabase().rpc('void_studio_purchase', {
        p_purchase_id: purchaseId,
        p_reason: reason,
      });
      if (error) throw error;
      return data as StudioPurchaseRow;
    },
    onSuccess: (row) => invalidatePurchases(queryClient, row),
  });
}

// ─── Cost lines and shipments (00704) ───────────────────────────────────────

export function usePoCostLines(purchaseOrderId: string | null | undefined) {
  return useQuery({
    queryKey: buyingPhase2Keys.costLines(purchaseOrderId ?? ''),
    queryFn: async (): Promise<PoCostLineRow[]> => {
      const { data, error } = await getSupabase()
        .from('po_cost_lines')
        .select('*')
        .eq('purchase_order_id', purchaseOrderId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!purchaseOrderId,
  });
}

/** Create (kind required) or patch (id) a cost line; a billed line is fixed. */
export interface PoCostLineRequest {
  id?: string;
  kind?: PoCostLineKind;
  payeeVendorId?: string | null;
  payeeContactId?: string | null;
  estimateCents?: number | null;
  actualCents?: number | null;
  /** Defaults to true. */
  billableToClient?: boolean | null;
  /** Defaults to at_cost. */
  billingRule?: BillingRule | null;
  note?: string | null;
}

export function useUpsertPoCostLine(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async ({
      purchaseOrderId,
      request,
    }: {
      purchaseOrderId: string;
      request: PoCostLineRequest;
    }): Promise<PoCostLineRow> => {
      const { data, error } = await getSupabase().rpc('upsert_po_cost_line', {
        p_po_id: purchaseOrderId,
        p_request: request as Json,
      });
      if (error) throw error;
      return data as PoCostLineRow;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: buyingPhase2Keys.costLines(row.purchase_order_id) });
    },
  });
}

/** A PO's shipments with the pieces each carried. */
export function usePoShipments(purchaseOrderId: string | null | undefined) {
  return useQuery({
    queryKey: buyingPhase2Keys.shipments(purchaseOrderId ?? ''),
    queryFn: async (): Promise<PoShipmentWithLines[]> => {
      const { data, error } = await getSupabase()
        .from('po_shipments')
        .select('*, po_shipment_lines(*)')
        .eq('purchase_order_id', purchaseOrderId as string)
        .order('shipped_on', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PoShipmentWithLines[];
    },
    enabled: !!purchaseOrderId,
  });
}

/**
 * Record (no id) or patch (id) a shipment. A recorded shipment ships the PO;
 * lines (when present) replace the shipment's pieces.
 */
export interface PoShipmentRequest {
  id?: string;
  mode?: ShipmentMode | null;
  carrier?: string | null;
  tracking?: string | null;
  bolDocumentPath?: string | null;
  /** YYYY-MM-DD; a new shipment defaults to deliveredOn, else today. */
  shippedOn?: string | null;
  deliveredOn?: string | null;
  currentEta?: string | null;
  etaNote?: string | null;
  lines?: { ffeItemId: string; qty: number }[] | null;
}

export function useRecordPoShipment(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async ({
      purchaseOrderId,
      request,
      localDate,
    }: {
      purchaseOrderId: string;
      /** For cache invalidation: the shipment moves the PO's lines. */
      projectId: string;
      request: PoShipmentRequest;
      /** The studio's day (YYYY-MM-DD), as advance_purchase_order_status takes it. */
      localDate?: string;
    }): Promise<PoShipmentRow> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('record_po_shipment', {
        p_po_id: purchaseOrderId,
        p_request: request as Json,
        p_local_date: localDate,
      });
      if (error) throw error;
      const shipment = data as PoShipmentRow;
      // C-26/C-28: a new shipment drafts the inbound notice to the PO's
      // receiver. It lands awaiting_review and never sends on its own. The
      // composer refuses a PO with no receiver; any refusal leaves the
      // shipment recorded, and the notice can still be composed on demand.
      if (!request.id) {
        await supabase.rpc('compose_receiver_inbound_draft', { p_shipment_id: shipment.id });
      }
      return shipment;
    },
    onSuccess: (row, { projectId, request }) => {
      if (!request.id) invalidateDrafts(queryClient);
      queryClient.invalidateQueries({ queryKey: buyingPhase2Keys.shipments(row.purchase_order_id) });
      queryClient.invalidateQueries({ queryKey: ['orders-book', 'week-events'] });
      invalidatePurchaseOrder(queryClient, { id: row.purchase_order_id, project_id: projectId });
    },
  });
}

// ─── change_order_required (R8) ─────────────────────────────────────────────

/**
 * True when an RPC refused because the change must go through a change order:
 * a quantity change on a PO, a price change on a line that sits on a sent,
 * signed or executed authorization, or a price change after a vendor payment.
 * The message after the prefix says which, in plain words.
 */
export function isChangeOrderRequired(error: unknown): boolean {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.startsWith('change_order_required');
}

const invalidateProcurementWork = (queryClient: QueryClient, projectId: string) => {
  queryClient.invalidateQueries({ queryKey: buyingPhase2Keys.drafts(projectId) });
  queryClient.invalidateQueries({ queryKey: buyingPhase2Keys.exceptions(projectId) });
};

/** A draft may carry no project (studio-level), so refresh every drafts list,
 *  and the Desk, whose draft needs clear when a draft is sent or discarded. */
const invalidateDrafts = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: [...buyingPhase2Keys.all, 'drafts'] });
  queryClient.invalidateQueries({ queryKey: ['document-state', 'desk'] });
};

// ─── Acknowledgments (00705) ────────────────────────────────────────────────

export type PoAcknowledgmentRow = PublicSchema['Tables']['po_acknowledgments']['Row'];
export type PoAckLineRow = PublicSchema['Tables']['po_ack_lines']['Row'];
export type PoAcknowledgmentWithLines = PoAcknowledgmentRow & { po_ack_lines: PoAckLineRow[] };
/** purchase_orders.ack_state, derived from the latest acknowledgment. */
export type AckState = 'none' | 'clean' | 'discrepancy' | 'resolved';
export type AckLineField = 'unit_price' | 'qty' | 'sku' | 'finish' | 'fabric' | 'dimensions' | 'other';
export type AckVerdict = 'match' | 'mismatch' | 'accepted' | 'disputed' | 'vendor_corrected';

/** A PO's acknowledgments with their lines, newest first (the head first). */
export function usePoAcknowledgments(purchaseOrderId: string | null | undefined) {
  return useQuery({
    queryKey: buyingPhase2Keys.acknowledgments(purchaseOrderId ?? ''),
    queryFn: async (): Promise<PoAcknowledgmentWithLines[]> => {
      const { data, error } = await getSupabase()
        .from('po_acknowledgments')
        .select('*, po_ack_lines(*)')
        .eq('purchase_order_id', purchaseOrderId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PoAcknowledgmentWithLines[];
    },
    enabled: !!purchaseOrderId,
  });
}

/**
 * The vendor's acknowledgment. PO values and verdicts are computed server-side;
 * ship date and freight are header keys. Any difference opens the PO's
 * ack_discrepancy exception and drafts a reply awaiting review.
 */
export interface PoAcknowledgmentRequest {
  /** YYYY-MM-DD; defaults to today. */
  receivedOn?: string | null;
  receivedVia?: 'email' | 'portal' | 'phone' | 'pdf' | null;
  vendorOrderRef?: string | null;
  documentPath?: string | null;
  shipDate?: string | null;
  freightCents?: number | null;
  depositRequestedCents?: number | null;
  /** v1 parity: moves the PO's confirmed ETA. */
  confirmedEta?: string | null;
}

export interface PoAcknowledgmentLineInput {
  /** Required except for field 'other'. */
  ffeItemId?: string | null;
  field: AckLineField;
  /** Cents for unit_price, a count for qty, text otherwise. */
  ackValue: string | number;
  note?: string | null;
}

export function useLogPoAcknowledgment(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async ({
      purchaseOrderId,
      ack,
      lines,
    }: {
      purchaseOrderId: string;
      /** For cache invalidation. */
      projectId: string;
      ack?: PoAcknowledgmentRequest;
      lines?: PoAcknowledgmentLineInput[];
    }): Promise<PoAcknowledgmentRow> => {
      const { data, error } = await getSupabase().rpc('log_po_acknowledgment_v2', {
        p_po_id: purchaseOrderId,
        p_ack: (ack ?? {}) as Json,
        p_lines: (lines ?? []) as unknown as Json,
      });
      if (error) throw error;
      return data as PoAcknowledgmentRow;
    },
    onSuccess: (row, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: buyingPhase2Keys.acknowledgments(row.purchase_order_id) });
      invalidateProcurementWork(queryClient, projectId);
      invalidatePurchaseOrder(queryClient, { id: row.purchase_order_id, project_id: projectId });
    },
  });
}

/**
 * Resolve one difference. 'accepted' writes the vendor's value through the
 * usual paths (unit price → trade and the PO total; sku / finish / fabric →
 * the spec; freight → the freight cost line); qty and an authorized price
 * are refused with change_order_required.
 */
export function useResolveAckLine(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async ({
      lineId,
      verdict,
      note,
    }: {
      lineId: string;
      verdict: 'accepted' | 'disputed' | 'vendor_corrected';
      note?: string;
      /** For cache invalidation. */
      purchaseOrderId: string;
      projectId: string;
    }): Promise<PoAckLineRow> => {
      const { data, error } = await getSupabase().rpc('resolve_ack_line', {
        p_line_id: lineId,
        p_verdict: verdict,
        p_note: note,
      });
      if (error) throw error;
      return data as PoAckLineRow;
    },
    onSuccess: (_, { purchaseOrderId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: buyingPhase2Keys.acknowledgments(purchaseOrderId) });
      queryClient.invalidateQueries({ queryKey: buyingPhase2Keys.costLines(purchaseOrderId) });
      invalidateProcurementWork(queryClient, projectId);
      invalidatePurchaseOrder(queryClient, { id: purchaseOrderId, project_id: projectId });
    },
  });
}

// ─── Procurement drafts (00706) ─────────────────────────────────────────────

export type ProcurementDraftRow = PublicSchema['Tables']['procurement_drafts']['Row'];
export type ProcurementDraftKind =
  | 'ack_discrepancy_reply'
  | 'ack_chase'
  | 'receiver_inbound_notice'
  | 'vendor_claim_notice'
  | 'client_delay_note'
  | 'client_substitution_note'
  | 'memo_return_note';
export type ProcurementDraftStatus = 'awaiting_review' | 'sent' | 'discarded';

/** A project's procurement drafts, newest first; pass status to narrow. */
export function useProcurementDrafts(
  projectId: string | null | undefined,
  status?: ProcurementDraftStatus,
) {
  return useQuery({
    queryKey: [...buyingPhase2Keys.drafts(projectId ?? ''), status ?? 'all'],
    queryFn: async (): Promise<ProcurementDraftRow[]> => {
      let query = getSupabase()
        .from('procurement_drafts')
        .select('*')
        .eq('project_id', projectId as string);
      if (status) query = query.eq('status', status);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProcurementDraftRow[];
    },
    enabled: !!projectId,
  });
}

/** Edit a draft's subject or body while it awaits review. */
export function useUpdateProcurementDraft(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async ({
      draftId,
      request,
    }: {
      draftId: string;
      request: { subject?: string; body?: string };
    }): Promise<ProcurementDraftRow> => {
      const { data, error } = await getSupabase().rpc('update_procurement_draft', {
        p_draft_id: draftId,
        p_request: request as Json,
      });
      if (error) throw error;
      return data as ProcurementDraftRow;
    },
    onSuccess: () => invalidateDrafts(queryClient),
  });
}

export function useDiscardProcurementDraft(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async (draftId: string): Promise<ProcurementDraftRow> => {
      const { data, error } = await getSupabase().rpc('discard_procurement_draft', { p_draft_id: draftId });
      if (error) throw error;
      return data as ProcurementDraftRow;
    },
    onSuccess: () => invalidateDrafts(queryClient),
  });
}

/**
 * Send a draft as it is stored, through procurement-draft-send, which re-checks
 * the caller can read it, requires awaiting_review, sends through the
 * compliant-email chokepoint and marks it sent. Save an edit first.
 */
export function useSendProcurementDraft(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async (draftId: string): Promise<{ draftId: string; messageId: string | null }> => {
      const { data, error } = await getSupabase().functions.invoke('procurement-draft-send', {
        body: { draftId },
      });
      if (error) {
        // A non-2xx arrives as FunctionsHttpError with the raw Response as context.
        let message = error.message || 'The draft could not be sent.';
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const body = await (error as any).context?.json?.();
          if (body?.detail || body?.error) message = body.detail ?? body.error;
        } catch {
          /* keep the default message */
        }
        throw new Error(message);
      }
      return data as { draftId: string; messageId: string | null };
    },
    onSettled: () => invalidateDrafts(queryClient),
  });
}

/**
 * Compose a vendor letter on demand: the acknowledgment chase (a PO), the
 * receiver's inbound notice (a shipment) or the claim notice (a damage,
 * short-ship or wrong-item exception). Each lands awaiting review.
 */
export function useComposeProcurementDraft(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async (
      subject:
        | { kind: 'ack_chase'; purchaseOrderId: string }
        | { kind: 'receiver_inbound_notice'; shipmentId: string }
        | { kind: 'vendor_claim_notice'; exceptionId: string },
    ): Promise<ProcurementDraftRow> => {
      const supabase = getSupabase();
      const { data, error } =
        subject.kind === 'ack_chase'
          ? await supabase.rpc('compose_ack_chase_draft', { p_po_id: subject.purchaseOrderId })
          : subject.kind === 'receiver_inbound_notice'
            ? await supabase.rpc('compose_receiver_inbound_draft', { p_shipment_id: subject.shipmentId })
            : await supabase.rpc('compose_vendor_claim_draft', { p_exception_id: subject.exceptionId });
      if (error) throw error;
      return data as ProcurementDraftRow;
    },
    onSuccess: () => invalidateDrafts(queryClient),
  });
}

// ─── Vendor quotes (00707) ──────────────────────────────────────────────────

export type VendorQuoteRow = PublicSchema['Tables']['vendor_quotes']['Row'];
export type VendorQuoteLineRow = PublicSchema['Tables']['vendor_quote_lines']['Row'];
export type VendorQuoteWithLines = VendorQuoteRow & { vendor_quote_lines: VendorQuoteLineRow[] };

/** A project's vendor quotes with their lines, newest first. */
export function useVendorQuotes(projectId: string | null | undefined) {
  return useQuery({
    queryKey: buyingPhase2Keys.quotes(projectId ?? ''),
    queryFn: async (): Promise<VendorQuoteWithLines[]> => {
      const { data, error } = await getSupabase()
        .from('vendor_quotes')
        .select('*, vendor_quote_lines(*)')
        .eq('project_id', projectId as string)
        .order('received_on', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as VendorQuoteWithLines[];
    },
    enabled: !!projectId,
  });
}

/** A vendor quote. A linked request supplies the vendor and project. */
export interface VendorQuoteRequest {
  requestId?: string | null;
  vendorId?: string | null;
  projectId?: string | null;
  /** YYYY-MM-DD; defaults to today. */
  receivedOn?: string | null;
  quoteRef?: string | null;
  validUntil?: string | null;
  cratingCents?: number | null;
  freightEstimateCents?: number | null;
  paymentPattern?: 'fifty_fifty' | 'thirty_seventy' | 'full_upfront' | 'net_30' | 'custom_milestones' | null;
  depositPct?: number | null;
  documentPath?: string | null;
  supersedesQuoteId?: string | null;
  lines?: {
    ffeItemId: string;
    unitTradeCents: number;
    qty?: number | null;
    leadTimeWeeks?: number | null;
    note?: string | null;
  }[];
}

export function useRecordVendorQuote(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async (request: VendorQuoteRequest): Promise<VendorQuoteRow> => {
      const { data, error } = await getSupabase().rpc('record_vendor_quote', { p_request: request as Json });
      if (error) throw error;
      return data as VendorQuoteRow;
    },
    onSuccess: (row) => queryClient.invalidateQueries({ queryKey: buyingPhase2Keys.quotes(row.project_id) }),
  });
}

/**
 * Write a quote's trade prices onto its lines (all, or the chosen ones). Trade
 * only; a line on a PO is refused, a line on a sent authorization is
 * change_order_required.
 */
export function useApplyVendorQuoteToLines(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async ({
      quoteId,
      ffeItemIds,
    }: {
      quoteId: string;
      ffeItemIds?: string[];
      /** For cache invalidation. */
      projectId: string;
    }): Promise<VendorQuoteLineRow[]> => {
      const { data, error } = await getSupabase().rpc('apply_vendor_quote_to_lines', {
        p_quote_id: quoteId,
        p_ffe_item_ids: ffeItemIds,
      });
      if (error) throw error;
      return (data ?? []) as VendorQuoteLineRow[];
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: buyingPhase2Keys.quotes(projectId) });
      invalidateFfeCaches(queryClient, projectId);
    },
  });
}

// ─── Exceptions, substitution, refunds (00708) ──────────────────────────────

export type ProcurementExceptionRow = PublicSchema['Tables']['procurement_exceptions']['Row'];
export type ProcurementExceptionType =
  | 'concealed_damage'
  | 'damage'
  | 'short_ship'
  | 'wrong_item'
  | 'ack_discrepancy'
  | 'delay'
  | 'backorder'
  | 'discontinued'
  | 'price_change';
export type ProcurementExceptionStatus = 'open' | 'awaiting_vendor' | 'awaiting_client' | 'resolved';
export type ProcurementResolutionPath =
  | 'accept'
  | 'dispute'
  | 'vendor_corrected'
  | 'reconciled'
  | 'repair'
  | 'replace'
  | 'credit'
  | 'reship'
  | 'wait'
  | 'substitute'
  | 'cancel'
  | 'refund';
type ClientDecisionRow = PublicSchema['Tables']['client_decisions']['Row'];
type VendorPaymentRow = PublicSchema['Tables']['vendor_payments']['Row'];

/** A project's exceptions, newest first; open only unless includeResolved. */
export function useProcurementExceptions(projectId: string | null | undefined, includeResolved = false) {
  return useQuery({
    queryKey: [...buyingPhase2Keys.exceptions(projectId ?? ''), includeResolved ? 'all' : 'open'],
    queryFn: async (): Promise<ProcurementExceptionRow[]> => {
      let query = getSupabase()
        .from('procurement_exceptions')
        .select('*')
        .eq('project_id', projectId as string);
      if (!includeResolved) query = query.neq('status', 'resolved');
      const { data, error } = await query.order('opened_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProcurementExceptionRow[];
    },
    enabled: !!projectId,
  });
}

/**
 * Open an exception on a subject. Damage-type clocks come from the vendor
 * account's claims window (concealed damage: the carrier's); other types take
 * an optional clock with its basis in plain words. ack_discrepancy is opened
 * by an acknowledgment, never here.
 */
export interface OpenProcurementExceptionRequest {
  type: Exclude<ProcurementExceptionType, 'ack_discrepancy'>;
  ffeItemId?: string | null;
  purchaseOrderId?: string | null;
  shipmentId?: string | null;
  inspectionId?: string | null;
  damageClaimId?: string | null;
  note?: string | null;
  evidenceMediaIds?: string[] | null;
  /** YYYY-MM-DD, with clockBasis; ignored for damage types. */
  clockDueOn?: string | null;
  clockBasis?: string | null;
}

export function useOpenProcurementException(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async (request: OpenProcurementExceptionRequest): Promise<ProcurementExceptionRow> => {
      const { data, error } = await getSupabase().rpc('open_procurement_exception', {
        p_request: request as unknown as Json,
      });
      if (error) throw error;
      return data as ProcurementExceptionRow;
    },
    onSuccess: (row) => invalidateProcurementWork(queryClient, row.project_id),
  });
}

/** Move an exception to waiting, or resolve it with a path. Not for ack_discrepancy. */
export interface ResolveProcurementExceptionRequest {
  /** Defaults to resolved. */
  status?: 'awaiting_vendor' | 'awaiting_client' | 'resolved';
  /** Required to resolve. */
  resolutionPath?: ProcurementResolutionPath;
  note?: string | null;
  poChangeId?: string | null;
  replacementPurchaseOrderId?: string | null;
}

export function useResolveProcurementException(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async ({
      exceptionId,
      request,
    }: {
      exceptionId: string;
      request: ResolveProcurementExceptionRequest;
    }): Promise<ProcurementExceptionRow> => {
      const { data, error } = await getSupabase().rpc('resolve_procurement_exception', {
        p_exception_id: exceptionId,
        p_request: request as Json,
      });
      if (error) throw error;
      return data as ProcurementExceptionRow;
    },
    onSuccess: (row) => invalidateProcurementWork(queryClient, row.project_id),
  });
}

/**
 * Ask the client to choose a substitute: composes a client decision DRAFT
 * (the original and each alternate line at its client price) that the studio
 * releases with the decision rail. The line waits on the decision.
 */
export function useRequestSubstitutionApproval(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async ({
      ffeItemId,
      alternateIds,
    }: {
      ffeItemId: string;
      alternateIds: string[];
    }): Promise<ClientDecisionRow> => {
      const { data, error } = await getSupabase().rpc('request_substitution_approval', {
        p_item_id: ffeItemId,
        p_alternate_ids: alternateIds,
      });
      if (error) throw error;
      return data as ClientDecisionRow;
    },
    onSuccess: (decision) => {
      queryClient.invalidateQueries({ queryKey: ['client-decisions', decision.designer_client_id] });
      if (decision.project_id) {
        invalidateProcurementWork(queryClient, decision.project_id);
        invalidateFfeCaches(queryClient, decision.project_id);
      }
    },
  });
}

/** A refund or credit from the vendor; amountCents is positive and stored negative. */
export interface VendorRefundRequest {
  kind: 'refund' | 'credit';
  amountCents: number;
  /** YYYY-MM-DD; defaults to today. */
  paidOn?: string | null;
  method?: 'card' | 'ach' | 'check' | 'wire' | 'cash' | 'other' | null;
  paymentMethodId?: string | null;
  reference?: string | null;
  receiptDocumentPath?: string | null;
  currencyCode?: string | null;
}

export function useRecordVendorRefund(options?: ErrorSurfaceOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: errorMeta(options),
    mutationFn: async ({
      purchaseOrderId,
      request,
    }: {
      purchaseOrderId: string;
      request: VendorRefundRequest;
    }): Promise<VendorPaymentRow> => {
      const { data, error } = await getSupabase().rpc('record_vendor_refund', {
        p_po_id: purchaseOrderId,
        p_request: request as unknown as Json,
      });
      if (error) throw error;
      return data as VendorPaymentRow;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ['vendor-payments', row.purchase_order_id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', row.purchase_order_id] });
    },
  });
}

// --- C-24 custom piece (SQ-424) ---

/** One live line's pair facts: what it supplies, and the PO it is on. */
export interface FfePairLine {
  id: string;
  name: string;
  project_room_id: string | null;
  assignment_scope: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  purchase_order_id: string | null;
  parent_ffe_item_id: string | null;
  purchase_order: {
    id: string;
    po_number: string | null;
    status: string;
    vendor_id: string;
    supplies_purchase_order_id: string | null;
  } | null;
}

/**
 * The project's live lines with their pair facts (parent_ffe_item_id, the PO
 * and the PO it supplies). Under the project-ffe-items prefix, so every FF&E
 * write that invalidates the project's lines refreshes it.
 */
export function useFfePairLines(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-ffe-items', projectId ?? '', 'pair-lines'] as const,
    queryFn: async (): Promise<FfePairLine[]> => {
      const { data, error } = await getSupabase()
        .from('project_ffe_items')
        .select(
          'id, name, project_room_id, assignment_scope, vendor_id, vendor_name, purchase_order_id, parent_ffe_item_id, purchase_order:purchase_orders!purchase_order_id(id, po_number, status, vendor_id, supplies_purchase_order_id)',
        )
        .eq('project_id', projectId as string)
        .is('removed_at', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FfePairLine[];
    },
    enabled: !!projectId,
  });
}

export interface FfeComSpecRow {
  id: string;
  row_version: number;
  com_spec: Json | null;
}

/**
 * A line's COM facts with the row_version useUpdateFfeComSpec needs. Under
 * the project-ffe-items prefix, which that mutation invalidates.
 */
export function useFfeComSpec(projectId: string | null | undefined, ffeItemId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-ffe-items', projectId ?? '', 'com-spec', ffeItemId ?? ''] as const,
    queryFn: async (): Promise<FfeComSpecRow | null> => {
      const { data, error } = await getSupabase()
        .from('project_ffe_specs')
        .select('id, row_version, com_spec')
        .eq('ffe_item_id', ffeItemId as string)
        .maybeSingle();
      if (error) throw error;
      return (data as FfeComSpecRow | null) ?? null;
    },
    enabled: !!projectId && !!ffeItemId,
  });
}

// --- C-27 ack check (SQ-426) ---

/** One PO line, with the fields po-send prints (spec first, product as fallback). */
export interface PoAckBasisLine {
  id: string;
  name: string | null;
  quantity: number | null;
  trade_price_cents: number | null;
  unit_price_cents: number | null;
  spec: { sku: string | null; finish: string | null; color_fabric: string | null } | null;
  product: { sku: string | null; finish: string | null } | null;
}

/** What the PO told the vendor: the acknowledgment check's WE ORDERED column. */
export interface PoAckBasis {
  vendorId: string | null;
  projectId: string | null;
  /** YYYY-MM-DD the PO asked the vendor to ship. */
  requestedShipOn: string | null;
  lines: PoAckBasisLine[];
}

export const poAckBasisKey = (purchaseOrderId: string) =>
  [...buyingPhase2Keys.all, 'ack-basis', purchaseOrderId] as const;

/**
 * The PO's lines as po-send prints them, and its requested ship date — the
 * values log_po_acknowledgment_v2 compares an acknowledgment against. Freight
 * comes from usePoCostLines.
 */
export function usePoAckBasis(purchaseOrderId: string | null | undefined) {
  return useQuery({
    queryKey: poAckBasisKey(purchaseOrderId ?? ''),
    queryFn: async (): Promise<PoAckBasis> => {
      const supabase = getSupabase();
      const [po, items] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select('id, project_id, vendor_id, requested_ship_on')
          .eq('id', purchaseOrderId as string)
          .maybeSingle(),
        supabase
          .from('project_ffe_items')
          .select(
            `id, name, quantity, trade_price_cents, unit_price_cents,
             spec:project_ffe_specs!project_ffe_specs_ffe_item_id_fkey(sku, finish, color_fabric),
             product:products!product_id(sku, finish)`,
          )
          .eq('purchase_order_id', purchaseOrderId as string)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
      ]);
      if (po.error) throw po.error;
      if (items.error) throw items.error;
      const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
      return {
        vendorId: po.data?.vendor_id ?? null,
        projectId: po.data?.project_id ?? null,
        requestedShipOn: po.data?.requested_ship_on ?? null,
        lines: ((items.data ?? []) as unknown as PoAckBasisLine[]).map((line) => ({
          ...line,
          spec: one(line.spec),
          product: one(line.product),
        })),
      };
    },
    enabled: !!purchaseOrderId,
  });
}
