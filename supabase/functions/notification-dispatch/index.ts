// Notification Dispatch Edge Function
// Receives notification jobs, renders email templates, calls Resend API,
// and logs results to notification_log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotificationJob {
  user_id: string;
  type: string;
  channel: "email" | "push" | "in_app" | "sms";
  template_id: string;
  data: Record<string, unknown>;
  priority?: "critical" | "high" | "normal" | "low";
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const job: NotificationJob = await req.json();

    // Validate required fields
    if (!job.user_id || !job.type || !job.channel || !job.template_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: user_id, type, channel, template_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user email is suppressed
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, email_suppressed, display_name")
      .eq("id", job.user_id)
      .single();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile.email_suppressed && job.channel === "email") {
      // Log as suppressed
      await supabase.from("notification_log").insert({
        user_id: job.user_id,
        type: job.type,
        channel: job.channel,
        status: "suppressed",
        template_id: job.template_id,
        metadata: { reason: "email_suppressed", ...job.data },
      });

      return new Response(
        JSON.stringify({ success: false, reason: "email_suppressed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create log entry in 'queued' status
    const { data: logEntry, error: logError } = await supabase
      .from("notification_log")
      .insert({
        user_id: job.user_id,
        type: job.type,
        channel: job.channel,
        status: "queued",
        template_id: job.template_id,
        metadata: job.data,
      })
      .select("id")
      .single();

    if (logError) {
      console.error("Failed to create notification log:", logError);
    }

    const logId = logEntry?.id;

    // Dispatch based on channel
    if (job.channel === "email") {
      if (!resendApiKey) {
        await updateLog(supabase, logId, "failed", "RESEND_API_KEY not configured");
        return new Response(
          JSON.stringify({ error: "Email sending not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Send with retry
      let lastError = "";
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          await updateLog(supabase, logId, "sending");

          const result = await sendEmailViaResend(resendApiKey, {
            to: profile.email,
            subject: buildSubject(job.type, job.data),
            templateId: job.template_id,
            data: {
              ...job.data,
              displayName: profile.display_name,
            },
          });

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

        // Exponential backoff before retry
        if (attempt < MAX_RETRIES - 1) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        // Update retry count
        if (logId) {
          await supabase
            .from("notification_log")
            .update({ retry_count: attempt + 1 })
            .eq("id", logId);
        }
      }

      // All retries exhausted
      await updateLog(supabase, logId, "failed", lastError);
      return new Response(
        JSON.stringify({ success: false, error: lastError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (job.channel === "push" || job.channel === "in_app") {
      // Push and in-app: store as delivered (actual push integration is future work)
      await updateLog(supabase, logId, "delivered");
      return new Response(
        JSON.stringify({ success: true, notification_id: logId, channel: job.channel }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Unknown channel
    await updateLog(supabase, logId, "failed", `Unsupported channel: ${job.channel}`);
    return new Response(
      JSON.stringify({ error: `Unsupported channel: ${job.channel}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in notification-dispatch:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────

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

interface SendResult {
  success: boolean;
  id?: string;
  error?: string;
}

async function sendEmailViaResend(
  apiKey: string,
  params: {
    to: string;
    subject: string;
    templateId: string;
    data: Record<string, unknown>;
  }
): Promise<SendResult> {
  // Build HTML from template data.
  // In production this would render React Email components.
  // For Edge Function context, we use Resend's API with inline HTML.
  const html = buildEmailHtml(params.templateId, params.data);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: "Patina <hello@notify.patina.com>",
      to: [params.to],
      subject: params.subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: `Resend API error (${response.status}): ${errorText}` };
  }

  const data = await response.json();
  return { success: true, id: data.id };
}

function buildSubject(type: string, data: Record<string, unknown>): string {
  const subjects: Record<string, string> = {
    "welcome-verification": "Welcome to Patina — Verify your email",
    "password-reset": "Reset your Patina password",
    "security-alert": "Security alert for your Patina account",
    "new-lead-designer": `New lead: ${data.clientName || "A client"} is interested`,
    "lead-expiring": `Action needed: Lead expiring soon`,
    "client-confirmation": "Your consultation request is confirmed",
    "order-confirmation": `Order confirmed — ${data.orderId || ""}`,
    "payment-receipt": `Payment receipt — ${data.amount || ""}`,
    "price-drop": `Price drop: ${data.productName || "An item you're watching"}`,
    "back-in-stock": `Back in stock: ${data.productName || "An item you wanted"}`,
    "weekly-inspiration": "Your weekly furniture inspiration",
    "founding-circle-update": "Founding Circle: What's new at Patina",
  };

  return subjects[type] || "Notification from Patina";
}

function buildEmailHtml(templateId: string, data: Record<string, unknown>): string {
  // Minimal HTML wrapper. In a full implementation, this renders the
  // React Email template server-side. For the Edge Function, we use
  // a simple HTML structure matching the brand.
  const name = (data.displayName as string) || "";
  const greeting = name ? `Hi ${name},` : "Hello,";

  const templates: Record<string, string> = {
    "welcome-verification": `
      <h1>Welcome to Patina</h1>
      <p>${greeting}</p>
      <p>We're delighted you're here. Verify your email to get started.</p>
      <a href="${data.verificationUrl}" style="display:inline-block;background:#C4A57B;color:#fff;padding:14px 32px;border-radius:24px;text-decoration:none;font-weight:600;">Verify My Email</a>
    `,
    "password-reset": `
      <h1>Reset your password</h1>
      <p>${greeting}</p>
      <p>We received a request to reset your password.</p>
      <a href="${data.resetUrl}" style="display:inline-block;background:#C4A57B;color:#fff;padding:14px 32px;border-radius:24px;text-decoration:none;font-weight:600;">Reset Password</a>
    `,
    "security-alert": `
      <h1>Security Alert</h1>
      <p>${greeting}</p>
      <p>${data.alertDescription || "Unusual activity was detected on your account."}</p>
      <a href="${data.secureAccountUrl}" style="display:inline-block;background:#C45B4A;color:#fff;padding:14px 32px;border-radius:24px;text-decoration:none;font-weight:600;">Secure My Account</a>
    `,
  };

  const body = templates[templateId] || `<p>${greeting} You have a new notification from Patina.</p>`;

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="background:#FAF7F2;font-family:Inter,Helvetica,Arial,sans-serif;margin:0;padding:0;">
      <div style="max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:linear-gradient(135deg,#C4A57B,#8B7355);padding:32px 40px;text-align:center;">
          <span style="color:#fff;font-size:28px;font-weight:600;letter-spacing:2px;">Patina</span>
        </div>
        <div style="padding:40px;">${body}</div>
        <div style="background:#2C2926;padding:32px 40px;text-align:center;">
          <p style="color:#A09890;font-size:13px;margin:0 0 8px;">Patina — Furniture intelligence for design professionals</p>
          <p style="color:#7A736C;font-size:11px;margin:0;">Patina Inc. · 123 Design Way, Suite 100 · San Francisco, CA 94102</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
