/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file uses type assertions (as any) because the database types
// haven't been regenerated yet to include the direct_orders table (added in
// migration 00267). The hook-level interfaces below mirror the table shape
// and are the canonical contract until `pnpm db:generate` is run. Follows
// use-invoices.ts / use-procurement.ts house style.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES (mirror migration 00267)
// ═══════════════════════════════════════════════════════════════════════════

export type DirectOrderStatus = 'pending_payment' | 'paid' | 'canceled' | 'refunded';

/** Stripe Checkout Session's `shipping_details` + `customer_details.email`, persisted on paid settle. */
export interface DirectOrderShipping {
  name?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
  phone?: string | null;
  email?: string | null;
  carrier?: string | null;
  tracking_number?: string | null;
}

export interface DirectOrder {
  id: string;
  client_id: string;
  product_id: string;
  /** Snapshotted at create time — later product edits never move this order. */
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  currency: string;
  status: DirectOrderStatus;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  shipping: DirectOrderShipping | null;
  created_at: string;
  paid_at: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetches the signed-in client's own "buy now" orders. RLS does the scoping
 * (direct_orders_select_own: client_id = auth.uid(), migration 00267) — no
 * explicit filter needed here. Newest first for the orders list.
 */
export function useDirectOrders() {
  return useQuery({
    queryKey: ['direct-orders'],
    queryFn: async (): Promise<DirectOrder[]> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('direct_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DirectOrder[];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Client "buy now": mints a direct order via the create_direct_order RPC
 * (00267, SECURITY DEFINER — clients have no INSERT policy on direct_orders).
 * The RPC validates the product is buyable (patina_managed OR sold by a
 * Patina-catalog vendor, positive price_retail, not soft-deleted), clamps
 * quantity to 10, and snapshots name + unit price. Returns the new
 * pending_payment row.
 *
 * `{ errorSurface: 'inline' }` — see useSendInvoice / useStartPoCheckout
 * (R83): callers that render their own inline Buy-button failure state pass
 * this to suppress the global mutation toast.
 */
export function useCreateDirectOrder(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({
      productId,
      quantity,
    }: {
      productId: string;
      quantity?: number;
    }): Promise<DirectOrder> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('create_direct_order', {
        p_product_id: productId,
        p_quantity: quantity ?? 1,
      });
      if (error) throw error;
      return data as DirectOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['direct-orders'] });
    },
  });
}

/**
 * Starts a Stripe Checkout session for a direct order via the shared
 * create-checkout-session edge function, dispatched on `{ direct_order_id }`
 * (the client-buys-a-product-directly payable — as opposed to `{ invoiceId }`
 * / `{ po_payment_id }`). Settlement flips `direct_orders.status` to 'paid'
 * asynchronously via the stripe-webhook function — callers must poll, not
 * assume (ACH can take days; see the invoice detail page's confirm/poll
 * pattern).
 *
 * Mirrors useStartCheckout (use-invoices.ts) / useStartPoCheckout
 * (use-procurement.ts) exactly for error-surfacing: prefers the edge
 * function's JSON `detail` over its `error` code, which itself beats the
 * generic FunctionsHttpError message. The edge function 404s when the order
 * isn't the caller's (or doesn't exist), and 409s when it's already paid
 * (`direct_order_already_paid`) or canceled (`direct_order_canceled`).
 *
 * `{ errorSurface: 'inline' }` — see useCreateDirectOrder above.
 */
export function useStartDirectOrderCheckout(options?: { errorSurface?: 'inline' }) {
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({
      directOrderId,
    }: {
      directOrderId: string;
    }): Promise<{ url: string }> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { direct_order_id: directOrderId },
      });
      if (error) {
        // FunctionsHttpError carries the response; surface the JSON error
        // code (e.g. direct_order_already_paid, direct_order_canceled) over
        // the generic message.
        let detail: string | undefined;
        try {
          const body = await (error as { context?: Response }).context?.json();
          detail = body?.detail ?? body?.error;
        } catch {
          /* fall through to the generic message */
        }
        throw new Error(detail ?? error.message ?? 'Failed to start checkout');
      }
      if (data?.error) throw new Error(data.detail ?? data.error);
      if (!data?.url) throw new Error('No checkout URL returned');
      return data as { url: string };
    },
  });
}
