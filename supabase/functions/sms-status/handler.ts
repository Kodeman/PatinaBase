// sms-status/handler.ts — the request-handling core of the Twilio delivery
// status-callback webhook (the signature-verified core of sms-status). Split
// out of index.ts, mirroring sms-inbound's index.ts/pipeline.ts split, so it
// imports without starting a server and unit-tests with an injected supabase
// (_tests/fake-supabase.ts) instead of a live stack.
//
//   (a) verify X-Twilio-Signature over SMS_STATUS_CALLBACK_URL + sorted params
//   (b) MessageSid + a MessageStatus in the known allowlist, else 400
//   (c) update the matching sms_messages row: twilio_status only on forward transitions; error_code
//       / error_message only when Twilio's callback included them — an absent
//       param must never null out a previously recorded error.
//   (d) settle an SMS notification_log row (matched by provider_id =
//       MessageSid, channel = sms) from its acceptance-time 'sending' to
//       'delivered'/'failed' — only sms-dispatch and site-request-dispatch
//       write that link. sms-dispatch user sends have no sms_messages row;
//       other channels (email/APNs/Stripe) are untouched.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTwilioSignature } from "../_shared/twilio-verify.ts";

const KNOWN_STATUSES = new Set([
  "accepted",
  "scheduled",
  "canceled",
  "queued",
  "sending",
  "sent",
  "failed",
  "delivered",
  "undelivered",
  "receiving",
  "received",
  "read",
]);

// Match sms.ts's conditional settlement: the database tests the current status
// in the UPDATE, including after waiting for a concurrent callback's row lock.
// Outbound progress permits skipped stages; failure/cancellation can follow sent
// but not delivered/read. Terminal outcomes are first-writer-wins. Duplicates
// may supply missing provider error details but never clear absent ones.
const OUTBOUND_PROGRESS = [
  "claimed",
  "accepted",
  "scheduled",
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
];
function receiptPredecessors(status: string): string[] {
  const position = OUTBOUND_PROGRESS.indexOf(status);
  if (position >= 0) return OUTBOUND_PROGRESS.slice(0, position + 1);
  if (["failed", "undelivered", "canceled"].includes(status)) {
    return [
      ...OUTBOUND_PROGRESS.slice(0, OUTBOUND_PROGRESS.indexOf("delivered")),
      status,
    ];
  }
  if (status === "received") return ["receiving", "received"];
  return [status]; // receiving; known-status validation runs before this lookup.
}
// No local-terminal exception: suppressed/expired/dry_run never advance, nor
// does failed revive. SID-less abandoned claims cannot match a provider receipt;
// a SID-bearing failed selection is a closed question, not a pending send.

export interface StatusCallbackDeps {
  supabase: SupabaseClient;
  /** Injectable env reader (defaults to Deno.env.get). */
  getEnv?: (key: string) => string | undefined;
}

function parseForm(raw: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) params[key] = value;
  return params;
}

function response(status: number): Response {
  return new Response(null, { status });
}

export async function handleStatusCallback(
  req: Request,
  deps: StatusCallbackDeps,
): Promise<Response> {
  if (req.method !== "POST") return response(405);

  const getEnv = deps.getEnv ?? ((k: string) => Deno.env.get(k));
  const raw = await req.text();
  const params = parseForm(raw);
  const authToken = getEnv("TWILIO_AUTH_TOKEN");
  const publicUrl = getEnv("SMS_STATUS_CALLBACK_URL") ?? "";
  const signature = req.headers.get("X-Twilio-Signature");
  const verified = await verifyTwilioSignature(
    authToken,
    publicUrl,
    params,
    signature,
  );
  if (!verified) return response(403);

  const messageSid = params.MessageSid?.trim();
  const messageStatus = params.MessageStatus?.trim().toLowerCase();
  if (!messageSid || !messageStatus || !KNOWN_STATUSES.has(messageStatus)) {
    return response(400);
  }

  const update: Record<string, unknown> = { twilio_status: messageStatus };
  // Only set when the callback included them AND they're non-empty — an
  // absent (or blank) param must not overwrite a previously recorded error.
  if (params.ErrorCode !== undefined && params.ErrorCode !== "") {
    update.error_code = params.ErrorCode;
  }
  if (params.ErrorMessage !== undefined && params.ErrorMessage !== "") {
    update.error_message = params.ErrorMessage;
  }

  try {
    const { data: updated, error } = await deps.supabase
      .from("sms_messages")
      .update(update)
      .eq("twilio_sid", messageSid)
      .in("twilio_status", receiptPredecessors(messageStatus))
      .select("id");
    if (error) throw error;

    // Keep notification_log's existing vocabulary: sent is still sending;
    // only delivered and failed/undelivered settle it. Never record "read".
    const notifStatus = messageStatus === "delivered"
      ? "delivered"
      : (messageStatus === "failed" || messageStatus === "undelivered")
      ? "failed"
      : null;
    if (!notifStatus) return response(204);

    if (!updated?.length) {
      // UPDATE 0 can mean a stale receipt, not an absent message. Prove which
      // representation owns this SID before touching a notification-only send.
      const { data: existing, error: readError } = await deps.supabase
        .from("sms_messages")
        .select("id")
        .eq("twilio_sid", messageSid)
        .maybeSingle();
      if (readError) throw readError;
      if (existing) return response(204);
    }

    // Either the message accepted this receipt, or a successful lookup proved
    // notification-only storage. Atomically settle sending only: duplicates,
    // competing terminal outcomes and stale errors cannot rewrite the result.
    const notifUpdate: Record<string, unknown> = { status: notifStatus };
    if (notifStatus === "delivered") {
      notifUpdate.sent_at = new Date().toISOString();
    }
    if (update.error_message !== undefined) {
      notifUpdate.error = update.error_message;
    }
    const { error: notifError } = await deps.supabase
      .from("notification_log")
      .update(notifUpdate)
      .eq("provider_id", messageSid)
      .eq("channel", "sms")
      .eq("status", "sending");
    if (notifError) throw notifError;
  } catch (error) {
    // A failed message read/write is never evidence for the notification-only
    // branch. A failed notification settlement can also retry safely.
    console.error("sms-status persistence failed", {
      messageSid,
      messageStatus,
      error: (error as { message?: string }).message,
    });
    return response(500);
  }

  return response(204);
}
