// fulfillment-evidence — client evidence-upload flow (S7).
//
// Public, browser-called, token-gated in-code: the client-portal
// /evidence/[token] page (apps/client-portal/src/app/evidence/[token]) calls
// this directly with the anon key (there is no session — the 64-hex-char
// token minted by fulfillment_mint_evidence_token IS the authority, verified
// against fulfillment_evidence_upload_tokens inside the RPCs this function
// calls). verify_jwt = false (config.toml) so the gateway does not demand a
// caller JWT; CORS is wired here (OPTIONS -> 204, every response carries the
// headers) the same way create-checkout-session/fulfillment-po do.
//
// All logic lives in core.ts (pure + injectable) so the Deno test drives it
// without this shell — this file only builds the real service-role client
// and layers CORS onto whatever core.ts returns.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleEvidence, type EvidenceDeps } from './core.ts';

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const deps: EvidenceDeps = { supabase: supabase as unknown as EvidenceDeps['supabase'] };

  try {
    const result = await handleEvidence(deps, req);
    return withCors(result);
  } catch (err) {
    console.error('fulfillment-evidence:', err instanceof Error ? err.message : String(err));
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
