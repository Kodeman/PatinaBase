// SMS Dispatch Edge Function
// Receives SMS notification jobs, resolves the recipient phone number, enforces
// SMS consent (profiles.sms_opt_in + notification_preferences.channels_sms),
// sends via the Twilio Messages REST API, and logs results to notification_log.
//
// Mirrors notification-dispatch/index.ts:
//   * Deno std http `serve`
//   * Supabase service-role client
//   * DB-backed template rendering (falls back to a plain body)
//   * notification_log lifecycle (queued → sending → delivered/failed/suppressed)
//   * all secrets via Deno.env
//
// Real sending is creds-gated. When TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
// TWILIO_FROM_NUMBER are absent, the function returns a clear "not configured"
// response (and logs the attempt as failed) instead of crashing.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderTemplateFromDb } from "../_shared/render-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SmsJob {
  // Recipient resolution: provide a userId (preferred — consent + phone are
  // looked up server-side) and/or an explicit `to` number.
  userId?: string;
  to?: string;

  // Content: either a ready-to-send `body`, or a templateId + vars that the
  // shared renderer interpolates. Template text comes from the email template's
  // subject/plain content; SMS strips HTML to a single line.
  body?: string;
  templateId?: string;
  vars?: Record<string, unknown>;

  // Optional classification used for the notification_log row.
  type?: string;
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const job: SmsJob = await req.json();
    const type = job.type || "sms-notification";

    if (!job.userId && !job.to) {
      return new Response(
        JSON.stringify({ error: "Missing required field: userId or to" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!job.body && !job.templateId) {
      return new Response(
        JSON.stringify({ error: "Missing required field: body or templateId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Resolve recipient + enforce consent ──────────────────────────────
    let toNumber = job.to;
    let displayName: string | null = null;

    if (job.userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone, sms_opt_in, display_name")
        .eq("id", job.userId)
        .single();

      if (!profile) {
        return new Response(
          JSON.stringify({ error: "User not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      displayName = profile.display_name ?? null;

      // Consent gate 1: per-profile SMS opt-in.
      if (!profile.sms_opt_in) {
        await logSms(supabase, job.userId, type, "suppressed", {
          reason: "sms_opt_out",
        });
        return new Response(
          JSON.stringify({ success: false, reason: "sms_opt_out" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Consent gate 2: notification_preferences SMS channel toggle.
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("channels_sms")
        .eq("user_id", job.userId)
        .single();

      if (prefs && prefs.channels_sms === false) {
        await logSms(supabase, job.userId, type, "suppressed", {
          reason: "channels_sms_disabled",
        });
        return new Response(
          JSON.stringify({ success: false, reason: "channels_sms_disabled" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Prefer the stored profile phone over any caller-supplied number.
      if (!toNumber) toNumber = profile.phone ?? undefined;
    }

    if (!toNumber) {
      await logSms(supabase, job.userId ?? null, type, "failed", {
        reason: "no_phone_number",
      });
      return new Response(
        JSON.stringify({ success: false, reason: "no_phone_number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Resolve message body ─────────────────────────────────────────────
    let body = job.body;
    if (!body && job.templateId) {
      const enrichedVars = {
        ...(job.vars || {}),
        displayName,
        displayNameComma: displayName ? `, ${displayName}` : "",
      };
      const rendered = await renderTemplateFromDb(
        supabase,
        job.templateId,
        enrichedVars
      );
      // SMS is plain text: prefer subject, else strip HTML from the body.
      body = rendered?.subject || htmlToText(rendered?.html || "");
    }

    if (!body || !body.trim()) {
      await logSms(supabase, job.userId ?? null, type, "failed", {
        reason: "empty_body",
      });
      return new Response(
        JSON.stringify({ success: false, reason: "empty_body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Creds gate: Twilio must be configured ────────────────────────────
    if (!accountSid || !authToken || !fromNumber) {
      await logSms(supabase, job.userId ?? null, type, "failed", {
        reason: "twilio_not_configured",
      });
      return new Response(
        JSON.stringify({
          success: false,
          reason: "twilio_not_configured",
          message:
            "SMS sending is not configured. Set TWILIO_ACCOUNT_SID, " +
            "TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.",
        }),
        // 503: the plumbing is sound, the dependency just isn't provisioned.
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Create queued log entry ──────────────────────────────────────────
    const { data: logEntry } = await supabase
      .from("notification_log")
      .insert({
        user_id: job.userId ?? null,
        type,
        channel: "sms",
        status: "queued",
        template_id: job.templateId ?? null,
        metadata: { to: toNumber, ...(job.vars || {}) },
      })
      .select("id")
      .single();

    const logId = logEntry?.id;

    // ── Send with retry ──────────────────────────────────────────────────
    let lastError = "";
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await updateLog(supabase, logId, "sending");

        const result = await sendSmsViaTwilio(
          { accountSid, authToken, fromNumber },
          { to: toNumber, body }
        );

        if (result.success) {
          await updateLog(supabase, logId, "delivered", undefined, result.id);
          return new Response(
            JSON.stringify({
              success: true,
              notification_id: logId,
              provider_id: result.id,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        lastError = result.error || "Unknown error";
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Send failed";
      }

      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      if (logId) {
        await supabase
          .from("notification_log")
          .update({ retry_count: attempt + 1 })
          .eq("id", logId);
      }
    }

    await updateLog(supabase, logId, "failed", lastError);
    return new Response(
      JSON.stringify({ success: false, error: lastError }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in sms-dispatch:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────

interface SendResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send an SMS via the Twilio Messages REST API using a direct fetch (no SDK,
 * to keep the edge function lightweight). Auth is HTTP Basic with the account
 * SID + auth token; the payload is application/x-www-form-urlencoded.
 */
async function sendSmsViaTwilio(
  creds: { accountSid: string; authToken: string; fromNumber: string },
  params: { to: string; body: string }
): Promise<SendResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  const form = new URLSearchParams();
  form.set("To", params.to);
  form.set("From", creds.fromNumber);
  form.set("Body", params.body);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${creds.accountSid}:${creds.authToken}`)}`,
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      success: false,
      error: `Twilio API error (${response.status}): ${errorText}`,
    };
  }

  const data = await response.json();
  // Twilio returns `sid` as the message identifier.
  return { success: true, id: data.sid };
}

async function updateLog(
  supabase: ReturnType<typeof createClient>,
  logId: string | undefined,
  status: string,
  error?: string,
  providerId?: string
) {
  if (!logId) return;

  const update: Record<string, unknown> = { status };
  if (error) update.error = error;
  if (providerId) update.provider_id = providerId;
  if (status === "delivered") update.sent_at = new Date().toISOString();

  await supabase.from("notification_log").update(update).eq("id", logId);
}

/**
 * One-shot insert for terminal states reached before a queued row exists
 * (suppressed / pre-send failures). Mirrors the suppressed-log pattern in
 * notification-dispatch.
 */
async function logSms(
  supabase: ReturnType<typeof createClient>,
  userId: string | null,
  type: string,
  status: string,
  metadata: Record<string, unknown>
) {
  // notification_log.user_id is NOT NULL — only log when we have a user.
  if (!userId) return;
  await supabase.from("notification_log").insert({
    user_id: userId,
    type,
    channel: "sms",
    status,
    metadata,
  });
}

/** Collapse HTML to a single line of plain text for SMS bodies. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
