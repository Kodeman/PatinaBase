// Supabase Edge Function: aesthete-ask
//
// Aesthete Engine Wave 3C (design §3.2 #14, §12.1 rung 2; product law
// R31/R38). The Engine's ask path for ⌘K and the Library Room librarian bar:
//
//   POST { ask: string, context?: { category?, layer? }, limit? }
//   → { items: [{ id, name, brand, price_retail, price_trade, images,
//                 category, layer, matched_on: ('vector'|'fts')[], score }],
//       degraded: boolean, latency_ms, result_count }
//
// CALLER-JWT function: every retrieval (aesthete_search FTS seam,
// aesthete_ask_knn vector seam, product display fields) runs on a client
// carrying the caller's Authorization header — products RLS (00152
// three-layer law) applies transitively. Service role is used for EXACTLY
// one thing: the match_events observability row (source='engine_ask',
// latency + result count; NO ask text — R31/R38, enforced by shape in
// lib.ts and by the 00244 table shape).
//
// Degradation (§12.1 rung 2): the ask-text embed has a hard 1.5 s budget
// (ASK_EMBED_TIMEOUT_MS); on timeout/429/worker-down/unconfigured the
// response is FTS-only with { degraded: true } and the surfaces say
// "the Engine is resting" (copy law: never "error", never "AI").
//
// Gateway verify_jwt is on (default; no config.toml entry) — the signature
// is already checked before we run; we peek the payload for the role gate
// (authenticated only; anon has no shelves to ask) and the sub.
//
// Env: SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY
//      (runtime-injected), INFERENCE_URL + INFERENCE_TOKEN (absent →
//      permanent FTS rung, still answers).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adminClient, createInferenceClient, logLine } from '../_shared/aesthete.ts';
import {
  ASK_EMBED_TIMEOUT_MS,
  type AdminDb,
  type AskEmbedCache,
  type CacheDb,
  type CallerDb,
  createAskEmbedCache,
  parseAskRequest,
  peekJwt,
  runAsk,
} from './lib.ts';

const FN = 'aesthete-ask';

// §12.3 ask-embed cache (00250 ask_embed_cache — see the 00250 header for
// the Redis-intent deviation note). Module-scoped so the learned
// model_version survives across requests of a warm isolate; created lazily
// so a missing service-role env degrades to "no cache", never a crash.
let askCache: AskEmbedCache | null | undefined;
function getAskCache(): AskEmbedCache | null {
  if (askCache === undefined) {
    try {
      askCache = createAskEmbedCache(adminClient() as unknown as CacheDb);
    } catch (err) {
      logLine(FN, 'cache_unavailable', {
        reason: err instanceof Error ? err.message : String(err),
      });
      askCache = null;
    }
  }
  return askCache;
}

// Browser-invoked (supabase.functions.invoke from the designer portal) — the
// invoice-send/companion CORS idiom.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  const { sub, role } = peekJwt(authHeader);
  if (role !== 'authenticated' || !sub) {
    // The ask is a designer surface (R31/R38) — anon/service asks are a
    // caller bug, not a degraded mode.
    return json({ error: 'authenticated user required' }, 401);
  }

  const body = await req.json().catch(() => null);
  const parsed = parseAskRequest(body);
  if ('error' in parsed) {
    return json({ error: parsed.error }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    logLine(FN, 'misconfigured', { has_url: !!url, has_anon: !!anonKey });
    return json({ error: 'service misconfigured' }, 500);
  }

  // The caller's client — RLS rides this JWT through every read.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader! } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const inferenceUrl = Deno.env.get('INFERENCE_URL');
  const inferenceToken = Deno.env.get('INFERENCE_TOKEN');
  const inference = inferenceUrl && inferenceToken
    ? createInferenceClient({
      url: inferenceUrl,
      token: inferenceToken,
      timeoutMs: ASK_EMBED_TIMEOUT_MS, // the 1.5 s budget IS the breaker
      max429Attempts: 1, // no in-request retries on the interactive path
    })
    : null;

  try {
    const result = await runAsk({
      // Structural narrowing (embed-worker idiom): supabase-js builder
      // generics vs the narrow seams; runtime shape is identical.
      caller: caller as unknown as CallerDb,
      admin: adminClient() as unknown as AdminDb,
      inference,
      cache: getAskCache(),
      request: parsed,
      userId: sub,
      log: (event, fields) => logLine(FN, event, fields),
    });
    return json(result);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    logLine(FN, 'ask_error', { error: detail });
    return json({ error: 'ask_failed', detail }, 500);
  }
});
