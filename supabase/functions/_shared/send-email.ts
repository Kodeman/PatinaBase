// Shared email-send helper for Supabase Edge Functions.
//
// Single chokepoint that:
//   1. Performs suppression check (if user_id provided).
//   2. Auto-injects List-Unsubscribe / List-Unsubscribe-Post headers
//      (RFC 8058) for non-transactional categories with a JOSE-signed token.
//   3. Calls Resend.
//   4. Optionally logs to notification_log with the resulting status.
//
// All edge functions that send email should funnel through this module so
// deliverability headers, suppression, and logging stay consistent.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT } from "https://deno.land/x/jose@v5.2.0/index.ts";

export type SendCategory =
  | "transactional"   // password reset, account verification, security alerts — never get unsubscribe
  | "operational"     // proposal sent, decision reminder, invite — tied to a relationship; gets unsubscribe
  | "engagement"      // price drops, leads, weekly digest — gets unsubscribe
  | "marketing";      // campaigns — gets unsubscribe

export interface ComplianceSendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  replyTo?: string;
  from?: string;

  /** User receiving the email — enables suppression check + unsubscribe token. */
  userId?: string;
  /** Notification type, e.g. "price_drop". Defaults to "all_marketing". */
  notificationType?: string;
  /** Category controls whether unsubscribe headers are injected. */
  category: SendCategory;

  /** Template id for notification_log. */
  templateId?: string;
  /** Extra metadata stored on the log row. */
  metadata?: Record<string, unknown>;
  /** Skip notification_log writes (default: log when userId present). */
  skipLog?: boolean;

  /** Base URL for unsubscribe link (default: admin.patina.cloud). */
  unsubscribeBaseUrl?: string;
  /** Resend tags. */
  tags?: Array<{ name: string; value: string }>;
}

export interface ComplianceSendResult {
  success: boolean;
  id?: string;
  error?: string;
  /** True if send was skipped because the user is suppressed. */
  suppressed?: boolean;
  /** notification_log row id, if logged. */
  logId?: string;
}

const DEFAULT_FROM = "Patina <hello@patina.cloud>";
const DEFAULT_BASE_URL = "https://admin.patina.cloud";

/**
 * Resolve the sender address for a given send category. Allows operators to
 * split transactional and marketing onto separate verified subdomains
 * (better deliverability + reputation isolation) without code changes.
 */
function resolveFromAddress(category: SendCategory): string {
  const transactional =
    Deno.env.get("RESEND_FROM_TRANSACTIONAL") ||
    Deno.env.get("RESEND_FROM") ||
    DEFAULT_FROM;
  const marketing =
    Deno.env.get("RESEND_FROM_MARKETING") ||
    Deno.env.get("RESEND_FROM") ||
    DEFAULT_FROM;

  switch (category) {
    case "marketing":
    case "engagement":
      return marketing;
    case "transactional":
    case "operational":
    default:
      return transactional;
  }
}

function getResendApiKey(): string {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY environment variable is required");
  return key;
}

function getDevMode(): "dry_run" | "redirect" | "off" {
  const m = Deno.env.get("EMAIL_DEV_MODE")?.toLowerCase();
  if (m === "dry_run" || m === "redirect") return m;
  return "off";
}

function getUnsubscribeSecret(): Uint8Array {
  const secret =
    Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) {
    throw new Error("UNSUBSCRIBE_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY required");
  }
  return new TextEncoder().encode(secret);
}

/** Sign a one-click unsubscribe token (72h expiry per CAN-SPAM). */
export async function generateUnsubscribeToken(
  userId: string,
  notificationType: string,
): Promise<string> {
  const secretKey = getUnsubscribeSecret();
  return await new SignJWT({
    type: notificationType,
    purpose: "unsubscribe",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("72h")
    .setIssuer("patina:notifications")
    .sign(secretKey);
}

/** Build RFC 8058 unsubscribe headers. */
export function buildUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/**
 * Generate the full unsubscribe URL (signed token embedded) that should be
 * placed in List-Unsubscribe headers.
 */
export async function generateUnsubscribeUrl(
  userId: string,
  notificationType: string,
  baseUrl = "https://admin.patina.cloud",
): Promise<string> {
  const token = await generateUnsubscribeToken(userId, notificationType);
  return `${baseUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Send a single email via Resend with compliance headers, suppression
 * filtering, and optional notification_log writes.
 */
export async function sendCompliantEmail(
  supabase: SupabaseClient,
  options: ComplianceSendOptions,
): Promise<ComplianceSendResult> {
  const devMode = getDevMode();
  if (devMode === "dry_run") {
    console.log(
      "[send-email:dry_run]",
      JSON.stringify({
        to: options.to,
        subject: options.subject,
        category: options.category,
        userId: options.userId,
        templateId: options.templateId,
      }),
    );
    return { success: true, id: `dryrun_${Date.now()}` };
  }
  const recipientOverride = Deno.env.get("EMAIL_DEV_REDIRECT_TO");
  const effectiveTo =
    devMode === "redirect" && recipientOverride ? recipientOverride : options.to;

  const apiKey = getResendApiKey();
  const from = options.from || resolveFromAddress(options.category);
  const shouldLog = options.userId && !options.skipLog;

  // ─── Suppression check ───────────────────────────────────────────────
  if (options.userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email_suppressed")
      .eq("id", options.userId)
      .maybeSingle();

    if (profile?.email_suppressed) {
      if (shouldLog) {
        await supabase.from("notification_log").insert({
          user_id: options.userId,
          type: options.notificationType ?? "unknown",
          channel: "email",
          status: "suppressed",
          template_id: options.templateId,
          metadata: { reason: "email_suppressed", ...options.metadata },
        });
      }
      return { success: false, suppressed: true, error: "email_suppressed" };
    }

    // Global per-recipient rate cap. Defaults: max 8 emails per 60 minutes
    // to any single user. Transactional sends bypass — they can't be lost.
    if (options.category !== "transactional") {
      const capPerHour = Number(Deno.env.get("EMAIL_USER_CAP_PER_HOUR") || "8");
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", options.userId)
        .eq("channel", "email")
        .in("status", ["delivered", "sending", "opened", "clicked"])
        .gte("created_at", cutoff);
      if ((count ?? 0) >= capPerHour) {
        if (shouldLog) {
          await supabase.from("notification_log").insert({
            user_id: options.userId,
            type: options.notificationType ?? "unknown",
            channel: "email",
            status: "suppressed",
            template_id: options.templateId,
            metadata: {
              reason: "global_rate_cap",
              cap: capPerHour,
              window: "60m",
              ...options.metadata,
            },
          });
        }
        return {
          success: false,
          suppressed: true,
          error: `global_rate_cap (${capPerHour}/hr)`,
        };
      }
    }
  }

  // ─── Unsubscribe headers (skip for transactional) ────────────────────
  const headers: Record<string, string> = {};
  if (options.category !== "transactional" && options.userId) {
    const baseUrl = options.unsubscribeBaseUrl || DEFAULT_BASE_URL;
    const token = await generateUnsubscribeToken(
      options.userId,
      options.notificationType ?? "all_marketing",
    );
    const unsubscribeUrl = `${baseUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
    Object.assign(headers, buildUnsubscribeHeaders(unsubscribeUrl));
  }

  // ─── Insert queued log entry (if logging) ────────────────────────────
  let logId: string | undefined;
  if (shouldLog) {
    const { data: logEntry } = await supabase
      .from("notification_log")
      .insert({
        user_id: options.userId,
        type: options.notificationType ?? "unknown",
        channel: "email",
        status: "sending",
        template_id: options.templateId,
        metadata: options.metadata ?? {},
      })
      .select("id")
      .single();
    logId = logEntry?.id;
  }

  // ─── Send via Resend ─────────────────────────────────────────────────
  const payload: Record<string, unknown> = {
    from,
    to: [effectiveTo],
    subject:
      devMode === "redirect"
        ? `[DEV→${effectiveTo}] ${options.subject}`
        : options.subject,
    html: options.html,
    headers,
  };
  if (options.text) payload.text = options.text;
  if (options.cc) payload.cc = Array.isArray(options.cc) ? options.cc : [options.cc];
  if (options.replyTo) payload.reply_to = options.replyTo;
  if (options.tags) payload.tags = options.tags;

  let providerId: string | undefined;
  let sendError: string | undefined;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      sendError = `Resend API ${res.status}: ${text}`;
    } else {
      const body = await res.json();
      providerId = body.id;
    }
  } catch (err) {
    sendError = err instanceof Error ? err.message : "Unknown send error";
  }

  // ─── Update log row ──────────────────────────────────────────────────
  if (logId) {
    if (sendError) {
      await supabase
        .from("notification_log")
        .update({ status: "failed", error: sendError })
        .eq("id", logId);
    } else {
      await supabase
        .from("notification_log")
        .update({
          status: "delivered",
          provider_id: providerId,
          sent_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }
  }

  if (sendError) {
    return { success: false, error: sendError, logId };
  }
  return { success: true, id: providerId, logId };
}
