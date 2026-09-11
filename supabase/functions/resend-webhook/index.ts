// Resend Webhook Handler Edge Function
// Consumes Resend webhook events to update notification_log status,
// track opens/clicks, handle bounces/complaints, emit PostHog events,
// and update campaign inline counters.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { capturePosthogEvent } from "../_shared/posthog.ts";
import {
  DELIVERY_UPGRADE_FROM_STATUSES,
  isHardBounce,
  lastEventName,
  RESEND_EVENT_STATUS,
  resolveBounceReason,
  resolveBounceType,
} from "./status-map.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

/**
 * Best-effort RPC. The postgrest builder is a thenable with `then` and no
 * `catch`, so `supabase.rpc(...).catch(fn)` threw TypeError before it ever
 * reached the network — which is why the bounce-suppression path below never
 * ran. Swallowing here keeps a counter outage from failing the webhook.
 */
async function bestEffortRpc(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.rpc(fn, args);
    if (error) console.warn(`resend-webhook: ${fn} failed`, error.message);
  } catch (err) {
    console.warn(`resend-webhook: ${fn} threw`, err);
  }
}

// Soft-bounce suppression threshold. Hard bounces suppress on the first event.
const SOFT_BOUNCE_THRESHOLD = 3;
const BOUNCE_WINDOW_DAYS = 30;

export interface ResendWebhookEvent {
  type: string;
  data: {
    email_id: string;
    to?: string[];
    from?: string;
    created_at?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    bounce_type?: string;
    [key: string]: unknown;
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// One line per cold start, not one per rejected delivery.
let missingSecretLogged = false;

// Svix stamps every delivery with unix seconds; outside this window the body is
// a replay of a signature that was valid once, so it is refused unverified.
const REPLAY_WINDOW_SECONDS = 5 * 60;

export function isTimestampWithinWindow(
  timestamp: string | null,
  nowMs: number = Date.now(),
  windowSeconds: number = REPLAY_WINDOW_SECONDS,
): boolean {
  if (!timestamp) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  return Math.abs(nowMs / 1000 - seconds) <= windowSeconds;
}

/** Compare time must not depend on how much of the signature matched. */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Fail closed. An unsigned body is an anonymous write to notification_log and
  // to profiles' suppression flags, so an unconfigured secret rejects traffic
  // rather than trusting it.
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!webhookSecret) {
    if (!missingSecretLogged) {
      missingSecretLogged = true;
      console.error(
        "resend-webhook: RESEND_WEBHOOK_SECRET is not set — rejecting every delivery until it is",
      );
    }
    return json({ error: "webhook_secret_not_configured" }, 401);
  }

  try {
    const body = await req.text();

    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return json({ error: "Missing webhook signature headers" }, 401);
    }

    if (!isTimestampWithinWindow(svixTimestamp)) {
      console.error("resend-webhook: svix-timestamp outside the replay window");
      return json({ error: "timestamp_out_of_range" }, 400);
    }

    const signaturePayload = `${svixId}.${svixTimestamp}.${body}`;
    const secretBytes = Uint8Array.from(
      atob(webhookSecret.replace("whsec_", "")),
      (c) => c.charCodeAt(0),
    );

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signaturePayload),
    );
    const expectedSignature = btoa(
      String.fromCharCode(...new Uint8Array(signature)),
    );

    const signatures = svixSignature.split(" ");
    const isValid = signatures.some((sig) => {
      const [, sigValue] = sig.split(",");
      return timingSafeEqual(sigValue ?? "", expectedSignature);
    });

    if (!isValid) {
      console.error("Webhook signature verification failed");
      return json({ error: "Invalid webhook signature" }, 401);
    }

    const event: ResendWebhookEvent = JSON.parse(body);
    if (!event.data?.email_id) {
      return json({ error: "Missing email_id in webhook data" }, 400);
    }

    // Service-role client only after the signature has cleared.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const outcome = await handleResendEvent(supabase, event);
    return json({
      received: true,
      matched: outcome.matched,
      event_type: event.type,
    });
  } catch (error) {
    console.error("Error in resend-webhook:", error);
    return json({ error: "Internal server error" }, 500);
  }
});

/**
 * Apply one verified Resend event to notification_log (and, for bounces and
 * complaints, to the recipient's suppression state).
 *
 * Exported so it can be exercised against a stubbed client: importing this
 * module for its `serve()` alone would boot a listener.
 */
export async function handleResendEvent(
  supabase: SupabaseClient,
  event: ResendWebhookEvent,
): Promise<{ matched: boolean }> {
  const emailId = event.data.email_id;

  // Find the notification log entry by provider_id
  const { data: logEntry } = await supabase
    .from("notification_log")
    .select("id, user_id, status, type, template_id, recipient, metadata")
    .eq("provider_id", emailId)
    .single();

  if (!logEntry) {
    // Not found — might be a non-tracked email (e.g. auth emails)
    console.warn(`No notification_log entry for email_id: ${emailId}`);
    return { matched: false };
  }

  const campaignId = logEntry.metadata?.campaign_id as string | undefined;
  const notificationType = logEntry.type as string;
  const templateId = logEntry.template_id as string | undefined;
  // Present on notification_log rows written by a sequence send
  // (automation-processor) — surfaced on every PostHog emit below so
  // sequence performance is queryable without re-joining notification_log.
  const sequenceId = logEntry.metadata?.sequence_id as string | undefined;
  const stepIndex = logEntry.metadata?.step_index as number | undefined;
  // A letter can be stamped with a business ref and no user at all (00591 made
  // user_id nullable), so PostHog is told who by address, then by row id.
  const distinctId = (logEntry.user_id ?? logEntry.recipient ??
    logEntry.id) as string;

  const mappedStatus = RESEND_EVENT_STATUS[event.type];
  const now = new Date().toISOString();
  const lastEvent = lastEventName(event.type);
  // Every handled event leaves this trail, whatever it does to `status`.
  const trail = lastEvent
    ? { last_event: lastEvent, last_event_at: now }
    : {};

  // Process based on event type
  switch (event.type) {
    case "email.sent": {
      // Resend's accept, not a delivery: `status` is left exactly where it is
      // so a re-delivered 'sent' cannot walk 'delivered'/'opened' backwards.
      await supabase
        .from("notification_log")
        .update({ ...trail })
        .eq("id", logEntry.id);
      break;
    }

    case "email.delivered": {
      // Two writes on purpose. The status promotion is guarded so an
      // out-of-order delivered event cannot walk 'opened'/'clicked' back
      // (sendCompliantEmail writes 'sent' on Resend's 2xx accept, 00552);
      // the delivery timestamp and the event trail are facts either way.
      await supabase
        .from("notification_log")
        .update({
          status: mappedStatus,
          sent_at: event.data.created_at || now,
        })
        .eq("id", logEntry.id)
        .in("status", [...DELIVERY_UPGRADE_FROM_STATUSES]);

      // `last_event` is the MOST RECENT event received, not the ordered status:
      // an out-of-order 'delivered' after an 'opened' still lands here.
      await supabase
        .from("notification_log")
        .update({
          delivered_at: event.data.created_at || now,
          ...trail,
        })
        .eq("id", logEntry.id);

      // Update campaign inline counter
      if (campaignId) {
        await bestEffortRpc(supabase, "increment_campaign_counter", {
          p_campaign_id: campaignId,
          p_column: "sent_count",
        });
      }

      // Emit PostHog event
      await emitPostHogEvent(distinctId, "email_sent", {
        campaign_id: campaignId,
        template_id: templateId,
        notification_type: notificationType,
        sequence_id: sequenceId,
        step_index: stepIndex,
      });
      break;
    }

    case "email.delivery_delayed": {
      // Transient: the message may still land, so `status` is untouched and
      // only the retry is recorded.
      await supabase
        .from("notification_log")
        .update({ delayed_at: now, ...trail })
        .eq("id", logEntry.id);
      break;
    }

    case "email.opened": {
      await supabase
        .from("notification_log")
        .update({
          status: mappedStatus,
          opened_at: now,
          ...trail,
        })
        .eq("id", logEntry.id);

      if (campaignId) {
        await bestEffortRpc(supabase, "increment_campaign_counter", {
          p_campaign_id: campaignId,
          p_column: "open_count",
        });
      }

      await emitPostHogEvent(distinctId, "email_opened", {
        campaign_id: campaignId,
        template_id: templateId,
        notification_type: notificationType,
        sequence_id: sequenceId,
        step_index: stepIndex,
      });

      // Update PostHog user property
      await updatePostHogUserProperties(distinctId, {
        last_email_opened_at: now,
      });
      break;
    }

    case "email.clicked": {
      await supabase
        .from("notification_log")
        .update({
          status: mappedStatus,
          clicked_at: now,
          ...trail,
        })
        .eq("id", logEntry.id);

      if (campaignId) {
        await bestEffortRpc(supabase, "increment_campaign_counter", {
          p_campaign_id: campaignId,
          p_column: "click_count",
        });
      }

      await emitPostHogEvent(distinctId, "email_clicked", {
        campaign_id: campaignId,
        template_id: templateId,
        notification_type: notificationType,
        sequence_id: sequenceId,
        step_index: stepIndex,
      });
      break;
    }

    case "email.bounced": {
      const bounceType = resolveBounceType(event.data);
      const bounceReason = resolveBounceReason(event.data);

      await supabase
        .from("notification_log")
        .update({
          status: mappedStatus,
          error: `Bounce: ${bounceType || "unknown"}`,
          bounced_at: now,
          bounce_type: bounceType,
          bounce_reason: bounceReason,
          ...trail,
        })
        .eq("id", logEntry.id);

      if (campaignId) {
        await bestEffortRpc(supabase, "increment_campaign_counter", {
          p_campaign_id: campaignId,
          p_column: "bounce_count",
        });
      }

      await emitPostHogEvent(distinctId, "email_bounced", {
        campaign_id: campaignId,
        template_id: templateId,
        bounce_type: bounceType,
        bounce_reason: bounceReason,
        sequence_id: sequenceId,
        step_index: stepIndex,
      });

      // Increment bounce count and check suppression threshold. A row with no
      // user_id has no profile to suppress — the bounce is recorded and that
      // is all there is to do.
      if (logEntry.user_id) {
        await handleBounce(supabase, logEntry.user_id, bounceType ?? undefined);
      }
      break;
    }

    case "email.complained": {
      await supabase
        .from("notification_log")
        .update({
          status: mappedStatus,
          error: "Spam complaint",
          ...trail,
        })
        .eq("id", logEntry.id);

      if (campaignId) {
        await bestEffortRpc(supabase, "increment_campaign_counter", {
          p_campaign_id: campaignId,
          p_column: "unsubscribe_count",
        });
      }

      // Permanently suppress on complaint — when there is a profile to suppress.
      if (logEntry.user_id) {
        await supabase
          .from("profiles")
          .update({
            email_suppressed: true,
            email_suppressed_at: now,
            email_complaint: true,
          })
          .eq("id", logEntry.user_id);
        console.warn(
          `Email suppressed for user ${logEntry.user_id} due to spam complaint`,
        );
      }

      await emitPostHogEvent(distinctId, "email_unsubscribed", {
        campaign_id: campaignId,
        template_id: templateId,
        reason: "spam_complaint",
        sequence_id: sequenceId,
        step_index: stepIndex,
      });

      break;
    }

    default: {
      console.log(`Unhandled Resend webhook event type: ${event.type}`);
    }
  }

  // Update total_emails_received PostHog user property
  await updatePostHogUserProperties(distinctId, {
    $set_once: { first_email_received_at: now },
  });

  return { matched: true };
}

/**
 * Handle bounce events: increment counter, then suppress — immediately for a
 * hard bounce, or after 3 soft bounces in 30 days.
 */
/**
 * Emit a PostHog event via the shared capture helper (_shared/posthog.ts).
 * Kept as a thin wrapper so every call site above stays unchanged; only
 * adds the resend-webhook-specific $lib tag.
 */
async function emitPostHogEvent(
  userId: string,
  eventName: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  await capturePosthogEvent(userId, eventName, { ...properties, $lib: "resend-webhook" });
}

/**
 * Update PostHog user properties via the capture API ($set / $set_once).
 */
async function updatePostHogUserProperties(
  userId: string,
  properties: Record<string, unknown>
): Promise<void> {
  const posthogKey = Deno.env.get("POSTHOG_API_KEY");
  const posthogHost = Deno.env.get("POSTHOG_HOST") || "https://us.i.posthog.com";

  if (!posthogKey) return;

  const setOnce = properties.$set_once as Record<string, unknown> | undefined;
  const setProps = { ...properties };
  delete setProps.$set_once;

  try {
    await fetch(`${posthogHost}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: posthogKey,
        event: "$set",
        distinct_id: userId,
        $set: Object.keys(setProps).length > 0 ? setProps : undefined,
        $set_once: setOnce,
      }),
    });
  } catch (err) {
    console.error("PostHog user property update failed:", err);
  }
}

async function handleBounce(
  supabase: SupabaseClient,
  userId: string,
  bounceType?: string
): Promise<void> {
  // increment_bounce_count owns profiles.email_bounce_count; a second write
  // here read a stale value and double-counted every bounce.
  await bestEffortRpc(supabase, "increment_bounce_count", { p_user_id: userId });

  // A permanent bounce is proof the address is dead — suppress on the first
  // one rather than waiting for the rolling threshold to fill.
  if (isHardBounce(bounceType)) {
    await supabase
      .from("profiles")
      .update({
        email_suppressed: true,
        email_suppressed_at: new Date().toISOString(),
      })
      .eq("id", userId);

    console.warn(
      `Email suppressed for user ${userId}: hard bounce (type: ${bounceType})`,
    );
    return;
  }

  const threshold = SOFT_BOUNCE_THRESHOLD;

  // Count recent bounces
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - BOUNCE_WINDOW_DAYS);

  const { count } = await supabase
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "bounced")
    .gte("created_at", windowStart.toISOString());

  if ((count ?? 0) >= threshold) {
    await supabase
      .from("profiles")
      .update({
        email_suppressed: true,
        email_suppressed_at: new Date().toISOString(),
      })
      .eq("id", userId);

    console.warn(
      `Email suppressed for user ${userId}: ${count} bounces in ${BOUNCE_WINDOW_DAYS} days (type: ${bounceType})`
    );
  }
}
