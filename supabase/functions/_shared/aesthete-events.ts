// _shared/aesthete-events.ts — server-side PostHog events for the aesthete
// edge functions (design §12.4: embed_batch_done, dna_draft_done,
// nightly_phase_done, guardrail_audit_result).
//
// Posture: capture() is BEST-EFFORT and never throws — observability must
// never fail a cron pass. When POSTHOG_KEY is absent (local dev, unprovisioned
// prod) it degrades to the structured-JSON log line every aesthete fn already
// emits (Logflare idiom), so the event stream is still greppable.
//
// Env (Wave 3D handoff — set as edge-fn secrets alongside SUPABASE_*):
//   POSTHOG_KEY    project API key (phc_…). Absent ⇒ log-only fallback.
//   POSTHOG_HOST   optional, default https://us.i.posthog.com
//
// Wave-4 fns (aesthete-nightly, aesthete-drift-audit) should reuse this
// module for nightly_phase_done / guardrail_audit_result.

import { logLine } from './aesthete.ts';

const CAPTURE_TIMEOUT_MS = 2_000;

export interface CaptureOptions {
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Injectable env reader for tests. */
  getEnv?: (key: string) => string | undefined;
}

/**
 * Send one server-side event. `fn` is the emitting edge function (becomes the
 * distinct_id namespace — these are system events, not person events).
 * Resolves when the event is durably handed off (or logged); never rejects.
 */
export async function captureServerEvent(
  fn: string,
  event: string,
  properties: Record<string, unknown> = {},
  opts: CaptureOptions = {},
): Promise<void> {
  const getEnv = opts.getEnv ?? ((k: string) => Deno.env.get(k));
  const key = getEnv('POSTHOG_KEY');

  if (!key) {
    // Fallback: the structured log line IS the event (Logflare/§12.4) — the
    // line's event key carries the real event name so it greps identically
    // to a delivered one; posthog:'fallback' marks the degraded path.
    logLine(fn, event, { posthog: 'fallback', ...properties });
    return;
  }

  const host = (getEnv('POSTHOG_HOST') ?? 'https://us.i.posthog.com').replace(/\/$/, '');
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: `aesthete:${fn}`,
        properties: {
          ...properties,
          fn,
          $process_person_profile: false, // system event — no person profile
        },
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
    });
    if (!res.ok) {
      logLine(fn, 'posthog_capture_failed', { posthog_event: event, status: res.status });
    }
    // Drain the body so the connection is released.
    await res.body?.cancel();
  } catch (err) {
    logLine(fn, 'posthog_capture_failed', {
      posthog_event: event,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }
}
