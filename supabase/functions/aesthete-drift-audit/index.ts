// Supabase Edge Function: aesthete-drift-audit
//
// Aesthete Engine Wave 4C (design §13 guardrails → §12.4 observability).
// The weekly guardrail audit: house_capture / budget_dignity /
// exploration_floor / why_coverage over the trailing 7 days of
// match_events + the active house_taste row.
//
// All check math lives in run_aesthete_drift_audit (00250, SECURITY DEFINER,
// service-role EXECUTE) which upserts aesthete_audit keyed (week,
// check_name); this function is the cron trigger + PostHog emitter
// (guardrail_audit_result, one event per check, best-effort).
//
// Invoked by pg_cron Sunday 04:00 through invoke_edge_function (00250 cron
// 'aesthete-drift-audit'; body {} — optional {now: ISO} re-runs a historical
// window). Gateway verify_jwt is on (default; no config.toml entry) and the
// cron carries the service-role bearer; like the other cron drains the
// function itself runs service-role.
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (runtime-injected);
//      POSTHOG_KEY/POSTHOG_HOST optional (absent → log-line fallback,
//      _shared/aesthete-events.ts).
//
// Response: { checks: [{check_name, passed, detail}], all_passed, failed }.

import { adminClient, logLine } from '../_shared/aesthete.ts';
import { captureServerEvent } from '../_shared/aesthete-events.ts';
import { type AuditDb, parseAuditRequest, runDriftAudit } from './lib.ts';

const FN = 'aesthete-drift-audit';

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
  const parsed = parseAuditRequest(body);
  if ('error' in parsed) {
    return json({ error: parsed.error }, 400);
  }

  try {
    const result = await runDriftAudit({
      // Structural narrowing (embed-worker idiom): supabase-js builder
      // generics vs the narrow seam; runtime shape is identical.
      admin: adminClient() as unknown as AuditDb,
      capture: (event, properties) => captureServerEvent(FN, event, properties),
      nowIso: parsed.nowIso,
      log: (event, fields) => logLine(FN, event, fields),
    });
    return json(result);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    logLine(FN, 'audit_error', { error: detail });
    return json({ error: 'audit_failed', detail }, 500);
  }
});
