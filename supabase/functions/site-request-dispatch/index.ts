// Authenticated Site Request SMS orchestration boundary. Designer send,
// resend, and nudge calls retain the caller JWT for authorization inside the
// RPC. The consent-granted trigger is service-role only. Admin access begins
// only after the gateway-verified caller/action has been checked.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isQuietHours, sendPartySms } from "../_shared/sms.ts";
import {
  type DeliveryNotificationContext,
  DISPATCH_RPC_BY_ACTION,
  handleSiteRequestDispatch,
  type SiteRequestDispatchContext,
  type SiteRequestDispatchDeps,
  type SiteRequestPrepareAction,
} from "./core.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_PORTAL_URL = Deno.env.get("CLIENT_PORTAL_URL") ??
  "https://client.patina.cloud";

function bearer(req: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "");
  return match?.[1] ?? null;
}

function jwtRole(req: Request): string | null {
  const token = bearer(req);
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    const normalized = part
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(part.length / 4) * 4, "=");
    const payload = JSON.parse(atob(normalized)) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function prepare(
  req: Request,
  action: SiteRequestPrepareAction,
  input: { requestId: string; note?: string; expiresAt?: string },
): Promise<SiteRequestDispatchContext | null> {
  const isServiceAction = action === "consent-granted";
  const client = isServiceAction
    ? admin()
    : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: req.headers.get("Authorization")! },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const args = action === "nudge"
    ? { p_request_id: input.requestId, p_note: input.note ?? null }
    : {
      p_request_id: input.requestId,
      p_expires_at: input.expiresAt ?? null,
    };
  const { data, error } = await client.rpc(
    DISPATCH_RPC_BY_ACTION[action],
    args,
  );
  if (error) throw new Error("prepare_dispatch_failed");
  return (
    Array.isArray(data) ? data[0] : data
  ) as SiteRequestDispatchContext | null;
}

const deps: SiteRequestDispatchDeps = {
  callerRole: jwtRole,
  prepare,
  clientPortalUrl: CLIENT_PORTAL_URL,
  shouldDefer: () =>
    isQuietHours(
      new Date(),
      Deno.env.get("FIELD_TZ") ?? "America/Chicago",
    ),
  claimDispatch: async (outboxId) => {
    const client = admin();
    const { data: accepted } = await client
      .from("sms_messages")
      .select("id, twilio_sid")
      .eq("site_request_dispatch_outbox_id", outboxId)
      .in("twilio_status", [
        "queued",
        "accepted",
        "sent",
        "delivered",
        "dry_run",
      ])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (accepted) {
      const { error: reconcileError } = await client.rpc(
        "site_request_complete_dispatch",
        {
          p_outbox_id: outboxId,
          p_status: "sent",
          p_provider_message_id: accepted.twilio_sid ?? accepted.id,
          p_error: null,
          p_now: new Date().toISOString(),
        },
      );
      if (reconcileError) throw new Error("reconcile_dispatch_failed");
      return null;
    }
    const { data, error } = await admin().rpc("site_request_claim_dispatch", {
      p_outbox_id: outboxId,
      p_now: new Date().toISOString(),
    });
    if (error) throw new Error("claim_dispatch_failed");
    return (Array.isArray(data) ? data[0] : data) as
      | SiteRequestDispatchContext
      | null;
  },
  completeDispatch: async (outboxId, result) => {
    const { data, error } = await admin().rpc(
      "site_request_complete_dispatch",
      {
        p_outbox_id: outboxId,
        p_status: result.sent ? "sent" : "retry",
        p_provider_message_id: result.providerMessageId ?? null,
        p_error: result.error ?? null,
        p_now: new Date().toISOString(),
      },
    );
    if (error) throw new Error("complete_dispatch_failed");
    return (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  },
  pendingDispatches: async (now) => {
    const { data, error } = await admin().rpc(
      "site_request_pending_dispatches",
      {
        p_now: now ?? new Date().toISOString(),
        p_limit: 25,
      },
    );
    if (error) throw new Error("pending_dispatches_failed");
    return (data ?? []) as string[];
  },
  sendSms: async (context, input) =>
    sendPartySms(admin(), {
      projectId: context.project_id,
      partyId: context.party_id,
      phone: context.assignee_phone,
      templateKey: input.templateKey,
      body: input.body,
      auditBody: input.auditBody,
      deferToCaller: true,
      siteRequestDispatchOutboxId: context.outbox_id ?? undefined,
    }),
  logNotification: async (context, action, result) => {
    // notification_log.user_id is NOT NULL. Reuse it when the party is tied to
    // an account; anonymous pros remain fully represented by sms_messages and
    // the append-only site_request_events written by the lifecycle RPCs.
    const client = admin();
    const { data: party } = await client
      .from("project_parties")
      .select("user_id")
      .eq("id", context.party_id)
      .maybeSingle();
    if (!party?.user_id) return;
    // result.sent means Twilio ACCEPTED the send — not proof of delivery.
    // 'sending' (with provider_id = the Twilio sid) links this row for
    // sms-status to flip to 'delivered'/'failed' when the real callback
    // arrives; a send that never reached Twilio stays 'queued'.
    await client.from("notification_log").insert({
      user_id: party.user_id,
      type: `site_request_${action.replaceAll("-", "_")}`,
      channel: "sms",
      status: result.sent ? "sending" : "queued",
      provider_id: result.twilioSid ?? null,
      metadata: {
        request_id: context.request_id,
        project_id: context.project_id,
        party_id: context.party_id,
        reason: result.reason ?? null,
      },
    });
  },
  processLifecycle: async (_req, now) => {
    const { data, error } = await admin().rpc(
      "site_request_process_lifecycle",
      { p_now: now ?? new Date().toISOString() },
    );
    if (error) throw new Error("process_lifecycle_failed");
    const result = (Array.isArray(data) ? data[0] : data) as {
      expired_count?: number;
    } | null;
    return {
      expired_count: result?.expired_count ?? 0,
    };
  },
  pendingDeliveryNotifications: async (now) => {
    const { data, error } = await admin().rpc(
      "site_request_pending_delivery_notifications",
      { p_now: now ?? new Date().toISOString(), p_limit: 25 },
    );
    if (error) throw new Error("pending_delivery_notifications_failed");
    return (data ?? []) as string[];
  },
  claimDeliveryNotification: async (id) => {
    const { data, error } = await admin().rpc(
      "site_request_claim_delivery_notification",
      { p_outbox_id: id, p_now: new Date().toISOString() },
    );
    if (error) throw new Error("claim_delivery_notification_failed");
    return (Array.isArray(data) ? data[0] : data) as
      | DeliveryNotificationContext
      | null;
  },
  sendDeliveryNotification: async (context) => {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/apns-send`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: context.user_id,
        title: context.title,
        body: context.body,
        entity_type: context.entity_type,
        entity_id: context.entity_id,
        notification_log_id: context.notification_log_id,
      }),
    });
    const payload = await response.json().catch(() => ({})) as {
      sent?: number;
      skipped?: string;
      error?: string;
    };
    if (!response.ok || !(payload.sent && payload.sent > 0)) {
      return {
        sent: false,
        error: payload.skipped ?? payload.error ??
          `apns_http_${response.status}`,
      };
    }
    return { sent: true };
  },
  completeDeliveryNotification: async (id, result) => {
    const { error } = await admin().rpc(
      "site_request_complete_delivery_notification",
      {
        p_outbox_id: id,
        p_sent: result.sent,
        p_error: result.error ?? null,
        p_now: new Date().toISOString(),
      },
    );
    if (error) throw new Error("complete_delivery_notification_failed");
  },
};

Deno.serve((req) => handleSiteRequestDispatch(req, deps));
