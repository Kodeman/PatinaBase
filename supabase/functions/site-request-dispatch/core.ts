export const DISPATCH_RPC_BY_ACTION = {
  send: "site_request_send",
  resend: "site_request_resend",
  nudge: "site_request_nudge",
  "consent-granted": "site_request_dispatch_after_consent",
} as const;

export const SITE_REQUEST_DISPATCH_ACTIONS = [
  "send",
  "resend",
  "nudge",
  "consent-granted",
  "lifecycle",
  "due-reminder",
] as const;
export type SiteRequestDispatchAction =
  (typeof SITE_REQUEST_DISPATCH_ACTIONS)[number];
export type SiteRequestPrepareAction = keyof typeof DISPATCH_RPC_BY_ACTION;

export interface SiteRequestDispatchContext {
  request_id: string;
  status: string;
  access_id: string | null;
  token: string | null;
  expires_at: string | null;
  needs_consent: boolean;
  reused: boolean;
  party_id: string;
  project_id: string;
  assignee_phone: string;
  assignee_name: string;
  designer_name: string;
  studio_name: string | null;
  site_name: string;
  due_at: string;
  due_context: string | null;
  item_count: number;
  action: string;
}

export interface DispatchSmsResult {
  sent: boolean;
  deferred?: boolean;
  reason?: string;
  messageId?: string;
  twilioSid?: string;
}

export interface SiteRequestDispatchDeps {
  callerRole(req: Request): string | null;
  prepare(
    req: Request,
    action: SiteRequestPrepareAction,
    input: { requestId: string; note?: string; expiresAt?: string },
  ): Promise<SiteRequestDispatchContext | null>;
  sendSms(
    context: SiteRequestDispatchContext,
    input: { templateKey: string; body: string },
  ): Promise<DispatchSmsResult>;
  markDispatched(
    context: SiteRequestDispatchContext,
    providerMessageId?: string,
  ): Promise<Record<string, unknown>>;
  logNotification(
    context: SiteRequestDispatchContext,
    action: SiteRequestDispatchAction,
    result: DispatchSmsResult,
  ): Promise<void>;
  processLifecycle(
    req: Request,
    now?: string,
  ): Promise<{
    expired_count: number;
    due_reminders: SiteRequestDispatchContext[];
  }>;
  recordDispatch(
    context: SiteRequestDispatchContext,
    action: "due-reminder",
    result: DispatchSmsResult,
  ): Promise<void>;
  clientPortalUrl: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

function siteRequestBody(
  context: SiteRequestDispatchContext,
  token: string,
): string {
  const studio = context.studio_name ? ` at ${context.studio_name}` : "";
  const due = context.due_context ? ` (${context.due_context})` : "";
  return `${context.designer_name}${studio} needs ${context.item_count} site item${
    context.item_count === 1 ? "" : "s"
  } for ${context.site_name}${due}. Open your checklist: ${
    contextUrl(context, token)
  }`;
}

function contextUrl(
  context: SiteRequestDispatchContext,
  token: string,
): string {
  // Replaced by the handler after construction so the raw token lives only in
  // the outbound message, never logs/DB notification metadata.
  return `__SITE_REQUEST_LINK__/${encodeURIComponent(token)}`;
}

function nudgeBody(context: SiteRequestDispatchContext, note?: string): string {
  const from = context.studio_name
    ? `${context.designer_name} at ${context.studio_name}`
    : context.designer_name;
  return note?.trim()
    ? `${from}: ${note.trim()} Please reopen your Site Request link when you can.`
    : `${from} is checking in on the Site Request for ${context.site_name}. Please reopen your link when you can.`;
}

function dueReminderBody(context: SiteRequestDispatchContext): string {
  const from = context.studio_name
    ? `${context.designer_name} at ${context.studio_name}`
    : context.designer_name;
  const due = new Date(context.due_at);
  const dueLabel = Number.isNaN(due.getTime())
    ? "soon"
    : due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${from}: your Site Request for ${context.site_name} is due ${dueLabel}. Please reopen the private link from our earlier message when you can.`;
}

function isDispatchContext(
  value: unknown,
): value is SiteRequestDispatchContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<SiteRequestDispatchContext>;
  return (
    typeof row.request_id === "string" &&
    UUID_PATTERN.test(row.request_id) &&
    typeof row.party_id === "string" &&
    typeof row.project_id === "string" &&
    typeof row.designer_name === "string" &&
    typeof row.site_name === "string" &&
    typeof row.assignee_phone === "string" &&
    typeof row.due_at === "string"
  );
}

async function safeSend(
  deps: SiteRequestDispatchDeps,
  context: SiteRequestDispatchContext,
  input: { templateKey: string; body: string },
): Promise<DispatchSmsResult> {
  try {
    return await deps.sendSms(context, input);
  } catch {
    return { sent: false, reason: "sms_dispatch_error" };
  }
}

async function markWithRetry(
  deps: SiteRequestDispatchDeps,
  context: SiteRequestDispatchContext,
  providerMessageId?: string,
): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await deps.markDispatched(context, providerMessageId);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("mark_dispatched_failed");
}

export async function handleSiteRequestDispatch(
  req: Request,
  deps: SiteRequestDispatchDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!deps.callerRole(req)) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const action = typeof body.action === "string" &&
      SITE_REQUEST_DISPATCH_ACTIONS.includes(
        body.action as SiteRequestDispatchAction,
      )
    ? (body.action as SiteRequestDispatchAction)
    : null;
  const requestId = typeof body.request_id === "string" ? body.request_id : "";
  const note = typeof body.note === "string" ? body.note.trim() : undefined;
  const expiresAt = typeof body.expires_at === "string"
    ? body.expires_at
    : undefined;
  if (
    !action ||
    (action !== "lifecycle" &&
      action !== "due-reminder" &&
      !UUID_PATTERN.test(requestId)) ||
    (note && note.length > 500) ||
    (expiresAt && Number.isNaN(Date.parse(expiresAt)))
  ) {
    return json({ error: "invalid_request" }, 422);
  }
  if (
    ["consent-granted", "lifecycle", "due-reminder"].includes(action) &&
    deps.callerRole(req) !== "service_role"
  ) {
    return json({ error: "forbidden" }, 403);
  }

  try {
    if (action === "lifecycle") {
      const now =
        typeof body.now === "string" && !Number.isNaN(Date.parse(body.now))
          ? body.now
          : undefined;
      const lifecycle = await deps.processLifecycle(req, now);
      let sent = 0;
      let failed = 0;
      for (const reminder of lifecycle.due_reminders) {
        const result = await safeSend(deps, reminder, {
          templateKey: "site_request_due_reminder",
          body: dueReminderBody(reminder),
        });
        await deps
          .logNotification(reminder, "due-reminder", result)
          .catch(() => undefined);
        await deps.recordDispatch(reminder, "due-reminder", result);
        result.sent || result.deferred ? (sent += 1) : (failed += 1);
      }
      return json({
        ok: true,
        expiredCount: lifecycle.expired_count,
        dueRemindersSent: sent,
        dueRemindersFailed: failed,
      });
    }

    if (action === "due-reminder") {
      const reminder = body.reminder;
      if (!isDispatchContext(reminder)) {
        return json({ error: "invalid_request" }, 422);
      }
      const result = await safeSend(deps, reminder, {
        templateKey: "site_request_due_reminder",
        body: dueReminderBody(reminder),
      });
      await deps
        .logNotification(reminder, action, result)
        .catch(() => undefined);
      await deps.recordDispatch(reminder, action, result);
      return result.sent || result.deferred
        ? json({ ok: true, deferred: !!result.deferred })
        : json({ error: result.reason ?? "due_reminder_failed" }, 502);
    }

    const context = await deps.prepare(req, action, {
      requestId,
      note,
      expiresAt,
    });
    if (!context) return json({ error: "not_found" }, 404);

    if (context.needs_consent) {
      const result = await safeSend(deps, context, {
        templateKey: "sms_optin_invite",
        body:
          `${context.designer_name} would like to send you a Patina Site Request for ${context.site_name}. Reply YES to receive the private link. Reply STOP to opt out.`,
      });
      await deps
        .logNotification(context, action, result)
        .catch(() => undefined);
      if (!result.sent && !result.deferred) {
        return json({ error: result.reason ?? "consent_sms_failed" }, 502);
      }
      return json({
        ok: true,
        status: "awaiting_consent",
        deferred: !!result.deferred,
      });
    }

    // A repeated consent trigger after the active access was acknowledged is
    // intentionally a no-op. This prevents duplicate SMS on trigger retries.
    if (action === "consent-granted" && context.reused && !context.token) {
      return json({ ok: true, status: context.status, idempotent: true });
    }

    const templateKey = action === "nudge"
      ? "site_request_nudge"
      : action === "resend"
      ? "site_request_resend"
      : "site_request_send";
    let message = action === "nudge" ? nudgeBody(context, note) : "";
    if (action !== "nudge") {
      if (!context.token || !context.access_id) {
        return json({ error: "dispatch_token_missing" }, 409);
      }
      message = siteRequestBody(context, context.token).replace(
        "__SITE_REQUEST_LINK__",
        `${deps.clientPortalUrl.replace(/\/$/, "")}/field`,
      );
    }
    const result = await safeSend(deps, context, {
      templateKey,
      body: message,
    });
    await deps.logNotification(context, action, result).catch(() => undefined);
    if (!result.sent && !result.deferred) {
      return json({ error: result.reason ?? "sms_failed" }, 502);
    }

    let acknowledgement: Record<string, unknown> | undefined;
    if (context.token && context.access_id) {
      acknowledgement = await markWithRetry(
        deps,
        context,
        result.twilioSid ?? result.messageId,
      );
    }
    return json({
      ok: true,
      status: context.status,
      deferred: !!result.deferred,
      idempotent: acknowledgement?.idempotent === true,
    });
  } catch {
    return json({ error: "dispatch_failed" }, 409);
  }
}
