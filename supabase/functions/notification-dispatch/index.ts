// Notification Dispatch Edge Function
// Receives notification jobs, renders email templates, calls Resend API,
// and logs results to notification_log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderTemplateFromDb } from "../_shared/render-template.ts";
import { sendCompliantEmail, type SendCategory } from "../_shared/send-email.ts";

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

// Transactional notification types bypass unsubscribe headers + the per-user
// rate cap. Mirror of TRANSACTIONAL_TYPES in
// packages/shared/src/types/notifications.ts — edge functions (Deno) can't
// import the node package, so the list is duplicated here. Keep in sync.
const TRANSACTIONAL_TYPES = new Set<string>([
  "account_verification",
  "password_reset",
  "security_alert",
  "order_confirmation",
  "payment_receipt",
]);

/**
 * Derive the compliance send category for a job:
 *   - a sequence/drip send (data.sequence_id present) → engagement (gets
 *     unsubscribe headers + is rate-capped)
 *   - a transactional type → transactional (no unsubscribe, never rate-capped)
 *   - everything else → operational (relationship email; gets unsubscribe)
 */
function deriveCategory(job: NotificationJob): SendCategory {
  if (job.data?.sequence_id != null) return "engagement";
  if (TRANSACTIONAL_TYPES.has(job.type)) return "transactional";
  return "operational";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const job: NotificationJob = await req.json();

    // Validate required fields
    if (!job.user_id || !job.type || !job.channel || !job.template_id) {
      return json(
        { error: "Missing required fields: user_id, type, channel, template_id" },
        400,
      );
    }

    // Look up the recipient profile (email + display name for personalization).
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, email_suppressed, display_name")
      .eq("id", job.user_id)
      .single();

    if (!profile) {
      return json({ error: "User not found" }, 404);
    }

    // ─── Email: route through the compliance chokepoint ───────────────────
    // sendCompliantEmail owns suppression, the per-user rate cap, unsubscribe
    // headers, EMAIL_DEV_MODE, AND the notification_log row — so we do NOT
    // pre-insert a log row here (that was the double-write bug).
    if (job.channel === "email") {
      const enrichedData = {
        ...job.data,
        displayName: profile.display_name,
        displayNameComma: profile.display_name
          ? `, ${profile.display_name}`
          : "",
      };

      // DB-backed rendering first (migration 00078 + admin overrides).
      const rendered = await renderTemplateFromDb(
        supabase,
        job.template_id,
        enrichedData,
      );

      // Fail loud for sequence drips: a founding designer must NEVER receive
      // the generic "you have a new notification" fallback. Non-sequence sends
      // keep the inline-builder fallback below.
      const isSequence = job.data?.sequence_id != null;
      if (!rendered && isSequence) {
        // One authoritative failed-log row for observability, then 500 so the
        // sequence processor treats it as an error (retries / surfaces it)
        // rather than silently advancing.
        await supabase.from("notification_log").insert({
          user_id: job.user_id,
          type: job.type,
          channel: "email",
          status: "failed",
          template_id: job.template_id,
          error: `template_missing:${job.template_id}`,
          metadata: job.data,
        });
        return new Response(`template_missing:${job.template_id}`, {
          status: 500,
          headers: corsHeaders,
        });
      }

      const result = await sendCompliantEmail(supabase, {
        to: profile.email,
        subject: rendered?.subject || buildSubject(job.type, job.data),
        html: rendered?.html || buildEmailHtml(job.template_id, enrichedData),
        userId: job.user_id,
        notificationType: job.type,
        category: deriveCategory(job),
        templateId: job.template_id,
        metadata: job.data,
      });

      // Suppressed / rate-capped: return 200 skipped so the sequence processor
      // advances (records the skip) instead of retrying forever.
      if (result.suppressed) {
        const reason = result.error?.startsWith("global_rate_cap")
          ? "rate_capped"
          : "suppressed";
        return json({ success: true, skipped: true, reason }, 200);
      }

      // Genuine send failure → non-200 so the caller retries.
      if (!result.success) {
        return json({ success: false, error: result.error }, 500);
      }

      return json({
        success: true,
        notification_id: result.logId,
        provider_id: result.id,
      });
    }

    // ─── In-app / push: write a delivered notification_log row directly ────
    // (sendCompliantEmail is email-only; actual push integration is future
    // work — in-app rows are the feed source of truth.)
    if (job.channel === "push" || job.channel === "in_app") {
      const { data: logEntry, error: logError } = await supabase
        .from("notification_log")
        .insert({
          user_id: job.user_id,
          type: job.type,
          channel: job.channel,
          status: "delivered",
          template_id: job.template_id,
          metadata: job.data,
          sent_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (logError) {
        console.error("Failed to create notification log:", logError);
      }

      return json({
        success: true,
        notification_id: logEntry?.id,
        channel: job.channel,
      });
    }

    // Unknown channel
    return json({ error: `Unsupported channel: ${job.channel}` }, 400);
  } catch (error) {
    console.error("Error in notification-dispatch:", error);
    return json({ error: "Internal server error" }, 500);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────

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
    "in-app-message": `New message from ${data.senderName || "your team"}`,
    "in-app-message-mention": `${data.senderName || "Someone"} mentioned you in Patina`,
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
    "in-app-message": buildInAppMessageHtml(data, false),
    "in-app-message-mention": buildInAppMessageHtml(data, true),
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Inline HTML for in-app message emails. Mirrors the React Email template at
 * packages/email/src/templates/in-app-message.tsx — the React version is the
 * design source of truth; this string version is what the edge function ships
 * until DB-backed templates are seeded.
 */
function buildInAppMessageHtml(
  data: Record<string, unknown>,
  isMention: boolean,
): string {
  const senderName = (data.senderName as string) || "Someone";
  const senderInitial = senderName.slice(0, 1).toUpperCase();
  const senderAvatarUrl = data.senderAvatarUrl as string | null;
  const previewBody = (data.previewBody as string) || "";
  const threadKind = (data.threadKind as string) || "direct";
  const projectTitle = data.projectTitle as string | null;
  const threadTitle = data.threadTitle as string | null;
  const deepLink = (data.deepLink as string) || "#";
  const muteThreadUrl = (data.muteThreadUrl as string) || "";
  const recipientName = (data.displayName as string) || "";

  const headline = isMention
    ? `${escapeHtml(senderName)} mentioned you`
    : `${escapeHtml(senderName)} sent you a message`;
  const headlineColor = isMention ? "#A56A3F" : "#2C2926";
  const bubbleBg = isMention ? "#FBF3EA" : "#FAF7F2";
  const bubbleBorder = isMention ? "#E5D2BB" : "#EEE6DB";

  const context = (() => {
    if (threadKind === "project" && projectTitle) {
      return `In your project: ${escapeHtml(projectTitle)}`;
    }
    if (threadKind === "vendor_brief") {
      return projectTitle
        ? `Vendor brief — ${escapeHtml(projectTitle)}`
        : "Vendor brief";
    }
    return threadTitle ? escapeHtml(threadTitle) : "Direct message";
  })();

  const greeting = recipientName
    ? `${escapeHtml(recipientName)},`
    : "Hello —";

  const avatarMarkup = senderAvatarUrl
    ? `<img src="${escapeHtml(senderAvatarUrl)}" alt="${escapeHtml(senderName)}" width="36" height="36" style="border-radius:50%;display:block;" />`
    : `<div style="width:36px;height:36px;border-radius:50%;background:#C4A57B;color:#fff;font-size:15px;font-weight:600;line-height:36px;text-align:center;">${escapeHtml(senderInitial)}</div>`;

  const muteFooter = muteThreadUrl
    ? `<p style="color:#7A736C;font-size:12px;line-height:18px;margin:0;text-align:center;">
         Too much? <a href="${escapeHtml(muteThreadUrl)}" style="color:#A3927C;text-decoration:underline;">Mute this conversation</a> and we'll stop emailing about it.
       </p>`
    : "";

  return `
    <p style="color:#7A736C;font-size:13px;margin:0 0 4px 0;letter-spacing:0.02em;">${greeting}</p>
    <h1 style="color:${headlineColor};font-size:22px;font-weight:600;line-height:28px;margin:0 0 4px 0;">${headline}</h1>
    <p style="color:#7A736C;font-size:13px;margin:0 0 20px 0;font-style:italic;">${context}</p>
    <div style="background:${bubbleBg};border-radius:12px;border:1px solid ${bubbleBorder};padding:16px;margin:0 0 24px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="width:48px;vertical-align:top;padding-right:12px;">${avatarMarkup}</td>
          <td style="vertical-align:top;">
            <p style="color:#2C2926;font-size:13px;font-weight:600;margin:0 0 4px 0;">${escapeHtml(senderName)}</p>
            <p style="color:#3A3530;font-size:15px;line-height:22px;margin:0;white-space:pre-wrap;">${escapeHtml(previewBody)}</p>
          </td>
        </tr>
      </table>
    </div>
    <div style="margin:0 0 24px 0;text-align:center;">
      <a href="${escapeHtml(deepLink)}" style="display:inline-block;background:#C4A57B;color:#fff;padding:14px 32px;border-radius:24px;text-decoration:none;font-weight:600;">${isMention ? "See the mention" : "Open conversation"}</a>
    </div>
    ${muteFooter}
  `;
}
