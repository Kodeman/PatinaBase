/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file uses type assertions (as any) because the database types
// haven't been regenerated yet to include the procurement workspace tables
// (purchase_orders, po_payments) added in migration 00148. The hook-level
// interfaces below mirror the table shape and are the canonical contract
// until `pnpm db:generate` is run.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES (mirror migration 00148)
// ═══════════════════════════════════════════════════════════════════════════

export type PaymentPattern =
  | 'fifty_fifty'
  | 'thirty_seventy'
  | 'full_upfront'
  | 'net_30'
  | 'custom_milestones';

export type POPaymentKind = 'deposit' | 'balance' | 'milestone';
export type POPaymentState = 'pending' | 'due' | 'paid';

export type POStatus =
  | 'draft'
  | 'confirmed'
  | 'in_production'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface PurchaseOrder {
  id: string;
  designer_id: string;
  project_id: string;
  vendor_id: string;
  vendor_po_number: string | null;
  confirmed_eta: string | null;
  /**
   * OUR outbound number (PO-0001 …), a per-designer sequence assigned by
   * assign_po_number (00188) on first send. Distinct from vendor_po_number
   * (the VENDOR's confirmation number). NULL until first sent.
   */
  po_number: string | null;
  /** Free-text ship-to block printed on the outbound PO document (00188). */
  ship_to: string | null;
  /** Storage path of the rendered PO PDF in project-documents (00188). */
  po_document_path: string | null;
  /** When the PO was first sent to the vendor by po-send (00188). */
  sent_at: string | null;
  payment_pattern: PaymentPattern;
  /**
   * Vendor-facing TRADE total (00186): server-computed by the
   * create_purchase_order RPC as Σ COALESCE(trade_price_cents,
   * unit_price_cents, 0) × quantity over the linked items at creation time.
   * Rows created before 00186 keep the CLIENT-price totals they were
   * written with.
   */
  total_cents: number;
  status: POStatus;
  is_patina_catalog: boolean;
  /** Shipment sidemark (Studio / Client / Project / Room), 00186. */
  sidemark: string | null;
  /** When the vendor confirmed receipt of the order (00186). */
  acknowledged_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vendor?: {
    id: string;
    name: string;
    default_payment_terms: PaymentPattern | null;
    is_patina_catalog?: boolean;
    /**
     * Outbound PO recipient fields (W4-T4). The po-send edge function
     * resolves the recipient authoritatively server-side (orders_email →
     * contact_info->>'email'); these only drive the client-side
     * disabled-state heuristic + label hint on "Email to vendor".
     */
    orders_email?: string | null;
    contact_info?: Record<string, unknown> | null;
  };
  project?: { id: string; name: string };
  payments?: POPayment[];
}

export interface POPayment {
  id: string;
  purchase_order_id: string;
  kind: POPaymentKind;
  amount_cents: number;
  due_date: string | null;
  paid_date: string | null;
  state: POPaymentState;
  label: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface POFilters {
  projectId?: string;
  vendorId?: string;
  status?: POStatus;
  paymentState?: POPaymentState;
}

export interface CreatePurchaseOrderInput {
  projectId: string;
  vendorId: string;
  vendorPoNumber?: string;
  confirmedEta?: string;
  paymentPattern: PaymentPattern;
  isPatinaCatalog?: boolean;
  ffeItemIds: string[];
  depositDueDate?: string;
  depositAmountCents?: number;
  customMilestones?: Array<{
    label: string;
    amountCents: number;
    dueDate?: string;
    sortOrder: number;
  }>;
  /** Shipment sidemark (Studio / Client / Project / Room), 00186. */
  sidemark?: string;
  notes?: string;
}

export interface LogPOAcknowledgmentInput {
  purchaseOrderId: string;
  /**
   * When supplied as a non-null string, overwrites `vendor_po_number`.
   * Omitted (`undefined`) **or explicit `null`** both preserve the existing
   * value — they map to SQL NULL which the RPC treats as "no-op". Only a
   * defined string actually overwrites.
   */
  vendorPoNumber?: string | null;
  /**
   * When supplied as a non-null string/date, overwrites `confirmed_eta`.
   * Omitted (`undefined`) **or explicit `null`** both preserve the existing
   * value — they map to SQL NULL which the RPC treats as "no-op". Only a
   * defined value actually overwrites.
   */
  confirmedEta?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Today's ISO date (YYYY-MM-DD), used as default paid_date.
 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Invalidates both FF&E cache namespaces for a project.
 *
 * Both this package and the portal now key FF&E items under
 * `['project-ffe-items', id]`. The `['projects', projectId]` prefix sweep
 * is kept for the financial rollups, key-metrics, and project detail queries
 * that the 00184 stage-ratchet triggers feed into — those live under the
 * portal's `['projects', id, 'financials'/'key-metrics'/detail]` namespace
 * and are not matched by the `['project-ffe-items']` key above.
 *
 * Call this from any mutation whose write can cause the DB triggers
 * (migration 00184) to advance project_ffe_items rows server-side — the
 * client never sees those writes, so both cache namespaces must refetch.
 */
export function invalidateFfeCaches(queryClient: QueryClient, projectId: string): void {
  queryClient.invalidateQueries({ queryKey: ['project-ffe-items', projectId] });
  queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
  // Cross-project procurement views (By Status) read items under this
  // prefix; the project-scoped keys above can't reach it, so sweep it whole.
  queryClient.invalidateQueries({ queryKey: ['procurement-items'] });
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetches purchase orders for the authenticated designer. Joins vendor name,
 * project name, and nested po_payments. Optional filters narrow the result set.
 */
export function usePurchaseOrders(filters?: POFilters) {
  return useQuery({
    queryKey: ['purchase-orders', filters],
    queryFn: async () => {
      const supabase = getSupabase() as any;
      let query = supabase
        .from('purchase_orders')
        .select(
          `
          *,
          vendor:vendors!purchase_orders_vendor_id_fkey(id, name, default_payment_terms, is_patina_catalog, orders_email, contact_info),
          project:projects!purchase_orders_project_id_fkey(id, name),
          payments:po_payments(*)
        `
        )
        .order('created_at', { ascending: false });

      if (filters?.projectId) query = query.eq('project_id', filters.projectId);
      if (filters?.vendorId) query = query.eq('vendor_id', filters.vendorId);
      if (filters?.status) query = query.eq('status', filters.status);

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []) as PurchaseOrder[];

      // paymentState filter is applied client-side because it lives in the
      // nested po_payments rows. We keep any PO that has at least one payment
      // row in the requested state.
      if (filters?.paymentState) {
        rows = rows.filter((po) =>
          (po.payments ?? []).some((p) => p.state === filters.paymentState)
        );
      }

      return rows;
    },
  });
}

// ─── W1-T5: Cross-project FF&E items (rows-per-item By Status view) ─────────

/**
 * The 8-stage FF&E pipeline status — mirrors the CHECK constraint on
 * `project_ffe_items.status` (migration 00066) and `FFE_STAGE_KEYS` in
 * @patina/types.
 */
export type FFEItemStatus =
  | 'specified'
  | 'quoted'
  | 'approved'
  | 'ordered'
  | 'production'
  | 'shipped'
  | 'delivered'
  | 'installed';

/**
 * A project_ffe_items row joined with its purchase order (vendor + payments),
 * project, and room — the row shape for the cross-project By Status view.
 * Scalar columns mirror migration 00066 (+ purchase_order_id from 00148).
 */
export interface ProcurementItemRow {
  id: string;
  project_id: string;
  project_room_id: string | null;
  product_id: string | null;
  purchase_order_id: string | null;
  name: string;
  ffe_category: string | null;
  item_type: 'fixed' | 'allowance' | 'tbd';
  status: FFEItemStatus;
  quantity: number;
  unit_price_cents: number | null;
  line_total_cents: number | null;
  vendor_name: string | null;
  vendor_id: string | null;
  po_number: string | null;
  eta: string | null;
  blocked: boolean | null;
  blocked_reason: string | null;
  notes: string | null;
  sort_order: number;
  /**
   * Units physically received against `quantity` (00150; stamped to full
   * quantity by 00184 Trigger C on clean inspections, or set per-item by
   * useCreateReceivingInspection's partial-receipt path, W5-T2).
   */
  received_quantity: number | null;
  /** Stamped by the 00084 trigger whenever `status` changes — the By Status
   *  "Delivered" column reads this for delivered/installed rows. */
  last_status_change_at: string | null;
  created_at: string;
  updated_at: string;
  purchase_order?: {
    id: string;
    status: POStatus;
    vendor_po_number: string | null;
    /** OUR outbound number (PO-0001 …), assigned on first send (00188). */
    po_number: string | null;
    confirmed_eta: string | null;
    total_cents: number;
    payment_pattern: PaymentPattern;
    is_patina_catalog: boolean;
    /** When the PO was first sent to the vendor (00188) — drives the
     *  By Status "no ack" expediting flag (W5-T2). */
    sent_at: string | null;
    /** When the vendor confirmed receipt (00186) — the "Ack" column. */
    acknowledged_at: string | null;
    /** PO creation timestamp — the "Ordered" column. */
    created_at: string;
    vendor?: { id: string; name: string } | null;
    payments?: POPayment[];
  } | null;
  project?: { id: string; name: string } | null;
  room?: { id: string; name: string } | null;
}

export interface ProcurementItemFilters {
  projectId?: string;
  vendorId?: string;
  purchaseOrderId?: string;
}

/**
 * Fetches FF&E items across every project the designer owns, joined with the
 * linked purchase order (vendor + nested po_payments), project, and room —
 * the rows-per-item source for Procurement → By Status (W1-T5).
 *
 * RLS ("Designers manage their project FFE items", migration 00066) scopes
 * rows to the designer via project ownership — no extra .eq is needed,
 * matching useProjectFFEItems.
 *
 * Query key: `['procurement-items', filters ?? {}]`.
 */
export function useProcurementItems(filters?: ProcurementItemFilters) {
  return useQuery({
    queryKey: ['procurement-items', filters ?? {}],
    queryFn: async (): Promise<ProcurementItemRow[]> => {
      const supabase = getSupabase() as any;
      let query = supabase
        .from('project_ffe_items')
        .select(
          `
          *,
          purchase_order:purchase_orders!purchase_order_id(
            id, status, vendor_po_number, po_number, confirmed_eta, total_cents,
            payment_pattern, is_patina_catalog,
            sent_at, acknowledged_at, created_at,
            vendor:vendors!purchase_orders_vendor_id_fkey(id, name),
            payments:po_payments(*)
          ),
          project:projects!project_id(id, name),
          room:project_rooms!project_room_id(id, name)
        `
        )
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (filters?.projectId) query = query.eq('project_id', filters.projectId);
      if (filters?.vendorId) query = query.eq('vendor_id', filters.vendorId);
      if (filters?.purchaseOrderId) {
        query = query.eq('purchase_order_id', filters.purchaseOrderId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ProcurementItemRow[];
    },
  });
}

/**
 * Fetches all po_payments rows for a single purchase order, ordered by
 * sort_order ascending.
 */
export function usePOPayments(purchaseOrderId: string) {
  return useQuery({
    queryKey: ['po-payments', purchaseOrderId],
    queryFn: async () => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('po_payments')
        .select('*')
        .eq('purchase_order_id', purchaseOrderId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as POPayment[];
    },
    enabled: !!purchaseOrderId,
  });
}

/**
 * Reads the default_payment_terms column for a single vendor.
 */
export function useVendorPaymentTerms(vendorId: string) {
  return useQuery({
    queryKey: ['vendor-payment-terms', vendorId],
    queryFn: async (): Promise<PaymentPattern | null> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('vendors')
        .select('default_payment_terms')
        .eq('id', vendorId)
        .single();
      if (error) throw error;
      return (data?.default_payment_terms ?? null) as PaymentPattern | null;
    },
    enabled: !!vendorId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mutation: updates vendors.default_payment_terms.
 */
export function useUpdateVendorPaymentTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      vendorId,
      terms,
    }: {
      vendorId: string;
      terms: PaymentPattern;
    }): Promise<void> => {
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('vendors')
        .update({ default_payment_terms: terms })
        .eq('id', vendorId);
      if (error) throw error;
    },
    onSuccess: (_, { vendorId }) => {
      queryClient.invalidateQueries({ queryKey: ['vendor-payment-terms', vendorId] });
      queryClient.invalidateQueries({ queryKey: ['vendor', vendorId] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
  });
}

/**
 * Mutation: creates a purchase order via the atomic `create_purchase_order`
 * RPC (migration 00186). One server-side transaction owns everything the old
 * 3-step client flow stitched together with compensating deletes:
 *
 *   * header INSERT with `total_cents` = vendor TRADE total, server-computed
 *     as Σ COALESCE(trade_price_cents, unit_price_cents, 0) × quantity over
 *     the supplied items (the client no longer sends a total),
 *   * po_payments rows for the chosen pattern (the old
 *     buildPaymentRowsForPattern logic, now in SQL),
 *   * project_ffe_items linking with server-side guards — cross-project,
 *     already-ordered, and decision-blocked items all hard-fail the whole
 *     transaction instead of silently no-op'ing.
 *
 * Resolves with the created purchase_orders row (same shape the old hook
 * returned from its header INSERT).
 */
export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePurchaseOrderInput): Promise<PurchaseOrder> => {
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('create_purchase_order', {
        p_project_id: input.projectId,
        p_vendor_id: input.vendorId,
        p_payment_pattern: input.paymentPattern,
        p_ffe_item_ids: input.ffeItemIds,
        p_vendor_po_number: input.vendorPoNumber ?? null,
        p_confirmed_eta: input.confirmedEta ?? null,
        p_is_patina_catalog: input.isPatinaCatalog ?? false,
        p_deposit_due_date: input.depositDueDate ?? null,
        p_deposit_amount_cents: input.depositAmountCents ?? null,
        p_custom_milestones: (input.customMilestones ?? []).map((m) => ({
          label: m.label,
          amount_cents: m.amountCents,
          due_date: m.dueDate ?? null,
          sort_order: m.sortOrder,
        })),
        p_sidemark: input.sidemark ?? null,
        p_notes: input.notes ?? null,
      });

      if (error) {
        throw new Error(
          `Failed to create purchase order: ${error.message ?? String(error)}`
        );
      }
      return data as PurchaseOrder;
    },
    onSuccess: (po) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', po.id] });
      queryClient.invalidateQueries({ queryKey: ['po-payments', po.id] });
      // Linking items to the PO fires the 00184 stage-ratchet trigger
      // (aaa_ffe_ratchet_to_po_stage), so both FF&E cache namespaces must
      // refetch — not just the package-side ['project-ffe-items'] key.
      invalidateFfeCaches(queryClient, po.project_id);
      // Ordering changes what the invoice soft-gate should surface next time
      // (00187 — get_ffe_invoice_coverage read-model in use-invoices.ts).
      queryClient.invalidateQueries({ queryKey: ['ffe-invoice-coverage', po.project_id] });
    },
  });
}

/**
 * Mutation: records the vendor's acknowledgment of a purchase order via the
 * `log_po_acknowledgment` RPC (migration 00186). Server-side it stamps
 * `acknowledged_at` (idempotent — re-acknowledging never overwrites the
 * original timestamp), advances draft → confirmed (00184 Trigger B keeps
 * linked items at 'ordered' — rank no-op), and coalesce-updates
 * vendor_po_number / confirmed_eta (undefined inputs preserve existing
 * values). Owner-scoped; rejects POs past 'confirmed'.
 *
 * Invalidates: ['purchase-orders'], ['purchase-order', id],
 *              ['procurement-items'].
 *
 * Document-surface callers (R83 error grammar) pass `{ errorSurface:
 * 'inline' }` so the designer portal's global mutation toast stays quiet —
 * see useSendInvoice for the precedent.
 */
export function useLogPOAcknowledgment(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async (input: LogPOAcknowledgmentInput): Promise<PurchaseOrder> => {
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('log_po_acknowledgment', {
        p_po_id: input.purchaseOrderId,
        p_vendor_po_number: input.vendorPoNumber ?? null,
        p_confirmed_eta: input.confirmedEta ?? null,
      });

      if (error) {
        throw new Error(
          `Failed to log PO acknowledgment for ${input.purchaseOrderId}: ${
            error.message ?? String(error)
          }`
        );
      }
      return data as PurchaseOrder;
    },
    onSuccess: (po) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', po.id] });
      // The By Status per-item rows read status/vendor_po_number/confirmed_eta
      // off the joined PO.
      queryClient.invalidateQueries({ queryKey: ['procurement-items'] });
    },
  });
}

/**
 * Mutation: logs a payment as paid. Sets paid_date = today (or supplied date),
 * state = 'paid'. Single UPDATE on the paid row — the deposit-paid →
 * sibling-balance-due flip is owned by the DB (migration 00184, Trigger D
 * `trg_deposit_paid_flips_balance`), which fires server-side on the
 * pending→paid transition when the parent split-pattern PO has already
 * shipped or delivered.
 *
 * Note for callers: the mutation's resolved value is only the updated payment
 * row. When the trigger flips the sibling balance row to 'due', that change
 * is visible exclusively via the invalidated `po-payments` /
 * `purchase-orders` caches — UI code that needs the flipped balance state
 * must read it from a query subscription, not from the mutation's return
 * value.
 */
export function useLogPaymentPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      paymentId,
      purchaseOrderId: _purchaseOrderId,
      paidDate,
      notes,
    }: {
      paymentId: string;
      purchaseOrderId: string;
      paidDate?: string;
      notes?: string;
    }): Promise<POPayment> => {
      const supabase = getSupabase() as any;

      const updates: Record<string, unknown> = {
        state: 'paid',
        paid_date: paidDate ?? today(),
      };
      if (notes !== undefined) updates.notes = notes;

      const { data: updated, error: updateError } = await supabase
        .from('po_payments')
        .update(updates)
        .eq('id', paymentId)
        .select()
        .single();
      if (updateError) throw updateError;

      return updated as POPayment;
    },
    onSuccess: (_, { purchaseOrderId }) => {
      queryClient.invalidateQueries({ queryKey: ['po-payments', purchaseOrderId] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', purchaseOrderId] });
    },
  });
}

/**
 * Mutation: updates purchase_orders.confirmed_eta for a single PO. When a
 * `notes` string is supplied, appends a timestamped audit line to
 * `purchase_orders.notes` so the designer has a record of what the vendor
 * told them and when. The notes column is a free-form text field and the
 * line format is:
 *
 *     [YYYY-MM-DD ETA update]: <notes>
 *
 * (preserving any existing notes content). The update is a single-row
 * mutation, so no compensating delete is needed — the PRD W2.4 vision is
 * "vendor emails, designer types new date, hits save, 3 seconds done."
 *
 * Invalidates: ['purchase-orders'], ['purchase-order', poId],
 *              ['delivery-calendar'] (so the unified calendar view picks
 *              up the new ETA on its next render).
 */
export function useUpdatePurchaseOrderETA() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      purchaseOrderId,
      newEta,
      notes,
    }: {
      purchaseOrderId: string;
      newEta: string;
      notes?: string;
    }): Promise<PurchaseOrder> => {
      const supabase = getSupabase() as any;

      const updates: Record<string, unknown> = { confirmed_eta: newEta };

      // When the designer provided notes, append a timestamped line to
      // the existing notes column. Read once to preserve prior content.
      const trimmedNotes = notes?.trim();
      if (trimmedNotes) {
        const { data: current, error: readError } = await supabase
          .from('purchase_orders')
          .select('notes')
          .eq('id', purchaseOrderId)
          .single();
        if (readError) {
          throw new Error(
            `Failed to read purchase_order ${purchaseOrderId} for ETA notes append: ${
              readError.message ?? String(readError)
            }`,
          );
        }
        const existingNotes = (current as { notes: string | null })?.notes ?? '';
        const today = new Date().toISOString().slice(0, 10);
        const appended = `[${today} ETA update]: ${trimmedNotes}`;
        updates.notes = existingNotes
          ? `${existingNotes}\n${appended}`
          : appended;
      }

      const { data, error } = await supabase
        .from('purchase_orders')
        .update(updates)
        .eq('id', purchaseOrderId)
        .select()
        .single();

      if (error) {
        throw new Error(
          `Failed to update purchase_order ETA for ${purchaseOrderId}: ${
            error.message ?? String(error)
          }`,
        );
      }
      return data as PurchaseOrder;
    },
    onSuccess: (po) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', po.id] });
      // The unified calendar view derives event_date from confirmed_eta —
      // invalidate every cached range so the next render reflects the shift.
      queryClient.invalidateQueries({ queryKey: ['delivery-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['today-procurement-counts'] });
      // The By Status per-item rows (W1-T5) read confirmed_eta off the joined
      // PO — refresh them so the ETA quick-edit drawer's save is visible.
      queryClient.invalidateQueries({ queryKey: ['procurement-items'] });
    },
  });
}

export interface UpdatePurchaseOrderStatusInput {
  purchaseOrderId: string;
  /** Target lifecycle status. 'draft' is creation-only and not reachable here. */
  status: Exclude<POStatus, 'draft'>;
  /**
   * When supplied, FF&E caches for the project are invalidated too — the
   * 00184 cascade trigger advances (or, on cancel, detaches) linked
   * project_ffe_items rows server-side, so stale FF&E caches are a real
   * concern after any status change.
   */
  projectId?: string;
}

/**
 * Mutation: updates purchase_orders.status. Plain single-row UPDATE — every
 * downstream side effect is owned by the DB (migration 00184):
 *   * Trigger B (`trg_po_status_cascade_to_items`) ratchets linked FF&E items
 *     forward (or detaches them on 'cancelled'), and flips the pending
 *     balance payment to 'due' when the PO reaches shipped/delivered with
 *     the deposit already paid.
 *
 * RLS scopes the UPDATE to the owning designer.
 *
 * Invalidates: ['purchase-orders'], ['purchase-order', id],
 *              ['po-payments', id] (the trigger may flip the balance row),
 *              ['delivery-calendar'], ['today-procurement-counts'],
 *              and — when projectId is provided — both FF&E namespaces via
 *              invalidateFfeCaches().
 */
export function useUpdatePurchaseOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      purchaseOrderId,
      status,
    }: UpdatePurchaseOrderStatusInput): Promise<PurchaseOrder> => {
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('purchase_orders')
        .update({ status })
        .eq('id', purchaseOrderId)
        .select()
        .single();

      if (error) {
        throw new Error(
          `Failed to update purchase_order status for ${purchaseOrderId}: ${
            error.message ?? String(error)
          }`,
        );
      }
      return data as PurchaseOrder;
    },
    onSuccess: (_, { purchaseOrderId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', purchaseOrderId] });
      queryClient.invalidateQueries({ queryKey: ['po-payments', purchaseOrderId] });
      queryClient.invalidateQueries({ queryKey: ['delivery-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['today-procurement-counts'] });
      if (projectId) {
        invalidateFfeCaches(queryClient, projectId);
      }
    },
  });
}

/**
 * Mutation: manually advances a po_payment row to 'due' state (with an
 * optional due_date). The automatic flips — deposit-paid and PO-shipped /
 * delivered on split patterns — are owned by the 00184 DB triggers; this
 * hook remains for explicit, designer-initiated advances outside those
 * paths (e.g. a milestone the vendor invoiced early).
 */
export function useAdvancePaymentToDue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      paymentId,
      purchaseOrderId: _purchaseOrderId,
      dueDate,
    }: {
      paymentId: string;
      purchaseOrderId: string;
      dueDate?: string;
    }): Promise<POPayment> => {
      const supabase = getSupabase() as any;

      const updates: Record<string, unknown> = { state: 'due' };
      if (dueDate !== undefined) updates.due_date = dueDate;

      const { data, error } = await supabase
        .from('po_payments')
        .update(updates)
        .eq('id', paymentId)
        .select()
        .single();
      if (error) throw error;
      return data as POPayment;
    },
    onSuccess: (_, { purchaseOrderId }) => {
      queryClient.invalidateQueries({ queryKey: ['po-payments', purchaseOrderId] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', purchaseOrderId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — RECEIVING + DAMAGE CLAIMS + CALENDAR (migration 00150)
// ═══════════════════════════════════════════════════════════════════════════
//
// Until Engineer A's `pnpm db:generate` runs, the regenerated
// `database.types.ts` will not include `receiving_inspections`, `damage_claims`,
// or the `delivery_events` view. Declare the canonical row shapes here per
// dossier Section 3. These mirror migration 00150 exactly.

// ─── TYPES ─────────────────────────────────────────────────────────────────

export type ReceivingInspectionOutcome = 'clean' | 'damaged' | 'partial';
export type DamageClaimState = 'drafted' | 'vendor_notified' | 'resolved';

export interface ReceivingInspection {
  id: string;
  purchase_order_id: string;
  inspected_at: string;
  inspected_by: string;
  outcome: ReceivingInspectionOutcome;
  notes: string | null;
  photo_asset_ids: string[];
  created_at: string;
  updated_at: string;
  purchase_order?: {
    id: string;
    vendor_id: string;
    project_id: string;
    status: POStatus;
    vendor?: { id: string; name: string };
    project?: { id: string; name: string };
  };
  damage_claims?: DamageClaim[];
}

export interface DamageClaim {
  id: string;
  receiving_inspection_id: string;
  state: DamageClaimState;
  description: string | null;
  vendor_notified_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  inspection?: {
    id: string;
    purchase_order_id: string;
    outcome: ReceivingInspectionOutcome;
    purchase_order?: {
      id: string;
      vendor?: { id: string; name: string };
      project?: { id: string; name: string };
    };
  };
}

export interface DeliveryEvent {
  event_id: string;
  project_id: string;
  project_name: string;
  purchase_order_id: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  event_date: string | null;
  event_type: 'delivery_expected' | 'install_milestone';
  po_status: POStatus | null;
  delivered_date: string | null;
  ffe_item_count: number | null;
  line_total_cents: number | null;
  inspection_id: string | null;
  inspection_outcome: ReceivingInspectionOutcome | null;
  phase_key: string | null;
}

export interface ReceivingInspectionFilters {
  vendorId?: string;
  projectId?: string;
  outcome?: ReceivingInspectionOutcome;
  sinceDate?: string;
}

export interface DamageClaimFilters {
  state?: DamageClaimState;
  vendorId?: string;
  sinceDate?: string;
}

/**
 * Per-item received quantity for the partial-receipt path (W5-T2).
 * `orderedQuantity` is the line's `project_ffe_items.quantity` — supplying it
 * lets the hook skip updates the 00184 Trigger C already made (clean outcome
 * stamps received_quantity = quantity server-side).
 */
export interface ReceivingInspectionItemInput {
  ffeItemId: string;
  receivedQuantity: number;
  orderedQuantity?: number;
}

export interface CreateReceivingInspectionInput {
  purchaseOrderId: string;
  outcome: ReceivingInspectionOutcome;
  notes?: string;
  photoAssetIds?: string[];
  /**
   * When supplied, FF&E caches for the project are invalidated on success —
   * the 00184 inspection trigger advances linked project_ffe_items rows
   * (status + received_quantity) server-side on clean outcomes, so stale
   * FF&E caches are a real concern.
   */
  projectId?: string;
  /**
   * Per-item received quantities (W5-T2 partial receiving). See the
   * Trigger-C interplay note inside the mutation — clean-outcome rows at
   * full quantity are skipped as redundant.
   */
  items?: ReceivingInspectionItemInput[];
  /**
   * Item-grain claim attribution (R7 follow-through, The Document). When
   * provided with a non-clean outcome, ONE drafted damage_claim is inserted
   * PER item (ffe_item_id set) instead of the single anonymous PO-grain
   * claim — those items then carry the truthful DAMAGED stamp in The
   * Document. Omitted/empty → one anonymous claim, as before.
   */
  damagedFfeItemIds?: string[];
}

export interface UpdateDamageClaimInput {
  id: string;
  state?: DamageClaimState;
  description?: string;
  vendor_notified_at?: string;
  resolved_at?: string;
  resolution_notes?: string;
}

export interface TodayProcurementCounts {
  arrivingThisWeek: number;
  inspectionsPending: number;
  damageClaimsOpen: number;
}

// ─── HELPERS ───────────────────────────────────────────────────────────────

/**
 * ISO timestamp helper for damage-claim transition defaults.
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Auto-drafted description template (dossier Section 4). Used by
 * useCreateReceivingInspection when outcome is 'damaged' or 'partial'.
 * Wave 2.3's claim form pre-fills the description from this template; the
 * designer edits it before clicking "Notify vendor."
 */
export function autoDraftDamageClaimDescription(
  outcome: ReceivingInspectionOutcome,
  notes: string | undefined,
  vendorName: string,
  poNumber: string | null,
): string {
  const head = outcome === 'damaged' ? 'Damage reported on delivery' : 'Partial delivery received';
  const poBit = poNumber ? ` (PO ${poNumber})` : '';
  const notesBit = notes ? `\n\nInspection notes: ${notes}` : '';
  return `${head} from ${vendorName}${poBit}.${notesBit}\n\nPlease describe the issue in detail before notifying the vendor.`;
}

// ─── QUERY HOOKS ───────────────────────────────────────────────────────────

/**
 * Fetches receiving_inspections for the authenticated designer. Joins the
 * purchase_order (with vendor + project) and any nested damage_claims.
 * Optional filters narrow by vendor, project, outcome, or recency.
 * Query key: `['receiving-inspections', filters]`.
 */
export function useReceivingInspections(filters?: ReceivingInspectionFilters) {
  return useQuery({
    queryKey: ['receiving-inspections', filters],
    queryFn: async (): Promise<ReceivingInspection[]> => {
      const supabase = getSupabase() as any;
      let query = supabase
        .from('receiving_inspections')
        .select(
          `
          *,
          purchase_order:purchase_orders!receiving_inspections_purchase_order_id_fkey(
            id, vendor_id, project_id, status,
            vendor:vendors!purchase_orders_vendor_id_fkey(id, name),
            project:projects!purchase_orders_project_id_fkey(id, name)
          ),
          damage_claims(*)
        `,
        )
        .order('inspected_at', { ascending: false });

      if (filters?.outcome) query = query.eq('outcome', filters.outcome);
      if (filters?.sinceDate) query = query.gte('inspected_at', filters.sinceDate);

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []) as ReceivingInspection[];

      // vendorId / projectId live on the joined purchase_order — apply
      // client-side because the embedded relationship can't be filtered via
      // .eq() on the parent table.
      if (filters?.vendorId) {
        rows = rows.filter((r) => r.purchase_order?.vendor_id === filters.vendorId);
      }
      if (filters?.projectId) {
        rows = rows.filter((r) => r.purchase_order?.project_id === filters.projectId);
      }

      return rows;
    },
  });
}

/**
 * Fetches damage_claims for the authenticated designer. Joins the parent
 * receiving_inspection and the inspection's purchase_order (with vendor +
 * project). Optional filters narrow by state, vendor, or recency.
 * Query key: `['damage-claims', filters]`.
 */
export function useDamageClaims(filters?: DamageClaimFilters) {
  return useQuery({
    queryKey: ['damage-claims', filters],
    queryFn: async (): Promise<DamageClaim[]> => {
      const supabase = getSupabase() as any;
      let query = supabase
        .from('damage_claims')
        .select(
          `
          *,
          inspection:receiving_inspections!damage_claims_receiving_inspection_id_fkey(
            id, purchase_order_id, outcome,
            purchase_order:purchase_orders!receiving_inspections_purchase_order_id_fkey(
              id,
              vendor:vendors!purchase_orders_vendor_id_fkey(id, name),
              project:projects!purchase_orders_project_id_fkey(id, name)
            )
          )
        `,
        )
        .order('created_at', { ascending: false });

      if (filters?.state) query = query.eq('state', filters.state);
      if (filters?.sinceDate) query = query.gte('created_at', filters.sinceDate);

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []) as DamageClaim[];

      // vendorId lives on the nested purchase_order — apply client-side.
      if (filters?.vendorId) {
        rows = rows.filter(
          (r) => r.inspection?.purchase_order?.vendor?.id === filters.vendorId,
        );
      }

      return rows;
    },
  });
}

/**
 * Fetches the unified delivery_events view (PO confirmed_etas + project
 * install milestones) within an inclusive date range. The view is
 * SECURITY INVOKER — RLS on the underlying tables (purchase_orders,
 * project_phases) is enforced automatically.
 *
 * `rangeStart` and `rangeEnd` are ISO YYYY-MM-DD strings.
 * Query key: `['delivery-calendar', rangeStart, rangeEnd]`.
 */
export function useDeliveryCalendar(rangeStart: string, rangeEnd: string) {
  return useQuery({
    queryKey: ['delivery-calendar', rangeStart, rangeEnd],
    queryFn: async (): Promise<DeliveryEvent[]> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('delivery_events')
        .select('*')
        .gte('event_date', rangeStart)
        .lte('event_date', rangeEnd)
        .order('event_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DeliveryEvent[];
    },
    enabled: !!rangeStart && !!rangeEnd,
  });
}

/**
 * Lightweight Today-tab counters: deliveries arriving in the next 7 days,
 * inspections logged in the last 7 days, and open damage claims (drafted
 * or vendor_notified). Sub-queries run independently — if any one fails,
 * the others still resolve and the failing rollup falls back to zero.
 *
 * Query key: `['today-procurement-counts']`. Stale time: 5 minutes.
 */
export function useTodayProcurementCounts() {
  return useQuery({
    queryKey: ['today-procurement-counts'],
    queryFn: async (): Promise<TodayProcurementCounts> => {
      const supabase = getSupabase() as any;
      const today = new Date().toISOString().slice(0, 10);
      const sevenDaysAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      // Each sub-query is wrapped so a single failure never poisons the
      // whole rollup. The Today tab degrades gracefully — a stale or
      // missing count is preferable to an entirely broken tile.
      const arrivingThisWeekP = (async (): Promise<number> => {
        try {
          const { count, error } = await supabase
            .from('purchase_orders')
            .select('id', { count: 'exact', head: true })
            .gte('confirmed_eta', today)
            .lte('confirmed_eta', sevenDaysAhead)
            .not('status', 'in', '("cancelled","delivered")');
          if (error) {
            console.warn('useTodayProcurementCounts: arrivingThisWeek failed', error);
            return 0;
          }
          return count ?? 0;
        } catch (e) {
          console.warn('useTodayProcurementCounts: arrivingThisWeek threw', e);
          return 0;
        }
      })();

      // `inspectionsPending` = POs in status 'delivered' WITHOUT a matching
      // row in `receiving_inspections` (i.e., the work the designer still has
      // to log). This mirrors the client-side filter used by the Receiving
      // page's "Pending Inspection" tab — replicated here so the Today
      // Dashboard tile and the Receiving tab agree.
      //
      // We compute the set difference client-side from two small queries:
      //   1. delivered PO ids
      //   2. distinct purchase_order_id from receiving_inspections (any age —
      //      we don't want a single old inspection on a re-delivered PO to
      //      flip back to "pending" when the next delivery arrives).
      //
      // The delivered-PO query is capped at DELIVERED_PO_LIMIT — designers
      // with thousands of historical delivered POs would never see them all
      // in a Today tile, and PostgREST `.limit()` keeps the response bounded.
      const DELIVERED_PO_LIMIT = 500;
      const inspectionsPendingP = (async (): Promise<number> => {
        try {
          const [deliveredRes, inspectedRes] = await Promise.all([
            supabase
              .from('purchase_orders')
              .select('id')
              .eq('status', 'delivered')
              .limit(DELIVERED_PO_LIMIT),
            supabase
              .from('receiving_inspections')
              .select('purchase_order_id'),
          ]);
          if (deliveredRes.error) {
            console.warn(
              'useTodayProcurementCounts: inspectionsPending delivered query failed',
              deliveredRes.error,
            );
            return 0;
          }
          if (inspectedRes.error) {
            console.warn(
              'useTodayProcurementCounts: inspectionsPending inspections query failed',
              inspectedRes.error,
            );
            return 0;
          }
          const inspectedIds = new Set(
            ((inspectedRes.data ?? []) as Array<{ purchase_order_id: string }>).map(
              (r) => r.purchase_order_id,
            ),
          );
          const delivered = (deliveredRes.data ?? []) as Array<{ id: string }>;
          let pending = 0;
          for (const po of delivered) {
            if (!inspectedIds.has(po.id)) pending++;
          }
          return pending;
        } catch (e) {
          console.warn('useTodayProcurementCounts: inspectionsPending threw', e);
          return 0;
        }
      })();

      const damageClaimsOpenP = (async (): Promise<number> => {
        try {
          const { count, error } = await supabase
            .from('damage_claims')
            .select('id', { count: 'exact', head: true })
            .in('state', ['drafted', 'vendor_notified']);
          if (error) {
            console.warn('useTodayProcurementCounts: damageClaimsOpen failed', error);
            return 0;
          }
          return count ?? 0;
        } catch (e) {
          console.warn('useTodayProcurementCounts: damageClaimsOpen threw', e);
          return 0;
        }
      })();

      const [arrivingThisWeek, inspectionsPending, damageClaimsOpen] = await Promise.all([
        arrivingThisWeekP,
        inspectionsPendingP,
        damageClaimsOpenP,
      ]);

      return { arrivingThisWeek, inspectionsPending, damageClaimsOpen };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── MUTATION HOOKS ────────────────────────────────────────────────────────

/**
 * Resolved value for `useCreateReceivingInspection.mutateAsync(...)`.
 *
 * `damageClaimCreated` reflects whether step 4 actually succeeded — callers
 * (e.g. `LogInspectionDrawer`) need this to decide whether to fire the
 * `procurement_damage_claim_created` analytics event. The compensating-delete
 * path throws before returning, so a successful resolve with
 * `damageClaimCreated: false` means either outcome was 'clean' or step 4 was
 * not attempted. Set to `true` only after the damage_claims INSERT returned
 * without error.
 *
 * (W3.5.5 HIGH-1.)
 */
export interface CreateReceivingInspectionResult {
  inspection: ReceivingInspection;
  damageClaimCreated: boolean;
  /**
   * project_ffe_items ids whose received_quantity UPDATE failed (W5-T2).
   * Always present; empty on the happy path. These failures are
   * NON-critical — the inspection (and any damage claim) are already
   * committed and the 00184 trigger side effects have run, so the mutation
   * still resolves. Callers should surface a warning so the designer can
   * re-enter the counts.
   */
  itemUpdateFailures: string[];
}

/**
 * Mutation: logs a physical receiving inspection. The client owns only the
 * two writes that need client-side composition; everything else is owned by
 * the DB (migration 00184, Trigger C `trg_receiving_inspection_side_effects`,
 * AFTER INSERT ON receiving_inspections), which stamps
 * purchase_orders.delivered_date, advances the PO to 'delivered' on a clean
 * outcome, shifts the net-30 pending balance due_date, and marks linked
 * project_ffe_items received.
 *
 * Client-side steps, sequential, with compensating delete on critical-path
 * failure:
 *   1. INSERT receiving_inspections (critical path — fires Trigger C).
 *   2. IF outcome != 'clean': INSERT damage_claims drafted with auto-draft
 *      description (critical path — compensating DELETE on inspection if
 *      this fails). Description composition stays client-side deliberately:
 *      it folds the designer's inspection notes into editable copy.
 *
 * Returns `{ inspection, damageClaimCreated }`. Callers should use
 * `damageClaimCreated` (not `outcome !== 'clean'`) to gate analytics events
 * tied to the damage_claim row — when step 2 fails, the inspection is
 * compensated away and this mutation rejects, so any spurious event from a
 * caller previously triggered by outcome alone is now impossible
 * (W3.5.5 HIGH-1).
 *
 * Invalidates: ['receiving-inspections'], ['damage-claims'],
 *              ['purchase-orders'], ['purchase-order', poId],
 *              ['po-payments', poId] (trigger may shift/flip the balance row),
 *              ['today-procurement-counts'], and — when projectId is
 *              provided — both FF&E namespaces via invalidateFfeCaches().
 */
export function useCreateReceivingInspection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CreateReceivingInspectionInput,
    ): Promise<CreateReceivingInspectionResult> => {
      const supabase = getSupabase() as any;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Step 1: INSERT receiving_inspections. Critical path. Trigger C
      // (00184) runs inside this statement and owns the PO/payment/item
      // side effects.
      const { data: inspection, error: inspectionError } = await supabase
        .from('receiving_inspections')
        .insert({
          purchase_order_id: input.purchaseOrderId,
          inspected_by: user.id,
          outcome: input.outcome,
          notes: input.notes ?? null,
          photo_asset_ids: input.photoAssetIds ?? [],
        })
        .select()
        .single();

      if (inspectionError) {
        throw new Error(
          `Failed to insert receiving inspection: ${
            inspectionError.message ?? String(inspectionError)
          }`,
        );
      }

      const inspectionRow = inspection as ReceivingInspection;
      const inspectionId = inspectionRow.id;

      // Compensating-delete helper for the inspection row itself. Used only
      // when step 2 (damage_claim INSERT) fails — that path is the only
      // critical-path side effect after step 1.
      const compensatingDeleteInspection = async (): Promise<string> => {
        try {
          const { error: deleteError } = await supabase
            .from('receiving_inspections')
            .delete()
            .eq('id', inspectionId);
          if (deleteError) {
            return `compensating delete FAILED: ${
              deleteError.message ?? String(deleteError)
            }`;
          }
          return 'compensating delete succeeded';
        } catch (e) {
          return `compensating delete THREW: ${(e as Error)?.message ?? String(e)}`;
        }
      };

      // Step 2: IF outcome != 'clean', INSERT damage_claims (critical path).
      // The parent PO is read only on this path — solely to source the
      // vendor name + PO number for the auto-draft description.
      // Tracks whether the row was actually written so the resolved value
      // exposes ground truth to callers — analytics events keyed on
      // damageClaimCreated stay accurate even if step 2 throws (W3.5.5 HIGH-1).
      let damageClaimCreated = false;
      if (input.outcome !== 'clean') {
        type ResolvedPoRow = {
          id: string;
          vendor_po_number: string | null;
          vendor?: { id: string; name: string } | null;
        };
        let poRow: ResolvedPoRow | null = null;

        try {
          const { data: po, error: poError } = await supabase
            .from('purchase_orders')
            .select(
              `
              id, vendor_po_number,
              vendor:vendors!purchase_orders_vendor_id_fkey(id, name)
            `,
            )
            .eq('id', input.purchaseOrderId)
            .single();
          if (poError) {
            console.warn(
              `useCreateReceivingInspection: failed to load parent PO ${input.purchaseOrderId}`,
              poError,
            );
          } else {
            poRow = po as ResolvedPoRow;
          }
        } catch (e) {
          console.warn(
            `useCreateReceivingInspection: PO load threw for ${input.purchaseOrderId}`,
            e,
          );
        }

        const vendorName = poRow?.vendor?.name ?? 'vendor';
        const poNumber = poRow?.vendor_po_number ?? null;
        const description = autoDraftDamageClaimDescription(
          input.outcome,
          input.notes,
          vendorName,
          poNumber,
        );

        const itemIds = (input.damagedFfeItemIds ?? []).filter(Boolean);
        const claimRows =
          itemIds.length > 0
            ? itemIds.map((ffeItemId) => ({
                receiving_inspection_id: inspectionId,
                state: 'drafted',
                description,
                ffe_item_id: ffeItemId,
              }))
            : [{ receiving_inspection_id: inspectionId, state: 'drafted', description }];

        const { error: claimError } = await supabase.from('damage_claims').insert(claimRows);

        if (claimError) {
          const cleanupStatus = await compensatingDeleteInspection();
          throw new Error(
            `Receiving inspection created (${inspectionId}) but damage_claim INSERT failed: ${
              claimError.message ?? String(claimError)
            }. ${cleanupStatus}.`,
          );
        }
        // INSERT returned without error → the damage_claim row exists.
        damageClaimCreated = true;
      }

      // Step 3 (W5-T2): per-item received quantities. Runs AFTER the
      // critical path (steps 1–2) so the compensating-delete branch above
      // never leaves stray item writes behind.
      //
      // Interplay with 00184 Trigger C: on CLEAN outcomes the trigger
      // already stamps received_quantity = quantity on every linked item
      // inside step 1's INSERT statement. So:
      //   * non-clean outcomes — the trigger never touches
      //     received_quantity; every supplied row is written here;
      //   * clean outcome — rows at full ordered quantity are skipped as
      //     redundant (the trigger's stamp already matches); short rows
      //     still write, and because this runs after the trigger, the
      //     client's (lower) count wins.
      // Failures are non-critical (the inspection is committed); failed ids
      // are surfaced via itemUpdateFailures instead of rejecting.
      let itemUpdateFailures: string[] = [];
      const itemInputs = input.items ?? [];
      const updatable = itemInputs.filter((it) => {
        if (input.outcome !== 'clean') return true;
        if (it.orderedQuantity === undefined) return true;
        return it.receivedQuantity < it.orderedQuantity;
      });
      if (updatable.length > 0) {
        const outcomes = await Promise.all(
          updatable.map(async (it): Promise<string | null> => {
            try {
              const { error: itemError } = await supabase
                .from('project_ffe_items')
                .update({ received_quantity: it.receivedQuantity })
                .eq('id', it.ffeItemId);
              return itemError ? it.ffeItemId : null;
            } catch {
              return it.ffeItemId;
            }
          }),
        );
        itemUpdateFailures = outcomes.filter((id): id is string => id !== null);
        if (itemUpdateFailures.length > 0) {
          console.warn(
            'useCreateReceivingInspection: received_quantity update failed for',
            itemUpdateFailures,
          );
        }
      }

      return { inspection: inspectionRow, damageClaimCreated, itemUpdateFailures };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receiving-inspections'] });
      queryClient.invalidateQueries({ queryKey: ['damage-claims'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({
        queryKey: ['purchase-order', result.inspection.purchase_order_id],
      });
      // Trigger C may shift the net-30 balance due_date, and the PO's
      // delivered transition may flip the balance to 'due' (Trigger B).
      queryClient.invalidateQueries({
        queryKey: ['po-payments', result.inspection.purchase_order_id],
      });
      queryClient.invalidateQueries({ queryKey: ['today-procurement-counts'] });
      // Clean inspections advance linked FF&E rows server-side (status +
      // received_quantity) — refresh both FF&E namespaces when the caller
      // told us which project the PO belongs to.
      if (variables.projectId) {
        invalidateFfeCaches(queryClient, variables.projectId);
      } else if ((variables.items ?? []).length > 0) {
        // Per-item received_quantity writes (W5-T2) without a projectId:
        // still sweep the cross-project items cache so By Status / Receiving
        // views refresh.
        queryClient.invalidateQueries({ queryKey: ['procurement-items'] });
      }
    },
  });
}

/**
 * Mutation: partial update on a damage_claim row. Validates state
 * transitions client-side per dossier Section 3:
 *   drafted → vendor_notified  (sets vendor_notified_at = now() if absent)
 *   vendor_notified → resolved (sets resolved_at = now() if absent)
 * No backwards transitions in v1. Same-state edits (description-only,
 * resolution_notes-only) are allowed.
 *
 * The current state is resolved by reading the row once before the UPDATE.
 *
 * Invalidates: ['damage-claims'], ['receiving-inspections'],
 *              ['today-procurement-counts']
 */
export function useUpdateDamageClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateDamageClaimInput): Promise<DamageClaim> => {
      const supabase = getSupabase() as any;

      const updates: Record<string, unknown> = {};

      if (input.state !== undefined) {
        // Resolve current state to validate the transition.
        const { data: current, error: readError } = await supabase
          .from('damage_claims')
          .select('id, state')
          .eq('id', input.id)
          .single();
        if (readError) {
          throw new Error(
            `Failed to read damage_claim ${input.id} for state-transition check: ${
              readError.message ?? String(readError)
            }`,
          );
        }
        const currentState = (current as { state: DamageClaimState }).state;
        const nextState = input.state;

        const validForward =
          currentState === nextState ||
          (currentState === 'drafted' && nextState === 'vendor_notified') ||
          (currentState === 'vendor_notified' && nextState === 'resolved');

        if (!validForward) {
          throw new Error(
            `Invalid damage_claim state transition: ${currentState} → ${nextState}. ` +
              `Forward transitions only: drafted → vendor_notified → resolved.`,
          );
        }

        updates.state = nextState;

        if (currentState === 'drafted' && nextState === 'vendor_notified') {
          updates.vendor_notified_at = input.vendor_notified_at ?? nowIso();
        }
        if (currentState === 'vendor_notified' && nextState === 'resolved') {
          updates.resolved_at = input.resolved_at ?? nowIso();
        }
      }

      if (input.description !== undefined) updates.description = input.description;
      if (input.vendor_notified_at !== undefined && updates.vendor_notified_at === undefined) {
        updates.vendor_notified_at = input.vendor_notified_at;
      }
      if (input.resolved_at !== undefined && updates.resolved_at === undefined) {
        updates.resolved_at = input.resolved_at;
      }
      if (input.resolution_notes !== undefined) updates.resolution_notes = input.resolution_notes;

      const { data, error } = await supabase
        .from('damage_claims')
        .update(updates)
        .eq('id', input.id)
        .select()
        .single();
      if (error) {
        throw new Error(
          `Failed to update damage_claim ${input.id}: ${error.message ?? String(error)}`,
        );
      }
      return data as DamageClaim;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damage-claims'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-inspections'] });
      queryClient.invalidateQueries({ queryKey: ['today-procurement-counts'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Sprint 3 / Wave 3.2 — QBO Bookkeeper Export
//
// Hooks for the `qbo-export` Deno edge function at
// `supabase/functions/qbo-export/index.ts`. The mutation downloads a CSV; the
// query returns preview stats (same endpoint with `preview: true`).
// ═══════════════════════════════════════════════════════════════════════════

export interface QboExportInput {
  /** Inclusive start date, ISO YYYY-MM-DD. */
  dateStart: string;
  /** Inclusive end date, ISO YYYY-MM-DD. */
  dateEnd: string;
  /** Include `po_payments.state = 'paid'` rows (deposits + balances/milestones). */
  includePaid: boolean;
  /** Include `po_payments.state IN ('due','pending')` rows. */
  includeOutstanding: boolean;
  /** When false, `purchase_orders.is_patina_catalog = true` rows are excluded. */
  includePatinaCatalog: boolean;
  /** Optional list of `purchase_orders.project_id` UUIDs; empty = all projects. */
  projectIds?: string[];
  /** Optional list of `purchase_orders.vendor_id` UUIDs; empty = all vendors. */
  vendorIds?: string[];
}

export interface QboExportPreview {
  /** Total rows in the CSV (one per po_payments event). */
  transactionCount: number;
  /** Distinct vendor count across the result set. */
  vendorCount: number;
  /** Sum of `po_payments.amount_cents`. */
  totalCents: number;
  /** Number of rows with `state = 'paid'`. */
  paidCount: number;
  /** Sum of cents on paid rows. */
  paidCents: number;
  /** Number of rows with `state IN ('due','pending')`. */
  outstandingCount: number;
  /** Sum of cents on outstanding rows. */
  outstandingCents: number;
}

/**
 * Resolve the qbo-export edge function URL from the configured Supabase URL.
 * Self-hosted: `${SUPABASE_URL}/functions/v1/qbo-export`. The browser hits
 * Kong on `:54321` locally and `https://api.patina.cloud` in prod.
 */
function qboExportUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  }
  return `${base.replace(/\/$/, '')}/functions/v1/qbo-export`;
}

/**
 * Extract the preview-stat custom headers (X-Patina-*) from the CSV response.
 * The edge function emits these alongside the CSV download so the modal can
 * show the post-download stat summary without a second request.
 */
function parsePreviewHeaders(headers: Headers): QboExportPreview {
  const num = (h: string): number => {
    const v = headers.get(h);
    return v ? Number(v) : 0;
  };
  return {
    transactionCount: num('X-Patina-Transaction-Count'),
    vendorCount: num('X-Patina-Vendor-Count'),
    totalCents: num('X-Patina-Total-Cents'),
    paidCount: num('X-Patina-Paid-Count'),
    paidCents: num('X-Patina-Paid-Cents'),
    outstandingCount: num('X-Patina-Outstanding-Count'),
    outstandingCents: num('X-Patina-Outstanding-Cents'),
  };
}

/**
 * Parse the `filename` value from a Content-Disposition header.
 * Falls back to a sensible default if the header is missing or malformed.
 */
function parseFilename(headers: Headers, dateStart: string): string {
  const disposition = headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  if (match) return match[1];
  return `patina-vendor-bills-${dateStart}.csv`;
}

/**
 * Trigger a browser download of a Blob with the given filename. Uses the
 * createObjectURL + anchor click pattern. No-op when `window` is undefined
 * (so server-rendered code paths don't blow up).
 */
function triggerCsvDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser has a chance to actually open the file dialog.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * POST to the qbo-export edge function with the caller's access_token bearer
 * and the export params. Throws on non-200 or when the user has no session.
 *
 * Common helper for both the mutation (download mode) and the query
 * (preview mode). The `preview` flag toggles JSON-vs-CSV response shape.
 */
async function callQboExport(
  input: QboExportInput,
  preview: boolean
): Promise<Response> {
  const supabase = getSupabase();
  const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionResult?.session?.access_token;
  if (!accessToken) {
    throw new Error('Not authenticated — sign in to export to QBO');
  }

  const body = {
    dateStart: input.dateStart,
    dateEnd: input.dateEnd,
    includePaid: input.includePaid,
    includeOutstanding: input.includeOutstanding,
    includePatinaCatalog: input.includePatinaCatalog,
    projectIds: input.projectIds ?? [],
    vendorIds: input.vendorIds ?? [],
    preview,
  };

  const response = await fetch(qboExportUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `QBO export failed: ${response.status} ${response.statusText}`;
    try {
      const errBody = await response.json();
      if (errBody?.error) message = errBody.error;
    } catch {
      /* response was not JSON — keep status-based message */
    }
    throw new Error(message);
  }

  return response;
}

/**
 * Mutation: POST to `qbo-export`, download the CSV in the browser, and
 * return the preview stats parsed from the response's X-Patina-* headers.
 *
 * Studio-owner-only on the server side — the edge function returns 403
 * to callers without the `studio_owner` role.
 *
 * Use from the BookkeeperExportModal's "Export" button onClick.
 */
export function useQboExport() {
  return useMutation({
    mutationFn: async (input: QboExportInput): Promise<QboExportPreview> => {
      const response = await callQboExport(input, false);

      const blob = await response.blob();
      const filename = parseFilename(response.headers, input.dateStart);
      triggerCsvDownload(blob, filename);

      return parsePreviewHeaders(response.headers);
    },
  });
}

/**
 * Query: POST to `qbo-export` with `preview: true`, returning preview stats
 * without downloading the CSV. Drives the "23 transactions · 8 vendors ·
 * $42,800 total" preview shown in the modal before the user confirms the
 * download.
 *
 * Disabled until both date fields are valid YYYY-MM-DD strings AND at least
 * one include-flag is true. Re-runs whenever any input field changes.
 *
 * staleTime: 30 seconds — preview stats are cheap to recompute and the user
 * is likely to tweak filters in quick succession.
 */
export function useQboExportPreview(
  input: QboExportInput,
  opts?: { enabled?: boolean },
) {
  const ready = isValidExportInput(input);
  return useQuery({
    queryKey: ['qbo-export-preview', input],
    queryFn: async (): Promise<QboExportPreview> => {
      const response = await callQboExport(input, true);
      return (await response.json()) as QboExportPreview;
    },
    enabled: (opts?.enabled ?? true) && ready,
    staleTime: 30_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVE 4 / W4-T3 — SEND PURCHASE ORDER (po-send edge function)
//
// Hooks for `supabase/functions/po-send/index.ts`: assigns OUR PO number
// (assign_po_number, 00188), renders the PO PDF into project-documents, and
// — mode 'send' — emails the vendor with the PDF attached.
// ═══════════════════════════════════════════════════════════════════════════

export type PurchaseOrderSendMode = 'preview' | 'send' | 'mark_sent';

export interface SendPurchaseOrderInput {
  purchaseOrderId: string;
  /**
   * 'preview'   → number + render + store the PDF, return a signed URL;
   *               no email, no sent_at.
   * 'send'      → all of the above + email the vendor (PDF attached) and
   *               stamp sent_at (first send) / append a resend audit note.
   * 'mark_sent' → number + render + store + stamp sent_at, no email — for
   *               orders placed outside Patina (phone, showroom).
   */
  mode: PurchaseOrderSendMode;
  /** Overrides the vendor recipient chain (orders_email → contact_info). */
  recipientEmail?: string;
  /** Optional personal note rendered into the vendor email body. */
  message?: string;
  /** CC the designer's own email on the vendor send. */
  ccDesigner?: boolean;
}

export interface SendPurchaseOrderResult {
  ok: boolean;
  poId: string;
  /** OUR outbound number (PO-0001 …) — assigned on first send, then stable. */
  poNumber: string;
  /** Resolved vendor recipient (mode 'send' only). */
  recipient?: string;
  /** Storage path of the rendered PDF inside project-documents. */
  documentPath: string;
  emailSent: boolean;
  /** Short-lived (600 s) signed URL for the rendered PDF, when signing worked. */
  signedUrl?: string | null;
  /**
   * Non-blocking flags (mode 'preview' only, W4-T4): 'po_out_of_sync' when
   * the PO's stored total no longer matches its line-derived trade total or
   * its payment schedule — mode 'send' refuses such POs with a 422 of the
   * same code, preview just warns.
   */
  warnings?: string[];
}

/**
 * Resolve the po-send edge function URL from the configured Supabase URL
 * (same scheme as qboExportUrl: Kong on :54321 locally, api.patina.cloud
 * in prod).
 */
function poSendUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  }
  return `${base.replace(/\/$/, '')}/functions/v1/po-send`;
}

/**
 * Mutation: POST to the po-send edge function with the caller's access_token
 * bearer (callQboExport fetch shape). Resolves with the function's JSON
 * response; rejects with the response's `error` code on non-2xx.
 *
 * Invalidates: ['purchase-orders'], ['purchase-order', id],
 *              ['procurement-items'] (the By Status rows surface
 *              po_number / sent_at off the joined PO).
 *
 * Document-surface callers (R83 error grammar) pass `{ errorSurface:
 * 'inline' }` so the designer portal's global mutation toast stays quiet —
 * see useSendInvoice for the precedent.
 */
export function useSendPurchaseOrder(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async (
      input: SendPurchaseOrderInput
    ): Promise<SendPurchaseOrderResult> => {
      const supabase = getSupabase();
      const { data: sessionResult, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionResult?.session?.access_token;
      if (!accessToken) {
        throw new Error('Not authenticated — sign in to send purchase orders');
      }

      const response = await fetch(poSendUrl(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          purchaseOrderId: input.purchaseOrderId,
          mode: input.mode,
          recipientEmail: input.recipientEmail,
          message: input.message,
          ccDesigner: input.ccDesigner ?? false,
        }),
      });

      if (!response.ok) {
        let message = `PO send failed: ${response.status} ${response.statusText}`;
        try {
          const errBody = await response.json();
          if (errBody?.error) message = errBody.error;
        } catch {
          /* response was not JSON — keep status-based message */
        }
        throw new Error(message);
      }

      return (await response.json()) as SendPurchaseOrderResult;
    },
    onSuccess: (_, { purchaseOrderId }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', purchaseOrderId] });
      queryClient.invalidateQueries({ queryKey: ['procurement-items'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 3 / WAVE 3.2 — PROCUREMENT NOTIFICATIONS (migration 00151)
// ═══════════════════════════════════════════════════════════════════════════
//
// In-app-only notification feed. SECURITY DEFINER triggers create rows on:
//   * po_payments.state → due transition (deposit_due / balance_due / milestone_due)
//   * damage_claims INSERT with state = 'drafted' (damage_claim_drafted)
//
// delivery_this_week is ARMED as of migration 00189 (Wave 5): a weekly
// pg_cron job (Mondays 13:00 UTC) scans purchase_orders.confirmed_eta for
// in-flight POs delivering within 7 days, deduped per PO over a rolling
// 7 days. The UI may render it. (00151 had it RESERVED — dossier §7 risk 8.)
// 00189 also adds a daily cron flipping pending payments to 'due' on
// due_date, which fires the same 00151 notify trigger per row.
// ═══════════════════════════════════════════════════════════════════════════

export type ProcurementNotificationKind =
  | 'deposit_due'
  | 'balance_due'
  | 'milestone_due'
  | 'delivery_this_week'
  | 'damage_claim_drafted';

export interface ProcurementNotification {
  id: string;
  user_id: string;
  kind: ProcurementNotificationKind;
  subject_purchase_order_id: string | null;
  subject_payment_id: string | null;
  subject_inspection_id: string | null;
  read_at: string | null;
  created_at: string;
  updated_at?: string;
  /**
   * Optionally joined PO for display in the notification feed.
   * Selected via PostgREST nested resource:
   *   purchase_order:purchase_orders(id, vendor_id, project_id,
   *     vendor:vendors(id, name), project:projects(id, name))
   */
  purchase_order?: {
    id: string;
    vendor_id: string;
    project_id: string;
    vendor?: { id: string; name: string };
    project?: { id: string; name: string };
  } | null;
}

/**
 * Returns procurement notifications for the authenticated user.
 *
 * Query key:  ['procurement-notifications', { unreadOnly }]
 * staleTime:  60 seconds (realtime subscription is a v2 enhancement).
 *
 * RLS handles ownership scoping (the "Users read their own procurement
 * notifications" policy filters to user_id = auth.uid()), but we additionally
 * apply .eq('user_id', user.id) for query-cache key stability and explicitness.
 *
 * When opts.unreadOnly is true, applies .is('read_at', null).
 */
export function useProcurementNotifications(opts?: {
  unreadOnly?: boolean;
  limit?: number;
}) {
  const unreadOnly = opts?.unreadOnly ?? false;
  const limit = opts?.limit;
  return useQuery({
    queryKey: ['procurement-notifications', { unreadOnly }],
    queryFn: async (): Promise<ProcurementNotification[]> => {
      const supabase = getSupabase() as any;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let query = supabase
        .from('procurement_notifications')
        .select(
          `
          *,
          purchase_order:purchase_orders!procurement_notifications_subject_purchase_order_id_fkey(
            id,
            vendor_id,
            project_id,
            vendor:vendors(id, name),
            project:projects(id, name)
          )
        `
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (unreadOnly) {
        query = query.is('read_at', null);
      }
      if (limit !== undefined) {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ProcurementNotification[];
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Returns true when the input has both dates AND at least one include-flag
 * set — the minimum required to produce a non-empty result.
 */
function isValidExportInput(input: QboExportInput): boolean {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(input.dateStart ?? '')) return false;
  if (!dateRe.test(input.dateEnd ?? '')) return false;
  if (input.dateStart > input.dateEnd) return false;
  return input.includePaid || input.includeOutstanding;
}

/**
 * Returns the count of unread procurement notifications for the current user.
 * Used by the procurement nav badge.
 *
 * Query key:  ['procurement-unread-count']
 * staleTime:  30 seconds.
 *
 * Never throws — returns 0 on any error (network, RLS, missing auth). The
 * nav badge is non-critical UX and must never break the shell render.
 */
export function useProcurementUnreadCount() {
  return useQuery({
    queryKey: ['procurement-unread-count'],
    queryFn: async (): Promise<number> => {
      try {
        const supabase = getSupabase() as any;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return 0;

        const { count, error } = await supabase
          .from('procurement_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .is('read_at', null);

        if (error) return 0;
        return count ?? 0;
      } catch {
        return 0;
      }
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Mutation: marks a single notification as read. Sets read_at = now().
 *
 * Invalidates: ['procurement-notifications'], ['procurement-unread-count']
 *
 * Input: { notificationId: string }
 */
export function useMarkProcurementNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      notificationId,
    }: {
      notificationId: string;
    }): Promise<ProcurementNotification> => {
      const supabase = getSupabase() as any;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('procurement_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) throw error;
      return data as ProcurementNotification;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-unread-count'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CAPTURE-TO-SLOT — Sprint 3 / Wave 3.3 (PRD §12 Phase 3)
// ═══════════════════════════════════════════════════════════════════════════
//
// Assigns a captured product (Layer 1: products.captured_by populated by the
// Chrome extension) to a specific FFE slot on a project. This is the
// post-activation analogue of the proposal_captures → consume_capture() flow
// (which targets pre-activation proposals). For active projects, the slot
// already exists in project_ffe_items; we just stamp product_id onto it.
//
// Schema: project_ffe_items.product_id is a nullable FK to products(id) —
// already in place via migration 00066 line 261, NOT added by this wave.
// No new migration is needed.
//
// RLS: scoping is enforced by the existing project_ffe_items policy
// (designer_id = auth.uid() through the projects join). We additionally
// .eq('project_id', projectId) for defense-in-depth and to match the
// W1.2.6 ownership-scoping pattern used by useUpdateFFEItemStatus.
//
// Invalidations:
//   ['project-ffe-items', projectId]  — refreshes the slot in By Vendor /
//                                       By Status / Calendar views.
//   ['purchase-orders']               — if the slot is later POed, the PO
//                                       lists need to pick up the new
//                                       product linkage (no-op when no PO
//                                       exists yet, but cheap to invalidate).
// ═══════════════════════════════════════════════════════════════════════════

export function useAssignProductToFfeSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      productId,
      ffeItemId,
      projectId,
    }: {
      productId: string;
      ffeItemId: string;
      projectId: string;
    }): Promise<{ id: string; product_id: string }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('project_ffe_items')
        .update({ product_id: productId })
        .eq('id', ffeItemId)
        .eq('project_id', projectId)
        .select('id, product_id')
        .single();

      if (error) throw error;
      return data as { id: string; product_id: string };
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-ffe-items', projectId] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}
