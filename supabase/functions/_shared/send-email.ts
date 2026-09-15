// Shared email-send helper for Supabase Edge Functions.
//
// Compliance is separated from provider upload so durable outboxes can persist
// the exact JSON body before attempt one and replay byte-identical requests.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT } from "https://deno.land/x/jose@v5.2.0/index.ts";
import { htmlToText } from "./html-to-text.ts";

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
  /** The business record this letter is about, stamped on notification_log.
   * Only for the outbound copy to the external recipient; never on
   * studio-facing notices. */
  ref?: { type: string; id: string };
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
  | {
    state: "ready";
    request: PreparedResendRequest;
    /** Set when the recipient is an account-less typed channel (CRM-12). */
    channel?: ContactChannelResolution;
  }
  | { state: "suppressed"; reason: string; channel?: ContactChannelResolution };

export type EmailSuppressionCheckResult =
  | { state: "clear" }
  | { state: "suppressed"; reason: "email_suppressed" };

/**
 * A typed reach channel (studio_contact_channels, 00593) the recipient address
 * belongs to. CRM-12: a letter to a person with NO Patina account has no
 * profile to carry a suppression flag, so the address's own row is the record —
 * it is what the email rail writes a bounce back onto, what the send gate asks
 * before it sends, and what the Directory row prints.
 */
export interface ContactChannelResolution {
  id: string;
  ownerType: "person" | "company";
  ownerId: string;
  value: string;
  status: "active" | "bounced" | "unsubscribed" | "dead";
}

/** Worst-first, the paper-word discipline: one dead row settles the address. */
const CHANNEL_STATUS_RANK: Record<string, number> = {
  active: 0,
  bounced: 1,
  unsubscribed: 2,
  dead: 3,
};

/** Statuses that refuse a send outright. A soft `bounced` does not: the address
 *  may still be good, exactly as a single soft bounce does not suppress a
 *  profile (resend-webhook's rolling threshold). */
export function channelRefusesSend(status: string): boolean {
  return status === "dead" || status === "unsubscribed";
}

/**
 * The studio_contact_channels row an address belongs to, worst status first.
 *
 * The same address can be on several cards across several studios; the rails
 * hold ONE verdict for it, because a dead mailbox is dead for everyone. A
 * lookup failure resolves to null — the letter then behaves exactly as it did
 * before this existed rather than failing closed on a table many recipients
 * have no row in at all.
 */
export async function resolveContactChannel(
  supabase: SupabaseClient,
  to: string,
): Promise<ContactChannelResolution | null> {
  const value = to.trim().toLowerCase();
  if (!value) return null;
  const { data, error } = await supabase
    .from("studio_contact_channels")
    .select("id, owner_type, owner_id, value, status")
    .eq("value", value)
    .in("channel_kind", ["email", "ap_email"]);
  if (error) {
    console.error("send-email: contact-channel lookup unavailable", error);
    return null;
  }
  const rows = (data ?? []) as Array<{
    id: string;
    owner_type: string;
    owner_id: string;
    value: string;
    status: string;
  }>;
  if (rows.length === 0) return null;
  const worst = rows.reduce((a, b) =>
    (CHANNEL_STATUS_RANK[b.status] ?? 0) > (CHANNEL_STATUS_RANK[a.status] ?? 0)
      ? b
      : a
  );
  return {
    id: worst.id,
    ownerType: worst.owner_type === "company" ? "company" : "person",
    ownerId: worst.owner_id,
    value: worst.value,
    status: worst.status as ContactChannelResolution["status"],
  };
}

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

/** The address actually handed to the provider — EMAIL_DEV_MODE=redirect
 * rewrites it, and every notification_log row should say where the mail really
 * went, the suppressed rows included. */
function effectiveRecipient(to: string): string {
  const override = Deno.env.get("EMAIL_DEV_REDIRECT_TO");
  return getDevMode() === "redirect" && override ? override : to;
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

/** Resend rejects a tag name/value outside [A-Za-z0-9_-] and caps its length. */
const MAX_TAG_LENGTH = 256;

function sanitizeTagValue(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, MAX_TAG_LENGTH);
}

/**
 * Every send is tagged with its category, and with its template when it has
 * one, so Resend's own analytics slice the way notification_log does. A caller
 * that sets either name itself keeps its value.
 */
export function buildResendTags(
  options: Pick<ComplianceSendOptions, "tags" | "category" | "templateId">,
): Array<{ name: string; value: string }> {
  const merged = new Map<string, string>();
  merged.set("category", options.category);
  if (options.templateId) {
    merged.set("template", sanitizeTagValue(options.templateId));
  }
  for (const tag of options.tags ?? []) {
    merged.set(sanitizeTagValue(tag.name), sanitizeTagValue(tag.value));
  }
  return [...merged].map(([name, value]) => ({ name, value }));
}

export async function generateUnsubscribeToken(
  /** The token's subject: a profile id, or `channel:<id>` for an address with
   *  no account behind it (00635/CRM-12). */
  subject: string,
  notificationType: string,
): Promise<string> {
  return await new SignJWT({
    type: notificationType,
    purpose: "unsubscribe",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
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
 * The same signed one-click token, with a CHANNEL as its subject
 * (`channel:<studio_contact_channels.id>`) instead of a user id.
 *
 * A person with no Patina account has no preferences page and no profile to
 * opt out on, so this header is her only door out — which is why it is added
 * to EVERY category here and not only to marketing, as the account-holder path
 * does. The landing (packages/notifications applyUnsubscribeToken) marks the
 * address's channel rows unsubscribed, and the send gate refuses them from
 * then on. The consequence is deliberate: one click stops the studio emailing
 * that address at all, including invoices, and the Directory row says so.
 */
export async function generateChannelUnsubscribeUrl(
  channelId: string,
  notificationType: string,
  baseUrl = DEFAULT_BASE_URL,
): Promise<string> {
  const token = await generateUnsubscribeToken(
    `channel:${channelId}`,
    notificationType,
  );
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
  const effectiveTo = effectiveRecipient(options.to);

  // CRM-12. A recipient with no Patina account is not "unsuppressible": the
  // typed channel the address sits on carries the verdict, and a dead or
  // unsubscribed one refuses the send exactly as profiles.email_suppressed
  // does for an account holder. Looked up only when there is no userId, so the
  // account path is unchanged and costs no extra round trip.
  const channel = options.userId
    ? undefined
    : (await resolveContactChannel(supabase, options.to)) ?? undefined;
  if (channel && channelRefusesSend(channel.status)) {
    return { state: "suppressed", reason: `channel_${channel.status}`, channel };
  }

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
  } else if (channel) {
    // Every category, for the reason generateChannelUnsubscribeUrl states: it
    // is the only door this recipient has.
    const unsubscribeUrl = await generateChannelUnsubscribeUrl(
      channel.id,
      options.notificationType ?? "all_studio_mail",
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
  // A multipart send needs a text part; derive one rather than ship HTML alone.
  const text = options.text ??
    (options.html ? htmlToText(options.html) : undefined);
  if (text) payload.text = text;
  const cc = options.cc
    ? (Array.isArray(options.cc) ? options.cc : [options.cc])
    : undefined;
  if (cc) payload.cc = cc;
  if (options.replyTo) payload.reply_to = options.replyTo;
  payload.tags = buildResendTags(options);
  if (options.attachments?.length) payload.attachments = options.attachments;

  return {
    state: "ready",
    channel,
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
  // A letter to someone with no Patina account still has a business record
  // behind it; a `ref` is enough to earn a log row (notification_log.user_id is
  // nullable, 00591). CRM-12 supplies the missing case: an account-less
  // recipient whose letter names no other record is identified by the CHANNEL
  // it was addressed to — the deliverability ref. Without it the row was never
  // written, so the provider_id never landed, so resend-webhook could never
  // match the bounce back to the address that bounced.
  const ref = options.ref ??
    (prepared.channel
      ? { type: "studio_contact_channel", id: prepared.channel.id }
      : undefined);
  const shouldLog = !options.skipLog &&
    Boolean(options.userId || ref);

  if (prepared.state === "suppressed") {
    if (shouldLog) {
      const { error } = await supabase.from("notification_log").insert({
        user_id: options.userId ?? null,
        type: options.notificationType ?? "unknown",
        channel: "email",
        status: "suppressed",
        template_id: options.templateId,
        ref_type: ref?.type,
        ref_id: ref?.id,
        recipient: effectiveRecipient(options.to),
        metadata: { reason: prepared.reason, ...options.metadata },
      });
      if (error) {
        console.error("[send-email] notification_log insert failed", error);
      }
    }
    return { success: false, suppressed: true, error: prepared.reason };
  }

  let logId: string | undefined;
  if (shouldLog) {
    const { data: logEntry, error } = await supabase
      .from("notification_log")
      .insert({
        user_id: options.userId ?? null,
        type: options.notificationType ?? "unknown",
        channel: "email",
        status: "sending",
        template_id: options.templateId,
        ref_type: ref?.type,
        ref_id: ref?.id,
        recipient: prepared.request.to[0],
        metadata: options.metadata ?? {},
      })
      .select("id")
      .single();
    // Without this the row is silently dropped and the provider_id never lands,
    // so resend-webhook can never match the send it belongs to.
    if (error) {
      console.error("[send-email] notification_log insert failed", error);
    }
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

  // E13: one out touch per letter that actually went, for a subject the room
  // can read it on. Only the account-less channel path has one — an account
  // holder's letter is about a person the rolodex may not carry at all.
  // Best-effort: a touch is a record of the send, never a condition of it.
  if (result.state === "delivered" && prepared.channel) {
    const { error: touchError } = await supabase.rpc("record_touch", {
      p_subject_type: prepared.channel.ownerType,
      p_subject_id: prepared.channel.ownerId,
      p_channel_kind: "email",
      p_direction: "out",
      p_message_ref: logId ?? null,
    });
    if (touchError) {
      console.error("[send-email] record_touch failed", touchError.message);
    }
  }

  return result.state === "delivered"
    ? { success: true, id: result.id, logId }
    : { success: false, error: result.error, logId };
}
