// Notification Dispatch Edge Function
// Receives notification jobs, renders email templates, calls Resend API,
// and logs results to notification_log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderTemplateFromDb } from "../_shared/render-template.ts";
import { sendCompliantEmail, type SendCategory } from "../_shared/send-email.ts";
import {
  renderBrandedShell,
  heading,
  paragraph,
  ctaButton,
  spacer,
} from "../_shared/branded-email.ts";

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
  // Fallback branded shell, used only when a template slug has no DB row
  // (renderTemplateFromDb is preferred by the caller). Composes the body from
  // the shared design-system helpers and wraps it in renderBrandedShell().
  const name = (data.displayName as string) || "";
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hello,";

  const templates: Record<string, string> = {
    "welcome-verification":
      heading("Welcome to Patina") +
      paragraph(greeting) +
      paragraph("We're delighted you're here. Verify your email to get started.") +
      spacer(6) +
      ctaButton(data.verificationUrl as string, "Verify my email"),
    "password-reset":
      heading("Reset your password") +
      paragraph(greeting) +
      paragraph("We received a request to reset your password.") +
      spacer(6) +
      ctaButton(data.resetUrl as string, "Reset password"),
    "security-alert":
      heading("Security alert") +
      paragraph(greeting) +
      paragraph(
        escapeHtml(
          (data.alertDescription as string) ||
            "Unusual activity was detected on your account.",
        ),
      ) +
      spacer(6) +
      ctaButton(data.secureAccountUrl as string, "Secure my account", "brass"),
    "in-app-message": buildInAppMessageHtml(data, false),
    "in-app-message-mention": buildInAppMessageHtml(data, true),
  };

  const body =
    templates[templateId] ||
    heading("A new notification") +
      paragraph(`${greeting} You have a new notification from Patina.`);

  return renderBrandedShell({ title: "Patina", eyebrow: "Notification", body });
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

  const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
  const SANS =
    "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

  const headline = isMention
    ? `${escapeHtml(senderName)} mentioned you`
    : `${escapeHtml(senderName)} sent you a message`;
  const headlineColor = isMention ? "#B08A46" : "#1F1B16";
  const bubbleBorder = isMention ? "#B08A46" : "#E6DDCC";

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
    : `<div style="width:36px;height:36px;border-radius:50%;background:#B08A46;color:#F5F0E6;font-family:${SANS};font-size:15px;font-weight:600;line-height:36px;text-align:center;">${escapeHtml(senderInitial)}</div>`;

  const muteFooter = muteThreadUrl
    ? `<p class="ink3" style="color:#8C8578;font-family:${SANS};font-size:13px;line-height:1.6;margin:0;">Too much? <a href="${escapeHtml(muteThreadUrl)}" style="color:#4E7A66;text-decoration:underline;">Mute this conversation</a> and we'll stop emailing about it.</p>`
    : "";

  return `
    <p class="ink3" style="color:#8C8578;font-family:${SANS};font-size:13px;margin:0 0 6px;letter-spacing:0.01em;">${greeting}</p>
    <h1 class="h1 ink" style="color:${headlineColor};font-family:${SERIF};font-size:27px;font-weight:600;line-height:1.18;letter-spacing:-0.015em;margin:0 0 6px;">${headline}</h1>
    <p class="ink3" style="color:#8C8578;font-family:${SERIF};font-size:14px;font-style:italic;margin:0 0 20px;">${context}</p>
    <table role="presentation" class="chip" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid ${bubbleBorder};border-radius:10px;margin:0 0 24px;">
      <tr><td style="padding:16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            <td width="48" valign="top" style="padding-right:12px;">${avatarMarkup}</td>
            <td valign="top">
              <p class="ink" style="color:#1F1B16;font-family:${SANS};font-size:13px;font-weight:600;margin:0 0 4px;">${escapeHtml(senderName)}</p>
              <p class="ink2" style="color:#4B463E;font-family:${SANS};font-size:15px;line-height:1.55;margin:0;white-space:pre-wrap;">${escapeHtml(previewBody)}</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
    <div style="margin:0 0 24px;">
      ${ctaButton(escapeHtml(deepLink), isMention ? "See the mention" : "Open conversation")}
    </div>
    ${muteFooter}
  `;
}
