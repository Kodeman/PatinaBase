// fulfillment-stripe-recon — daily Stripe balance-transaction reconciliation
// (S6, R2.3). Cron-invoked once a day via public.invoke_edge_function (00362),
// which POSTs an apikey + service-role Bearer — so verify_jwt stays true (the
// platform default; config.toml [functions.fulfillment-stripe-recon] documents
// the intent). Also callable directly with { fixture_transactions: [...] } — the
// local test / recon .assert.sql path that drives the SAME ingest core with no
// live Stripe key. All orchestration lives in core.ts (unit-tested offline);
// this shell wires the service-role client, the real Stripe pull, a graceful
// not-configured skip, and job_runs bookkeeping (00300 idiom), exactly as
// fulfillment-intake/index.ts is to its core.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  fetchBalanceTransactionsFromStripe,
  runStripeRecon,
  type ReconDeps,
} from './core.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const runId = await supabase
    .from('job_runs')
    .insert({ job_name: 'fulfillment-stripe-recon', status: 'running' })
    .select('id')
    .single();
  const jobRunId = (runId.data as { id: number } | null)?.id;

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const deps: ReconDeps = {
    supabase: supabase as unknown as ReconDeps['supabase'],
    // Only wire the live pull when a real key is present. A fake/placeholder key
    // (the test.env `sk_test_stripe_rail_fake_do_not_use`) would 401 the API, so
    // the fixture path (body.fixture_transactions) must be used for local runs.
    fetchBalanceTransactions:
      secretKey && !secretKey.includes('fake') && secretKey !== 'sk_placeholder_intake'
        ? (since) => fetchBalanceTransactionsFromStripe(secretKey, since)
        : undefined,
    now: () => new Date(),
  };

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const result = await runStripeRecon(deps, body);
    const status = result.skipped ? 'skipped' : 'succeeded';
    if (jobRunId) {
      await supabase
        .from('job_runs')
        .update({ status, finished_at: new Date().toISOString(), detail: result })
        .eq('id', jobRunId);
    }
    return new Response(JSON.stringify({ success: true, ...result }), {
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
