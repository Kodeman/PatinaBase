// Supabase Edge Function: aesthete-embed-worker
//
// Aesthete Engine Wave 2B (design §6.1 pipeline, §12.2 embed row, §4.3).
// Drains the 00241 aesthete_jobs outbox for the two embed kinds:
//
//   embed_text  → products.embedding        (name ‖ description ‖ materials,
//                                            kind=document — 00008 RPCs live)
//   embed_fused → products.aesthete_vector  (normalize(0.65·mean(≤3 images)
//                                            + 0.35·style-caption embed);
//                                            caption stored on style_caption)
//
// Invoked by pg_cron every minute through invoke_edge_function (00241 cron
// 'aesthete-embed'; body {} — optional {batch_size} clamps 1..16). Gateway
// verify_jwt is on (default; no config.toml entry) and the cron carries the
// service-role bearer; like the other cron drains (decision-reminders idiom)
// the function itself runs service-role.
//
// Degradation (§12.1 rung 3): the inference worker's /healthz is probed
// FIRST — if it's down/unwarmed we return without claiming, so pending jobs
// never burn 00241 attempts against a dead worker. Per-item failures go
// through complete_aesthete_job('failed', reason) — backoff 1 m/5 m/25 m,
// terminal park at attempts ≥ 5 (all owned by the RPC, never re-implemented
// here).
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (runtime-injected),
//      INFERENCE_URL (e.g. http://host.docker.internal:8000 locally,
//      http://aesthete-inference:8000 on the prod compose network),
//      INFERENCE_TOKEN.
//
// Response: { claimed, done, failed, ms, kinds } — or
//           { skipped: 'inference_unconfigured' | 'inference_unavailable', … }.

import { adminClient, createInferenceClient, logLine } from '../_shared/aesthete.ts';
import { captureServerEvent } from '../_shared/aesthete-events.ts';
import { type DbLike, parseBatchSize, runEmbedBatch } from './lib.ts';

const FN = 'aesthete-embed-worker';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const body = await req.json().catch(() => ({}));
  const batchSize = parseBatchSize(body);

  const inferenceUrl = Deno.env.get('INFERENCE_URL');
  const inferenceToken = Deno.env.get('INFERENCE_TOKEN');
  if (!inferenceUrl || !inferenceToken) {
    // Jobs stay queued — nothing lost; loud config log for Logflare.
    logLine(FN, 'inference_unconfigured', {
      has_url: !!inferenceUrl,
      has_token: !!inferenceToken,
    });
    return json({ skipped: 'inference_unconfigured', claimed: 0, done: 0, failed: 0 }, 503);
  }

  const inference = createInferenceClient({ url: inferenceUrl, token: inferenceToken });

  // Probe before claiming (see header). 2 s budget inside the 60 s window.
  const health = await inference.healthz();
  if (!health || !health.warmed) {
    logLine(FN, 'inference_unavailable', { health });
    return json({ skipped: 'inference_unavailable', claimed: 0, done: 0, failed: 0 }, 200);
  }

  try {
    const result = await runEmbedBatch({
      // Structural narrowing: supabase-js's builder generics blow TS2589 when
      // checked against the narrow DbLike seam; runtime shape is identical.
      db: adminClient() as unknown as DbLike,
      inference,
      batchSize,
      log: (event, fields) => logLine(FN, event, fields),
    });
    // §12.4 server event — only for batches that actually worked jobs (the
    // every-minute idle cron tick would be noise). Best-effort by contract.
    if (result.claimed > 0) {
      await captureServerEvent(FN, 'embed_batch_done', {
        claimed: result.claimed,
        done: result.done,
        failed: result.failed,
        ms: result.ms,
        embed_text_done: result.kinds.embed_text.done,
        embed_fused_done: result.kinds.embed_fused.done,
      });
    }
    return json(result);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    logLine(FN, 'batch_error', { error: detail });
    return json({ error: 'batch_failed', detail }, 500);
  }
});
