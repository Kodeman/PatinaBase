// Supabase Edge Function: expire-decisions
//
// Manual trigger (or cron-invoked) variant of the SQL job in 00092.
// Useful for ad-hoc backfills and as a safety net if pg_cron is paused.
// Sets status = 'expired' on pending decisions whose due_date passed
// more than 7 days ago.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('client_decisions')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .not('due_date', 'is', null)
    .lt('due_date', cutoff)
    .select('id');

  if (error) {
    console.error('expire-decisions: failed', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ expired: (data ?? []).length, ids: (data ?? []).map((d: any) => d.id) }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
