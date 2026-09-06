/**
 * The Stripe Customer behind an invoice Checkout — one per signed-in payer
 * profile, or one per invoice link when the invoice has no payer (00574).
 *
 * Both follow the same race discipline: create with a stable idempotency key,
 * compare-and-set the id onto the row only where it is still NULL, then read
 * the canonical winner back and use THAT — never an unpersisted candidate.
 * Lifted from create-checkout-session/index.ts (ensureStripeCustomer) so the
 * guest function shares it; the signed-in path's responses are unchanged.
 */

// deno-lint-ignore-file no-explicit-any

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type Stripe from 'npm:stripe@17';

export interface CheckoutCustomerFailure {
  ok: false;
  error:
    | 'payer_profile_not_found'
    | 'customer_persistence_failed'
    | 'stripe_error'
    | 'invoice_link_not_found';
  status: 500 | 502;
  detail?: string;
}

export type CheckoutCustomerResult = { ok: true; customerId: string } | CheckoutCustomerFailure;

/** The body the caller's `json()` helper sends for a failure — same keys the signed-in path always sent. */
export function checkoutCustomerFailureBody(failure: CheckoutCustomerFailure): Record<string, string> {
  return {
    error: failure.error,
    ...(failure.detail !== undefined ? { detail: failure.detail } : {}),
  };
}

/** Lazy Stripe customer for a paying PROFILE, keyed on the explicit payer id. */
export async function ensureStripeCustomer(
  admin: SupabaseClient,
  stripe: Stripe,
  payerId: string
): Promise<CheckoutCustomerResult> {
  const { data: payerProfile, error: payerErr } = await admin
    .from('profiles')
    .select('id, email, full_name, stripe_customer_id')
    .eq('id', payerId)
    .maybeSingle();
  if (payerErr || !payerProfile) {
    console.error('invoice-checkout: payer profile lookup failed', payerErr);
    return { ok: false, error: 'payer_profile_not_found', status: 500 };
  }

  let candidate = (payerProfile as any).stripe_customer_id as string | null;
  try {
    if (!candidate) {
      const customer = await stripe.customers.create(
        {
          email: (payerProfile as any).email ?? undefined,
          name: (payerProfile as any).full_name ?? undefined,
          metadata: { profile_id: payerId },
        },
        { idempotencyKey: `patina-profile-customer:${payerId}` }
      );
      candidate = customer.id;
      const { error: persistErr } = await admin
        .from('profiles')
        .update({ stripe_customer_id: candidate })
        .eq('id', payerId)
        .is('stripe_customer_id', null);
      if (persistErr) {
        console.error('invoice-checkout: failed to persist stripe_customer_id', persistErr);
        return {
          ok: false,
          error: 'customer_persistence_failed',
          detail: 'Checkout was not opened.',
          status: 500,
        };
      }
    }

    // Use the compare-and-set winner, never an unpersisted candidate customer.
    const { data: canonical, error: canonicalErr } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', payerId)
      .maybeSingle();
    const customerId = (canonical as any)?.stripe_customer_id as string | null;
    if (canonicalErr || !customerId) {
      console.error('invoice-checkout: canonical customer read failed', canonicalErr);
      return {
        ok: false,
        error: 'customer_persistence_failed',
        detail: 'Checkout was not opened.',
        status: 500,
      };
    }
    return { ok: true, customerId };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Stripe customer unavailable.';
    console.error('invoice-checkout: customer creation failed', detail);
    return { ok: false, error: 'stripe_error', status: 502, detail };
  }
}

/**
 * Lazy Stripe customer for an invoice LINK — the payer-less branch. Created
 * with NO email, deliberately: Checkout then collects one, editable, and the
 * webhook persists it onto invoice_links.payer_email so the receipt can reach
 * the person who actually paid (M5). Persisted through
 * set_invoice_link_stripe_customer, which compare-and-sets and returns the
 * canonical winner.
 */
export async function ensureLinkStripeCustomer(
  admin: SupabaseClient,
  stripe: Stripe,
  invoiceLinkId: string,
  displayName: string | null
): Promise<CheckoutCustomerResult> {
  const { data: link, error: linkErr } = await admin
    .from('invoice_links')
    .select('id, stripe_customer_id')
    .eq('id', invoiceLinkId)
    .maybeSingle();
  if (linkErr || !link) {
    console.error('invoice-checkout: invoice link lookup failed', invoiceLinkId, linkErr);
    return { ok: false, error: 'invoice_link_not_found', status: 500 };
  }

  let candidate = (link as any).stripe_customer_id as string | null;
  try {
    if (!candidate) {
      const customer = await stripe.customers.create(
        {
          name: displayName?.trim() || undefined,
          metadata: { invoice_link_id: invoiceLinkId },
        },
        { idempotencyKey: `patina-invoice-link-customer:${invoiceLinkId}` }
      );
      candidate = customer.id;
    }

    const { data: canonical, error: persistErr } = await admin.rpc(
      'set_invoice_link_stripe_customer',
      { p_link_id: invoiceLinkId, p_stripe_customer_id: candidate }
    );
    const customerId = typeof canonical === 'string' && canonical ? canonical : null;
    if (persistErr || !customerId) {
      console.error(
        'invoice-checkout: failed to persist the link customer',
        invoiceLinkId,
        persistErr?.message ?? 'no canonical customer'
      );
      return {
        ok: false,
        error: 'customer_persistence_failed',
        detail: 'Checkout was not opened.',
        status: 500,
      };
    }
    return { ok: true, customerId };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Stripe customer unavailable.';
    console.error('invoice-checkout: link customer creation failed', invoiceLinkId, detail);
    return { ok: false, error: 'stripe_error', status: 502, detail };
  }
}
