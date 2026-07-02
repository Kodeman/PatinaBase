// Supabase Edge Function: aesthete-nightly
//
// Aesthete Engine Wave 4A (design §12.2 nightly phases; §8.2 BT MAP refit;
// §8.3 reliability; §8.4 confidence map/drift/starvation; §14.4 backtest +
// dial gate). Invoked by pg_cron at 02:30 through invoke_edge_function
// (00248 cron 'aesthete-nightly'; body {}). Gateway verify_jwt is on
// (default; no config.toml entry) and the cron carries the service-role
// bearer — like the other cron drains, the function itself runs service-role.
//
// The refit MATH lives on the stateless inference worker (/fit/taste — this
// fn only orchestrates: SQL assembles judgments + φ via 00244's
// _aesthete_phi, the worker returns θ_D, SQL applies it). Phases are
// ISOLATED: a failing phase logs + continues; everything self-heals next
// night (§12.2 failure column).
//
// Worker-down posture (§12.1 ladder): phases 1–2 skip-with-notice when
// INFERENCE_URL/TOKEN are unset or the worker is unreachable — watermarks
// mean nothing is lost; phases 3–4 are pure SQL and always run.
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (runtime-injected),
//      INFERENCE_URL (e.g. http://<lan-ip>:8321 locally,
//      http://aesthete-inference:8000 on the prod compose network),
//      INFERENCE_TOKEN, POSTHOG_KEY (optional — §12.4 events degrade to logs).
//
// Response: { phases: {refit, reliability, house_draft, refresh}, ms }.

import { adminClient, logLine, type RpcClient } from '../_shared/aesthete.ts';
import { captureServerEvent } from '../_shared/aesthete-events.ts';
import { createFitClient } from './fit-client.ts';
import { runNightly } from './lib.ts';

const FN = 'aesthete-nightly';

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

  const inferenceUrl = Deno.env.get('INFERENCE_URL');
  const inferenceToken = Deno.env.get('INFERENCE_TOKEN');
  const fit = inferenceUrl && inferenceToken
    ? createFitClient({ url: inferenceUrl, token: inferenceToken })
    : null;
  if (!fit) {
    // SQL-only night: refit/reliability skip per designer; house draft,
    // centroids, behavior stats, and starvation decay still run.
    logLine(FN, 'inference_unconfigured', {
      has_url: !!inferenceUrl,
      has_token: !!inferenceToken,
    });
  }

  try {
    const result = await runNightly({
      // Structural narrowing (embed-worker precedent): supabase-js builder
      // generics blow TS2589 against the narrow RpcClient seam.
      db: adminClient() as unknown as RpcClient,
      fit,
      log: (event, fields) => logLine(FN, event, fields),
    });

    // §12.4 server events — one per phase, best-effort by contract.
    for (const [phase, r] of Object.entries(result.phases)) {
      await captureServerEvent(FN, 'nightly_phase_done', {
        phase,
        ok: r.ok,
        ...(r.error ? { error: r.error } : {}),
        ...(phase === 'refit' ? { refit: r.detail.refit, skipped: r.detail.skipped } : {}),
        ...(phase === 'reliability' ? { stats_rows: r.detail.stats_rows } : {}),
        ...(phase === 'house_draft' ? { draft_id: r.detail.draft_id } : {}),
      });
    }

    return json(result);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    logLine(FN, 'nightly_error', { error: detail });
    return json({ error: 'nightly_failed', detail }, 500);
  }
});
