// Authenticated Site Request SMS orchestration boundary. Designer send,
// resend, and nudge calls retain the caller JWT for authorization inside the
// RPC. The consent-granted trigger is service-role only. Admin access begins
// only after the gateway-verified caller/action has been checked.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPartySms } from "../_shared/sms.ts";
import {
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
  sendSms: async (context, input) =>
    sendPartySms(admin(), {
      projectId: context.project_id,
      partyId: context.party_id,
      phone: context.assignee_phone,
      templateKey: input.templateKey,
      body: input.body,
    }),
  markDispatched: async (context, providerMessageId) => {
    const { data, error } = await admin().rpc("site_request_mark_dispatched", {
      p_request_id: context.request_id,
      p_access_id: context.access_id,
      p_provider_message_id: providerMessageId ?? null,
      p_dispatched_at: new Date().toISOString(),
    });
    if (error) throw new Error("mark_dispatched_failed");
    return (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  },
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
    await client.from("notification_log").insert({
      user_id: party.user_id,
      type: `site_request_${action.replace("-", "_")}`,
      channel: "sms",
      status: result.sent ? "delivered" : result.deferred ? "queued" : "failed",
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
      due_reminders?: SiteRequestDispatchContext[];
    } | null;
    return {
      expired_count: result?.expired_count ?? 0,
      due_reminders: result?.due_reminders ?? [],
    };
  },
  recordDispatch: async (context, action, result) => {
    const { error } = await admin().rpc("site_request_record_dispatch", {
      p_request_id: context.request_id,
      p_action: action,
      p_provider_message_id: result.twilioSid ?? result.messageId ?? null,
      p_status: result.sent || result.deferred
        ? result.deferred ? "deferred" : "sent"
        : "failed",
      p_error: result.reason ?? null,
    });
    if (error) throw new Error("record_dispatch_failed");
  },
};

Deno.serve((req) => handleSiteRequestDispatch(req, deps));
