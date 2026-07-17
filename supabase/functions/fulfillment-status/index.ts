// fulfillment-status — the derived-status API for iOS (S4, spec §6/§9.5).
//
// Auth: caller JWT is forwarded to PostgREST (the confirm-scan-bundle
// pattern) so `client_order_status_v`'s own-row `auth.uid()` scope — NOT this
// function — does the filtering. verify_jwt stays at the platform default
// (true): the platform validates the JWT before invoking; this handler then
// re-uses that SAME token (not the service-role key) when talking to
// PostgREST, so a client user only ever sees their own orders and a caller
// with no fulfillment_orders rows gets `{orders:[]}`, never another client's
// data and never a 500.
//
// GET (or POST, body ignored) -> { orders: [{ order_number, status,
//   status_label, eta, timeline: [{at, kind, label}] }] }. Vendor entities
// never cross this boundary (spec §9.5) — see core.ts's header for the exact
// reason nothing wider even COULD leak (the view itself carries no such
// column).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getOrderStatuses } from './core.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'missing bearer token' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // JWT-forwarding client: PostgREST enforces client_order_status_v's own-row
  // auth.uid() scope with the CALLER as auth.uid() — no service-role client is
  // constructed anywhere in this function.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await getOrderStatuses({
      supabase: supabase as unknown as Parameters<typeof getOrderStatuses>[0]['supabase'],
    });
    return json(result);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
