// stripe-event-processor — reconcile queued Stripe events against internal
// state (WP-2.1). Invoked every 5 min by pg_cron via public.invoke_edge_function
// (00304), which POSTs an apikey + service-role Bearer — so verify_jwt stays
// true (the platform default; config.toml [functions.stripe-event-processor]
// documents the intent). No browser calls it. All orchestration + the
// escalation table live in core.ts (unit-tested offline); this shell only wires
// the service-role client + the real Stripe SDK re-fetch, exactly as
// field-daily/index.ts and cowork-intake-bridge/index.ts are to their cores.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import { runProcessor, type ProcessorSupabase, type StripeObject } from './core.ts';

// Pinned — keep in step with stripe-webhook's STRIPE_API_VERSION.
const STRIPE_API_VERSION = '2025-02-24.acacia';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? 'sk_placeholder_processor', {
  apiVersion: STRIPE_API_VERSION,
  httpClient: Stripe.createFetchHttpClient(),
});

// Re-fetch a Stripe object fresh (never trust the delivered event state).
async function fetchStripeObject(objectType: string | null, objectId: string | null): Promise<StripeObject> {
  switch (objectType) {
    case 'charge':
      return (await stripe.charges.retrieve(objectId!)) as unknown as StripeObject;
    case 'payment_intent':
      return (await stripe.paymentIntents.retrieve(objectId!)) as unknown as StripeObject;
    case 'dispute':
      return (await stripe.disputes.retrieve(objectId!)) as unknown as StripeObject;
    case 'payout':
      return (await stripe.payouts.retrieve(objectId!)) as unknown as StripeObject;
    case 'transfer':
      return (await stripe.transfers.retrieve(objectId!)) as unknown as StripeObject;
    case 'application_fee':
      return (await stripe.applicationFees.retrieve(objectId!)) as unknown as StripeObject;
    case 'account':
      return (await stripe.accounts.retrieve(objectId!)) as unknown as StripeObject;
    case 'radar.early_fraud_warning':
      return (await stripe.radar.earlyFraudWarnings.retrieve(objectId!)) as unknown as StripeObject;
    case 'balance':
      return (await stripe.balance.retrieve()) as unknown as StripeObject;
    default:
      throw new Error(`unsupported stripe object type for re-fetch: ${objectType}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const summary = await runProcessor({
      supabase: supabase as unknown as ProcessorSupabase,
      fetchStripeObject,
      now: () => new Date(),
    });
    // 200 even on a recorded 'failed' status — the durable record lives in
    // job_runs + the per-task backoff; the cron caller doesn't need a non-2xx.
    return new Response(JSON.stringify({ success: summary.status === 'succeeded', ...summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('stripe-event-processor failed:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
