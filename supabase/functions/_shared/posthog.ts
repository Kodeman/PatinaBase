// _shared/posthog.ts — shared PostHog capture helper for edge functions that
// emit PERSON events (a real user as distinct_id): designer-invite's
// designer_invite_sent, resend-webhook's email_* events, and future callers.
//
// Distinct from _shared/aesthete-events.ts's captureServerEvent, which is
// scoped to the aesthete pipeline's own SYSTEM/cron events (fixed
// `aesthete:<fn>` distinct_id, `$process_person_profile:false`, a different
// env var name (POSTHOG_KEY) and endpoint (`/i/v0/e/`)). Do not conflate the
// two — this module intentionally does NOT set $process_person_profile, so
// callers get normal PostHog person-event behavior.
//
// Lifted from resend-webhook/index.ts's original inline emitPostHogEvent.
//
// Env:
//   POSTHOG_API_KEY   project API key (phc_…). Absent ⇒ no-op (never throws).
//   POSTHOG_HOST      optional, default https://us.i.posthog.com
//
// Posture: best-effort. Never throws — a PostHog outage must never fail the
// caller's primary work (sending an email, sending an invite, etc).

export async function capturePosthogEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  const posthogKey = Deno.env.get('POSTHOG_API_KEY');
  const posthogHost = Deno.env.get('POSTHOG_HOST') || 'https://us.i.posthog.com';

  if (!posthogKey) {
    console.warn(`capturePosthogEvent: POSTHOG_API_KEY not set, skipping ${event}`);
    return;
  }

  try {
    await fetch(`${posthogHost}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: posthogKey,
        event,
        distinct_id: distinctId,
        properties,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error(`capturePosthogEvent: emission failed for ${event}:`, err);
  }
}
