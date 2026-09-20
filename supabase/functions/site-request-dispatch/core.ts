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
] as const;
export type SiteRequestDispatchAction =
  (typeof SITE_REQUEST_DISPATCH_ACTIONS)[number];
export type SiteRequestPrepareAction = keyof typeof DISPATCH_RPC_BY_ACTION;

export interface SiteRequestDispatchContext {
  request_id: string;
  status: string;
  outbox_id: string | null;
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
  dispatch_note?: string | null;
  attempt_count?: number;
}

export interface DispatchSmsResult {
  sent: boolean;
  deferred?: boolean;
  reason?: string;
  messageId?: string;
  twilioSid?: string;
}

/** What this worker tells the outbox about one attempt. */
export interface DispatchCompletion {
  sent: boolean;
  providerMessageId?: string;
  error?: string;
  /**
   * The send was REFUSED by a gate, not dropped by a carrier. The outbox is
   * finished with this row: there is nothing for a later attempt to do.
   */
  terminal?: boolean;
}

/**
 * The `p_status` word site_request_complete_dispatch takes (00374:3033).
 * 'cancelled' is the terminal permanent-failure status the outbox already
 * carries (00374:308-309 CHECK, and what site_request_revoke_access /
 * site_request_close write); no new enum value is introduced here.
 */
export function dispatchCompletionStatus(
  result: { sent: boolean; terminal?: boolean },
): "sent" | "cancelled" | "retry" {
  return result.sent ? "sent" : result.terminal ? "cancelled" : "retry";
}

export interface DeliveryNotificationContext {
  outbox_id: string;
  request_id: string;
  user_id: string;
  notification_log_id: string;
  title: string;
  body: string;
  entity_type: string;
  entity_id: string;
  deliverable_count: number;
}

export interface SiteRequestDispatchDeps {
  callerRole(req: Request): string | null;
  prepare(
    req: Request,
    action: SiteRequestPrepareAction,
    input: { requestId: string; note?: string; expiresAt?: string },
  ): Promise<SiteRequestDispatchContext | null>;
  claimDispatch(outboxId: string): Promise<SiteRequestDispatchContext | null>;
  completeDispatch(
    outboxId: string,
    result: DispatchCompletion,
  ): Promise<Record<string, unknown>>;
  pendingDispatches(now?: string): Promise<string[]>;
  shouldDefer(): boolean;
  sendSms(
    context: SiteRequestDispatchContext,
    input: { templateKey: string; body: string; auditBody: string },
  ): Promise<DispatchSmsResult>;
  logNotification(
    context: SiteRequestDispatchContext,
    action: string,
    result: DispatchSmsResult,
  ): Promise<void>;
  processLifecycle(
    req: Request,
    now?: string,
  ): Promise<{ expired_count: number }>;
  pendingDeliveryNotifications(now?: string): Promise<string[]>;
  claimDeliveryNotification(
    id: string,
  ): Promise<DeliveryNotificationContext | null>;
  sendDeliveryNotification(
    context: DeliveryNotificationContext,
  ): Promise<{ sent: boolean; error?: string }>;
  completeDeliveryNotification(
    id: string,
    result: { sent: boolean; error?: string },
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

function contextUrl(deps: SiteRequestDispatchDeps, token: string): string {
  return `${deps.clientPortalUrl.replace(/\/$/, "")}/field/${
    encodeURIComponent(token)
  }`;
}

function siteRequestBody(
  deps: SiteRequestDispatchDeps,
  context: SiteRequestDispatchContext,
): string {
  const studio = context.studio_name ? ` at ${context.studio_name}` : "";
  const due = context.due_context ? ` (${context.due_context})` : "";
  return `${context.designer_name}${studio} needs ${context.item_count} site item${
    context.item_count === 1 ? "" : "s"
  } for ${context.site_name}${due}. Open your checklist: ${
    contextUrl(deps, context.token!)
  }`;
}

function auditBody(action: string): string {
  return action === "consent-invite"
    ? "Patina SMS consent invitation"
    : action === "nudge"
    ? "Patina Site Request nudge"
    : action === "due-reminder"
    ? "Patina Site Request due reminder"
    : "Patina Site Request private link [redacted]";
}

function nudgeBody(context: SiteRequestDispatchContext): string {
  const from = context.studio_name
    ? `${context.designer_name} at ${context.studio_name}`
    : context.designer_name;
  const note = context.dispatch_note?.trim();
  return note
    ? `${from}: ${note} Please reopen your Site Request link when you can.`
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

function consentBody(context: SiteRequestDispatchContext): string {
  return `${context.designer_name} would like to send you a Patina Site Request for ${context.site_name}. Reply YES to receive the private link. Reply STOP to opt out.`;
}

/**
 * REFUSALS — a gate in _shared/sms.ts said no. Nothing was rendered, nothing
 * was minted, nothing reached a carrier. Only the studio, the recipient, or an
 * operator can change any of these answers, so a retry re-asks the same gate
 * forever while the designer's request reads "queued". The outbox goes
 * terminal instead and the refusal is named.
 *
 * Every word is one sendPartySms actually returns (sms.ts `refused(...)`):
 *   · suppressed / opted_out / not_consented / consent_evidence_required /
 *     contact_rule_forbids_sms — GATE 1 STOP and the GATE 2 consent gates.
 *   · field_line_phase_off / campaign_not_approved — GATE 3 and GATE 3b, the
 *     Field Line phase and the A2P campaign flag (US-3 P24). A site-request
 *     assignee who also holds a client seat is a client-kind send.
 *   · prompts_paused / dead_end — GATE 4, a person to call, not a text.
 *   · no_phone_number / empty_body / not_invitable / selection_input_required /
 *     client_link_unavailable — the send has no recipient, no body, or no
 *     capability to carry.
 */
const REFUSAL_REASONS = new Set([
  "campaign_not_approved",
  "client_link_unavailable",
  "consent_evidence_required",
  "contact_rule_forbids_sms",
  "dead_end",
  "empty_body",
  "field_line_phase_off",
  "no_phone_number",
  "not_consented",
  "not_invitable",
  "opted_out",
  "prompts_paused",
  "selection_input_required",
  "suppressed",
]);

/**
 * Failures a later attempt can genuinely clear: quiet hours and a spent daily
 * budget (this outbox IS the caller-owned retry `deferToCaller` defers to), a
 * read or write that did not land, configuration that can be provisioned, and
 * a logical send another writer is already holding.
 */
const RETRYABLE_REASONS = new Set([
  "budget",
  "conversation_number_not_configured",
  "defer_failed",
  "duplicate_send_claim",
  "quiet_hours",
  "sid_unrecorded",
  "sms_dispatch_error",
  "sms_provider_error",
  "suppression_unreadable",
  "twilio_not_configured",
]);

interface DispatchFailure {
  reason: string;
  terminal: boolean;
}

/**
 * One word for why this attempt did not send, and whether anything is left to
 * try. Only words from the two sets above are ever echoed: a provider error is
 * free text that can carry the raw field-link token, so an unrecognized reason
 * collapses to the generic retryable word exactly as it always has.
 */
function classifyFailure(result: DispatchSmsResult): DispatchFailure {
  const reason = result.reason;
  if (result.deferred) {
    // Stored for the window, not refused: never terminal, whatever it says.
    return {
      reason: reason && RETRYABLE_REASONS.has(reason) ? reason : "quiet_hours",
      terminal: false,
    };
  }
  if (reason && REFUSAL_REASONS.has(reason)) return { reason, terminal: true };
  if (reason && RETRYABLE_REASONS.has(reason)) {
    return { reason, terminal: false };
  }
  return { reason: "sms_provider_error", terminal: false };
}

async function completeWithRetry(
  deps: SiteRequestDispatchDeps,
  outboxId: string,
  result: DispatchCompletion,
): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await deps.completeDispatch(outboxId, result);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("dispatch_completion_failed");
}

/** What one outbox row did: it went, it is waiting, or a gate refused it. */
interface DispatchOutcome {
  sent: boolean;
  queued: boolean;
  /** The refusal, when a gate said no and nothing is left to retry. */
  refused?: string;
}

async function dispatchClaimed(
  deps: SiteRequestDispatchDeps,
  context: SiteRequestDispatchContext,
): Promise<DispatchOutcome & { context: SiteRequestDispatchContext }> {
  const action = context.action;
  let body: string;
  let templateKey: string;
  if (action === "consent-invite") {
    body = consentBody(context);
    templateKey = "sms_optin_invite";
  } else if (action === "nudge") {
    body = nudgeBody(context);
    templateKey = "site_request_nudge";
  } else if (action === "due-reminder") {
    body = dueReminderBody(context);
    templateKey = "site_request_due_reminder";
  } else {
    if (!context.token || !context.access_id) {
      await completeWithRetry(deps, context.outbox_id!, {
        sent: false,
        error: "dispatch_token_missing",
      });
      return { sent: false, queued: true, context };
    }
    body = siteRequestBody(deps, context);
    templateKey = action === "resend"
      ? "site_request_resend"
      : "site_request_send";
  }

  let result: DispatchSmsResult;
  try {
    result = await deps.sendSms(context, {
      templateKey,
      body,
      auditBody: auditBody(action),
    });
  } catch {
    result = { sent: false, reason: "sms_dispatch_error" };
  }
  const failure = result.sent ? null : classifyFailure(result);
  const safeResult = failure ? { ...result, reason: failure.reason } : result;
  await deps.logNotification(context, action, safeResult).catch(() =>
    undefined
  );
  const completion = await completeWithRetry(deps, context.outbox_id!, {
    sent: result.sent,
    providerMessageId: result.twilioSid ?? result.messageId,
    error: failure?.reason,
    terminal: failure?.terminal,
  });
  const finalized = result.sent && completion.status === "sent";
  return failure?.terminal
    ? { sent: false, queued: false, refused: failure.reason, context }
    : { sent: finalized, queued: !finalized, context };
}

async function processOutbox(
  deps: SiteRequestDispatchDeps,
  outboxId: string,
): Promise<DispatchOutcome & { context?: SiteRequestDispatchContext }> {
  const claimed = await deps.claimDispatch(outboxId);
  if (!claimed) return { sent: false, queued: true };
  return dispatchClaimed(deps, claimed);
}

async function sweep(
  deps: SiteRequestDispatchDeps,
  now?: string,
): Promise<
  {
    sent: number;
    queued: number;
    refused: number;
    pushSent: number;
    pushQueued: number;
  }
> {
  let sent = 0;
  let queued = 0;
  let refused = 0;
  if (!deps.shouldDefer()) {
    for (const id of await deps.pendingDispatches(now)) {
      const result = await processOutbox(deps, id);
      if (result.sent) sent += 1;
      else if (result.refused) refused += 1;
      else queued += 1;
    }
  }

  let pushSent = 0;
  let pushQueued = 0;
  for (const id of await deps.pendingDeliveryNotifications(now)) {
    const claimed = await deps.claimDeliveryNotification(id);
    if (!claimed) continue;
    let result: { sent: boolean; error?: string };
    try {
      result = await deps.sendDeliveryNotification(claimed);
    } catch {
      result = { sent: false, error: "apns_dispatch_error" };
    }
    await deps.completeDeliveryNotification(id, result);
    result.sent ? pushSent += 1 : pushQueued += 1;
  }
  return { sent, queued, refused, pushSent, pushQueued };
}

export async function handleSiteRequestDispatch(
  req: Request,
  deps: SiteRequestDispatchDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const role = deps.callerRole(req);
  if (!role) return json({ error: "unauthorized" }, 401);

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
    ? body.action as SiteRequestDispatchAction
    : null;
  const requestId = typeof body.request_id === "string" ? body.request_id : "";
  const note = typeof body.note === "string" ? body.note.trim() : undefined;
  const expiresAt = typeof body.expires_at === "string"
    ? body.expires_at
    : undefined;
  if (
    !action ||
    (action !== "lifecycle" && !UUID_PATTERN.test(requestId)) ||
    (note && note.length > 500) ||
    (expiresAt && Number.isNaN(Date.parse(expiresAt)))
  ) return json({ error: "invalid_request" }, 422);
  if (
    ["consent-granted", "lifecycle"].includes(action) && role !== "service_role"
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
      const processed = await sweep(deps, now);
      return json({
        ok: true,
        expiredCount: lifecycle.expired_count,
        dispatchesSent: processed.sent,
        dispatchesQueued: processed.queued,
        dispatchesRefused: processed.refused,
        deliveryNotificationsSent: processed.pushSent,
        deliveryNotificationsQueued: processed.pushQueued,
      });
    }

    const prepared = await deps.prepare(req, action, {
      requestId,
      note,
      expiresAt,
    });
    if (!prepared) return json({ error: "not_found" }, 404);
    if (!prepared.outbox_id) {
      return json({ ok: true, status: prepared.status, idempotent: true });
    }
    if (deps.shouldDefer()) {
      return json({ ok: true, status: prepared.status, queued: true }, 202);
    }
    const result = await processOutbox(deps, prepared.outbox_id);
    if (result.refused) {
      // A gate refused this text. It is not queued, nothing will retry it, and
      // the designer is told which gate said no rather than being left to read
      // a policy decision as a flaky carrier.
      return json({
        ok: false,
        error: "send_refused",
        reason: result.refused,
        status: prepared.status,
      }, 409);
    }
    const finalStatus = result.context?.action === "consent-invite"
      ? "awaiting_consent"
      : ["send", "resend", "consent-granted"].includes(
          result.context?.action ?? "",
        )
      ? "sent"
      : result.context?.status ?? prepared.status;
    return result.sent
      ? json({ ok: true, status: finalStatus })
      : json({ ok: true, status: prepared.status, queued: true }, 202);
  } catch {
    return json({ error: "dispatch_failed" }, 409);
  }
}
