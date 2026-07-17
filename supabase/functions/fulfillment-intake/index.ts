// fulfillment-intake — Rail A capture intake worker (S0). Cron-invoked every
// minute via public.invoke_edge_function (00354), which POSTs an apikey +
// service-role Bearer — so verify_jwt stays true (the platform default;
// config.toml [functions.fulfillment-intake] documents the intent). Also
// callable directly with { seed_pi, actor? } — the local dev seed path
// (scripts/seed-fulfillment-orders.ts, S0 task C2) POSTs a fabricated
// PaymentIntent object here instead of going through Stripe/agent_tasks at
// all. Both paths share ONE core (core.ts): normalize → fulfillment_intake_order
// RPC → done. This shell only wires the service-role client + the real Stripe
// SDK re-fetch + job_runs bookkeeping (00300 idiom), exactly as
// stripe-event-processor/index.ts is to its core.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import { intakeInlinePI, runIntakeWorker, type IntakeDeps } from './core.ts';

// Pinned — keep in step with stripe-webhook's STRIPE_API_VERSION.
const STRIPE_API_VERSION = '2025-02-24.acacia';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? 'sk_placeholder_intake', {
  apiVersion: STRIPE_API_VERSION,
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const runId = await supabase
    .from('job_runs')
    .insert({ job_name: 'fulfillment-intake', status: 'running' })
    .select('id')
    .single();
  const jobRunId = (runId.data as { id: number } | null)?.id;
  const deps: IntakeDeps = {
    supabase: supabase as unknown as IntakeDeps['supabase'],
    fetchPaymentIntent: (id) => stripe.paymentIntents.retrieve(id) as unknown as Promise<Record<string, unknown>>,
    now: () => new Date(),
  };
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    let result: unknown;
    if (body && body.seed_pi) {
      // Seed path: SAME normalize→RPC core as the worker path, just fed an
      // inline fabricated PI instead of a re-fetched Stripe object.
      // Idempotent: re-posting the same seed_pi.id returns the same order_id.
      const orderId = await intakeInlinePI(deps, body.seed_pi, body.actor ?? 'seed');
      result = { order_id: orderId };
    } else {
      result = await runIntakeWorker(deps);
    }
    if (jobRunId) {
      await supabase
        .from('job_runs')
        .update({ status: 'succeeded', finished_at: new Date().toISOString(), detail: result })
        .eq('id', jobRunId);
    }
    return new Response(JSON.stringify({ success: true, ...(result as object) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (jobRunId) {
      await supabase
        .from('job_runs')
        .update({ status: 'failed', finished_at: new Date().toISOString(), error: String(err) })
        .eq('id', jobRunId);
    }
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
