// Shared email-send helper for Supabase Edge Functions.
//
// Compliance is separated from provider upload so durable outboxes can persist
// the exact JSON body before attempt one and replay byte-identical requests.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT } from "https://deno.land/x/jose@v5.2.0/index.ts";

export type SendCategory =
  | "transactional"
  | "operational"
  | "engagement"
  | "marketing";

export interface EmailAttachment {
  filename: string;
  content: string;
}

export interface ComplianceSendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  replyTo?: string;
  from?: string;
  attachments?: EmailAttachment[];
  userId?: string;
  notificationType?: string;
  category: SendCategory;
  templateId?: string;
  metadata?: Record<string, unknown>;
  skipLog?: boolean;
  unsubscribeBaseUrl?: string;
  tags?: Array<{ name: string; value: string }>;
  idempotencyKey?: string;
  /** Fail closed when suppression/rate policy storage cannot be read. Durable
   * sends should enable this; legacy direct callers retain prior behavior. */
  failClosedPolicyReads?: boolean;
}

export interface ComplianceSendResult {
  success: boolean;
  id?: string;
  error?: string;
  suppressed?: boolean;
  logId?: string;
}

/** Exact provider request persisted by durable outboxes before upload. */
export interface PreparedResendRequest {
  body: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  idempotencyKey?: string;
  dryRun: boolean;
}

export type CompliancePreparationResult =
  | { state: "ready"; request: PreparedResendRequest }
  | { state: "suppressed"; reason: string };

export type EmailSuppressionCheckResult =
  | { state: "clear" }
  | { state: "suppressed"; reason: "email_suppressed" };

export type PreparedResendResult =
  | { state: "delivered"; id?: string }
  | { state: "failed"; error: string }
  | { state: "ambiguous"; error: string };

const DEFAULT_FROM = "Patina <hello@patina.cloud>";
const DEFAULT_BASE_URL = "https://admin.patina.cloud";

function resolveFromAddress(category: SendCategory): string {
  const transactional = Deno.env.get("RESEND_FROM_TRANSACTIONAL") ||
    Deno.env.get("RESEND_FROM") ||
    DEFAULT_FROM;
  const marketing = Deno.env.get("RESEND_FROM_MARKETING") ||
    Deno.env.get("RESEND_FROM") ||
    DEFAULT_FROM;

  return category === "marketing" || category === "engagement"
    ? marketing
    : transactional;
}

function getResendApiKey(): string {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY environment variable is required");
  return key;
}

export function buildResendRequestHeaders(
  apiKey: string,
  idempotencyKey?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return headers;
}

function getDevMode(): "dry_run" | "redirect" | "off" {
  const mode = Deno.env.get("EMAIL_DEV_MODE")?.toLowerCase();
  return mode === "dry_run" || mode === "redirect" ? mode : "off";
}

function getUnsubscribeSecret(): Uint8Array {
  const secret = Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) {
    throw new Error(
      "UNSUBSCRIBE_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY required",
    );
  }
  return new TextEncoder().encode(secret);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown send error";
}

export async function generateUnsubscribeToken(
  userId: string,
  notificationType: string,
): Promise<string> {
  return await new SignJWT({
    type: notificationType,
    purpose: "unsubscribe",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("72h")
    .setIssuer("patina:notifications")
    .sign(getUnsubscribeSecret());
}

export function buildUnsubscribeHeaders(
  unsubscribeUrl: string,
): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export async function generateUnsubscribeUrl(
  userId: string,
  notificationType: string,
  baseUrl = DEFAULT_BASE_URL,
): Promise<string> {
  const token = await generateUnsubscribeToken(userId, notificationType);
  return `${baseUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Check only durable bounce/complaint suppression. This intentionally does not
 * inspect notification_log or apply a rolling rate cap, so an already-
 * persisted provider request can be replayed without changing its original
 * eligibility merely because time or unrelated sends have advanced.
 */
export async function checkEmailSuppression(
  supabase: SupabaseClient,
  userId: string,
  options: { failClosed?: boolean } = {},
): Promise<EmailSuppressionCheckResult> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email_suppressed")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    if (options.failClosed) {
      throw new Error(
        `email_suppression_check_failed: ${profileError.message}`,
      );
    }
    console.error("send-email: suppression check unavailable", profileError);
  }
  if (options.failClosed && !profile) {
    throw new Error("email_suppression_check_failed: profile missing");
  }
  return profile?.email_suppressed
    ? { state: "suppressed", reason: "email_suppressed" }
    : { state: "clear" };
}

/**
 * Run compliance and serialize the exact provider body without uploading it.
 * Durable callers can opt into fail-closed suppression/rate-cap reads; the
 * compatibility wrapper keeps legacy direct-send behavior unless requested.
 */
export async function prepareCompliantEmail(
  supabase: SupabaseClient,
  options: ComplianceSendOptions,
): Promise<CompliancePreparationResult> {
  const devMode = getDevMode();
  const recipientOverride = Deno.env.get("EMAIL_DEV_REDIRECT_TO");
  const effectiveTo = devMode === "redirect" && recipientOverride
    ? recipientOverride
    : options.to;

  if (options.userId) {
    const suppression = await checkEmailSuppression(
      supabase,
      options.userId,
      { failClosed: options.failClosedPolicyReads },
    );
    if (suppression.state === "suppressed") {
      return suppression;
    }

    if (options.category !== "transactional") {
      const capPerHour = Number(Deno.env.get("EMAIL_USER_CAP_PER_HOUR") || "8");
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: capError } = await supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", options.userId)
        .eq("channel", "email")
        .in("status", [
          "sent",
          "delivered",
          "sending",
          "opened",
          "clicked",
          "unconfirmed",
        ])
        .gte("created_at", cutoff);
      if (capError) {
        if (options.failClosedPolicyReads) {
          throw new Error(`email_rate_cap_check_failed: ${capError.message}`);
        }
        console.error("send-email: rate-cap check unavailable", capError);
      }
      if (options.failClosedPolicyReads && typeof count !== "number") {
        throw new Error("email_rate_cap_check_failed: count missing");
      }
      if ((count ?? 0) >= capPerHour) {
        return {
          state: "suppressed",
          reason: `global_rate_cap (${capPerHour}/hr)`,
        };
      }
    }
  }

  const headers: Record<string, string> = {};
  if (options.category !== "transactional" && options.userId) {
    const unsubscribeUrl = await generateUnsubscribeUrl(
      options.userId,
      options.notificationType ?? "all_marketing",
      options.unsubscribeBaseUrl || DEFAULT_BASE_URL,
    );
    Object.assign(headers, buildUnsubscribeHeaders(unsubscribeUrl));
  }

  const from = options.from || resolveFromAddress(options.category);
  const subject = devMode === "redirect"
    ? `[DEV→${effectiveTo}] ${options.subject}`
    : options.subject;
  const payload: Record<string, unknown> = {
    from,
    to: [effectiveTo],
    subject,
    html: options.html,
    headers,
  };
  if (options.text) payload.text = options.text;
  const cc = options.cc
    ? (Array.isArray(options.cc) ? options.cc : [options.cc])
    : undefined;
  if (cc) payload.cc = cc;
  if (options.replyTo) payload.reply_to = options.replyTo;
  if (options.tags) payload.tags = options.tags;
  if (options.attachments?.length) payload.attachments = options.attachments;

  return {
    state: "ready",
    request: {
      body: JSON.stringify(payload),
      from,
      to: [effectiveTo],
      cc,
      subject,
      idempotencyKey: options.idempotencyKey,
      dryRun: devMode === "dry_run",
    },
  };
}

/**
 * Upload one already-persisted body. A timeout, transport error, or unreadable
 * 2xx response is ambiguous because Resend may have accepted the request.
 */
export async function sendPreparedResendRequest(
  request: PreparedResendRequest,
  options: {
    timeoutMs?: number | null;
    fetchImpl?: typeof fetch;
    apiKey?: string;
  } = {},
): Promise<PreparedResendResult> {
  if (request.dryRun) {
    console.log("[send-email:dry_run]", request.body);
    return { state: "delivered", id: `dryrun_${Date.now()}` };
  }

  const controller = new AbortController();
  const timeout = options.timeoutMs == null ? undefined : setTimeout(
    () => controller.abort(),
    Math.max(1, options.timeoutMs),
  );
  try {
    const response = await (options.fetchImpl ?? fetch)(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: buildResendRequestHeaders(
          options.apiKey ?? getResendApiKey(),
          request.idempotencyKey,
        ),
        body: request.body,
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return {
        state: "failed",
        error: `Resend API ${response.status}: ${await response.text()}`,
      };
    }

    try {
      const body = await response.json();
      if (!body || typeof body.id !== "string") {
        return {
          state: "ambiguous",
          error: "Resend accepted the request but returned no message id",
        };
      }
      return { state: "delivered", id: body.id };
    } catch (error) {
      return {
        state: "ambiguous",
        error: `Resend success response was unreadable: ${errorMessage(error)}`,
      };
    }
  } catch (error) {
    return { state: "ambiguous", error: errorMessage(error) };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/** Compatibility chokepoint for non-outbox callers. */
export async function sendCompliantEmail(
  supabase: SupabaseClient,
  options: ComplianceSendOptions,
): Promise<ComplianceSendResult> {
  // Preserve the legacy chokepoint's no-I/O dry-run behavior for its many
  // existing callers. Durable outboxes call prepareCompliantEmail directly so
  // their exact dry-run payload is still persisted and reconciled normally.
  if (getDevMode() === "dry_run") {
    console.log(
      "[send-email:dry_run]",
      JSON.stringify({
        to: options.to,
        subject: options.subject,
        category: options.category,
        userId: options.userId,
        templateId: options.templateId,
        attachments: options.attachments?.map((attachment) =>
          attachment.filename
        ),
      }),
    );
    return { success: true, id: `dryrun_${Date.now()}` };
  }

  const prepared = await prepareCompliantEmail(supabase, options);
  const shouldLog = Boolean(options.userId && !options.skipLog);

  if (prepared.state === "suppressed") {
    if (shouldLog) {
      await supabase.from("notification_log").insert({
        user_id: options.userId,
        type: options.notificationType ?? "unknown",
        channel: "email",
        status: "suppressed",
        template_id: options.templateId,
        metadata: { reason: prepared.reason, ...options.metadata },
      });
    }
    return { success: false, suppressed: true, error: prepared.reason };
  }

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

  const result = await sendPreparedResendRequest(prepared.request);
  if (logId) {
    if (result.state === "delivered") {
      // Resend's 2xx is an ACCEPT, not a delivery. 'delivered' is written only
      // by resend-webhook's email.delivered event (00552 added 'sent').
      await supabase.from("notification_log").update({
        status: "sent",
        provider_id: result.id,
        sent_at: new Date().toISOString(),
      }).eq("id", logId);
    } else {
      // 'failed' covers both a definite failure and an AMBIGUOUS send (timeout,
      // transport error, non-2xx, unreadable 2xx). No provider_id is written
      // because none of those branches yield one — PreparedResendResult carries
      // `id` only on state "delivered". Consequence: resend-webhook matches on
      // provider_id, so an ambiguous row that Resend actually delivered cannot
      // be found and auto-upgraded; correcting it needs a reconciliation pass
      // keyed on something else. See resend-webhook/status-map.ts.
      await supabase.from("notification_log").update({
        status: "failed",
        error: result.error,
      }).eq("id", logId);
    }
  }

  return result.state === "delivered"
    ? { success: true, id: result.id, logId }
    : { success: false, error: result.error, logId };
}
