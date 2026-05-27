/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file uses type assertions (as any) because the database types
// haven't been regenerated yet to include the procurement workspace tables
// (purchase_orders, po_payments) added in migration 00148. The hook-level
// interfaces below mirror the table shape and are the canonical contract
// until `pnpm db:generate` is run.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  payment_pattern: PaymentPattern;
  total_cents: number;
  status: POStatus;
  is_patina_catalog: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vendor?: { id: string; name: string; default_payment_terms: PaymentPattern | null };
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
  totalCents: number;
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
 * Builds the po_payments insert payload from a payment pattern + amounts.
 * Returns an array of row shapes (without purchase_order_id which is filled in
 * later) ordered by sort_order ascending.
 */
function buildPaymentRowsForPattern(
  input: CreatePurchaseOrderInput
): Array<{
  kind: POPaymentKind;
  amount_cents: number;
  due_date: string | null;
  state: POPaymentState;
  label: string | null;
  sort_order: number;
}> {
  const { paymentPattern, totalCents, depositDueDate, depositAmountCents, customMilestones } =
    input;

  switch (paymentPattern) {
    case 'fifty_fifty': {
      const deposit = depositAmountCents ?? Math.floor(totalCents / 2);
      const balance = totalCents - deposit;
      return [
        {
          kind: 'deposit',
          amount_cents: deposit,
          due_date: depositDueDate ?? null,
          state: 'pending',
          label: null,
          sort_order: 0,
        },
        {
          kind: 'balance',
          amount_cents: balance,
          due_date: null,
          state: 'pending',
          label: null,
          sort_order: 1,
        },
      ];
    }
    case 'thirty_seventy': {
      const deposit = depositAmountCents ?? Math.floor(totalCents * 0.3);
      const balance = totalCents - deposit;
      return [
        {
          kind: 'deposit',
          amount_cents: deposit,
          due_date: depositDueDate ?? null,
          state: 'pending',
          label: null,
          sort_order: 0,
        },
        {
          kind: 'balance',
          amount_cents: balance,
          due_date: null,
          state: 'pending',
          label: null,
          sort_order: 1,
        },
      ];
    }
    case 'full_upfront': {
      return [
        {
          kind: 'deposit',
          amount_cents: totalCents,
          due_date: depositDueDate ?? null,
          state: 'pending',
          label: null,
          sort_order: 0,
        },
      ];
    }
    case 'net_30': {
      return [
        {
          kind: 'balance',
          amount_cents: totalCents,
          due_date: null,
          state: 'pending',
          label: null,
          sort_order: 0,
        },
      ];
    }
    case 'custom_milestones': {
      const milestones = customMilestones ?? [];
      return milestones.map((m) => ({
        kind: 'milestone' as const,
        amount_cents: m.amountCents,
        due_date: m.dueDate ?? null,
        state: 'pending' as POPaymentState,
        label: m.label,
        sort_order: m.sortOrder,
      }));
    }
    default: {
      // Exhaustiveness guard
      const _exhaustive: never = paymentPattern;
      void _exhaustive;
      return [];
    }
  }
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
          vendor:vendors!purchase_orders_vendor_id_fkey(id, name, default_payment_terms),
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
 * Mutation: creates a purchase_orders header row and the appropriate
 * po_payments rows for the chosen payment_pattern. Also updates
 * project_ffe_items.purchase_order_id atomically (best-effort sequential
 * within the same mutation function — the JS client cannot wrap these in a
 * Postgres transaction, so we surface any partial-failure context in the
 * thrown Error).
 */
export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePurchaseOrderInput): Promise<PurchaseOrder> => {
      const supabase = getSupabase() as any;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Step 1: insert the PO header.
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          designer_id: user.id,
          project_id: input.projectId,
          vendor_id: input.vendorId,
          vendor_po_number: input.vendorPoNumber ?? null,
          confirmed_eta: input.confirmedEta ?? null,
          payment_pattern: input.paymentPattern,
          total_cents: input.totalCents,
          is_patina_catalog: input.isPatinaCatalog ?? false,
          status: 'draft',
        })
        .select()
        .single();

      if (poError) {
        throw new Error(
          `Failed to create purchase order header: ${poError.message ?? String(poError)}`
        );
      }

      const purchaseOrderId = (po as { id: string }).id;

      // Step 2: insert po_payments rows for the chosen pattern.
      const rows = buildPaymentRowsForPattern(input).map((r) => ({
        ...r,
        purchase_order_id: purchaseOrderId,
      }));

      if (rows.length > 0) {
        const { error: paymentsError } = await supabase.from('po_payments').insert(rows);
        if (paymentsError) {
          throw new Error(
            `PO header created (${purchaseOrderId}) but payment rows failed to insert: ${
              paymentsError.message ?? String(paymentsError)
            }. Manual cleanup may be required.`
          );
        }
      }

      // Step 3: link the supplied project_ffe_items to this PO.
      for (const ffeItemId of input.ffeItemIds) {
        const { error: linkError } = await supabase
          .from('project_ffe_items')
          .update({ purchase_order_id: purchaseOrderId })
          .eq('id', ffeItemId);
        if (linkError) {
          throw new Error(
            `PO ${purchaseOrderId} created with payments but failed to link FFE item ${ffeItemId}: ${
              linkError.message ?? String(linkError)
            }. Other FFE links may also be incomplete.`
          );
        }
      }

      return po as PurchaseOrder;
    },
    onSuccess: (po) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', po.id] });
      queryClient.invalidateQueries({ queryKey: ['po-payments', po.id] });
      queryClient.invalidateQueries({
        queryKey: ['project-ffe-items', po.project_id],
      });
    },
  });
}

/**
 * Mutation: logs a payment as paid. Sets paid_date = today (or supplied date),
 * state = 'paid'. If the parent PO is on a `fifty_fifty` or `thirty_seventy`
 * pattern and the just-paid row was a deposit and the PO has already shipped
 * (status >= 'shipped'), the balance row is flipped to 'due' in the same call.
 */
export function useLogPaymentPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      paymentId,
      purchaseOrderId,
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

      const updatedRow = updated as POPayment;

      // Check whether the parent PO + sibling-row state requires us to flip
      // the balance row to 'due'. This mirrors the state-machine spec in
      // dossier Section 2.
      if (updatedRow.kind === 'deposit') {
        const { data: po, error: poError } = await supabase
          .from('purchase_orders')
          .select('id, payment_pattern, status')
          .eq('id', purchaseOrderId)
          .single();
        if (poError) throw poError;

        const poRow = po as { id: string; payment_pattern: PaymentPattern; status: POStatus };
        const shippedOrLater =
          poRow.status === 'shipped' ||
          poRow.status === 'delivered';

        const isSplitPattern =
          poRow.payment_pattern === 'fifty_fifty' ||
          poRow.payment_pattern === 'thirty_seventy';

        if (isSplitPattern && shippedOrLater) {
          // Find the sibling balance row that is still pending and flip to due.
          const { data: siblings, error: siblingsError } = await supabase
            .from('po_payments')
            .select('id, kind, state')
            .eq('purchase_order_id', purchaseOrderId);
          if (siblingsError) throw siblingsError;

          const balancePending = (siblings ?? []).find(
            (r: { kind: POPaymentKind; state: POPaymentState }) =>
              r.kind === 'balance' && r.state === 'pending'
          ) as { id: string } | undefined;

          if (balancePending) {
            const { error: flipError } = await supabase
              .from('po_payments')
              .update({ state: 'due' })
              .eq('id', balancePending.id);
            if (flipError) throw flipError;
          }
        }
      }

      return updatedRow;
    },
    onSuccess: (_, { purchaseOrderId }) => {
      queryClient.invalidateQueries({ queryKey: ['po-payments', purchaseOrderId] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order', purchaseOrderId] });
    },
  });
}

/**
 * Mutation: advances a po_payment row to 'due' state. Called externally when a
 * status change in project_ffe_items should bump a payment row (e.g. an
 * `ordered → shipped` transition flips the balance row to `due` on a
 * fifty_fifty PO).
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
