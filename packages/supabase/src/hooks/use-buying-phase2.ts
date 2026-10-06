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
      const { data, error } = await getSupabase().rpc('record_po_shipment', {
        p_po_id: purchaseOrderId,
        p_request: request as Json,
        p_local_date: localDate,
      });
      if (error) throw error;
      return data as PoShipmentRow;
    },
    onSuccess: (row, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: buyingPhase2Keys.shipments(row.purchase_order_id) });
      queryClient.invalidateQueries({ queryKey: ['orders-book', 'week-events'] });
      invalidatePurchaseOrder(queryClient, { id: row.purchase_order_id, project_id: projectId });
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
