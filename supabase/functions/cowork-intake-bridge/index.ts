// cowork-intake-bridge — the Cowork → agent_tasks intake bridge (WP-1.5).
//
// Invoked every 30 min by pg_cron via public.invoke_edge_function (00303),
// which POSTs an apikey + service-role Bearer — so verify_jwt stays true (the
// platform default; config.toml [functions.cowork-intake-bridge] documents the
// intent). No browser calls it. All orchestration is in core.ts (unit-tested
// offline); this shell only wires the service-role client + real Graph deps.
//
// Credential-gated: until Kody runs docs/agent-os/entra-bridge-setup.md, the
// MSGRAPH_* secrets are absent and runBridge records skipped_no_creds + a
// job_runs 'skipped' row, then returns 200 — a graceful no-op, not a failure.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getGraphToken, graphFetch } from '../_shared/msgraph.ts';
import { runBridge, type BridgeSupabase } from './core.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const summary = await runBridge({
      supabase: supabase as unknown as BridgeSupabase,
      getEnv: (k) => Deno.env.get(k),
      now: () => new Date(),
      getToken: (creds) => getGraphToken(creds),
      graphFetch: (token, url, init) => graphFetch(token, url, init),
      fetchImpl: (url, init) => fetch(url, init),
    });
    // 200 even on a recorded error/rate_limit — the durable record lives in
    // job_runs + bridge_state; the cron caller doesn't need a non-2xx.
    return new Response(JSON.stringify({ success: summary.status === 'ok' || summary.status === 'skipped_no_creds', ...summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // Last-resort guard; runBridge records its own known-path failures.
    console.error('cowork-intake-bridge failed:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
