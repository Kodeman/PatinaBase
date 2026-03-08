// Resend Webhook Handler Edge Function
// Consumes Resend webhook events to update notification_log status,
// track opens/clicks, handle bounces/complaints, emit PostHog events,
// and update campaign inline counters.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

// Bounce suppression thresholds
const HARD_BOUNCE_THRESHOLD = 2;
const SOFT_BOUNCE_THRESHOLD = 3;
const BOUNCE_WINDOW_DAYS = 30;

interface ResendWebhookEvent {
  type: string;
  data: {
    email_id: string;
    to?: string[];
    from?: string;
    created_at?: string;
    bounce_type?: string;
    [key: string]: unknown;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.text();

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const svixId = req.headers.get("svix-id");
      const svixTimestamp = req.headers.get("svix-timestamp");
      const svixSignature = req.headers.get("svix-signature");

      if (!svixId || !svixTimestamp || !svixSignature) {
        return new Response(
          JSON.stringify({ error: "Missing webhook signature headers" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const signaturePayload = `${svixId}.${svixTimestamp}.${body}`;
      const secretBytes = Uint8Array.from(
        atob(webhookSecret.replace("whsec_", "")),
        (c) => c.charCodeAt(0)
      );

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        secretBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(signaturePayload)
      );
      const expectedSignature = btoa(
        String.fromCharCode(...new Uint8Array(signature))
      );

      const signatures = svixSignature.split(" ");
      const isValid = signatures.some((sig) => {
        const [, sigValue] = sig.split(",");
        return sigValue === expectedSignature;
      });

      if (!isValid) {
        console.error("Webhook signature verification failed");
        return new Response(
          JSON.stringify({ error: "Invalid webhook signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const event: ResendWebhookEvent = JSON.parse(body);
    const emailId = event.data.email_id;

    if (!emailId) {
      return new Response(
        JSON.stringify({ error: "Missing email_id in webhook data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the notification log entry by provider_id
    const { data: logEntry } = await supabase
      .from("notification_log")
      .select("id, user_id, status")
      .eq("provider_id", emailId)
      .single();

    if (!logEntry) {
      // Not found — might be a non-tracked email (e.g. auth emails)
      console.warn(`No notification_log entry for email_id: ${emailId}`);
      return new Response(
        JSON.stringify({ received: true, matched: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch campaign_id from log metadata if present
    const { data: fullLog } = await supabase
      .from("notification_log")
      .select("id, user_id, status, type, template_id, metadata")
      .eq("id", logEntry.id)
      .single();

    const campaignId = fullLog?.metadata?.campaign_id as string | undefined;
    const notificationType = fullLog?.type as string;
    const templateId = fullLog?.template_id as string | undefined;

    // Process based on event type
    switch (event.type) {
      case "email.delivered": {
        await supabase
          .from("notification_log")
          .update({
            status: "delivered",
            sent_at: event.data.created_at || new Date().toISOString(),
          })
          .eq("id", logEntry.id);

        // Update campaign inline counter
        if (campaignId) {
          await supabase.rpc("increment_campaign_counter", {
            p_campaign_id: campaignId,
            p_column: "sent_count",
          }).catch(() => {
            // Fallback: direct update
            supabase
              .from("campaigns")
              .update({ sent_count: supabase.rpc ? undefined : 1 })
              .eq("id", campaignId);
          });
        }

        // Emit PostHog event
        await emitPostHogEvent(logEntry.user_id, "email_sent", {
          campaign_id: campaignId,
          template_id: templateId,
          notification_type: notificationType,
        });
        break;
      }

      case "email.opened": {
        await supabase
          .from("notification_log")
          .update({
            status: "opened",
            opened_at: new Date().toISOString(),
          })
          .eq("id", logEntry.id);

        if (campaignId) {
          await supabase.rpc("increment_campaign_counter", {
            p_campaign_id: campaignId,
            p_column: "open_count",
          }).catch(() => {});
        }

        await emitPostHogEvent(logEntry.user_id, "email_opened", {
          campaign_id: campaignId,
          template_id: templateId,
          notification_type: notificationType,
        });

        // Update PostHog user property
        await updatePostHogUserProperties(logEntry.user_id, {
          last_email_opened_at: new Date().toISOString(),
        });
        break;
      }

      case "email.clicked": {
        await supabase
          .from("notification_log")
          .update({
            status: "clicked",
            clicked_at: new Date().toISOString(),
          })
          .eq("id", logEntry.id);

        if (campaignId) {
          await supabase.rpc("increment_campaign_counter", {
            p_campaign_id: campaignId,
            p_column: "click_count",
          }).catch(() => {});
        }

        await emitPostHogEvent(logEntry.user_id, "email_clicked", {
          campaign_id: campaignId,
          template_id: templateId,
          notification_type: notificationType,
        });
        break;
      }

      case "email.bounced": {
        await supabase
          .from("notification_log")
          .update({
            status: "bounced",
            error: `Bounce: ${event.data.bounce_type || "unknown"}`,
          })
          .eq("id", logEntry.id);

        if (campaignId) {
          await supabase.rpc("increment_campaign_counter", {
            p_campaign_id: campaignId,
            p_column: "bounce_count",
          }).catch(() => {});
        }

        await emitPostHogEvent(logEntry.user_id, "email_bounced", {
          campaign_id: campaignId,
          template_id: templateId,
          bounce_type: event.data.bounce_type,
        });

        // Increment bounce count and check suppression threshold
        await handleBounce(supabase, logEntry.user_id, event.data.bounce_type);
        break;
      }

      case "email.complained": {
        await supabase
          .from("notification_log")
          .update({
            status: "failed",
            error: "Spam complaint",
          })
          .eq("id", logEntry.id);

        if (campaignId) {
          await supabase.rpc("increment_campaign_counter", {
            p_campaign_id: campaignId,
            p_column: "unsubscribe_count",
          }).catch(() => {});
        }

        // Permanently suppress on complaint
        await supabase
          .from("profiles")
          .update({
            email_suppressed: true,
            email_suppressed_at: new Date().toISOString(),
            email_complaint: true,
          })
          .eq("id", logEntry.user_id);

        await emitPostHogEvent(logEntry.user_id, "email_unsubscribed", {
          campaign_id: campaignId,
          template_id: templateId,
          reason: "spam_complaint",
        });

        console.warn(`Email suppressed for user ${logEntry.user_id} due to spam complaint`);
        break;
      }

      default: {
        console.log(`Unhandled Resend webhook event type: ${event.type}`);
      }
    }

    // Update total_emails_received PostHog user property
    await updatePostHogUserProperties(logEntry.user_id, {
      $set_once: { first_email_received_at: new Date().toISOString() },
    });

    return new Response(
      JSON.stringify({ received: true, event_type: event.type }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in resend-webhook:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Handle bounce events: increment counter and suppress if threshold reached.
 * Hard bounces: suppress after 2 in 30 days.
 * Soft bounces: suppress after 3 in 30 days.
 */
/**
 * Emit a PostHog event via the capture API.
 */
async function emitPostHogEvent(
  userId: string,
  eventName: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  const posthogKey = Deno.env.get("POSTHOG_API_KEY");
  const posthogHost = Deno.env.get("POSTHOG_HOST") || "https://us.i.posthog.com";

  if (!posthogKey) {
    console.warn("POSTHOG_API_KEY not set, skipping event emission");
    return;
  }

  try {
    await fetch(`${posthogHost}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: posthogKey,
        event: eventName,
        distinct_id: userId,
        properties: {
          ...properties,
          $lib: "resend-webhook",
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error(`PostHog event emission failed for ${eventName}:`, err);
  }
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
  supabase: ReturnType<typeof createClient>,
  userId: string,
  bounceType?: string
): Promise<void> {
  // Increment bounce count
  await supabase.rpc("increment_bounce_count", { p_user_id: userId }).catch(() => {
    // If RPC doesn't exist, do it manually
    return supabase
      .from("profiles")
      .update({ email_bounce_count: supabase.rpc ? undefined : 1 })
      .eq("id", userId);
  });

  // Manual increment fallback
  const { data: profile } = await supabase
    .from("profiles")
    .select("email_bounce_count")
    .eq("id", userId)
    .single();

  const newCount = (profile?.email_bounce_count ?? 0) + 1;

  await supabase
    .from("profiles")
    .update({ email_bounce_count: newCount })
    .eq("id", userId);

  // Check threshold
  const isHardBounce = bounceType === "hard" || bounceType === "permanent";
  const threshold = isHardBounce ? HARD_BOUNCE_THRESHOLD : SOFT_BOUNCE_THRESHOLD;

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
