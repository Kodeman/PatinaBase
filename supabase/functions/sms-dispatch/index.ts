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
// Real sending is creds-gated. Restricted API keys are preferred; the account
// auth token remains a fallback and is also used for webhook verification.
// response (and logs the attempt as failed) instead of crashing.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderTemplateFromDb } from "../_shared/render-template.ts";
import { sendPartySms } from "../_shared/sms.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SmsJob {
  // Recipient resolution: a userId — consent + phone are looked up
  // server-side from profiles/notification_preferences. There is no raw
  // `to`-number path; an explicit phone with no consent record to check is
  // not a supportable send.
  userId?: string;

  // Field Coordination party path (00284): a project_parties id. Delegates to
  // the shared sendPartySms (party consent gate, conversation/message logging,
  // dev-mode, quiet hours). templateKey/projectId/vars ride alongside.
  partyId?: string;
  templateKey?: string;
  projectId?: string;

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
  const apiKeySid = Deno.env.get("TWILIO_API_KEY_SID");
  const apiKeySecret = Deno.env.get("TWILIO_API_KEY_SECRET");
  const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");
  const statusCallbackUrl = Deno.env.get("SMS_STATUS_CALLBACK_URL");
  const credentialSid = apiKeySid && apiKeySecret ? apiKeySid : accountSid;
  const credentialSecret = apiKeySid && apiKeySecret ? apiKeySecret : authToken;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const job: SmsJob = await req.json();
    const type = job.type || "sms-notification";

    // ── Field Coordination party path (00284) ────────────────────────────
    // A partyId job delegates entirely to the shared sendPartySms. Internal
    // callers (triggers/cron via the service-role JWT) bypass authorization;
    // a USER JWT (Track D's "Send text" composer) must be on the party's
    // project team. The party-consent gate lives inside sendPartySms.
    if (job.partyId) {
      return await handlePartySms(req, supabase, job, corsHeaders);
    }

    if (!job.userId) {
      return new Response(
        JSON.stringify({ error: "Missing required field: userId or partyId" }),
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
    let toNumber: string | undefined;
    let displayName: string | null = null;

    {
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

      toNumber = profile.phone ?? undefined;
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
    if (!accountSid || !credentialSid || !credentialSecret || !fromNumber) {
      await logSms(supabase, job.userId ?? null, type, "failed", {
        reason: "twilio_not_configured",
      });
      return new Response(
        JSON.stringify({
          success: false,
          reason: "twilio_not_configured",
          message:
            "SMS sending is not configured. Set TWILIO_ACCOUNT_SID, " +
            "TWILIO_FROM_NUMBER and either a restricted API key or TWILIO_AUTH_TOKEN.",
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
          { accountSid, credentialSid, credentialSecret, fromNumber, statusCallbackUrl },
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

      if (logId) {
        await supabase
          .from("notification_log")
          .update({ retry_count: attempt + 1 })
          .eq("id", logId);
      }

      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
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

// ─── Field Coordination party path helpers (00284) ────────────────────────

/** Decode (without verifying — the platform's verify_jwt already did) the role
 * + sub from a Bearer token, to tell an internal service-role call from a user. */
function decodeBearerClaims(
  authHeader: string | null,
): { role?: string; sub?: string } | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const parts = authHeader.slice(7).split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** Is `userId` on `projectId`'s team (owning designer or an active member)? */
async function isProjectTeamMember(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const { data: proj } = await supabase
    .from("projects")
    .select("designer_id")
    .eq("id", projectId)
    .maybeSingle();
  if ((proj as { designer_id?: string } | null)?.designer_id === userId) return true;
  const { data: tm } = await supabase
    .from("project_team_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .is("removed_at", null)
    .limit(1)
    .maybeSingle();
  return !!tm;
}

async function handlePartySms(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  job: SmsJob,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const claims = decodeBearerClaims(req.headers.get("Authorization"));
  const isInternal = claims?.role === "service_role";

  // A user JWT must be on the party's project team before we send on its behalf.
  if (!isInternal) {
    const sub = claims?.sub;
    if (!sub) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
    const { data: party } = await supabase
      .from("project_parties")
      .select("project_id")
      .eq("id", job.partyId!)
      .maybeSingle();
    const projectId = (party as { project_id?: string } | null)?.project_id;
    if (!projectId) {
      return new Response(JSON.stringify({ error: "party_not_found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }
    if (!(await isProjectTeamMember(supabase, projectId, sub))) {
      return new Response(JSON.stringify({ error: "not_authorized" }), {
        status: 403,
        headers: jsonHeaders,
      });
    }
  }

  const result = await sendPartySms(supabase, {
    partyId: job.partyId,
    projectId: job.projectId,
    body: job.body,
    templateKey: job.templateKey,
    vars: job.vars,
  });

  return new Response(JSON.stringify({ success: result.sent, ...result }), {
    headers: jsonHeaders,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────

interface SendResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send an SMS via the Twilio Messages REST API using a direct fetch (no SDK,
 * to keep the edge function lightweight). Auth is HTTP Basic with the account
 * restricted API key (or account-token fallback); the payload is form encoded.
 */
async function sendSmsViaTwilio(
  creds: {
    accountSid: string;
    credentialSid: string;
    credentialSecret: string;
    fromNumber: string;
    statusCallbackUrl?: string;
  },
  params: { to: string; body: string }
): Promise<SendResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  const form = new URLSearchParams();
  form.set("To", params.to);
  form.set(
    creds.fromNumber.startsWith("MG") ? "MessagingServiceSid" : "From",
    creds.fromNumber,
  );
  form.set("Body", params.body);
  if (creds.statusCallbackUrl) {
    form.set("StatusCallback", creds.statusCallbackUrl);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${creds.credentialSid}:${creds.credentialSecret}`)}`,
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
