// fulfillment-events-mirror — mirrors public.fulfillment_events onto PostHog
// (S0). Cron-invoked every 5 min via public.invoke_edge_function (00354),
// which POSTs an apikey + service-role Bearer — so verify_jwt stays true (the
// platform default; config.toml [functions.fulfillment-events-mirror]
// documents the intent). No browser calls it. All orchestration lives in
// core.ts (unit-tested offline); this shell only wires the service-role
// client + job_runs bookkeeping (00300 idiom), exactly as
// stripe-event-processor/index.ts is to its core.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runEventsMirror, type MirrorSupabase } from './core.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const runId = await supabase
    .from('job_runs')
    .insert({ job_name: 'fulfillment-events-mirror', status: 'running' })
    .select('id')
    .single();
  const jobRunId = (runId.data as { id: number } | null)?.id;
  try {
    const result = await runEventsMirror(supabase as unknown as MirrorSupabase);
    if (jobRunId) {
      await supabase
        .from('job_runs')
        .update({ status: 'succeeded', finished_at: new Date().toISOString(), detail: result })
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
