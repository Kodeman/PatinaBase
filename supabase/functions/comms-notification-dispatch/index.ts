// Comms Notification Dispatch — Edge Function
// Spec: docs/prds/in-app-messaging-prd.md §11
//
// Triggered by an INSERT on public.comms_messages (via the trigger added in
// migration 00105_comms_notification_trigger.sql). For each non-sender
// participant the function evaluates the eligibility rules from §11:
//
//   1. Recipient is a participant on the message's thread, with left_at IS NULL.
//   2. Recipient is NOT the sender.
//   3. muted_at IS NULL.
//   4. notification_pref:
//        'all'      → eligible
//        'mentions' → eligible only if profile_id ∈ message.mentions
//        'none'     → ineligible
//   5. last_read_at older than 5 minutes (recipient hasn't been live in the
//      thread; debounce window).
//   6. No notification sent for (recipient, thread) in the last 5 minutes
//      (coalescing window — multiple rapid messages produce one email).
//
// Eligible recipients receive a 'in_app_message' (or 'in_app_message_mention')
// notify() job enqueued via the existing notification_queue table.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  signCommsMuteToken,
  buildMuteUrl,
} from "../_shared/comms-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const COALESCE_WINDOW_MS = 5 * 60 * 1000;
const READ_DEBOUNCE_MS = 5 * 60 * 1000;

interface DispatchPayload {
  message_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "missing service-role env" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let payload: DispatchPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid json body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!payload?.message_id) {
    return new Response(
      JSON.stringify({ error: "message_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ─── 1. Load the message ────────────────────────────────────────────────
  const { data: msg, error: msgErr } = await supabase
    .from("comms_messages")
    .select(
      "id, thread_id, sender_id, body, mentions, system, deleted_at, created_at",
    )
    .eq("id", payload.message_id)
    .maybeSingle();
  if (msgErr) {
    return new Response(
      JSON.stringify({ error: msgErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!msg) {
    return new Response(
      JSON.stringify({ skipped: "message not found" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (msg.system || msg.deleted_at) {
    return new Response(
      JSON.stringify({ skipped: "system or deleted message" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ─── 2. Load thread + sender info ───────────────────────────────────────
  const [threadResp, senderResp] = await Promise.all([
    supabase
      .from("comms_threads")
      .select("id, kind, project_id, title")
      .eq("id", msg.thread_id)
      .maybeSingle(),
    msg.sender_id
      ? supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .eq("id", msg.sender_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (threadResp.error || !threadResp.data) {
    return new Response(
      JSON.stringify({ error: "thread not found" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const thread = threadResp.data;
  const sender = senderResp.data;

  // ─── 3. Load all eligible participants ──────────────────────────────────
  const { data: participants, error: partErr } = await supabase
    .from("comms_thread_participants")
    .select("profile_id, role, last_read_at, muted_at, notification_pref, left_at")
    .eq("thread_id", msg.thread_id);
  if (partErr || !participants) {
    return new Response(
      JSON.stringify({ error: "could not load participants" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const mentionSet = new Set<string>(msg.mentions ?? []);
  const messageCreatedAt = new Date(msg.created_at).getTime();
  const debounceCutoff = new Date(messageCreatedAt - READ_DEBOUNCE_MS).toISOString();

  const eligible = participants
    .filter((p) => {
      if (p.left_at) return false;
      if (p.profile_id === msg.sender_id) return false;
      if (p.muted_at) return false;
      if (p.notification_pref === "none") return false;
      if (
        p.notification_pref === "mentions" &&
        !mentionSet.has(p.profile_id)
      ) {
        return false;
      }
      // Recipient was active in the thread within the last 5 minutes — skip.
      if (p.last_read_at && p.last_read_at > debounceCutoff) {
        return false;
      }
      return true;
    });

  if (eligible.length === 0) {
    return new Response(
      JSON.stringify({ dispatched: 0, reason: "no eligible recipients" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ─── 4. Apply coalescing window: skip recipients who got a comms
  //       notification for this thread within the last 5 minutes ──────────
  const coalesceCutoff = new Date(
    messageCreatedAt - COALESCE_WINDOW_MS,
  ).toISOString();

  const { data: recentLogs } = await supabase
    .from("notification_log")
    .select("user_id, type, created_at, metadata")
    .in("user_id", eligible.map((p) => p.profile_id))
    .in("type", ["in_app_message", "in_app_message_mention"])
    .gte("created_at", coalesceCutoff);

  const coalescedKeys = new Set<string>();
  for (const log of recentLogs ?? []) {
    const tid = (log.metadata as Record<string, unknown> | null)?.thread_id;
    if (typeof tid === "string") {
      coalescedKeys.add(`${log.user_id}::${tid}`);
    }
  }

  const finalRecipients = eligible.filter(
    (p) => !coalescedKeys.has(`${p.profile_id}::${msg.thread_id}`),
  );

  // ─── 5. Build per-role absolute deep links. Designer & admin go to the
  //       designer portal; client & vendor go to the client portal. Hosts
  //       can be overridden via env for self-hosted / staging. ────────────
  const designerHost = Deno.env.get("DESIGNER_PORTAL_URL") || "https://app.patina.cloud";
  const clientHost = Deno.env.get("CLIENT_PORTAL_URL") || "https://client.patina.cloud";
  const deepLinkFor = (role: string): string => {
    if (role === "designer" || role === "admin") {
      return `${designerHost}/portal/messages/${msg.thread_id}`;
    }
    return `${clientHost}/messages/${msg.thread_id}`;
  };

  // ─── 6. Enqueue notify() jobs ──────────────────────────────────────────
  const previewBody = msg.body.length > 200
    ? msg.body.slice(0, 197) + "…"
    : msg.body;

  // Pre-compute HTML fragments the email template uses verbatim. Doing this
  // edge-side means the email_templates row can be a pure {{var}} document
  // instead of needing a richer template engine with conditionals.
  const escapeHtml = (s: string): string =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const jobs = await Promise.all(
    finalRecipients.map(async (p) => {
      const isMention = mentionSet.has(p.profile_id);
      // Per-recipient signed mute token. Single-purpose, 365-day expiry. The
      // signed payload binds the mute action to (thread_id, profile_id), so
      // even if the email is forwarded the recipient cannot mute someone
      // else's threads or unrelated conversations.
      let muteThreadUrl: string | null = null;
      try {
        const muteToken = await signCommsMuteToken({
          threadId: msg.thread_id,
          profileId: p.profile_id,
        });
        muteThreadUrl = buildMuteUrl(muteToken);
      } catch (err) {
        console.warn("[comms-dispatch] failed to sign mute token", err);
      }
      const senderName = sender?.full_name ?? "Someone";
      const senderInitial = (senderName[0] ?? "?").toUpperCase();
      const senderAvatarUrl = sender?.avatar_url ?? null;
      const deepLink = deepLinkFor(p.role);

      // Display strings the DB-backed email template interpolates verbatim.
      const headline = isMention
        ? `${escapeHtml(senderName)} mentioned you`
        : `${escapeHtml(senderName)} sent you a message`;

      const contextSubtitle = (() => {
        if (thread.kind === "project" && thread.title) {
          return `In your project: ${escapeHtml(thread.title)}`;
        }
        if (thread.kind === "vendor_brief") {
          return thread.title
            ? `Vendor brief — ${escapeHtml(thread.title)}`
            : "Vendor brief";
        }
        return thread.title ? escapeHtml(thread.title) : "Direct message";
      })();

      const ctaLabel = isMention ? "See the mention" : "Open conversation";

      const avatarHtml = senderAvatarUrl
        ? `<img src="${escapeHtml(senderAvatarUrl)}" alt="${escapeHtml(senderName)}" width="36" height="36" style="border-radius:50%;display:block;" />`
        : `<div style="width:36px;height:36px;border-radius:50%;background:#B08A46;color:#FFFFFF;font-size:15px;font-weight:600;line-height:36px;text-align:center;">${escapeHtml(senderInitial)}</div>`;

      const muteFooterHtml = muteThreadUrl
        ? `<p style="color:#8C8578;font-family:'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;margin:0;text-align:center;">Too much? <a href="${escapeHtml(muteThreadUrl)}" style="color:#4E7A66;text-decoration:underline;">Mute this conversation</a> and we'll stop emailing about it.</p>`
        : "";

      return {
        user_id: p.profile_id,
        type: isMention ? "in_app_message_mention" : "in_app_message",
        channel: "email" as const,
        template_id: isMention ? "in-app-message-mention" : "in-app-message",
        priority: isMention ? ("high" as const) : ("normal" as const),
        // camelCase keys: matched to React Email props AND to the DB-backed
        // {{var}} interpolation slots. Pre-computed display fragments
        // (headline, contextSubtitle, avatarHtml, muteFooterHtml) make the
        // DB template a pure variable substitution.
        data: {
          senderName,
          senderAvatarUrl,
          previewBody,
          threadKind: thread.kind,
          projectTitle: thread.project_id ? thread.title ?? null : null,
          threadTitle: thread.title,
          isMention,
          deepLink,
          muteThreadUrl,
          // pre-computed for the DB template
          headline,
          contextSubtitle,
          ctaLabel,
          avatarHtml,
          muteFooterHtml,
          // metadata (logged in notification_log; unused by template)
          thread_id: msg.thread_id,
          message_id: msg.id,
          sender_id: msg.sender_id,
          // Project of a project-scoped thread → lets notification-dispatch
          // resolve the studio brand for the co-brand byline (Designer
          // Studios). Null for direct/vendor threads → plain Patina shell.
          project_id: thread.project_id ?? null,
        },
      };
    }),
  );

  // Dispatch each job via the existing notification-dispatch edge function so
  // we inherit retry, suppression, and template-rendering behavior.
  const dispatchUrl = `${supabaseUrl}/functions/v1/notification-dispatch`;
  const dispatched: Array<{ user_id: string; ok: boolean; error?: string }> = [];

  await Promise.all(
    jobs.map(async (job) => {
      try {
        const resp = await fetch(dispatchUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(job),
        });
        dispatched.push({
          user_id: job.user_id,
          ok: resp.ok,
          ...(resp.ok ? {} : { error: `dispatch returned ${resp.status}` }),
        });
      } catch (err) {
        dispatched.push({
          user_id: job.user_id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  return new Response(
    JSON.stringify({
      dispatched: dispatched.filter((d) => d.ok).length,
      failed: dispatched.filter((d) => !d.ok).length,
      total_eligible: eligible.length,
      coalesced: eligible.length - finalRecipients.length,
      details: dispatched,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
