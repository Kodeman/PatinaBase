// paperwork-upload — the trade-side compliance upload door (PR-a, VISION V10).
//
// Public, browser-called, token-gated in-code: apps/client-portal's
// /paperwork/[token] page calls this directly with the anon key (there is no
// session — the 64-hex token minted by mint_paperwork_link IS the authority,
// verified against paperwork_link_tokens inside the RPCs this function calls,
// all of them SECURITY DEFINER and granted to service_role only, 00637).
// verify_jwt = false (config.toml) so the gateway does not demand a caller JWT;
// CORS is wired here (OPTIONS -> 204, every response carries the headers) the
// same way fulfillment-evidence / create-checkout-session / fulfillment-po do.
//
// All logic lives in core.ts (pure + injectable) so the Deno test drives it
// without this shell — this file only builds the real service-role client,
// reads the caller's address for the shared rate bucket, and layers CORS on.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handlePaperwork, type PaperworkDeps } from './core.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(res.body, { status: res.status, headers });
}

function json(body: unknown, status = 200): Response {
  return withCors(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

/** Cloudflare's own header first; the proxy chain's first hop otherwise. A
 *  request with neither is unbucketed rather than refused — see core.ts. */
function callerIp(req: Request): string | null {
  const direct = req.headers.get('cf-connecting-ip');
  if (direct) return direct.trim();
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded ? (forwarded.split(',')[0] ?? '').trim() || null : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const deps: PaperworkDeps = {
    supabase: supabase as unknown as PaperworkDeps['supabase'],
    ip: callerIp(req),
  };

  try {
    return withCors(await handlePaperwork(deps, req));
  } catch (err) {
    console.error('paperwork-upload:', err instanceof Error ? err.message : String(err));
    return json({ error: 'upload_failed' }, 500);
  }
});
